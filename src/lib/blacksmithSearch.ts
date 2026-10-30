import { ITEM_CATEGORY_LABELS, RARITY_CONFIG } from '@/data';
import {
	filterBlacksmithCatalogItems,
	type BlacksmithCatalogFilters,
} from '@/lib/blacksmithCatalog';
import {
	toBlacksmithImportDefinition,
	type BlacksmithImportDefinition,
} from '@/lib/blacksmithImport';
import { copyItemToDefinitionForm } from '@/lib/itemDefinitions';
import type {
	BlacksmithItem,
	BlacksmithTemplate,
	HomebrewForm,
	ItemBaseCategory,
	ItemBaseRarity,
} from '@/types';

export type BlacksmithSearchSource = 'mine' | 'official' | 'shared';

export interface BlacksmithSearchFilters extends BlacksmithCatalogFilters {
	search: string;
}

export interface BlacksmithSearchResult {
	itemId: string;
	initialQuantity: 1;
	source: BlacksmithSearchSource;
	sourceLabel: string;
	item: BlacksmithItem | BlacksmithTemplate;
}

export interface BlacksmithSearchGroups {
	mine: BlacksmithSearchResult[];
	official: BlacksmithSearchResult[];
	shared: BlacksmithSearchResult[];
}

export interface BlacksmithImportDraft {
	itemId: string;
	definition: BlacksmithImportDefinition;
	quantity: 1;
}

export function createBlacksmithImportDraft(
	result: BlacksmithSearchResult,
): BlacksmithImportDraft {
	return {
		itemId: result.itemId,
		definition: toBlacksmithImportDefinition(result.item),
		quantity: 1,
	};
}

export function createBlacksmithCopyForm(
	result: BlacksmithSearchResult,
): HomebrewForm {
	return copyItemToDefinitionForm(result.item);
}

export function canonicalRulebookItemId(
	catalogId: string,
	sourceItemId: string,
): string {
	if (!catalogId || catalogId.includes(':') || !sourceItemId) {
		throw new Error('官方規則書物品來源 ID 無效。');
	}
	return `rulebook:${catalogId}:${sourceItemId}`;
}

export function canonicalWorkshopItemId(templateId: string): string {
	if (!templateId || templateId.includes(':')) {
		throw new Error('鍛造工坊物品來源 ID 無效。');
	}
	return `workshop:${templateId}`;
}

function searchableTemplateText(item: BlacksmithTemplate): string {
	return [
		item.name,
		item.category,
		ITEM_CATEGORY_LABELS[item.category],
		...item.subTypes,
		item.rarity,
		RARITY_CONFIG[item.rarity].label,
		item.effects,
		item.flavor,
		item.dmNotes,
		...item.affixes.flatMap((affix) => [affix.name, affix.desc]),
	]
		.join(' ')
		.toLocaleLowerCase();
}

function matchesWorkshopFilters(
	item: BlacksmithTemplate,
	filters: BlacksmithSearchFilters,
): boolean {
	const search = filters.search.trim().toLocaleLowerCase();
	return (
		(!filters.category ||
			filters.category === 'all' ||
			item.category === (filters.category as ItemBaseCategory)) &&
		(!filters.rarity ||
			filters.rarity === 'all' ||
			item.rarity === (filters.rarity as ItemBaseRarity)) &&
		searchableTemplateText(item).includes(search)
	);
}

export function buildBlacksmithSearchGroups(
	sources: {
		mine: readonly BlacksmithTemplate[];
		official: readonly BlacksmithItem[];
		shared: readonly BlacksmithTemplate[];
	},
	filters: BlacksmithSearchFilters,
): BlacksmithSearchGroups {
	const normalizedSearch = filters.search.trim();
	if (!normalizedSearch) {
		return { mine: [], official: [], shared: [] };
	}

	const mine = sources.mine
		.filter((item) => matchesWorkshopFilters(item, filters))
		.slice(0, 20)
		.map((item) => ({
			itemId: canonicalWorkshopItemId(item.id),
			initialQuantity: 1 as const,
			source: 'mine' as const,
			sourceLabel: '我的鍛造工坊',
			item,
		}));
	const official = filterBlacksmithCatalogItems(sources.official, {
		...filters,
		search: normalizedSearch,
	})
		.slice(0, 20)
		.map((item) => ({
			itemId: canonicalRulebookItemId(item.catalogId, item.itemId),
			initialQuantity: 1 as const,
			source: 'official' as const,
			sourceLabel: item.catalogTitle,
			item,
		}));
	const remainingWorkshopSlots = Math.max(0, 20 - mine.length);
	const shared = sources.shared
		.filter((item) => matchesWorkshopFilters(item, filters))
		.slice(0, remainingWorkshopSlots)
		.map((item) => ({
			itemId: canonicalWorkshopItemId(item.id),
			initialQuantity: 1 as const,
			source: 'shared' as const,
			sourceLabel: `分享者 ${item.ownerId}`,
			item,
		}));
	return { mine, official, shared };
}
