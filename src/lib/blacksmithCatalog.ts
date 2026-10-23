import type {
	BlacksmithCatalogDefinition,
	BlacksmithCatalogIndex,
	BlacksmithItem,
	BlacksmithLookupEntry,
	ItemCategory,
	Rarity,
} from '@/types';

const SCHEMA_VERSION = 3;
const CATEGORIES: readonly ItemCategory[] = [
	'Weapon',
	'Armor',
	'Consumable',
	'Misc',
];
const RARITIES: readonly Rarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const INDEX_KEYS = ['schemaVersion', 'catalogs'];
const CATALOG_KEYS = ['catalogId', 'title', 'itemsFile', 'lookupFile'];
const ITEM_FILE_KEYS = ['schemaVersion', 'catalogId', 'items'];
const ITEM_KEYS = [
	'itemId',
	'name',
	'rarity',
	'requiresAttunement',
	'weight',
	'description',
	'source',
	'category',
	'subTypes',
	'valueGp',
	'icon',
];
const WEAPON_ITEM_KEYS = ['weaponProperties', 'weaponMastery'];
const LOOKUP_KEYS = ['schemaVersion', 'catalogId', 'items'];
const LOOKUP_ENTRY_KEYS = [
	'sourceKey',
	'itemId',
	'name',
	'aliases',
	'searchTerms',
];

function isItemCategory(value: string): value is ItemCategory {
	return CATEGORIES.some((category) => category === value);
}

function isRarity(value: string): value is Rarity {
	return RARITIES.some((rarity) => rarity === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
	value: Record<string, unknown>,
	expectedKeys: readonly string[],
): boolean {
	const actualKeys = Object.keys(value);
	return (
		actualKeys.length === expectedKeys.length &&
		expectedKeys.every((key) => Object.hasOwn(value, key))
	);
}

function readJsonRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} 必須是 JSON 物件。`);
	return value;
}

function readNonEmptyString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${label} 必須是非空字串。`);
	}
	return value;
}

function readString(value: unknown, label: string): string {
	if (typeof value !== 'string') throw new Error(`${label} 必須是字串。`);
	return value;
}

function readStringArray(value: unknown, label: string): string[] {
	if (
		!Array.isArray(value) ||
		!value.every((entry) => typeof entry === 'string')
	) {
		throw new Error(`${label} 必須是字串陣列。`);
	}
	return value;
}

function readNonEmptyStringArray(value: unknown, label: string): string[] {
	const entries = readStringArray(value, label);
	if (entries.length === 0 || entries.some((entry) => entry.trim().length === 0)) {
		throw new Error(`${label} 必須是包含非空字串的陣列。`);
	}
	return entries;
}

function readCatalogId(value: unknown, label: string): string {
	const catalogId = readNonEmptyString(value, label);
	if (
		!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(catalogId) ||
		catalogId.includes('..')
	) {
		throw new Error(`${label} 格式無效。`);
	}
	return catalogId;
}

function readCatalogFilePath(value: unknown, label: string): string {
	const path = readNonEmptyString(value, label);
	if (
		!path.startsWith('./catalogs/') ||
		path.includes('\\') ||
		path.includes('?') ||
		path.includes('#') ||
		path.split('/').includes('..')
	) {
		throw new Error(`${label} 必須是安全的 ./catalogs/ 相對路徑。`);
	}
	return path;
}

function readCatalogIndex(value: unknown): BlacksmithCatalogIndex {
	const index = readJsonRecord(value, '目錄索引');
	if (!hasExactKeys(index, INDEX_KEYS) || index.schemaVersion !== SCHEMA_VERSION) {
		throw new Error('目錄索引格式或 schemaVersion 不受支援。');
	}
	if (!Array.isArray(index.catalogs)) {
		throw new Error('目錄索引的 catalogs 必須是陣列。');
	}

	const catalogIds = new Set<string>();
	const catalogs = index.catalogs.map((entry, indexPosition) => {
		const label = `目錄索引第 ${indexPosition + 1} 筆`;
		const catalog = readJsonRecord(entry, label);
		if (!hasExactKeys(catalog, CATALOG_KEYS)) {
			throw new Error(`${label} 欄位與目前來源合約不符。`);
		}

		const definition: BlacksmithCatalogDefinition = {
			catalogId: readCatalogId(catalog.catalogId, `${label} catalogId`),
			title: readNonEmptyString(catalog.title, `${label} title`),
			itemsFile: readCatalogFilePath(catalog.itemsFile, `${label} itemsFile`),
			lookupFile: readCatalogFilePath(catalog.lookupFile, `${label} lookupFile`),
		};
		if (catalogIds.has(definition.catalogId)) {
			throw new Error(`目錄索引含重複 catalogId：${definition.catalogId}`);
		}
		catalogIds.add(definition.catalogId);
		return definition;
	});

	return { schemaVersion: SCHEMA_VERSION, catalogs };
}

