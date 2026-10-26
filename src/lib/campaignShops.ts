import {
	fromDbCampaignShop,
	fromDbCampaignShopItem,
	fromDbCampaignShopOrder,
	supabase,
	toDbCampaignShop,
	toDbCampaignShopItem,
} from '@/lib/supabase';
import type {
	CampaignShop,
	CampaignShopItem,
	CampaignShopOrder,
	CampaignShopWalletType,
} from '@/types';

export type CampaignShopValues = Pick<
	CampaignShop,
	'name' | 'backgroundImageUrl' | 'isActive'
>;

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

const ORDER_SELECT =
	'id,campaign_id,shop_id,shop_item_id,character_id,item_snapshot,shop_name_snapshot,unit_price_gp,quantity,total_price_gp,status,requires_approval,created_at,updated_at,reviewed_at';

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
	const shop = { campaignId, ...values };
	const result = id
		? await client
				.from('campaign_shops')
				.update({
					name: shop.name,
					background_image_url: shop.backgroundImageUrl,
					is_active: shop.isActive,
				})
				.eq('id', id)
				.eq('campaign_id', campaignId)
				.select()
				.single()
		: await client
				.from('campaign_shops')
				.insert(toDbCampaignShop(shop))
				.select()
				.single();
	const { data, error } = result;
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
