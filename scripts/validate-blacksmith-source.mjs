import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const blacksmithDirectory = path.resolve(scriptDirectory, '../public/data/blacksmith');

const fail = (message) => {
	throw new Error(`Blacksmith 來源資料驗證失敗：${message}`);
};

const expectObject = (value, label, expectedKeys) => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		fail(`${label} 必須是物件`);
	}

	const actualKeys = Object.keys(value).sort();
	const sortedExpectedKeys = [...expectedKeys].sort();
	if (
		actualKeys.length !== sortedExpectedKeys.length ||
		actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
	) {
		fail(`${label} 欄位不符；預期 ${sortedExpectedKeys.join(', ')}`);
	}
};

const expectString = (value, label) => {
	if (typeof value !== 'string' || value.trim().length === 0) {
		fail(`${label} 必須是非空字串`);
	}
};

const expectStringArray = (value, label) => {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
		fail(`${label} 必須是字串陣列`);
	}
};

const readJson = async (relativePath) => {
	const fullPath = path.resolve(blacksmithDirectory, relativePath);
	if (!fullPath.startsWith(`${blacksmithDirectory}${path.sep}`)) {
		fail(`路徑超出資料目錄：${relativePath}`);
	}

	try {
		return JSON.parse(await readFile(fullPath, 'utf8'));
	} catch (error) {
		if (error instanceof SyntaxError) {
			fail(`${relativePath} 不是合法 JSON：${error.message}`);
		}
		throw error;
	}
};

const index = await readJson('catalog-index.json');
expectObject(index, 'catalog-index.json', ['schemaVersion', 'catalogs']);
if (index.schemaVersion !== 4 || !Array.isArray(index.catalogs)) {
	fail('catalog-index.json 的 schemaVersion 必須為 4，且 catalogs 必須是陣列');
}

