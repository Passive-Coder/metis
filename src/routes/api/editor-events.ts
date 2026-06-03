import { createFileRoute } from "@tanstack/react-router";

import { jsonResponse } from "#/lib/json";
import { recordEditorEvent } from "#/lib/practice-telemetry";

type EditorEventPayload = {
	eventType?: "open" | "heartbeat" | "compile" | "submit" | "close";
	metrics?: Record<string, number>;
	problemId?: string;
	sessionId?: string;
	sourceCode?: string;
	userId?: string;
};

export const Route = createFileRoute("/api/editor-events")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const payload = (await request.json()) as EditorEventPayload;

				if (!payload.sessionId || !payload.problemId || !payload.eventType) {
					return jsonResponse(
						{
							ok: false,
							message: "sessionId, problemId, and eventType are required.",
						},
						{ status: 400 },
					);
				}

				if (
					!["open", "heartbeat", "compile", "submit", "close"].includes(
						payload.eventType,
					)
				) {
					return jsonResponse(
						{ ok: false, message: "Unsupported editor event type." },
						{ status: 400 },
					);
				}

				try {
					const result = await recordEditorEvent({
						eventType: payload.eventType,
						metrics: payload.metrics ?? {},
						problemId: payload.problemId,
						sessionId: payload.sessionId,
						sourceCode: payload.sourceCode,
						userExternalId: payload.userId ?? "demo-user",
					});
					return jsonResponse({ ok: true, ...result });
				} catch (error: unknown) {
					console.warn(
						error instanceof Error
							? error.message
							: "Unable to record editor event.",
					);
					return jsonResponse({ ok: true, recorded: false });
				}
			},
		},
	},
});
