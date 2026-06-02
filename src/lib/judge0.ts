import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Problem, TestCase } from "#/data/problems";

type Judge0Status = {
	id: number;
	description: string;
};

type Judge0Submission = {
	stdout: string | null;
	stderr: string | null;
	compile_output: string | null;
	message: string | null;
	time: string | null;
	memory: number | null;
	status: Judge0Status;
};

type HarnessCaseResult = {
	testCaseId: string;
	name: string;
	passed: boolean;
	actual: unknown;
	expected: unknown;
	error: string | null;
};

type HarnessResponse = {
	results: HarnessCaseResult[];
};

export type ExecutionCaseResult = {
	testCaseId: string;
	name: string;
	passed: boolean;
	status: string;
	stdout: string | null;
	stderr: string | null;
	compileOutput: string | null;
	message: string | null;
	expected: string;
	time: string | null;
	memory: number | null;
};

export type ExecutionResponse = {
	ok: boolean;
	mode: "compile" | "submit";
	engine: "judge0" | "local-python";
	accepted: boolean;
	passed: number;
	total: number;
	results: ExecutionCaseResult[];
	message?: string;
};

const pythonLanguageId = Number(process.env.JUDGE0_PYTHON_LANGUAGE_ID ?? "71");

function stableJson(value: unknown) {
	return JSON.stringify(value);
}

function outputForCase(result: HarnessCaseResult) {
	if (result.error) {
		return result.error;
	}

	return stableJson({
		actual: result.actual,
		expected: result.expected,
	});
}

function buildHarness(problem: Problem, sourceCode: string) {
	return `import json
import sys
import traceback
import contextlib
import io

SOURCE_CODE = ${JSON.stringify(sourceCode)}
FUNCTION_NAME = ${JSON.stringify(problem.functionName)}

def _normalize(value):
    if isinstance(value, tuple):
        return [_normalize(item) for item in value]
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _normalize(value[key]) for key in sorted(value)}
    return value

payload = json.loads(sys.stdin.read() or "{}")
test_results = []
namespace = {}
setup_error = None

try:
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        exec(SOURCE_CODE, namespace)
    if "Solution" not in namespace:
        raise NameError("Expected a class named Solution in submitted code.")
except BaseException:
    setup_error = traceback.format_exc(limit=6)

for test in payload.get("tests", []):
    expected = _normalize(test.get("expected"))
    if setup_error:
        test_results.append({
            "testCaseId": test.get("id"),
            "name": test.get("name"),
            "passed": False,
            "actual": None,
            "expected": expected,
            "error": setup_error,
        })
        continue

    try:
        solution = namespace["Solution"]()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = getattr(solution, FUNCTION_NAME)(*test.get("args", []))
        actual = _normalize(result)
        test_results.append({
            "testCaseId": test.get("id"),
            "name": test.get("name"),
            "passed": actual == expected,
            "actual": actual,
            "expected": expected,
            "error": None,
        })
    except Exception:
        test_results.append({
            "testCaseId": test.get("id"),
            "name": test.get("name"),
            "passed": False,
            "actual": None,
            "expected": expected,
            "error": traceback.format_exc(limit=6),
        })

print(json.dumps({"results": test_results}, separators=(",", ":"), sort_keys=True))
`;
}

async function submitToJudge0(
	problem: Problem,
	sourceCode: string,
	testCases: TestCase[],
) {
	const judge0Url = process.env.JUDGE0_URL ?? "http://localhost:2358";
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (process.env.JUDGE0_AUTH_TOKEN) {
		headers[process.env.JUDGE0_AUTH_HEADER ?? "X-Auth-Token"] =
			process.env.JUDGE0_AUTH_TOKEN;
	}

	const response = await fetch(
		`${judge0Url.replace(/\/$/, "")}/submissions?base64_encoded=false&wait=true`,
		{
			body: JSON.stringify({
				cpu_time_limit: 3,
				enable_per_process_and_thread_memory_limit: true,
				enable_per_process_and_thread_time_limit: true,
				language_id: pythonLanguageId,
				memory_limit: 128000,
				source_code: buildHarness(problem, sourceCode),
				stdin: stableJson({
					tests: testCases.map((testCase) => ({
						args: testCase.args,
						expected: testCase.expected,
						id: testCase.id,
						name: testCase.name,
					})),
				}),
				wall_time_limit: 6,
			}),
			headers,
			method: "POST",
		},
	);

	if (!response.ok) {
		const details = await response.text();
		throw new Error(`Judge0 returned ${response.status}: ${details}`);
	}

	return (await response.json()) as Judge0Submission;
}

function localPythonFallbackEnabled() {
	return ["1", "true", "yes"].includes(
		(process.env.JUDGE0_LOCAL_PYTHON_FALLBACK ?? "").toLowerCase(),
	);
}

function submissionMessage(submission: Judge0Submission) {
	return (
		submission.message ??
		submission.stderr ??
		submission.compile_output ??
		submission.status.description
	);
}

