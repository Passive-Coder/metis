export function jsonResponse(payload: unknown, init: ResponseInit = {}) {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");

	return new Response(JSON.stringify(payload), {
		...init,
		headers,
	});
}
