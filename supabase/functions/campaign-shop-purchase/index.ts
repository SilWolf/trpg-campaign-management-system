import { createClient } from 'npm:@supabase/supabase-js@2';
import { readJsonBody } from '../_shared/http.ts';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PurchaseLine = { shopItemId: string; quantity: number };

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPurchaseBody(value: unknown): {
	campaignId: string;
	shopId: string;
	characterId: string;
	walletType: 'public' | 'private';
	items: PurchaseLine[];
} | null {
	if (
		!isRecord(value) ||
		Object.keys(value).some(
			(key) =>
				!['campaignId', 'shopId', 'characterId', 'walletType', 'items'].includes(key),
		) ||
		typeof value.campaignId !== 'string' ||
		value.campaignId.length < 1 ||
		value.campaignId.length > 200 ||
		typeof value.shopId !== 'string' ||
		value.shopId.length < 1 ||
		value.shopId.length > 200 ||
		typeof value.characterId !== 'string' ||
		value.characterId.length < 1 ||
		value.characterId.length > 200 ||
		(value.walletType !== 'public' && value.walletType !== 'private') ||
		!Array.isArray(value.items) ||
		value.items.length < 1 ||
		value.items.length > 100
	) {
		return null;
	}

	const items: PurchaseLine[] = [];
	const seen = new Set<string>();
	for (const line of value.items) {
		if (
			!isRecord(line) ||
			Object.keys(line).some((key) => !['shopItemId', 'quantity'].includes(key)) ||
			typeof line.shopItemId !== 'string' ||
			line.shopItemId.length < 1 ||
			line.shopItemId.length > 200 ||
			typeof line.quantity !== 'number' ||
			!Number.isSafeInteger(line.quantity) ||
			line.quantity < 1 ||
			line.quantity > 2_147_483_647 ||
			seen.has(line.shopItemId)
		) {
			return null;
		}
		seen.add(line.shopItemId);
		items.push({ shopItemId: line.shopItemId, quantity: line.quantity });
	}

	return {
		campaignId: value.campaignId,
		shopId: value.shopId,
		characterId: value.characterId,
		walletType: value.walletType,
		items,
	};
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
	if (!accessToken) return jsonResponse({ error: '請先登入再購買商品。' }, 401);

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		console.error('商店購買 Edge Function 缺少 Supabase 環境設定。');
		return jsonResponse({ error: '商店服務尚未完成設定。' }, 500);
	}

	const parsedBody = await readJsonBody(request, 32_768);
	if (parsedBody.status === 'too_large') {
		return jsonResponse({ error: '購買請求內容超過允許大小。' }, 413);
	}
	if (parsedBody.status === 'invalid') {
		return jsonResponse({ error: '請求內容不是有效的 JSON。' }, 400);
	}
	const body = readPurchaseBody(parsedBody.value);
	if (!body) return jsonResponse({ error: '購買請求欄位或數量無效。' }, 400);

	const authClient = createClient(supabaseUrl, anonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	let authResult: Awaited<ReturnType<typeof authClient.auth.getUser>>;
	try {
		authResult = await authClient.auth.getUser(accessToken);
	} catch (error) {
		console.error('驗證商店購買登入狀態失敗：', error);
		return jsonResponse({ error: '登入服務暫時無法使用，請稍後再試。' }, 503);
	}
	if (authResult.error || !authResult.data.user) {
		return jsonResponse({ error: '登入狀態無效，請重新登入。' }, 401);
	}
	const actorId = authResult.data.user.id;

	const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	try {
		const { data, error } = await serviceClient.rpc(
			'checkout_campaign_shop_cart_as_actor',
			{
				p_actor_id: actorId,
				p_campaign_id: body.campaignId,
				p_shop_id: body.shopId,
				p_character_id: body.characterId,
				p_wallet_type: body.walletType,
				p_items: body.items.map((item) => ({
					shop_item_id: item.shopItemId,
					quantity: item.quantity,
				})),
			},
		);
		if (error) {
			console.error('商店購買交易 RPC 失敗：', error.message);
			const status = error.code === '42501' ? 403 : 409;
			const message =
				status === 403
					? '沒有權限使用此角色或錢包完成購買。'
					: '購買未完成；請確認商品狀態、庫存與錢包餘額後重試。';
			return jsonResponse({ error: message }, status);
		}
		if (typeof data !== 'string' || data.length === 0 || data.length > 200) {
			console.error('商店購買交易 RPC 回傳無效識別碼。');
			return jsonResponse({ error: '購買服務回傳了無效結果。' }, 502);
		}
		return jsonResponse({ checkoutId: data }, 200);
	} catch (error) {
		console.error('呼叫商店購買交易 RPC 失敗：', error);
		return jsonResponse({ error: '購買服務暫時無法使用，請稍後再試。' }, 503);
	}
});
