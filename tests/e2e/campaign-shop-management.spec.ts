import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const shopUrl = '/campaigns/settings-campaign/shops';

test('DM 可建立商店並從商品目錄開啟鍛造工坊匯入視窗', async ({ page }) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('campaign-shops-page')).toBeVisible();
	await page.getByRole('button', { name: '建立商店' }).click();
	await expect(page.getByRole('dialog', { name: '建立商店' })).toBeVisible();
	await page.getByTestId('shop-name').fill('灰港冒險者商會');
	await page
		.getByTestId('shop-flavor')
		.fill('壁爐的火光映照著各地冒險者帶回的珍寶。');
	await page.getByRole('button', { name: '儲存商店' }).click();
	await expect(page.getByRole('dialog', { name: '建立商店' })).toHaveCount(0);
	await expect(
		page.getByRole('heading', { name: '灰港冒險者商會' }).first(),
	).toBeVisible();

	await page.getByRole('link', { name: '灰港冒險者商會' }).first().click();
	await expect(
		page.getByText('壁爐的火光映照著各地冒險者帶回的珍寶。').first(),
	).toBeVisible();
	await page.getByRole('link', { name: '商店設定' }).click();
	await page.getByRole('button', { name: '編輯商店' }).click();
	await expect(page.getByRole('dialog', { name: '編輯商店' })).toBeVisible();
	await expect(page.getByTestId('shop-name')).toHaveValue('灰港冒險者商會');
	await expect(page.getByTestId('shop-flavor')).toHaveValue(
		'壁爐的火光映照著各地冒險者帶回的珍寶。',
	);
	await page.getByTestId('shop-name').fill('灰港冒險者商會（翻新）');
	await page.getByTestId('shop-flavor').fill('城門關閉後仍有燈火守候。');
	await page.getByRole('button', { name: '儲存商店' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '商店設定已更新' }),
	).toBeVisible();
	await expect(
		page.getByText('城門關閉後仍有燈火守候。').first(),
	).toBeVisible();
	await expect(
		page.getByRole('heading', {
			name: '灰港冒險者商會（翻新）',
			level: 1,
		}),
	).toBeVisible();
	await expect(page.getByRole('heading', { name: '購買商品' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: '公開購買紀錄' })).toHaveCount(
		0,
	);
	await expect(page.getByTestId('shop-source-dialog')).toHaveCount(0);
	await page.getByRole('button', { name: '從鍛造工坊匯入' }).click();
	await expect(page.getByTestId('shop-source-dialog')).toBeVisible();
	await expect(page.getByLabel('批次商品資料')).toHaveCount(0);
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/campaign_shops'),
		),
	).toBe(true);
});

for (const failure of [
	{
		name: '資料庫欄位權限不足',
		code: '42501',
		message: 'permission denied for table campaign_shops',
		expected: '儲存商店失敗：permission denied for table campaign_shops',
	},
	{
		name: '資料庫缺少風味欄位',
		code: 'PGRST204',
		message:
			"Could not find the 'flavor' column of 'campaign_shops' in the schema cache",
		expected: '資料庫缺少商店風味欄位或 schema 快取尚未更新',
	},
]) {
	test(`商店儲存失敗時顯示${failure.name}並保留輸入`, async ({ page }) => {
		await mockSupabase(page, {
			campaignSettingsRole: 'dm',
			campaignShopSeed: true,
		});
		await page.route('**/rest/v1/campaign_shops*', async (route) => {
			if (route.request().method() !== 'PATCH') {
				await route.fallback();
				return;
			}
			await route.fulfill({
				status: failure.code === '42501' ? 403 : 400,
				json: { code: failure.code, message: failure.message },
			});
		});
		await seedAuthenticatedSession(page);
		await page.goto(`${shopUrl}/mock-shop-1/settings`);
		await page.getByRole('button', { name: '編輯商店' }).click();
		await page.getByTestId('shop-flavor').fill('尚未儲存的描述');
		await page.getByRole('button', { name: '儲存商店' }).click();

		const dialog = page.getByRole('dialog', { name: '編輯商店' });
		await expect(dialog.getByRole('alert')).toContainText(failure.expected);
		await expect(dialog.getByRole('alert')).toContainText(failure.message);
		await expect(page.getByTestId('shop-flavor')).toHaveValue('尚未儲存的描述');
	});
}

