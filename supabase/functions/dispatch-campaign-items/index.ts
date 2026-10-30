import { createClient } from 'npm:@supabase/supabase-js@2';
import { readJsonBody } from '../_shared/http.ts';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type DispatchLine = {
	itemBase: Record<string, unknown>;
	blacksmithItemId: string | null;
	isHomebrew: boolean;
	isImportant: boolean;
	quantity: number;
};

type DispatchRequest = {
	requestId: string;
	campaignId: string;
	ownerId: string;
	isPrivate: boolean;
	reason: string;
	confirmLargeBatch: boolean;
	items: DispatchLine[];
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

function isBoundedString(
	value: unknown,
	minimum: number,
	maximum: number,
): value is string {
	return (
		typeof value === 'string' &&
		value.length >= minimum &&
		value.length <= maximum
	);
}

function isItemBase(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	const allowedKeys = [
		'name',
		'category',
		'subTypes',
		'rarity',
		'icon',
		'weight',
		'valueGp',
		'affixes',
		'effects',
		'flavor',
		'dmNotes',
		'maxCharges',
		'isEquippable',
		'isConsumable',
		'isRequireAttunement',
		'isStackable',
		'weaponProperties',
		'armorProperties',
	];
	const categories = [
		'Weapon',
		'Armor',
		'Potion',
		'Poison',
		'Ring',
		'Rod',
		'Scroll',
		'Staff',
		'Wand',
		'WondrousItem',
		'TradeGood',
		'Gemstone',
		'Tool',
		'AdventureGear',
		'FoodAndDrink',
		'Mount',
		'Vehicle',
		'Misc',
	];
	const rarities = [
		'Common',
		'Uncommon',
		'Rare',
		'VeryRare',
		'Legendary',
		'Artifact',
	];
	if (
		Object.keys(value).some((key) => !allowedKeys.includes(key)) ||
		!isBoundedString(value.name, 1, 120) ||
		!categories.includes(String(value.category)) ||
		!rarities.includes(String(value.rarity)) ||
		!Array.isArray(value.subTypes) ||
		value.subTypes.length > 100 ||
		!value.subTypes.every((entry) => isBoundedString(entry, 0, 120)) ||
		typeof value.weight !== 'number' ||
		!Number.isFinite(value.weight) ||
		value.weight < 0 ||
		typeof value.valueGp !== 'number' ||
		!Number.isFinite(value.valueGp) ||
		value.valueGp < 0 ||
		!Array.isArray(value.affixes) ||
		value.affixes.length > 100 ||
		!value.affixes.every(
			(affix) =>
				isRecord(affix) &&
				!Object.keys(affix).some(
					(key) => !['id', 'name', 'desc', 'isHidden'].includes(key),
				) &&
				isBoundedString(affix.id, 1, 200) &&
				isBoundedString(affix.name, 1, 120) &&
				isBoundedString(affix.desc, 0, 10000) &&
				(affix.isHidden === undefined || typeof affix.isHidden === 'boolean'),
		) ||
		!isBoundedString(value.effects, 0, 10000) ||
		!isBoundedString(value.dmNotes, 0, 10000) ||
		(value.flavor !== undefined &&
			value.flavor !== null &&
			!isBoundedString(value.flavor, 0, 10000)) ||
		(value.icon !== undefined &&
			value.icon !== null &&
			!isBoundedString(value.icon, 1, 500)) ||
		(value.maxCharges !== undefined &&
			value.maxCharges !== null &&
			(typeof value.maxCharges !== 'number' ||
				!Number.isSafeInteger(value.maxCharges) ||
				value.maxCharges < 0 ||
				value.maxCharges > 2_147_483_647)) ||
		typeof value.isEquippable !== 'boolean' ||
		typeof value.isConsumable !== 'boolean' ||
		typeof value.isRequireAttunement !== 'boolean' ||
		typeof value.isStackable !== 'boolean'
	) {
		return false;
	}
	if (value.category === 'Weapon') {
		if (
			!isRecord(value.weaponProperties) ||
			Object.keys(value.weaponProperties).some(
				(key) => !['damage', 'mastery', 'properties'].includes(key),
			) ||
			!isBoundedString(value.weaponProperties.damage, 1, 500) ||
			!Array.isArray(value.weaponProperties.properties) ||
			value.weaponProperties.properties.length > 100 ||
			!value.weaponProperties.properties.every((entry) =>
				isBoundedString(entry, 0, 120),
			) ||
			(value.weaponProperties.mastery !== undefined &&
				![
					'Cleave',
					'Graze',
					'Nick',
					'Push',
					'Sap',
					'Slow',
					'Topple',
					'Vex',
				].includes(String(value.weaponProperties.mastery)))
		) {
			return false;
		}
	} else if ('weaponProperties' in value) {
		return false;
	}
	if (
		value.category === 'Armor' &&
		(!isRecord(value.armorProperties) ||
			Object.keys(value.armorProperties).some((key) => key !== 'ac') ||
			!isBoundedString(value.armorProperties.ac, 1, 500))
	) {
		return false;
	}
	if (value.category !== 'Armor' && 'armorProperties' in value) return false;
	return true;
}

function readDispatchRequest(value: unknown): DispatchRequest | null {
	const allowedKeys = [
		'requestId',
		'campaignId',
		'ownerId',
		'isPrivate',
		'reason',
		'confirmLargeBatch',
		'items',
	];
	if (
		!isRecord(value) ||
		Object.keys(value).some((key) => !allowedKeys.includes(key)) ||
		!isBoundedString(value.requestId, 1, 200) ||
		!isBoundedString(value.campaignId, 1, 200) ||
		!isBoundedString(value.ownerId, 1, 200) ||
		typeof value.isPrivate !== 'boolean' ||
		(value.reason !== undefined &&
			value.reason !== null &&
			(typeof value.reason !== 'string' || value.reason.length > 200)) ||
		(value.confirmLargeBatch !== undefined &&
			typeof value.confirmLargeBatch !== 'boolean') ||
		!Array.isArray(value.items) ||
		value.items.length < 1 ||
		value.items.length > 10
	) {
		return null;
	}
	if (value.ownerId === 'camp-chest' && value.isPrivate) return null;

	const items: DispatchLine[] = [];
	for (const entry of value.items) {
		if (
			!isRecord(entry) ||
			Object.keys(entry).some(
				(key) =>
					![
						'itemBase',
						'blacksmithItemId',
						'isHomebrew',
						'isImportant',
						'quantity',
					].includes(key),
			) ||
			!isItemBase(entry.itemBase) ||
			typeof entry.isHomebrew !== 'boolean' ||
			typeof entry.isImportant !== 'boolean' ||
			(entry.blacksmithItemId !== undefined &&
				entry.blacksmithItemId !== null &&
				(typeof entry.blacksmithItemId !== 'string' ||
					entry.blacksmithItemId.length < 1 ||
					entry.blacksmithItemId.length > 200 ||
					!(/^(rulebook:[^:]+:.+|workshop:[^:]+)$/.test(
						entry.blacksmithItemId,
					)))) ||
			typeof entry.quantity !== 'number' ||
			!Number.isSafeInteger(entry.quantity) ||
			entry.quantity < 1 ||
			entry.quantity > (entry.itemBase.isStackable ? 1_000_000 : 20)
		) {
			return null;
		}
		items.push({
			itemBase: entry.itemBase,
			blacksmithItemId:
				typeof entry.blacksmithItemId === 'string'
					? entry.blacksmithItemId
					: null,
			isHomebrew: entry.isHomebrew,
			isImportant: entry.isImportant,
			quantity: entry.quantity,
		});
	}

	return {
		requestId: value.requestId,
		campaignId: value.campaignId,
		ownerId: value.ownerId,
		isPrivate: value.isPrivate,
		reason: typeof value.reason === 'string' ? value.reason : '',
		confirmLargeBatch: value.confirmLargeBatch === true,
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
	if (!accessToken) return jsonResponse({ error: '請先登入再派發物品。' }, 401);

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !anonKey || !serviceRoleKey) {
		console.error('物品派發 Edge Function 缺少 Supabase 環境設定。');
		return jsonResponse({ error: '物品派發服務尚未完成設定。' }, 500);
	}

	const bodyResult = await readJsonBody(request, 65_536);
	if (bodyResult.status === 'too_large') {
		return jsonResponse({ error: '派發請求內容超過允許大小。' }, 413);
	}
	if (bodyResult.status === 'invalid') {
		return jsonResponse({ error: '請求內容不是有效的 JSON。' }, 400);
	}
	const body = readDispatchRequest(bodyResult.value);
	if (!body) return jsonResponse({ error: '派發請求欄位或數量無效。' }, 400);

	const authClient = createClient(supabaseUrl, anonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	let authResult: Awaited<ReturnType<typeof authClient.auth.getUser>>;
	try {
		authResult = await authClient.auth.getUser(accessToken);
	} catch (error) {
		console.error('驗證物品派發登入狀態失敗：', error);
		return jsonResponse({ error: '登入服務暫時無法使用，請稍後再試。' }, 503);
	}
	if (authResult.error || !authResult.data.user) {
		return jsonResponse({ error: '登入狀態無效，請重新登入。' }, 401);
	}

	const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	try {
		const { data, error } = await serviceClient.rpc(
			'dispatch_campaign_items_as_actor',
			{
				p_actor_id: authResult.data.user.id,
				p_request_id: body.requestId,
				p_campaign_id: body.campaignId,
				p_owner_id: body.ownerId,
				p_is_private: body.isPrivate,
				p_reason: body.reason,
				p_items: body.items,
				p_confirm_large_batch: body.confirmLargeBatch,
			},
		);
		if (error) {
			console.error('物品派發交易 RPC 失敗：', error.message);
			const status =
				error.code === '42501'
					? 403
					: ['22023', '22P02'].includes(error.code ?? '')
						? 400
						: 409;
			return jsonResponse(
				{
					error:
						status === 403
							? '只有此戰役 DM 可以派發物品，且接收目標必須屬於此戰役。'
							: status === 400
								? '派發物品定義或數量無效。'
								: '派發未完成；請檢查目標與堆疊數量後重試。',
				},
				status,
			);
		}
		if (
			!isRecord(data) ||
			(data.requiresConfirmation !== true &&
				(typeof data.operationId !== 'string' ||
					!Array.isArray(data.inventoryIds)))
		) {
			console.error('物品派發交易 RPC 回傳無效結果。');
			return jsonResponse({ error: '物品派發服務回傳了無效結果。' }, 502);
		}
		return jsonResponse(data, 200);
	} catch (error) {
		console.error('呼叫物品派發交易 RPC 失敗：', error);
		return jsonResponse({ error: '物品派發服務暫時無法使用，請稍後再試。' }, 503);
	}
});
