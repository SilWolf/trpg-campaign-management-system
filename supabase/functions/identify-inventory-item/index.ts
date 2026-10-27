import { createClient } from 'npm:@supabase/supabase-js@2';
import { readJsonBody } from '../_shared/http.ts';

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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
	if (!accessToken) return jsonResponse({ error: '請先登入再鑑定物品。' }, 401);

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		console.error('物品鑑定 Edge Function 缺少 Supabase 環境設定。');
		return jsonResponse({ error: '物品鑑定服務尚未完成設定。' }, 500);
	}
	const parsedBody = await readJsonBody(request, 4_096);
	if (parsedBody.status === 'too_large') {
		return jsonResponse({ error: '鑑定請求內容超過允許大小。' }, 413);
	}
	if (parsedBody.status === 'invalid') {
		return jsonResponse({ error: '請求內容不是有效的 JSON。' }, 400);
	}
	const body = parsedBody.value;
	if (
		!isRecord(body) ||
		Object.keys(body).some((key) => !['campaignId', 'itemId'].includes(key)) ||
		typeof body.campaignId !== 'string' ||
		body.campaignId.length < 1 ||
		body.campaignId.length > 200 ||
		typeof body.itemId !== 'string' ||
		body.itemId.length < 1 ||
		body.itemId.length > 200
	) {
		return jsonResponse({ error: '鑑定請求欄位無效。' }, 400);
	}

	const authClient = createClient(supabaseUrl, anonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	let actorId: string;
	try {
		const { data, error } = await authClient.auth.getUser(accessToken);
		if (error || !data.user) return jsonResponse({ error: '登入狀態無效，請重新登入。' }, 401);
		actorId = data.user.id;
	} catch (error) {
		console.error('驗證物品鑑定登入狀態失敗：', error);
		return jsonResponse({ error: '登入服務暫時無法使用，請稍後再試。' }, 503);
	}

	const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	try {
		const { data, error } = await serviceClient.rpc('identify_inventory_item', {
			p_actor_id: actorId,
			p_campaign_id: body.campaignId,
			p_item_id: body.itemId,
		});
		if (error) {
			console.error('物品鑑定 RPC 失敗：', error.message);
			if (error.code === '42501') {
				return jsonResponse({ error: '只有該戰役 DM 可以鑑定此物品。' }, 403);
			}
			if (error.code === '22023' || error.code === '23514') {
				return jsonResponse({ error: '物品不存在、已鑑定或不具備有效鑑定資料。' }, 409);
			}
			return jsonResponse({ error: '物品鑑定交易失敗，請稍後重試。' }, 500);
		}
		if (data !== body.itemId) {
			console.error('物品鑑定 RPC 回傳識別碼不符。');
			return jsonResponse({ error: '物品鑑定服務回傳了無效結果。' }, 502);
		}
		return jsonResponse({ itemId: data }, 200);
	} catch (error) {
		console.error('呼叫物品鑑定 RPC 失敗：', error);
		return jsonResponse({ error: '物品鑑定服務暫時無法使用，請稍後再試。' }, 503);
	}
});
