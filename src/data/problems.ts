export type Difficulty = "Easy" | "Medium" | "Hard";

export type TestCase = {
	id: string;
	name: string;
	args: unknown[];
	expected: unknown;
	visible: boolean;
};

export type Problem = {
	id: string;
	slug: string;
	title: string;
	difficulty: Difficulty;
	estimatedMinutes: number;
	functionName: string;
	prompt: string;
	inputContract: string;
	outputContract: string;
	constraints: string[];
	topics: string[];
	prerequisites: string[];
	starterCode: string;
	referenceSolution: string;
	testCases: TestCase[];
};

export type PublicProblem = Omit<Problem, "referenceSolution" | "testCases"> & {
	testCases: TestCase[];
	totalTestCases: number;
};

const pairSumStarter = `class Solution:
    def pairSumIndices(self, nums, target):
        # Return the indices of two different numbers whose sum is target.
        pass
`;

const compressRunsStarter = `class Solution:
    def compressRuns(self, text):
        # Return run-length encoded groups as [character, count] pairs.
        pass
`;

const mergeWindowsStarter = `class Solution:
    def mergeWindows(self, windows):
        # Merge overlapping inclusive intervals.
        pass
`;

const longestDistinctStarter = `class Solution:
    def longestDistinctSegment(self, nums):
        # Return the length of the longest contiguous segment with unique values.
        pass
`;

const islandBlocksStarter = `class Solution:
    def countIslandBlocks(self, grid):
        # Count connected blocks of 1s using 4-direction adjacency.
        pass
`;

const minRiskPathStarter = `class Solution:
    def minimumRiskPath(self, grid):
        # Return the minimum total risk from top-left to bottom-right.
        pass
`;

