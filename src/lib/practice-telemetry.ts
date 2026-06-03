import { Pool } from "pg";

import type { Problem } from "#/data/problems";
import { extractCodeMetrics, sourceHash } from "#/lib/code-features";

type AttemptStatus =
	| "compiled"
	| "wrong_answer"
	| "runtime_error"
	| "time_limit"
	| "accepted";

type ExecutionCaseResult = {
	passed: boolean;
	status: string;
	time: string | null;
	memory: number | null;
};

type ExecutionSummary = {
	accepted: boolean;
	engine: "judge0" | "local-python";
	message?: string;
	mode: "compile" | "submit";
	ok: boolean;
	passed: number;
	results: ExecutionCaseResult[];
	total: number;
};

type EditorEventType = "open" | "heartbeat" | "compile" | "submit" | "close";

type EditorSessionMetrics = {
	activeMs?: number;
	charsAdded?: number;
	charsDeleted?: number;
	deleteCount?: number;
	editCount?: number;
	focusMs?: number;
	idleMs?: number;
	keystrokeCount?: number;
	maxPauseMs?: number;
	netChars?: number;
	pasteCount?: number;
	pauseCount?: number;
	typingBursts?: number;
};

let pool: Pool | undefined;

function getPool() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		return undefined;
	}
	pool ??= new Pool({ connectionString: databaseUrl });
	return pool;
}

async function ensureUser(client: Pool, userExternalId: string) {
	const result = await client.query<{ id: string }>(
		`
		INSERT INTO users (external_id)
		VALUES ($1)
		ON CONFLICT (external_id) DO UPDATE
		SET external_id = EXCLUDED.external_id
		RETURNING id
		`,
		[userExternalId],
	);
	return result.rows[0]?.id;
}

async function resolveProblemId(client: Pool, problem: Problem) {
	const result = await client.query<{ id: string }>(
		`
		SELECT id
		FROM problems
		WHERE external_id = $1
		   OR slug = $2
		   OR id::text = $1
		LIMIT 1
		`,
		[problem.id, problem.slug],
	);
	return result.rows[0]?.id;
}

function runtimeMs(results: ExecutionCaseResult[]) {
	const values = results
		.map((result) => Number(result.time))
		.filter((value) => Number.isFinite(value));
	if (values.length === 0) {
		return null;
	}
	return Math.round(Math.max(...values) * 1000);
}

function memoryKb(results: ExecutionCaseResult[]) {
	const values = results
		.map((result) => result.memory)
		.filter((value): value is number => typeof value === "number");
	if (values.length === 0) {
		return null;
	}
	return Math.max(...values);
}

function numberMetric(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, Math.round(value))
		: 0;
}

function attemptStatus(execution: ExecutionSummary): AttemptStatus {
	if (execution.mode === "compile") {
		return "compiled";
	}
	if (execution.accepted) {
		return "accepted";
	}

	const statusText = execution.results
		.map((result) => result.status.toLowerCase())
		.join(" ");
	if (statusText.includes("time limit")) {
		return "time_limit";
	}
	if (
		statusText.includes("runtime") ||
		statusText.includes("exception") ||
		statusText.includes("segmentation")
	) {
		return "runtime_error";
	}
	return "wrong_answer";
}

function qualityFromExecution(execution: ExecutionSummary) {
	if (execution.accepted) {
		return 5;
	}
	if (execution.total <= 0) {
		return 0;
	}

	const passRate = execution.passed / execution.total;
	if (execution.mode === "compile") {
		if (passRate === 1) {
			return 3;
		}
		if (passRate >= 0.5) {
			return 2;
		}
		return passRate > 0 ? 1 : 0;
	}

	if (passRate >= 0.8) {
		return 4;
	}
	if (passRate >= 0.5) {
		return 3;
	}
	return passRate > 0 ? 2 : 1;
}

function nextReviewState(
	state: {
		ease_factor: number;
		interval_days: number;
		lapses: number;
		repetitions: number;
	} | null,
	quality: number,
) {
	const current = state ?? {
		ease_factor: 2.3,
		interval_days: 0,
		lapses: 0,
		repetitions: 0,
	};
	const easeFactor = Math.max(
		1.3,
		current.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
	);

	if (quality < 3) {
		return {
			easeFactor,
			intervalDays: 1,
			lapses: current.lapses + 1,
			repetitions: 0,
		};
	}

	const repetitions = current.repetitions + 1;
	let intervalDays = 1;
	if (repetitions === 2) {
		intervalDays = 6;
	} else if (repetitions > 2) {
		intervalDays = Math.max(1, Math.round(current.interval_days * easeFactor));
	}

	return {
		easeFactor,
		intervalDays,
		lapses: current.lapses,
		repetitions,
	};
}

