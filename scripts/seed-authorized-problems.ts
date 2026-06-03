import crypto from "node:crypto";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

import { problems } from "../src/data/problems.ts";

loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

const staticTopicEdges = [
	["arrays", "hash-maps", "Hash maps depend on array indexing and lookup patterns."],
	["arrays", "hashing", "Hashing practice builds on direct array traversal."],
	["arrays", "strings", "String scans use the same loop invariants as arrays."],
	["arrays", "sorting", "Sorting is easiest after array traversal is fluent."],
	["arrays", "prefix-sums", "Prefix aggregates extend array scanning."],
	["arrays", "binary-search", "Binary search requires fluent indexed array access."],
	["strings", "stacks", "Bracket and parser problems build on character scanning."],
	["stacks", "monotonic-stack", "Monotonic stacks add ordering invariants to stack use."],
	["hash-maps", "two-pointers", "Two-pointer work often combines with lookup state."],
	["hash-maps", "sliding-window", "Sliding windows use hash state for membership and counts."],
	["sorting", "intervals", "Interval merging starts with ordered ranges."],
	["sorting", "heaps", "Heap ordering is easier after comparison-based sorting."],
	["binary-search", "divide-and-conquer", "Divide-and-conquer uses the same split reasoning."],
	["two-pointers", "sliding-window", "Sliding windows extend two-pointer reasoning."],
	["arrays", "graph-traversal", "Grid and graph traversal require structured containers."],
	["queues", "bfs", "Breadth-first traversal depends on queue discipline."],
	["graph-traversal", "dfs", "Depth-first traversal is a core graph traversal strategy."],
	["graph-traversal", "topological-sort", "Topological sort depends on directed graph traversal."],
	[
		"graph-traversal",
		"dynamic-programming",
		"DP on graphs/grids benefits from traversal order.",
	],
	[
		"dynamic-programming",
		"unbounded-knapsack",
		"Unbounded knapsack is a focused dynamic programming recurrence.",
	],
	[
		"dynamic-programming",
		"sequences",
		"Sequence optimization problems use dynamic programming state transitions.",
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

async function recomputeMlArtifacts() {
	const mlServerUrl = process.env.ML_SERVER_URL;
	if (!mlServerUrl) {
		return;
	}

	try {
		const embeddingsUrl = new URL("/embeddings/recompute", mlServerUrl);
		const embeddings = await fetch(embeddingsUrl, { method: "POST" });
		if (!embeddings.ok) {
			throw new Error(`Embedding recompute failed with ${embeddings.status}.`);
		}

		const clustersUrl = new URL("/clusters/recompute", mlServerUrl);
		const clusters = await fetch(clustersUrl, { method: "POST" });
		if (!clusters.ok) {
			throw new Error(`Cluster recompute failed with ${clusters.status}.`);
		}
		console.log("Recomputed ML embeddings and clusters.");
	} catch (error: unknown) {
		console.warn(
			error instanceof Error
				? error.message
				: "Unable to recompute ML artifacts.",
		);
	}
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
				ON CONFLICT (external_id) DO UPDATE
				SET slug = EXCLUDED.slug,
					title = EXCLUDED.title,
					difficulty = EXCLUDED.difficulty,
					statement = EXCLUDED.statement,
					input_contract = EXCLUDED.input_contract,
					output_contract = EXCLUDED.output_contract,
					constraints = EXCLUDED.constraints,
					metadata = EXCLUDED.metadata,
					source_name = EXCLUDED.source_name,
					source_license = EXCLUDED.source_license,
					statement_hash = EXCLUDED.statement_hash,
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
			await client.query("DELETE FROM problem_solutions WHERE problem_id = $1", [
				problemId,
			]);
			await client.query("DELETE FROM problem_embeddings WHERE problem_id = $1", [
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
	await recomputeMlArtifacts();
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
