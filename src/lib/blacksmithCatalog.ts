import { ITEM_CATEGORY_LABELS, RARITY_CONFIG } from '@/data';
import type {
	ArmorItem,
	BlacksmithCatalogDefinition,
	BlacksmithCatalogIndex,
	BlacksmithItem,
	BlacksmithLookupEntry,
	ItemBaseCategory,
	ItemAffix,
	ItemBaseRarity,
	WeaponItem,
	WeaponItemMastery,
} from '@/types';
import { resolveItemImageUrl } from '@/lib/imageReferences';

export const BLACKSMITH_CATEGORY_LABELS = ITEM_CATEGORY_LABELS;

export interface BlacksmithCatalogFilters {
	search?: string;
	rarity?: ItemBaseRarity | 'all';
	category?: ItemBaseCategory | 'all';
}

const SCHEMA_VERSION = 4;
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
const RARITIES: readonly ItemBaseRarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const WEAPON_MASTERIES: readonly WeaponItemMastery[] = [
	'Cleave',
	'Graze',
	'Nick',
	'Push',
	'Sap',
	'Slow',
	'Topple',
	'Vex',
];
const SOURCE_WEAPON_MASTERIES: Readonly<Record<string, WeaponItemMastery>> = {
	'精通: 失衡': 'Sap',
	'精通: 侵擾': 'Vex',
	'精通: 迅擊': 'Nick',
	'精通: 擦掠': 'Graze',
	'精通: 橫掃': 'Cleave',
	'精通: 推離': 'Push',
	'精通: 削弱': 'Sap',
	'精通: 緩速': 'Slow',
};
const INDEX_KEYS = ['schemaVersion', 'catalogs'];
const CATALOG_KEYS = ['catalogId', 'title', 'itemsFile', 'lookupFile'];
const ITEM_FILE_KEYS = ['schemaVersion', 'catalogId', 'items'];
const ITEM_KEYS = [
	'itemId',
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
	'source',
];
const WEAPON_ITEM_KEYS = ['weaponProperties'];
const ARMOR_ITEM_KEYS = ['armorProperties'];
const LOOKUP_KEYS = ['schemaVersion', 'catalogId', 'items'];
const LOOKUP_ENTRY_KEYS = [
	'sourceKey',
	'itemId',
	'name',
	'aliases',
	'searchTerms',
];

function isItemCategory(value: string): value is ItemBaseCategory {
	return CATEGORIES.some((category) => category === value);
}

function isRarity(value: string): value is ItemBaseRarity {
	return RARITIES.some((rarity) => rarity === value);
}

