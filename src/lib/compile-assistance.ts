import type { Problem } from "#/data/problems";
import type { ExecutionResponse } from "#/lib/judge0";

export type CompileHighlight = {
	line: number;
	message: string;
	severity: "error" | "warning";
	suggestion?: string;
};

export type CompileMcqOption = {
	code?: string;
	id: string;
	label: string;
};

export type CompileMcq = {
	answerId: string;
	code: string;
	explanation: string;
	id: string;
	options: CompileMcqOption[];
	prompt: string;
};

export type CompileAssistance = {
	highlights: CompileHighlight[];
	mcqs: CompileMcq[];
	source: "disabled" | "heuristic" | "llm";
	summary: string;
};

type LlmHighlight = Partial<CompileHighlight>;
type LlmMcq = Partial<CompileMcq>;

const maxPromptSourceLines = 220;
const llmTimeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? "8000");

function lineNumberedSource(sourceCode: string) {
	return sourceCode
		.split("\n")
		.slice(0, maxPromptSourceLines)
		.map((line, index) => `${index + 1}: ${line}`)
		.join("\n");
}

function failureDetails(execution: ExecutionResponse) {
	return execution.results
		.filter((result) => !result.passed)
		.slice(0, 4)
		.map((result) => ({
			compileOutput: result.compileOutput,
			expected: result.expected,
			message: result.message,
			name: result.name,
			status: result.status,
			stderr: result.stderr,
			stdout: result.stdout,
		}));
}

function extractJsonObject(value: string) {
	const trimmed = value.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		return trimmed;
	}

	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) {
		return trimmed.slice(start, end + 1);
	}

	return "";
}

function normalizeHighlights(value: unknown, sourceCode: string) {
	const lineCount = Math.max(1, sourceCode.split("\n").length);
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((item: LlmHighlight) => ({
			line: Math.min(lineCount, Math.max(1, Number(item.line) || 1)),
			message:
				typeof item.message === "string" && item.message.trim()
					? item.message.trim()
					: "Review this line against the failing output.",
			severity: item.severity === "warning" ? "warning" : "error",
			suggestion:
				typeof item.suggestion === "string" && item.suggestion.trim()
					? item.suggestion.trim()
					: undefined,
		}))
		.slice(0, 5);
}

function normalizeMcqs(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((item: LlmMcq, index) => {
			const options = Array.isArray(item.options)
				? item.options
						.map((option, optionIndex) => ({
							code:
								typeof option?.code === "string" && option.code.trim()
									? option.code.trim()
									: undefined,
							id:
								typeof option?.id === "string" && option.id.trim()
									? option.id.trim()
									: String.fromCharCode(97 + optionIndex),
							label:
								typeof option?.label === "string" && option.label.trim()
									? option.label.trim()
									: `Option ${optionIndex + 1}`,
						}))
						.slice(0, 4)
				: [];

			if (options.length < 2) {
				return null;
			}

			const answerId =
				typeof item.answerId === "string" &&
				options.some((option) => option.id === item.answerId)
					? item.answerId
					: options[0]?.id;

			if (!answerId) {
				return null;
			}

			return {
				answerId,
				code: typeof item.code === "string" ? item.code.trim() : "",
				explanation:
					typeof item.explanation === "string" && item.explanation.trim()
						? item.explanation.trim()
						: "Compare the control flow and returned value with the failing test.",
				id:
					typeof item.id === "string" && item.id.trim()
						? item.id.trim()
						: `compile-mcq-${index + 1}`,
				options,
				prompt:
					typeof item.prompt === "string" && item.prompt.trim()
						? item.prompt.trim()
						: "Which snippet best fixes the highlighted mistake?",
			};
		})
		.filter((item): item is CompileMcq => item !== null)
		.slice(0, 2);
}

