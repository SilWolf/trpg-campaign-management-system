import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

test('鍛造工坊可進入官方規則書並瀏覽、搜尋與篩選物品', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith');

	await expect(
		page.getByRole('heading', { name: '鍛造工坊' }),
	).toBeVisible();
	await expect(page.getByTestId('system-link-campaign')).toBeVisible();
	await page.getByTestId('system-link-campaign').click();
	await expect(page).toHaveURL('/');
	await page.getByTestId('lobby-blacksmith-link').click();
	await expect(page).toHaveURL(/\/blacksmith$/);
	await page.getByTestId('blacksmith-officials-link').click();
	await expect(page).toHaveURL(/\/blacksmith\/officials$/);
	await expect(page.getByTestId('blacksmith-catalog-list')).toContainText(
		'D&D 2024 SRD 5.2',
	);
	await page.getByTestId('blacksmith-catalog-link').click();
	await expect(page).toHaveURL(/\/blacksmith\/officials\/dnd-2024-srd-5\.2$/);
	await expect(page.getByRole('navigation', { name: '麵包屑' })).toContainText(
		'官方規則書',
	);
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('537');

	await page.getByTestId('blacksmith-search').fill('午夜之淚');
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('1');
	await expect(page.getByTestId('blacksmith-item-detail')).toContainText(
		'午夜之淚',
	);
	await expect(page.getByTestId('blacksmith-item-detail')).toContainText(
		"DMG'24",
	);
	await expect(page.getByTestId('blacksmith-item-rarity')).toBeVisible();

	await page.getByTestId('blacksmith-search').fill('不存在的測試物品');
	await expect(page.getByTestId('blacksmith-no-results')).toBeVisible();

	await page.goto('/');
	await page.getByTestId('lobby-blacksmith-link').click();
	await expect(page).toHaveURL(/\/blacksmith$/);
	await expect(page.getByTestId('blacksmith-officials-link')).toBeVisible();
});

test('物品目錄支援分頁、列表檢視與稀有度篩選', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith/officials/dnd-2024-srd-5.2');

	const itemCards = page.getByTestId('blacksmith-item-card');
	await expect(itemCards).toHaveCount(18);
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 1 /',
	);
	await page.getByRole('button', { name: '下一頁' }).click();
	await expect(itemCards).toHaveCount(18);
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 2 /',
	);
	await page.getByTestId('blacksmith-page-input').fill('5');
	await page.getByRole('button', { name: '跳轉', exact: true }).click();
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 5 /',
	);

	await page.getByRole('button', { name: '列表檢視' }).click();
	await expect(itemCards).toHaveCount(10);
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 1 /',
	);

	await page.getByLabel('依稀有度篩選').selectOption('Legendary');
	await expect(page.getByTestId('blacksmith-result-count')).not.toContainText(
		'537',
	);
	await expect(itemCards.first()).toContainText('傳奇');
});

test('鍛造樣板可建立、分享設定、更新及刪除', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith');
	await page.getByTestId('blacksmith-workshop-link').click();

	await expect(page.getByRole('heading', { name: '我的鍛造與分享' })).toBeVisible();
	await page.getByRole('button', { name: '鍛造新物品' }).click();
	await page.getByLabel('物品名稱 *').fill('測試鍛造法杖');
	await page.getByRole('button', { name: '保存樣板' }).click();

	const itemCard = page.getByRole('listitem').filter({ hasText: '測試鍛造法杖' });
	await expect(itemCard).toContainText('私人');
	await itemCard.getByRole('button', { name: '編輯／分享設定' }).click();
	await page
		.getByLabel('與其他已登入冒險者分享此樣板')
		.check();
	await page.getByRole('button', { name: '保存樣板' }).click();
	await expect(itemCard).toContainText('已分享');

	await itemCard.getByRole('button', { name: '刪除' }).click();
	await itemCard.getByRole('button', { name: '再次按下確認刪除' }).click();
	await expect(page.getByText('尚未鍛造任何物品')).toBeVisible();
});