test('DM 可從鍛造工坊選擇來源並加入商店', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	await expect(page.getByTestId('campaign-shops-page')).toBeVisible();
	await expect(page.getByTestId('shop-source-dialog')).toHaveCount(0);
	await page.getByRole('button', { name: '從鍛造工坊匯入' }).click();
	await expect(page.getByTestId('shop-source-dialog')).toBeVisible();
	await expect(page.getByRole('button', { name: '加入' }).first()).toBeVisible({
		timeout: 15_000,
	});
	await page.getByRole('button', { name: '加入' }).first().click();

	await expect(
		page.getByRole('status').filter({ hasText: '已加入商店' }),
	).toBeVisible();
	await expect(page.getByTestId('shop-item-editor')).toHaveCount(0);
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/rpc/save_campaign_shop_item'),
		),
	).toBe(true);
	await expect(page.getByTestId('shop-item-card')).toHaveCount(3);
});

test('DM 可將商品設定為未鑑定狀態並保存到商店快照', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	const writes: { p_item_snapshot?: Record<string, unknown> }[] = [];
	page.on('request', (request) => {
		if (
			request.method() === 'POST' &&
			request.url().includes('/rest/v1/rpc/save_campaign_shop_item')
		) {
			writes.push(
				request.postDataJSON() as {
					p_item_snapshot?: Record<string, unknown>;
				},
			);
		}
	});
	await page.goto(`${shopUrl}/mock-shop-1/settings`);
	await page.getByRole('button', { name: '編輯治療藥水', exact: true }).click();

	const unidentifiedCheckbox = page.getByRole('checkbox', {
		name: '以未鑑定狀態列出',
	});
	await expect(unidentifiedCheckbox).not.toBeChecked();
	await unidentifiedCheckbox.check();
	await page
		.getByTestId('shop-item-editor')
		.getByRole('button', { name: '儲存商品' })
		.click();

	await expect(
		page.getByRole('status').filter({ hasText: '商品設定已更新' }),
	).toBeVisible();
	expect(writes).toContainEqual(
		expect.objectContaining({
			p_item_snapshot: expect.objectContaining({ is_identified: false }),
		}),
	);
	expect(writes[0].p_item_snapshot).not.toHaveProperty('item_base');
});

test('DM 可在商店設定查看並編輯未鑑定商品的真實定義', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
		campaignShopItemUnidentified: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const editButton = page.getByRole('button', {
		name: '編輯治療藥水',
		exact: true,
	});
	await expect(editButton).toBeVisible();
	const itemCard = page.getByTestId('shop-item-card').filter({
		hasText: '治療藥水',
	});
	await expect(itemCard.getByText('未鑑定', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: '查看治療藥水', exact: true }).click();
	await expect(
		page.getByTestId('shop-item-details').getByText('未鑑定', { exact: true }),
	).toBeVisible();
	await editButton.click();

	await expect(page.getByLabel('商品名稱')).toHaveValue('治療藥水');
	const unidentifiedCheckbox = page.getByRole('checkbox', {
		name: '以未鑑定狀態列出',
	});
	await expect(unidentifiedCheckbox).toBeChecked();
	await unidentifiedCheckbox.uncheck();
	await page
		.getByTestId('shop-item-editor')
		.getByRole('button', { name: '儲存商品' })
		.click();
	await expect(
		page.getByRole('status').filter({ hasText: '商品設定已更新' }),
	).toBeVisible();
	await editButton.click();
	await expect(page.getByLabel('商品名稱')).toHaveValue('治療藥水');
	await expect(unidentifiedCheckbox).not.toBeChecked();
});