export const problems: Problem[] = [
	{
		id: "p-001",
		slug: "pair-sum-indices",
		title: "Pair Sum Indices",
		difficulty: "Easy",
		estimatedMinutes: 12,
		functionName: "pairSumIndices",
		prompt:
			"Given a list of integers and a target value, return the two zero-based indices whose values add to the target. The answer is guaranteed to exist and each input has exactly one valid pair.",
		inputContract: "`nums: list[int]`, `target: int`",
		outputContract: "`list[int]` with the smaller index first",
		constraints: [
			"2 <= len(nums) <= 100000",
			"-1000000000 <= nums[i], target <= 1000000000",
			"Exactly one valid pair exists.",
		],
		topics: ["Hashing", "Arrays", "One-pass lookup"],
		prerequisites: ["Arrays", "Hash maps"],
		starterCode: pairSumStarter,
		referenceSolution: `class Solution:
    def pairSumIndices(self, nums, target):
        seen = {}
        for index, value in enumerate(nums):
            need = target - value
            if need in seen:
                return [seen[need], index]
            seen[value] = index
        return []
`,
		testCases: [
			{
				id: "p-001-t1",
				name: "sample pair in middle",
				args: [[4, 8, 15, 16, 23, 42], 31],
				expected: [2, 3],
				visible: true,
			},
			{
				id: "p-001-t2",
				name: "pair uses first element",
				args: [[11, -2, 7, 5], 9],
				expected: [0, 1],
				visible: true,
			},
			{
				id: "p-001-t3",
				name: "negative complement",
				args: [[-8, 13, 4, 6, 20], -2],
				expected: [0, 3],
				visible: false,
			},
			{
				id: "p-001-t4",
				name: "duplicate values",
				args: [[5, 1, 5, 9], 10],
				expected: [0, 2],
				visible: false,
			},
		],
	},
	{
		id: "p-002",
		slug: "compress-event-runs",
		title: "Compress Event Runs",
		difficulty: "Easy",
		estimatedMinutes: 10,
		functionName: "compressRuns",
		prompt:
			"Telemetry events arrive as a string. Compress consecutive equal characters into ordered pairs of the character and its run length.",
		inputContract: "`text: str`",
		outputContract:
			"`list[list[str | int]]` where each item is `[character, count]`",
		constraints: [
			"0 <= len(text) <= 100000",
			"Characters are printable ASCII.",
			"Return an empty list for an empty string.",
		],
		topics: ["Strings", "Scanning", "Compression"],
		prerequisites: ["Strings", "Loops"],
		starterCode: compressRunsStarter,
		referenceSolution: `class Solution:
    def compressRuns(self, text):
        if not text:
            return []
        output = []
        current = text[0]
        count = 1
        for char in text[1:]:
            if char == current:
                count += 1
            else:
                output.append([current, count])
                current = char
                count = 1
        output.append([current, count])
        return output
`,
		testCases: [
			{
				id: "p-002-t1",
				name: "mixed groups",
				args: ["aaabbccccd"],
				expected: [
					["a", 3],
					["b", 2],
					["c", 4],
					["d", 1],
				],
				visible: true,
			},
			{
				id: "p-002-t2",
				name: "empty input",
				args: [""],
				expected: [],
				visible: true,
			},
			{
				id: "p-002-t3",
				name: "single group",
				args: ["zzzz"],
				expected: [["z", 4]],
				visible: false,
			},
		],
	},
	{
		id: "p-003",
		slug: "merge-availability-windows",
		title: "Merge Availability Windows",
		difficulty: "Medium",
		estimatedMinutes: 18,
		functionName: "mergeWindows",
		prompt:
			"Given inclusive availability windows, merge every overlapping or touching window and return the condensed schedule sorted by start time.",
		inputContract:
			"`windows: list[list[int]]` where each window is `[start, end]`",
		outputContract: "`list[list[int]]` sorted by start time",
		constraints: [
			"0 <= len(windows) <= 100000",
			"start <= end for every window",
			"Windows that touch, such as [1, 3] and [3, 6], should merge.",
		],
		topics: ["Intervals", "Sorting", "Greedy"],
		prerequisites: ["Arrays", "Sorting"],
		starterCode: mergeWindowsStarter,
		referenceSolution: `class Solution:
    def mergeWindows(self, windows):
        if not windows:
            return []
        windows = sorted(windows, key=lambda item: item[0])
        merged = [windows[0][:]]
        for start, end in windows[1:]:
            last = merged[-1]
            if start <= last[1]:
                last[1] = max(last[1], end)
            else:
                merged.append([start, end])
        return merged
`,
		testCases: [
			{
				id: "p-003-t1",
				name: "overlapping windows",
				args: [
					[
						[5, 9],
						[1, 3],
						[2, 4],
						[12, 14],
					],
				],
				expected: [
					[1, 4],
					[5, 9],
					[12, 14],
				],
				visible: true,
			},
			{
				id: "p-003-t2",
				name: "touching boundary",
				args: [
					[
						[1, 2],
						[2, 5],
						[8, 10],
					],
				],
				expected: [
					[1, 5],
					[8, 10],
				],
				visible: true,
			},
			{
				id: "p-003-t3",
				name: "empty schedule",
				args: [[]],
				expected: [],
				visible: false,
			},
		],
	},
	{
		id: "p-004",
		slug: "longest-distinct-segment",
		title: "Longest Distinct Segment",
		difficulty: "Medium",
		estimatedMinutes: 20,
		functionName: "longestDistinctSegment",
		prompt:
			"Return the length of the longest contiguous segment of integers that contains no repeated value.",
		inputContract: "`nums: list[int]`",
		outputContract: "`int` length of the best segment",
		constraints: [
			"0 <= len(nums) <= 200000",
			"Values can be negative or positive.",
			"An empty list has answer 0.",
		],
		topics: ["Sliding window", "Hashing", "Arrays"],
		prerequisites: ["Arrays", "Hash maps", "Two pointers"],
		starterCode: longestDistinctStarter,
		referenceSolution: `class Solution:
    def longestDistinctSegment(self, nums):
        last_seen = {}
        left = 0
        best = 0
        for right, value in enumerate(nums):
            if value in last_seen and last_seen[value] >= left:
                left = last_seen[value] + 1
            last_seen[value] = right
            best = max(best, right - left + 1)
        return best
`,
		testCases: [
			{
				id: "p-004-t1",
				name: "repeat inside window",
				args: [[7, 2, 3, 2, 5, 6, 3]],
				expected: 4,
				visible: true,
			},
			{
				id: "p-004-t2",
				name: "all unique",
				args: [[1, 2, 3, 4]],
				expected: 4,
				visible: true,
			},
			{
				id: "p-004-t3",
				name: "empty array",
				args: [[]],
				expected: 0,
				visible: false,
			},
			{
				id: "p-004-t4",
				name: "all same",
				args: [[9, 9, 9]],
				expected: 1,
				visible: false,
			},
		],
	},
	{
		id: "p-005",
		slug: "count-island-blocks",
		title: "Count Island Blocks",
		difficulty: "Medium",
		estimatedMinutes: 22,
		functionName: "countIslandBlocks",
		prompt:
			"A map is represented by a grid of 0s and 1s. Count how many connected blocks of 1s exist using up, down, left, and right adjacency.",
		inputContract: "`grid: list[list[int]]`",
		outputContract: "`int` number of connected blocks",
		constraints: [
			"0 <= rows, cols <= 300",
			"Every cell is 0 or 1.",
			"Diagonal cells are not connected.",
		],
		topics: ["Graphs", "DFS", "Grid traversal"],
		prerequisites: ["Arrays", "Recursion or stack", "Graph traversal"],
		starterCode: islandBlocksStarter,
		referenceSolution: `class Solution:
    def countIslandBlocks(self, grid):
        if not grid or not grid[0]:
            return 0
        rows = len(grid)
        cols = len(grid[0])
        seen = set()
        blocks = 0

        for row in range(rows):
            for col in range(cols):
                if grid[row][col] != 1 or (row, col) in seen:
                    continue
                blocks += 1
                stack = [(row, col)]
                seen.add((row, col))
                while stack:
                    current_row, current_col = stack.pop()
                    for delta_row, delta_col in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        next_row = current_row + delta_row
                        next_col = current_col + delta_col
                        if (
                            0 <= next_row < rows
                            and 0 <= next_col < cols
                            and grid[next_row][next_col] == 1
                            and (next_row, next_col) not in seen
                        ):
                            seen.add((next_row, next_col))
                            stack.append((next_row, next_col))
        return blocks
`,
		testCases: [
			{
				id: "p-005-t1",
				name: "three blocks",
				args: [
					[
						[1, 1, 0, 0],
						[0, 1, 0, 1],
						[1, 0, 0, 1],
					],
				],
				expected: 3,
				visible: true,
			},
			{
				id: "p-005-t2",
				name: "all water",
				args: [
					[
						[0, 0],
						[0, 0],
					],
				],
				expected: 0,
				visible: true,
			},
			{
				id: "p-005-t3",
				name: "one snake block",
				args: [
					[
						[1, 0, 1],
						[1, 1, 1],
						[0, 0, 1],
					],
				],
				expected: 1,
				visible: false,
			},
		],
	},
	{
		id: "p-006",
		slug: "minimum-risk-path",
		title: "Minimum Risk Path",
		difficulty: "Hard",
		estimatedMinutes: 35,
		functionName: "minimumRiskPath",
		prompt:
			"Each cell contains the risk paid when entering it. Starting at the top-left cell, move only right or down to reach the bottom-right cell with minimum total risk, including both endpoints.",
		inputContract: "`grid: list[list[int]]` with at least one row and column",
		outputContract: "`int` minimum possible risk",
		constraints: [
			"1 <= rows, cols <= 1000",
			"0 <= grid[row][col] <= 1000000",
			"Only right and down moves are allowed.",
		],
		topics: ["Dynamic programming", "Grid traversal", "Optimization"],
		prerequisites: ["Arrays", "Grid traversal", "Recurrence relations"],
		starterCode: minRiskPathStarter,
		referenceSolution: `class Solution:
    def minimumRiskPath(self, grid):
        rows = len(grid)
        cols = len(grid[0])
        dp = [0] * cols
        for row in range(rows):
            for col in range(cols):
                if row == 0 and col == 0:
                    dp[col] = grid[row][col]
                elif row == 0:
                    dp[col] = dp[col - 1] + grid[row][col]
                elif col == 0:
                    dp[col] = dp[col] + grid[row][col]
                else:
                    dp[col] = min(dp[col], dp[col - 1]) + grid[row][col]
        return dp[-1]
`,
		testCases: [
			{
				id: "p-006-t1",
				name: "balanced grid",
				args: [
					[
						[5, 9, 1],
						[4, 2, 7],
						[8, 3, 1],
					],
				],
				expected: 15,
				visible: true,
			},
			{
				id: "p-006-t2",
				name: "single row",
				args: [[[2, 4, 6]]],
				expected: 12,
				visible: true,
			},
			{
				id: "p-006-t3",
				name: "single column",
				args: [[[3], [1], [9]]],
				expected: 13,
				visible: false,
			},
		],
	},
];

export function getProblem(problemId: string) {
	return problems.find((problem) => problem.id === problemId);
}

export function toPublicProblem(problem: Problem): PublicProblem {
	return {
		...problem,
		testCases: problem.testCases.filter((testCase) => testCase.visible),
		totalTestCases: problem.testCases.length,
	};
}
