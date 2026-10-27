import {
	fromDbCampaignShop,
	fromDbCampaignShopItem,
	fromDbCampaignShopOrder,
	supabase,
	toDbCampaignShop,
	toDbCampaignShopRefreshPolicy,
	toDbCampaignShopItem,
} from '@/lib/supabase';
import {
	CAMPAIGN_RULEBOOKS_SOURCE,
	normalizeCampaignShopRefreshPolicy,
} from '@/lib/campaignShopRefresh';
import { loadBlacksmithCatalogDefinitions } from '@/lib/blacksmithCatalog';
import type {
	CampaignShop,
	CampaignShopItem,
	CampaignShopOrder,
	CampaignShopRefreshExpectedItem,
	CampaignShopRefreshItemChange,
	CampaignShopRefreshPolicy,
	CampaignShopRefreshResult,
	CampaignShopWalletType,
} from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CampaignShopValues = Pick<
	CampaignShop,
	'name' | 'backgroundImageUrl' | 'isActive'
> &
	Partial<Pick<CampaignShop, 'refreshPolicy'>>;

export type CampaignShopItemValues = Pick<
	CampaignShopItem,
	| 'itemSnapshot'
	| 'unitPriceGp'
	| 'stockAvailable'
	| 'requiresApproval'
	| 'isActive'
>;

function requireSupabase() {
	if (!supabase) {
		throw new Error('商店雲端資料需要設定 Supabase，請先完成登入與環境設定。');
	}
	return supabase;
}

async function throwEdgeFunctionError(error: Error): Promise<never> {
	if ('context' in error && error.context instanceof Response) {
		let body: unknown;
		try {
			body = await error.context.clone().json();
		} catch {
			throw error;
		}
		if (
			typeof body === 'object' &&
			body !== null &&
			'error' in body &&
			typeof body.error === 'string'
		) {
			throw new Error(body.error);
		}
	}
	throw error;
}

async function validateRefreshPolicy(
	policy: CampaignShopRefreshPolicy,
): Promise<CampaignShopRefreshPolicy> {
	const catalogs = await loadBlacksmithCatalogDefinitions();
	return normalizeCampaignShopRefreshPolicy(
		policy,
		new Set([
			...catalogs.map((catalog) => catalog.catalogId),
			CAMPAIGN_RULEBOOKS_SOURCE,
		]),
	);
}

const SHOP_ITEM_SELECT =
	'id,campaign_id,shop_id,item_snapshot,is_identified,unit_price_gp,stock_available,stock_reserved,requires_approval,is_active,created_at,updated_at';
export const INVENTORY_ITEM_SELECT =
	'id,owner_id,slot,name,category,sub_type,rarity,icon,damage,mastery,ac,weight,value_gp,quantity,equipped,requires_attunement,attuned,is_homebrew,is_identified,charges,max_charges,effects,flavor,dm_notes,player_notes,is_private,is_equippable,is_consumable,is_important,affixes,item_base';
const ORDER_SELECT =
	'id,checkout_id,campaign_id,shop_id,shop_item_id,character_id,item_snapshot,shop_name_snapshot,unit_price_gp,quantity,total_price_gp,status,requires_approval,created_at,updated_at,reviewed_at,is_identified';

type SecureChangeListener = {
	onChange: (change: { rowId: string; action: string }) => void;
	onError: (error: Error) => void;
};

const secureChangeChannels = new Map<
	string,
	{ channel: RealtimeChannel; listeners: Set<SecureChangeListener> }
>();

