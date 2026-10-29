import { createClient } from 'npm:@supabase/supabase-js@2';

type JsonBodyResult =
	{ status: 'ok'; value: unknown } | { status: 'too_large' | 'invalid' };

async function readJsonBody(
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

function parseDeleteCampaignCharacterRequest(
	value: unknown,
): DeleteCampaignCharacterRequest | null {
	if (
		!isRecord(value) ||
		Object.keys(value).some(
			(key) => !['campaignId', 'characterId'].includes(key),
		) ||
		typeof value.campaignId !== 'string' ||
		value.campaignId.trim().length === 0 ||
		value.campaignId.length > 200 ||
		typeof value.characterId !== 'string' ||
		value.characterId.trim().length === 0 ||
		value.characterId.length > 200 ||
		value.characterId === 'camp-chest'
	) {
		return null;
	}

	return {
		campaignId: value.campaignId,
		characterId: value.characterId,
	};
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	});
}

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}
	if (request.method !== 'POST') {
		return jsonResponse({ error: '僅支援 POST 請求。' }, 405);
	}

	const accessToken = request.headers
		.get('Authorization')
		?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!accessToken) {
		return jsonResponse({ error: '請先登入再移除角色。' }, 401);
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		console.error('角色刪除 Edge Function 缺少 Supabase 環境設定。');
		return jsonResponse({ error: '角色移除服務尚未完成設定。' }, 500);
	}

	const parsedBody = await readJsonBody(request, 4_096);
	if (parsedBody.status === 'too_large') {
		return jsonResponse({ error: '角色移除請求內容超過允許大小。' }, 413);
	}
	if (parsedBody.status === 'invalid') {
		return jsonResponse({ error: '請求內容不是有效的 JSON。' }, 400);
	}
	const body = parseDeleteCampaignCharacterRequest(parsedBody.value);
	if (!body) {
		return jsonResponse({ error: '角色移除請求欄位無效。' }, 400);
	}

	const authClient = createClient(supabaseUrl, anonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	let actorId: string;
	try {
		const { data, error } = await authClient.auth.getUser(accessToken);
		if (error || !data.user) {
			return jsonResponse({ error: '登入狀態無效，請重新登入。' }, 401);
		}
		actorId = data.user.id;
	} catch (error) {
		console.error('驗證角色移除登入狀態失敗：', error);
		return jsonResponse({ error: '登入服務暫時無法使用，請稍後再試。' }, 503);
	}

	const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	try {
		const { error } = await serviceClient.rpc(
			'delete_campaign_character_with_journeys',
			{
				p_campaign_id: body.campaignId,
				p_character_id: body.characterId,
				p_actor_id: actorId,
			},
		);
		if (error) {
			console.error('角色刪除交易 RPC 失敗：', error.message);
			if (error.code === '42501') {
				return jsonResponse({ error: '沒有權限移除此角色。' }, 403);
			}
			if (error.code === '22023' || error.code === '23514') {
				return jsonResponse(
					{ error: '角色不存在、不可移除或資料狀態不允許移除。' },
					409,
				);
			}
			return jsonResponse(
				{ error: '角色移除交易未完成；所有資料均未變更，請稍後重試。' },
				500,
			);
		}
		return jsonResponse({ deleted: true, characterId: body.characterId }, 200);
	} catch (error) {
		console.error('呼叫角色刪除交易 RPC 失敗：', error);
		return jsonResponse(
			{ error: '角色移除服務暫時無法使用，請稍後再試。' },
			503,
		);
	}
});
