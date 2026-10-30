import { supabase } from '@/lib/supabase';

function requireSupabase() {
	if (!supabase) {
		throw new Error('背包雲端資料需要設定 Supabase，請先完成登入與環境設定。');
	}
	return supabase;
}

async function callInventoryTransaction(
	name: 'split_inventory_item' | 'transfer_inventory_item',
	args:
		| {
				p_campaign_id: string;
				p_item_id: string;
				p_split_quantity: number;
		  }
		| {
				p_campaign_id: string;
				p_item_id: string;
				p_target_owner_id: string;
				p_quantity: number;
		  },
): Promise<string> {
	const { data, error } = await requireSupabase().rpc(name, args);
	if (error) throw error;
	if (typeof data !== 'string' || data.length === 0) {
		throw new Error('背包交易服務回傳了無效的物品識別碼。');
	}
	return data;
}

export function splitInventoryStack(
	campaignId: string,
	itemId: string,
	splitQuantity: number,
): Promise<string> {
	return callInventoryTransaction('split_inventory_item', {
		p_campaign_id: campaignId,
		p_item_id: itemId,
		p_split_quantity: splitQuantity,
	});
}

export function transferInventoryStack(
	campaignId: string,
	itemId: string,
	targetOwnerId: string,
	quantity: number,
): Promise<string> {
	return callInventoryTransaction('transfer_inventory_item', {
		p_campaign_id: campaignId,
		p_item_id: itemId,
		p_target_owner_id: targetOwnerId,
		p_quantity: quantity,
	});
}

export async function transferCampaignCurrency(
	campaignId: string,
	sourceCharacterId: string,
	sourceWallet: 'public' | 'private',
	targetCharacterId: string | null,
	targetWallet: 'public' | 'private',
	amountCents: number,
): Promise<{
	operationId: string;
	shareCents: number;
	remainderCents: number;
	recipientCount: number;
}> {
	const { data, error } = await requireSupabase().rpc(
		'transfer_campaign_currency',
		{
			p_campaign_id: campaignId,
			p_source_character_id: sourceCharacterId,
			p_source_wallet: sourceWallet,
			p_target_character_id: targetCharacterId,
			p_target_wallet: targetWallet,
			p_amount_cents: amountCents,
		},
	);
	if (error) throw error;
	if (
		typeof data !== 'object' ||
		data === null ||
		typeof data.operationId !== 'string' ||
		typeof data.shareCents !== 'number' ||
		typeof data.remainderCents !== 'number' ||
		typeof data.recipientCount !== 'number'
	) {
		throw new Error('貨幣交易服務回傳了無效結果。');
	}
	return {
		operationId: data.operationId,
		shareCents: data.shareCents,
		remainderCents: data.remainderCents,
		recipientCount: data.recipientCount,
	};
}
