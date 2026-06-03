import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowRight,
	BrainCircuit,
	CheckCircle2,
	CircleAlert,
	Code2,
	Loader2,
	Play,
	RefreshCcw,
	Send,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

export const Route = createFileRoute("/")({ component: Home });

type Difficulty = "Easy" | "Medium" | "Hard";
type Screen = "landing" | "practice" | "recommendations";

type PublicTestCase = {
	id: string;
	name: string;
	args: unknown[];
	expected: unknown;
	visible: boolean;
};

type PublicProblem = {
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
	testCases: PublicTestCase[];
	totalTestCases: number;
};

type ExecutionCaseResult = {
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

type ExecutionResponse = {
	ok: boolean;
	mode: "compile" | "submit";
	engine: "judge0" | "local-python";
	accepted: boolean;
	passed: number;
	total: number;
	results: ExecutionCaseResult[];
	message?: string;
};

type Recommendation = {
	problemId: string;
	title: string;
	difficulty: Difficulty;
	pool: string;
	score: number;
	reason: string;
	topicPath: string[];
	features?: Record<string, number>;
	pools?: string[];
};

type RecommendationResponse = {
	recommendations: Recommendation[];
	source: "ml-server" | "local-fallback";
};

const userId = "demo-user";

function Home() {
	const [screen, setScreen] = useState<Screen>("landing");
	const [problems, setProblems] = useState<PublicProblem[]>([]);
	const [problemId, setProblemId] = useState<string>("");
	const [code, setCode] = useState("");
	const [isRunning, setIsRunning] = useState(false);
	const [activeMode, setActiveMode] = useState<"compile" | "submit" | null>(
		null,
	);
	const [runResult, setRunResult] = useState<ExecutionResponse | null>(null);
	const [recommendations, setRecommendations] =
		useState<RecommendationResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		async function loadProblems() {
			const response = await fetch("/api/problems");
			const payload = (await response.json()) as { problems: PublicProblem[] };

			if (!mounted) {
				return;
			}

			setProblems(payload.problems);
			const firstProblem = payload.problems[0];
			if (firstProblem) {
				setProblemId(firstProblem.id);
				setCode(firstProblem.starterCode);
			}
		}

		loadProblems().catch((requestError: unknown) => {
			setError(
				requestError instanceof Error
					? requestError.message
					: "Unable to load problems.",
			);
		});

		return () => {
			mounted = false;
		};
	}, []);

	const selectedProblem = useMemo(
		() => problems.find((problem) => problem.id === problemId) ?? problems[0],
		[problemId, problems],
	);

	function openProblem(nextProblemId: string) {
		const nextProblem = problems.find(
			(problem) => problem.id === nextProblemId,
		);
		if (!nextProblem) {
			return;
		}

		setProblemId(nextProblem.id);
		setCode(nextProblem.starterCode);
		setRunResult(null);
		setRecommendations(null);
		setError(null);
		setScreen("practice");
	}

	function startPractice() {
		if (selectedProblem) {
			setScreen("practice");
		}
	}

	async function execute(mode: "compile" | "submit") {
		if (!selectedProblem) {
			return;
		}

		setIsRunning(true);
		setActiveMode(mode);
		setError(null);
		setRunResult(null);

		try {
			const response = await fetch("/api/execute", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode,
					problemId: selectedProblem.id,
					sourceCode: code,
					userId,
				}),
			});
			const payload = (await response.json()) as ExecutionResponse;

			if (!response.ok || !payload.ok) {
				throw new Error(payload.message ?? "Execution failed.");
			}

			setRunResult(payload);

			if (mode === "submit" && payload.accepted) {
				await loadRecommendations(selectedProblem.id);
				setScreen("recommendations");
			}
		} catch (requestError: unknown) {
			setError(
				requestError instanceof Error
					? requestError.message
					: "Execution failed.",
			);
		} finally {
			setIsRunning(false);
			setActiveMode(null);
		}
	}

	async function loadRecommendations(solvedProblemId: string) {
		const params = new URLSearchParams({
			problemId: solvedProblemId,
			userId,
		});
		const response = await fetch(`/api/recommendations?${params.toString()}`);
		const payload = (await response.json()) as RecommendationResponse;
		setRecommendations(payload);
	}

	if (!selectedProblem) {
		return (
			<main className="app-shell loading-shell">
				<Loader2 className="spin" size={22} />
				<span>{error ?? "Loading coding workspace..."}</span>
			</main>
		);
	}

	if (screen === "landing") {
		return (
			<main className="app-shell landing-page">
				<section className="landing-hero">
					<div className="landing-copy">
						<div className="brand-lockup landing-brand">
							<div className="brand-mark">
								<BrainCircuit size={21} />
							</div>
							<p>Metis</p>
						</div>
						<h1>
							Practice code. Get the next problem from your actual run history.
						</h1>
						<p>
							Solve one problem, submit it, and Metis ranks three next coding
							questions from compiles, test progress, topic readiness, and
							review timing.
						</p>
						<button
							className="primary-button start-button"
							disabled={problems.length === 0}
							onClick={startPractice}
							type="button"
						>
							Start
							<ArrowRight size={18} />
						</button>
					</div>
				</section>
			</main>
		);
	}

	if (screen === "recommendations") {
		return (
			<main className="app-shell recommendations-page">
				<section className="recommendations-view">
					<div className="recommendations-title">
						<span>Next</span>
						<h1>Choose your next coding problem.</h1>
						<p>
							These are ranked from your submit result and recent compile/test
							history.
						</p>
					</div>

					<div className="recommendation-list standalone">
						{recommendations?.recommendations.slice(0, 3).map((item) => (
							<button
								className="recommendation-row"
								key={`${item.pool}-${item.problemId}`}
								onClick={() => openProblem(item.problemId)}
								type="button"
							>
								<span>{item.pool}</span>
								<strong>{item.title}</strong>
								<small>{item.reason}</small>
								<em>{Math.round(item.score * 100)}%</em>
							</button>
						))}
					</div>
				</section>
			</main>
		);
	}

	const accepted = runResult?.accepted === true;

	return (
		<main className="app-shell practice-page">
			<section className="practice-workspace">
				<section className="problem-panel">
					<div className="problem-meta">
						<span
							className={`difficulty ${selectedProblem.difficulty.toLowerCase()}`}
						>
							{selectedProblem.difficulty}
						</span>
					</div>

					<h1>{selectedProblem.title}</h1>
					<p className="prompt">{selectedProblem.prompt}</p>

					<div className="contract-grid">
						<div>
							<span>Input</span>
							<p>{selectedProblem.inputContract}</p>
						</div>
						<div>
							<span>Output</span>
							<p>{selectedProblem.outputContract}</p>
						</div>
					</div>

					<div className="section-block">
						<h2>Public Test Cases</h2>
						<div className="examples">
							{selectedProblem.testCases.map((testCase) => (
								<div className="example" key={testCase.id}>
									<strong>{testCase.name}</strong>
									<code>args = {JSON.stringify(testCase.args)}</code>
									<code>expected = {JSON.stringify(testCase.expected)}</code>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="editor-panel">
					<div className="editor-toolbar">
						<div>
							<span>Python 3</span>
							<strong>Solution.{selectedProblem.functionName}</strong>
						</div>
						<div className="toolbar-actions">
							<button
								className="ghost-button"
								onClick={() => setCode(selectedProblem.starterCode)}
								type="button"
							>
								<RefreshCcw size={16} />
								Reset
							</button>
							<button
								className="secondary-button"
								disabled={isRunning}
								onClick={() => execute("compile")}
								type="button"
							>
								{activeMode === "compile" ? (
									<Loader2 className="spin" size={16} />
								) : (
									<Play size={16} />
								)}
								Compile
							</button>
							<button
								className="primary-button"
								disabled={isRunning}
								onClick={() => execute("submit")}
								type="button"
							>
								{activeMode === "submit" ? (
									<Loader2 className="spin" size={16} />
								) : (
									<Send size={16} />
								)}
								Submit
							</button>
						</div>
					</div>

					<div className="editor-frame">
						<Suspense
							fallback={
								<div className="editor-loading">
									<Code2 size={18} />
									Loading Monaco...
								</div>
							}
						>
							<MonacoEditor
								height="100%"
								language="python"
								onChange={(value) => setCode(value ?? "")}
								options={{
									fontFamily:
										"JetBrains Mono, SFMono-Regular, Menlo, monospace",
									fontSize: 14,
									lineNumbersMinChars: 3,
									minimap: { enabled: false },
									padding: { top: 18, bottom: 18 },
									renderLineHighlight: "all",
									scrollBeyondLastLine: false,
									tabSize: 4,
									wordWrap: "on",
								}}
								theme="vs-dark"
								value={code}
							/>
						</Suspense>
					</div>

					{error ? (
						<div className="notice error">
							<CircleAlert size={18} />
							<span>{error}</span>
						</div>
					) : null}

					{runResult ? (
						<div
							className={accepted ? "result-panel accepted" : "result-panel"}
						>
							<div className="result-summary">
								<div>
									{accepted ? (
										<CheckCircle2 size={20} />
									) : (
										<CircleAlert size={20} />
									)}
									<strong>
										{accepted
											? "Accepted"
											: `${runResult.passed}/${runResult.total} tests passed`}
									</strong>
								</div>
								<span>
									{runResult.mode === "submit" ? "Submit" : "Compile"}
								</span>
							</div>
							<div className="case-results">
								{runResult.results.map((result) => (
									<div
										className={
											result.passed ? "case-row passed" : "case-row failed"
										}
										key={result.testCaseId}
									>
										<div>
											<strong>{result.name}</strong>
											<span>{result.status}</span>
										</div>
										<code>
											{result.stdout ||
												result.stderr ||
												result.compileOutput ||
												result.message ||
												"No output"}
										</code>
									</div>
								))}
							</div>
						</div>
					) : null}
				</section>
			</section>
		</main>
	);
}
