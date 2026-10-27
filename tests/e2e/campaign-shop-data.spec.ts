import { expect, test } from '@playwright/test';

test('商店資料轉換器保留 snake_case 快照與各訂單狀態', async ({ page }) => {
	await page.goto('/');
	const data = await page.evaluate(async () => {
		const converters = await import('/src/lib/supabase.ts');
		const snapshot = {
			name: '長劍',
			category: 'Weapon' as const,
			subTypes: ['軍用武器'],
			rarity: 'Common' as const,
			icon: 'Sword',
			weaponProperties: {
				damage: '1d8',
				mastery: 'Sap' as const,
				properties: ['Versatile'],
			},
			weight: 3,
			valueGp: 15,
			isRequireAttunement: false,
			isHomebrew: false,
			maxCharges: 0,
			effects: '描述',
			flavor: '',
			dmNotes: '',
			isEquippable: true,
			isConsumable: false,
			isImportant: false,
			affixes: [],
		};
		const encoded = converters.toDbCampaignShopItem({
			campaignId: 'campaign-text-id',
			shopId: 'shop-text-id',
			itemSnapshot: snapshot,
			sourceType: 'catalog',
			sourceId: 'catalog-item-id',
			unitPriceGp: 15,
			stockAvailable: 4,
			requiresApproval: false,
			isActive: true,
		});
		const inventoryItem = {
			...snapshot,
			id: 'item-text-id',
			ownerId: 'owner-text-id',
			slot: 2,
			quantity: 1,
			equipped: false,
			attuned: false,
			isHomebrew: false,
			isIdentified: true,
			charges: 0,
			maxCharges: 0,
			playerNotes: '',
			isPrivate: false,
			isImportant: false,
		};
		const encodedInventory = converters.toDbItem(inventoryItem);
		const decodedInventory = converters.fromDbItem(encodedInventory);
		const blacksmithTemplate = {
			...snapshot,
			id: 'template-text-id',
			ownerId: 'owner-text-id',
			isHomebrew: true,
			isImportant: false,
			isShared: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-02T00:00:00Z',
			maxCharges: 0,
		};
		const encodedBlacksmith = converters.toDbBlacksmithItem(blacksmithTemplate);
		const decodedBlacksmith =
			converters.fromDbBlacksmithItem(encodedBlacksmith);
		const refreshPolicy = {
			flags: { keepItemsOnRefresh: true },
			rules: [
				{
					possibleItemsOrFilters: [
						{ source: 'official-catalog', param: { rarity: 'Rare' as const } },
					],
					pickCount: 2,
					stockAvailable: { min: 1, max: 4 },
				},
			],
		};
		const encodedShop = converters.toDbCampaignShop({
			campaignId: 'campaign-text-id',
			name: '武器店',
			backgroundImageUrl: null,
			isActive: true,
			refreshPolicy,
		});
		const decodedShop = converters.fromDbCampaignShop({
			id: 'shop-text-id',
			...encodedShop,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
		});
		const legacyShop = converters.fromDbCampaignShop({
			id: 'legacy-shop-id',
			campaign_id: 'campaign-text-id',
			name: '舊商店',
			background_image_url: null,
			is_active: true,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
		});
		const refresh = await import('/src/lib/campaignShopRefresh.ts');
		let invalidCatalogError = '';
		try {
			refresh.normalizeCampaignShopRefreshPolicy(
				refreshPolicy,
				new Set(['another-catalog']),
			);
		} catch (error) {
			invalidCatalogError =
				error instanceof Error ? error.message : String(error);
		}
		let invalidStockError = '';
		try {
			refresh.normalizeCampaignShopRefreshPolicy({
				flags: { keepItemsOnRefresh: false },
				rules: [
					{
						possibleItemsOrFilters: [],
						pickCount: null,
						stockAvailable: { min: 0, max: 2_147_483_648 },
					},
				],
			});
		} catch (error) {
			invalidStockError =
				error instanceof Error ? error.message : String(error);
		}
		const decodedItem = converters.fromDbCampaignShopItem({
			id: 'shop-item-id',
			...encoded,
			stock_reserved: 2,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
		});
		const legacyItem = converters.fromDbCampaignShopItem({
			id: 'legacy-item-id',
			campaign_id: 'campaign-text-id',
			shop_id: 'shop-text-id',
			item_snapshot: { name: '舊物品' },
			source_type: 'manual',
			source_id: null,
			unit_price_gp: '0.01',
			stock_available: 0,
			stock_reserved: 0,
			requires_approval: false,
			is_active: true,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-01T00:00:00Z',
		});
		const statuses = [
			'completed',
			'pending',
			'rejected',
			'cancelled',
		] as const;
		const decodedStatuses = statuses.map((status) =>
			converters.fromDbCampaignShopOrder({
				id: `order-${status}`,
				checkout_id: 'checkout-group-id',
				campaign_id: 'campaign-text-id',
				shop_id: 'shop-text-id',
				shop_item_id: 'shop-item-id',
				character_id: 'character-text-id',
				item_snapshot: encoded.item_snapshot,
				shop_name_snapshot: '武器店',
				unit_price_gp: '15.00',
				quantity: 2,
				total_price_gp: '30.00',
				status,
				requires_approval: status !== 'completed',
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-02T00:00:00Z',
				reviewed_at: null,
			}).status,
		);
		return {
			encoded,
			encodedInventory,
			decodedInventory,
			encodedBlacksmith,
			decodedBlacksmith,
			encodedShop,
			decodedShop,
			legacyShop,
			invalidCatalogError,
			invalidStockError,
			decodedItem,
			legacyItem,
			decodedStatuses,
			decodedCheckoutId: converters.fromDbCampaignShopOrder({
				id: 'order-in-checkout',
				checkout_id: 'checkout-group-id',
				campaign_id: 'campaign-text-id',
				shop_id: 'shop-text-id',
				shop_item_id: 'shop-item-id',
				character_id: 'character-text-id',
				item_snapshot: encoded.item_snapshot,
				shop_name_snapshot: '武器店',
				unit_price_gp: '15.00',
				quantity: 1,
				total_price_gp: '15.00',
				status: 'completed',
				requires_approval: false,
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-02T00:00:00Z',
				reviewed_at: null,
			}).checkoutId,
		};
	});

	expect(data.decodedShop).toMatchObject({
		id: 'shop-text-id',
		campaignId: 'campaign-text-id',
		name: '武器店',
		backgroundImageUrl: null,
		isActive: true,
		refreshPolicy: {
			flags: { keepItemsOnRefresh: true },
			rules: [
				{
					possibleItemsOrFilters: [
						{ source: 'official-catalog', param: { rarity: 'Rare' } },
					],
					pickCount: 2,
					stockAvailable: { min: 1, max: 4, p: 1, step: 1 },
				},
			],
		},
	});
	expect(data.encodedShop.refresh_policy).toEqual(data.decodedShop.refreshPolicy);
	expect(data.legacyShop.refreshPolicy).toEqual({
		flags: { keepItemsOnRefresh: false },
		rules: [],
	});
	expect(data.invalidCatalogError).toContain('不存在的官方目錄');
	expect(data.invalidStockError).toContain('資料庫 integer 上限');
	expect(data.encoded.item_snapshot).toMatchObject({
		sub_type: '軍用武器',
		value_gp: 15,
		is_equippable: true,
		item_base: {
			weaponProperties: {
				damage: '1d8',
				mastery: 'Sap',
				properties: ['Versatile'],
			},
		},
	});
	expect(data.decodedItem.itemSnapshot).toMatchObject({
		subTypes: ['軍用武器'],
		valueGp: 15,
		isEquippable: true,
		weaponProperties: {
			damage: '1d8',
			mastery: 'Sap',
			properties: ['Versatile'],
		},
	});
	expect(data.encodedInventory.item_base).toMatchObject({
		category: 'Weapon',
		subTypes: ['軍用武器'],
		weaponProperties: {
			damage: '1d8',
			mastery: 'Sap',
			properties: ['Versatile'],
		},
	});
	expect(data.decodedInventory).toMatchObject({
		id: 'item-text-id',
		category: 'Weapon',
		subTypes: ['軍用武器'],
		weaponProperties: {
			damage: '1d8',
			mastery: 'Sap',
			properties: ['Versatile'],
		},
	});
	expect(data.decodedBlacksmith).toMatchObject({
		id: 'template-text-id',
		category: 'Weapon',
		subTypes: ['軍用武器'],
		weaponProperties: {
			damage: '1d8',
			mastery: 'Sap',
			properties: ['Versatile'],
		},
	});
	expect(data.legacyItem).toMatchObject({
		unitPriceGp: 0.01,
		stockAvailable: 0,
		stockReserved: 0,
		itemSnapshot: {
			name: '舊物品',
			category: 'Misc',
			subTypes: [],
			rarity: 'Common',
			icon: 'Package',
			weight: 0,
			valueGp: 0,
			affixes: [],
		},
	});
	expect(data.decodedStatuses).toEqual([
		'completed',
		'pending',
		'rejected',
		'cancelled',
	]);
	expect(data.decodedCheckoutId).toBe('checkout-group-id');
});

test('商店批次匯入驗證邊界並在有錯誤時拒絕部分結果', async ({ page }) => {
	await page.goto('/');
	const results = await page.evaluate(async () => {
		const { parseCampaignShopImport } = await import(
			'/src/lib/campaignShopImport.ts'
		);
		return {
			valid: parseCampaignShopImport('\n長劍 | 0.01 | 0\n治療藥水|2.5|12\n'),
			invalid: parseCampaignShopImport(
				'有效物品|1|1\n錯誤價格|1.999|2\n空名稱||1',
			),
			invalidRange: parseCampaignShopImport(
				'過高單價|10000000000|1\n庫存溢位|1|2147483648',
			),
		};
	});

	expect(results.valid).toEqual({
		rows: [
			{ line: 2, name: '長劍', unitPriceGp: 0.01, stockAvailable: 0 },
			{ line: 3, name: '治療藥水', unitPriceGp: 2.5, stockAvailable: 12 },
		],
		errors: [],
	});
	expect(results.invalid.rows).toEqual([]);
	expect(results.invalid.errors.map(({ line }) => line)).toEqual([2, 3]);
	expect(results.invalidRange.rows).toEqual([]);
	expect(results.invalidRange.errors.map(({ line }) => line)).toEqual([1, 2]);
});
