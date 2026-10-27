import type {
	BlacksmithItem,
	CampaignShopItem,
	CampaignShopItemSnapshot,
	CampaignShopRefreshExpectedItem,
	CampaignShopRefreshItemChange,
	CampaignShopRefreshCandidate,
	CampaignShopRefreshPolicy,
	CampaignShopRefreshRange,
	CampaignShopRefreshRule,
	ItemBaseCategory,
	ItemBaseRarity,
} from '@/types';
import { filterBlacksmithCatalogItems } from '@/lib/blacksmithCatalog';

const RARITIES: readonly ItemBaseRarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const CATEGORIES: readonly ItemBaseCategory[] = [
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
const MAX_STOCK = 2_147_483_647;

export interface CampaignShopRefreshSelection {
	item: BlacksmithItem;
	ruleIndex: number;
	stockAvailable: number;
}

export type CampaignShopRefreshPreviewAction =
	| 'create'
	| 'restock'
	| 'keep'
	| 'delete';

export interface CampaignShopRefreshPreviewEntry {
	key: string;
	action: CampaignShopRefreshPreviewAction;
	itemId: string | null;
	catalogId: string | null;
	sourceTitle: string;
	sourceId: string | null;
	ruleIndex: number | null;
	name: string;
	rarity: ItemBaseRarity;
	category: ItemBaseCategory;
	unitPriceGp: number;
	stockAvailable: number;
	itemSnapshot: CampaignShopItemSnapshot;
	existingItemId?: string;
}

export interface CampaignShopRefreshPreview {
	expectedShopUpdatedAt: string;
	expectedItems: CampaignShopRefreshExpectedItem[];
	keepItemsOnRefresh: boolean;
	entries: CampaignShopRefreshPreviewEntry[];
	changes: CampaignShopRefreshItemChange[];
}

export function createDefaultCampaignShopRefreshPolicy(): CampaignShopRefreshPolicy {
	return {
		flags: { keepItemsOnRefresh: false },
		rules: [],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function requireInteger(
	value: unknown,
	field: string,
	max = Number.MAX_SAFE_INTEGER,
): number {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > max
	) {
		throw new Error(`${field} 必須是介於 0 與 ${max} 的非負整數。`);
	}
	return value;
}

function isBlacksmithItem(value: unknown): value is BlacksmithItem {
	if (!isRecord(value)) return false;
	if (
		typeof value.catalogId !== 'string' ||
		value.catalogId.trim().length === 0 ||
		value.catalogId.includes(':') ||
		typeof value.catalogTitle !== 'string' ||
		value.catalogTitle.trim().length === 0 ||
		typeof value.itemId !== 'string' ||
		value.itemId.trim().length === 0 ||
		value.itemId.includes(':') ||
		typeof value.sourceKey !== 'string' ||
		value.sourceKey !== `${value.catalogId}:${value.itemId}` ||
		value.sourceKey.trim().length === 0 ||
		typeof value.name !== 'string' ||
		value.name.trim().length === 0 ||
		!isStringArray(value.subTypes) ||
		!RARITIES.includes(value.rarity as ItemBaseRarity) ||
		(value.icon !== undefined &&
			value.icon !== null &&
			typeof value.icon !== 'string') ||
		typeof value.weight !== 'number' ||
		!Number.isFinite(value.weight) ||
		value.weight < 0 ||
		typeof value.valueGp !== 'number' ||
		!Number.isFinite(value.valueGp) ||
		value.valueGp < 0 ||
		typeof value.isRequireAttunement !== 'boolean' ||
		typeof value.isEquippable !== 'boolean' ||
		typeof value.isConsumable !== 'boolean' ||
		typeof value.effects !== 'string' ||
		!Array.isArray(value.affixes) ||
		typeof value.source !== 'string' ||
		!isStringArray(value.aliases) ||
		!isStringArray(value.searchTerms) ||
		!CATEGORIES.includes(value.category as ItemBaseCategory)
	) {
		return false;
	}
	if (value.category === 'Armor') {
		return (
			isRecord(value.armorProperties) &&
			typeof value.armorProperties.ac === 'string' &&
			value.armorProperties.ac.trim().length > 0
		);
	}
	if (value.category === 'Weapon') {
		return (
			isRecord(value.weaponProperties) &&
			typeof value.weaponProperties.damage === 'string' &&
			value.weaponProperties.damage.trim().length > 0 &&
			isStringArray(value.weaponProperties.properties) &&
			(value.weaponProperties.mastery === undefined ||
				typeof value.weaponProperties.mastery === 'string')
		);
	}
	return true;
}

function normalizeRange(
	value: unknown,
	field: string,
	defaultMax: number | null,
): CampaignShopRefreshRange {
	if (!isRecord(value)) {
		throw new Error(`${field} 必須是數量範圍物件。`);
	}
	const min =
		value.min === undefined ? 0 : requireInteger(value.min, `${field}.min`);
	const max =
		value.max === undefined
			? defaultMax
			: value.max === null
				? null
				: requireInteger(value.max, `${field}.max`);
	const p = value.p === undefined ? 1 : value.p;
	if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 1) {
		throw new Error(`${field}.p 必須大於 0 且小於或等於 1。`);
	}
	const step =
		value.step === undefined ? 1 : requireInteger(value.step, `${field}.step`);
	if (step < 1) {
		throw new Error(`${field}.step 必須是大於或等於 1 的安全整數。`);
	}
	if (max !== null && min > max) {
		throw new Error(`${field}.min 不得大於有限的 ${field}.max。`);
	}
	return { min, max, p, step };
}

function normalizeCandidate(
	value: unknown,
	field: string,
	catalogIds?: ReadonlySet<string>,
): CampaignShopRefreshCandidate {
	if (isRecord(value) && isRecord(value.item_base)) {
		value = { ...value, ...value.item_base };
	}
	if (isBlacksmithItem(value)) {
		if (catalogIds && !catalogIds.has(value.catalogId)) {
			throw new Error(`${field} 指定了不存在的官方目錄「${value.catalogId}」。`);
		}
		return value;
	}

	if (isRecord(value) && ('itemId' in value || 'catalogId' in value)) {
		throw new Error(`${field} 不是完整有效的官方目錄商品。`);
	}
	if (
		!isRecord(value) ||
		typeof value.source !== 'string' ||
		value.source.trim().length === 0 ||
		!isRecord(value.param)
	) {
		throw new Error(`${field} 必須是完整目錄商品或有效的官方目錄篩選器。`);
	}
	if (catalogIds && !catalogIds.has(value.source)) {
		throw new Error(`${field} 指定了不存在的官方目錄「${value.source}」。`);
	}

	const normalizedParam: {
		search?: string;
		rarity?: ItemBaseRarity;
		category?: ItemBaseCategory;
	} = {};
	if (value.param.search !== undefined) {
		if (typeof value.param.search !== 'string') {
			throw new Error(`${field}.param.search 必須是文字。`);
		}
		normalizedParam.search = value.param.search;
	}
	if (value.param.rarity !== undefined) {
		if (!RARITIES.includes(value.param.rarity as ItemBaseRarity)) {
			throw new Error(`${field}.param.rarity 不是有效的稀有度。`);
		}
		normalizedParam.rarity = value.param.rarity as ItemBaseRarity;
	}
	if (value.param.category !== undefined) {
		if (!CATEGORIES.includes(value.param.category as ItemBaseCategory)) {
			throw new Error(`${field}.param.category 不是有效的物品分類。`);
		}
		normalizedParam.category = value.param.category as ItemBaseCategory;
	}
	return { source: value.source, param: normalizedParam };
}

function readRandom(random: () => number): number {
	const value = random();
	if (!Number.isFinite(value) || value < 0 || value >= 1) {
		throw new Error('亂數來源必須回傳大於或等於 0 且小於 1 的有限數字。');
	}
	return value;
}

function sampleRangeCount(
	range: CampaignShopRefreshRange,
	limit: number,
	random: () => number,
): number {
	const min = range.min ?? 0;
	const max = Math.min(range.max ?? limit, limit);
	const probability = range.p ?? 1;
	const step = range.step ?? 1;
	let count = Math.min(min, max);

	while (count < max && probability < 1) {
		if (readRandom(random) < probability) break;
		count = Math.min(count + step, max);
	}
	return count;
}

function sampleWithoutReplacement<T>(
	items: readonly T[],
	count: number,
	random: () => number,
): T[] {
	if (count <= 0) return [];
	if (count >= items.length) return [...items];
	const pool = [...items];
	for (let index = 0; index < count && index < pool.length - 1; index += 1) {
		const selectedIndex =
			index + Math.floor(readRandom(random) * (pool.length - index));
		[pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
	}
	return pool.slice(0, count);
}

export async function resolveCampaignShopRefreshCandidates(
	value: unknown,
	catalogIds: ReadonlySet<string>,
	loadCatalog: (catalogId: string) => Promise<BlacksmithItem[]>,
	random: () => number = Math.random,
): Promise<CampaignShopRefreshSelection[]> {
	const policy = normalizeCampaignShopRefreshPolicy(value, catalogIds);
	const filterSources = new Set<string>();
	for (const rule of policy.rules) {
		for (const candidate of rule.possibleItemsOrFilters) {
			if (!('itemId' in candidate)) filterSources.add(candidate.source);
		}
	}

	const catalogItems = new Map<string, BlacksmithItem[]>();
	await Promise.all(
		[...filterSources].map(async (catalogId) => {
			const loadedItems = await loadCatalog(catalogId);
			const validatedItems = loadedItems.map((item, index) => {
				const validated = normalizeCandidate(
					item,
					`目錄「${catalogId}」第 ${index + 1} 筆商品`,
					catalogIds,
				);
				if (
					!('itemId' in validated) ||
					validated.catalogId !== catalogId
				) {
					throw new Error(
						`目錄「${catalogId}」回傳了無效或其他來源的商品。`,
					);
				}
				return validated;
			});
			catalogItems.set(catalogId, validatedItems);
		}),
	);

	const seenItemIds = new Set<string>();
	const candidatesByRule = policy.rules.map(() => [] as BlacksmithItem[]);
	for (const [ruleIndex, rule] of policy.rules.entries()) {
		for (const candidate of rule.possibleItemsOrFilters) {
			const matches =
				'itemId' in candidate
					? [candidate]
					: filterBlacksmithCatalogItems(
							catalogItems.get(candidate.source) ?? [],
							candidate.param,
						);
			for (const item of matches) {
				if (seenItemIds.has(item.itemId)) continue;
				seenItemIds.add(item.itemId);
				candidatesByRule[ruleIndex].push(item);
			}
		}
	}

	const seenSelectedIds = new Set<string>();
	const selections: CampaignShopRefreshSelection[] = [];
	for (const [ruleIndex, rule] of policy.rules.entries()) {
		const candidates = candidatesByRule[ruleIndex];
		const pickCount =
			rule.pickCount === null || rule.pickCount === undefined
				? candidates.length
				: typeof rule.pickCount === 'number'
					? Math.min(rule.pickCount, candidates.length)
					: sampleRangeCount(rule.pickCount, candidates.length, random);
		for (const item of sampleWithoutReplacement(candidates, pickCount, random)) {
			if (seenSelectedIds.has(item.itemId)) continue;
			seenSelectedIds.add(item.itemId);
			selections.push({
				item,
				ruleIndex,
				stockAvailable: sampleRangeCount(
					rule.stockAvailable,
					MAX_STOCK,
					random,
				),
			});
		}
	}
	return selections;
}

export function blacksmithItemToCampaignShopSnapshot(
	item: BlacksmithItem,
): CampaignShopItemSnapshot {
	const base = {
		name: item.name,
		subTypes: [...item.subTypes],
		rarity: item.rarity,
		icon: item.icon ?? 'Package',
		weight: item.weight,
		valueGp: item.valueGp,
		affixes: [...item.affixes],
		effects: item.effects,
		flavor: item.flavor ?? '',
		dmNotes: item.dmNotes,
		maxCharges: item.maxCharges ?? 0,
		isEquippable: item.isEquippable,
		isConsumable: item.isConsumable,
		isRequireAttunement: item.isRequireAttunement,
		isHomebrew: false,
		isImportant: false,
	};
	if (item.category === 'Weapon') {
		return {
			...base,
			category: 'Weapon',
			weaponProperties: { ...item.weaponProperties },
		};
	}
	if (item.category === 'Armor') {
		return {
			...base,
			category: 'Armor',
			armorProperties: { ...item.armorProperties },
		};
	}
	return { ...base, category: item.category };
}

function makePreviewEntry(
	item: CampaignShopItem,
	action: 'keep' | 'delete',
): CampaignShopRefreshPreviewEntry {
	return {
		key: `existing:${item.id}`,
		action,
		itemId: null,
		catalogId: null,
		sourceTitle: item.sourceType === 'catalog' ? '官方目錄' : '既有商品',
		sourceId: item.sourceId,
		ruleIndex: null,
		name: item.itemSnapshot.name,
		rarity: item.itemSnapshot.rarity,
		category: item.itemSnapshot.category,
		unitPriceGp: item.unitPriceGp,
		stockAvailable: item.stockAvailable,
		itemSnapshot: item.itemSnapshot,
		existingItemId: item.id,
	};
}

export function buildCampaignShopRefreshPreview(
	policyValue: unknown,
	selections: readonly CampaignShopRefreshSelection[],
	shopUpdatedAt: string,
	existingItems: readonly CampaignShopItem[],
	catalogIds?: ReadonlySet<string>,
): CampaignShopRefreshPreview {
	if (!Number.isFinite(Date.parse(shopUpdatedAt))) {
		throw new Error('刷新預覽的商店版本無效，請重新載入並產生預覽。');
	}
	const policy = normalizeCampaignShopRefreshPolicy(policyValue, catalogIds);
	const selectedIds = new Set<string>();
	for (const selection of selections) {
		const item = normalizeCandidate(
			selection.item,
			'刷新候選商品',
			catalogIds,
		);
		if (
			!('itemId' in item) ||
			selectedIds.has(item.itemId) ||
			!Number.isSafeInteger(selection.ruleIndex) ||
			selection.ruleIndex < 0 ||
			selection.ruleIndex >= policy.rules.length ||
			!Number.isSafeInteger(selection.stockAvailable) ||
			selection.stockAvailable < 0 ||
			selection.stockAvailable > MAX_STOCK
		) {
			throw new Error('刷新預覽包含無效或重複的候選商品資料。');
		}
		selectedIds.add(item.itemId);
	}

	const selectedBySource = new Map(
		selections.map((selection) => [
			`${selection.item.catalogId}:${selection.item.itemId}`,
			selection,
		]),
	);
	const existingBySource = new Map<string, CampaignShopItem[]>();
	for (const item of existingItems) {
		if (item.sourceType !== 'catalog' || !item.sourceId) continue;
		const matching = existingBySource.get(item.sourceId) ?? [];
		matching.push(item);
		existingBySource.set(item.sourceId, matching);
	}

	const entries: CampaignShopRefreshPreviewEntry[] = [];
	if (policy.flags.keepItemsOnRefresh) {
		for (const item of existingItems) {
			const selected =
				item.sourceType === 'catalog' && item.sourceId
				? selectedBySource.get(item.sourceId)
				: undefined;
			if (!selected) {
				entries.push(makePreviewEntry(item, 'keep'));
				continue;
			}
			const matches = existingBySource.get(item.sourceId ?? '') ?? [];
			if (matches.length > 1) {
				throw new Error(
					`商店內存在重複的目錄來源商品「${item.sourceId}」，無法安全補貨。`,
				);
			}
		}
	} else {
		for (const item of existingItems) {
			entries.push(makePreviewEntry(item, 'delete'));
		}
	}

	const changes: CampaignShopRefreshItemChange[] = [];
	for (const selection of selections) {
		const { item, ruleIndex, stockAvailable } = selection;
		const sourceId = `${item.catalogId}:${item.itemId}`;
		const matching = existingBySource.get(sourceId) ?? [];
		if (policy.flags.keepItemsOnRefresh && matching.length > 1) {
			throw new Error(
				`商店內存在重複的目錄來源商品「${sourceId}」，無法安全補貨。`,
			);
		}
		const existing = policy.flags.keepItemsOnRefresh
			? matching[0]
			: undefined;
		const itemSnapshot = blacksmithItemToCampaignShopSnapshot(item);
		const unitPriceGp = existing?.unitPriceGp ?? Math.max(item.valueGp, 0.01);
		if (
			!Number.isFinite(unitPriceGp) ||
			unitPriceGp < 0.01 ||
			unitPriceGp >= 10_000_000_000 ||
			Math.abs(unitPriceGp * 100 - Math.round(unitPriceGp * 100)) > 1e-8
		) {
			throw new Error(`商品「${item.name}」的刷新售價不符合商店金額限制。`);
		}
		const entrySnapshot = existing?.itemSnapshot ?? itemSnapshot;
		entries.push({
			key: `catalog:${sourceId}`,
			action: existing ? 'restock' : 'create',
			itemId: item.itemId,
			catalogId: item.catalogId,
			sourceTitle: item.catalogTitle,
			sourceId,
			ruleIndex,
			name: entrySnapshot.name,
			rarity: entrySnapshot.rarity,
			category: entrySnapshot.category,
			unitPriceGp,
			stockAvailable,
			itemSnapshot: entrySnapshot,
			...(existing ? { existingItemId: existing.id } : {}),
		});
		changes.push({
			sourceId,
			itemSnapshot,
			unitPriceGp,
			stockAvailable,
		});
	}

	return {
		expectedShopUpdatedAt: shopUpdatedAt,
		expectedItems: existingItems.map(({ id, updatedAt }) => ({ id, updatedAt })),
		keepItemsOnRefresh: policy.flags.keepItemsOnRefresh,
		entries,
		changes,
	};
}

function normalizeRule(
	value: unknown,
	index: number,
	catalogIds?: ReadonlySet<string>,
): CampaignShopRefreshRule {
	const field = `rules[${index}]`;
	if (!isRecord(value) || !Array.isArray(value.possibleItemsOrFilters)) {
		throw new Error(`${field}.possibleItemsOrFilters 必須是陣列。`);
	}
	const possibleItemsOrFilters = value.possibleItemsOrFilters.map(
		(candidate, candidateIndex) =>
			normalizeCandidate(
				candidate,
				`${field}.possibleItemsOrFilters[${candidateIndex}]`,
				catalogIds,
			),
	);

	let pickCount: number | null | CampaignShopRefreshRange;
	if (value.pickCount === undefined || value.pickCount === null) {
		pickCount = null;
	} else if (typeof value.pickCount === 'number') {
		pickCount = requireInteger(value.pickCount, `${field}.pickCount`);
	} else {
		pickCount = normalizeRange(value.pickCount, `${field}.pickCount`, null);
	}

	const stockAvailable = normalizeRange(
		value.stockAvailable,
		`${field}.stockAvailable`,
		1,
	);
	const stockMin = stockAvailable.min ?? 0;
	const stockMax = stockAvailable.max ?? null;
	if (
		stockMax !== null &&
		stockMax > 2_147_483_647
	) {
		throw new Error(`${field}.stockAvailable.max 不得超過資料庫 integer 上限。`);
	}
	if (stockMin > 2_147_483_647) {
		throw new Error(`${field}.stockAvailable.min 不得超過資料庫 integer 上限。`);
	}
	if (stockAvailable.step !== undefined && stockAvailable.step > 2_147_483_647) {
		throw new Error(`${field}.stockAvailable.step 不得超過資料庫 integer 上限。`);
	}
	return { possibleItemsOrFilters, pickCount, stockAvailable };
}

export function normalizeCampaignShopRefreshPolicy(
	value: unknown,
	catalogIds?: ReadonlySet<string>,
): CampaignShopRefreshPolicy {
	if (value === undefined || value === null) {
		return createDefaultCampaignShopRefreshPolicy();
	}
	if (!isRecord(value)) {
		throw new Error('商店刷新政策格式無效。');
	}

	const flags = value.flags;
	if (
		!isRecord(flags) ||
		typeof flags.keepItemsOnRefresh !== 'boolean'
	) {
		throw new Error('商店刷新政策 flags 或 keepItemsOnRefresh 格式無效。');
	}
	const rulesValue = value.rules;
	if (!Array.isArray(rulesValue)) {
		throw new Error('商店刷新政策 rules 必須是陣列。');
	}

	return {
		flags: { keepItemsOnRefresh: flags.keepItemsOnRefresh },
		rules: rulesValue.map((rule, index) =>
			normalizeRule(rule, index, catalogIds),
		),
	};
}

export function validateCampaignShopRefreshPolicy(
	value: unknown,
	catalogIds?: ReadonlySet<string>,
): CampaignShopRefreshPolicy {
	return normalizeCampaignShopRefreshPolicy(value, catalogIds);
}