function publicDataUrl(path: string): string {
	const baseUrl = import.meta.env.BASE_URL.endsWith('/')
		? import.meta.env.BASE_URL
		: `${import.meta.env.BASE_URL}/`;
	return `${baseUrl}data/blacksmith/${path.slice(2)}`;
}

async function fetchJson(url: string, label: string): Promise<unknown> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${label}載入失敗（HTTP ${response.status}）。`);
	}
	try {
		return await response.json();
	} catch {
		throw new Error(`${label}不是有效的 JSON。`);
	}
}

function readItemFile(
	value: unknown,
	catalog: BlacksmithCatalogDefinition,
): Record<string, unknown>[] {
	const file = readJsonRecord(value, `「${catalog.title}」物品檔`);
	if (
		!hasExactKeys(file, ITEM_FILE_KEYS) ||
		file.schemaVersion !== SCHEMA_VERSION ||
		file.catalogId !== catalog.catalogId ||
		!Array.isArray(file.items)
	) {
		throw new Error(`「${catalog.title}」物品檔與目錄索引不相符。`);
	}
	return file.items.map((item, index) => {
		const record = readJsonRecord(item, `「${catalog.title}」第 ${index + 1} 筆物品`);
		const expectedKeys =
			record.category === 'Weapon'
				? [...ITEM_KEYS, 'damage', ...WEAPON_ITEM_KEYS]
				: record.category === 'Armor'
					? [...ITEM_KEYS, 'ac']
					: [...ITEM_KEYS, 'damage'];
		if (!hasExactKeys(record, expectedKeys)) {
			throw new Error(`「${catalog.title}」第 ${index + 1} 筆物品欄位不符來源合約。`);
		}
		return record;
	});
}

function readLookupFile(
	value: unknown,
	catalog: BlacksmithCatalogDefinition,
): BlacksmithLookupEntry[] {
	const file = readJsonRecord(value, `「${catalog.title}」lookup 檔`);
	if (
		!hasExactKeys(file, LOOKUP_KEYS) ||
		file.schemaVersion !== SCHEMA_VERSION ||
		file.catalogId !== catalog.catalogId ||
		!Array.isArray(file.items)
	) {
		throw new Error(`「${catalog.title}」lookup 檔與目錄索引不相符。`);
	}
	return file.items.map((entry, index) => {
		const label = `「${catalog.title}」第 ${index + 1} 筆 lookup`;
		const lookup = readJsonRecord(entry, label);
		if (!hasExactKeys(lookup, LOOKUP_ENTRY_KEYS)) {
			throw new Error(`${label} 欄位與來源合約不符。`);
		}
		const itemId = readNonEmptyString(lookup.itemId, `${label} itemId`);
		return {
			sourceKey: readNonEmptyString(lookup.sourceKey, `${label} sourceKey`),
			itemId,
			name: readNonEmptyString(lookup.name, `${label} name`),
			aliases: readStringArray(lookup.aliases, `${label} aliases`),
			searchTerms: readStringArray(lookup.searchTerms, `${label} searchTerms`),
		};
	});
}

function adaptCatalogItems(
	catalog: BlacksmithCatalogDefinition,
	itemRecords: Record<string, unknown>[],
	lookupEntries: BlacksmithLookupEntry[],
): BlacksmithItem[] {
	const lookupById = new Map<string, BlacksmithLookupEntry>();
	const sourceKeys = new Set<string>();
	for (const lookup of lookupEntries) {
		if (lookupById.has(lookup.itemId)) {
			throw new Error(`「${catalog.title}」lookup 含重複 itemId：${lookup.itemId}`);
		}
		if (sourceKeys.has(lookup.sourceKey)) {
			throw new Error(`「${catalog.title}」lookup 含重複 sourceKey：${lookup.sourceKey}`);
		}
		lookupById.set(lookup.itemId, lookup);
		sourceKeys.add(lookup.sourceKey);
	}

	const itemIds = new Set<string>();
	const items = itemRecords.map((record, index) => {
		const label = `「${catalog.title}」第 ${index + 1} 筆物品`;
		const itemId = readNonEmptyString(record.itemId, `${label} itemId`);
		if (itemIds.has(itemId)) {
			throw new Error(`「${catalog.title}」物品檔含重複 itemId：${itemId}`);
		}
		itemIds.add(itemId);

		const lookup = lookupById.get(itemId);
		const name = readNonEmptyString(record.name, `${label} name`);
		if (
			!lookup ||
			lookup.name !== name ||
			lookup.sourceKey !== `${catalog.catalogId}:${itemId}`
		) {
			throw new Error(`「${catalog.title}」物品 ${itemId} 無法與 lookup 正確對照。`);
		}

		const category = readNonEmptyString(record.category, `${label} category`);
		if (!isItemCategory(category)) {
			throw new Error(`${label} category 不受支援：${category}`);
		}
		const rarity = readNonEmptyString(record.rarity, `${label} rarity`);
		if (!isRarity(rarity)) {
			throw new Error(`${label} rarity 不受支援：${rarity}`);
		}
		const weight = record.weight;
		const valueGp = record.valueGp;
		if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
			throw new Error(`${label} weight 必須是非負有限數字。`);
		}
		if (
			typeof valueGp !== 'number' ||
			!Number.isInteger(valueGp) ||
			valueGp < 0
		) {
			throw new Error(`${label} valueGp 必須是非負整數。`);
		}
		if (typeof record.requiresAttunement !== 'boolean') {
			throw new Error(`${label} requiresAttunement 必須是布林值。`);
		}
		const icon = readNonEmptyString(record.icon, `${label} icon`);
		if (
			!icon.startsWith('./images/') ||
			icon.includes('\\') ||
			icon.split('/').includes('..')
		) {
			throw new Error(`${label} icon 必須是安全的 ./images/ 相對路徑。`);
		}
		const baseItem = {
			catalogId: catalog.catalogId,
			catalogTitle: catalog.title,
			itemId,
			sourceKey: lookup.sourceKey,
			name,
			subTypes: readNonEmptyStringArray(record.subTypes, `${label} subTypes`),
			rarity,
			icon,
			weight,
			valueGp,
			requiresAttunement: record.requiresAttunement,
			description: readString(record.description, `${label} description`),
			source: readString(record.source, `${label} source`),
			aliases: lookup.aliases,
			searchTerms: lookup.searchTerms,
		};
		if (category === 'Armor') {
			return {
				...baseItem,
				category,
				ac:
					record.ac === null
						? null
						: readString(record.ac, `${label} ac`),
			};
		}
		const damage =
			record.damage === null
				? null
				: readString(record.damage, `${label} damage`);
		if (category === 'Weapon') {
			return {
				...baseItem,
				category,
				damage,
				weaponProperties: readStringArray(
					record.weaponProperties,
					`${label} weaponProperties`,
				),
				weaponMastery: readNonEmptyString(
					record.weaponMastery,
					`${label} weaponMastery`,
				),
			};
		}
		return { ...baseItem, category, damage };
	});

	if (lookupById.size !== itemIds.size) {
		throw new Error(`「${catalog.title}」物品與 lookup 數量不一致。`);
	}
	return items;
}

export function getBlacksmithIconUrl(icon: string): string {
	const baseUrl = import.meta.env.BASE_URL.endsWith('/')
		? import.meta.env.BASE_URL
		: `${import.meta.env.BASE_URL}/`;
	return `${baseUrl}${icon.slice(2)}`;
}

export async function loadBlacksmithCatalogDefinitions(): Promise<
	BlacksmithCatalogDefinition[]
> {
	const indexUrl = publicDataUrl('./catalog-index.json');
	const index = readCatalogIndex(await fetchJson(indexUrl, '規則書目錄索引'));
	return index.catalogs;
}

export async function loadBlacksmithCatalogs(
	catalogId: string,
): Promise<BlacksmithItem[]> {
	const catalogs = await loadBlacksmithCatalogDefinitions();
	const catalog = catalogs.find((entry) => entry.catalogId === catalogId);
	if (!catalog) throw new Error(`找不到規則書目錄：${catalogId}`);

	const [itemFile, lookupFile] = await Promise.all([
		fetchJson(publicDataUrl(catalog.itemsFile), `「${catalog.title}」物品檔`),
		fetchJson(publicDataUrl(catalog.lookupFile), `「${catalog.title}」lookup 檔`),
	]);
	return adaptCatalogItems(
		catalog,
		readItemFile(itemFile, catalog),
		readLookupFile(lookupFile, catalog),
	);
}
