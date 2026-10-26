import { expect, test } from '@playwright/test';

test('商店資料轉換器保留 snake_case 快照與各訂單狀態', async ({ page }) => {
	await page.goto('/');
	const data = await page.evaluate(async () => {
		const converters = await import('/src/lib/supabase.ts');
		const snapshot = {
			name: '長劍',
			category: 'Weapon' as const,
			subType: '軍用武器',
			rarity: 'Common' as const,
			icon: 'Sword',
			damage: '1d8',
			mastery: 'Sap' as const,
			ac: null,
			weight: 3,
			valueGp: 15,
			requiresAttunement: false,
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
		const encodedShop = converters.toDbCampaignShop({
			campaignId: 'campaign-text-id',
			name: '武器店',
			backgroundImageUrl: null,
			isActive: true,
		});
		const decodedShop = converters.fromDbCampaignShop({
			id: 'shop-text-id',
			...encodedShop,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
		});
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
			decodedShop,
			decodedItem,
			legacyItem,
			decodedStatuses,
		};
	});

	expect(data.decodedShop).toMatchObject({
		id: 'shop-text-id',
		campaignId: 'campaign-text-id',
		name: '武器店',
		backgroundImageUrl: null,
		isActive: true,
	});
	expect(data.encoded.item_snapshot).toMatchObject({
		sub_type: '軍用武器',
		value_gp: 15,
		is_equippable: true,
	});
	expect(data.decodedItem.itemSnapshot).toMatchObject({
		subType: '軍用武器',
		valueGp: 15,
		isEquippable: true,
	});
	expect(data.legacyItem).toMatchObject({
		unitPriceGp: 0.01,
		stockAvailable: 0,
		stockReserved: 0,
		itemSnapshot: {
			name: '舊物品',
			category: 'Misc',
			subType: '',
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