export function subscribeCampaignSecureChanges(
	campaignId: string,
	onChange: (change: { rowId: string; action: string }) => void,
	onError: (error: Error) => void,
): () => void {
	const listener = { onChange, onError };
	let subscription = secureChangeChannels.get(campaignId);
	if (!subscription) {
		const listeners = new Set<SecureChangeListener>();
		const channel = requireSupabase()
			.channel(`campaign:${campaignId}:secure-data`, {
			config: { private: true },
		})
		.on(
			'broadcast',
			{ event: 'campaign_data_changed' },
			({ payload }: { payload: unknown }) => {
				if (
					typeof payload !== 'object' ||
					payload === null ||
					!('campaign_id' in payload) ||
					payload.campaign_id !== campaignId ||
					!('row_id' in payload) ||
					typeof payload.row_id !== 'string' ||
					!('action' in payload) ||
					typeof payload.action !== 'string'
				) {
					for (const registered of listeners) {
						registered.onError(new Error('戰役安全同步通知格式無效。'));
					}
					return;
				}
				for (const registered of listeners) {
					registered.onChange({
						rowId: payload.row_id,
						action: payload.action,
					});
				}
			},
		)
		.subscribe((status, error) => {
			if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
				for (const registered of listeners) {
					registered.onError(
						error ?? new Error(`戰役安全同步頻道狀態：${status}`),
					);
				}
			}
		});
		subscription = { channel, listeners };
		secureChangeChannels.set(campaignId, subscription);
	}
	subscription.listeners.add(listener);
	return () => {
		const current = secureChangeChannels.get(campaignId);
		if (!current) return;
		current.listeners.delete(listener);
		if (current.listeners.size === 0) {
			secureChangeChannels.delete(campaignId);
			void supabase?.removeChannel(current.channel);
		}
	};
}

export async function loadCampaignShops(
	campaignId: string,
): Promise<CampaignShop[]> {
	const { data, error } = await requireSupabase()
		.from('campaign_shops')
		.select('*')
		.eq('campaign_id', campaignId)
		.order('created_at', { ascending: true });
	if (error) throw error;
	return (data ?? []).map(fromDbCampaignShop);
}

export async function saveCampaignShop(
	campaignId: string,
	values: CampaignShopValues,
	id?: string,
): Promise<CampaignShop> {
	const client = requireSupabase();
	const refreshPolicy =
		values.refreshPolicy === undefined
			? undefined
			: await validateRefreshPolicy(values.refreshPolicy);
	const shop = { campaignId, ...values, refreshPolicy };
	const result = id
		? await client
				.from('campaign_shops')
				.update({
					name: shop.name,
					background_image_url: shop.backgroundImageUrl,
					is_active: shop.isActive,
					...(refreshPolicy
						? {
								refresh_policy:
									toDbCampaignShopRefreshPolicy(refreshPolicy),
							}
						: {}),
				})
				.eq('id', id)
				.eq('campaign_id', campaignId)
				.select()
				.single()
		: await client
				.from('campaign_shops')
				.insert(toDbCampaignShop({ ...shop, refreshPolicy }))
				.select()
				.single();
	const { data, error } = result;
	if (error) throw error;
	return fromDbCampaignShop(data);
}

export async function saveCampaignShopRefreshPolicy(
	campaignId: string,
	shopId: string,
	policy: CampaignShopRefreshPolicy,
): Promise<CampaignShop> {
	const refreshPolicy = await validateRefreshPolicy(policy);
	const { data, error } = await requireSupabase()
		.from('campaign_shops')
		.update({
			refresh_policy: toDbCampaignShopRefreshPolicy(refreshPolicy),
		})
		.eq('id', shopId)
		.eq('campaign_id', campaignId)
		.select()
		.single();
	if (error) throw error;
	return fromDbCampaignShop(data);
}

export async function loadCampaignShopItems(
	campaignId: string,
	shopId: string,
): Promise<CampaignShopItem[]> {
	const { data, error } = await requireSupabase()
		.from('campaign_shop_items')
		.select(SHOP_ITEM_SELECT)
		.eq('campaign_id', campaignId)
		.eq('shop_id', shopId)
		.order('created_at', { ascending: true });
	if (error) throw error;
	return (data ?? []).map(fromDbCampaignShopItem);
}

export async function createCampaignShopItems(
	campaignId: string,
	shopId: string,
	items: CampaignShopItemValues[],
): Promise<CampaignShopItem[]> {
	if (items.length === 0) return [];
	const created: CampaignShopItem[] = [];
	for (const item of items) {
		created.push(await saveCampaignShopItem(campaignId, shopId, item));
	}
	return created;
}

