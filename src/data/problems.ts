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

type ProblemDomain = {
	slug: string;
	title: string;
	context: string;
	itemPlural: string;
	gridName: string;
};

type SeedTestCase = Omit<TestCase, "id">;

type ProblemTemplate = {
	slug: string;
	title: string;
	difficulty: Difficulty;
	estimatedMinutes: number;
	functionName: string;
	prompt: (domain: ProblemDomain) => string;
	inputContract: string;
	outputContract: string;
	constraints: string[];
	topics: string[];
	prerequisites: string[];
	starterCode: string;
	referenceSolution: string;
	testCases: SeedTestCase[];
};

const domains: ProblemDomain[] = [
	{
		slug: "signal",
		title: "Signal",
		context: "telemetry stream",
		itemPlural: "events",
		gridName: "sensor grid",
	},
	{
		slug: "warehouse",
		title: "Warehouse",
		context: "fulfillment workflow",
		itemPlural: "packages",
		gridName: "storage grid",
	},
	{
		slug: "transit",
		title: "Transit",
		context: "route planning system",
		itemPlural: "stops",
		gridName: "city grid",
	},
	{
		slug: "classroom",
		title: "Classroom",
		context: "lesson scheduler",
		itemPlural: "assignments",
		gridName: "seat grid",
	},
	{
		slug: "finance",
		title: "Finance",
		context: "risk ledger",
		itemPlural: "transactions",
		gridName: "audit grid",
	},
];

