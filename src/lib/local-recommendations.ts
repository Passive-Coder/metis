import { Pool } from "pg";

import {
	type Difficulty,
	getProblem,
	type Problem,
	problems,
} from "#/data/problems";

export type Recommendation = {
	problemId: string;
	title: string;
	difficulty: Difficulty;
	pool: string;
	score: number;
	reason: string;
	topicPath: string[];
	features: Record<string, number>;
	pools: string[];
};

type AttemptStatus =
	| "compiled"
	| "wrong_answer"
	| "runtime_error"
	| "time_limit"
	| "accepted";

type AttemptRow = {
	created_at: Date | string;
	passed_test_count: number;
	problem_id: string | null;
	slug: string;
	status: AttemptStatus;
	total_test_count: number;
};

type ReviewRow = {
	due_at: Date | string;
	ease_factor: number;
	interval_days: number;
	problem_id: string | null;
	slug: string;
};

type EventRow = {
	created_at: Date | string;
	problem_id: string | null;
	slug: string;
};

type ProblemStats = {
	acceptedCount: number;
	attemptCount: number;
	bestPassRate: number;
	compileCount: number;
	daysSinceLast: number;
	failedSubmitCount: number;
	lastPassRate: number;
	passRateTrend: number;
	recentCompileCount: number;
	submitCount: number;
};

type TopicStats = {
	exposure: number;
	mastery: number;
	compileLoad: number;
};

type ReviewState = {
	daysLate: number;
	easeFactor: number;
	intervalDays: number;
};

type UserModel = {
	dbAvailable: boolean;
	eventCounts: Map<string, { count: number; daysSinceLast: number }>;
	problemStats: Map<string, ProblemStats>;
	recentCompilePressure: number;
	recentPassRate: number;
	reviewState: Map<string, ReviewState>;
	solvedDifficultyLevel: number;
	topicStats: Map<string, TopicStats>;
};

type CandidatePool = {
	name: string;
	reason: string;
	strength: number;
};

type Candidate = {
	problem: Problem;
	pools: CandidatePool[];
};

const topicOrder = [
	"Arrays",
	"Strings",
	"Hash maps",
	"Sorting",
	"Stacks",
	"Two pointers",
	"Binary search",
	"Intervals",
	"Sliding window",
	"Graph traversal",
	"Dynamic programming",
];

const problemBySlug = new Map(
	problems.map((problem) => [problem.slug, problem]),
);

let pool: Pool | undefined;

function getPool() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		return undefined;
	}
	pool ??= new Pool({ connectionString: databaseUrl });
	return pool;
}

function clamp(value: number, min = 0, max = 1) {
	return Math.min(max, Math.max(min, value));
}

function sigmoid(value: number) {
	return 1 / (1 + Math.exp(-value));
}

function daysSince(value: Date | string) {
	const createdAt = value instanceof Date ? value : new Date(value);
	return Math.max(0, (Date.now() - createdAt.getTime()) / 86_400_000);
}

function passRate(passed: number, total: number) {
	if (total <= 0) {
		return 0;
	}
	return clamp(passed / total);
}

function difficultyLevel(difficulty: Difficulty) {
	if (difficulty === "Easy") {
		return 0.35;
	}
	if (difficulty === "Medium") {
		return 0.62;
	}
	return 0.86;
}

