import {
	boolean,
	customType,
	doublePrecision,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

const vector = customType<{
	config: { dimensions: number };
	data: number[];
	driverData: string;
}>({
	dataType(config) {
		return `vector(${config?.dimensions ?? 1536})`;
	},
	toDriver(value) {
		return `[${value.join(",")}]`;
	},
});

export const problemDifficulty = pgEnum("problem_difficulty", [
	"Easy",
	"Medium",
	"Hard",
]);

export const attemptStatus = pgEnum("attempt_status", [
	"compiled",
	"wrong_answer",
	"runtime_error",
	"time_limit",
	"accepted",
]);

export const problems = pgTable(
	"problems",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		externalId: text("external_id"),
		slug: text("slug").notNull().unique(),
		title: text("title").notNull(),
		difficulty: problemDifficulty("difficulty").notNull(),
		statement: text("statement").notNull(),
		inputContract: text("input_contract").notNull(),
		outputContract: text("output_contract").notNull(),
		constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		sourceName: text("source_name").notNull().default("authorized_seed"),
		sourceUrl: text("source_url"),
		sourceLicense: text("source_license")
			.notNull()
			.default("original_or_authorized"),
		statementHash: text("statement_hash").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("problems_statement_hash_idx").on(table.statementHash),
	],
);

export const problemTestCases = pgTable(
	"problem_test_cases",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		problemId: uuid("problem_id")
			.notNull()
			.references(() => problems.id, { onDelete: "cascade" }),
		ordinal: integer("ordinal").notNull(),
		name: text("name").notNull(),
		args: jsonb("args").$type<unknown[]>().notNull(),
		expected: jsonb("expected").$type<unknown>().notNull(),
		isHidden: boolean("is_hidden").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("problem_test_cases_problem_ordinal_idx").on(
			table.problemId,
			table.ordinal,
		),
	],
);

export const problemSolutions = pgTable(
	"problem_solutions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		problemId: uuid("problem_id")
			.notNull()
			.references(() => problems.id, { onDelete: "cascade" }),
		language: text("language").notNull(),
		code: text("code").notNull(),
		codeHash: text("code_hash").notNull(),
		isReference: boolean("is_reference").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("problem_solutions_problem_language_hash_idx").on(
			table.problemId,
			table.language,
			table.codeHash,
		),
	],
);

