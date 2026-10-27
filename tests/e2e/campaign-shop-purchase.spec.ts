import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const shopUrl = '/campaigns/settings-campaign/shops/mock-shop-1';

async function addToCart(
	page: import('@playwright/test').Page,
	item: string,
	quantity = 1,
) {
	for (let index = 0; index < quantity; index += 1) {
		await page.getByRole('button', { name: `+1 ${item}`, exact: true }).click();
	}
}

async function openCheckout(page: import('@playwright/test').Page) {
	await page.getByTestId('shop-checkout-open').click();
	await expect(page.getByTestId('shop-checkout-dialog')).toBeVisible();
}

test('玩家可用有修改權的錢包直接購買並查看公開紀錄', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemCount: 3,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await addToCart(page, '治療藥水', 2);
	await addToCart(page, '測試商品 3');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();

	await expect(page.getByRole('status')).toContainText('結帳完成');
	await expect(page.getByTestId('shop-order-row')).toContainText('已完成');
	await expect(page.getByTestId('shop-order-row')).toContainText('測試商品 3');
	await expect(page.getByTestId('shop-order-title')).toHaveText(
		'治療藥水x2, 測試商品 3',
	);
	expect(
		campaignShopRpcRequests.some(
			(request) =>
				request.name === 'checkout_campaign_shop_cart' &&
				(request.body as Record<string, unknown>).p_character_id ===
					'settings-character' &&
				(request.body as Record<string, unknown>).p_wallet_type === 'public' &&
				(() => {
					const items = (
						request.body as {
							p_items: { shop_item_id: string; quantity: number }[];
						}
					).p_items;
					return (
						items.length === 2 &&
						items.some(
							(item) =>
								item.shop_item_id === 'shop-item-direct' &&
								item.quantity === 2,
						) &&
						items.some(
							(item) =>
								item.shop_item_id === 'shop-item-3' && item.quantity === 1,
						)
					);
				})(),
		),
	).toBe(true);
	await expect(page.getByTestId('shop-order-row')).not.toContainText('公開錢包');
	await expect(page.getByTestId('shop-order-row')).not.toContainText('私人暗袋');
});

test('未鑑定商品在商店與購買紀錄隱藏內容並保留未鑑定狀態', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemUnidentified: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(
		page.getByRole('button', { name: '查看未鑑定的物品' }).first(),
	).toBeVisible();
	await expect(page.getByTestId('shop-item-details')).toContainText(
		'未鑑定的物品',
	);
	await expect(page.getByTestId('shop-item-details')).not.toContainText(
		'治療藥水',
	);
	await addToCart(page, '未鑑定的物品');
	await openCheckout(page);
	await expect(
		page.getByTestId('shop-checkout-item-shop-item-direct'),
	).toContainText('未鑑定的物品');
	await expect(
		page.getByTestId('shop-checkout-item-shop-item-direct'),
	).not.toContainText('治療藥水');
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();

	await expect(page.getByRole('status')).toContainText('結帳完成');
	await expect(page.getByTestId('shop-order-title')).toHaveText('未鑑定的物品');
	await expect(page.getByTestId('shop-order-title')).not.toContainText('治療藥水');
});

test('結帳視窗顯示商品圖示、可調整數量並只送出正數商品', async ({
	page,
}) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemCount: 3,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await addToCart(page, '治療藥水');
	await addToCart(page, '測試商品 3');
	await openCheckout(page);

	const potionIcon = page.getByTestId('shop-checkout-item-icon-shop-item-direct');
	await expect(potionIcon.locator('svg, img')).toHaveCount(1);
	await expect(potionIcon.locator('svg, img')).toBeVisible();
	for (let index = 0; index < 3; index += 1) {
		await page.getByRole('button', { name: '增加治療藥水數量' }).click();
	}
	await expect(
		page.getByTestId('shop-checkout-quantity-shop-item-direct'),
	).toHaveText('4');
	await expect(
		page.getByRole('button', { name: '增加治療藥水數量' }),
	).toBeDisabled();
	await page.getByRole('button', { name: '減少治療藥水數量' }).click();
	await page.getByRole('button', { name: '減少治療藥水數量' }).click();
	await expect(
		page.getByTestId('shop-checkout-quantity-shop-item-direct'),
	).toHaveText('2');
	const testItemRow = page.getByTestId('shop-checkout-item-shop-item-3');
	await page.getByRole('button', { name: '減少測試商品 3數量' }).click();
	await expect(testItemRow).toBeVisible();
	await expect(
		page.getByTestId('shop-checkout-quantity-shop-item-3'),
	).toHaveText('0');

	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();
	await expect(page.getByRole('status')).toContainText('結帳完成');

	const checkoutRequest = campaignShopRpcRequests.find(
		(request) => request.name === 'checkout_campaign_shop_cart',
	);
	expect(checkoutRequest).toBeDefined();
	expect(
		(checkoutRequest?.body as {
			p_items: { shop_item_id: string; quantity: number }[];
		}).p_items,
	).toEqual([{ shop_item_id: 'shop-item-direct', quantity: 2 }]);
});

