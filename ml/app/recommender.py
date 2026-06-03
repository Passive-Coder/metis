from dataclasses import dataclass, field
from datetime import UTC, datetime
import math
from typing import Any

from .config import settings
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
    problem_uuid: str | None = None
    topic_path: list[str] = field(default_factory=list)
    pool_memberships: list[tuple[str, float, str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.pool_memberships:
            self.pool_memberships.append((self.pool, self.base_score, self.reason))


POOL_WEIGHTS = {
    "topic_sequence": 0.2,
    "near_fetch": 0.12,
    "far_fetch": 0.13,
    "spaced_repetition": 0.24,
    "new_pattern": 0.17,
    "vector_similarity": 0.08,
}

FEATURE_ORDER = [
    "accepted_count",
    "attempt_count",
    "best_pass_rate",
    "compile_count",
    "difficulty_fit",
    "due_value",
    "editor_active_ms",
    "editor_compile_count",
    "editor_idle_ratio",
    "editor_pause_count",
    "editor_submit_count",
    "error_rate",
    "learning_value",
    "max_pause_ms",
    "pool_weight",
    "readiness",
    "retry_value",
    "semantic_confidence",
    "skill_score",
    "typing_speed_cpm",
    "weak_topic_fit",
]

DIFFICULTY_LEVEL = {
    "Easy": 0.35,
    "Medium": 0.62,
    "Hard": 0.86,
}

VECTOR_POOLS = {"near_fetch", "far_fetch", "vector_similarity"}


def _pool_group(pool: str) -> str:
    if pool in VECTOR_POOLS:
        return "vector_fetch"
    return pool


def _pool_evidence(memberships: list[tuple[str, float, str]]) -> float:
    miss_probability = 1.0
    for _, score, _ in memberships:
        miss_probability *= 1 - _clamp(score)
    return _clamp(1 - miss_probability)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return min(maximum, max(minimum, value))


def _sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def _pass_rate(passed: int | None, total: int | None) -> float:
    if not total or total <= 0:
        return 0.0
    return _clamp(float(passed or 0) / float(total))


def _days_since(value: datetime | None) -> float:
    if value is None:
        return 999.0
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return max(0.0, (datetime.now(UTC) - value).total_seconds() / 86400)


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
                anchor_topics AS (
                    SELECT topic_id
                    FROM problem_topics
                    WHERE %s::text IS NOT NULL
                      AND problem_id::text = %s
                ),
                seed_topics AS (
                    SELECT topic_id FROM practiced
                    UNION
                    SELECT topic_id FROM anchor_topics
                ),
                next_topics AS (
                    SELECT edge.to_topic_id AS topic_id, MAX(edge.weight) AS graph_weight
                    FROM topic_edges edge
                    JOIN seed_topics ON seed_topics.topic_id = edge.from_topic_id
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
                WHERE (%s::text IS NULL OR problem.id::text <> %s)
                ORDER BY next_topics.graph_weight DESC, problem.difficulty ASC
                LIMIT %s
                """,
                (
                    user_id,
                    anchor_problem_uuid,
                    anchor_problem_uuid,
                    anchor_problem_uuid,
                    anchor_problem_uuid,
                    limit,
                ),
            )
            rows = cursor.fetchall()

    return [
        Candidate(
            base_score=0.72 + 0.05 * float(row["graph_weight"] or 0),
            difficulty=row["difficulty"],
            pool="topic_sequence",
            problem_id=row["problem_id"],
            problem_uuid=row["problem_uuid"],
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
                WHERE (%s::text IS NULL OR problem.id::text <> %s)
                  AND NOT EXISTS (
                    SELECT 1
                    FROM user_problem_attempts attempt
                    WHERE attempt.user_id = %s
                      AND attempt.problem_id = problem.id
                      AND attempt.status = 'accepted'
                  )
                ORDER BY embedding.combined_embedding <=> %s
                LIMIT %s
                """,
                (
                    anchor_embedding,
                    anchor_problem_uuid,
                    anchor_problem_uuid,
                    user_id,
                    anchor_embedding,
                    max(limit * 8, 24),
                ),
            )
            rows = cursor.fetchall()

    candidates: list[Candidate] = []
    pool_counts = {"near_fetch": 0, "far_fetch": 0, "vector_similarity": 0}
    raw_vector_limit = max(1, math.ceil(limit / 2))
    for row in rows:
        similarity = float(row["similarity"] or 0)
        if similarity >= 0.72 and pool_counts["near_fetch"] < limit:
            pool = "near_fetch"
            reason = "Very close to the solved problem in combined statement-code space."
        elif 0.28 <= similarity < 0.72 and pool_counts["far_fetch"] < limit:
            pool = "far_fetch"
            reason = "Related but far enough to stretch pattern transfer."
        elif pool_counts["vector_similarity"] < raw_vector_limit:
            pool = "vector_similarity"
            reason = "Retrieved directly from the pgvector nearest-neighbor index."
        else:
            continue

        pool_counts[pool] += 1

        candidates.append(
            Candidate(
                base_score=0.5 + similarity * 0.4,
                difficulty=row["difficulty"],
                features={"similarity": similarity},
                pool=pool,
                problem_id=row["problem_id"],
                problem_uuid=row["problem_uuid"],
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
                problem_uuid=row["problem_uuid"],
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
                WITH attempted_clusters AS (
                    SELECT DISTINCT embedding.cluster_id
                    FROM user_problem_attempts attempt
                    JOIN problem_embeddings embedding ON embedding.problem_id = attempt.problem_id
                    WHERE attempt.user_id = %s
                      AND embedding.cluster_id IS NOT NULL
                )
                SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
                       problem.id::text AS problem_uuid,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       COALESCE(embedding.cluster_id, -1) AS cluster_id,
                       COALESCE(embedding.cluster_probability, 0) AS cluster_probability
                FROM problems problem
                LEFT JOIN problem_embeddings embedding ON embedding.problem_id = problem.id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM user_problem_attempts attempt
                    WHERE attempt.user_id = %s
                      AND attempt.problem_id = problem.id
                )
                  AND (%s::text IS NULL OR problem.id::text <> %s)
                ORDER BY
                    CASE
                        WHEN embedding.cluster_id IS NULL THEN 1
                        WHEN embedding.cluster_id IN (SELECT cluster_id FROM attempted_clusters) THEN 1
                        ELSE 0
                    END ASC,
                    embedding.cluster_probability DESC NULLS LAST,
                    random()
                LIMIT %s
                """,
                (user_id, user_id, anchor_problem_uuid, anchor_problem_uuid, limit),
            )
            rows = cursor.fetchall()

    return [
        Candidate(
            base_score=0.62
            + min(0.12, float(row["cluster_probability"] or 0) * 0.12),
            difficulty=row["difficulty"],
            features={
                "cluster_id": float(row["cluster_id"]),
                "cluster_probability": float(row["cluster_probability"] or 0),
            },
            pool="new_pattern",
            problem_id=row["problem_id"],
            problem_uuid=row["problem_uuid"],
            reason="A cluster or topic family the user has not attempted yet.",
            title=row["title"],
            topic_path=_topic_path(row["problem_uuid"]),
        )
        for row in rows
    ]


def _attempt_features(user_id: str) -> dict[str, dict[str, float]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT problem_id::text AS problem_uuid,
                       status::text AS status,
                       passed_test_count,
                       total_test_count,
                       created_at
                FROM user_problem_attempts
                WHERE user_id = %s
                ORDER BY created_at ASC
                LIMIT 5000
                """,
                (user_id,),
            )
            rows = cursor.fetchall()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(row["problem_uuid"], []).append(row)

    features: dict[str, dict[str, float]] = {}
    for problem_uuid, attempts in grouped.items():
        rates = [
            _pass_rate(row["passed_test_count"], row["total_test_count"])
            for row in attempts
        ]
        recent_rates = rates[-5:]
        first_recent = recent_rates[0] if recent_rates else 0.0
        last_recent = recent_rates[-1] if recent_rates else 0.0
        last_attempt = attempts[-1] if attempts else None
        features[problem_uuid] = {
            "accepted_count": float(
                sum(1 for row in attempts if row["status"] == "accepted")
            ),
            "attempt_count": float(len(attempts)),
            "best_pass_rate": max(rates) if rates else 0.0,
            "compile_count": float(
                sum(1 for row in attempts if row["status"] == "compiled")
            ),
            "days_since_last": _days_since(last_attempt["created_at"] if last_attempt else None),
            "failed_submit_count": float(
                sum(
                    1
                    for row in attempts
                    if row["status"] not in ("compiled", "accepted")
                )
            ),
            "last_pass_rate": rates[-1] if rates else 0.0,
            "pass_rate_trend": _clamp(last_recent - first_recent, -1.0, 1.0),
            "recent_compile_count": float(
                sum(
                    1
                    for row in attempts
                    if row["status"] == "compiled"
                    and _days_since(row["created_at"]) <= 7
                )
            ),
            "submit_count": float(
                sum(1 for row in attempts if row["status"] != "compiled")
            ),
        }
    return features


def _editor_behavior_features(user_id: str) -> dict[str, dict[str, float]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT problem_id::text AS problem_uuid,
                       COUNT(*)::float AS session_count,
                       AVG(active_ms)::float AS avg_active_ms,
                       AVG(idle_ms)::float AS avg_idle_ms,
                       AVG(max_pause_ms)::float AS avg_max_pause_ms,
                       AVG(pause_count)::float AS avg_pause_count,
                       AVG(typing_bursts)::float AS avg_typing_bursts,
                       AVG(keystroke_count)::float AS avg_keystroke_count,
                       AVG(edit_count)::float AS avg_edit_count,
                       AVG(paste_count)::float AS avg_paste_count,
                       AVG(delete_count)::float AS avg_delete_count,
                       AVG(chars_added)::float AS avg_chars_added,
                       AVG(chars_deleted)::float AS avg_chars_deleted,
                       SUM(compile_count)::float AS editor_compile_count,
                       SUM(submit_count)::float AS editor_submit_count
                FROM editor_sessions
                WHERE user_id = %s
                GROUP BY problem_id
                """,
                (user_id,),
            )
            session_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT DISTINCT ON (problem_id)
                       problem_id::text AS problem_uuid,
                       code_metrics
                FROM editor_code_snapshots
                WHERE user_id = %s
                ORDER BY problem_id, created_at DESC
                """,
                (user_id,),
            )
            snapshot_rows = cursor.fetchall()

    features: dict[str, dict[str, float]] = {}
    for row in session_rows:
        active_ms = float(row["avg_active_ms"] or 0)
        idle_ms = float(row["avg_idle_ms"] or 0)
        chars_added = float(row["avg_chars_added"] or 0)
        features[row["problem_uuid"]] = {
            "editor_active_ms": active_ms,
            "editor_chars_added": chars_added,
            "editor_chars_deleted": float(row["avg_chars_deleted"] or 0),
            "editor_compile_count": float(row["editor_compile_count"] or 0),
            "editor_delete_count": float(row["avg_delete_count"] or 0),
            "editor_edit_count": float(row["avg_edit_count"] or 0),
            "editor_idle_ms": idle_ms,
            "editor_idle_ratio": idle_ms / max(1.0, active_ms + idle_ms),
            "editor_keystroke_count": float(row["avg_keystroke_count"] or 0),
            "editor_max_pause_ms": float(row["avg_max_pause_ms"] or 0),
            "editor_paste_count": float(row["avg_paste_count"] or 0),
            "editor_pause_count": float(row["avg_pause_count"] or 0),
            "editor_session_count": float(row["session_count"] or 0),
            "editor_submit_count": float(row["editor_submit_count"] or 0),
            "typing_speed_cpm": (chars_added / max(1.0, active_ms)) * 60000,
        }

    for row in snapshot_rows:
        code_metrics = row["code_metrics"] or {}
        item = features.setdefault(row["problem_uuid"], {})
        for key in (
            "assignmentCount",
            "branchCount",
            "callCount",
            "comparisonCount",
            "comprehensionCount",
            "lineCount",
            "loopCount",
            "maxIndentDepth",
            "mutationCount",
            "returnCount",
            "tokenCount",
            "tokenEntropy",
            "uniqueTokenRatio",
        ):
            value = code_metrics.get(key)
            if isinstance(value, (int, float)):
                item[f"code_{key}"] = float(value)

        hints = code_metrics.get("algorithmHints") or {}
        if isinstance(hints, dict):
            item["semantic_confidence"] = float(sum(1 for value in hints.values() if value)) / max(1.0, len(hints))

    return features


def _skill_score(attempt: dict[str, float], behavior: dict[str, float]) -> float:
    best_pass_rate = attempt.get("best_pass_rate", 0.0)
    accepted = 1.0 if attempt.get("accepted_count", 0.0) > 0 else 0.0
    compile_pressure = _clamp((attempt.get("compile_count", 0.0) + behavior.get("editor_compile_count", 0.0)) / 8.0)
    failed_pressure = _clamp(attempt.get("failed_submit_count", 0.0) / 4.0)
    idle_ratio = _clamp(behavior.get("editor_idle_ratio", 0.0))
    pause_pressure = _clamp(behavior.get("editor_pause_count", 0.0) / 12.0)
    time_pressure = _clamp(behavior.get("editor_active_ms", 0.0) / (45 * 60 * 1000))
    trend_bonus = _clamp(max(0.0, attempt.get("pass_rate_trend", 0.0)))

    return _clamp(
        accepted * 0.28
        + best_pass_rate * 0.34
        + trend_bonus * 0.12
        + (1 - compile_pressure) * 0.1
        + (1 - failed_pressure) * 0.08
        + (1 - idle_ratio) * 0.04
        + (1 - pause_pressure) * 0.02
        + (1 - time_pressure) * 0.04
    )


def _feature_vector(features: dict[str, float]) -> list[float]:
    return [float(features.get(name, 0.0)) for name in FEATURE_ORDER]


def _optional_model_score(features: dict[str, float]) -> float | None:
    model_name = (settings.ranker_model or "heuristic").lower()
    if model_name == "heuristic":
        return None

    vector = _feature_vector(features)
    try:
        if model_name == "lightgbm" and settings.lightgbm_model_path:
            import lightgbm as lgb  # type: ignore

            model = lgb.Booster(model_file=settings.lightgbm_model_path)
            return float(model.predict([vector])[0])

        if model_name == "lightfm" and settings.lightfm_model_path:
            # LightFM is trained offline on implicit user-item interactions plus
            # user/item metadata. Runtime scoring needs a user/item id mapping,
            # so this hook intentionally consumes artifacts only when supplied.
            import pickle

            with open(settings.lightfm_model_path, "rb") as file:
                payload = pickle.load(file)
            scorer = payload.get("score")
            if callable(scorer):
                return float(scorer(features))

        if model_name == "gnn" and settings.gnn_model_path:
            import torch

            model = torch.jit.load(settings.gnn_model_path)
            model.eval()
            with torch.no_grad():
                tensor = torch.tensor([vector], dtype=torch.float32)
                return float(model(tensor).reshape(-1)[0].item())
    except Exception as error:
        print(f"Ranker model fallback: {error}")

    return None


def _topic_mastery(user_id: str) -> dict[str, float]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT topic.name, state.mastery
                FROM user_topic_state state
                JOIN topics topic ON topic.id = state.topic_id
                WHERE state.user_id = %s
                """,
                (user_id,),
            )
            return {
                row["name"].strip().lower(): float(row["mastery"] or 0)
                for row in cursor.fetchall()
            }


def _problem_topics(problem_uuid: str | None) -> list[str]:
    if not problem_uuid:
        return []
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT topic.name
                FROM problem_topics problem_topic
                JOIN topics topic ON topic.id = problem_topic.topic_id
                WHERE problem_topic.problem_id::text = %s
                ORDER BY problem_topic.weight DESC, topic.name ASC
                """,
                (problem_uuid,),
            )
            return [row["name"] for row in cursor.fetchall()]


def _recommendation_event_features(user_id: str) -> dict[str, dict[str, float]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT recommended_problem_id::text AS problem_uuid,
                       created_at
                FROM recommendation_events
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 500
                """,
                (user_id,),
            )
            rows = cursor.fetchall()

    features: dict[str, dict[str, float]] = {}
    for row in rows:
        item = features.setdefault(
            row["problem_uuid"],
            {"count": 0.0, "days_since_last": 999.0},
        )
        item["count"] += 1
        item["days_since_last"] = min(
            item["days_since_last"],
            _days_since(row["created_at"]),
        )
    return features


def _solved_difficulty_level(
    attempts: dict[str, dict[str, float]],
    candidates: list[Candidate],
) -> float:
    difficulty_by_uuid = {
        candidate.problem_uuid: candidate.difficulty
        for candidate in candidates
        if candidate.problem_uuid
    }
    weighted = 0.0
    weight = 0.0
    for problem_uuid, stats in attempts.items():
        if stats["accepted_count"] <= 0:
            continue
        recency = math.exp(-stats["days_since_last"] / 45)
        weighted += DIFFICULTY_LEVEL.get(difficulty_by_uuid.get(problem_uuid, "Easy"), 0.35) * recency
        weight += recency
    return weighted / weight if weight else 0.35


def _prereq_readiness(topic_path: list[str], topic_mastery: dict[str, float]) -> float:
    if not topic_path:
        return 0.72
    values = []
    for topic in topic_path:
        key = topic.strip().lower()
        if key in topic_mastery:
            values.append(topic_mastery[key])
        elif key in ("arrays", "strings"):
            values.append(0.55)
        else:
            values.append(0.42)
    return sum(values) / len(values)


def _weak_topic_fit(topic_path: list[str], topic_mastery: dict[str, float]) -> float:
    value = 0.0
    for topic in topic_path:
        key = topic.strip().lower()
        if key in topic_mastery:
            value = max(value, 1 - topic_mastery[key])
    return _clamp(value)


def _merge_candidate_pools(candidates: list[Candidate]) -> list[Candidate]:
    merged: dict[str, Candidate] = {}
    for candidate in candidates:
        candidate.features[f"{candidate.pool}_base_score"] = candidate.base_score
        existing = merged.get(candidate.problem_id)
        if existing is None:
            merged[candidate.problem_id] = candidate
            continue

        existing.pool_memberships.extend(candidate.pool_memberships)
        for key, value in candidate.features.items():
            existing.features[key] = max(existing.features.get(key, value), value)

        if candidate.base_score > existing.base_score:
            existing.base_score = candidate.base_score
            existing.pool = candidate.pool
            existing.reason = candidate.reason
            existing.topic_path = candidate.topic_path or existing.topic_path

    return list(merged.values())


def _candidate_group(candidate: Candidate) -> str:
    pools = [pool for pool, _, _ in candidate.pool_memberships]
    for pool in (
        "spaced_repetition",
        "topic_sequence",
        "new_pattern",
        "remediation",
        "weak_topic",
    ):
        if pool in pools:
            return _pool_group(pool)
    return _pool_group(candidate.pool)


def _select_diverse_candidates(candidates: list[Candidate], limit: int) -> list[Candidate]:
    selected: list[Candidate] = []
    deferred: list[Candidate] = []
    used_groups: set[str] = set()

    for candidate in candidates:
        group = _candidate_group(candidate)
        if group not in used_groups:
            selected.append(candidate)
            used_groups.add(group)
        else:
            deferred.append(candidate)

        if len(selected) >= limit:
            return selected

    selected_ids = {candidate.problem_id for candidate in selected}
    for candidate in deferred:
        if candidate.problem_id not in selected_ids:
            selected.append(candidate)
            selected_ids.add(candidate.problem_id)
        if len(selected) >= limit:
            break

    return selected


def rank_candidates(candidates: list[Candidate], limit: int, user_id: str) -> list[dict[str, Any]]:
    attempts = _attempt_features(user_id)
    behavior_features = _editor_behavior_features(user_id)
    topic_mastery = _topic_mastery(user_id)
    event_features = _recommendation_event_features(user_id)
    solved_level = _solved_difficulty_level(attempts, candidates)
    merged: dict[str, Candidate] = {}
    for candidate in _merge_candidate_pools(candidates):
        pool_names = [pool for pool, _, _ in candidate.pool_memberships]
        weight = max(POOL_WEIGHTS.get(pool, 0.08) for pool in pool_names)
        pool_evidence = _pool_evidence(candidate.pool_memberships)
        attempt = attempts.get(candidate.problem_uuid or "", {})
        behavior = behavior_features.get(candidate.problem_uuid or "", {})
        events = event_features.get(candidate.problem_uuid or "", {})
        topics = candidate.topic_path or _problem_topics(candidate.problem_uuid)
        readiness = _prereq_readiness(topics, topic_mastery)
        weak_fit = _weak_topic_fit(topics, topic_mastery)
        difficulty_target = DIFFICULTY_LEVEL.get(candidate.difficulty, 0.62)
        difficulty_fit = _clamp(1 - abs(difficulty_target - (solved_level + 0.08)) / 0.65)
        skill_score = _skill_score(attempt, behavior)
        retry_value = 0.0
        if attempt and skill_score < 0.72:
            retry_value = _clamp(
                attempt.get("failed_submit_count", 0) * 0.15
                + (attempt.get("compile_count", 0) + behavior.get("editor_compile_count", 0)) * 0.05
                + (1 - attempt.get("best_pass_rate", 0)) * 0.36
                + (1 - skill_score) * 0.24
                + max(0, attempt.get("pass_rate_trend", 0)) * 0.18
            )
        due_value = _clamp(candidate.features.get("days_late", 0) * 0.08 + (0.46 if candidate.pool == "spaced_repetition" else 0))
        learning_value = max(
            candidate.features.get("similarity", 0) * 0.75,
            weak_fit * 0.78,
            0.52 if not attempt else 0.12,
            retry_value,
        )
        readiness_requirement = 0.68 if candidate.difficulty == "Hard" else 0.5 if candidate.difficulty == "Medium" else 0.32
        readiness_gate = _sigmoid((readiness - readiness_requirement) * 7)
        recent_solved_penalty = (
            (3 - attempt.get("days_since_last", 999)) * 0.08 * skill_score
            if attempt.get("accepted_count", 0) > 0 and attempt.get("days_since_last", 999) < 3 and skill_score >= 0.72
            else 0
        )
        repeated_recommendation_penalty = (
            min(0.2, events.get("count", 0) * 0.04 + (2 - events.get("days_since_last", 999)) * 0.04)
            if events.get("days_since_last", 999) < 2
            else 0
        )
        vector_only_penalty = (
            0.08
            if pool_names and all(pool in VECTOR_POOLS for pool in pool_names)
            else 0.0
        )
        base_rank_score = _clamp(
            (
                0.1
                + candidate.base_score * 0.12
                + pool_evidence * 0.15
                + weight * 0.14
                + learning_value * 0.24
                + difficulty_fit * 0.16
                + readiness * 0.1
                + due_value * 0.12
                + (1 - skill_score) * 0.1
                + max(0, attempt.get("pass_rate_trend", 0)) * 0.06
                - recent_solved_penalty
                - repeated_recommendation_penalty
                - vector_only_penalty
            )
            * (0.72 + readiness_gate * 0.28)
        )
        model_features = {
            **attempt,
            **behavior,
            "difficulty_fit": difficulty_fit,
            "due_value": due_value,
            "error_rate": _clamp(attempt.get("failed_submit_count", 0) / max(1.0, attempt.get("submit_count", 0))),
            "learning_value": learning_value,
            "max_pause_ms": behavior.get("editor_max_pause_ms", 0.0),
            "pool_evidence": pool_evidence,
            "pool_weight": weight,
            "readiness": readiness,
            "retry_value": retry_value,
            "semantic_confidence": behavior.get("semantic_confidence", 0.0),
            "skill_score": skill_score,
            "typing_speed_cpm": behavior.get("typing_speed_cpm", 0.0),
            "weak_topic_fit": weak_fit,
        }
        model_score = _optional_model_score(model_features)
        score = _clamp(base_rank_score if model_score is None else base_rank_score * 0.35 + _clamp(model_score) * 0.65)

        candidate.features["pool_weight"] = weight
        candidate.features["pool_evidence"] = pool_evidence
        candidate.features["source_pool_count"] = float(len(set(pool_names)))
        candidate.features["vector_only_penalty"] = vector_only_penalty
        candidate.features["base_score"] = candidate.base_score
        candidate.features["difficulty_fit"] = difficulty_fit
        candidate.features["due_value"] = due_value
        candidate.features["learning_value"] = learning_value
        candidate.features["readiness"] = readiness
        candidate.features["readiness_gate"] = readiness_gate
        candidate.features["retry_value"] = retry_value
        candidate.features["skill_score"] = skill_score
        candidate.features["editor_active_ms"] = behavior.get("editor_active_ms", 0.0)
        candidate.features["editor_compile_count"] = behavior.get("editor_compile_count", 0.0)
        candidate.features["editor_idle_ratio"] = behavior.get("editor_idle_ratio", 0.0)
        candidate.features["editor_pause_count"] = behavior.get("editor_pause_count", 0.0)
        candidate.features["semantic_confidence"] = behavior.get("semantic_confidence", 0.0)
        candidate.features["ranker_model_score"] = model_score if model_score is not None else -1.0
        candidate.features["weak_topic_fit"] = weak_fit
        candidate.features["ranked_score"] = score

        existing = merged.get(candidate.problem_id)
        if existing is None or score > existing.features["ranked_score"]:
            merged[candidate.problem_id] = candidate

    ranked = sorted(
        merged.values(),
        key=lambda item: item.features["ranked_score"],
        reverse=True,
    )
    ranked = _select_diverse_candidates(ranked, limit)

    output = []
    for candidate in ranked:
        output.append(
            {
                "difficulty": candidate.difficulty,
                "features": candidate.features,
                "pool": candidate.pool.replace("_", " ").title(),
                "pools": [pool for pool, _, _ in candidate.pool_memberships],
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
    pool_limit = max(limit * 2, 8)
    candidates: list[Candidate] = []
    candidates.extend(topic_sequence_pool(user_id, anchor_problem_uuid, pool_limit))
    candidates.extend(vector_pools(user_id, anchor_problem_uuid, anchor, pool_limit))
    candidates.extend(spaced_repetition_pool(user_id, pool_limit))
    candidates.extend(new_pattern_pool(user_id, anchor_problem_uuid, pool_limit))
    return rank_candidates(candidates, limit, user_id)