async function callLlmAssistance({
	execution,
	failedCompileStreak,
	problem,
	sourceCode,
}: {
	execution: ExecutionResponse;
	failedCompileStreak: number;
	problem: Problem;
	sourceCode: string;
}): Promise<CompileAssistance | null> {
	const serverUrl = process.env.LLM_SERVER_URL ?? process.env.VLLM_SERVER_URL;
	if (!serverUrl) {
		return null;
	}

	const model =
		process.env.LLM_MODEL ??
		process.env.VLLM_MODEL ??
		"Qwen/Qwen2.5-Coder-0.5B-Instruct";
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), llmTimeoutMs);

	try {
		const response = await fetch(
			`${serverUrl.replace(/\/$/, "")}/v1/chat/completions`,
			{
				body: JSON.stringify({
					messages: [
						{
							content:
								"You are a precise Python tutor inside a coding practice app. Return only strict JSON.",
							role: "system",
						},
						{
							content: JSON.stringify({
								failedCompileStreak,
								failureDetails: failureDetails(execution),
								instructions:
									"Identify likely incorrect source lines. If failedCompileStreak is 3 or more, include one or two MCQs with code snippets. Do not reveal more than the minimum fix.",
								outputSchema: {
									highlights: [
										{
											line: 4,
											message: "short diagnosis",
											severity: "error",
											suggestion: "short next action",
										},
									],
									mcqs: [
										{
											answerId: "b",
											code: "small surrounding code snippet",
											explanation: "why the answer is correct",
											id: "q1",
											options: [
												{ code: "wrong code", id: "a", label: "A" },
												{ code: "correct code", id: "b", label: "B" },
											],
											prompt: "question text",
										},
									],
									summary: "one sentence",
								},
								problem: {
									functionName: problem.functionName,
									inputContract: problem.inputContract,
									outputContract: problem.outputContract,
									prompt: problem.prompt,
									title: problem.title,
								},
								sourceCode: lineNumberedSource(sourceCode),
							}),
							role: "user",
						},
					],
					model,
					response_format: { type: "json_object" },
					temperature: 0.2,
				}),
				headers: {
					"Content-Type": "application/json",
					...(process.env.LLM_API_KEY
						? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
						: {}),
				},
				method: "POST",
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = payload.choices?.[0]?.message?.content;
		if (!content) {
			return null;
		}

		const parsed = JSON.parse(extractJsonObject(content)) as {
			highlights?: unknown;
			mcqs?: unknown;
			summary?: unknown;
		};

		const highlights = normalizeHighlights(parsed.highlights, sourceCode);
		return {
			highlights,
			mcqs: failedCompileStreak >= 3 ? normalizeMcqs(parsed.mcqs) : [],
			source: "llm",
			summary:
				typeof parsed.summary === "string" && parsed.summary.trim()
					? parsed.summary.trim()
					: (highlights[0]?.message ?? "Review the highlighted failing line."),
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function tracebackLine(details: string) {
	const matches = [...details.matchAll(/File "<string>", line (\d+)/g)];
	const last = matches.at(-1);
	return last ? Number(last[1]) : null;
}

function firstInterestingLine(sourceCode: string) {
	const lines = sourceCode.split("\n");
	const passIndex = lines.findIndex((line) => /^\s*pass\s*(#.*)?$/.test(line));
	if (passIndex >= 0) {
		return passIndex + 1;
	}

	const returnIndex = lines.findIndex((line) => /^\s*return\b/.test(line));
	if (returnIndex >= 0) {
		return returnIndex + 1;
	}

	const functionIndex = lines.findIndex((line) => /^\s*def\s+/.test(line));
	return functionIndex >= 0 ? functionIndex + 1 : 1;
}

function referenceOption(problem: Problem) {
	const referenceLines = problem.referenceSolution
		.split("\n")
		.map((line) => line.trim())
		.filter(
			(line) =>
				line &&
				!line.startsWith("class ") &&
				!line.startsWith("def ") &&
				!line.startsWith("#"),
		);

	return referenceLines[0] ?? "return result";
}

function sourceContext(sourceCode: string, line: number) {
	const lines = sourceCode.split("\n");
	const start = Math.max(0, line - 3);
	const end = Math.min(lines.length, line + 2);
	return lines.slice(start, end).join("\n");
}

function fallbackMcq(problem: Problem, sourceCode: string, line: number) {
	const currentLine = sourceCode.split("\n")[line - 1]?.trim() || "pass";
	const correct = referenceOption(problem);

	return {
		answerId: "b",
		code: sourceContext(sourceCode, line),
		explanation:
			"The correct choice starts building the algorithm state used by the reference approach instead of keeping the current failing behavior.",
		id: "compile-remediation-1",
		options: [
			{
				code: currentLine,
				id: "a",
				label: "Keep the highlighted line",
			},
			{
				code: correct,
				id: "b",
				label: "Use the algorithm step",
			},
			{
				code: "return None",
				id: "c",
				label: "Exit immediately",
			},
		],
		prompt: "Which snippet is the best next correction for this failure?",
	};
}

function heuristicAssistance({
	execution,
	failedCompileStreak,
	problem,
	sourceCode,
}: {
	execution: ExecutionResponse;
	failedCompileStreak: number;
	problem: Problem;
	sourceCode: string;
}): CompileAssistance {
	const details = failureDetails(execution)
		.map((item) =>
			[item.status, item.message, item.stderr, item.compileOutput, item.stdout]
				.filter(Boolean)
				.join("\n"),
		)
		.join("\n\n");
	const line = tracebackLine(details) ?? firstInterestingLine(sourceCode);
	const hasTraceback =
		/Traceback|SyntaxError|NameError|TypeError|IndexError/i.test(details);
	const summary = hasTraceback
		? "The failing run points to a Python error on the highlighted line."
		: "The visible tests disagree with the returned value near the highlighted line.";

	return {
		highlights: [
			{
				line,
				message: hasTraceback
					? "Python reported the failure here or inside code called from here."
					: "This line is the most likely source of the wrong output.",
				severity: "error",
				suggestion: hasTraceback
					? "Read the traceback, then check names, indentation, indexing, and argument shape."
					: "Compare this logic with the expected output from the failed test.",
			},
		],
		mcqs:
			failedCompileStreak >= 3 ? [fallbackMcq(problem, sourceCode, line)] : [],
		source:
			process.env.LLM_SERVER_URL || process.env.VLLM_SERVER_URL
				? "heuristic"
				: "disabled",
		summary,
	};
}

export async function buildCompileAssistance({
	execution,
	failedCompileStreak,
	problem,
	sourceCode,
}: {
	execution: ExecutionResponse;
	failedCompileStreak: number;
	problem: Problem;
	sourceCode: string;
}) {
	if (execution.mode !== "compile" || execution.accepted) {
		return undefined;
	}

	return (
		(await callLlmAssistance({
			execution,
			failedCompileStreak,
			problem,
			sourceCode,
		})) ??
		heuristicAssistance({
			execution,
			failedCompileStreak,
			problem,
			sourceCode,
		})
	);
}
