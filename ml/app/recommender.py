from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .db import get_connection


@dataclass
class Candidate:
    problem_id: str
    title: str
    difficulty: str
    pool: str
    reason: str
    base_score: float
    features: dict[str, float] = field(default_factory=dict)
    topic_path: list[str] = field(default_factory=list)


POOL_WEIGHTS = {
    "topic_sequence": 0.2,
    "near_fetch": 0.18,
    "far_fetch": 0.1,
    "spaced_repetition": 0.24,
    "new_pattern": 0.14,
    "vector_similarity": 0.14,
}


def ensure_user(user_external_id: str) -> str:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (external_id)
                VALUES (%s)
                ON CONFLICT (external_id) DO UPDATE
                SET external_id = EXCLUDED.external_id
                RETURNING id::text
                """,
                (user_external_id,),
            )
            row = cursor.fetchone()
            return row["id"]


def _topic_path(problem_id: str) -> list[str]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT topic.name
                FROM problem_topics problem_topic
                JOIN topics topic ON topic.id = problem_topic.topic_id
                WHERE problem_topic.problem_id = %s
                ORDER BY problem_topic.weight DESC, topic.name ASC
                LIMIT 4
                """,
                (problem_id,),
            )
            return [row["name"] for row in cursor.fetchall()]


def _resolve_problem_uuid(problem_id: str | None) -> str | None:
    if not problem_id:
        return None

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id::text AS problem_uuid
                FROM problems
                WHERE id::text = %s
                   OR external_id = %s
                   OR slug = %s
                LIMIT 1
                """,
                (problem_id, problem_id, problem_id),
            )
            row = cursor.fetchone()
            return row["problem_uuid"] if row else None


def _anchor_embedding(anchor_problem_uuid: str | None) -> list[float] | None:
    if not anchor_problem_uuid:
        return None

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT embedding.combined_embedding
                FROM problem_embeddings embedding
                WHERE embedding.problem_id::text = %s
                LIMIT 1
                """,
                (anchor_problem_uuid,),
            )
            row = cursor.fetchone()
            return row["combined_embedding"] if row else None


def topic_sequence_pool(user_id: str, anchor_problem_uuid: str | None, limit: int) -> list[Candidate]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                WITH practiced AS (
                    SELECT DISTINCT problem_topic.topic_id
                    FROM user_problem_attempts attempt
                    JOIN problem_topics problem_topic ON problem_topic.problem_id = attempt.problem_id
                    WHERE attempt.user_id = %s AND attempt.status = 'accepted'
                ),
                next_topics AS (
                    SELECT edge.to_topic_id AS topic_id, MAX(edge.weight) AS graph_weight
                    FROM topic_edges edge
                    JOIN practiced ON practiced.topic_id = edge.from_topic_id
                    GROUP BY edge.to_topic_id
                )
                SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
                       problem.id::text AS problem_uuid,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       topic.name AS topic_name,
                       next_topics.graph_weight
                FROM next_topics
                JOIN problem_topics problem_topic ON problem_topic.topic_id = next_topics.topic_id
                JOIN topics topic ON topic.id = next_topics.topic_id
                JOIN problems problem ON problem.id = problem_topic.problem_id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM user_problem_attempts attempt
                    WHERE attempt.user_id = %s
                      AND attempt.problem_id = problem.id
                      AND attempt.status = 'accepted'
                )
                  AND (%s::text IS NULL OR problem.id::text <> %s)
                ORDER BY next_topics.graph_weight DESC, problem.difficulty ASC
                LIMIT %s
                """,
                (user_id, user_id, anchor_problem_uuid, anchor_problem_uuid, limit),
            )
            rows = cursor.fetchall()

    return [
        Candidate(
            base_score=0.72 + 0.05 * float(row["graph_weight"] or 0),
            difficulty=row["difficulty"],
            pool="topic_sequence",
            problem_id=row["problem_id"],
            reason=f"Next graph topic: {row['topic_name']}",
            title=row["title"],
            topic_path=_topic_path(row["problem_uuid"]),
        )
        for row in rows
    ]


def vector_pools(
    user_id: str,
    anchor_problem_uuid: str | None,
    anchor_embedding: list[float] | None,
    limit: int,
) -> list[Candidate]:
    if anchor_embedding is None:
        return []

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
                       problem.id::text AS problem_uuid,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       1 - (embedding.combined_embedding <=> %s) AS similarity
                FROM problem_embeddings embedding
                JOIN problems problem ON problem.id = embedding.problem_id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM user_problem_attempts attempt
                    WHERE attempt.user_id = %s
                      AND attempt.problem_id = problem.id
                      AND attempt.status = 'accepted'
                )
                  AND (%s::text IS NULL OR problem.id::text <> %s)
                ORDER BY embedding.combined_embedding <=> %s
                LIMIT %s
                """,
                (
                    anchor_embedding,
                    user_id,
                    anchor_problem_uuid,
                    anchor_problem_uuid,
                    anchor_embedding,
                    limit * 3,
                ),
            )
            rows = cursor.fetchall()

    candidates: list[Candidate] = []
    for index, row in enumerate(rows):
        similarity = float(row["similarity"] or 0)
        if index < limit:
            pool = "near_fetch"
            reason = "Very close to the solved problem in combined statement-code space."
        elif index < limit * 2:
            pool = "far_fetch"
            reason = "Related but far enough to stretch pattern transfer."
        else:
            pool = "vector_similarity"
            reason = "Retrieved directly from the pgvector nearest-neighbor index."

        candidates.append(
            Candidate(
                base_score=0.5 + similarity * 0.4,
                difficulty=row["difficulty"],
                features={"similarity": similarity},
                pool=pool,
                problem_id=row["problem_id"],
                reason=reason,
                title=row["title"],
                topic_path=_topic_path(row["problem_uuid"]),
            )
        )

    return candidates


