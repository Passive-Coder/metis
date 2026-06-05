# Recommendation Ranking Implementation

## Editor Behavior Features

Editor telemetry starts when `beginEditorSession()` opens the Monaco editor. The
client sends `open`, `heartbeat`, `compile`, `submit`, and `close` events to
`/api/editor-events`.

Tracked raw counters:

- elapsed, active, idle, and focus time
- first edit, first compile, and first submit latency
- compile and submit request counts
- average compile and submit interval
- edit, keystroke, paste, delete, and typing burst counts
- chars added, chars deleted, net chars, and max pause duration

Derived model features:

- typing speed in chars per minute
- edits and keystrokes per minute
- pause and typing-burst density
- paste and delete ratio
- chars per edit
- churn ratio: `(chars_added + chars_deleted) / max(1, abs(net_chars))`
- compile and submit rate per hour

The structured columns in `editor_sessions` keep the core counters. Newer
derived features are persisted in `editor_sessions.client_metrics` and are read
by both the FastAPI recommender and the TypeScript local fallback.

## AST And Tree-sitter Features

The ML service extracts Python code features in `ml/app/code_features.py` using
both Python `ast` and Tree-sitter when available.

The system intentionally stores two hashes:

- `ast_shape_hash`: normalized syntax shape with names and constants removed
- `semantic_signature_hash`: calls, imports, mutations, comparisons, operators,
  literal profile, algorithm hints, and Tree-sitter shape

This avoids treating syntax shape as algorithm identity. Two solutions can have
the same high-level AST shape but implement different algorithms. The ranker can
now use semantic disambiguation features:

- active algorithm signal count
- data structure signal count
- call entropy
- operator entropy
- membership tests and subscript count
- Tree-sitter parse error count
- semantic collision risk

The browser-side snapshot extractor mirrors the same idea with lightweight
regex features until the ML service recomputes richer AST features.

## Ranking Models

The heuristic ranker remains the default. Learned rankers are opt-in through
environment variables and local artifacts:

```bash
RANKER_MODEL=lightgbm
LIGHTGBM_MODEL_PATH=/path/to/lightgbm.txt

RANKER_MODEL=lightfm
LIGHTFM_MODEL_PATH=/path/to/lightfm.pkl

RANKER_MODEL=gnn
GNN_MODEL_PATH=/path/to/gnn.pkl

RANKER_MODEL=ensemble
RANKER_ENSEMBLE_WEIGHTS=lightgbm:0.45,lightfm:0.25,gnn:0.30
RANKER_MODEL_BLEND=0.65
```

LightGBM receives the dense feature vector in the order returned by
`GET /ranker/features`.

LightFM artifacts should be a pickle payload with:

- `model`: trained `LightFM` instance
- `user_id_map`: map from app user id or external id to LightFM internal id
- `item_id_map`: map from problem uuid or external problem id to internal id
- optional `user_features` and `item_features` sparse matrices

GNN artifacts can be either:

- a pickle payload with `user_embeddings`, `item_embeddings`, and id maps
- a TorchScript scoring head that accepts the same dense feature vector

The recommender blends learned scores with the heuristic score:

```text
final_score = heuristic_score * (1 - RANKER_MODEL_BLEND)
            + learned_score * RANKER_MODEL_BLEND
```

If a configured artifact is missing or fails to load, the recommender logs a
fallback message and uses the heuristic ranking path.
