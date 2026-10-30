import { expect, test } from '@playwright/test';

test('物品定義轉換預設不可堆疊，複製會重建詞條 ID', async ({ page }) => {
	await page.goto('/');
	const result = await page.evaluate(async () => {
		const { INITIAL_ITEMS } = await import('/src/data.ts');
		const {
			copyItemToDefinitionForm,
			createDefaultItemDefinitionForm,
			itemDefinitionFormToItem,
			itemToDefinitionForm,
		} = await import('/src/lib/itemDefinitions.ts');
		const form = createDefaultItemDefinitionForm();
		form.name = '測試物品';
		const converted = itemDefinitionFormToItem(form);
		const source = {
			...INITIAL_ITEMS[0],
			affixes: [{ id: 'source-affix', name: '來源詞條', desc: '來源描述' }],
		};
		const roundTrip = itemDefinitionFormToItem(itemToDefinitionForm(source));
		const copied = copyItemToDefinitionForm(source);
		return {
			defaultStackable: createDefaultItemDefinitionForm().isStackable,
			convertedStackable: converted.isStackable,
			roundTripPreserved:
				roundTrip.name === source.name &&
				roundTrip.category === source.category &&
				roundTrip.subTypes.join('|') === source.subTypes.join('|') &&
				roundTrip.rarity === source.rarity &&
				roundTrip.weight === source.weight &&
				roundTrip.valueGp === source.valueGp &&
				roundTrip.isStackable === source.isStackable &&
				roundTrip.affixes[0]?.id === source.affixes[0].id,
			copiedStackable: copied.isStackable,
			copyHasSourceId:
				'itemId' in copied || 'blacksmithItemId' in copied,
			sourceAffixId: source.affixes[0].id,
			copiedAffixId: copied.affixes[0].id,
			copiedQuantity: copied.quantity,
			copiedPrivate: copied.isPrivate,
			copiedIdentified: copied.isIdentified,
		};
	});

	expect(result).toMatchObject({
		defaultStackable: false,
		convertedStackable: false,
		roundTripPreserved: true,
		copiedStackable: false,
		copyHasSourceId: false,
		sourceAffixId: 'source-affix',
		copiedQuantity: '1',
		copiedPrivate: false,
		copiedIdentified: false,
	});
	expect(result.copiedAffixId).not.toBe('source-affix');
});

test('搜尋 adapter 使用唯一來源 ID 並套用每組 20 筆上限', async ({ page }) => {
	await page.goto('/');
	const result = await page.evaluate(async () => {
		const { INITIAL_ITEMS } = await import('/src/data.ts');
		const {
			buildBlacksmithSearchGroups,
			createBlacksmithCopyForm,
			createBlacksmithImportDraft,
		} = await import('/src/lib/blacksmithSearch.ts');
		const { loadBlacksmithCatalogs } = await import('/src/lib/blacksmithCatalog.ts');
		const base = INITIAL_ITEMS[0];
		const makeTemplate = (id: string, ownerId: string) => ({
			...base,
			id,
			ownerId,
			isHomebrew: true,
			isImportant: false,
			isShared: ownerId !== 'current-user',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			name: '熾焰測試物品',
		});
		const mine = Array.from({ length: 5 }, (_, index) =>
			makeTemplate(`mine-${index}`, 'current-user'),
		);
		const shared = Array.from({ length: 21 }, (_, index) =>
			makeTemplate(`shared-${index}`, `author-${index}`),
		);
		const official = Array.from({ length: 21 }, (_, index) => ({
			...base,
			name: '熾焰測試物品',
			catalogId: 'fixture',
			catalogTitle: '測試規則書',
			itemId: `source-${index}`,
			sourceKey: `fixture:source-${index}`,
			source: 'SRD',
			aliases: [],
			searchTerms: [],
			affixes: [{ id: 'official-affix', name: '詞條', desc: '描述' }],
		}));
		const groups = buildBlacksmithSearchGroups(
			{ mine, official, shared },
			{ search: '熾焰', category: 'all', rarity: 'all' },
		);
		const officialResult = groups.official[0];
		if (!officialResult) throw new Error('官方搜尋測試資料未命中。');
		const draft = createBlacksmithImportDraft(officialResult);
		const copied = createBlacksmithCopyForm(officialResult);
		const importedAffix = draft.definition.affixes[0];
		const sourceAffix = officialResult.item.affixes[0];
		if (!importedAffix || !sourceAffix) {
			throw new Error('匯入定義未保留來源詞條。');
		}
		const legacyCatalogItems = await loadBlacksmithCatalogs('dnd-2024-srd-5.2');
		const ids = [
			...groups.mine,
			...groups.official,
			...groups.shared,
		].map((entry) => entry.itemId);
		return {
			mineCount: groups.mine.length,
			officialCount: groups.official.length,
			sharedCount: groups.shared.length,
			uniqueCount: new Set(ids).size,
			importItemId: draft.itemId,
			importQuantity: draft.quantity,
			importAffixId: importedAffix.id,
			importAffixDetached: importedAffix !== sourceAffix,
			copyAffixId: copied.affixes[0].id,
			workshopItemId: groups.mine[0].itemId,
			legacyCatalogCount: legacyCatalogItems.length,
			legacyStackableDefaults: legacyCatalogItems.every(
				(item) => item.isStackable === false,
			),
			emptySearchCount: buildBlacksmithSearchGroups(
				{ mine, official, shared },
				{ search: '  ', category: 'all', rarity: 'all' },
			).mine.length,
		};
	});

	expect(result).toMatchObject({
		mineCount: 5,
		officialCount: 20,
		sharedCount: 15,
		uniqueCount: 40,
		importItemId: 'rulebook:fixture:source-0',
		importQuantity: 1,
		importAffixId: 'official-affix',
		importAffixDetached: true,
		workshopItemId: 'workshop:mine-0',
		legacyCatalogCount: 537,
		legacyStackableDefaults: true,
		emptySearchCount: 0,
	});
	expect(result.copyAffixId).not.toBe(result.importAffixId);
});
