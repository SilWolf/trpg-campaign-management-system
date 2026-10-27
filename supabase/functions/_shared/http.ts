export type JsonBodyResult =
	| { status: 'ok'; value: unknown }
	| { status: 'too_large' | 'invalid' };

export async function readJsonBody(
	request: Request,
	maxBytes: number,
): Promise<JsonBodyResult> {
	const reader = request.body?.getReader();
	if (!reader) return { status: 'invalid' };

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			await reader.cancel();
			return { status: 'too_large' };
		}
		chunks.push(value);
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return { status: 'ok', value: JSON.parse(new TextDecoder().decode(body)) };
	} catch {
		return { status: 'invalid' };
	}
}
