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
if (index.schemaVersion !== 1 || !Array.isArray(index.catalogs)) {
	fail('catalog-index.json 的 schemaVersion 必須為 1，且 catalogs 必須是陣列');
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
			document.schemaVersion !== 1 ||
			document.catalogId !== catalog.catalogId ||
			!Array.isArray(document.items)
		) {
			fail(`${catalog.catalogId} ${name} 的版本、catalogId 或 items 結構錯誤`);
		}
	}

	const itemKeys = [
		'itemId',
		'name',
		'rarity',
		'requiresAttunement',
		'damage',
		'weight',
		'description',
		'dmNotes',
		'category',
		'subType',
		'valueGp',
		'icon',
	];
	const itemsById = new Map();
	for (const [itemIndex, item] of itemsDocument.items.entries()) {
		const itemLabel = `${catalog.catalogId} items[${itemIndex}]`;
		expectObject(item, itemLabel, itemKeys);
		for (const key of [
			'itemId',
			'name',
			'rarity',
			'description',
			'dmNotes',
			'category',
			'subType',
			'icon',
		]) {
			expectString(item[key], `${itemLabel}.${key}`);
		}
		if (typeof item.requiresAttunement !== 'boolean') {
			fail(`${itemLabel}.requiresAttunement 必須是布林值`);
		}
		if (item.damage !== null && typeof item.damage !== 'string') {
			fail(`${itemLabel}.damage 必須是字串或 null`);
		}
		if (typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight < 0) {
			fail(`${itemLabel}.weight 必須是有限且不小於 0 的數字`);
		}
		if (!Number.isInteger(item.valueGp) || item.valueGp < 0) {
			fail(`${itemLabel}.valueGp 必須是不小於 0 的整數`);
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
