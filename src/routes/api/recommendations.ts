import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "#/lib/json";
import { localRecommendations } from "#/lib/local-recommendations";

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
						upstream.searchParams.set("limit", "5");

						const response = await fetch(upstream);
						if (response.ok) {
							const payload = await response.json();
							return jsonResponse({
								recommendations: payload.recommendations ?? [],
								source: "ml-server",
							});
						}
					} catch {
						// Fall back to local ranking when the ML service is offline.
					}
				}

				return jsonResponse({
					recommendations: localRecommendations(problemId),
					source: "local-fallback",
				});
			},
		},
	},
});
