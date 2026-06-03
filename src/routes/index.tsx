import type { OnMount } from "@monaco-editor/react";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowRight,
	BrainCircuit,
	CheckCircle2,
	ChevronRight,
	CircleAlert,
	Clock,
	Code2,
	Flame,
	Loader2,
	Play,
	RefreshCcw,
	Send,
	Sparkles,
	Target,
	Trophy,
} from "lucide-react";
import type * as Monaco from "monaco-editor";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

type CompileHighlight = {
	line: number;
	message: string;
	severity: "error" | "warning";
	suggestion?: string;
};

type CompileMcqOption = {
	code?: string;
	id: string;
	label: string;
};

type CompileMcq = {
	answerId: string;
	code: string;
	explanation: string;
	id: string;
	options: CompileMcqOption[];
	prompt: string;
};

type CompileAssistance = {
	highlights: CompileHighlight[];
	mcqs: CompileMcq[];
	source: "disabled" | "heuristic" | "llm";
	summary: string;
};

type ExecutionResponse = {
	ok: boolean;
	mode: "compile" | "submit";
	engine: "judge0" | "local-python";
	accepted: boolean;
	passed: number;
	total: number;
	results: ExecutionCaseResult[];
	assistance?: CompileAssistance;
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

type EditorMetrics = {
	activeMs: number;
	charsAdded: number;
	charsDeleted: number;
	deleteCount: number;
	editCount: number;
	focusMs: number;
	idleMs: number;
	keystrokeCount: number;
	maxPauseMs: number;
	netChars: number;
	pasteCount: number;
	pauseCount: number;
	typingBursts: number;
};

const userId = "demo-user";
const pauseThresholdMs = 3000;
const burstThresholdMs = 900;

function emptyEditorMetrics(): EditorMetrics {
	return {
		activeMs: 0,
		charsAdded: 0,
		charsDeleted: 0,
		deleteCount: 0,
		editCount: 0,
		focusMs: 0,
		idleMs: 0,
		keystrokeCount: 0,
		maxPauseMs: 0,
		netChars: 0,
		pasteCount: 0,
		pauseCount: 0,
		typingBursts: 0,
	};
}

function difficultyClass(difficulty: Difficulty) {
	return {
		Easy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
		Hard: "border-red-500/30 bg-red-500/10 text-red-300",
		Medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	}[difficulty];
}

function outputForCase(result: ExecutionCaseResult) {
	return (
		result.stdout ||
		result.stderr ||
		result.compileOutput ||
		result.message ||
		"No output"
	);
}

function sourceLabel(source: CompileAssistance["source"]) {
	if (source === "llm") {
		return "LLM review";
	}
	if (source === "heuristic") {
		return "Compile review";
	}
	return "Review disabled";
}

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
	const [compileAssistance, setCompileAssistance] =
		useState<CompileAssistance | null>(null);
	const [failedCompileStreak, setFailedCompileStreak] = useState(0);
	const [mcqAnswers, setMcqAnswers] = useState<Record<string, string>>({});
	const codeRef = useRef("");
	const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
	const assistanceDecorationsRef =
		useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
	const monacoRef = useRef<typeof Monaco | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const sessionProblemIdRef = useRef<string | null>(null);
	const sessionStartedAtRef = useRef(0);
	const lastEditAtRef = useRef(0);
	const metricsRef = useRef<EditorMetrics>(emptyEditorMetrics());

	useEffect(() => {
		codeRef.current = code;
	}, [code]);

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

	const metricsSnapshot = useCallback(() => {
		const metrics = metricsRef.current;
		const elapsedMs = sessionStartedAtRef.current
			? Date.now() - sessionStartedAtRef.current
			: 0;
		return {
			...metrics,
			elapsedMs,
			focusMs: metrics.activeMs,
			typingSpeedCpm:
				metrics.activeMs > 0
					? Math.round((metrics.charsAdded / metrics.activeMs) * 60000)
					: 0,
		};
	}, []);

	const sendEditorEvent = useCallback(
		(
			eventType: "open" | "heartbeat" | "compile" | "submit" | "close",
			options: {
				keepalive?: boolean;
				problemId?: string;
				sourceCode?: string;
			} = {},
		) => {
			const sessionId = sessionIdRef.current;
			const activeProblemId = options.problemId ?? sessionProblemIdRef.current;
			if (!sessionId || !activeProblemId) {
				return Promise.resolve();
			}

			return fetch("/api/editor-events", {
				body: JSON.stringify({
					eventType,
					metrics: metricsSnapshot(),
					problemId: activeProblemId,
					sessionId,
					sourceCode: options.sourceCode,
					userId,
				}),
				headers: { "Content-Type": "application/json" },
				keepalive: options.keepalive,
				method: "POST",
			}).catch(() => undefined);
		},
		[metricsSnapshot],
	);

	const handleEditorMount: OnMount = (editor, monaco) => {
		editorRef.current = editor;
		monacoRef.current = monaco;
		assistanceDecorationsRef.current = editor.createDecorationsCollection();
	};

	useEffect(() => {
		const decorations = assistanceDecorationsRef.current;
		const monaco = monacoRef.current;
		if (!decorations || !monaco) {
			return;
		}

		if (!compileAssistance?.highlights.length) {
			decorations.clear();
			return;
		}

		decorations.set(
			compileAssistance.highlights.map((highlight) => ({
				options: {
					className:
						highlight.severity === "warning"
							? "compile-assist-line warning"
							: "compile-assist-line error",
					glyphMarginClassName:
						highlight.severity === "warning"
							? "compile-assist-glyph warning"
							: "compile-assist-glyph error",
					hoverMessage: {
						value: `**${highlight.message}**${
							highlight.suggestion ? `\n\n${highlight.suggestion}` : ""
						}`,
					},
					isWholeLine: true,
				},
				range: new monaco.Range(highlight.line, 1, highlight.line, 1),
			})),
		);
	}, [compileAssistance]);

	const closeEditorSession = useCallback(() => {
		if (!sessionIdRef.current) {
			return;
		}
		void sendEditorEvent("close", {
			keepalive: true,
			sourceCode: codeRef.current,
		});
		sessionIdRef.current = null;
		sessionProblemIdRef.current = null;
	}, [sendEditorEvent]);

	function beginEditorSession(problem: PublicProblem, initialCode: string) {
		closeEditorSession();
		sessionIdRef.current = crypto.randomUUID();
		sessionProblemIdRef.current = problem.id;
		sessionStartedAtRef.current = Date.now();
		lastEditAtRef.current = 0;
		metricsRef.current = {
			...emptyEditorMetrics(),
			netChars: initialCode.length,
		};
		codeRef.current = initialCode;
		void sendEditorEvent("open", {
			problemId: problem.id,
			sourceCode: initialCode,
		});
	}

	useEffect(() => {
		if (screen !== "practice") {
			return;
		}

		const interval = window.setInterval(() => {
			void sendEditorEvent("heartbeat");
		}, 15_000);

		return () => window.clearInterval(interval);
	}, [screen, sendEditorEvent]);

	useEffect(() => {
		const closeOnUnload = () => closeEditorSession();
		window.addEventListener("pagehide", closeOnUnload);
		return () => {
			window.removeEventListener("pagehide", closeOnUnload);
			closeEditorSession();
		};
	}, [closeEditorSession]);

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
		setCompileAssistance(null);
		setFailedCompileStreak(0);
		setMcqAnswers({});
		setError(null);
		beginEditorSession(nextProblem, nextProblem.starterCode);
		setScreen("practice");
	}

	function startPractice() {
		if (selectedProblem) {
			beginEditorSession(selectedProblem, code);
			setScreen("practice");
		}
	}

	function handleCodeChange(value: string | undefined) {
		const nextCode = value ?? "";
		const previousCode = codeRef.current;
		const now = Date.now();
		const metrics = metricsRef.current;
		const gap = lastEditAtRef.current > 0 ? now - lastEditAtRef.current : 0;

		if (gap > 0) {
			if (gap > pauseThresholdMs) {
				metrics.pauseCount += 1;
				metrics.idleMs += gap;
				metrics.maxPauseMs = Math.max(metrics.maxPauseMs, gap);
			} else {
				metrics.activeMs += gap;
			}
			if (gap > burstThresholdMs) {
				metrics.typingBursts += 1;
			}
		} else {
			metrics.typingBursts += 1;
		}

		const delta = nextCode.length - previousCode.length;
		metrics.editCount += 1;
		metrics.keystrokeCount += Math.max(1, Math.abs(delta));
		metrics.netChars = nextCode.length;
		if (delta > 0) {
			metrics.charsAdded += delta;
			if (delta >= 12) {
				metrics.pasteCount += 1;
			}
		} else if (delta < 0) {
			metrics.charsDeleted += Math.abs(delta);
			metrics.deleteCount += 1;
		}

		lastEditAtRef.current = now;
		codeRef.current = nextCode;
		setCode(nextCode);
		if (compileAssistance) {
			setCompileAssistance(null);
			setMcqAnswers({});
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
		setCompileAssistance(null);
		setMcqAnswers({});

		const nextFailedCompileStreak =
			mode === "compile" ? failedCompileStreak + 1 : failedCompileStreak;

		try {
			await sendEditorEvent(mode, { sourceCode: code });
			const response = await fetch("/api/execute", {
				body: JSON.stringify({
					failedCompileStreak: nextFailedCompileStreak,
					mode,
					problemId: selectedProblem.id,
					sourceCode: code,
					userId,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const payload = (await response.json()) as ExecutionResponse;

			if (!response.ok || !payload.ok) {
				throw new Error(payload.message ?? "Execution failed.");
			}

			setRunResult(payload);
			if (mode === "compile") {
				if (payload.accepted) {
					setFailedCompileStreak(0);
					setCompileAssistance(null);
				} else {
					setFailedCompileStreak(nextFailedCompileStreak);
					setCompileAssistance(payload.assistance ?? null);
				}
			}

			if (mode === "submit" && payload.accepted) {
				await loadRecommendations(selectedProblem.id);
				closeEditorSession();
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
			<main className="min-h-svh bg-background text-foreground">
				<div className="flex min-h-svh items-center justify-center px-6">
					<Card className="w-full max-w-sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Loader2 className="size-4 animate-spin" />
								Metis is loading
							</CardTitle>
							<CardDescription>
								{error ?? "Preparing the coding workspace."}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-4/5" />
						</CardContent>
					</Card>
				</div>
			</main>
		);
	}

	if (screen === "landing") {
		return (
			<main className="min-h-svh bg-background text-foreground">
				<AppHeader
					activeScreen={screen}
					failedCompileStreak={failedCompileStreak}
					onNavigate={(target) => {
						if (target === "practice") {
							startPractice();
						} else {
							setScreen(target);
						}
					}}
				/>
				<section className="mx-auto grid min-h-[calc(100svh-73px)] w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_380px]">
					<div className="grid content-center gap-6">
						<div className="max-w-3xl space-y-6">
							<Badge className="bg-primary/10 text-primary" variant="outline">
								<BrainCircuit className="size-3" />
								Adaptive practice workspace
							</Badge>
							<div className="space-y-4">
								<h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-normal text-balance md:text-7xl">
									Metis
								</h1>
								<p className="max-w-2xl text-lg leading-8 text-muted-foreground">
									Practice problems, compile against visible tests, and get the
									next question ranked from five recommendation pools.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<Button
									disabled={problems.length === 0}
									onClick={startPractice}
									size="lg"
									type="button"
								>
									Start practice
									<ArrowRight />
								</Button>
								<Button
									onClick={() => openProblem(selectedProblem.id)}
									size="lg"
									type="button"
									variant="outline"
								>
									Open first problem
								</Button>
							</div>
						</div>
						<div className="grid gap-3 sm:grid-cols-3">
							<MetricTile
								icon={<Target className="size-4" />}
								label="Problems loaded"
								value={String(problems.length)}
							/>
							<MetricTile
								icon={<Clock className="size-4" />}
								label="Current estimate"
								value={`${selectedProblem.estimatedMinutes} min`}
							/>
							<MetricTile
								icon={<Sparkles className="size-4" />}
								label="Tutor mode"
								value="LLM ready"
							/>
						</div>
					</div>
					<Card className="self-center">
						<CardHeader>
							<CardTitle>Current problem</CardTitle>
							<CardDescription>
								The starter task queued for this session.
							</CardDescription>
							<CardAction>
								<Badge
									className={difficultyClass(selectedProblem.difficulty)}
									variant="outline"
								>
									{selectedProblem.difficulty}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent className="space-y-5">
							<div className="space-y-2">
								<h2 className="text-2xl font-semibold leading-tight">
									{selectedProblem.title}
								</h2>
								<p className="text-sm leading-6 text-muted-foreground">
									{selectedProblem.prompt}
								</p>
							</div>
							<Separator />
							<div className="grid gap-3">
								<InfoLine label="Function" value={selectedProblem.functionName} />
								<InfoLine
									label="Visible tests"
									value={`${selectedProblem.testCases.length}/${selectedProblem.totalTestCases}`}
								/>
								<InfoLine
									label="Topics"
									value={selectedProblem.topics.join(", ")}
								/>
							</div>
						</CardContent>
					</Card>
				</section>
			</main>
		);
	}

	if (screen === "recommendations") {
		return (
			<main className="min-h-svh bg-background text-foreground">
				<AppHeader
					activeScreen={screen}
					failedCompileStreak={failedCompileStreak}
					onNavigate={(target) => {
						if (target === "practice") {
							startPractice();
						} else {
							setScreen(target);
						}
					}}
				/>
				<section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:px-6">
					<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
						<div className="space-y-3">
							<Badge variant="outline">
								<Trophy className="size-3" />
								{recommendations?.source ?? "local-fallback"}
							</Badge>
							<div className="space-y-2">
								<h1 className="text-4xl font-semibold tracking-normal md:text-6xl">
									Choose the next problem
								</h1>
								<p className="max-w-2xl text-muted-foreground">
									The list reflects your last accepted submit and recent compile
									history.
								</p>
							</div>
						</div>
						<Button onClick={startPractice} type="button" variant="outline">
							Return to editor
						</Button>
					</div>
					<div className="grid gap-3">
						{recommendations?.recommendations.slice(0, 3).map((item, index) => (
							<RecommendationButton
								index={index}
								item={item}
								key={`${item.pool}-${item.problemId}`}
								onOpen={() => openProblem(item.problemId)}
							/>
						))}
					</div>
				</section>
			</main>
		);
	}

	const accepted = runResult?.accepted === true;
	const activeAssistance = compileAssistance ?? runResult?.assistance ?? null;

	return (
		<main className="min-h-svh bg-background text-foreground">
			<AppHeader
				activeScreen={screen}
				failedCompileStreak={failedCompileStreak}
				onNavigate={(target) => {
					if (target === "practice") {
						setScreen("practice");
					} else {
						setScreen(target);
					}
				}}
			/>
			<section className="mx-auto grid h-[calc(100svh-73px)] w-full max-w-[1600px] grid-cols-1 gap-4 px-4 py-4 md:px-6 xl:grid-cols-[410px_minmax(0,1fr)_390px]">
				<Card className="min-h-0 overflow-hidden py-0">
					<CardHeader className="border-b px-5 py-4">
						<div className="flex items-start justify-between gap-3">
							<div className="space-y-2">
								<Badge
									className={difficultyClass(selectedProblem.difficulty)}
									variant="outline"
								>
									{selectedProblem.difficulty}
								</Badge>
								<CardTitle className="text-2xl leading-tight">
									{selectedProblem.title}
								</CardTitle>
								<CardDescription>
									{selectedProblem.estimatedMinutes} minutes ·{" "}
									{selectedProblem.totalTestCases} tests
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<ScrollArea className="h-full min-h-0">
						<CardContent className="space-y-6 px-5 py-5">
							<ProblemSection title="Prompt">
								<p className="text-sm leading-6 text-muted-foreground">
									{selectedProblem.prompt}
								</p>
							</ProblemSection>
							<ProblemSection title="Contract">
								<div className="grid gap-4">
									<InfoLine label="Input" value={selectedProblem.inputContract} />
									<InfoLine
										label="Output"
										value={selectedProblem.outputContract}
									/>
								</div>
							</ProblemSection>
							<ProblemSection title="Topics">
								<div className="flex flex-wrap gap-2">
									{selectedProblem.topics.map((topic) => (
										<Badge key={topic} variant="secondary">
											{topic}
										</Badge>
									))}
								</div>
							</ProblemSection>
							<ProblemSection title="Public test cases">
								<div className="divide-y rounded-md border">
									{selectedProblem.testCases.map((testCase) => (
										<div className="space-y-2 p-3" key={testCase.id}>
											<div className="text-sm font-medium">{testCase.name}</div>
											<pre className="overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
												{`args = ${JSON.stringify(testCase.args)}\nexpected = ${JSON.stringify(testCase.expected)}`}
											</pre>
										</div>
									))}
								</div>
							</ProblemSection>
						</CardContent>
					</ScrollArea>
				</Card>

				<div className="grid min-h-[620px] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 xl:min-h-0">
					<Card className="py-0">
						<CardContent className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
							<div className="min-w-0">
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Code2 className="size-4" />
									Python 3
								</div>
								<h2 className="truncate text-lg font-semibold">
									Solution.{selectedProblem.functionName}
								</h2>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									onClick={() => handleCodeChange(selectedProblem.starterCode)}
									type="button"
									variant="outline"
								>
									<RefreshCcw />
									Reset
								</Button>
								<Button
									disabled={isRunning}
									onClick={() => execute("compile")}
									type="button"
									variant="secondary"
								>
									{activeMode === "compile" ? (
										<Loader2 className="animate-spin" />
									) : (
										<Play />
									)}
									Compile
								</Button>
								<Button
									disabled={isRunning}
									onClick={() => execute("submit")}
									type="button"
								>
									{activeMode === "submit" ? (
										<Loader2 className="animate-spin" />
									) : (
										<Send />
									)}
									Submit
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card className="min-h-0 overflow-hidden py-0">
						<Suspense
							fallback={
								<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
									<Code2 className="size-4" />
									Loading Monaco
								</div>
							}
						>
							<MonacoEditor
								height="100%"
								language="python"
								onChange={handleCodeChange}
								onMount={handleEditorMount}
								options={{
									fontFamily:
										"JetBrains Mono, SFMono-Regular, Menlo, monospace",
									fontSize: 14,
									glyphMargin: true,
									lineNumbersMinChars: 3,
									minimap: { enabled: false },
									padding: { bottom: 18, top: 18 },
									renderLineHighlight: "all",
									scrollBeyondLastLine: false,
									tabSize: 4,
									wordWrap: "on",
								}}
								theme="vs-dark"
								value={code}
							/>
						</Suspense>
					</Card>

					{error ? (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertTitle>Execution failed</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}
				</div>

				<div className="grid min-h-0 gap-4 xl:grid-rows-[auto_minmax(0,1fr)]">
					<StatusCard
						accepted={accepted}
						failedCompileStreak={failedCompileStreak}
						runResult={runResult}
					/>
					<Card className="min-h-[360px] overflow-hidden py-0">
						<CardHeader className="border-b px-5 py-4">
							<CardTitle>Run output</CardTitle>
							<CardDescription>
								Compiler response, test details, and tutor feedback.
							</CardDescription>
						</CardHeader>
						<ScrollArea className="h-full min-h-0">
							<CardContent className="space-y-5 px-5 py-5">
								{runResult ? (
									<RunResultPanel
										activeAssistance={activeAssistance}
										failedCompileStreak={failedCompileStreak}
										mcqAnswers={mcqAnswers}
										runResult={runResult}
										setMcqAnswers={setMcqAnswers}
									/>
								) : (
									<div className="space-y-3">
										<Skeleton className="h-3 w-4/5" />
										<Skeleton className="h-3 w-3/5" />
										<p className="text-sm leading-6 text-muted-foreground">
											Compile to see highlighted mistakes. Submit when the
											visible tests are clean.
										</p>
									</div>
								)}
							</CardContent>
						</ScrollArea>
					</Card>
				</div>
			</section>
		</main>
	);
}

function AppHeader({
	activeScreen,
	failedCompileStreak,
	onNavigate,
}: {
	activeScreen: Screen;
	failedCompileStreak: number;
	onNavigate: (screen: Screen) => void;
}) {
	return (
		<header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
			<div className="mx-auto flex h-[72px] w-full max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
				<button
					className="flex items-center gap-3 text-left"
					onClick={() => onNavigate("landing")}
					type="button"
				>
					<span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
						<BrainCircuit className="size-5" />
					</span>
					<span className="grid">
						<span className="text-sm font-semibold leading-none">Metis</span>
						<span className="text-xs text-muted-foreground">
							Coding practice
						</span>
					</span>
				</button>
				<nav className="hidden items-center gap-1 rounded-md border bg-card p-1 md:flex">
					<NavButton
						active={activeScreen === "landing"}
						label="Overview"
						onClick={() => onNavigate("landing")}
					/>
					<NavButton
						active={activeScreen === "practice"}
						label="Practice"
						onClick={() => onNavigate("practice")}
					/>
					<NavButton
						active={activeScreen === "recommendations"}
						label="Next"
						onClick={() => onNavigate("recommendations")}
					/>
				</nav>
				<div className="flex items-center gap-2">
					<Badge variant="outline">
						<Flame className="size-3" />
						{failedCompileStreak} failed compiles
					</Badge>
				</div>
			</div>
		</header>
	);
}

function NavButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			className={cn("h-8 px-3", active && "bg-secondary")}
			onClick={onClick}
			type="button"
			variant={active ? "secondary" : "ghost"}
		>
			{label}
		</Button>
	);
}

function MetricTile({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<Card className="gap-3 py-4">
			<CardContent className="space-y-2 px-4">
				<div className="flex items-center gap-2 text-muted-foreground">
					{icon}
					<span className="text-xs font-medium uppercase">{label}</span>
				</div>
				<div className="text-2xl font-semibold">{value}</div>
			</CardContent>
		</Card>
	);
}

function InfoLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1">
			<div className="text-xs font-medium uppercase text-muted-foreground">
				{label}
			</div>
			<div className="text-sm leading-6">{value}</div>
		</div>
	);
}

function ProblemSection({
	children,
	title,
}: {
	children: React.ReactNode;
	title: string;
}) {
	return (
		<section className="space-y-3">
			<h3 className="text-xs font-semibold uppercase text-muted-foreground">
				{title}
			</h3>
			{children}
		</section>
	);
}

function RecommendationButton({
	index,
	item,
	onOpen,
}: {
	index: number;
	item: Recommendation;
	onOpen: () => void;
}) {
	return (
		<button
			className="group grid gap-4 rounded-lg border bg-card p-5 text-left transition hover:border-primary/50 hover:bg-accent sm:grid-cols-[56px_1fr_auto]"
			onClick={onOpen}
			type="button"
		>
			<div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-lg font-semibold text-primary">
				{index + 1}
			</div>
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge className={difficultyClass(item.difficulty)} variant="outline">
						{item.difficulty}
					</Badge>
					<Badge variant="secondary">{item.pool}</Badge>
					{item.pools?.slice(0, 3).map((pool) => (
						<Badge key={pool} variant="outline">
							{pool}
						</Badge>
					))}
				</div>
				<h2 className="text-xl font-semibold">{item.title}</h2>
				<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
					{item.reason}
				</p>
			</div>
			<div className="flex items-center gap-3 text-sm font-medium">
				{Math.round(item.score * 100)}%
				<ChevronRight className="size-4 transition group-hover:translate-x-1" />
			</div>
		</button>
	);
}

function StatusCard({
	accepted,
	failedCompileStreak,
	runResult,
}: {
	accepted: boolean;
	failedCompileStreak: number;
	runResult: ExecutionResponse | null;
}) {
	const statusText = runResult
		? accepted
			? "Accepted"
			: `${runResult.passed}/${runResult.total} tests passed`
		: "Ready";
	const helperText = runResult
		? runResult.mode === "submit"
			? "Submit result"
			: "Compile result"
		: "No run yet";

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{accepted ? (
						<CheckCircle2 className="size-5 text-emerald-400" />
					) : runResult ? (
						<CircleAlert className="size-5 text-amber-400" />
					) : (
						<Target className="size-5 text-primary" />
					)}
					{statusText}
				</CardTitle>
				<CardDescription>{helperText}</CardDescription>
			</CardHeader>
			<CardContent className="grid grid-cols-2 gap-3">
				<div className="rounded-md border p-3">
					<div className="text-xs text-muted-foreground">Engine</div>
					<div className="mt-1 text-sm font-medium">
						{runResult?.engine ?? "not run"}
					</div>
				</div>
				<div className="rounded-md border p-3">
					<div className="text-xs text-muted-foreground">Streak</div>
					<div className="mt-1 text-sm font-medium">
						{failedCompileStreak} failed
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function RunResultPanel({
	activeAssistance,
	failedCompileStreak,
	mcqAnswers,
	runResult,
	setMcqAnswers,
}: {
	activeAssistance: CompileAssistance | null;
	failedCompileStreak: number;
	mcqAnswers: Record<string, string>;
	runResult: ExecutionResponse;
	setMcqAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
	return (
		<div className="space-y-5">
			<div className="space-y-3">
				{runResult.results.map((result) => (
					<div
						className={cn(
							"space-y-3 rounded-md border p-3",
							result.passed
								? "border-emerald-500/30 bg-emerald-500/5"
								: "border-red-500/30 bg-red-500/5",
						)}
						key={result.testCaseId}
					>
						<div className="flex items-center justify-between gap-3">
							<div className="font-medium">{result.name}</div>
							<Badge variant={result.passed ? "secondary" : "outline"}>
								{result.status}
							</Badge>
						</div>
						<pre className="max-h-36 overflow-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
							{outputForCase(result)}
						</pre>
					</div>
				))}
			</div>

			{activeAssistance ? (
				<div className="space-y-4">
					<Separator />
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-3">
							<Badge variant="outline">{sourceLabel(activeAssistance.source)}</Badge>
							<span className="text-xs text-muted-foreground">
								{failedCompileStreak} failed compiles
							</span>
						</div>
						<p className="text-sm leading-6 text-muted-foreground">
							{activeAssistance.summary}
						</p>
					</div>

					<div className="space-y-2">
						{activeAssistance.highlights.map((highlight) => (
							<div
								className={cn(
									"rounded-md border p-3",
									highlight.severity === "warning"
										? "border-amber-500/30 bg-amber-500/5"
										: "border-red-500/30 bg-red-500/5",
								)}
								key={`${highlight.line}-${highlight.message}`}
							>
								<div className="text-xs font-medium uppercase text-muted-foreground">
									Line {highlight.line}
								</div>
								<p className="mt-1 text-sm">{highlight.message}</p>
								{highlight.suggestion ? (
									<p className="mt-2 text-xs leading-5 text-muted-foreground">
										{highlight.suggestion}
									</p>
								) : null}
							</div>
						))}
					</div>

					{activeAssistance.mcqs.length > 0 ? (
						<div className="space-y-3">
							{activeAssistance.mcqs.map((mcq) => (
								<CompileMcqBlock
									key={mcq.id}
									mcq={mcq}
									mcqAnswers={mcqAnswers}
									setMcqAnswers={setMcqAnswers}
								/>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function CompileMcqBlock({
	mcq,
	mcqAnswers,
	setMcqAnswers,
}: {
	mcq: CompileMcq;
	mcqAnswers: Record<string, string>;
	setMcqAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
	const selectedAnswer = mcqAnswers[mcq.id];
	const answered = Boolean(selectedAnswer);

	return (
		<div className="space-y-3 rounded-md border p-3">
			<div className="text-sm font-medium">{mcq.prompt}</div>
			{mcq.code ? (
				<pre className="overflow-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
					{mcq.code}
				</pre>
			) : null}
			<div className="grid gap-2">
				{mcq.options.map((option) => {
					const isSelected = selectedAnswer === option.id;
					const isCorrect = mcq.answerId === option.id;
					return (
						<button
							className={cn(
								"grid gap-2 rounded-md border p-3 text-left text-sm transition hover:bg-accent",
								answered &&
									isCorrect &&
									"border-emerald-500/50 bg-emerald-500/10",
								answered &&
									!isCorrect &&
									isSelected &&
									"border-red-500/50 bg-red-500/10",
							)}
							key={option.id}
							onClick={() =>
								setMcqAnswers((current) => ({
									...current,
									[mcq.id]: option.id,
								}))
							}
							type="button"
						>
							<span className="font-medium">{option.label}</span>
							{option.code ? (
								<code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
									{option.code}
								</code>
							) : null}
						</button>
					);
				})}
			</div>
			{answered ? (
				<p className="text-sm leading-6 text-muted-foreground">
					{mcq.explanation}
				</p>
			) : null}
		</div>
	);
}
