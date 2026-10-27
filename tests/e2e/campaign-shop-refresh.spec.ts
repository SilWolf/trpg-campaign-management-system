import { expect, test } from '@playwright/test';

test('商店刷新解析沿用官方目錄搜尋並以亂數抽樣、去重', async ({ page }) => {
	await page.goto('/');
	const result = await page.evaluate(async () => {
		const refresh = await import('/src/lib/campaignShopRefresh.ts');
		const catalog = await import('/src/lib/blacksmithCatalog.ts');
		const makeItem = (
			itemId: string,
			name: string,
			catalogId = 'core-rules',
			catalogTitle = '核心規則',
		) => ({
			catalogId,
			catalogTitle,
			itemId,
			sourceKey: `${catalogId}:${itemId}`,
			name,
			subTypes: ['軍用武器'],
			rarity: 'Rare' as const,
			icon: './images/sword.svg',
			weight: 3,
			valueGp: 15,
			affixes: [],
			effects: '一把龍焰武器',
			flavor: null,
			dmNotes: '',
			maxCharges: null,
			isEquippable: true,
			isConsumable: false,
			isRequireAttunement: false,
			source: '核心規則',
			aliases: ['龍焰'],
			searchTerms: ['dragon flame'],
			category: 'Weapon' as const,
			weaponProperties: {
				damage: '1d8',
				mastery: 'Sap' as const,
				properties: ['Versatile'],
			},
		});
		const items = [
			makeItem('longsword', '長劍'),
			makeItem('greatsword', '巨劍'),
			makeItem('dagger', '匕首'),
		];
		const filterMatches = catalog.filterBlacksmithCatalogItems(items, {
			search: '龍焰',
			category: 'Weapon',
			rarity: 'Rare',
		});
		const policy = {
			flags: { keepItemsOnRefresh: false },
			rules: [
				{
					possibleItemsOrFilters: [
						{ source: 'core-rules', param: { search: '龍焰' } },
						items[0],
					],
					pickCount: { min: 1, max: 3, p: 0.5, step: 1 },
					stockAvailable: { min: 2, max: 2 },
				},
				{
					possibleItemsOrFilters: [items[0], items[1]],
					pickCount: null,
					stockAvailable: { min: 1, max: 1 },
				},
			],
		};
		const converters = await import('/src/lib/supabase.ts');
		const encodedShop = converters.toDbCampaignShop({
			campaignId: 'campaign-text-id',
			name: '刷新測試商店',
			backgroundImageUrl: null,
			isActive: true,
			refreshPolicy: {
				flags: { keepItemsOnRefresh: false },
				rules: [
					{
						possibleItemsOrFilters: [items[0]],
						pickCount: null,
						stockAvailable: { min: 1, max: 1 },
					},
				],
			},
		});
		const decodedShop = converters.fromDbCampaignShop({
			id: 'shop-text-id',
			...encodedShop,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
		});
		const restoredCandidate =
			decodedShop.refreshPolicy.rules[0].possibleItemsOrFilters[0];
		const randomValues = [0.9, 0.1, 0.5];
		let randomIndex = 0;
		const selections = await refresh.resolveCampaignShopRefreshCandidates(
			policy,
			new Set(['core-rules']),
			async (catalogId: string) => {
				if (catalogId !== 'core-rules') throw new Error('錯誤目錄');
				return items;
			},
			() => randomValues[randomIndex++] ?? 0,
		);
		let failedSourceError = '';
		try {
			await refresh.resolveCampaignShopRefreshCandidates(
				{
					flags: { keepItemsOnRefresh: false },
					rules: [
						{
							possibleItemsOrFilters: [
								{ source: 'core-rules', param: {} },
							],
							pickCount: null,
							stockAvailable: { min: 0, max: 1 },
						},
					],
				},
				new Set(['core-rules']),
				async () => {
					throw new Error('目錄載入失敗');
				},
				() => 0,
			);
		} catch (error) {
			failedSourceError =
				error instanceof Error ? error.message : String(error);
		}
		const emptySelections = await refresh.resolveCampaignShopRefreshCandidates(
			{
				flags: { keepItemsOnRefresh: false },
				rules: [
					{
						possibleItemsOrFilters: [
							{ source: 'core-rules', param: { search: '不存在的物品' } },
						],
						pickCount: null,
						stockAvailable: { min: 0, max: 1 },
					},
				],
			},
			new Set(['core-rules']),
			async () => items,
			() => 0,
		);
		const boundedSelections =
			await refresh.resolveCampaignShopRefreshCandidates(
				{
					flags: { keepItemsOnRefresh: false },
					rules: [
						{
							possibleItemsOrFilters: [
								{ source: 'core-rules', param: {} },
							],
							pickCount: { min: 5, max: null, p: 1, step: 2 },
							stockAvailable: { min: 0, max: 2, p: 1, step: 2 },
						},
					],
				},
				new Set(['core-rules']),
				async () => items.slice(0, 2),
				() => {
					throw new Error('p = 1 不應額外抽取亂數');
				},
			);
		const stockRandomValues = [0.9, 0.1, 0.1];
		let stockRandomIndex = 0;
		const independentStockSelections =
			await refresh.resolveCampaignShopRefreshCandidates(
				{
					flags: { keepItemsOnRefresh: false },
					rules: [
						{
							possibleItemsOrFilters: [
								{ source: 'core-rules', param: {} },
							],
							pickCount: null,
							stockAvailable: { min: 0, max: 4, p: 0.5, step: 2 },
						},
					],
				},
				new Set(['core-rules']),
				async () => items.slice(0, 2),
				() => stockRandomValues[stockRandomIndex++] ?? 0,
			);
		const additionalCatalogItem = makeItem(
			'longsword',
			'異界長劍',
			'additional-rules',
			'附加規則',
		);
		const multiCatalogPolicy = {
			flags: { keepItemsOnRefresh: false },
			rules: [
				{
					possibleItemsOrFilters: [
						{ source: 'core-rules', param: { search: '長劍' } },
						{ source: 'additional-rules', param: { search: '異界長劍' } },
					],
					pickCount: null,
					stockAvailable: { min: 1, max: 1 },
				},
			],
		};
		const multiCatalogSelections =
			await refresh.resolveCampaignShopRefreshCandidates(
				multiCatalogPolicy,
				new Set(['core-rules', 'additional-rules']),
				async (catalogId: string) =>
					catalogId === 'core-rules' ? [items[0]] : [additionalCatalogItem],
				() => 0,
			);
		const multiCatalogPreview = refresh.buildCampaignShopRefreshPreview(
			multiCatalogPolicy,
			multiCatalogSelections,
			'2026-01-02T00:00:00Z',
			[],
			new Set(['core-rules', 'additional-rules']),
		);
		return {
			restoredCatalogItem:
				'itemId' in restoredCandidate
					? {
							category: restoredCandidate.category,
							subTypes: restoredCandidate.subTypes,
							weaponProperties: restoredCandidate.weaponProperties,
							isRequireAttunement: restoredCandidate.isRequireAttunement,
						}
					: null,
			filterIds: filterMatches.map((item) => item.itemId),
			selections: selections.map(({ item, ruleIndex, stockAvailable }) => ({
				itemId: item.itemId,
				ruleIndex,
				stockAvailable,
			})),
			failedSourceError,
			emptySelectionCount: emptySelections.length,
			boundedSelections: boundedSelections.map(
				({ item, stockAvailable }) => ({
					itemId: item.itemId,
					stockAvailable,
				}),
			),
			independentStocks: independentStockSelections.map(
				({ item, stockAvailable }) => ({
					itemId: item.itemId,
					stockAvailable,
				}),
			),
			multiCatalogSourceIds: multiCatalogPreview.changes.map(
				(change) => change.sourceId,
			),
		};
	});

	expect(result.filterIds).toEqual(['longsword', 'greatsword', 'dagger']);
	expect(result.restoredCatalogItem).toEqual({
		category: 'Weapon',
		subTypes: ['軍用武器'],
		weaponProperties: {
			damage: '1d8',
			mastery: 'Sap',
			properties: ['Versatile'],
		},
		isRequireAttunement: false,
	});
	expect(result.selections).toEqual([
		{ itemId: 'greatsword', ruleIndex: 0, stockAvailable: 2 },
		{ itemId: 'longsword', ruleIndex: 0, stockAvailable: 2 },
	]);
	expect(result.failedSourceError).toBe('目錄載入失敗');
	expect(result.emptySelectionCount).toBe(0);
	expect(result.boundedSelections).toEqual([
		{ itemId: 'longsword', stockAvailable: 0 },
		{ itemId: 'greatsword', stockAvailable: 0 },
	]);
	expect(result.independentStocks).toEqual([
		{ itemId: 'longsword', stockAvailable: 2 },
		{ itemId: 'greatsword', stockAvailable: 0 },
	]);
	expect(result.multiCatalogSourceIds).toEqual([
		'core-rules:longsword',
		'additional-rules:longsword',
	]);
});