test('DM 可儲存刷新政策、預覽並確認呼叫單一刷新 RPC', async ({ page }) => {
	const { requests, campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const panel = page.getByTestId('shop-refresh-panel');
	await expect(panel).toBeVisible();
	await panel.getByRole('button', { name: '新增規則' }).click();
	await expect(
		panel.getByRole('link', { name: '戰役設定的商店分頁' }),
	).toHaveAttribute('href', '/campaigns/settings-campaign/settings');
	const catalogSelector = panel.getByTestId('refresh-catalog-0');
	await expect(catalogSelector).toBeVisible();
	await panel.getByTestId('refresh-candidate-kind-0').selectOption('filter');
	await catalogSelector.selectOption('__campaign_rulebooks__');
	await panel.getByTestId('refresh-add-candidate-0').click();
	await panel.getByTestId('refresh-list-unidentified-0').check();
	await expect(panel.getByText(/此戰役的規則書・篩選/)).toBeVisible();
	await panel.getByRole('button', { name: '儲存政策' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '刷新政策已儲存' }),
	).toBeVisible();

	await panel.getByRole('button', { name: '預覽刷新' }).click();
	await expect(panel.getByRole('heading', { name: '刷新預覽' })).toBeVisible({
		timeout: 15_000,
	});
	const previewDialog = panel.getByRole('dialog', { name: '刷新預覽' });
	await expect(previewDialog).toBeVisible();
	await previewDialog.getByRole('button', { name: '關閉刷新預覽' }).click();
	await expect(previewDialog).not.toBeVisible();
	await panel.getByRole('button', { name: '預覽刷新' }).click();
	await expect(previewDialog).toBeVisible({ timeout: 15_000 });
	expect(
		requests.filter((request) =>
			request.startsWith('POST /rest/v1/rpc/refresh_campaign_shop_items'),
		),
	).toHaveLength(0);
	await panel.getByRole('button', { name: '確認刷新' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '店舖刷新完成' }),
	).toBeVisible();
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/rpc/refresh_campaign_shop_items'),
		),
	).toBe(true);
	expect(
		campaignShopRpcRequests.find(
			(request) => request.name === 'refresh_campaign_shop_items',
		)?.body,
	).toEqual(
		expect.objectContaining({
			p_changes: expect.arrayContaining([
				expect.objectContaining({
					item_snapshot: expect.objectContaining({ is_identified: false }),
				}),
			]),
		}),
	);
});

test('產生刷新預覽時會重新讀取戰役最新規則書設定', async ({ page }) => {
	const { setCampaignOfficialCatalogIds } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const panel = page.getByTestId('shop-refresh-panel');
	await panel.getByRole('button', { name: '新增規則' }).click();
	await panel.getByTestId('refresh-candidate-kind-0').selectOption('filter');
	await panel
		.getByTestId('refresh-catalog-0')
		.selectOption('__campaign_rulebooks__');
	await panel.getByTestId('refresh-add-candidate-0').click();
	await panel.getByRole('button', { name: '儲存政策' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '刷新政策已儲存' }),
	).toBeVisible();

	setCampaignOfficialCatalogIds([]);
	await panel.getByRole('button', { name: '預覽刷新' }).click();
	await expect(panel.getByRole('heading', { name: '刷新預覽' })).toBeVisible({
		timeout: 15_000,
	});
	await expect(
		panel.getByText(/本次沒有選中商品。清除模式確認後會直接刪除既有商品/),
	).toBeVisible();
});