export const problemEmbeddings = pgTable("problem_embeddings", {
	problemId: uuid("problem_id")
		.primaryKey()
		.references(() => problems.id, { onDelete: "cascade" }),
	statementEmbedding: vector("statement_embedding", {
		dimensions: 384,
	}).notNull(),
	codeEmbedding: vector("code_embedding", { dimensions: 768 }).notNull(),
	combinedEmbedding: vector("combined_embedding", {
		dimensions: 1152,
	}).notNull(),
	encoderMetadata: jsonb("encoder_metadata")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	clusterId: integer("cluster_id"),
	clusterProbability: doublePrecision("cluster_probability"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const topics = pgTable("topics", {
	id: uuid("id").defaultRandom().primaryKey(),
	slug: text("slug").notNull().unique(),
	name: text("name").notNull(),
	description: text("description").notNull().default(""),
	generatedBy: text("generated_by").notNull().default("static_seed"),
	metadata: jsonb("metadata")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const topicEdges = pgTable(
	"topic_edges",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		fromTopicId: uuid("from_topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		toTopicId: uuid("to_topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		edgeType: text("edge_type").notNull().default("prerequisite"),
		weight: doublePrecision("weight").notNull().default(1),
		isStatic: boolean("is_static").notNull().default(true),
		rationale: text("rationale").notNull().default(""),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("topic_edges_unique_idx").on(
			table.fromTopicId,
			table.toTopicId,
			table.edgeType,
		),
	],
);

export const problemTopics = pgTable(
	"problem_topics",
	{
		problemId: uuid("problem_id")
			.notNull()
			.references(() => problems.id, { onDelete: "cascade" }),
		topicId: uuid("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		source: text("source").notNull().default("metadata_or_cluster"),
		weight: doublePrecision("weight").notNull().default(1),
	},
	(table) => [primaryKey({ columns: [table.problemId, table.topicId] })],
);

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	externalId: text("external_id").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const userProblemAttempts = pgTable("user_problem_attempts", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	problemId: uuid("problem_id")
		.notNull()
		.references(() => problems.id, { onDelete: "cascade" }),
	status: attemptStatus("status").notNull(),
	sourceCode: text("source_code").notNull(),
	passedTestCount: integer("passed_test_count").notNull().default(0),
	totalTestCount: integer("total_test_count").notNull().default(0),
	runtimeMs: integer("runtime_ms"),
	memoryKb: integer("memory_kb"),
	judgePayload: jsonb("judge_payload")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const userTopicState = pgTable(
	"user_topic_state",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: uuid("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		mastery: doublePrecision("mastery").notNull().default(0),
		exposureCount: integer("exposure_count").notNull().default(0),
		lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
	},
	(table) => [primaryKey({ columns: [table.userId, table.topicId] })],
);

export const userReviewState = pgTable(
	"user_review_state",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		problemId: uuid("problem_id")
			.notNull()
			.references(() => problems.id, { onDelete: "cascade" }),
		easeFactor: doublePrecision("ease_factor").notNull().default(2.3),
		intervalDays: integer("interval_days").notNull().default(0),
		repetitions: integer("repetitions").notNull().default(0),
		lapses: integer("lapses").notNull().default(0),
		dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
		lastQuality: integer("last_quality"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.problemId] })],
);

export const recommendationEvents = pgTable("recommendation_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	anchorProblemId: uuid("anchor_problem_id").references(() => problems.id, {
		onDelete: "set null",
	}),
	recommendedProblemId: uuid("recommended_problem_id")
		.notNull()
		.references(() => problems.id, { onDelete: "cascade" }),
	poolName: text("pool_name").notNull(),
	score: doublePrecision("score").notNull(),
	features: jsonb("features")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const editorSessions = pgTable("editor_sessions", {
	id: uuid("id").primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	problemId: uuid("problem_id")
		.notNull()
		.references(() => problems.id, { onDelete: "cascade" }),
	openedAt: timestamp("opened_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	lastEventAt: timestamp("last_event_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	closedAt: timestamp("closed_at", { withTimezone: true }),
	activeMs: integer("active_ms").notNull().default(0),
	idleMs: integer("idle_ms").notNull().default(0),
	focusMs: integer("focus_ms").notNull().default(0),
	maxPauseMs: integer("max_pause_ms").notNull().default(0),
	pauseCount: integer("pause_count").notNull().default(0),
	typingBursts: integer("typing_bursts").notNull().default(0),
	keystrokeCount: integer("keystroke_count").notNull().default(0),
	editCount: integer("edit_count").notNull().default(0),
	pasteCount: integer("paste_count").notNull().default(0),
	deleteCount: integer("delete_count").notNull().default(0),
	charsAdded: integer("chars_added").notNull().default(0),
	charsDeleted: integer("chars_deleted").notNull().default(0),
	netChars: integer("net_chars").notNull().default(0),
	compileCount: integer("compile_count").notNull().default(0),
	submitCount: integer("submit_count").notNull().default(0),
	clientMetrics: jsonb("client_metrics")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const editorCodeSnapshots = pgTable("editor_code_snapshots", {
	id: uuid("id").defaultRandom().primaryKey(),
	sessionId: uuid("session_id")
		.notNull()
		.references(() => editorSessions.id, { onDelete: "cascade" }),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	problemId: uuid("problem_id")
		.notNull()
		.references(() => problems.id, { onDelete: "cascade" }),
	eventType: text("event_type").notNull(),
	sourceHash: text("source_hash").notNull(),
	sourceCode: text("source_code").notNull(),
	codeMetrics: jsonb("code_metrics")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
