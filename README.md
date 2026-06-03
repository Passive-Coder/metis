# Metis

Adaptive coding practice with a local Judge0 execution engine, pgvector-backed semantic search, a FastAPI recommendation service, and an optional Neo4j topic graph.

## Important Content Boundary

This project does not scrape or store proprietary LeetCode problem statements, hidden tests, or solution code. Use the ingestion paths only for original, licensed, or otherwise authorized problem data. The included 100 seed problems are original LeetCode-style coding exercises for development.

If a database credential was shared in chat or logs, rotate it before production use and put the replacement in `.env.local`.

## Architecture

- Frontend: TanStack Start, React 19, Monaco editor.
- Execution: self-hosted Judge0 CE on `http://localhost:2360`.
- Database: Postgres with pgvector.
- ML service: FastAPI on `http://localhost:8000`.
- Optional graph store: Neo4j Community on `bolt://localhost:7687`.

The recommender uses separate encoders:

- Problem statement and metadata: `sentence-transformers/all-MiniLM-L6-v2`, 384 dimensions.
- Python reference solution code: `microsoft/codebert-base`, 768 dimensions.
- Combined vector: normalized concatenation, 1152 dimensions, indexed with pgvector HNSW.

## Local Setup

```bash
cp .env.example .env.local
docker compose up -d postgres neo4j judge0-server judge0-worker
npm run db:seed
npm run dev
```

Run the ML server locally:

```bash
cd ml
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or through Docker:

```bash
docker compose up -d ml-server
```

## Database

Apply the schema to any pgvector-enabled Postgres:

```bash
psql "$DATABASE_URL" -f db/init.sql
```

Seed the original authorized samples:

```bash
npm run db:seed
```

After seeding, recompute ML artifacts:

```bash
curl -X POST http://localhost:8000/topics/seed
curl -X POST http://localhost:8000/embeddings/recompute
curl -X POST "http://localhost:8000/clusters/recompute?min_cluster_size=5"
curl -X POST http://localhost:8000/graph/sync-neo4j
```

## Recommendation Pools

The ML server generates candidates from five pools:

- Topic sequence: next prerequisite topic based on the static topic graph.
- Near/far fetch: close and moderately close neighbors from the combined vector space.
- Spaced repetition: due items from the SM-2 review table.
- New pattern: unseen clusters and topics.
- Vector similarity: direct nearest-neighbor candidates from pgvector.

Candidates are merged by problem and ranked from actual practice telemetry: compile count, failed submits, best and recent test-pass rate, pass-rate trend over time, accepted history, topic mastery, due review state, difficulty fit, graph readiness, vector similarity, novelty, and recent recommendation exposure. The app returns three clickable coding-problem suggestions after an accepted submit.

## Judge0

The app calls `POST /api/execute`, which wraps user Python code in a harness that calls `Solution.<functionName>(*args)`. Compile runs visible tests. Submit runs up to 100 tests and shows recommendations only after every test passes.

Judge0 requires privileged containers for sandboxing. Keep it isolated from production application containers and do not enable network access for submissions unless you have a specific security design.

On local macOS/OrbStack setups, the bundled Judge0 CE image can fail inside `isolate` before `/box/script.py` is created because the runtime exposes cgroup v2 only. Set `JUDGE0_LOCAL_PYTHON_FALLBACK=true` for local development to use `scripts/python_case_harness.py` after Judge0 reports a sandbox startup failure. That fallback is not a sandbox and must not be used for untrusted production execution.

## Environment

```bash
DATABASE_URL=postgresql://metis:metis_local_password@localhost:5433/metis
JUDGE0_URL=http://localhost:2360
JUDGE0_PYTHON_LANGUAGE_ID=71
JUDGE0_LOCAL_PYTHON_FALLBACK=false
ML_SERVER_URL=http://localhost:8000
```

## Research Basis

- pgvector supports HNSW and IVFFlat indexes; HNSW is used here for query speed and recall tradeoffs.
- Judge0 CE exposes synchronous submissions with `wait=true`, `stdin`, and `expected_output`.
- Sentence Transformers provides sentence embedding APIs and model selection.
- scikit-learn includes HDBSCAN for density-based clustering when enough items exist.
- RemNote documents an Anki SM-2 style scheduler; this project uses a classic quality 0-5 SM-2 update for coding review state.
- Neo4j is optional here: Postgres stores the canonical topic DAG, and Neo4j is useful when graph traversal, visualization, or graph analytics become product requirements.
