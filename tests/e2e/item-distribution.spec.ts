import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const inventoryUrl = '/campaigns/inventory-campaign';

async function addNewDraftItem(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '創造新的物品' }).click();
	await page.getByRole('textbox', { name: '道具名稱' }).fill('派發測試長劍');
	await page.getByRole('button', { name: '加入派發清單' }).click();
	await expect(page.getByText('派發測試長劍', { exact: true })).toBeVisible();
}

test('只有 DM 可見派發入口；新增物品以單一 Function 交易提交並套用秘密狀態', async ({
	page,
}) => {
	const { functionRequests, requests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignItemDistributionDelayMs: 300,
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('inventory-dispatch-items')).toBeVisible();
	await page.getByTestId('inventory-dispatch-items').click();
	await expect(page.getByRole('dialog', { name: '派發物品' })).toBeVisible();
	await expect(page.getByLabel('設為秘密物品')).toBeDisabled();

	await addNewDraftItem(page);
	await page.getByLabel('派發接收目標').selectOption('inventory-character');
	await page.getByLabel('設為秘密物品').check();
	await page.getByLabel('派發原因').fill('通過試煉的獎勵');
	const submitButton = page.getByTestId('item-distribution-submit');
	await submitButton.click();
	await expect(submitButton).toBeDisabled();

	await expect(page.getByRole('dialog', { name: '派發物品' })).toHaveCount(0);
	await expect(
		page.getByTestId('inventory-item-dispatch-inventory-1'),
	).toBeVisible();
	expect(functionRequests).toHaveLength(1);
	expect(functionRequests[0]).toMatchObject({
		name: 'dispatch-campaign-items',
		body: {
			campaignId: 'inventory-campaign',
			ownerId: 'inventory-character',
			isPrivate: true,
			reason: '通過試煉的獎勵',
			confirmLargeBatch: false,
			items: [
				{
					itemBase: { name: '派發測試長劍', isStackable: false },
					blacksmithItemId: null,
					isHomebrew: true,
					isImportant: false,
					quantity: 1,
				},
			],
		},
	});
	expect(
		requests.some(
			(request) =>
				/^POST \/rest\/v1\/inventory_items/.test(request) ||
				/^PATCH \/rest\/v1\/inventory_items/.test(request),
		),
	).toBe(false);
});