test('刪除刷新規則前會要求在危險確認視窗再次確認', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const panel = page.getByTestId('shop-refresh-panel');
	await panel.getByRole('button', { name: '新增規則' }).click();
	const rule = panel.locator('article').filter({ hasText: '規則 1' });
	await expect(rule).toBeVisible();
	await rule.getByRole('button', { name: '刪除規則' }).click();

	const dialog = page.getByRole('dialog', { name: '確認刪除規則' });
	await expect(dialog).toBeVisible();
	const dialogBounds = await dialog.boundingBox();
	const viewport = page.viewportSize();
	if (!dialogBounds || !viewport) {
		throw new Error('無法取得刪除規則確認視窗的位置。');
	}
	expect(
		Math.abs(dialogBounds.x + dialogBounds.width / 2 - viewport.width / 2),
	).toBeLessThan(2);
	expect(
		Math.abs(dialogBounds.y + dialogBounds.height / 2 - viewport.height / 2),
	).toBeLessThan(2);
	await dialog.getByRole('button', { name: '取消' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(rule).toBeVisible();

	await rule.getByRole('button', { name: '刪除規則' }).click();
	await dialog.getByRole('button', { name: '確認刪除' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(rule).toHaveCount(0);
});

test('零候選刷新需要二次確認才會呼叫 RPC', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const panel = page.getByTestId('shop-refresh-panel');
	await panel.getByRole('button', { name: '預覽刷新' }).click();
	await expect(
		panel.getByText(
			/本次沒有選中商品。清除模式確認後會直接刪除既有商品，保留歷史訂單快照並拒絕待審訂單/,
		),
	).toBeVisible({ timeout: 15_000 });

	await panel.getByRole('button', { name: '確認刷新' }).click();
	await expect(
		panel.getByRole('button', { name: '再次確認零項刷新' }),
	).toBeVisible();
	expect(
		requests.filter((request) =>
			request.startsWith('POST /rest/v1/rpc/refresh_campaign_shop_items'),
		),
	).toHaveLength(0);

	await panel.getByRole('button', { name: '再次確認零項刷新' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '刪除 2 項' }),
	).toBeVisible();
	const shopItems = page.getByTestId('shop-item-card');
	await expect(shopItems).toHaveCount(0);
	expect(
		requests.filter((request) =>
			request.startsWith('POST /rest/v1/rpc/refresh_campaign_shop_items'),
		),
	).toHaveLength(1);
});

test('刷新 RPC 失敗時顯示錯誤並保留可重試預覽', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
		campaignShopRpcErrors: {
			refresh_campaign_shop_items: '刷新預覽已過期',
		},
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const panel = page.getByTestId('shop-refresh-panel');
	await panel.getByRole('button', { name: '新增規則' }).click();
	await panel.getByTestId('refresh-candidate-kind-0').selectOption('filter');
	await panel.getByTestId('refresh-catalog-0').selectOption({ index: 1 });
	await panel.getByTestId('refresh-add-candidate-0').click();
	await panel.getByRole('button', { name: '儲存政策' }).click();
	await panel.getByRole('button', { name: '預覽刷新' }).click();
	await expect(panel.getByRole('heading', { name: '刷新預覽' })).toBeVisible({
		timeout: 15_000,
	});

	await panel.getByRole('button', { name: '確認刷新' }).click();
	await expect(panel.getByRole('alert')).toContainText('刷新預覽已過期');
	await expect(panel.getByRole('heading', { name: '刷新預覽' })).toBeVisible();
	expect(
		requests.filter((request) =>
			request.startsWith('POST /rest/v1/rpc/refresh_campaign_shop_items'),
		),
	).toHaveLength(1);
});

test('DM 可在商品對話框編輯鍛造欄位並刪除商品', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const editItemButton = page.getByRole('button', {
		name: '編輯治療藥水',
		exact: true,
	});
	await editItemButton.click();
	const editor = page.getByTestId('shop-item-editor');
	await expect(editor).toBeVisible();
	await expect(editor.getByLabel('圖示名稱')).toHaveValue('FlaskConical');
	await editor.getByLabel('效果描述').fill('恢復 2d4 + 2 點生命值。');
	await editor.getByLabel('重量（磅）').fill('0.5');
	await editor.getByRole('button', { name: '儲存商品' }).click();

	await expect(
		page.getByRole('status').filter({ hasText: '商品設定已更新' }),
	).toBeVisible();
	await expect(page.getByText('恢復 2d4 + 2 點生命值。')).toBeVisible();
	await editItemButton.click();
	await page.getByRole('button', { name: '刪除商品' }).click();
	await expect(
		page.getByText(/刪除商品會一併刪除其所有關聯訂單/),
	).toBeVisible();
	await page.getByRole('button', { name: '再次按下確認刪除' }).click();

	await expect(
		page
			.getByRole('status')
			.filter({ hasText: '商品與其關聯的訂單紀錄已刪除' }),
	).toBeVisible();
	await expect(page.getByTestId('shop-item-card')).toHaveCount(1);
	expect(
		requests.some((request) =>
			request.startsWith('DELETE /rest/v1/campaign_shop_items'),
		),
	).toBe(true);
});

test('一般成員可瀏覽商店但看不到管理操作', async ({ page }) => {
	await mockSupabase(page, { campaignSettingsRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('campaign-shops-page')).toBeVisible();
	await expect(page.getByRole('button', { name: '建立商店' })).toHaveCount(0);
	await expect(page.getByTestId('shop-item-editor')).toHaveCount(0);
	await expect(page.getByText('目前沒有啟用中的商店。').first()).toBeVisible();
});

test('DM 的商店詳情與目錄管理分頁分離', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	await expect(page.getByTestId('campaign-shop-detail')).toBeVisible();
	await expect(page.getByRole('button', { name: '編輯商品' })).toHaveCount(0);
	await page.getByRole('link', { name: '商店設定' }).click();
	await expect(page.getByTestId('shop-source-dialog')).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: '從鍛造工坊匯入' }),
	).toBeVisible();
});

