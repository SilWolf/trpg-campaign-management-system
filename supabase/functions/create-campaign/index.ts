import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CreateCampaignRequest = {
	name?: unknown;
	seed?: unknown;
};

type CampaignSeed = {
	characters: Record<string, unknown>[];
	items: Record<string, unknown>[];
	camp_chest_currency: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCampaignSeed(value: unknown): value is CampaignSeed {
	if (
		!isRecord(value) ||
		!Array.isArray(value.characters) ||
		!Array.isArray(value.items) ||
		!isRecord(value.camp_chest_currency)
	) {
		return false;
	}

	return (
		value.characters.length <= 50 &&
		value.items.length <= 500 &&
		value.characters.every(isRecord) &&
		value.items.every(isRecord)
	);
}

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

	const authorization = request.headers.get('Authorization');
	const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!accessToken) {
		return jsonResponse({ error: '請先登入再建立戰役。' }, 401);
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		console.error('建立戰役 Edge Function 缺少 Supabase 環境設定。');
		return jsonResponse({ error: '戰役服務尚未完成設定。' }, 500);
	}

	let requestBody: unknown;
	try {
		requestBody = await request.json();
	} catch {
		return jsonResponse({ error: '請求內容不是有效的 JSON。' }, 400);
	}

	if (
		!requestBody ||
		typeof requestBody !== 'object' ||
		Array.isArray(requestBody)
	) {
		return jsonResponse({ error: '請求內容格式無效。' }, 400);
	}
	const body = requestBody as CreateCampaignRequest;

	if (
		typeof body.name !== 'string' ||
		body.name.trim().length === 0 ||
		body.name.trim().length > 100
	) {
		return jsonResponse({ error: '戰役名稱須為 1 至 100 個字元。' }, 400);
	}

	if (!isCampaignSeed(body.seed)) {
		return jsonResponse({ error: '範例內容格式無效。' }, 400);
	}

	const authClient = createClient(supabaseUrl, anonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	let authData: Awaited<ReturnType<typeof authClient.auth.getUser>>['data'];
	let authError: Awaited<ReturnType<typeof authClient.auth.getUser>>['error'];
	try {
		const result = await authClient.auth.getUser(accessToken);
		authData = result.data;
		authError = result.error;
	} catch (error) {
		console.error('驗證登入狀態時無法連線至 Supabase：', error);
		return jsonResponse({ error: '登入服務暫時無法使用，請稍後再試。' }, 503);
	}

	if (authError || !authData.user) {
		return jsonResponse({ error: '登入狀態無效，請重新登入。' }, 401);
	}

	const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	let data: unknown;
	let error: { message: string } | null;
	try {
		const result = await serviceClient.rpc('create_campaign_from_seed', {
			p_name: body.name.trim(),
			p_user_id: authData.user.id,
			p_seed: body.seed,
		});
		data = result.data;
		error = result.error;
	} catch (requestError) {
		console.error('呼叫建團交易 RPC 時無法連線至 Supabase：', requestError);
		return jsonResponse(
			{ error: '建立戰役服務暫時無法使用，請稍後再試。' },
			503,
		);
	}

	if (error) {
		console.error('建立戰役交易失敗：', error.message);
		return jsonResponse({ error: '建立戰役失敗：' + error.message }, 500);
	}

	return jsonResponse(data, 201);
});