test('刷新預覽保留舊商品版本，並將來源商品列為新增而非補貨', async ({
	page,
}) => {
	await page.goto('/');
	const previews = await page.evaluate(async () => {
		const refresh = await import('/src/lib/campaignShopRefresh.ts');
		const item = {
			catalogId: 'core-rules',
			catalogTitle: '核心規則',
			itemId: 'longsword',
			sourceKey: 'core-rules:longsword',
			name: '長劍',
			subTypes: ['軍用武器'],
			rarity: 'Common' as const,
			icon: './images/sword.svg',
			weight: 3,
			valueGp: 15,
			affixes: [],
			effects: '武器描述',
			flavor: null,
			dmNotes: '',
			maxCharges: null,
			isEquippable: true,
			isConsumable: false,
			isRequireAttunement: false,
			source: '核心規則',
			aliases: [],
			searchTerms: [],
			category: 'Weapon' as const,
			weaponProperties: {
				damage: '1d8',
				mastery: 'Sap' as const,
				properties: ['Versatile'],
			},
		};
		const snapshot = refresh.blacksmithItemToCampaignShopSnapshot(item);
		const existing = {
			id: 'existing-long-sword',
			campaignId: 'campaign-1',
			shopId: 'shop-1',
			itemSnapshot: snapshot,
			isIdentified: true,
			unitPriceGp: 20,
			stockAvailable: 3,
			stockReserved: 2,
			requiresApproval: true,
			isActive: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-02T00:00:00Z',
		};
		const manual = {
			...existing,
			id: 'existing-manual',
			itemSnapshot: { ...snapshot, name: '手工商品' },
		};
		const selections = [
			{ item, ruleIndex: 0, stockAvailable: 5 },
		];
		const keepPolicy = {
			flags: { keepItemsOnRefresh: true },
			rules: [
				{
					possibleItemsOrFilters: [item],
					pickCount: null,
					stockAvailable: { min: 1, max: 10 },
				},
			],
		};
		const keepPreview = refresh.buildCampaignShopRefreshPreview(
			keepPolicy,
			selections,
			'2026-01-03T00:00:00Z',
			[existing, manual],
			new Set(['core-rules']),
		);
		const clearPreview = refresh.buildCampaignShopRefreshPreview(
			{ ...keepPolicy, flags: { keepItemsOnRefresh: false } },
			selections,
			'2026-01-03T00:00:00Z',
			[existing],
			new Set(['core-rules']),
		);
		return {
			keep: {
				entries: keepPreview.entries.map(({ action, name, stockAvailable }) => ({
					action,
					name,
					stockAvailable,
				})),
				expectedItems: keepPreview.expectedItems,
				change: keepPreview.changes[0],
			},
			clear: clearPreview.entries.map(({ action, name, stockAvailable }) => ({
				action,
				name,
				stockAvailable,
			})),
		};
	});

	expect(previews.keep.entries).toEqual([
		{ action: 'keep', name: '長劍', stockAvailable: 3 },
		{ action: 'keep', name: '手工商品', stockAvailable: 3 },
		{ action: 'create', name: '長劍', stockAvailable: 5 },
	]);
	expect(previews.keep.expectedItems).toEqual([
		{ id: 'existing-long-sword', updatedAt: '2026-01-02T00:00:00Z' },
		{ id: 'existing-manual', updatedAt: '2026-01-02T00:00:00Z' },
	]);
	expect(previews.keep.change).toMatchObject({
		sourceId: 'core-rules:longsword',
		unitPriceGp: 15,
		stockAvailable: 5,
	});
	expect(previews.clear).toEqual([
		{ action: 'delete', name: '長劍', stockAvailable: 3 },
		{ action: 'create', name: '長劍', stockAvailable: 5 },
	]);
});
