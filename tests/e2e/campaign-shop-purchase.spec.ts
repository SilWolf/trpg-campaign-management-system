import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const shopUrl = '/campaigns/settings-campaign/shops';

test('玩家可用有修改權的錢包直接購買並查看公開紀錄', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await expect(page.getByLabel('購物角色').locator('option')).toHaveCount(2);
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-direct');
	await page.getByLabel('購買數量').fill('2');
	await page.getByRole('button', { name: '確認購買' }).click();

	await expect(page.getByRole('status')).toContainText('購買完成');
	await expect(page.getByTestId('shop-order-row')).toContainText('已完成');
	expect(
		campaignShopRpcRequests.some(
			(request) =>
				request.name === 'purchase_campaign_shop_item' &&
				(request.body as Record<string, unknown>).p_character_id ===
					'settings-character' &&
				(request.body as Record<string, unknown>).p_wallet_type === 'public' &&
				(request.body as Record<string, unknown>).p_quantity === 2,
		),
	).toBe(true);
	await expect(page.getByTestId('shop-order-row')).not.toContainText('公開錢包');
	await expect(page.getByTestId('shop-order-row')).not.toContainText('私人暗袋');
});

test('玩家可取消待審請求並釋放預留庫存', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-review');
	await page.getByRole('button', { name: '送出審查請求' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await page.getByRole('button', { name: '取消請求' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('已取消');
	expect(
		campaignShopRpcRequests.some(
			(request) => request.name === 'cancel_campaign_shop_order',
		),
	).toBe(true);
});

test('玩家只能使用具有修改權的私人錢包付款', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
		campaignShopWalletAccess: { public: 1, private: 2 },
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-direct');
	await expect(page.getByLabel('付款錢包')).toHaveValue('private');
	await page.getByRole('button', { name: '確認購買' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('已完成');
	expect(
		campaignShopRpcRequests.some(
			(request) =>
				request.name === 'purchase_campaign_shop_item' &&
				(request.body as Record<string, unknown>).p_wallet_type === 'private',
		),
	).toBe(true);
});

test('沒有錢包修改權的角色不可送出購買', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletAccess: { public: 1, private: 0 },
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await expect(
		page.getByText('找不到可用角色或具有修改權（2）的錢包'),
	).toBeVisible();
	await expect(page.getByRole('button', { name: '確認購買' })).toBeDisabled();
	expect(campaignShopRpcRequests).toHaveLength(0);
});

test('DM 可核准待審請求並完成訂單', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-review');
	await page.getByRole('button', { name: '送出審查請求' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await page.getByRole('button', { name: '核准' }).click();

	await expect(page.getByTestId('shop-order-row')).toContainText('已完成');
	expect(
		campaignShopRpcRequests.some(
			(request) => request.name === 'approve_campaign_shop_order',
		),
	).toBe(true);
});

test('DM 可拒絕待審請求並釋放庫存', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-review');
	await page.getByRole('button', { name: '送出審查請求' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await page.getByRole('button', { name: '拒絕' }).click();

	await expect(page.getByTestId('shop-order-row')).toContainText('已拒絕');
	expect(
		campaignShopRpcRequests.some(
			(request) => request.name === 'reject_campaign_shop_order',
		),
	).toBe(true	);
});

test('購買 RPC 失敗時顯示錯誤且不建立成功紀錄', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
		campaignShopRpcErrors: {
			purchase_campaign_shop_item: '所選錢包餘額不足。',
		},
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-direct');
	await page.getByRole('button', { name: '確認購買' }).click();

	await expect(page.getByRole('alert')).toContainText('所選錢包餘額不足。');
	await expect(page.getByTestId('shop-order-row')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveCount(0);
	expect(campaignShopRpcRequests).toEqual([
		expect.objectContaining({ name: 'purchase_campaign_shop_item' }),
	]);
});

test('核准 RPC 失敗時待審訂單仍保留原狀', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
		campaignShopRpcErrors: {
			approve_campaign_shop_order: '錢包餘額不足，無法完成交易。',
		},
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await page.getByLabel('購物角色').selectOption('settings-character');
	await page.getByLabel('購買商品').selectOption('shop-item-review');
	await page.getByRole('button', { name: '送出審查請求' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');

	await page.getByRole('button', { name: '核准' }).click();

	await expect(page.getByRole('alert')).toContainText(
		'錢包餘額不足，無法完成交易。',
	);
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await expect(page.getByTestId('shop-order-row')).not.toContainText('已完成');
	await expect(page.getByRole('status')).toHaveCount(0);
});
