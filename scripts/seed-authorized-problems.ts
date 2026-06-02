import crypto from "node:crypto";
import { Client } from "pg";

import { problems } from "../src/data/problems.ts";

const staticTopicEdges = [
	["arrays", "hash-maps", "Hash maps depend on array indexing and lookup patterns."],
	["arrays", "sorting", "Sorting is easiest after array traversal is fluent."],
	["hash-maps", "two-pointers", "Two-pointer work often combines with lookup state."],
	["sorting", "intervals", "Interval merging starts with ordered ranges."],
	["two-pointers", "sliding-window", "Sliding windows extend two-pointer reasoning."],
	["arrays", "graph-traversal", "Grid and graph traversal require structured containers."],
	[
		"graph-traversal",
		"dynamic-programming",
		"DP on graphs/grids benefits from traversal order.",
	],
] as const;

function hashText(value: string) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function topicSlug(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required.");
	}

	const client = new Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		for (const problem of problems) {
			const statementHash = hashText(
				[
					problem.id,
					problem.slug,
					problem.title,
					problem.prompt,
					problem.referenceSolution,
				].join("\n"),
			);

			const insertedProblem = await client.query<{ id: string }>(
				`
				INSERT INTO problems (
					external_id,
					slug,
					title,
					difficulty,
					statement,
					input_contract,
					output_contract,
					constraints,
					metadata,
					source_name,
					source_license,
					statement_hash
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
				ON CONFLICT (statement_hash) DO UPDATE
				SET title = EXCLUDED.title,
					difficulty = EXCLUDED.difficulty,
					statement = EXCLUDED.statement,
					input_contract = EXCLUDED.input_contract,
					output_contract = EXCLUDED.output_contract,
					constraints = EXCLUDED.constraints,
					metadata = EXCLUDED.metadata,
					updated_at = now()
				RETURNING id
				`,
				[
					problem.id,
					problem.slug,
					problem.title,
					problem.difficulty,
					problem.prompt,
					problem.inputContract,
					problem.outputContract,
					JSON.stringify(problem.constraints),
					JSON.stringify({
						estimatedMinutes: problem.estimatedMinutes,
						functionName: problem.functionName,
						prerequisites: problem.prerequisites,
						topics: problem.topics,
					}),
					"authorized_seed",
					"original_or_authorized",
					statementHash,
				],
			);

			const problemId = insertedProblem.rows[0]?.id;
			if (!problemId) {
				throw new Error(`Problem insert failed for ${problem.slug}.`);
			}

			await client.query("DELETE FROM problem_test_cases WHERE problem_id = $1", [
				problemId,
			]);

			for (const [index, testCase] of problem.testCases.slice(0, 100).entries()) {
				await client.query(
					`
					INSERT INTO problem_test_cases (
						problem_id,
						ordinal,
						name,
						args,
						expected,
						is_hidden
					)
					VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
					`,
					[
						problemId,
						index + 1,
						testCase.name,
						JSON.stringify(testCase.args),
						JSON.stringify(testCase.expected),
						!testCase.visible,
					],
				);
			}

			await client.query(
				`
				INSERT INTO problem_solutions (problem_id, language, code, code_hash)
				VALUES ($1, 'python', $2, $3)
				ON CONFLICT (problem_id, language, code_hash) DO NOTHING
				`,
				[problemId, problem.referenceSolution, hashText(problem.referenceSolution)],
			);

			await client.query("DELETE FROM problem_topics WHERE problem_id = $1", [
				problemId,
			]);

			const weightedTopics = new Map<string, { name: string; weight: number }>();
			for (const topic of problem.prerequisites) {
				weightedTopics.set(topicSlug(topic), { name: topic, weight: 0.85 });
			}
			for (const topic of problem.topics) {
				weightedTopics.set(topicSlug(topic), { name: topic, weight: 1 });
			}

			for (const [slug, topic] of weightedTopics) {
				const insertedTopic = await client.query<{ id: string }>(
					`
					INSERT INTO topics (slug, name, generated_by)
					VALUES ($1, $2, 'metadata_seed')
					ON CONFLICT (slug) DO UPDATE
					SET name = EXCLUDED.name
					RETURNING id
					`,
					[slug, topic.name],
				);
				const topicId = insertedTopic.rows[0]?.id;
				if (!topicId) {
					throw new Error(`Topic insert failed for ${topic.name}.`);
				}

				await client.query(
					`
					INSERT INTO problem_topics (problem_id, topic_id, source, weight)
					VALUES ($1, $2, 'metadata_seed', $3)
					ON CONFLICT (problem_id, topic_id) DO UPDATE
					SET source = EXCLUDED.source,
						weight = EXCLUDED.weight
					`,
					[problemId, topicId, topic.weight],
				);
			}
		}

		for (const [fromSlug, toSlug, rationale] of staticTopicEdges) {
			await client.query(
				`
				INSERT INTO topic_edges (from_topic_id, to_topic_id, rationale, is_static)
				SELECT source.id, target.id, $1, true
				FROM topics source, topics target
				WHERE source.slug = $2 AND target.slug = $3
				ON CONFLICT (from_topic_id, to_topic_id, edge_type) DO UPDATE
				SET rationale = EXCLUDED.rationale,
					is_static = true
				`,
				[rationale, fromSlug, toSlug],
			);
		}
	} finally {
		await client.end();
	}

	console.log(`Seeded ${problems.length} authorized problems.`);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
