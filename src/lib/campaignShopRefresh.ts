import type {
	BlacksmithItem,
	CampaignShopRefreshCandidate,
	CampaignShopRefreshPolicy,
	CampaignShopRefreshRange,
	CampaignShopRefreshRule,
	ItemCategory,
	Rarity,
} from '@/types';

const RARITIES: readonly Rarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const CATEGORIES: readonly ItemCategory[] = [
	'Weapon',
	'Armor',
	'Consumable',
	'Misc',
];

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
		typeof value.catalogTitle !== 'string' ||
		typeof value.itemId !== 'string' ||
		value.itemId.trim().length === 0 ||
		typeof value.sourceKey !== 'string' ||
		value.sourceKey.trim().length === 0 ||
		typeof value.name !== 'string' ||
		value.name.trim().length === 0 ||
		!isStringArray(value.subTypes) ||
		!RARITIES.includes(value.rarity as Rarity) ||
		typeof value.icon !== 'string' ||
		typeof value.weight !== 'number' ||
		!Number.isFinite(value.weight) ||
		value.weight < 0 ||
		typeof value.valueGp !== 'number' ||
		!Number.isFinite(value.valueGp) ||
		value.valueGp < 0 ||
		typeof value.requiresAttunement !== 'boolean' ||
		typeof value.description !== 'string' ||
		typeof value.source !== 'string' ||
		!isStringArray(value.aliases) ||
		!isStringArray(value.searchTerms) ||
		!CATEGORIES.includes(value.category as ItemCategory)
	) {
		return false;
	}
	if (
		(value.weaponProperties !== undefined &&
			!isStringArray(value.weaponProperties)) ||
		(value.weaponMastery !== undefined &&
			typeof value.weaponMastery !== 'string')
	) {
		return false;
	}

	if (value.category === 'Armor') {
		return value.ac === null || typeof value.ac === 'string';
	}
	return value.damage === null || typeof value.damage === 'string';
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
		rarity?: Rarity;
		category?: ItemCategory;
	} = {};
	if (value.param.search !== undefined) {
		if (typeof value.param.search !== 'string') {
			throw new Error(`${field}.param.search 必須是文字。`);
		}
		normalizedParam.search = value.param.search;
	}
	if (value.param.rarity !== undefined) {
		if (!RARITIES.includes(value.param.rarity as Rarity)) {
			throw new Error(`${field}.param.rarity 不是有效的稀有度。`);
		}
		normalizedParam.rarity = value.param.rarity as Rarity;
	}
	if (value.param.category !== undefined) {
		if (!CATEGORIES.includes(value.param.category as ItemCategory)) {
			throw new Error(`${field}.param.category 不是有效的物品分類。`);
		}
		normalizedParam.category = value.param.category as ItemCategory;
	}
	return { source: value.source, param: normalizedParam };
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
