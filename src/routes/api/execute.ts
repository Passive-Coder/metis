import { createFileRoute } from "@tanstack/react-router";

import { getProblem } from "#/data/problems";
import { jsonResponse } from "#/lib/json";
import { executeProblem } from "#/lib/judge0";

type ExecutePayload = {
	mode?: "compile" | "submit";
	problemId?: string;
	sourceCode?: string;
};

export const Route = createFileRoute("/api/execute")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const payload = (await request.json()) as ExecutePayload;
				const mode = payload.mode ?? "compile";

				if (mode !== "compile" && mode !== "submit") {
					return jsonResponse(
						{ ok: false, message: "Mode must be compile or submit." },
						{ status: 400 },
					);
				}

				if (!payload.problemId || typeof payload.sourceCode !== "string") {
					return jsonResponse(
						{ ok: false, message: "problemId and sourceCode are required." },
						{ status: 400 },
					);
				}

				const problem = getProblem(payload.problemId);
				if (!problem) {
					return jsonResponse(
						{ ok: false, message: "Problem not found." },
						{ status: 404 },
					);
				}

				try {
					return jsonResponse(
						await executeProblem(problem, payload.sourceCode, mode),
					);
				} catch (error: unknown) {
					const message =
						error instanceof Error
							? error.message
							: "Unable to reach the Judge0 execution engine.";

					return jsonResponse(
						{
							accepted: false,
							message,
							mode,
							ok: false,
							passed: 0,
							results: [],
							total:
								mode === "compile"
									? problem.testCases.filter((testCase) => testCase.visible)
											.length
									: problem.testCases.length,
						},
						{ status: 503 },
					);
				}
			},
		},
	},
});