async function updateTopicState(
	client: Pool,
	userId: string,
	problemId: string,
	execution: ExecutionSummary,
) {
	const passRate = execution.total > 0 ? execution.passed / execution.total : 0;
	const qualityRatio = execution.accepted
		? 1
		: Math.max(0.05, passRate * (execution.mode === "compile" ? 0.55 : 0.8));
	const learningRate = execution.accepted ? 0.28 : 0.16;

	await client.query(
		`
		INSERT INTO user_topic_state (
			user_id,
			topic_id,
			mastery,
			exposure_count,
			last_practiced_at
		)
		SELECT $1, problem_topic.topic_id, LEAST(1.0, $3::double precision * problem_topic.weight), 1, now()
		FROM problem_topics problem_topic
		WHERE problem_topic.problem_id = $2
		ON CONFLICT (user_id, topic_id) DO UPDATE
		SET mastery = LEAST(
				1.0,
				GREATEST(
					0.0,
					user_topic_state.mastery * (1.0 - $4::double precision)
						+ EXCLUDED.mastery * $4::double precision
				)
			),
			exposure_count = user_topic_state.exposure_count + 1,
			last_practiced_at = now()
		`,
		[userId, problemId, qualityRatio, learningRate],
	);
}

async function updateReviewState(
	client: Pool,
	userId: string,
	problemId: string,
	execution: ExecutionSummary,
) {
	if (execution.mode !== "submit") {
		return;
	}

	const quality = qualityFromExecution(execution);
	const existing = await client.query<{
		ease_factor: number;
		interval_days: number;
		lapses: number;
		repetitions: number;
	}>(
		`
		SELECT ease_factor, interval_days, repetitions, lapses
		FROM user_review_state
		WHERE user_id = $1 AND problem_id = $2
		`,
		[userId, problemId],
	);
	const update = nextReviewState(existing.rows[0] ?? null, quality);

	await client.query(
		`
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
		VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			now() + ($4::text || ' days')::interval,
			$7,
			now()
		)
		ON CONFLICT (user_id, problem_id) DO UPDATE
		SET ease_factor = EXCLUDED.ease_factor,
			interval_days = EXCLUDED.interval_days,
			repetitions = EXCLUDED.repetitions,
			lapses = EXCLUDED.lapses,
			due_at = EXCLUDED.due_at,
			last_quality = EXCLUDED.last_quality,
			updated_at = now()
		`,
		[
			userId,
			problemId,
			update.easeFactor,
			update.intervalDays,
			update.repetitions,
			update.lapses,
			quality,
		],
	);
}

export async function recordPracticeAttempt({
	execution,
	problem,
	sourceCode,
	userExternalId,
}: {
	execution: ExecutionSummary;
	problem: Problem;
	sourceCode: string;
	userExternalId: string;
}) {
	const client = getPool();
	if (!client) {
		return { recorded: false, reason: "DATABASE_URL is not configured." };
	}

	const userId = await ensureUser(client, userExternalId);
	const problemId = await resolveProblemId(client, problem);
	if (!userId || !problemId) {
		return { recorded: false, reason: "Seeded problem row was not found." };
	}

	await client.query(
		`
		INSERT INTO user_problem_attempts (
			user_id,
			problem_id,
			status,
			source_code,
			passed_test_count,
			total_test_count,
			runtime_ms,
			memory_kb,
			judge_payload
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
		`,
		[
			userId,
			problemId,
			attemptStatus(execution),
			sourceCode,
			execution.passed,
			execution.total,
			runtimeMs(execution.results),
			memoryKb(execution.results),
			JSON.stringify({
				accepted: execution.accepted,
				engine: execution.engine,
				message: execution.message ?? null,
				mode: execution.mode,
				results: execution.results,
			}),
		],
	);

	await updateTopicState(client, userId, problemId, execution);
	await updateReviewState(client, userId, problemId, execution);

	return { recorded: true };
}