test('玩家可瀏覽商店詳情但無法進入 DM 管理功能', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemIcon:
			'./images/blacksmith/catalogs/dnd-2024-srd-5.2/item-c8494aecf5bc9b72.webp',
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	await expect(page.getByTestId('campaign-shop-detail')).toBeVisible();
	const itemImage = page.getByTestId('shop-item-icon').first().locator('img');
	await expect(itemImage).toHaveAttribute(
		'src',
		'/images/blacksmith/catalogs/dnd-2024-srd-5.2/item-c8494aecf5bc9b72.webp',
	);
	await expect
		.poll(() =>
			itemImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
		)
		.toBeGreaterThan(0);
	await expect(page.getByRole('link', { name: '商店設定' })).toHaveCount(0);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);
	await expect(page.getByText('只有 DM 可以管理商店。')).toBeVisible();
	await expect(page.getByTestId('shop-source-dialog')).toHaveCount(0);
});

test('商品目錄僅以列表顯示並可查看所選商品詳細', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemRarity: 'Rare',
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	const details = page.getByTestId('shop-item-details');
	await expect(
		details.getByRole('heading', { name: '治療藥水' }),
	).toBeVisible();
	const itemCard = page.getByTestId('shop-item-card').first();
	await expect(itemCard.locator('h3')).toHaveClass(
		/text-\[var\(--rarity-foreground\)\]/,
	);
	await expect(itemCard.getByTestId('shop-item-rarity')).toHaveText('稀有');
	await expect(page.getByTestId('shop-item-icon').first()).toHaveClass(
		/border-\[var\(--rarity-border\)\]/,
	);

	await expect(page.getByTestId('shop-display-grid')).toHaveCount(0);
	await expect(page.getByTestId('shop-display-list')).toHaveCount(0);
	await page.getByRole('button', { name: '查看治療藥水（需審查）' }).click();
	await expect(
		details.getByRole('heading', { name: '治療藥水（需審查）' }),
	).toBeVisible();
});

test('商店設定的商品目錄使用左右欄且僅提供列表檢視', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const details = page.getByTestId('shop-item-details');
	await expect(
		details.getByRole('heading', { name: '治療藥水' }),
	).toBeVisible();
	await expect(page.getByTestId('shop-display-grid')).toHaveCount(0);
	await expect(page.getByTestId('shop-display-list')).toHaveCount(0);
	await page.getByRole('button', { name: '查看治療藥水（需審查）' }).click();
	await expect(
		details.getByRole('heading', { name: '治療藥水（需審查）' }),
	).toBeVisible();
});

test('物品效果過長時可展開全部內容並收合', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemEffects: Array.from(
			{ length: 100 },
			(_, index) => `效果說明第 ${index + 1} 條。`,
		).join('\n\n'),
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	const effects = page.getByTestId('shop-item-effects');
	const expandButton = page.getByRole('button', { name: '顯示全部' });
	await expect(expandButton).toBeVisible();
	await expect(effects).not.toHaveCSS('max-height', 'none');
	await expandButton.click();
	await expect(page.getByRole('button', { name: '收合' })).toHaveAttribute(
		'aria-expanded',
		'true',
	);
	await expect(effects).toHaveCSS('max-height', 'none');
	await page.getByRole('button', { name: '收合' }).click();
	await expect(effects).not.toHaveCSS('max-height', 'none');
});

test('商品列表固定每頁 10 項並正確分頁', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemCount: 17,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	const status = page.getByTestId('shop-items-pagination-status');
	await expect(page.getByTestId('shop-item-card')).toHaveCount(10);
	await expect(status).toContainText('第 1 / 2 頁');
	await expect(status).toContainText('顯示 1–10 筆');
	await page.getByRole('button', { name: '下一頁' }).click();
	await expect(page.getByTestId('shop-item-card')).toHaveCount(7);
	await expect(status).toContainText('顯示 11–17 筆');
});