export async function saveCampaignShopItem(
	campaignId: string,
	shopId: string,
	values: CampaignShopItemValues,
	id?: string,
): Promise<CampaignShopItem> {
	const client = requireSupabase();
	const item = { campaignId, shopId, ...values };
	const row = toDbCampaignShopItem(item);
	const { data, error } = await client.rpc('save_campaign_shop_item', {
		p_campaign_id: campaignId,
		p_shop_id: shopId,
		p_item_id: id ?? null,
		p_item_snapshot: row.item_snapshot,
		p_unit_price_gp: item.unitPriceGp,
		p_stock_available: item.stockAvailable,
		p_requires_approval: item.requiresApproval,
		p_is_active: item.isActive,
	});
	if (error) throw error;
	if (typeof data !== 'string' || data.length === 0) {
		throw new Error('商店商品儲存服務回傳了無效的識別碼。');
	}
	const { data: savedRow, error: loadError } = await client
		.from('campaign_shop_items')
		.select(SHOP_ITEM_SELECT)
		.eq('id', data)
		.eq('campaign_id', campaignId)
		.eq('shop_id', shopId)
		.single();
	if (loadError) throw loadError;
	return fromDbCampaignShopItem(savedRow);
}

export async function deleteCampaignShopItem(
	campaignId: string,
	shopId: string,
	id: string,
): Promise<void> {
	const { error } = await requireSupabase()
		.from('campaign_shop_items')
		.delete()
		.eq('id', id)
		.eq('campaign_id', campaignId)
		.eq('shop_id', shopId);
	if (error) throw error;
}

export async function refreshCampaignShopItems(
	campaignId: string,
	shopId: string,
	expectedShopUpdatedAt: string,
	expectedItems: CampaignShopRefreshExpectedItem[],
	keepItemsOnRefresh: boolean,
	changes: CampaignShopRefreshItemChange[],
): Promise<CampaignShopRefreshResult> {
	const catalogs = await loadBlacksmithCatalogDefinitions();
	const catalogIds = new Set(catalogs.map((catalog) => catalog.catalogId));
	if (!Number.isFinite(Date.parse(expectedShopUpdatedAt))) {
		throw new Error('刷新預覽的商店版本無效，請重新載入並產生預覽。');
	}
	if (
		expectedItems.some(
			(item) =>
				!item.id || !Number.isFinite(Date.parse(item.updatedAt)),
		) ||
		new Set(expectedItems.map((item) => item.id)).size !== expectedItems.length
	) {
		throw new Error('刷新預覽的商品版本資料無效，請重新產生預覽。');
	}

	const sourceIds = new Set<string>();
	const dbChanges = changes.map((change) => {
		const separatorIndex = change.sourceId.indexOf(':');
		const catalogId = change.sourceId.slice(0, separatorIndex);
		const itemId = change.sourceId.slice(separatorIndex + 1);
		if (
			separatorIndex < 1 ||
			itemId.length === 0 ||
			!catalogIds.has(catalogId) ||
			sourceIds.has(change.sourceId)
		) {
			throw new Error('刷新預覽包含無效或重複的官方目錄來源商品。');
		}
		sourceIds.add(change.sourceId);
		if (
			!Number.isSafeInteger(change.stockAvailable) ||
			change.stockAvailable < 0 ||
			change.stockAvailable > 2_147_483_647 ||
			!Number.isFinite(change.unitPriceGp) ||
			change.unitPriceGp < 0.01 ||
			change.unitPriceGp >= 10_000_000_000 ||
			Math.abs(
				change.unitPriceGp * 100 -
					Math.round(change.unitPriceGp * 100),
			) > 1e-8
		) {
			throw new Error('刷新預覽包含無效的商品價格或庫存。');
		}
		const item = toDbCampaignShopItem({
			campaignId,
			shopId,
			itemSnapshot: change.itemSnapshot,
			unitPriceGp: change.unitPriceGp,
			stockAvailable: change.stockAvailable,
			requiresApproval: false,
			isActive: true,
		});
		return { ...item, source_id: change.sourceId };
	});

	const { data, error } = await requireSupabase().rpc(
		'refresh_campaign_shop_items',
		{
			p_campaign_id: campaignId,
			p_shop_id: shopId,
			p_expected_shop_updated_at: expectedShopUpdatedAt,
			p_expected_items: expectedItems.map((item) => ({
				id: item.id,
				updated_at: item.updatedAt,
			})),
			p_keep_items: keepItemsOnRefresh,
			p_changes: dbChanges.map((change) => ({
				source_id: change.source_id,
				item_snapshot: change.item_snapshot,
				unit_price_gp: change.unit_price_gp,
				stock_available: change.stock_available,
			})),
		},
	);
	if (error) throw error;
	if (
		typeof data !== 'object' ||
		data === null ||
		!Number.isSafeInteger(data.created) ||
		!Number.isSafeInteger(data.deleted)
	) {
		throw new Error('商店刷新服務回傳了無效的結果。');
	}
	return {
		created: data.created,
		deleted: data.deleted,
	};
}