function isSandboxStartupFailure(submission: Judge0Submission) {
	if (submission.status.id !== 13) {
		return false;
	}

	const details = [
		submission.message,
		submission.stderr,
		submission.compile_output,
		submission.status.description,
	]
		.filter(Boolean)
		.join("\n");

	return /\/box\/script\.py|Cannot run proxy|Failed to create control group|isolate/i.test(
		details,
	);
}

function localHarnessPayload(
	problem: Problem,
	sourceCode: string,
	tests: TestCase[],
) {
	return stableJson({
		functionName: problem.functionName,
		sourceCode,
		tests: tests.map((testCase) => ({
			args: testCase.args,
			expected: testCase.expected,
			id: testCase.id,
			name: testCase.name,
		})),
	});
}

async function submitToLocalPython(
	problem: Problem,
	sourceCode: string,
	testCases: TestCase[],
): Promise<Judge0Submission> {
	const pythonBin = process.env.LOCAL_PYTHON_BIN ?? "python3";
	const timeoutMs = Number(process.env.LOCAL_PYTHON_TIMEOUT_MS ?? "6000");
	const harnessPath = resolve(process.cwd(), "scripts/python_case_harness.py");

	return new Promise((resolveSubmission, rejectSubmission) => {
		const child = spawn(pythonBin, [harnessPath], {
			env: {
				...process.env,
				PYTHONDONTWRITEBYTECODE: "1",
			},
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});

		child.on("error", rejectSubmission);

		child.on("close", (code) => {
			clearTimeout(timer);

			if (timedOut) {
				resolveSubmission({
					compile_output: null,
					memory: null,
					message: `Local Python fallback exceeded ${timeoutMs}ms.`,
					status: { description: "Time Limit Exceeded", id: 5 },
					stderr: stderr.trim() || null,
					stdout: stdout.trim() || null,
					time: null,
				});
				return;
			}

			resolveSubmission({
				compile_output: null,
				memory: null,
				message:
					code === 0
						? "Judge0 sandbox unavailable; executed with local Python fallback."
						: "Local Python fallback failed before producing a valid result.",
				status:
					code === 0
						? { description: "Accepted", id: 3 }
						: { description: "Runtime Error", id: 6 },
				stderr: stderr.trim() || null,
				stdout: stdout.trim() || null,
				time: null,
			});
		});

		child.stdin.end(localHarnessPayload(problem, sourceCode, testCases));
	});
}

async function submitWithFallback(
	problem: Problem,
	sourceCode: string,
	testCases: TestCase[],
): Promise<{
	engine: ExecutionResponse["engine"];
	submission: Judge0Submission;
}> {
	const submission = await submitToJudge0(problem, sourceCode, testCases);

	if (localPythonFallbackEnabled() && isSandboxStartupFailure(submission)) {
		return {
			engine: "local-python",
			submission: await submitToLocalPython(problem, sourceCode, testCases),
		};
	}

	return { engine: "judge0", submission };
}

export async function executeProblem(
	problem: Problem,
	sourceCode: string,
	mode: "compile" | "submit",
): Promise<ExecutionResponse> {
	const scopedTests = (
		mode === "compile"
			? problem.testCases.filter((testCase) => testCase.visible)
			: problem.testCases
	).slice(0, 100);

	const results: ExecutionCaseResult[] = [];
	const { engine, submission } = await submitWithFallback(
		problem,
		sourceCode,
		scopedTests,
	);

	if (submission.status.id !== 3) {
		const failedResults = scopedTests.map((testCase) => ({
			compileOutput: submission.compile_output,
			expected: stableJson(testCase.expected),
			memory: submission.memory,
			message: submission.message,
			name: testCase.name,
			passed: false,
			status: submission.status.description,
			stderr: submission.stderr,
			stdout: submission.stdout?.trim() ?? null,
			testCaseId: testCase.id,
			time: submission.time,
		}));

		return {
			accepted: false,
			engine,
			message: submissionMessage(submission),
			mode,
			ok: true,
			passed: 0,
			results: failedResults,
			total: scopedTests.length,
		};
	}

	let harnessResponse: HarnessResponse;
	try {
		harnessResponse = JSON.parse(
			submission.stdout ?? '{"results":[]}',
		) as HarnessResponse;
	} catch {
		harnessResponse = { results: [] };
	}

	const harnessResults = new Map(
		harnessResponse.results.map((result) => [result.testCaseId, result]),
	);

	for (const testCase of scopedTests) {
		const harnessResult = harnessResults.get(testCase.id);
		const passed = harnessResult?.passed === true;

		results.push({
			compileOutput: submission.compile_output,
			expected: stableJson(testCase.expected),
			memory: submission.memory,
			message: submission.message,
			name: testCase.name,
			passed,
			status: passed ? "Accepted" : "Wrong Answer",
			stderr: submission.stderr,
			stdout: harnessResult
				? outputForCase(harnessResult)
				: (submission.stdout?.trim() ?? null),
			testCaseId: testCase.id,
			time: submission.time,
		});
	}

	const passed = results.filter((result) => result.passed).length;

	return {
		accepted: passed === scopedTests.length,
		engine,
		mode,
		ok: true,
		passed,
		results,
		total: scopedTests.length,
	};
}