const catalogIds = new Set();
for (const [catalogIndex, catalog] of index.catalogs.entries()) {
	const label = `catalog-index.json catalogs[${catalogIndex}]`;
	expectObject(catalog, label, ['catalogId', 'title', 'itemsFile', 'lookupFile']);
	for (const key of ['catalogId', 'title', 'itemsFile', 'lookupFile']) {
		expectString(catalog[key], `${label}.${key}`);
	}
	if (catalogIds.has(catalog.catalogId)) {
		fail(`重複 catalogId：${catalog.catalogId}`);
	}
	catalogIds.add(catalog.catalogId);

	for (const key of ['itemsFile', 'lookupFile']) {
		if (!catalog[key].startsWith('./catalogs/')) {
			fail(`${label}.${key} 必須指向 ./catalogs/ 下的 JSON`);
		}
	}

	const itemsDocument = await readJson(catalog.itemsFile.slice(2));
	const lookupDocument = await readJson(catalog.lookupFile.slice(2));
	for (const [name, document] of [
		['items', itemsDocument],
		['lookup', lookupDocument],
	]) {
		expectObject(document, `${catalog.catalogId} ${name}`, [
			'schemaVersion',
			'catalogId',
			'items',
		]);
		if (
			document.schemaVersion !== 4 ||
			document.catalogId !== catalog.catalogId ||
			!Array.isArray(document.items)
		) {
			fail(`${catalog.catalogId} ${name} 的版本、catalogId 或 items 結構錯誤`);
		}
	}

	const itemKeys = [
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
	const categories = new Set([
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
	]);
	const rarities = new Set([
		'Common',
		'Uncommon',
		'Rare',
		'VeryRare',
		'Legendary',
		'Artifact',
	]);
	const weaponMasteries = new Set([
		'Cleave',
		'Graze',
		'Nick',
		'Push',
		'Sap',
		'Slow',
		'Topple',
		'Vex',
	]);
	const itemsById = new Map();
	for (const [itemIndex, item] of itemsDocument.items.entries()) {
		const itemLabel = `${catalog.catalogId} items[${itemIndex}]`;
		const expectedItemKeys =
			item.category === 'Weapon'
				? [...itemKeys, 'weaponProperties']
				: item.category === 'Armor'
					? [...itemKeys, 'armorProperties']
					: itemKeys;
		expectObject(item, itemLabel, expectedItemKeys);
		for (const key of [
			'itemId',
			'name',
			'category',
			'source',
		]) {
			expectString(item[key], `${itemLabel}.${key}`);
		}
		if (!categories.has(item.category)) {
			fail(`${itemLabel}.category 不受支援：${item.category}`);
		}
		if (!rarities.has(item.rarity)) {
			fail(`${itemLabel}.rarity 不受支援：${item.rarity}`);
		}
		expectStringArray(item.subTypes, `${itemLabel}.subTypes`);
		if (item.subTypes.some((subType) => subType.trim().length === 0)) {
			fail(`${itemLabel}.subTypes 不可包含空字串`);
		}
		if (item.icon !== null) {
			expectString(item.icon, `${itemLabel}.icon`);
			if (
				!item.icon.startsWith('./images/') ||
				item.icon.includes('\\') ||
				item.icon.split('/').includes('..')
			) {
				fail(`${itemLabel}.icon 必須是安全的 ./images/ 相對路徑或 null`);
			}
		}
		if (
			typeof item.effects !== 'string' ||
			(item.flavor !== null && typeof item.flavor !== 'string') ||
			typeof item.dmNotes !== 'string'
		) {
			fail(`${itemLabel}.effects、flavor 或 dmNotes 文字欄位格式錯誤`);
		}
		if (!Array.isArray(item.affixes)) fail(`${itemLabel}.affixes 必須是陣列`);
		for (const [affixIndex, affix] of item.affixes.entries()) {
			const affixLabel = `${itemLabel}.affixes[${affixIndex}]`;
			expectObject(affix, affixLabel, [
				'id',
				'name',
				'desc',
				...(Object.hasOwn(affix, 'isHidden') ? ['isHidden'] : []),
			]);
			for (const key of ['id', 'name', 'desc']) {
				if (typeof affix[key] !== 'string') fail(`${affixLabel}.${key} 必須是字串`);
			}
			if (affix.isHidden !== undefined && typeof affix.isHidden !== 'boolean') {
				fail(`${affixLabel}.isHidden 必須是布林值`);
			}
		}
		for (const key of ['isEquippable', 'isConsumable', 'isRequireAttunement']) {
			if (typeof item[key] !== 'boolean') fail(`${itemLabel}.${key} 必須是布林值`);
		}
		if (
			item.maxCharges !== null &&
			(!Number.isSafeInteger(item.maxCharges) || item.maxCharges < 0)
		) {
			fail(`${itemLabel}.maxCharges 必須是非負整數或 null`);
		}
		if (item.category === 'Weapon') {
			expectObject(item.weaponProperties, `${itemLabel}.weaponProperties`, [
				'damage',
				...(Object.hasOwn(item.weaponProperties, 'mastery') ? ['mastery'] : []),
				'properties',
			]);
			expectString(item.weaponProperties.damage, `${itemLabel}.weaponProperties.damage`);
			expectStringArray(item.weaponProperties.properties, `${itemLabel}.weaponProperties.properties`);
			if (
				item.weaponProperties.properties.some(
					(property) => property.trim().length === 0,
				)
			) {
				fail(`${itemLabel}.weaponProperties.properties 不可包含空字串`);
			}
			if (
				item.weaponProperties.mastery !== undefined &&
				!weaponMasteries.has(item.weaponProperties.mastery)
			) {
				fail(`${itemLabel}.weaponProperties.mastery 不受支援`);
			}
		}
		if (item.category === 'Armor') {
			expectObject(item.armorProperties, `${itemLabel}.armorProperties`, ['ac']);
			expectString(item.armorProperties.ac, `${itemLabel}.armorProperties.ac`);
		}
		if (typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight < 0) {
			fail(`${itemLabel}.weight 必須是有限且不小於 0 的數字`);
		}
		if (
			typeof item.valueGp !== 'number' ||
			!Number.isFinite(item.valueGp) ||
			item.valueGp < 0
		) {
			fail(`${itemLabel}.valueGp 必須是有限且不小於 0 的數字`);
		}
		if (itemsById.has(item.itemId)) {
			fail(`${catalog.catalogId} 出現重複 itemId：${item.itemId}`);
		}
		itemsById.set(item.itemId, item);
	}

	const lookupIds = new Set();
	const sourceKeys = new Set();
	for (const [lookupIndex, entry] of lookupDocument.items.entries()) {
		const lookupLabel = `${catalog.catalogId} lookup.items[${lookupIndex}]`;
		expectObject(entry, lookupLabel, [
			'sourceKey',
			'itemId',
			'name',
			'aliases',
			'searchTerms',
		]);
		for (const key of ['sourceKey', 'itemId', 'name']) {
			expectString(entry[key], `${lookupLabel}.${key}`);
		}
		expectStringArray(entry.aliases, `${lookupLabel}.aliases`);
		expectStringArray(entry.searchTerms, `${lookupLabel}.searchTerms`);
		if (sourceKeys.has(entry.sourceKey)) {
			fail(`重複 sourceKey：${entry.sourceKey}`);
		}
		if (lookupIds.has(entry.itemId)) {
			fail(`${catalog.catalogId} lookup 出現重複 itemId：${entry.itemId}`);
		}
		if (entry.sourceKey !== `${catalog.catalogId}:${entry.itemId}`) {
			fail(`${lookupLabel}.sourceKey 與 catalogId/itemId 不符`);
		}

		const item = itemsById.get(entry.itemId);
		if (!item) {
			fail(`lookup 指向不存在的 itemId：${entry.itemId}`);
		}
		if (entry.name !== item.name) {
			fail(`${entry.itemId} 的 lookup 名稱與物品名稱不符`);
		}
		sourceKeys.add(entry.sourceKey);
		lookupIds.add(entry.itemId);
	}

	if (lookupIds.size !== itemsById.size) {
		const missing = [...itemsById.keys()].filter((itemId) => !lookupIds.has(itemId));
		fail(`lookup 缺少物品：${missing.join(', ')}`);
	}
	console.log(
		`✓ ${catalog.catalogId}: ${itemsById.size} 筆物品、${lookupIds.size} 筆 lookup 對照通過`,
	);
}

console.log(`Blacksmith 來源資料驗證完成：${catalogIds.size} 本目錄`);
