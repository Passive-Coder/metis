import hashlib
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from .clustering import cluster_problem_embeddings
from .code_features import extract_python_code_features
from .db import get_connection
from .encoders import combine_embeddings, encode_problem_statement, encode_solution_code
from .recommender import ensure_user, recommend
from .spaced_repetition import ReviewState, sm2_update
from .topic_graph import seed_static_topic_graph, sync_topic_graph_to_neo4j

app = FastAPI(title="Metis ML Recommender", version="0.1.0")


class TestCasePayload(BaseModel):
    name: str
    args: list[Any]
    expected: Any
    hidden: bool = True


class ProblemPayload(BaseModel):
    external_id: str | None = None
    slug: str
    title: str
    difficulty: str
    statement: str
    input_contract: str
    output_contract: str
    constraints: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_name: str = "authorized_seed"
    source_url: str | None = None
    source_license: str = "original_or_authorized"
    test_cases: list[TestCasePayload] = Field(default_factory=list, max_length=100)
    python_solution: str


class IngestPayload(BaseModel):
    problems: list[ProblemPayload]


class ReviewPayload(BaseModel):
    user_id: str
    problem_id: str
    quality: int = Field(ge=0, le=5)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/topics/seed")
def seed_topics() -> dict[str, int]:
    return {"edges": seed_static_topic_graph()}


@app.post("/graph/sync-neo4j")
def sync_neo4j() -> dict[str, int]:
    return {"edges": sync_topic_graph_to_neo4j()}


@app.post("/ingest/authorized")
def ingest_authorized(payload: IngestPayload) -> dict[str, int]:
    inserted = 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for problem in payload.problems:
                statement_hash = sha256_text(
                    "\n".join(
                        [
                            problem.slug,
                            problem.title,
                            problem.statement,
                            problem.python_solution,
                        ]
                    )
                )
                cursor.execute(
                    """
                    INSERT INTO problems (
                        external_id,
                        slug,
                        title,
                        difficulty,
                        statement,
                        input_contract,
                        output_contract,
                        constraints,
                        metadata,
                        source_name,
                        source_url,
                        source_license,
                        statement_hash
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s)
                    ON CONFLICT (statement_hash) DO UPDATE
                    SET title = EXCLUDED.title,
                        difficulty = EXCLUDED.difficulty,
                        statement = EXCLUDED.statement,
                        input_contract = EXCLUDED.input_contract,
                        output_contract = EXCLUDED.output_contract,
                        constraints = EXCLUDED.constraints,
                        metadata = EXCLUDED.metadata,
                        updated_at = now()
                    RETURNING id::text
                    """,
                    (
                        problem.external_id,
                        problem.slug,
                        problem.title,
                        problem.difficulty,
                        problem.statement,
                        problem.input_contract,
                        problem.output_contract,
                        Jsonb(problem.constraints),
                        Jsonb(problem.metadata),
                        problem.source_name,
                        problem.source_url,
                        problem.source_license,
                        statement_hash,
                    ),
                )
                problem_id = cursor.fetchone()["id"]
                cursor.execute("DELETE FROM problem_test_cases WHERE problem_id = %s", (problem_id,))
                for index, test_case in enumerate(problem.test_cases[:100], start=1):
                    cursor.execute(
                        """
                        INSERT INTO problem_test_cases (
                            problem_id,
                            ordinal,
                            name,
                            args,
                            expected,
                            is_hidden
                        )
                        VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s)
                        """,
                        (
                            problem_id,
                            index,
                            test_case.name,
                            Jsonb(test_case.args),
                            Jsonb(test_case.expected),
                            test_case.hidden,
                        ),
                    )

                cursor.execute(
                    """
                    INSERT INTO problem_solutions (problem_id, language, code, code_hash)
                    VALUES (%s, 'python', %s, %s)
                    ON CONFLICT (problem_id, language, code_hash) DO NOTHING
                    """,
                    (problem_id, problem.python_solution, sha256_text(problem.python_solution)),
                )
                inserted += 1

    recompute_embeddings()
    return {"problems": inserted}