function isWeaponMastery(value: string): value is WeaponItemMastery {
	return WEAPON_MASTERIES.some((mastery) => mastery === value);
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

function readNullableString(
	value: unknown,
	label: string,
): string | null | undefined {
	if (value === undefined || value === null) return value;
	return readString(value, label);
}

function readNonNegativeNumber(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} 必須是非負有限數字。`);
	}
	return value;
}

function readBoolean(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') throw new Error(`${label} 必須是布林值。`);
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

function readAffixes(value: unknown, label: string): ItemAffix[] {
	if (!Array.isArray(value)) throw new Error(`${label} 必須是陣列。`);
	return value.map((entry, index) => {
		const affixLabel = `${label}[${index}]`;
		const affix = readJsonRecord(entry, affixLabel);
		const expectedKeys = ['id', 'name', 'desc', 'isHidden'];
		if (Object.keys(affix).some((key) => !expectedKeys.includes(key))) {
			throw new Error(`${affixLabel} 含有不支援的欄位。`);
		}
		if (affix.isHidden !== undefined && typeof affix.isHidden !== 'boolean') {
			throw new Error(`${affixLabel}.isHidden 必須是布林值。`);
		}
		return {
			id: readNonEmptyString(affix.id, `${affixLabel}.id`),
			name: readString(affix.name, `${affixLabel}.name`),
			desc: readString(affix.desc, `${affixLabel}.desc`),
			...(affix.isHidden === undefined ? {} : { isHidden: affix.isHidden }),
		};
	});
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
				? [...ITEM_KEYS, ...WEAPON_ITEM_KEYS]
				: record.category === 'Armor'
					? [...ITEM_KEYS, ...ARMOR_ITEM_KEYS]
					: ITEM_KEYS;
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
	const items: BlacksmithItem[] = itemRecords.map((record, index) => {
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
		const icon = readNullableString(record.icon, `${label} icon`);
		if (
			typeof icon === 'string' &&
			(!icon.startsWith('./images/') ||
				icon.includes('\\') ||
				icon.split('/').includes('..'))
		) {
			throw new Error(`${label} icon 必須是安全的 ./images/ 相對路徑。`);
		}
		const maxCharges = record.maxCharges;
		if (
			maxCharges !== null &&
			maxCharges !== undefined &&
			(typeof maxCharges !== 'number' ||
				!Number.isSafeInteger(maxCharges) ||
				maxCharges < 0)
		) {
			throw new Error(`${label} maxCharges 必須是非負整數、null 或省略。`);
		}
		const baseItem = {
			catalogId: catalog.catalogId,
			catalogTitle: catalog.title,
			itemId,
			sourceKey: lookup.sourceKey,
			name,
			subTypes: readStringArray(record.subTypes, `${label} subTypes`),
			rarity,
			icon,
			weight: readNonNegativeNumber(record.weight, `${label} weight`),
			valueGp: readNonNegativeNumber(record.valueGp, `${label} valueGp`),
			affixes: readAffixes(record.affixes, `${label} affixes`),
			effects: readString(record.effects, `${label} effects`),
			flavor: readNullableString(record.flavor, `${label} flavor`),
			dmNotes: readString(record.dmNotes, `${label} dmNotes`),
			maxCharges,
			isEquippable: readBoolean(record.isEquippable, `${label} isEquippable`),
			isConsumable: readBoolean(record.isConsumable, `${label} isConsumable`),
			isRequireAttunement: readBoolean(
				record.isRequireAttunement,
				`${label} isRequireAttunement`,
			),
			source: readString(record.source, `${label} source`),
			aliases: lookup.aliases,
			searchTerms: lookup.searchTerms,
		};
		if (category === 'Armor') {
			const armorProperties = readJsonRecord(
				record.armorProperties,
				`${label} armorProperties`,
			);
			if (!hasExactKeys(armorProperties, ['ac'])) {
				throw new Error(`${label} armorProperties 必須只包含 ac。`);
			}
			const armor: BlacksmithItem & ArmorItem = {
				...baseItem,
				category,
				armorProperties: {
					ac: readNonEmptyString(
						armorProperties.ac,
						`${label} armorProperties.ac`,
					),
				},
			};
			return armor;
		}
		if (category === 'Weapon') {
			const weaponProperties = readJsonRecord(
				record.weaponProperties,
				`${label} weaponProperties`,
			);
			const validWeaponKeys = ['damage', 'mastery', 'properties'];
			if (
				Object.keys(weaponProperties).some((key) => !validWeaponKeys.includes(key)) ||
				!Object.hasOwn(weaponProperties, 'damage') ||
				!Object.hasOwn(weaponProperties, 'properties')
			) {
				throw new Error(`${label} weaponProperties 欄位不符來源合約。`);
			}
			const sourceMastery =
				weaponProperties.mastery === undefined
					? undefined
					: readNonEmptyString(
							weaponProperties.mastery,
							`${label} weaponProperties.mastery`,
						);
			const mastery =
				sourceMastery === undefined
					? undefined
					: SOURCE_WEAPON_MASTERIES[sourceMastery] ??
						(isWeaponMastery(sourceMastery) ? sourceMastery : undefined);
			if (sourceMastery !== undefined && mastery === undefined) {
				throw new Error(`${label} 武器精通不受支援：${sourceMastery}`);
			}
			const weapon: BlacksmithItem & WeaponItem = {
				...baseItem,
				category,
				weaponProperties: {
					damage: readNonEmptyString(
						weaponProperties.damage,
						`${label} weaponProperties.damage`,
					),
					...(mastery ? { mastery } : {}),
					properties: readStringArray(
						weaponProperties.properties,
						`${label} weaponProperties.properties`,
					),
				},
			};
			return weapon;
		}
		return { ...baseItem, category };
	});

	if (lookupById.size !== itemIds.size) {
		throw new Error(`「${catalog.title}」物品與 lookup 數量不一致。`);
	}
	return items;
}

function searchableText(item: BlacksmithItem): string {
	return [
		item.name,
		item.category,
		BLACKSMITH_CATEGORY_LABELS[item.category],
		...item.subTypes,
		item.rarity,
		RARITY_CONFIG[item.rarity].label,
		item.catalogTitle,
		item.source,
		item.effects,
		item.flavor ?? '',
		...item.aliases,
		...item.searchTerms,
	]
		.join(' ')
		.toLocaleLowerCase();
}

export function filterBlacksmithCatalogItems(
	items: readonly BlacksmithItem[],
	filters: BlacksmithCatalogFilters,
): BlacksmithItem[] {
	const normalizedQuery = filters.search?.trim().toLocaleLowerCase() ?? '';
	return items.filter(
		(item) =>
			(!filters.category ||
				filters.category === 'all' ||
				item.category === filters.category) &&
			(!filters.rarity ||
				filters.rarity === 'all' ||
				item.rarity === filters.rarity) &&
			(!normalizedQuery || searchableText(item).includes(normalizedQuery)),
	);
}

export function getBlacksmithIconUrl(icon: string): string {
	const imageUrl = resolveItemImageUrl(icon, import.meta.env.BASE_URL);
	if (!imageUrl) {
		throw new Error('鍛造工坊圖示參照格式無效。');
	}
	return imageUrl;
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
