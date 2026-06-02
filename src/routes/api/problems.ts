import { createFileRoute } from "@tanstack/react-router";

import { problems, toPublicProblem } from "#/data/problems";
import { jsonResponse } from "#/lib/json";

export const Route = createFileRoute("/api/problems")({
	server: {
		handlers: {
			GET: () =>
				jsonResponse({
					problems: problems.map(toPublicProblem),
				}),
		},
	},
});