export async function recordEditorEvent({
	eventType,
	metrics,
	problemId: externalProblemId,
	sessionId,
	sourceCode,
	userExternalId,
}: {
	eventType: EditorEventType;
	metrics: EditorSessionMetrics;
	problemId: string;
	sessionId: string;
	sourceCode?: string;
	userExternalId: string;
}) {
	const client = getPool();
	if (!client) {
		return { recorded: false, reason: "DATABASE_URL is not configured." };
	}

	const userId = await ensureUser(client, userExternalId);
	const problemResult = await client.query<{ id: string }>(
		`
		SELECT id
		FROM problems
		WHERE external_id = $1
		   OR slug = $1
		   OR id::text = $1
		LIMIT 1
		`,
		[externalProblemId],
	);
	const problemId = problemResult.rows[0]?.id;
	if (!userId || !problemId) {
		return { recorded: false, reason: "Seeded problem row was not found." };
	}

	const compileIncrement = eventType === "compile" ? 1 : 0;
	const submitIncrement = eventType === "submit" ? 1 : 0;
	const closedAt = eventType === "close" ? "now()" : "NULL";

	await client.query(
		`
		INSERT INTO editor_sessions (
			id,
			user_id,
			problem_id,
			active_ms,
			idle_ms,
			focus_ms,
			max_pause_ms,
			pause_count,
			typing_bursts,
			keystroke_count,
			edit_count,
			paste_count,
			delete_count,
			chars_added,
			chars_deleted,
			net_chars,
			compile_count,
			submit_count,
			client_metrics,
			last_event_at,
			closed_at,
			updated_at
		)
		VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12,
			$13,
			$14,
			$15,
			$16,
			$17,
			$18,
			$19::jsonb,
			now(),
			${closedAt},
			now()
		)
		ON CONFLICT (id) DO UPDATE
		SET active_ms = GREATEST(editor_sessions.active_ms, EXCLUDED.active_ms),
			idle_ms = GREATEST(editor_sessions.idle_ms, EXCLUDED.idle_ms),
			focus_ms = GREATEST(editor_sessions.focus_ms, EXCLUDED.focus_ms),
			max_pause_ms = GREATEST(editor_sessions.max_pause_ms, EXCLUDED.max_pause_ms),
			pause_count = GREATEST(editor_sessions.pause_count, EXCLUDED.pause_count),
			typing_bursts = GREATEST(editor_sessions.typing_bursts, EXCLUDED.typing_bursts),
			keystroke_count = GREATEST(editor_sessions.keystroke_count, EXCLUDED.keystroke_count),
			edit_count = GREATEST(editor_sessions.edit_count, EXCLUDED.edit_count),
			paste_count = GREATEST(editor_sessions.paste_count, EXCLUDED.paste_count),
			delete_count = GREATEST(editor_sessions.delete_count, EXCLUDED.delete_count),
			chars_added = GREATEST(editor_sessions.chars_added, EXCLUDED.chars_added),
			chars_deleted = GREATEST(editor_sessions.chars_deleted, EXCLUDED.chars_deleted),
			net_chars = EXCLUDED.net_chars,
			compile_count = editor_sessions.compile_count + $17,
			submit_count = editor_sessions.submit_count + $18,
			client_metrics = editor_sessions.client_metrics || EXCLUDED.client_metrics,
			last_event_at = now(),
			closed_at = COALESCE(EXCLUDED.closed_at, editor_sessions.closed_at),
			updated_at = now()
		`,
		[
			sessionId,
			userId,
			problemId,
			numberMetric(metrics.activeMs),
			numberMetric(metrics.idleMs),
			numberMetric(metrics.focusMs),
			numberMetric(metrics.maxPauseMs),
			numberMetric(metrics.pauseCount),
			numberMetric(metrics.typingBursts),
			numberMetric(metrics.keystrokeCount),
			numberMetric(metrics.editCount),
			numberMetric(metrics.pasteCount),
			numberMetric(metrics.deleteCount),
			numberMetric(metrics.charsAdded),
			numberMetric(metrics.charsDeleted),
			numberMetric(metrics.netChars),
			compileIncrement,
			submitIncrement,
			JSON.stringify({
				eventType,
				metrics,
				receivedAt: new Date().toISOString(),
			}),
		],
	);

	if (sourceCode && eventType !== "heartbeat") {
		await client.query(
			`
			INSERT INTO editor_code_snapshots (
				session_id,
				user_id,
				problem_id,
				event_type,
				source_hash,
				source_code,
				code_metrics
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
			`,
			[
				sessionId,
				userId,
				problemId,
				eventType,
				sourceHash(sourceCode),
				sourceCode,
				JSON.stringify(extractCodeMetrics(sourceCode)),
			],
		);
	}

	return { recorded: true };
}