function labelPool(poolName: string) {
	return poolName
		.split("_")
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

function topicKey(topic: string) {
	return topic.trim().toLowerCase();
}

function allTopics(problem: Problem) {
	return [...problem.prerequisites, ...problem.topics];
}

function overlapScore(left: string[], right: string[]) {
	const leftSet = new Set(left.map(topicKey));
	const rightSet = new Set(right.map(topicKey));
	const overlap = [...leftSet].filter((topic) => rightSet.has(topic)).length;
	return overlap / Math.max(1, new Set([...leftSet, ...rightSet]).size);
}

function problemForRow(row: { problem_id: string | null; slug: string }) {
	if (row.problem_id) {
		const byExternalId = getProblem(row.problem_id);
		if (byExternalId) {
			return byExternalId;
		}
	}
	return problemBySlug.get(row.slug);
}

async function fetchAttemptRows(client: Pool, userExternalId: string) {
	const result = await client.query<AttemptRow>(
		`
		SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
		       problem.slug,
		       attempt.status::text AS status,
		       attempt.passed_test_count,
		       attempt.total_test_count,
		       attempt.created_at
		FROM user_problem_attempts attempt
		JOIN users app_user ON app_user.id = attempt.user_id
		JOIN problems problem ON problem.id = attempt.problem_id
		WHERE app_user.external_id = $1
		ORDER BY attempt.created_at ASC
		LIMIT 5000
		`,
		[userExternalId],
	);
	return result.rows;
}

async function fetchReviewRows(client: Pool, userExternalId: string) {
	const result = await client.query<ReviewRow>(
		`
		SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
		       problem.slug,
		       review.ease_factor,
		       review.interval_days,
		       review.due_at
		FROM user_review_state review
		JOIN users app_user ON app_user.id = review.user_id
		JOIN problems problem ON problem.id = review.problem_id
		WHERE app_user.external_id = $1
		`,
		[userExternalId],
	);
	return result.rows;
}

async function fetchEventRows(client: Pool, userExternalId: string) {
	const result = await client.query<EventRow>(
		`
		SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
		       problem.slug,
		       event.created_at
		FROM recommendation_events event
		JOIN users app_user ON app_user.id = event.user_id
		JOIN problems problem ON problem.id = event.recommended_problem_id
		WHERE app_user.external_id = $1
		ORDER BY event.created_at DESC
		LIMIT 500
		`,
		[userExternalId],
	);
	return result.rows;
}

function summarizeProblemAttempts(rows: AttemptRow[]) {
	const grouped = new Map<string, AttemptRow[]>();
	for (const row of rows) {
		const problem = problemForRow(row);
		if (!problem) {
			continue;
		}
		const existing = grouped.get(problem.id) ?? [];
		existing.push(row);
		grouped.set(problem.id, existing);
	}

	const stats = new Map<string, ProblemStats>();
	for (const [problemId, attempts] of grouped) {
		const rates = attempts.map((attempt) =>
			passRate(attempt.passed_test_count, attempt.total_test_count),
		);
		const recentRates = rates.slice(-5);
		const firstRecent = recentRates[0] ?? 0;
		const lastRecent = recentRates.at(-1) ?? 0;
		const lastAttempt = attempts.at(-1);
		const recentCompileCount = attempts.filter(
			(attempt) =>
				attempt.status === "compiled" && daysSince(attempt.created_at) <= 7,
		).length;

		stats.set(problemId, {
			acceptedCount: attempts.filter((attempt) => attempt.status === "accepted")
				.length,
			attemptCount: attempts.length,
			bestPassRate: Math.max(0, ...rates),
			compileCount: attempts.filter((attempt) => attempt.status === "compiled")
				.length,
			daysSinceLast: lastAttempt ? daysSince(lastAttempt.created_at) : 999,
			failedSubmitCount: attempts.filter(
				(attempt) =>
					attempt.status !== "compiled" && attempt.status !== "accepted",
			).length,
			lastPassRate: rates.at(-1) ?? 0,
			passRateTrend: clamp(lastRecent - firstRecent, -1, 1),
			recentCompileCount,
			submitCount: attempts.filter((attempt) => attempt.status !== "compiled")
				.length,
		});
	}
	return stats;
}

function summarizeTopicAttempts(rows: AttemptRow[]) {
	const accum = new Map<
		string,
		{
			compileLoad: number;
			exposure: number;
			weightedQuality: number;
			weight: number;
		}
	>();

	for (const row of rows) {
		const problem = problemForRow(row);
		if (!problem) {
			continue;
		}
		const rate = passRate(row.passed_test_count, row.total_test_count);
		const quality =
			row.status === "accepted"
				? 1
				: row.status === "compiled"
					? rate * 0.55
					: rate * 0.8;
		const recencyWeight = Math.exp(-daysSince(row.created_at) / 30);

		for (const topic of allTopics(problem)) {
			const key = topicKey(topic);
			const current = accum.get(key) ?? {
				compileLoad: 0,
				exposure: 0,
				weightedQuality: 0,
				weight: 0,
			};
			current.exposure += 1;
			current.weight += recencyWeight;
			current.weightedQuality += quality * recencyWeight;
			if (row.status === "compiled") {
				current.compileLoad += recencyWeight;
			}
			accum.set(key, current);
		}
	}

	const stats = new Map<string, TopicStats>();
	for (const [topic, value] of accum) {
		stats.set(topic, {
			compileLoad: value.compileLoad,
			exposure: value.exposure,
			mastery:
				value.weight > 0 ? clamp(value.weightedQuality / value.weight) : 0,
		});
	}
	return stats;
}

function summarizeReviewState(rows: ReviewRow[]) {
	const state = new Map<string, ReviewState>();
	for (const row of rows) {
		const problem = problemForRow(row);
		if (!problem) {
			continue;
		}
		state.set(problem.id, {
			daysLate: Math.max(0, daysSince(row.due_at)),
			easeFactor: Number(row.ease_factor) || 2.3,
			intervalDays: Number(row.interval_days) || 0,
		});
	}
	return state;
}

function summarizeRecommendationEvents(rows: EventRow[]) {
	const state = new Map<string, { count: number; daysSinceLast: number }>();
	for (const row of rows) {
		const problem = problemForRow(row);
		if (!problem) {
			continue;
		}
		const current = state.get(problem.id) ?? {
			count: 0,
			daysSinceLast: 999,
		};
		current.count += 1;
		current.daysSinceLast = Math.min(
			current.daysSinceLast,
			daysSince(row.created_at),
		);
		state.set(problem.id, current);
	}
	return state;
}

function solvedDifficultyLevel(problemStats: Map<string, ProblemStats>) {
	let weighted = 0;
	let weight = 0;
	for (const [problemId, stats] of problemStats) {
		const problem = getProblem(problemId);
		if (!problem || stats.acceptedCount === 0) {
			continue;
		}
		const recency = Math.exp(-stats.daysSinceLast / 45);
		weighted += difficultyLevel(problem.difficulty) * recency;
		weight += recency;
	}
	return weight > 0 ? weighted / weight : 0.35;
}

async function buildUserModel(userExternalId: string): Promise<UserModel> {
	const client = getPool();
	if (!client) {
		return emptyUserModel(false);
	}

	try {
		const [attemptRows, reviewRows, eventRows] = await Promise.all([
			fetchAttemptRows(client, userExternalId),
			fetchReviewRows(client, userExternalId),
			fetchEventRows(client, userExternalId).catch(() => []),
		]);
		const problemStats = summarizeProblemAttempts(attemptRows);
		const topicStats = summarizeTopicAttempts(attemptRows);
		const recentAttempts = attemptRows.filter(
			(attempt) => daysSince(attempt.created_at) <= 7,
		);
		const recentCompilePressure =
			recentAttempts.filter((attempt) => attempt.status === "compiled").length /
			Math.max(1, recentAttempts.length);
		const recentPassRate =
			recentAttempts.reduce(
				(total, attempt) =>
					total + passRate(attempt.passed_test_count, attempt.total_test_count),
				0,
			) / Math.max(1, recentAttempts.length);

		return {
			dbAvailable: true,
			eventCounts: summarizeRecommendationEvents(eventRows),
			problemStats,
			recentCompilePressure,
			recentPassRate,
			reviewState: summarizeReviewState(reviewRows),
			solvedDifficultyLevel: solvedDifficultyLevel(problemStats),
			topicStats,
		};
	} catch (error: unknown) {
		console.warn(
			error instanceof Error
				? error.message
				: "Unable to load recommendation telemetry.",
		);
		return emptyUserModel(false);
	}
}

function emptyUserModel(dbAvailable: boolean): UserModel {
	return {
		dbAvailable,
		eventCounts: new Map(),
		problemStats: new Map(),
		recentCompilePressure: 0,
		recentPassRate: 0,
		reviewState: new Map(),
		solvedDifficultyLevel: 0.35,
		topicStats: new Map(),
	};
}

function addCandidate(
	candidates: Map<string, Candidate>,
	problem: Problem,
	poolName: string,
	strength: number,
	reason: string,
) {
	const existing = candidates.get(problem.id) ?? { problem, pools: [] };
	existing.pools.push({
		name: poolName,
		reason,
		strength: clamp(strength),
	});
	candidates.set(problem.id, existing);
}

function nextTopicCandidates(anchor: Problem | undefined, model: UserModel) {
	const practicedIndexes = [...model.topicStats.entries()]
		.filter(([, stats]) => stats.mastery >= 0.58)
		.map(([topic]) =>
			topicOrder.findIndex((candidate) => topicKey(candidate) === topic),
		)
		.filter((index) => index >= 0);
	const anchorIndexes =
		anchor?.prerequisites
			.map((topic) => topicOrder.indexOf(topic))
			.filter((index) => index >= 0) ?? [];
	const maxIndex = Math.max(0, ...practicedIndexes, ...anchorIndexes);
	return topicOrder.slice(maxIndex + 1, maxIndex + 3);
}

function generateCandidates(anchor: Problem | undefined, model: UserModel) {
	const candidates = new Map<string, Candidate>();
	const anchorTopics = anchor ? allTopics(anchor) : [];
	const nextTopics = nextTopicCandidates(anchor, model);

	for (const problem of problems) {
		if (problem.id === anchor?.id) {
			continue;
		}

		const stats = model.problemStats.get(problem.id);
		const accepted = (stats?.acceptedCount ?? 0) > 0;
		const combinedTopics = allTopics(problem);
		const shared = anchor ? overlapScore(anchorTopics, combinedTopics) : 0;
		const due = model.reviewState.get(problem.id);

		if (
			nextTopics.some((topic) =>
				combinedTopics.some(
					(candidateTopic) => topicKey(candidateTopic) === topicKey(topic),
				),
			)
		) {
			addCandidate(
				candidates,
				problem,
				"topic_sequence",
				0.65 + Math.min(0.2, nextTopics.length * 0.04),
				`Advances into ${nextTopics.join(" or ")} after the current path.`,
			);
		}

		if (anchor && shared >= 0.32 && !accepted) {
			addCandidate(
				candidates,
				problem,
				"near_fetch",
				0.52 + shared * 0.42,
				"Keeps the solved pattern close enough for transfer practice.",
			);
		} else if (anchor && shared >= 0.12 && !accepted) {
			addCandidate(
				candidates,
				problem,
				"far_fetch",
				0.38 + shared * 0.5,
				"Stretches the same idea into a less familiar shape.",
			);
		}

		if (due && due.daysLate >= 0 && (accepted || due.daysLate > 0.2)) {
			addCandidate(
				candidates,
				problem,
				"spaced_repetition",
				0.58 + Math.min(0.28, due.daysLate * 0.04),
				"Due under the review schedule from your prior submissions.",
			);
		}

		if (stats && !accepted && stats.attemptCount > 0) {
			addCandidate(
				candidates,
				problem,
				"remediation",
				0.5 +
					Math.min(
						0.35,
						stats.compileCount * 0.04 +
							stats.failedSubmitCount * 0.08 +
							(1 - stats.bestPassRate) * 0.2,
					),
				`You have ${stats.compileCount} compiles and a ${Math.round(
					stats.bestPassRate * 100,
				)}% best pass rate here.`,
			);
		}

		const weakTopic = combinedTopics.find((topic) => {
			const topicStats = model.topicStats.get(topicKey(topic));
			return (
				topicStats && topicStats.exposure >= 2 && topicStats.mastery < 0.55
			);
		});
		if (weakTopic && !accepted) {
			const topicStats = model.topicStats.get(topicKey(weakTopic));
			addCandidate(
				candidates,
				problem,
				"weak_topic",
				0.5 + (1 - (topicStats?.mastery ?? 0.5)) * 0.32,
				`Targets ${weakTopic}, where your recent pass history is weaker.`,
			);
		}

		if (!stats && !accepted) {
			const seenTopicCount = combinedTopics.filter((topic) =>
				model.topicStats.has(topicKey(topic)),
			).length;
			addCandidate(
				candidates,
				problem,
				"new_pattern",
				seenTopicCount === 0 ? 0.58 : 0.43,
				seenTopicCount === 0
					? "Introduces a topic family you have not attempted yet."
					: "Adds a fresh problem without repeating a solved item.",
			);
		}
	}

	return [...candidates.values()];
}

function prereqReadiness(problem: Problem, model: UserModel) {
	if (problem.prerequisites.length === 0) {
		return 0.72;
	}
	const values = problem.prerequisites.map((topic) => {
		const stats = model.topicStats.get(topicKey(topic));
		if (!stats) {
			return topic === "Arrays" || topic === "Strings" ? 0.55 : 0.42;
		}
		const confidence = clamp(stats.exposure / 5);
		return stats.mastery * confidence + 0.45 * (1 - confidence);
	});
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function weakTopicFit(problem: Problem, model: UserModel) {
	let value = 0;
	for (const topic of allTopics(problem)) {
		const stats = model.topicStats.get(topicKey(topic));
		if (stats && stats.exposure > 0) {
			value = Math.max(value, (1 - stats.mastery) * clamp(stats.exposure / 4));
		}
	}
	return value;
}

function effortFit(problem: Problem, model: UserModel, readiness: number) {
	const target = difficultyLevel(problem.difficulty);
	const userLevel = model.solvedDifficultyLevel;
	const gap = Math.abs(target - (userLevel + 0.08));
	const baseFit = clamp(1 - gap / 0.65);
	const fatigue =
		model.recentCompilePressure > 0.55 && model.recentPassRate < 0.55
			? target * 0.35
			: 0;
	return clamp(baseFit * 0.72 + readiness * 0.28 - fatigue);
}

function independentPoolEvidence(pools: CandidatePool[]) {
	return (
		1 - pools.reduce((miss, poolItem) => miss * (1 - poolItem.strength), 1)
	);
}

function rankCandidate(
	candidate: Candidate,
	anchor: Problem | undefined,
	model: UserModel,
) {
	const { problem } = candidate;
	const stats = model.problemStats.get(problem.id);
	const eventStats = model.eventCounts.get(problem.id);
	const review = model.reviewState.get(problem.id);
	const readiness = prereqReadiness(problem, model);
	const difficultyFit = effortFit(problem, model, readiness);
	const anchorAffinity = anchor
		? overlapScore(allTopics(anchor), allTopics(problem))
		: 0;
	const weakFit = weakTopicFit(problem, model);
	const novelty = stats ? 0.12 : 0.74;
	const retryValue =
		stats && stats.acceptedCount === 0
			? clamp(
					stats.failedSubmitCount * 0.15 +
						stats.compileCount * 0.05 +
						(1 - stats.bestPassRate) * 0.36 +
						Math.max(0, stats.passRateTrend) * 0.18,
				)
			: 0;
	const dueValue = review ? clamp(0.46 + review.daysLate * 0.08) : 0;
	const poolEvidence = independentPoolEvidence(candidate.pools);
	const learningValue = Math.max(
		anchorAffinity * 0.75,
		weakFit * 0.78,
		novelty * 0.52,
		retryValue,
	);
	const difficultyRequirement =
		problem.difficulty === "Hard"
			? 0.68
			: problem.difficulty === "Medium"
				? 0.5
				: 0.32;
	const readinessGate = sigmoid((readiness - difficultyRequirement) * 7);
	const solvedRecentlyPenalty =
		stats?.acceptedCount && stats.daysSinceLast < 3
			? (3 - stats.daysSinceLast) * 0.08
			: 0;
	const repeatedRecommendationPenalty =
		eventStats && eventStats.daysSinceLast < 2
			? Math.min(
					0.2,
					eventStats.count * 0.04 + (2 - eventStats.daysSinceLast) * 0.04,
				)
			: 0;

	const rawScore =
		0.1 +
		poolEvidence * 0.28 +
		learningValue * 0.24 +
		difficultyFit * 0.18 +
		readiness * 0.1 +
		dueValue * 0.13 +
		Math.max(0, stats?.passRateTrend ?? 0) * 0.07 -
		solvedRecentlyPenalty -
		repeatedRecommendationPenalty;
	const score = clamp(rawScore * (0.72 + readinessGate * 0.28));

	const bestPool = [...candidate.pools].sort(
		(left, right) => right.strength - left.strength,
	)[0];
	const reason =
		bestPool?.name === "weak_topic" ||
		bestPool?.name === "remediation" ||
		bestPool?.name === "spaced_repetition"
			? bestPool.reason
			: `${bestPool?.reason ?? "Ranked from the coding pool."} Readiness ${Math.round(
					readiness * 100,
				)}%, difficulty fit ${Math.round(difficultyFit * 100)}%.`;

	return {
		difficulty: problem.difficulty,
		features: {
			anchorAffinity: Number(anchorAffinity.toFixed(4)),
			difficultyFit: Number(difficultyFit.toFixed(4)),
			dueValue: Number(dueValue.toFixed(4)),
			learningValue: Number(learningValue.toFixed(4)),
			novelty: Number(novelty.toFixed(4)),
			poolEvidence: Number(poolEvidence.toFixed(4)),
			readiness: Number(readiness.toFixed(4)),
			readinessGate: Number(readinessGate.toFixed(4)),
			retryValue: Number(retryValue.toFixed(4)),
			weakTopicFit: Number(weakFit.toFixed(4)),
		},
		pool: labelPool(bestPool?.name ?? "ranked_pool"),
		pools: candidate.pools.map((poolItem) => poolItem.name),
		problemId: problem.id,
		reason,
		score,
		title: problem.title,
		topicPath: problem.prerequisites,
	};
}

export async function localRecommendations(
	problemId: string,
	userExternalId = "demo-user",
	limit = 3,
): Promise<Recommendation[]> {
	const anchor = getProblem(problemId);
	const model = await buildUserModel(userExternalId);
	const candidates = generateCandidates(anchor, model)
		.map((candidate) => rankCandidate(candidate, anchor, model))
		.sort((left, right) => {
			if (right.score !== left.score) {
				return right.score - left.score;
			}
			return left.title.localeCompare(right.title);
		});

	return candidates.slice(0, limit).map((candidate) => ({
		...candidate,
		score: Number(candidate.score.toFixed(4)),
	}));
}

export async function recordRecommendationEvents({
	anchorProblemId,
	recommendations,
	userExternalId,
}: {
	anchorProblemId: string;
	recommendations: Array<{
		features?: Record<string, unknown>;
		pool: string;
		problemId: string;
		score: number;
	}>;
	userExternalId: string;
}) {
	const client = getPool();
	if (!client || recommendations.length === 0) {
		return;
	}

	try {
		const user = await client.query<{ id: string }>(
			`
			INSERT INTO users (external_id)
			VALUES ($1)
			ON CONFLICT (external_id) DO UPDATE
			SET external_id = EXCLUDED.external_id
			RETURNING id
			`,
			[userExternalId],
		);
		const userId = user.rows[0]?.id;
		if (!userId) {
			return;
		}

		const anchor = anchorProblemId
			? await client.query<{ id: string }>(
					`
					SELECT id
					FROM problems
					WHERE external_id = $1 OR slug = $1 OR id::text = $1
					LIMIT 1
					`,
					[anchorProblemId],
				)
			: null;
		const anchorUuid = anchor?.rows[0]?.id ?? null;

		for (const recommendation of recommendations) {
			const problem = await client.query<{ id: string }>(
				`
				SELECT id
				FROM problems
				WHERE external_id = $1 OR slug = $1 OR id::text = $1
				LIMIT 1
				`,
				[recommendation.problemId],
			);
			const recommendedProblemId = problem.rows[0]?.id;
			if (!recommendedProblemId) {
				continue;
			}
			await client.query(
				`
				INSERT INTO recommendation_events (
					user_id,
					anchor_problem_id,
					recommended_problem_id,
					pool_name,
					score,
					features
				)
				VALUES ($1, $2, $3, $4, $5, $6::jsonb)
				`,
				[
					userId,
					anchorUuid,
					recommendedProblemId,
					recommendation.pool,
					recommendation.score,
					JSON.stringify(recommendation.features ?? {}),
				],
			);
		}
	} catch (error: unknown) {
		console.warn(
			error instanceof Error
				? error.message
				: "Unable to record recommendation events.",
		);
	}
}
