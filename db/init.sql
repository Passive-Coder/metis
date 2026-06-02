CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'problem_difficulty') THEN
		CREATE TYPE problem_difficulty AS ENUM ('Easy', 'Medium', 'Hard');
	END IF;

	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attempt_status') THEN
		CREATE TYPE attempt_status AS ENUM (
			'compiled',
			'wrong_answer',
			'runtime_error',
			'time_limit',
			'accepted'
		);
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS problems (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	external_id TEXT UNIQUE,
	slug TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	difficulty problem_difficulty NOT NULL,
	statement TEXT NOT NULL,
	input_contract TEXT NOT NULL,
	output_contract TEXT NOT NULL,
	constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	source_name TEXT NOT NULL DEFAULT 'authorized_seed',
	source_url TEXT,
	source_license TEXT NOT NULL DEFAULT 'original_or_authorized',
	statement_hash TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_test_cases (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
	ordinal INTEGER NOT NULL,
	name TEXT NOT NULL,
	args JSONB NOT NULL,
	expected JSONB NOT NULL,
	is_hidden BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (problem_id, ordinal)
);

CREATE TABLE IF NOT EXISTS problem_solutions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
	language TEXT NOT NULL,
	code TEXT NOT NULL,
	code_hash TEXT NOT NULL,
	is_reference BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (problem_id, language, code_hash)
);

CREATE TABLE IF NOT EXISTS problem_embeddings (
	problem_id UUID PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
	statement_embedding vector(384) NOT NULL,
	code_embedding vector(768) NOT NULL,
	combined_embedding vector(1152) NOT NULL,
	encoder_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	cluster_id INTEGER,
	cluster_probability DOUBLE PRECISION,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topics (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	generated_by TEXT NOT NULL DEFAULT 'static_seed',
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_edges (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	from_topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	to_topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	edge_type TEXT NOT NULL DEFAULT 'prerequisite',
	weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
	is_static BOOLEAN NOT NULL DEFAULT true,
	rationale TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (from_topic_id, to_topic_id, edge_type)
);

CREATE TABLE IF NOT EXISTS problem_topics (
	problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
	topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	source TEXT NOT NULL DEFAULT 'metadata_or_cluster',
	weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
	PRIMARY KEY (problem_id, topic_id)
);

CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	external_id TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_problem_attempts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
	status attempt_status NOT NULL,
	source_code TEXT NOT NULL,
	passed_test_count INTEGER NOT NULL DEFAULT 0,
	total_test_count INTEGER NOT NULL DEFAULT 0,
	runtime_ms INTEGER,
	memory_kb INTEGER,
	judge_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_topic_state (
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
	mastery DOUBLE PRECISION NOT NULL DEFAULT 0,
	exposure_count INTEGER NOT NULL DEFAULT 0,
	last_practiced_at TIMESTAMPTZ,
	PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS user_review_state (
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
	ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.3,
	interval_days INTEGER NOT NULL DEFAULT 0,
	repetitions INTEGER NOT NULL DEFAULT 0,
	lapses INTEGER NOT NULL DEFAULT 0,
	due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	last_quality INTEGER,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, problem_id)
);

CREATE TABLE IF NOT EXISTS recommendation_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	anchor_problem_id UUID REFERENCES problems(id) ON DELETE SET NULL,
	recommended_problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
	pool_name TEXT NOT NULL,
	score DOUBLE PRECISION NOT NULL,
	features JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS problem_embeddings_statement_hnsw
	ON problem_embeddings USING hnsw (statement_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS problem_embeddings_code_hnsw
	ON problem_embeddings USING hnsw (code_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS problem_embeddings_combined_hnsw
	ON problem_embeddings USING hnsw (combined_embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS problem_test_cases_problem_id_idx
	ON problem_test_cases (problem_id);

CREATE INDEX IF NOT EXISTS user_problem_attempts_user_problem_idx
	ON user_problem_attempts (user_id, problem_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_review_state_due_idx
	ON user_review_state (user_id, due_at);

CREATE INDEX IF NOT EXISTS topic_edges_from_idx
	ON topic_edges (from_topic_id);