test('冒險者分享清單只顯示可讀取的已分享樣板', async ({ page }) => {
	const mocks = await mockSupabase(page, {
		blacksmithSharedItems: [
			{
				id: 'community-wand',
				owner_id: 'another-user-id',
				name: '社群秘法法杖',
				category: 'Weapon',
				sub_type: '法杖',
				rarity: 'Rare',
				icon: 'storage:blacksmith-assets/123e4567-e89b-42d3-a456-426614174000/items/123e4567-e89b-42d3-a456-426614174001/128.webp',
				damage: '1d6',
				mastery: 'None',
				ac: null,
				weight: 2,
				value_gp: 100,
				requires_attunement: true,
				is_homebrew: true,
				max_charges: 3,
				effects: '散發微光。',
				flavor: '',
				dm_notes: '',
				is_equippable: true,
				is_consumable: false,
				is_important: false,
				affixes: [],
				is_shared: true,
				created_at: '2025-01-01T00:00:00.000Z',
				updated_at: '2025-01-01T00:00:00.000Z',
			},
		],
	});
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith/workshop');
	await page.getByRole('button', { name: /冒險者分享/ }).click();
	await expect(page.getByRole('listitem')).toContainText('社群秘法法杖');
	await expect(page.getByRole('listitem')).toContainText('散發微光。');
	await expect(
		page.getByRole('button', { name: '編輯／分享設定' }),
	).toHaveCount(0);
	await page.getByRole('button', { name: '匯入戰役' }).click();
	await page.getByLabel('目標戰役').selectOption('dm-campaign');
	await page.getByRole('button', { name: '確認匯入' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '社群秘法法杖' }),
	).toBeVisible();
	const importedItem = (
		mocks.blacksmithImportRequests[0] as {
			p_item: { item_base: { icon: string } };
		}
	).p_item;
	expect(importedItem.item_base.icon).toBe(
		'storage:blacksmith-assets/123e4567-e89b-42d3-a456-426614174000/items/123e4567-e89b-42d3-a456-426614174001/128.webp',
	);
});

test('官方目錄物品可選擇 DM 戰役與角色後匯入', async ({ page }) => {
	const mocks = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith/officials/dnd-2024-srd-5.2');
	await page.getByTestId('blacksmith-search').fill('午夜之淚');

	await page.getByRole('button', { name: '匯入戰役' }).click();
	await expect(page.getByRole('heading', { name: '匯入「午夜之淚」' })).toBeVisible();
	await page.getByLabel('目標戰役').selectOption('dm-campaign');
	await page.getByLabel('接收目標').selectOption('dm-character');
	await page.getByLabel('匯入數量').fill('3');
	await page.getByRole('button', { name: '確認匯入' }).click();

	await expect(page.getByRole('status')).toContainText(
		'已將 3 個「午夜之淚」匯入「DM 測試戰役」的「接收角色」。',
	);
	expect(mocks.blacksmithImportRequests).toEqual([
		{
			p_campaign_id: 'dm-campaign',
			p_owner_id: 'dm-character',
			p_item: expect.objectContaining({
				is_homebrew: false,
				item_base: expect.objectContaining({
					name: '午夜之淚',
					category: 'Poison',
					subTypes: ['冒險用品', '毒藥 (服用)'],
					isRequireAttunement: false,
				}),
			}),
			p_quantity: 3,
		},
	]);
	expect(
		(mocks.blacksmithImportRequests[0] as { p_item: Record<string, unknown> })
			.p_item,
	).not.toHaveProperty('id');
	expect(
		(mocks.blacksmithImportRequests[0] as { p_item: Record<string, unknown> })
			.p_item,
	).not.toHaveProperty('sub_types');
});

test('匯入 RPC 失敗時保留視窗並顯示實際錯誤', async ({ page }) => {
	await mockSupabase(page, { blacksmithImportError: '只有該戰役的 DM 可以匯入物品。' });
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith/officials/dnd-2024-srd-5.2');
	await page.getByTestId('blacksmith-search').fill('午夜之淚');
	await page.getByRole('button', { name: '匯入戰役' }).click();
	await page.getByRole('button', { name: '確認匯入' }).click();

	await expect(page.getByRole('alert')).toContainText(
		'只有該戰役的 DM 可以匯入物品。',
	);
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('目錄載入失敗會明確顯示錯誤並可重試', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.route('**/data/blacksmith/catalog-index.json', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: '{}',
		}),
	);
	await page.goto('/blacksmith');
	await page.getByTestId('blacksmith-officials-link').click();

	await expect(page.getByTestId('blacksmith-error')).toContainText('HTTP 503');
	await page.getByRole('button', { name: '重新載入' }).click();
	await expect(page.getByTestId('blacksmith-error')).toContainText('HTTP 503');
});
