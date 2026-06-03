import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "#/lib/json";
import {
	localRecommendations,
	recordRecommendationEvents,
} from "#/lib/local-recommendations";

export const Route = createFileRoute("/api/recommendations")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const problemId = url.searchParams.get("problemId") ?? "";
				const userId = url.searchParams.get("userId") ?? "demo-user";
				const mlServerUrl = process.env.ML_SERVER_URL;

				if (mlServerUrl) {
					try {
						const upstream = new URL(
							`/recommendations/${encodeURIComponent(userId)}`,
							mlServerUrl,
						);
						upstream.searchParams.set("problem_id", problemId);
						upstream.searchParams.set("limit", "3");

						const response = await fetch(upstream);
						if (response.ok) {
							const payload = await response.json();
							const recommendations = (payload.recommendations ?? []).slice(
								0,
								3,
							);
							await recordRecommendationEvents({
								anchorProblemId: problemId,
								recommendations,
								userExternalId: userId,
							});
							return jsonResponse({
								recommendations,
								source: "ml-server",
							});
						}
					} catch {
						// Fall back to local ranking when the ML service is offline.
					}
				}

				const recommendations = await localRecommendations(
					problemId,
					userId,
					3,
				);
				await recordRecommendationEvents({
					anchorProblemId: problemId,
					recommendations,
					userExternalId: userId,
				});
				return jsonResponse({
					recommendations,
					source: "local-fallback",
				});
			},
		},
	},
});