const templates: ProblemTemplate[] = [
	{
		slug: "pair-sum-indices",
		title: "Pair Sum Indices",
		difficulty: "Easy",
		estimatedMinutes: 12,
		functionName: "pairSumIndices",
		prompt: (domain) =>
			`Given ${domain.itemPlural} represented by integer scores and a target score in a ${domain.context}, return the two zero-based indices whose values add to the target. The answer is guaranteed to exist and each input has exactly one valid pair.`,
		inputContract: "`nums: list[int]`, `target: int`",
		outputContract: "`list[int]` with the smaller index first",
		constraints: [
			"2 <= len(nums) <= 100000",
			"-1000000000 <= nums[i], target <= 1000000000",
			"Exactly one valid pair exists.",
		],
		topics: ["Hashing", "Arrays", "One-pass lookup"],
		prerequisites: ["Arrays", "Hash maps"],
		starterCode: `class Solution:
    def pairSumIndices(self, nums, target):
        # Return the indices of two different numbers whose sum is target.
        pass
`,
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
				name: "sample pair in middle",
				args: [[4, 8, 15, 16, 23, 42], 31],
				expected: [2, 3],
				visible: true,
			},
			{
				name: "pair uses first element",
				args: [[11, -2, 7, 5], 9],
				expected: [0, 1],
				visible: true,
			},
			{
				name: "duplicate values",
				args: [[5, 1, 5, 9], 10],
				expected: [0, 2],
				visible: false,
			},
		],
	},
	{
		slug: "compress-runs",
		title: "Compress Runs",
		difficulty: "Easy",
		estimatedMinutes: 10,
		functionName: "compressRuns",
		prompt: (domain) =>
			`A ${domain.context} emits a string of ${domain.itemPlural}. Compress consecutive equal characters into ordered pairs of the character and its run length.`,
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
		starterCode: `class Solution:
    def compressRuns(self, text):
        # Return run-length encoded groups as [character, count] pairs.
        pass
`,
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
				name: "empty input",
				args: [""],
				expected: [],
				visible: true,
			},
			{
				name: "single group",
				args: ["zzzz"],
				expected: [["z", 4]],
				visible: false,
			},
		],
	},
	{
		slug: "merge-availability-windows",
		title: "Merge Availability Windows",
		difficulty: "Medium",
		estimatedMinutes: 18,
		functionName: "mergeWindows",
		prompt: (domain) =>
			`Given inclusive windows from a ${domain.context}, merge every overlapping or touching window and return the condensed schedule sorted by start time.`,
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
		starterCode: `class Solution:
    def mergeWindows(self, windows):
        # Merge overlapping inclusive intervals.
        pass
`,
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
				name: "empty schedule",
				args: [[]],
				expected: [],
				visible: false,
			},
		],
	},
	{
		slug: "longest-distinct-segment",
		title: "Longest Distinct Segment",
		difficulty: "Medium",
		estimatedMinutes: 20,
		functionName: "longestDistinctSegment",
		prompt: (domain) =>
			`Return the length of the longest contiguous segment of ${domain.itemPlural} in a ${domain.context} that contains no repeated value.`,
		inputContract: "`nums: list[int]`",
		outputContract: "`int` length of the best segment",
		constraints: [
			"0 <= len(nums) <= 200000",
			"Values can be negative or positive.",
			"An empty list has answer 0.",
		],
		topics: ["Sliding window", "Hashing", "Arrays"],
		prerequisites: ["Arrays", "Hash maps", "Two pointers"],
		starterCode: `class Solution:
    def longestDistinctSegment(self, nums):
        # Return the length of the longest contiguous segment with unique values.
        pass
`,
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
				name: "repeat inside window",
				args: [[7, 2, 3, 2, 5, 6, 3]],
				expected: 4,
				visible: true,
			},
			{
				name: "all unique",
				args: [[1, 2, 3, 4]],
				expected: 4,
				visible: true,
			},
			{
				name: "all same",
				args: [[9, 9, 9]],
				expected: 1,
				visible: false,
			},
		],
	},
	{
		slug: "count-island-blocks",
		title: "Count Island Blocks",
		difficulty: "Medium",
		estimatedMinutes: 22,
		functionName: "countIslandBlocks",
		prompt: (domain) =>
			`A ${domain.gridName} is represented by 0s and 1s. Count how many connected blocks of 1s exist using up, down, left, and right adjacency.`,
		inputContract: "`grid: list[list[int]]`",
		outputContract: "`int` number of connected blocks",
		constraints: [
			"0 <= rows, cols <= 300",
			"Every cell is 0 or 1.",
			"Diagonal cells are not connected.",
		],
		topics: ["Graphs", "DFS", "Grid traversal"],
		prerequisites: ["Arrays", "Recursion or stack", "Graph traversal"],
		starterCode: `class Solution:
    def countIslandBlocks(self, grid):
        # Count connected blocks of 1s using 4-direction adjacency.
        pass
`,
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
		slug: "minimum-risk-path",
		title: "Minimum Risk Path",
		difficulty: "Hard",
		estimatedMinutes: 35,
		functionName: "minimumRiskPath",
		prompt: (domain) =>
			`Each cell in a ${domain.gridName} contains the risk paid when entering it. Starting at the top-left cell, move only right or down to reach the bottom-right cell with minimum total risk, including both endpoints.`,
		inputContract: "`grid: list[list[int]]` with at least one row and column",
		outputContract: "`int` minimum possible risk",
		constraints: [
			"1 <= rows, cols <= 1000",
			"0 <= grid[row][col] <= 1000000",
			"Only right and down moves are allowed.",
		],
		topics: ["Dynamic programming", "Grid traversal", "Optimization"],
		prerequisites: ["Arrays", "Grid traversal", "Recurrence relations"],
		starterCode: `class Solution:
    def minimumRiskPath(self, grid):
        # Return the minimum total risk from top-left to bottom-right.
        pass
`,
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
				name: "single row",
				args: [[[2, 4, 6]]],
				expected: 12,
				visible: true,
			},
			{
				name: "single column",
				args: [[[3], [1], [9]]],
				expected: 13,
				visible: false,
			},
		],
	},
	{
		slug: "balanced-brackets",
		title: "Balanced Brackets",
		difficulty: "Easy",
		estimatedMinutes: 12,
		functionName: "balancedBrackets",
		prompt: (domain) =>
			`Validate whether bracket markers in a ${domain.context} are balanced. The string can contain only the six bracket characters: (), [], and {}.`,
		inputContract: "`text: str`",
		outputContract: "`bool`",
		constraints: [
			"0 <= len(text) <= 100000",
			"Every character is one of: (, ), [, ], {, }.",
			"An empty string is balanced.",
		],
		topics: ["Stacks", "Strings", "Parsing"],
		prerequisites: ["Strings", "Stacks"],
		starterCode: `class Solution:
    def balancedBrackets(self, text):
        # Return True when all bracket pairs are balanced.
        pass
`,
		referenceSolution: `class Solution:
    def balancedBrackets(self, text):
        pairs = {")": "(", "]": "[", "}": "{"}
        stack = []
        for char in text:
            if char in "([{":
                stack.append(char)
            elif not stack or stack.pop() != pairs[char]:
                return False
        return not stack
`,
		testCases: [
			{
				name: "nested balanced brackets",
				args: ["([]{})"],
				expected: true,
				visible: true,
			},
			{
				name: "crossed brackets",
				args: ["([)]"],
				expected: false,
				visible: true,
			},
			{
				name: "empty text",
				args: [""],
				expected: true,
				visible: false,
			},
			{
				name: "unclosed bracket",
				args: ["(((())))["],
				expected: false,
				visible: false,
			},
		],
	},
	{
		slug: "top-k-frequent-values",
		title: "Top K Frequent Values",
		difficulty: "Medium",
		estimatedMinutes: 18,
		functionName: "topKFrequent",
		prompt: (domain) =>
			`Return the ${domain.itemPlural} values that appear most often in a ${domain.context}. Break frequency ties by smaller numeric value.`,
		inputContract: "`nums: list[int]`, `k: int`",
		outputContract:
			"`list[int]` ordered by frequency descending, then value ascending",
		constraints: [
			"1 <= k <= number of distinct values in nums",
			"1 <= len(nums) <= 100000",
			"-1000000 <= nums[i] <= 1000000",
		],
		topics: ["Hashing", "Heaps", "Sorting"],
		prerequisites: ["Arrays", "Hash maps", "Sorting"],
		starterCode: `class Solution:
    def topKFrequent(self, nums, k):
        # Return the k most frequent values, tie-breaking by smaller value.
        pass
`,
		referenceSolution: `class Solution:
    def topKFrequent(self, nums, k):
        counts = {}
        for value in nums:
            counts[value] = counts.get(value, 0) + 1
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return [value for value, _count in ordered[:k]]
`,
		testCases: [
			{
				name: "clear top two",
				args: [[1, 1, 1, 2, 2, 3], 2],
				expected: [1, 2],
				visible: true,
			},
			{
				name: "tie by value",
				args: [[4, 4, 5, 5, 6], 2],
				expected: [4, 5],
				visible: true,
			},
			{
				name: "three-way mix",
				args: [[9, 8, 9, 8, 7, 7, 7], 2],
				expected: [7, 8],
				visible: false,
			},
		],
	},
	{
		slug: "rotate-matrix-clockwise",
		title: "Rotate Matrix Clockwise",
		difficulty: "Medium",
		estimatedMinutes: 16,
		functionName: "rotateMatrixClockwise",
		prompt: (domain) =>
			`Return a new matrix that rotates a rectangular ${domain.gridName} 90 degrees clockwise.`,
		inputContract: "`matrix: list[list[int]]`",
		outputContract: "`list[list[int]]` rotated clockwise",
		constraints: [
			"0 <= rows, cols <= 300",
			"Every row has the same length.",
			"Do not mutate the caller's matrix.",
		],
		topics: ["Arrays", "Matrix", "Simulation"],
		prerequisites: ["Arrays", "Loops"],
		starterCode: `class Solution:
    def rotateMatrixClockwise(self, matrix):
        # Return a new matrix rotated 90 degrees clockwise.
        pass
`,
		referenceSolution: `class Solution:
    def rotateMatrixClockwise(self, matrix):
        if not matrix:
            return []
        return [list(row) for row in zip(*matrix[::-1])]
`,
		testCases: [
			{
				name: "square matrix",
				args: [
					[
						[1, 2, 3],
						[4, 5, 6],
						[7, 8, 9],
					],
				],
				expected: [
					[7, 4, 1],
					[8, 5, 2],
					[9, 6, 3],
				],
				visible: true,
			},
			{
				name: "rectangular matrix",
				args: [
					[
						[1, 2, 3],
						[4, 5, 6],
					],
				],
				expected: [
					[4, 1],
					[5, 2],
					[6, 3],
				],
				visible: true,
			},
			{
				name: "empty matrix",
				args: [[]],
				expected: [],
				visible: false,
			},
		],
	},
	{
		slug: "valid-mountain",
		title: "Valid Mountain",
		difficulty: "Easy",
		estimatedMinutes: 12,
		functionName: "validMountain",
		prompt: (domain) =>
			`Determine whether ${domain.itemPlural} form a valid mountain: strictly increasing to one peak, then strictly decreasing.`,
		inputContract: "`nums: list[int]`",
		outputContract: "`bool`",
		constraints: [
			"1 <= len(nums) <= 100000",
			"A peak cannot be the first or last element.",
			"Equal adjacent values are not allowed on either side.",
		],
		topics: ["Arrays", "Two pointers", "Scanning"],
		prerequisites: ["Arrays", "Loops"],
		starterCode: `class Solution:
    def validMountain(self, nums):
        # Return True if nums strictly climbs then strictly descends.
        pass
`,
		referenceSolution: `class Solution:
    def validMountain(self, nums):
        n = len(nums)
        i = 0
        while i + 1 < n and nums[i] < nums[i + 1]:
            i += 1
        if i == 0 or i == n - 1:
            return False
        while i + 1 < n and nums[i] > nums[i + 1]:
            i += 1
        return i == n - 1
`,
		testCases: [
			{
				name: "valid peak",
				args: [[1, 3, 5, 4, 2]],
				expected: true,
				visible: true,
			},
			{
				name: "only climbing",
				args: [[1, 2, 3]],
				expected: false,
				visible: true,
			},
			{
				name: "flat near peak",
				args: [[1, 2, 2, 1]],
				expected: false,
				visible: false,
			},
		],
	},
	{
		slug: "product-except-self",
		title: "Product Except Self",
		difficulty: "Medium",
		estimatedMinutes: 18,
		functionName: "productExceptSelf",
		prompt: (domain) =>
			`For each numeric value in ${domain.itemPlural}, return the product of every other value without using division.`,
		inputContract: "`nums: list[int]`",
		outputContract:
			"`list[int]` where output[i] is product of all nums[j] for j != i",
		constraints: [
			"2 <= len(nums) <= 100000",
			"Intermediate products fit in signed 64-bit integer range.",
			"Division is not allowed.",
		],
		topics: ["Arrays", "Prefix products", "Suffix products"],
		prerequisites: ["Arrays", "Prefix sums"],
		starterCode: `class Solution:
    def productExceptSelf(self, nums):
        # Return products of all other values without division.
        pass
`,
		referenceSolution: `class Solution:
    def productExceptSelf(self, nums):
        output = [1] * len(nums)
        prefix = 1
        for index, value in enumerate(nums):
            output[index] = prefix
            prefix *= value
        suffix = 1
        for index in range(len(nums) - 1, -1, -1):
            output[index] *= suffix
            suffix *= nums[index]
        return output
`,
		testCases: [
			{
				name: "positive values",
				args: [[1, 2, 3, 4]],
				expected: [24, 12, 8, 6],
				visible: true,
			},
			{
				name: "single zero",
				args: [[0, 1, 2, 3]],
				expected: [6, 0, 0, 0],
				visible: true,
			},
			{
				name: "two zeros",
				args: [[0, 0, 2]],
				expected: [0, 0, 0],
				visible: false,
			},
		],
	},
	{
		slug: "minimum-processing-speed",
		title: "Minimum Processing Speed",
		difficulty: "Medium",
		estimatedMinutes: 22,
		functionName: "minEatingSpeed",
		prompt: (domain) =>
			`A processor handles one pile of ${domain.itemPlural} per hour at a fixed integer speed. Return the minimum speed needed to finish all piles within h hours.`,
		inputContract: "`piles: list[int]`, `h: int`",
		outputContract: "`int` minimum feasible speed",
		constraints: [
			"1 <= len(piles) <= 10000",
			"1 <= piles[i] <= 1000000000",
			"len(piles) <= h <= 1000000000",
		],
		topics: ["Binary search", "Greedy", "Math"],
		prerequisites: ["Arrays", "Binary search"],
		starterCode: `class Solution:
    def minEatingSpeed(self, piles, h):
        # Return the smallest integer speed that finishes all piles in h hours.
        pass
`,
		referenceSolution: `class Solution:
    def minEatingSpeed(self, piles, h):
        left = 1
        right = max(piles)
        while left < right:
            speed = (left + right) // 2
            hours = 0
            for pile in piles:
                hours += (pile + speed - 1) // speed
            if hours <= h:
                right = speed
            else:
                left = speed + 1
        return left
`,
		testCases: [
			{
				name: "sample speed",
				args: [[3, 6, 7, 11], 8],
				expected: 4,
				visible: true,
			},
			{
				name: "tight deadline",
				args: [[30, 11, 23, 4, 20], 5],
				expected: 30,
				visible: true,
			},
			{
				name: "one extra hour",
				args: [[30, 11, 23, 4, 20], 6],
				expected: 23,
				visible: false,
			},
		],
	},
	{
		slug: "search-rotated-array",
		title: "Search Rotated Array",
		difficulty: "Medium",
		estimatedMinutes: 20,
		functionName: "searchRotated",
		prompt: (domain) =>
			`A sorted list of ${domain.itemPlural} was rotated at an unknown pivot. Return the index of the target value, or -1 when it is absent.`,
		inputContract: "`nums: list[int]`, `target: int`",
		outputContract: "`int` index of target or -1",
		constraints: [
			"0 <= len(nums) <= 100000",
			"Values are distinct.",
			"The algorithm should run in O(log n).",
		],
		topics: ["Binary search", "Arrays", "Divide and conquer"],
		prerequisites: ["Arrays", "Binary search"],
		starterCode: `class Solution:
    def searchRotated(self, nums, target):
        # Return the target index in a rotated sorted array, or -1.
        pass
`,
		referenceSolution: `class Solution:
    def searchRotated(self, nums, target):
        left = 0
        right = len(nums) - 1
        while left <= right:
            mid = (left + right) // 2
            if nums[mid] == target:
                return mid
            if nums[left] <= nums[mid]:
                if nums[left] <= target < nums[mid]:
                    right = mid - 1
                else:
                    left = mid + 1
            else:
                if nums[mid] < target <= nums[right]:
                    left = mid + 1
                else:
                    right = mid - 1
        return -1
`,
		testCases: [
			{
				name: "target after pivot",
				args: [[4, 5, 6, 7, 0, 1, 2], 0],
				expected: 4,
				visible: true,
			},
			{
				name: "target missing",
				args: [[4, 5, 6, 7, 0, 1, 2], 3],
				expected: -1,
				visible: true,
			},
			{
				name: "single element",
				args: [[1], 1],
				expected: 0,
				visible: false,
			},
		],
	},
	{
		slug: "k-closest-points",
		title: "K Closest Points",
		difficulty: "Medium",
		estimatedMinutes: 18,
		functionName: "kClosestPoints",
		prompt: (domain) =>
			`Return the k coordinate points closest to the origin in a ${domain.context}. Sort ties by x coordinate, then y coordinate.`,
		inputContract: "`points: list[list[int]]`, `k: int`",
		outputContract:
			"`list[list[int]]` of the k closest points in deterministic order",
		constraints: [
			"1 <= k <= len(points) <= 100000",
			"-100000 <= x, y <= 100000",
			"Distance is squared Euclidean distance from [0, 0].",
		],
		topics: ["Heaps", "Sorting", "Geometry"],
		prerequisites: ["Arrays", "Sorting"],
		starterCode: `class Solution:
    def kClosestPoints(self, points, k):
        # Return the k points closest to the origin.
        pass
`,
		referenceSolution: `class Solution:
    def kClosestPoints(self, points, k):
        return sorted(
            points,
            key=lambda point: (point[0] * point[0] + point[1] * point[1], point[0], point[1]),
        )[:k]
`,
		testCases: [
			{
				name: "tie by coordinate",
				args: [
					[
						[1, 3],
						[-2, 2],
						[2, -2],
					],
					2,
				],
				expected: [
					[-2, 2],
					[2, -2],
				],
				visible: true,
			},
			{
				name: "second closest",
				args: [
					[
						[3, 3],
						[5, -1],
						[-2, 4],
					],
					2,
				],
				expected: [
					[3, 3],
					[-2, 4],
				],
				visible: true,
			},
			{
				name: "axis points",
				args: [
					[
						[0, 1],
						[1, 0],
						[-1, 0],
					],
					2,
				],
				expected: [
					[-1, 0],
					[0, 1],
				],
				visible: false,
			},
		],
	},
	{
		slug: "word-pattern",
		title: "Word Pattern",
		difficulty: "Easy",
		estimatedMinutes: 14,
		functionName: "wordPattern",
		prompt: (domain) =>
			`Check whether a pattern string maps one-to-one onto words from a ${domain.context}. Each pattern character must always map to the same word, and no two characters can map to the same word.`,
		inputContract:
			"`pattern: str`, `words: str` where words are separated by spaces",
		outputContract: "`bool`",
		constraints: [
			"1 <= len(pattern) <= 1000",
			"0 <= number of words <= 1000",
			"Words contain no spaces.",
		],
		topics: ["Hashing", "Strings", "Bijection"],
		prerequisites: ["Strings", "Hash maps"],
		starterCode: `class Solution:
    def wordPattern(self, pattern, words):
        # Return True when pattern characters and words form a bijection.
        pass
`,
		referenceSolution: `class Solution:
    def wordPattern(self, pattern, words):
        items = words.split()
        if len(pattern) != len(items):
            return False
        char_to_word = {}
        word_to_char = {}
        for char, word in zip(pattern, items):
            if char in char_to_word and char_to_word[char] != word:
                return False
            if word in word_to_char and word_to_char[word] != char:
                return False
            char_to_word[char] = word
            word_to_char[word] = char
        return True
`,
		testCases: [
			{
				name: "matching pattern",
				args: ["abba", "red blue blue red"],
				expected: true,
				visible: true,
			},
			{
				name: "different last word",
				args: ["abba", "red blue blue green"],
				expected: false,
				visible: true,
			},
			{
				name: "many-to-one rejected",
				args: ["abba", "red red red red"],
				expected: false,
				visible: false,
			},
		],
	},
	{
		slug: "daily-wait-times",
		title: "Daily Wait Times",
		difficulty: "Medium",
		estimatedMinutes: 18,
		functionName: "dailyTemperatures",
		prompt: (domain) =>
			`Given daily numeric readings in a ${domain.context}, return how many days each reading must wait until a warmer future reading. Use 0 when no warmer reading exists.`,
		inputContract: "`temperatures: list[int]`",
		outputContract: "`list[int]` wait length for every index",
		constraints: [
			"0 <= len(temperatures) <= 100000",
			"-1000000 <= temperatures[i] <= 1000000",
			"Return a list with the same length as the input.",
		],
		topics: ["Stacks", "Arrays", "Monotonic stack"],
		prerequisites: ["Arrays", "Stacks"],
		starterCode: `class Solution:
    def dailyTemperatures(self, temperatures):
        # Return days until a warmer future reading for each day.
        pass
`,
		referenceSolution: `class Solution:
    def dailyTemperatures(self, temperatures):
        waits = [0] * len(temperatures)
        stack = []
        for index, value in enumerate(temperatures):
            while stack and temperatures[stack[-1]] < value:
                previous = stack.pop()
                waits[previous] = index - previous
            stack.append(index)
        return waits
`,
		testCases: [
			{
				name: "mixed readings",
				args: [[73, 74, 75, 71, 69, 72, 76, 73]],
				expected: [1, 1, 4, 2, 1, 1, 0, 0],
				visible: true,
			},
			{
				name: "always warming",
				args: [[30, 40, 50, 60]],
				expected: [1, 1, 1, 0],
				visible: true,
			},
			{
				name: "always cooling",
				args: [[60, 50, 40]],
				expected: [0, 0, 0],
				visible: false,
			},
		],
	},
	{
		slug: "course-order",
		title: "Course Order",
		difficulty: "Hard",
		estimatedMinutes: 32,
		functionName: "courseScheduleOrder",
		prompt: (domain) =>
			`Return a valid order for completing ${domain.itemPlural} when prerequisite pairs are provided. If multiple orders are valid, use the smallest available course number first. Return an empty list if a cycle makes completion impossible.`,
		inputContract:
			"`numCourses: int`, `prerequisites: list[list[int]]` where each pair is `[course, prerequisite]`",
		outputContract:
			"`list[int]` course order, or `[]` when no valid order exists",
		constraints: [
			"0 <= numCourses <= 100000",
			"0 <= len(prerequisites) <= 200000",
			"Course numbers are in [0, numCourses - 1].",
		],
		topics: ["Graphs", "Topological sort", "Queues"],
		prerequisites: ["Graph traversal", "Indegree counting", "Queues"],
		starterCode: `class Solution:
    def courseScheduleOrder(self, numCourses, prerequisites):
        # Return a deterministic topological order, or [] if impossible.
        pass
`,
		referenceSolution: `class Solution:
    def courseScheduleOrder(self, numCourses, prerequisites):
        import heapq

        graph = [[] for _ in range(numCourses)]
        indegree = [0] * numCourses
        for course, prerequisite in prerequisites:
            graph[prerequisite].append(course)
            indegree[course] += 1

        ready = [course for course in range(numCourses) if indegree[course] == 0]
        heapq.heapify(ready)
        order = []
        while ready:
            course = heapq.heappop(ready)
            order.append(course)
            for next_course in graph[course]:
                indegree[next_course] -= 1
                if indegree[next_course] == 0:
                    heapq.heappush(ready, next_course)
        return order if len(order) == numCourses else []
`,
		testCases: [
			{
				name: "diamond dependencies",
				args: [
					4,
					[
						[1, 0],
						[2, 0],
						[3, 1],
						[3, 2],
					],
				],
				expected: [0, 1, 2, 3],
				visible: true,
			},
			{
				name: "cycle",
				args: [
					2,
					[
						[1, 0],
						[0, 1],
					],
				],
				expected: [],
				visible: true,
			},
			{
				name: "no dependencies",
				args: [3, []],
				expected: [0, 1, 2],
				visible: false,
			},
		],
	},
	{
		slug: "shortest-binary-grid-path",
		title: "Shortest Binary Grid Path",
		difficulty: "Hard",
		estimatedMinutes: 30,
		functionName: "shortestPathBinaryGrid",
		prompt: (domain) =>
			`Find the shortest path from the top-left to bottom-right cell in a ${domain.gridName}. A 0 is open, a 1 is blocked, and movement can use all eight directions.`,
		inputContract: "`grid: list[list[int]]`",
		outputContract: "`int` shortest path length in cells, or -1 if unreachable",
		constraints: [
			"1 <= rows, cols <= 300",
			"Every cell is 0 or 1.",
			"Both start and end cells must be open.",
		],
		topics: ["Graphs", "BFS", "Grid traversal"],
		prerequisites: ["Queues", "Graph traversal", "Grid traversal"],
		starterCode: `class Solution:
    def shortestPathBinaryGrid(self, grid):
        # Return the shortest 8-direction path length through open cells.
        pass
`,
		referenceSolution: `class Solution:
    def shortestPathBinaryGrid(self, grid):
        from collections import deque

        rows = len(grid)
        cols = len(grid[0]) if rows else 0
        if rows == 0 or cols == 0 or grid[0][0] != 0 or grid[rows - 1][cols - 1] != 0:
            return -1

        queue = deque([(0, 0, 1)])
        seen = {(0, 0)}
        directions = (
            (-1, -1), (-1, 0), (-1, 1),
            (0, -1),           (0, 1),
            (1, -1),  (1, 0),  (1, 1),
        )
        while queue:
            row, col, distance = queue.popleft()
            if row == rows - 1 and col == cols - 1:
                return distance
            for delta_row, delta_col in directions:
                next_row = row + delta_row
                next_col = col + delta_col
                if (
                    0 <= next_row < rows
                    and 0 <= next_col < cols
                    and grid[next_row][next_col] == 0
                    and (next_row, next_col) not in seen
                ):
                    seen.add((next_row, next_col))
                    queue.append((next_row, next_col, distance + 1))
        return -1
`,
		testCases: [
			{
				name: "diagonal path",
				args: [
					[
						[0, 1],
						[1, 0],
					],
				],
				expected: 2,
				visible: true,
			},
			{
				name: "corridor",
				args: [
					[
						[0, 0, 0],
						[1, 1, 0],
						[1, 1, 0],
					],
				],
				expected: 4,
				visible: true,
			},
			{
				name: "blocked start",
				args: [
					[
						[1, 0],
						[0, 0],
					],
				],
				expected: -1,
				visible: false,
			},
		],
	},
	{
		slug: "coin-change-fewest",
		title: "Coin Change Fewest",
		difficulty: "Medium",
		estimatedMinutes: 24,
		functionName: "coinChangeFewest",
		prompt: (domain) =>
			`Given reusable denominations in a ${domain.context}, return the fewest number of items needed to reach the target amount, or -1 if it cannot be reached.`,
		inputContract: "`coins: list[int]`, `amount: int`",
		outputContract: "`int` fewest coins, or -1",
		constraints: [
			"1 <= len(coins) <= 100",
			"0 <= amount <= 100000",
			"Every coin value is positive.",
		],
		topics: ["Dynamic programming", "Unbounded knapsack", "Optimization"],
		prerequisites: ["Arrays", "Dynamic programming"],
		starterCode: `class Solution:
    def coinChangeFewest(self, coins, amount):
        # Return the fewest coins needed to make amount, or -1.
        pass
`,
		referenceSolution: `class Solution:
    def coinChangeFewest(self, coins, amount):
        dp = [amount + 1] * (amount + 1)
        dp[0] = 0
        for value in range(1, amount + 1):
            for coin in coins:
                if coin <= value:
                    dp[value] = min(dp[value], dp[value - coin] + 1)
        return -1 if dp[amount] > amount else dp[amount]
`,
		testCases: [
			{
				name: "standard amount",
				args: [[1, 2, 5], 11],
				expected: 3,
				visible: true,
			},
			{
				name: "unreachable amount",
				args: [[2], 3],
				expected: -1,
				visible: true,
			},
			{
				name: "zero amount",
				args: [[1], 0],
				expected: 0,
				visible: false,
			},
		],
	},
	{
		slug: "longest-increasing-subsequence",
		title: "Longest Increasing Subsequence",
		difficulty: "Hard",
		estimatedMinutes: 28,
		functionName: "longestIncreasingSubsequence",
		prompt: (domain) =>
			`Return the length of the longest strictly increasing subsequence in ${domain.itemPlural}. The subsequence does not need to be contiguous.`,
		inputContract: "`nums: list[int]`",
		outputContract: "`int` subsequence length",
		constraints: [
			"0 <= len(nums) <= 200000",
			"-1000000000 <= nums[i] <= 1000000000",
			"Target O(n log n) time.",
		],
		topics: ["Dynamic programming", "Binary search", "Sequences"],
		prerequisites: ["Arrays", "Binary search", "Dynamic programming"],
		starterCode: `class Solution:
    def longestIncreasingSubsequence(self, nums):
        # Return the length of the longest strictly increasing subsequence.
        pass
`,
		referenceSolution: `class Solution:
    def longestIncreasingSubsequence(self, nums):
        import bisect

        tails = []
        for value in nums:
            index = bisect.bisect_left(tails, value)
            if index == len(tails):
                tails.append(value)
            else:
                tails[index] = value
        return len(tails)
`,
		testCases: [
			{
				name: "classic sequence",
				args: [[10, 9, 2, 5, 3, 7, 101, 18]],
				expected: 4,
				visible: true,
			},
			{
				name: "repeated rises",
				args: [[0, 1, 0, 3, 2, 3]],
				expected: 4,
				visible: true,
			},
			{
				name: "all equal",
				args: [[7, 7, 7]],
				expected: 1,
				visible: false,
			},
			{
				name: "empty input",
				args: [[]],
				expected: 0,
				visible: false,
			},
		],
	},
];

function buildProblem(
	index: number,
	domain: ProblemDomain,
	template: ProblemTemplate,
): Problem {
	const id = `p-${String(index + 1).padStart(3, "0")}`;
	return {
		constraints: template.constraints,
		difficulty: template.difficulty,
		estimatedMinutes: template.estimatedMinutes,
		functionName: template.functionName,
		id,
		inputContract: template.inputContract,
		outputContract: template.outputContract,
		prerequisites: template.prerequisites,
		prompt: template.prompt(domain),
		referenceSolution: template.referenceSolution,
		slug: `${domain.slug}-${template.slug}`,
		starterCode: template.starterCode,
		testCases: template.testCases.map((testCase, caseIndex) => ({
			...testCase,
			id: `${id}-t${caseIndex + 1}`,
		})),
		title: `${domain.title} ${template.title}`,
		topics: template.topics,
	};
}

export const problems: Problem[] = domains.flatMap((domain, domainIndex) =>
	templates.map((template, templateIndex) =>
		buildProblem(
			domainIndex * templates.length + templateIndex,
			domain,
			template,
		),
	),
);

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
