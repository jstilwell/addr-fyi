/** True when the client explicitly asked for JSON (curl -H 'Accept: application/json'). */
export const wantsJson = (request: Request): boolean =>
	(request.headers.get('accept') ?? '').includes('application/json');

export const text = (body: string, status = 200, cacheControl = 'no-store') =>
	new Response(body, {
		status,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': cacheControl
		}
	});

/** Render a label/value record as aligned plaintext lines, skipping empty values. */
export const kvText = (pairs: Record<string, string | number | boolean | null | undefined>) =>
	Object.entries(pairs)
		.filter(([, v]) => v !== null && v !== undefined && v !== '')
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n') + '\n';

/** Respond with JSON or plaintext depending on the Accept header. */
export const negotiate = (
	request: Request,
	data: unknown,
	plaintext: string,
	status = 200,
	cacheControl = 'no-store'
) =>
	wantsJson(request)
		? Response.json(data, { status, headers: { 'Cache-Control': cacheControl } })
		: text(plaintext, status, cacheControl);
