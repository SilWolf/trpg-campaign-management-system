import {
	fromDbCampaignShop,
	fromDbCampaignShopItem,
	fromDbCampaignShopOrder,
	supabase,
	toDbCampaignShop,
	toDbCampaignShopItem,
} from '@/lib/supabase';
import {
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

export type CampaignShopValues = Pick<
	CampaignShop,
	'name' | 'backgroundImageUrl' | 'isActive'
> &
	Partial<Pick<CampaignShop, 'refreshPolicy'>>;

export type CampaignShopItemValues = Pick<
	CampaignShopItem,
	| 'itemSnapshot'
	| 'sourceType'
	| 'sourceId'
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

async function validateRefreshPolicy(
	policy: CampaignShopRefreshPolicy,
): Promise<CampaignShopRefreshPolicy> {
	const catalogs = await loadBlacksmithCatalogDefinitions();
	return normalizeCampaignShopRefreshPolicy(
		policy,
		new Set(catalogs.map((catalog) => catalog.catalogId)),
	);
}

const ORDER_SELECT =
	'id,checkout_id,campaign_id,shop_id,shop_item_id,character_id,item_snapshot,shop_name_snapshot,unit_price_gp,quantity,total_price_gp,status,requires_approval,created_at,updated_at,reviewed_at';

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
						? { refresh_policy: refreshPolicy }
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
		.update({ refresh_policy: refreshPolicy })
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
		.select('*')
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
	const rows = items.map((item) =>
		toDbCampaignShopItem({ campaignId, shopId, ...item }),
	);
	const { data, error } = await requireSupabase()
		.from('campaign_shop_items')
		.insert(rows)
		.select();
	if (error) throw error;
	return (data ?? []).map(fromDbCampaignShopItem);
}

export async function saveCampaignShopItem(
	campaignId: string,
	shopId: string,
	values: CampaignShopItemValues,
	id?: string,
): Promise<CampaignShopItem> {
	const client = requireSupabase();
	const item = { campaignId, shopId, ...values };
	const result = id
		? await client
				.from('campaign_shop_items')
				.update({
					item_snapshot: toDbCampaignShopItem(item).item_snapshot,
					source_type: item.sourceType,
					source_id: item.sourceId,
					unit_price_gp: item.unitPriceGp,
					stock_available: item.stockAvailable,
					requires_approval: item.requiresApproval,
					is_active: item.isActive,
				})
				.eq('id', id)
				.eq('campaign_id', campaignId)
				.eq('shop_id', shopId)
				.select()
				.single()
		: await client
				.from('campaign_shop_items')
				.insert(toDbCampaignShopItem(item))
				.select()
				.single();
	const { data, error } = result;
	if (error) throw error;
	return fromDbCampaignShopItem(data);
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
		return toDbCampaignShopItem({
			campaignId,
			shopId,
			itemSnapshot: change.itemSnapshot,
			sourceType: 'catalog',
			sourceId: change.sourceId,
			unitPriceGp: change.unitPriceGp,
			stockAvailable: change.stockAvailable,
			requiresApproval: false,
			isActive: true,
		});
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
		!Number.isSafeInteger(data.restocked) ||
		!Number.isSafeInteger(data.deleted)
	) {
		throw new Error('商店刷新服務回傳了無效的結果。');
	}
	return {
		created: data.created,
		restocked: data.restocked,
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
		| 'purchase_campaign_shop_item'
		| 'request_campaign_shop_item'
		| 'checkout_campaign_shop_cart'
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
	shopItemId: string;
	characterId: string;
	walletType: CampaignShopWalletType;
	quantity: number;
};

function toPurchaseArgs(details: PurchaseDetails) {
	return {
		p_campaign_id: details.campaignId,
		p_shop_item_id: details.shopItemId,
		p_character_id: details.characterId,
		p_wallet_type: details.walletType,
		p_quantity: details.quantity,
	};
}

export function purchaseCampaignShopItem(
	details: PurchaseDetails,
): Promise<string> {
	return callOrderRpc(
		'purchase_campaign_shop_item',
		toPurchaseArgs(details),
	);
}

export function requestCampaignShopItem(
	details: PurchaseDetails,
): Promise<string> {
	return callOrderRpc(
		'request_campaign_shop_item',
		toPurchaseArgs(details),
	);
}

export function checkoutCampaignShopCart(
	details: Omit<PurchaseDetails, 'shopItemId' | 'quantity'> & {
		shopId: string;
		items: { shopItemId: string; quantity: number }[];
	},
): Promise<string> {
	return callOrderRpc('checkout_campaign_shop_cart', {
		p_campaign_id: details.campaignId,
		p_shop_id: details.shopId,
		p_character_id: details.characterId,
		p_wallet_type: details.walletType,
		p_items: details.items.map((item) => ({
			shop_item_id: item.shopItemId,
			quantity: item.quantity,
		})),
	});
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