export async function loadCampaignShopOrders(
	campaignId: string,
): Promise<CampaignShopOrder[]> {
	const { data, error } = await requireSupabase()
		.from('campaign_shop_orders')
		.select(ORDER_SELECT)
		.eq('campaign_id', campaignId)
		.order('created_at', { ascending: false });
	if (error) throw error;
	return (data ?? []).map(fromDbCampaignShopOrder);
}

async function callOrderRpc(
	name:
		| 'approve_campaign_shop_order'
		| 'reject_campaign_shop_order'
		| 'cancel_campaign_shop_order',
	args:
		| {
				p_campaign_id: string;
				p_shop_item_id: string;
				p_character_id: string;
				p_wallet_type: CampaignShopWalletType;
				p_quantity: number;
		  }
		| {
				p_campaign_id: string;
				p_shop_id: string;
				p_character_id: string;
				p_wallet_type: CampaignShopWalletType;
				p_items: { shop_item_id: string; quantity: number }[];
		  }
		| { p_order_id: string },
): Promise<string> {
	const { data, error } = await requireSupabase().rpc(name, args);
	if (error) throw error;
	if (typeof data !== 'string' || data.length === 0) {
		throw new Error('商店交易服務回傳了無效的訂單識別碼。');
	}
	return data;
}

type PurchaseDetails = {
	campaignId: string;
	shopId: string;
	shopItemId: string;
	characterId: string;
	walletType: CampaignShopWalletType;
	quantity: number;
};

export function purchaseCampaignShopItem(
	details: PurchaseDetails,
): Promise<string> {
	return checkoutCampaignShopCart({
		campaignId: details.campaignId,
		shopId: details.shopId,
		characterId: details.characterId,
		walletType: details.walletType,
		items: [{ shopItemId: details.shopItemId, quantity: details.quantity }],
	});
}

export function requestCampaignShopItem(
	details: PurchaseDetails,
): Promise<string> {
	return purchaseCampaignShopItem(details);
}

export function checkoutCampaignShopCart(
	details: Omit<PurchaseDetails, 'shopItemId' | 'quantity'> & {
		shopId: string;
		items: { shopItemId: string; quantity: number }[];
	},
): Promise<string> {
	const client = requireSupabase();
	return client.functions
		.invoke<{ checkoutId: string }>('campaign-shop-purchase', {
			body: {
				campaignId: details.campaignId,
				shopId: details.shopId,
				characterId: details.characterId,
				walletType: details.walletType,
				items: details.items,
			},
		})
		.then(({ data, error }) => {
			if (error) return throwEdgeFunctionError(error);
			if (!data || typeof data.checkoutId !== 'string' || !data.checkoutId) {
				throw new Error('購買服務回傳了無效的交易識別碼。');
			}
			return data.checkoutId;
		});
}

export async function identifyInventoryItem(
	campaignId: string,
	itemId: string,
): Promise<void> {
	const { data, error } = await requireSupabase().functions.invoke<{
		itemId: string;
	}>('identify-inventory-item', { body: { campaignId, itemId } });
	if (error) await throwEdgeFunctionError(error);
	if (!data || data.itemId !== itemId) {
		throw new Error('鑑定服務回傳了無效的物品識別碼。');
	}
}

export function approveCampaignShopOrder(orderId: string): Promise<string> {
	return callOrderRpc('approve_campaign_shop_order', {
		p_order_id: orderId,
	});
}

export function rejectCampaignShopOrder(orderId: string): Promise<string> {
	return callOrderRpc('reject_campaign_shop_order', {
		p_order_id: orderId,
	});
}

export function cancelCampaignShopOrder(orderId: string): Promise<string> {
	return callOrderRpc('cancel_campaign_shop_order', {
		p_order_id: orderId,
	});
}
