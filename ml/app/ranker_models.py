from __future__ import annotations

import math
import pickle
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import settings


FEATURE_ORDER = [
    "accepted_count",
    "attempt_count",
    "best_pass_rate",
    "compile_count",
    "difficulty_fit",
    "due_value",
    "editor_active_ms",
    "editor_chars_per_edit",
    "editor_churn_ratio",
    "editor_compile_count",
    "editor_compile_interval_ms",
    "editor_delete_count",
    "editor_delete_ratio",
    "editor_edit_count",
    "editor_edits_per_minute",
    "editor_first_compile_latency_ms",
    "editor_first_edit_latency_ms",
    "editor_first_submit_latency_ms",
    "editor_idle_ratio",
    "editor_keystroke_count",
    "editor_keystrokes_per_minute",
    "editor_max_pause_ms",
    "editor_paste_count",
    "editor_paste_ratio",
    "editor_pause_count",
    "editor_pause_density",
    "editor_submit_count",
    "editor_submit_interval_ms",
    "editor_typing_burst_density",
    "error_rate",
    "learning_value",
    "max_pause_ms",
    "pool_evidence",
    "pool_weight",
    "readiness",
    "retry_value",
    "semantic_confidence",
    "skill_score",
    "typing_speed_cpm",
    "weak_topic_fit",
    "code_algorithm_disagreement",
    "code_algorithm_signal_count",
    "code_ast_depth",
    "code_branch_count",
    "code_call_entropy",
    "code_data_structure_signal_count",
    "code_loop_count",
    "code_mutation_count",
    "code_parse_error",
    "code_semantic_collision_risk",
    "code_tree_sitter_error_count",
]


@dataclass(frozen=True)
class RankerContext:
    features: dict[str, float]
    problem_external_id: str
    problem_uuid: str | None
    user_external_id: str
    user_uuid: str


@dataclass
class RankerScore:
    model: str
    score: float
    components: dict[str, float] = field(default_factory=dict)
    unavailable: list[str] = field(default_factory=list)


def feature_vector(features: dict[str, float]) -> list[float]:
    return [float(features.get(name, 0.0)) for name in FEATURE_ORDER]