test('派發至營地儲物箱時秘密選項固定關閉並送出公開狀態', async ({
	page,
}) => {
	const { functionRequests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await addNewDraftItem(page);

	const privateCheckbox = page.getByLabel('設為秘密物品');
	await page.getByLabel('派發接收目標').selectOption('inventory-character');
	await privateCheckbox.check();
	await page.getByLabel('派發接收目標').selectOption('camp-chest');
	await expect(privateCheckbox).not.toBeChecked();
	await expect(privateCheckbox).toBeDisabled();

	await page.getByTestId('item-distribution-submit').click();
	await expect(page.getByRole('dialog', { name: '派發物品' })).toHaveCount(0);
	expect(functionRequests).toHaveLength(1);
	expect(functionRequests[0]).toMatchObject({
		body: {
			ownerId: 'camp-chest',
			isPrivate: false,
		},
	});
});

test('11 至 20 筆新增列先要求確認，失敗時保留派發草稿', async ({ page }) => {
	const { functionRequests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignItemDistributionError: '派發交易測試失敗。',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await addNewDraftItem(page);
	await page.getByLabel('派發原因').fill('保留原因供重試');
	await page.getByLabel('物品數量 派發測試長劍').fill('11');
	await page.getByRole('button', { name: '派發物品', exact: true }).last().click();

	await expect(page.getByRole('alert')).toContainText('新增 11 筆');
	expect(functionRequests).toHaveLength(0);
	await page.getByRole('button', { name: '返回修改' }).click();
	await expect(page.getByLabel('物品數量 派發測試長劍')).toHaveValue('11');
	expect(functionRequests).toHaveLength(0);
	await page.getByRole('button', { name: '派發物品', exact: true }).last().click();
	await expect(page.getByRole('alert')).toContainText('新增 11 筆');
	await page.getByRole('button', { name: '確認並派發' }).click();
	await expect(page.getByText('派發交易測試失敗。', { exact: true })).toBeVisible();
	await expect(page.getByRole('dialog', { name: '派發物品' })).toBeVisible();
	await expect(page.getByText('派發測試長劍', { exact: true })).toBeVisible();
	await expect(page.getByLabel('派發原因')).toHaveValue('保留原因供重試');
	expect(functionRequests).toHaveLength(1);
	expect(functionRequests[0]).toMatchObject({
		body: {
			confirmLargeBatch: true,
			reason: '保留原因供重試',
			items: [{ quantity: 11 }],
		},
	});
});

test('伺服器要求確認時沿用同一派發識別碼重試', async ({ page }) => {
	const { functionRequests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignItemDistributionRequireConfirmationFirst: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await addNewDraftItem(page);
	await page.getByTestId('item-distribution-submit').click();
	await expect(page.getByRole('alert')).toContainText('新增 11 筆');
	expect(functionRequests).toHaveLength(1);

	await page.getByRole('button', { name: '確認並派發' }).click();
	await expect(page.getByRole('dialog', { name: '派發物品' })).toHaveCount(0);
	expect(functionRequests).toHaveLength(2);
	const requestBodies = functionRequests.map(
		(request) =>
			(
				request as {
					body: { requestId: string; confirmLargeBatch: boolean };
				}
			).body,
	);
	expect(requestBodies[0]?.requestId).toBe(requestBodies[1]?.requestId);
	expect(requestBodies.map((request) => request.confirmLargeBatch)).toEqual([
		false,
		true,
	]);
});

test('超過 20 筆預估新增列不會呼叫派發服務', async ({ page }) => {
	const { functionRequests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await addNewDraftItem(page);
	await page.getByLabel('物品數量 派發測試長劍').fill('20');
	await page.getByRole('button', { name: '編輯定義' }).click();
	await page.getByRole('textbox', { name: '道具名稱' }).fill('修改後測試長劍');
	await page.getByRole('button', { name: '儲存定義' }).click();
	await expect(page.getByText('修改後測試長劍', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: '創造新的物品' }).click();
	await page.getByRole('textbox', { name: '道具名稱' }).fill('第二把測試長劍');
	await page.getByRole('button', { name: '加入派發清單' }).click();
	await page.getByRole('button', { name: '創造新的物品' }).click();
	await page.getByRole('textbox', { name: '道具名稱' }).fill('準備刪除的物品');
	await page.getByRole('button', { name: '加入派發清單' }).click();
	await page.getByRole('button', { name: '刪除 準備刪除的物品' }).click();
	await expect(page.getByText('準備刪除的物品', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: '派發物品', exact: true }).last().click();
	await expect(page.getByRole('alert')).toContainText('超過 20 筆');
	expect(functionRequests).toHaveLength(0);
});

test('鍛造工坊匯入視窗預設勾選所有官方規則書並限制最大高度', async ({
	page,
}) => {
	await mockSupabase(page, { campaignInventoryRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await page.getByRole('button', { name: '從鍛造工坊匯入' }).click();
	const searchDialog = page.getByRole('dialog', {
		name: '從鍛造工坊匯入物品',
	});
	await expect(searchDialog).toBeVisible();
	await expect(searchDialog).toHaveClass(/max-h-\[calc\(100vh-300px\)\]/);
	await searchDialog.getByRole('button', { name: '官方規則書' }).click();

	const sourceCheckboxes = page
		.getByLabel('鍛造工坊搜尋來源')
		.locator('input[type="checkbox"]');
	await expect
		.poll(() => sourceCheckboxes.count())
		.toBeGreaterThan(1);
	for (let index = 0; index < (await sourceCheckboxes.count()); index += 1) {
		await expect(sourceCheckboxes.nth(index)).toBeChecked();
	}
});

test('匯入搜尋結果顯示在地化物品類型及成功回饋', async ({ page }) => {
	const { functionRequests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await page.getByRole('button', { name: '從鍛造工坊匯入' }).click();
	const searchDialog = page.getByRole('dialog', {
		name: '從鍛造工坊匯入物品',
	});
	await searchDialog.getByRole('textbox', { name: '物品搜尋關鍵字' }).fill('長劍');
	const result = page.getByTestId('blacksmith-search-result').filter({
		hasText: '長劍',
	});
	await expect(result).toContainText('武器');
	const importButton = result.getByRole('button', { name: '匯入' });
	await importButton.click();
	await expect(page.getByRole('status')).toContainText('已成功匯入');
	await expect(result.getByRole('button', { name: '已匯入' })).toBeDisabled();
	await expect(result.getByRole('button', { name: '匯入' })).toBeEnabled({
		timeout: 3000,
	});

	await searchDialog.getByRole('button', { name: '關閉鍛造工坊搜尋' }).click();
	await page.getByTestId('item-distribution-submit').click();
	await expect(page.getByRole('dialog', { name: '派發物品' })).toHaveCount(0);
	const dispatchedLine = (
		functionRequests[0] as {
			body: {
				items: Array<{ itemBase: Record<string, unknown> }>;
			};
		}
	).body.items[0];
	expect(dispatchedLine?.itemBase).toBeDefined();
	expect(dispatchedLine?.itemBase).not.toHaveProperty('isHomebrew');
	expect(dispatchedLine?.itemBase).not.toHaveProperty('isImportant');
});

test('派發清單會顯示物品圖示', async ({ page }) => {
	await mockSupabase(page, { campaignInventoryRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-dispatch-items').click();
	await page.getByRole('button', { name: '創造新的物品' }).click();
	await page.getByRole('textbox', { name: '道具名稱' }).fill('圖示測試長劍');
	await page.getByRole('button', { name: '加入派發清單' }).click();

	const itemRow = page.getByRole('listitem').filter({ hasText: '圖示測試長劍' });
	await expect(itemRow).toBeVisible();
	await expect(itemRow.locator('svg').first()).toBeVisible();
});

test('一般玩家看不到 DM 派發入口', async ({ page }) => {
	await mockSupabase(page, { campaignInventoryRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('inventory-dispatch-items')).toHaveCount(0);
});

test('巢狀 dialog 支援 Escape 並將焦點還給可用的觸發按鈕', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mockSupabase(page, { campaignInventoryRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	const entryButton = page.getByTestId('inventory-dispatch-items');
	await entryButton.click();
	const distributionDialog = page.getByRole('dialog', { name: '派發物品' });
	await expect(distributionDialog).toBeVisible();
	await page.keyboard.press('Tab');
	expect(
		await distributionDialog.evaluate((dialog) =>
			dialog.contains(document.activeElement),
		),
	).toBe(true);
	await page.keyboard.press('Escape');
	await expect(distributionDialog).toHaveCount(0);
	await expect(entryButton).toBeFocused();

	await entryButton.click();
	const searchImportButton = distributionDialog.getByRole('button', {
		name: '從鍛造工坊匯入',
	});
	await searchImportButton.click();
	await expect(
		page.getByRole('dialog', { name: '從鍛造工坊匯入物品' }),
	).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(
		page.getByRole('dialog', { name: '從鍛造工坊匯入物品' }),
	).toHaveCount(0);
	await expect(distributionDialog).toBeVisible();
	await expect(searchImportButton).toBeFocused();

	const newDefinitionButton = distributionDialog.getByRole('button', {
		name: '創造新的物品',
	});
	await newDefinitionButton.click();
	await expect(
		page.getByRole('dialog', { name: '建立派發物品' }),
	).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(
		page.getByRole('dialog', { name: '建立派發物品' }),
	).toHaveCount(0);
	await expect(newDefinitionButton).toBeFocused();
});