test('購物車總數為零時保留視窗項目但禁止提交', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await addToCart(page, '治療藥水');
	await openCheckout(page);
	await page.getByRole('button', { name: '減少治療藥水數量' }).click();

	await expect(
		page.getByTestId('shop-checkout-item-shop-item-direct'),
	).toBeVisible();
	await expect(
		page.getByTestId('shop-checkout-quantity-shop-item-direct'),
	).toHaveText('0');
	await expect(page.getByTestId('shop-checkout-confirm')).toBeDisabled();
	await page.getByRole('button', { name: '關閉結帳視窗' }).click();
	await expect(page.getByTestId('shop-checkout-open')).toBeDisabled();
});

test('關閉結帳視窗時移除所有零數量商品', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await addToCart(page, '治療藥水');
	await addToCart(page, '治療藥水（需審查）');
	await openCheckout(page);
	await page.getByRole('button', { name: '減少治療藥水數量' }).click();
	await page.getByRole('button', { name: '關閉結帳視窗' }).click();
	await openCheckout(page);

	await expect(
		page.getByTestId('shop-checkout-item-shop-item-direct'),
	).toHaveCount(0);
	await expect(
		page.getByTestId('shop-checkout-item-shop-item-review'),
	).toBeVisible();
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
	await addToCart(page, '治療藥水（需審查）');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await expect(page.getByText(/注意：此商品需要 DM 審查/)).toBeVisible();
	await expect(page.getByTestId('shop-checkout-confirm')).toHaveText(
		'向 DM 申請購買',
	);
	await page.getByTestId('shop-checkout-confirm').click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await page.getByRole('button', { name: '取消請求' }).click();
	await expect(page.getByTestId('shop-order-row')).toContainText('已取消');
	expect(
		campaignShopRpcRequests.some(
			(request) => request.name === 'cancel_campaign_shop_order',
		),
	).toBe(true);
});

test('混合購物車有審查商品時整筆交易一起送審', async ({ page }) => {
	const { campaignShopRpcRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopWalletGp: 100,
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await addToCart(page, '治療藥水');
	await addToCart(page, '治療藥水（需審查）');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();

	const transaction = page.getByTestId('shop-order-row');
	await expect(transaction).toContainText('治療藥水');
	await expect(transaction).toContainText('治療藥水（需審查）');
	await expect(transaction).toContainText('待審查');
	await expect(page.getByTestId('shop-order-row')).toHaveCount(1);
	expect(
		campaignShopRpcRequests.some((request) => {
			if (request.name !== 'checkout_campaign_shop_cart') return false;
			const items = (request.body as { p_items: unknown[] }).p_items;
			return items.length === 2;
		}),
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
	await addToCart(page, '治療藥水');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await expect(page.getByLabel('結帳錢包')).toHaveValue('private');
	await page.getByTestId('shop-checkout-confirm').click();
	await expect(page.getByTestId('shop-order-row')).toContainText('已完成');
	expect(
		campaignShopRpcRequests.some(
			(request) =>
				request.name === 'checkout_campaign_shop_cart' &&
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
	await addToCart(page, '治療藥水');
	await openCheckout(page);
	await expect(
		page.getByText('找不到可用角色或具有修改權（2）的錢包'),
	).toBeVisible();
	await expect(page.getByTestId('shop-checkout-confirm')).toBeDisabled();
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
	await addToCart(page, '治療藥水（需審查）');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await expect(page.getByRole('button', { name: '核准' })).toHaveCount(0);
	await page.goto(`${shopUrl}/settings`);
	await page.getByRole('button', { name: '核准' }).click();

	await expect(page.getByTestId('shop-order-row')).toHaveCount(0);
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
	await addToCart(page, '治療藥水（需審查）');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await page.goto(`${shopUrl}/settings`);
	await page.getByRole('button', { name: '拒絕' }).click();

	await expect(page.getByTestId('shop-order-row')).toHaveCount(0);
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
			checkout_campaign_shop_cart: '所選錢包餘額不足。',
		},
	});
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('shop-transactions-panel')).toBeVisible();
	await addToCart(page, '治療藥水');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();

	await expect(page.getByRole('alert')).toContainText('所選錢包餘額不足。');
	await expect(page.getByTestId('shop-order-row')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveCount(0);
	expect(campaignShopRpcRequests).toEqual([
		expect.objectContaining({ name: 'checkout_campaign_shop_cart' }),
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
	await addToCart(page, '治療藥水（需審查）');
	await openCheckout(page);
	await page.getByLabel('結帳角色').selectOption('settings-character');
	await page.getByTestId('shop-checkout-confirm').click();
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');

	await page.goto(`${shopUrl}/settings`);
	await page.getByRole('button', { name: '核准' }).click();

	await expect(page.getByRole('alert')).toContainText(
		'錢包餘額不足，無法完成交易。',
	);
	await expect(page.getByTestId('shop-order-row')).toContainText('待審查');
	await expect(page.getByTestId('shop-order-row')).not.toContainText('已完成');
	await expect(page.getByRole('status')).toHaveCount(0);
});