def _normalize_score(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    if 0.0 <= value <= 1.0:
        return value
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exp_value = math.exp(value)
    return exp_value / (1 + exp_value)


def _candidate_keys(context: RankerContext) -> list[str]:
    keys = [context.problem_external_id]
    if context.problem_uuid:
        keys.append(context.problem_uuid)
    return [key for key in keys if key]


def _user_keys(context: RankerContext) -> list[str]:
    return [context.user_external_id, context.user_uuid]


@lru_cache(maxsize=4)
def _load_lightgbm_model(path: str) -> Any:
    import lightgbm as lgb  # type: ignore

    return lgb.Booster(model_file=path)


@lru_cache(maxsize=4)
def _load_pickle_artifact(path: str) -> Any:
    with Path(path).open("rb") as file:
        return pickle.load(file)


@lru_cache(maxsize=4)
def _load_torchscript_model(path: str) -> Any:
    import torch

    model = torch.jit.load(path)
    model.eval()
    return model


def _mapped_id(mapping: dict[Any, Any] | None, keys: list[str]) -> int | None:
    if not mapping:
        return None
    for key in keys:
        if key in mapping:
            return int(mapping[key])
        if str(key) in mapping:
            return int(mapping[str(key)])
    return None


def _score_lightgbm(context: RankerContext) -> float | None:
    if not settings.lightgbm_model_path:
        return None

    model = _load_lightgbm_model(settings.lightgbm_model_path)
    raw = float(model.predict([feature_vector(context.features)])[0])
    return _normalize_score(raw)


def _score_lightfm(context: RankerContext) -> float | None:
    if not settings.lightfm_model_path:
        return None

    payload = _load_pickle_artifact(settings.lightfm_model_path)
    if callable(getattr(payload, "score", None)):
        return _normalize_score(float(payload.score(context)))
    if isinstance(payload, dict) and callable(payload.get("score")):
        return _normalize_score(float(payload["score"](context)))

    if not isinstance(payload, dict):
        return None

    model = payload.get("model")
    user_id = _mapped_id(payload.get("user_id_map"), _user_keys(context))
    item_id = _mapped_id(payload.get("item_id_map"), _candidate_keys(context))
    if model is None or user_id is None or item_id is None:
        return None

    import numpy as np

    raw = model.predict(
        user_id,
        np.asarray([item_id], dtype=np.int32),
        item_features=payload.get("item_features"),
        num_threads=int(payload.get("num_threads", 1)),
        user_features=payload.get("user_features"),
    )[0]
    return _normalize_score(float(raw))


def _embedding_from_payload(
    payload: dict[str, Any],
    prefix: str,
    keys: list[str],
) -> list[float] | None:
    embeddings = payload.get(f"{prefix}_embeddings")
    if embeddings is None:
        return None

    if isinstance(embeddings, dict):
        for key in keys:
            vector = embeddings.get(key)
            if vector is None:
                vector = embeddings.get(str(key))
            if vector is not None:
                return [float(value) for value in vector]
        return None

    row_id = _mapped_id(payload.get(f"{prefix}_id_map"), keys)
    if row_id is None:
        return None

    try:
        return [float(value) for value in embeddings[row_id]]
    except Exception:
        return None


def _dot(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    limit = min(len(left), len(right))
    return sum(left[index] * right[index] for index in range(limit)) / math.sqrt(limit)


def _score_gnn(context: RankerContext) -> float | None:
    if not settings.gnn_model_path:
        return None

    path = settings.gnn_model_path
    if path.endswith((".pkl", ".pickle")):
        payload = _load_pickle_artifact(path)
        if callable(getattr(payload, "score", None)):
            return _normalize_score(float(payload.score(context)))
        if isinstance(payload, dict) and callable(payload.get("score")):
            return _normalize_score(float(payload["score"](context)))
        if not isinstance(payload, dict):
            return None

        user_embedding = _embedding_from_payload(payload, "user", _user_keys(context))
        item_embedding = _embedding_from_payload(payload, "item", _candidate_keys(context))
        if user_embedding is None or item_embedding is None:
            return None

        raw = _dot(user_embedding, item_embedding)
        raw += float(payload.get("global_bias", 0.0))
        return _normalize_score(raw)

    import torch

    model = _load_torchscript_model(path)
    with torch.no_grad():
        tensor = torch.tensor([feature_vector(context.features)], dtype=torch.float32)
        return _normalize_score(float(model(tensor).reshape(-1)[0].item()))


def _requested_models() -> list[str]:
    value = (settings.ranker_model or "heuristic").lower().strip()
    if value in {"", "heuristic"}:
        return []
    if value in {"all", "ensemble"}:
        return ["lightgbm", "lightfm", "gnn"]
    return [part.strip() for part in value.split(",") if part.strip()]


def _ensemble_weights() -> dict[str, float]:
    weights = {"gnn": 0.3, "lightfm": 0.25, "lightgbm": 0.45}
    raw = settings.ranker_ensemble_weights or ""
    for entry in raw.split(","):
        if ":" not in entry:
            continue
        name, value = entry.split(":", 1)
        try:
            weights[name.strip().lower()] = max(0.0, float(value))
        except ValueError:
            continue
    return weights


def optional_ranker_score(context: RankerContext) -> RankerScore | None:
    components: dict[str, float] = {}
    unavailable: list[str] = []

    scorers = {
        "gnn": _score_gnn,
        "lightfm": _score_lightfm,
        "lightgbm": _score_lightgbm,
    }
    for name in _requested_models():
        scorer = scorers.get(name)
        if scorer is None:
            unavailable.append(name)
            continue
        try:
            score = scorer(context)
            if score is None:
                unavailable.append(name)
            else:
                components[name] = score
        except Exception as error:
            print(f"{name} ranker fallback: {error}")
            unavailable.append(name)

    if not components:
        return None

    if len(components) == 1:
        name, score = next(iter(components.items()))
        return RankerScore(
            components=components,
            model=name,
            score=score,
            unavailable=unavailable,
        )

    weights = _ensemble_weights()
    weighted_total = 0.0
    total_weight = 0.0
    for name, score in components.items():
        weight = weights.get(name, 1.0)
        weighted_total += score * weight
        total_weight += weight

    return RankerScore(
        components=components,
        model="ensemble",
        score=weighted_total / max(1e-9, total_weight),
        unavailable=unavailable,
    )
