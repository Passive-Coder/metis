import { type Difficulty, getProblem, problems } from "#/data/problems";

export type Recommendation = {
	problemId: string;
	title: string;
	difficulty: Difficulty;
	pool: string;
	score: number;
	reason: string;
	topicPath: string[];
};

const topicOrder = [
	"Arrays",
	"Hash maps",
	"Strings",
	"Sorting",
	"Two pointers",
	"Intervals",
	"Sliding window",
	"Graph traversal",
	"Dynamic programming",
];

function overlapScore(left: string[], right: string[]) {
	const rightSet = new Set(right);
	const overlap = left.filter((item) => rightSet.has(item)).length;
	return overlap / Math.max(1, new Set([...left, ...right]).size);
}

function difficultyBoost(difficulty: Difficulty) {
	if (difficulty === "Easy") {
		return 0.04;
	}
	if (difficulty === "Medium") {
		return 0.08;
	}
	return 0.02;
}

export function localRecommendations(problemId: string): Recommendation[] {
	const solved = getProblem(problemId);
	const remaining = problems.filter((problem) => problem.id !== problemId);

	if (!solved) {
		return remaining.slice(0, 5).map((problem, index) => ({
			difficulty: problem.difficulty,
			pool: "New pattern",
			problemId: problem.id,
			reason: "A fresh authorized seed problem.",
			score: 0.72 - index * 0.03,
			title: problem.title,
			topicPath: problem.prerequisites,
		}));
	}

	const solvedTopicIndex = Math.max(
		0,
		...solved.prerequisites.map((topic) => topicOrder.indexOf(topic)),
	);
	const nextTopic =
		topicOrder[Math.min(topicOrder.length - 1, solvedTopicIndex + 1)];

	const candidates = remaining.map((problem) => {
		const shared = overlapScore(
			[...solved.topics, ...solved.prerequisites],
			[...problem.topics, ...problem.prerequisites],
		);
		const nextTopicScore = problem.prerequisites.includes(nextTopic) ? 0.22 : 0;
		const novelty = Math.max(0.05, 1 - shared) * 0.16;
		const score = Math.min(
			0.98,
			0.42 +
				shared * 0.34 +
				nextTopicScore +
				novelty +
				difficultyBoost(problem.difficulty),
		);

		let pool = "Vector similarity";
		let reason = "Shares semantic problem structure with the completed item.";

		if (problem.prerequisites.includes(nextTopic)) {
			pool = "Topic sequence";
			reason = `Advances the prerequisite path into ${nextTopic}.`;
		} else if (shared >= 0.32) {
			pool = "Near fetch";
			reason = "Keeps the pattern close enough for transfer practice.";
		} else if (problem.difficulty === "Easy") {
			pool = "Spaced repetition";
			reason = "Reinforces a lower-load prerequisite before moving on.";
		} else if (shared <= 0.15) {
			pool = "New pattern";
			reason = "Introduces a pattern not yet represented in the session.";
		}

		return {
			difficulty: problem.difficulty,
			pool,
			problemId: problem.id,
			reason,
			score,
			title: problem.title,
			topicPath: problem.prerequisites,
		};
	});

	return candidates.sort((left, right) => right.score - left.score).slice(0, 5);
}
