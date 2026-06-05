import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

type GraphqlPayload = {
	operationName: string;
	query: string;
	variables?: Record<string, unknown>;
};

type OperationResult = {
	data: unknown;
	errors?: unknown;
	ok: boolean;
	status: number;
};

type SolvedQuestion = {
	difficulty: string;
	frontendId: string;
	lastResult: string | null;
	lastSubmittedAt: string | null;
	numSubmitted: number;
	questionStatus: string;
	title: string;
	titleSlug: string;
	topicTags: {
		name: string;
		nameTranslated?: string | null;
		slug: string;
	}[];
	translatedTitle?: string | null;
};

const endpoint = "https://leetcode.com/graphql/";
const progressUrl = "https://leetcode.com/progress/";

function valueFromArgs(name: string): string | undefined {
	const prefix = `--${name}=`;
	const inline = process.argv.find((arg) => arg.startsWith(prefix));
	if (inline) {
		return inline.slice(prefix.length);
	}

	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0) {
		return process.argv[index + 1];
	}

	return undefined;
}

function parseInteger(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Expected an integer, got ${value}`);
	}

	return parsed;
}

function hasSessionCookie(): boolean {
	return Boolean(process.env.LEETCODE_SESSION);
}

function cookieHeader(): string | undefined {
	const cookies: string[] = [];
	const session = process.env.LEETCODE_SESSION;
	const csrf = process.env.LEETCODE_CSRF_TOKEN ?? process.env.CSRFTOKEN;

	if (session) {
		cookies.push(`LEETCODE_SESSION=${session}`);
	}

	if (csrf) {
		cookies.push(`csrftoken=${csrf}`);
	}

	return cookies.length > 0 ? cookies.join("; ") : undefined;
}

async function graphql(payload: GraphqlPayload): Promise<OperationResult> {
	const csrf = process.env.LEETCODE_CSRF_TOKEN ?? process.env.CSRFTOKEN;
	const cookie = cookieHeader();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Referer: progressUrl,
		"User-Agent":
			process.env.LEETCODE_USER_AGENT ?? "metis-leetcode-progress-export/0.1",
	};

	if (cookie) {
		headers.Cookie = cookie;
	}

	if (csrf) {
		headers["x-csrftoken"] = csrf;
	}

	const response = await fetch(endpoint, {
		body: JSON.stringify(payload),
		headers,
		method: "POST",
	});
	const json = await response.json();

	return {
		data: json.data ?? null,
		errors: json.errors,
		ok: response.ok && !json.errors,
		status: response.status,
	};
}

async function fetchSolvedQuestions(pageSize: number) {
	if (!hasSessionCookie()) {
		return {
			errors: [
				{
					message:
						"LEETCODE_SESSION is required for the complete solved-question list. Public GraphQL only exposes counts and recent accepted submissions.",
				},
			],
			ok: false,
			pageSize,
			questions: [] as SolvedQuestion[],
			total: null as number | null,
		};
	}

	const questions: SolvedQuestion[] = [];
	const pages: OperationResult[] = [];
	let total: number | null = null;
	let skip = 0;

	while (total === null || questions.length < total) {
		const result = await graphql({
			operationName: "userProgressQuestionList",
			query: `
				query userProgressQuestionList($filters: UserProgressQuestionListInput) {
					userProgressQuestionList(filters: $filters) {
						totalNum
						questions {
							translatedTitle
							frontendId
							title
							titleSlug
							difficulty
							lastSubmittedAt
							numSubmitted
							questionStatus
							lastResult
							topicTags {
								name
								nameTranslated
								slug
							}
						}
					}
				}
			`,
			variables: {
				filters: {
					limit: pageSize,
					questionStatus: "SOLVED",
					skip,
				},
			},
		});

		pages.push(result);
		const data = result.data as {
			userProgressQuestionList?: {
				questions?: SolvedQuestion[];
				totalNum?: number;
			} | null;
		} | null;
		const page = data?.userProgressQuestionList;
		if (!result.ok || !page) {
			return {
				errors: result.errors ?? [
					{
						message:
							"userProgressQuestionList returned no data. Check that LEETCODE_SESSION belongs to the target account and has not expired.",
					},
				],
				ok: false,
				pageSize,
				pages,
				questions,
				total,
			};
		}

		total = page.totalNum ?? questions.length;
		const currentQuestions = page.questions ?? [];
		if (currentQuestions.length === 0) {
			break;
		}

		questions.push(...currentQuestions);
		skip += currentQuestions.length;
	}

	return {
		ok: questions.length === (total ?? questions.length),
		pageSize,
		pages: pages.map((page) => ({
			errors: page.errors,
			ok: page.ok,
			status: page.status,
		})),
		questions,
		total,
	};
}

async function resolveUsername(explicitUsername: string | undefined): Promise<string> {
	if (explicitUsername) {
		return explicitUsername;
	}

	const status = await graphql({
		operationName: "globalData",
		query: `
			query globalData {
				userStatus {
					isSignedIn
					username
				}
			}
		`,
	});

	const data = status.data as {
		userStatus?: { isSignedIn?: boolean; username?: string | null };
	} | null;
	const username = data?.userStatus?.username;
	if (data?.userStatus?.isSignedIn && username) {
		return username;
	}

	throw new Error(
		"Provide --username or LEETCODE_USERNAME. Email/password login is not automated; use LEETCODE_SESSION and LEETCODE_CSRF_TOKEN for authenticated exports.",
	);
}

function operations(username: string, year: number, recentLimit: number): GraphqlPayload[] {
	return [
		{
			operationName: "userProfileUserQuestionProgressV2",
			query: `
				query userProfileUserQuestionProgressV2($userSlug: String!) {
					userProfileUserQuestionProgressV2(userSlug: $userSlug) {
						numAcceptedQuestions {
							count
							difficulty
						}
						numFailedQuestions {
							count
							difficulty
						}
						numUntouchedQuestions {
							count
							difficulty
						}
						userSessionBeatsPercentage {
							difficulty
							percentage
						}
					}
				}
			`,
			variables: { userSlug: username },
		},
		{
			operationName: "userProblemsSolved",
			query: `
				query userProblemsSolved($username: String!) {
					matchedUser(username: $username) {
						submitStats {
							acSubmissionNum {
								difficulty
								count
								submissions
							}
							totalSubmissionNum {
								difficulty
								count
								submissions
							}
						}
					}
				}
			`,
			variables: { username },
		},
		{
			operationName: "userProfileCalendar",
			query: `
				query userProfileCalendar($username: String!, $year: Int) {
					matchedUser(username: $username) {
						userCalendar(year: $year) {
							activeYears
							streak
							totalActiveDays
							dccBadges {
								timestamp
								badge {
									name
									icon
								}
							}
							submissionCalendar
						}
					}
				}
			`,
			variables: { username, year },
		},
		{
			operationName: "recentAcSubmissions",
			query: `
				query recentAcSubmissions($username: String!, $limit: Int!) {
					recentAcSubmissionList(username: $username, limit: $limit) {
						id
						title
						titleSlug
						timestamp
					}
				}
			`,
			variables: { limit: recentLimit, username },
		},
		{
			operationName: "languageStats",
			query: `
				query languageStats($username: String!) {
					matchedUser(username: $username) {
						languageProblemCount {
							languageName
							problemsSolved
						}
					}
				}
			`,
			variables: { username },
		},
		{
			operationName: "skillStats",
			query: `
				query skillStats($username: String!) {
					matchedUser(username: $username) {
						tagProblemCounts {
							advanced {
								tagName
								tagSlug
								problemsSolved
							}
							intermediate {
								tagName
								tagSlug
								problemsSolved
							}
							fundamental {
								tagName
								tagSlug
								problemsSolved
							}
						}
					}
				}
			`,
			variables: { username },
		},
		{
			operationName: "userContestRankingInfo",
			query: `
				query userContestRankingInfo($username: String!) {
					userContestRanking(username: $username) {
						attendedContestsCount
						rating
						globalRanking
						totalParticipants
						topPercentage
						badge {
							name
						}
					}
					userContestRankingHistory(username: $username) {
						attended
						trendDirection
						problemsSolved
						totalProblems
						finishTimeInSeconds
						rating
						ranking
						contest {
							title
							startTime
						}
					}
				}
			`,
			variables: { username },
		},
		{
			operationName: "userPublicProfile",
			query: `
				query userPublicProfile($username: String!) {
					matchedUser(username: $username) {
						username
						githubUrl
						twitterUrl
						linkedinUrl
						profile {
							ranking
							userAvatar
							realName
							aboutMe
							school
							websites
							countryName
							company
							jobTitle
							skillTags
						}
					}
				}
			`,
			variables: { username },
		},
	];
}

function field<T>(result: OperationResult | undefined, pick: (data: any) => T): T | null {
	if (!result?.data || result.errors) {
		return null;
	}

	return pick(result.data);
}

async function main() {
	if (process.env.LEETCODE_EMAIL || process.env.LEETCODE_PASSWORD) {
		console.warn(
			"LEETCODE_EMAIL/LEETCODE_PASSWORD are intentionally ignored. Use --username for public data, or LEETCODE_SESSION plus LEETCODE_CSRF_TOKEN for authenticated data.",
		);
	}

	const username = await resolveUsername(
		valueFromArgs("username") ?? process.env.LEETCODE_USERNAME,
	);
	const year = parseInteger(valueFromArgs("year") ?? process.env.LEETCODE_YEAR, new Date().getFullYear());
	const recentLimit = parseInteger(
		valueFromArgs("recent-limit") ?? process.env.LEETCODE_RECENT_LIMIT,
		20,
	);
	const solvedPageSize = parseInteger(
		valueFromArgs("solved-page-size") ?? process.env.LEETCODE_SOLVED_PAGE_SIZE,
		100,
	);
	const outputPath =
		valueFromArgs("out") ??
		process.env.LEETCODE_PROGRESS_OUT ??
		path.join("exports", `leetcode-progress-${username}-${year}.json`);

	const results: Record<string, OperationResult> = {};
	for (const operation of operations(username, year, recentLimit)) {
		results[operation.operationName] = await graphql(operation);
	}
	const allSolvedQuestions = await fetchSolvedQuestions(solvedPageSize);

	const exportPayload = {
		auth: {
			usedCsrfToken: Boolean(process.env.LEETCODE_CSRF_TOKEN ?? process.env.CSRFTOKEN),
			usedSessionCookie: Boolean(process.env.LEETCODE_SESSION),
		},
		exportedAt: new Date().toISOString(),
		source: progressUrl,
		username,
		year,
		progress: field(
			results.userProfileUserQuestionProgressV2,
			(data) => data.userProfileUserQuestionProgressV2,
		),
		solvedStats: field(
			results.userProblemsSolved,
			(data) => data.matchedUser?.submitStats ?? null,
		),
		calendar: field(
			results.userProfileCalendar,
			(data) => data.matchedUser?.userCalendar ?? null,
		),
		allSolvedQuestions,
		recentAcceptedSubmissions: field(
			results.recentAcSubmissions,
			(data) => data.recentAcSubmissionList ?? [],
		),
		languageStats: field(
			results.languageStats,
			(data) => data.matchedUser?.languageProblemCount ?? [],
		),
		skillStats: field(
			results.skillStats,
			(data) => data.matchedUser?.tagProblemCounts ?? null,
		),
		contest: field(results.userContestRankingInfo, (data) => ({
			ranking: data.userContestRanking,
			rankingHistory: data.userContestRankingHistory,
		})),
		publicProfile: field(
			results.userPublicProfile,
			(data) => data.matchedUser ?? null,
		),
		rawOperations: results,
	};

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, `${JSON.stringify(exportPayload, null, 2)}\n`);
	console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