@app.post("/embeddings/recompute")
def recompute_embeddings() -> dict[str, int]:
    updated = 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT problem.id::text AS problem_id,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       problem.statement,
                       problem.input_contract,
                       problem.output_contract,
                       problem.constraints,
                       problem.metadata,
                       solution.code
                FROM problems problem
                JOIN problem_solutions solution ON solution.problem_id = problem.id
                WHERE solution.language = 'python' AND solution.is_reference = true
                """
            )
            rows = cursor.fetchall()

            for row in rows:
                statement_embedding = encode_problem_statement(row)
                code_embedding = encode_solution_code(row["code"])
                combined_embedding = combine_embeddings(statement_embedding, code_embedding)
                code_features = extract_python_code_features(row["code"]).to_dict()
                cursor.execute(
                    """
                    INSERT INTO problem_embeddings (
                        problem_id,
                        statement_embedding,
                        code_embedding,
                        combined_embedding,
                        encoder_metadata,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, now())
                    ON CONFLICT (problem_id) DO UPDATE
                    SET statement_embedding = EXCLUDED.statement_embedding,
                        code_embedding = EXCLUDED.code_embedding,
                        combined_embedding = EXCLUDED.combined_embedding,
                        encoder_metadata = EXCLUDED.encoder_metadata,
                        updated_at = now()
                    """,
                    (
                        row["problem_id"],
                        statement_embedding,
                        code_embedding,
                        combined_embedding,
                        Jsonb({
                            "ast": code_features,
                            "code_dimensions": len(code_embedding),
                            "code_model": "microsoft/codebert-base",
                            "combined_dimensions": len(combined_embedding),
                            "statement_dimensions": len(statement_embedding),
                            "statement_model": "sentence-transformers/all-MiniLM-L6-v2",
                        }),
                    ),
                )
                updated += 1

    return {"embeddings": updated}


@app.post("/clusters/recompute")
def recompute_clusters(min_cluster_size: int = Query(default=5, ge=2, le=50)) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT problem_id::text AS problem_id, combined_embedding
                FROM problem_embeddings
                ORDER BY problem_id
                """
            )
            rows = cursor.fetchall()
            result = cluster_problem_embeddings(
                [row["combined_embedding"] for row in rows],
                min_cluster_size=min_cluster_size,
            )
            for row, label, probability in zip(
                rows,
                result.labels,
                result.probabilities,
                strict=True,
            ):
                cursor.execute(
                    """
                    UPDATE problem_embeddings
                    SET cluster_id = %s,
                        cluster_probability = %s,
                        updated_at = now()
                    WHERE problem_id = %s
                    """,
                    (label, probability, row["problem_id"]),
                )

    return {
        "clusters": len(set(result.labels)),
        "items": len(rows),
        "method": result.method,
    }


@app.get("/recommendations/{user_id}")
def recommendations(
    user_id: str,
    problem_id: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
) -> dict[str, Any]:
    try:
        return {
            "recommendations": recommend(user_id, problem_id, limit),
            "source": "ml-server",
        }
    except Exception as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/reviews/update")
def update_review(payload: ReviewPayload) -> dict[str, Any]:
    user_uuid = ensure_user(payload.user_id)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT ease_factor, interval_days, repetitions, lapses
                FROM user_review_state
                WHERE user_id = %s
                  AND problem_id::text = %s
                """,
                (user_uuid, payload.problem_id),
            )
            row = cursor.fetchone()
            state = ReviewState(**row) if row else ReviewState()
            update = sm2_update(state, payload.quality)
            cursor.execute(
                """
                INSERT INTO user_review_state (
                    user_id,
                    problem_id,
                    ease_factor,
                    interval_days,
                    repetitions,
                    lapses,
                    due_at,
                    last_quality,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (user_id, problem_id) DO UPDATE
                SET ease_factor = EXCLUDED.ease_factor,
                    interval_days = EXCLUDED.interval_days,
                    repetitions = EXCLUDED.repetitions,
                    lapses = EXCLUDED.lapses,
                    due_at = EXCLUDED.due_at,
                    last_quality = EXCLUDED.last_quality,
                    updated_at = now()
                """,
                (
                    user_uuid,
                    payload.problem_id,
                    update.ease_factor,
                    update.interval_days,
                    update.repetitions,
                    update.lapses,
                    update.due_at,
                    payload.quality,
                ),
            )

    return {
        "due_at": update.due_at.isoformat(),
        "ease_factor": update.ease_factor,
        "interval_days": update.interval_days,
        "lapses": update.lapses,
        "repetitions": update.repetitions,
    }