def spaced_repetition_pool(user_id: str, limit: int) -> list[Candidate]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
                       problem.id::text AS problem_uuid,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       review.ease_factor,
                       review.interval_days,
                       review.due_at
                FROM user_review_state review
                JOIN problems problem ON problem.id = review.problem_id
                WHERE review.user_id = %s AND review.due_at <= now()
                ORDER BY review.due_at ASC, review.ease_factor ASC
                LIMIT %s
                """,
                (user_id, limit),
            )
            rows = cursor.fetchall()

    now = datetime.now(UTC)
    candidates = []
    for row in rows:
        due_at = row["due_at"]
        days_late = max(0, (now - due_at).days) if due_at else 0
        candidates.append(
            Candidate(
                base_score=0.74 + min(0.16, days_late * 0.02),
                difficulty=row["difficulty"],
                features={
                    "days_late": float(days_late),
                    "ease_factor": float(row["ease_factor"] or 2.3),
                    "interval_days": float(row["interval_days"] or 0),
                },
                pool="spaced_repetition",
                problem_id=row["problem_id"],
                reason="Due under the SM-2 review schedule.",
                title=row["title"],
                topic_path=_topic_path(row["problem_uuid"]),
            )
        )
    return candidates


def new_pattern_pool(user_id: str, anchor_problem_uuid: str | None, limit: int) -> list[Candidate]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
                       problem.id::text AS problem_uuid,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       COALESCE(embedding.cluster_id, -1) AS cluster_id
                FROM problems problem
                LEFT JOIN problem_embeddings embedding ON embedding.problem_id = problem.id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM user_problem_attempts attempt
                    WHERE attempt.user_id = %s
                      AND attempt.problem_id = problem.id
                )
                  AND (%s::text IS NULL OR problem.id::text <> %s)
                ORDER BY embedding.cluster_id NULLS LAST, random()
                LIMIT %s
                """,
                (user_id, anchor_problem_uuid, anchor_problem_uuid, limit),
            )
            rows = cursor.fetchall()

    return [
        Candidate(
            base_score=0.63,
            difficulty=row["difficulty"],
            features={"cluster_id": float(row["cluster_id"])},
            pool="new_pattern",
            problem_id=row["problem_id"],
            reason="A cluster or topic family the user has not attempted yet.",
            title=row["title"],
            topic_path=_topic_path(row["problem_uuid"]),
        )
        for row in rows
    ]


def rank_candidates(candidates: list[Candidate], limit: int) -> list[dict[str, Any]]:
    merged: dict[str, Candidate] = {}
    for candidate in candidates:
        weight = POOL_WEIGHTS.get(candidate.pool, 0.08)
        score = candidate.base_score + weight
        if candidate.difficulty == "Medium":
            score += 0.03
        elif candidate.difficulty == "Hard":
            score -= 0.02

        candidate.features["pool_weight"] = weight
        candidate.features["base_score"] = candidate.base_score
        candidate.features["ranked_score"] = score

        existing = merged.get(candidate.problem_id)
        if existing is None or score > existing.features["ranked_score"]:
            merged[candidate.problem_id] = candidate

    ranked = sorted(
        merged.values(),
        key=lambda item: item.features["ranked_score"],
        reverse=True,
    )

    output = []
    for candidate in ranked[:limit]:
        output.append(
            {
                "difficulty": candidate.difficulty,
                "features": candidate.features,
                "pool": candidate.pool.replace("_", " ").title(),
                "problemId": candidate.problem_id,
                "reason": candidate.reason,
                "score": round(float(candidate.features["ranked_score"]), 4),
                "title": candidate.title,
                "topicPath": candidate.topic_path,
            }
        )
    return output


def recommend(user_external_id: str, anchor_problem_id: str | None, limit: int = 5) -> list[dict[str, Any]]:
    user_id = ensure_user(user_external_id)
    anchor_problem_uuid = _resolve_problem_uuid(anchor_problem_id)
    anchor = _anchor_embedding(anchor_problem_uuid)
    candidates: list[Candidate] = []
    candidates.extend(topic_sequence_pool(user_id, anchor_problem_uuid, limit))
    candidates.extend(vector_pools(user_id, anchor_problem_uuid, anchor, limit))
    candidates.extend(spaced_repetition_pool(user_id, limit))
    candidates.extend(new_pattern_pool(user_id, anchor_problem_uuid, limit))
    return rank_candidates(candidates, limit)
