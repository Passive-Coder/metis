import hashlib
from functools import lru_cache
from typing import Any

import numpy as np

from .config import settings


def normalize(vector: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector)
    if norm == 0:
        return vector
    return vector / norm


def deterministic_hash_embedding(text: str, dimensions: int) -> np.ndarray:
    vector = np.zeros(dimensions, dtype=np.float32)
    payload = text.encode("utf-8", errors="ignore")
    for index in range(dimensions * 2):
        digest = hashlib.sha256(payload + index.to_bytes(4, "little")).digest()
        vector[index % dimensions] += (digest[0] - 127.5) / 127.5
    return normalize(vector)


def problem_context_text(problem: dict[str, Any]) -> str:
    fields = [
        f"title: {problem.get('title', '')}",
        f"difficulty: {problem.get('difficulty', '')}",
        f"statement: {problem.get('statement', '')}",
        f"input: {problem.get('input_contract', '')}",
        f"output: {problem.get('output_contract', '')}",
        f"constraints: {problem.get('constraints', [])}",
        f"metadata: {problem.get('metadata', {})}",
    ]
    return "\n".join(fields)


@lru_cache(maxsize=1)
def statement_encoder():
    try:
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(settings.statement_model_name)
    except Exception:
        if settings.allow_hash_fallback:
            return None
        raise


@lru_cache(maxsize=1)
def code_encoder():
    try:
        import torch
        from transformers import AutoModel, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(settings.code_model_name)
        model = AutoModel.from_pretrained(settings.code_model_name)
        model.eval()
        return tokenizer, model, torch
    except Exception:
        if settings.allow_hash_fallback:
            return None
        raise


def encode_problem_statement(problem: dict[str, Any]) -> list[float]:
    text = problem_context_text(problem)
    model = statement_encoder()
    if model is None:
        return deterministic_hash_embedding(text, 384).tolist()

    vector = np.asarray(model.encode([text], normalize_embeddings=True)[0], dtype=np.float32)
    return normalize(vector).tolist()


def encode_solution_code(code: str) -> list[float]:
    encoder = code_encoder()
    if encoder is None:
        return deterministic_hash_embedding(code, 768).tolist()

    tokenizer, model, torch = encoder
    with torch.no_grad():
        tokens = tokenizer(
            code,
            max_length=512,
            padding=True,
            truncation=True,
            return_tensors="pt",
        )
        output = model(**tokens)
        mask = tokens["attention_mask"].unsqueeze(-1)
        summed = (output.last_hidden_state * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1)
        vector = (summed / counts).cpu().numpy()[0].astype(np.float32)

    return normalize(vector).tolist()


def combine_embeddings(statement_embedding: list[float], code_embedding: list[float]) -> list[float]:
    statement = normalize(np.asarray(statement_embedding, dtype=np.float32))
    code = normalize(np.asarray(code_embedding, dtype=np.float32))
    return normalize(np.concatenate([statement, code])).tolist()
