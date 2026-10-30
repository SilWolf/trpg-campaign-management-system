import type { InventoryItem, AllItem } from '@/types';
import { toBlacksmithItemBase } from '@/lib/blacksmithImport';
import { supabase } from '@/lib/supabase';

export interface CampaignItemDistributionLine {
	itemBase: AllItem;
	blacksmithItemId: string | null;
	isHomebrew: boolean;
	isImportant: boolean;
	quantity: number;
}

export interface CampaignItemDistributionRequest {
	requestId: string;
	campaignId: string;
	ownerId: string;
	isPrivate: boolean;
	reason: string;
	confirmLargeBatch: boolean;
	items: CampaignItemDistributionLine[];
}

export type CampaignItemDistributionResult =
	| { requiresConfirmation: true; predictedInsertCount: number }
	| {
			requiresConfirmation?: false;
			operationId: string;
			insertedCount: number;
			updatedCount: number;
			inventoryIds: string[];
			replayed: boolean;
	  };

export function estimateNewInventoryRows(
	lines: readonly CampaignItemDistributionLine[],
	inventory: readonly InventoryItem[],
	ownerId: string,
	isPrivate: boolean,
): number {
	let count = 0;
	const countedSourceIds = new Set<string>();

	for (const line of lines) {
		if (line.itemBase.isStackable && line.blacksmithItemId) {
			if (countedSourceIds.has(line.blacksmithItemId)) continue;
			countedSourceIds.add(line.blacksmithItemId);
			const existing = inventory.some(
				(item) =>
					item.ownerId === ownerId &&
					Boolean(item.isPrivate) === isPrivate &&
					item.blacksmithItemId === line.blacksmithItemId,
			);
			if (!existing) count += 1;
		} else if (line.itemBase.isStackable) {
			count += 1;
		} else {
			count += line.quantity;
		}
	}

	return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function throwEdgeFunctionError(error: Error): Promise<never> {
	if ('context' in error && error.context instanceof Response) {
		let body: unknown;
		try {
			body = await error.context.clone().json();
		} catch {
			throw error;
		}
		if (isRecord(body) && typeof body.error === 'string') {
			throw new Error(body.error);
		}
	}
	throw error;
}

function readDistributionResult(value: unknown): CampaignItemDistributionResult {
	if (!isRecord(value)) {
		throw new Error('派發服務回傳了無效結果。');
	}
	if (value.requiresConfirmation === true) {
		if (
			typeof value.predictedInsertCount !== 'number' ||
			!Number.isSafeInteger(value.predictedInsertCount) ||
			value.predictedInsertCount < 11 ||
			value.predictedInsertCount > 20
		) {
			throw new Error('派發服務回傳了無效的批次確認筆數。');
		}
		return {
			requiresConfirmation: true,
			predictedInsertCount: value.predictedInsertCount,
		};
	}
	if (
		typeof value.operationId !== 'string' ||
		value.operationId.length === 0 ||
		typeof value.insertedCount !== 'number' ||
		!Number.isSafeInteger(value.insertedCount) ||
		value.insertedCount < 0 ||
		typeof value.updatedCount !== 'number' ||
		!Number.isSafeInteger(value.updatedCount) ||
		value.updatedCount < 0 ||
		!Array.isArray(value.inventoryIds) ||
		value.inventoryIds.length === 0 ||
		!value.inventoryIds.every((id) => typeof id === 'string') ||
		typeof value.replayed !== 'boolean'
	) {
		throw new Error('派發服務回傳了無效結果。');
	}
	return {
		operationId: value.operationId,
		insertedCount: value.insertedCount,
		updatedCount: value.updatedCount,
		inventoryIds: value.inventoryIds,
		replayed: value.replayed,
	};
}

export async function dispatchCampaignItems(
	request: CampaignItemDistributionRequest,
): Promise<CampaignItemDistributionResult> {
	if (!supabase) {
		throw new Error('物品派發需要連線至戰役伺服器。');
	}

	const { data, error } = await supabase.functions.invoke<unknown>(
		'dispatch-campaign-items',
		{
			body: {
				...request,
				items: request.items.map((line) => ({
					...line,
					itemBase: toBlacksmithItemBase(line.itemBase),
				})),
			},
		},
	);
	if (error) await throwEdgeFunctionError(error);
	return readDistributionResult(data);
}
