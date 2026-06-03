from dataclasses import dataclass, field
from datetime import UTC, datetime
import math
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
    problem_uuid: str | None = None
    topic_path: list[str] = field(default_factory=list)


POOL_WEIGHTS = {
    "topic_sequence": 0.2,
    "near_fetch": 0.18,
    "far_fetch": 0.1,
    "spaced_repetition": 0.24,
    "new_pattern": 0.14,
    "vector_similarity": 0.14,
}

DIFFICULTY_LEVEL = {
    "Easy": 0.35,
    "Medium": 0.62,
    "Hard": 0.86,
}


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


def rank_candidates(candidates: list[Candidate], limit: int, user_id: str) -> list[dict[str, Any]]:
    attempts = _attempt_features(user_id)
    topic_mastery = _topic_mastery(user_id)
    event_features = _recommendation_event_features(user_id)
    solved_level = _solved_difficulty_level(attempts, candidates)
    merged: dict[str, Candidate] = {}
    for candidate in candidates:
        weight = POOL_WEIGHTS.get(candidate.pool, 0.08)
        attempt = attempts.get(candidate.problem_uuid or "", {})
        events = event_features.get(candidate.problem_uuid or "", {})
        topics = candidate.topic_path or _problem_topics(candidate.problem_uuid)
        readiness = _prereq_readiness(topics, topic_mastery)
        weak_fit = _weak_topic_fit(topics, topic_mastery)
        difficulty_target = DIFFICULTY_LEVEL.get(candidate.difficulty, 0.62)
        difficulty_fit = _clamp(1 - abs(difficulty_target - (solved_level + 0.08)) / 0.65)
        retry_value = 0.0
        if attempt and attempt.get("accepted_count", 0) <= 0:
            retry_value = _clamp(
                attempt.get("failed_submit_count", 0) * 0.15
                + attempt.get("compile_count", 0) * 0.05
                + (1 - attempt.get("best_pass_rate", 0)) * 0.36
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
            (3 - attempt.get("days_since_last", 999)) * 0.08
            if attempt.get("accepted_count", 0) > 0 and attempt.get("days_since_last", 999) < 3
            else 0
        )
        repeated_recommendation_penalty = (
            min(0.2, events.get("count", 0) * 0.04 + (2 - events.get("days_since_last", 999)) * 0.04)
            if events.get("days_since_last", 999) < 2
            else 0
        )
        score = _clamp(
            (
                0.1
                + candidate.base_score * 0.18
                + weight * 0.22
                + learning_value * 0.24
                + difficulty_fit * 0.16
                + readiness * 0.1
                + due_value * 0.12
                + max(0, attempt.get("pass_rate_trend", 0)) * 0.06
                - recent_solved_penalty
                - repeated_recommendation_penalty
            )
            * (0.72 + readiness_gate * 0.28)
        )

        candidate.features["pool_weight"] = weight
        candidate.features["base_score"] = candidate.base_score
        candidate.features["difficulty_fit"] = difficulty_fit
        candidate.features["due_value"] = due_value
        candidate.features["learning_value"] = learning_value
        candidate.features["readiness"] = readiness
        candidate.features["readiness_gate"] = readiness_gate
        candidate.features["retry_value"] = retry_value
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
    return rank_candidates(candidates, limit, user_id)
