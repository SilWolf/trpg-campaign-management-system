import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const campaignSettingsUrl = '/campaigns/settings-campaign/settings';

test('全域 Toast 限制可見數量、排隊、手動關閉並於逾時後消失', async ({
	page,
}) => {
	const { campaignUpdates } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);
	await expect(page.getByLabel('戰役名稱')).toBeVisible();
	await page.clock.install();

	const successToast = page
		.getByRole('status')
		.filter({ hasText: '戰役設定已成功更新！' });
	const campaignName = page.getByLabel('戰役名稱');
	for (let index = 1; index <= 4; index += 1) {
		await campaignName.fill(`回饋回歸測試 ${index}`);
		await page.getByRole('button', { name: '儲存變更' }).click();
		await expect(successToast).toHaveCount(Math.min(index, 3));
	}

	for (const expectedCount of [3, 2, 1, 0]) {
		await page.getByRole('button', { name: '關閉通知' }).first().click();
		await expect(successToast).toHaveCount(expectedCount);
	}

	await campaignName.fill('逾時回歸測試');
	await page.getByRole('button', { name: '儲存變更' }).click();
	await expect(successToast).toHaveCount(1);
	await page.clock.fastForward(4000);
	await expect(successToast).toHaveCount(0);

	expect(campaignUpdates.filter((update) => 'name' in update)).toHaveLength(5);
});

test('Toast 錯誤使用 alert 語意且手機寬度不產生水平溢位', async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignSettingsSaveError: '測試伺服器拒絕儲存。',
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByLabel('戰役名稱').fill('錯誤回饋測試');
	await page.getByRole('button', { name: '儲存變更' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'儲存失敗：測試伺服器拒絕儲存。',
	);
	await expect(page.getByRole('status')).toHaveCount(0);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		),
	).toBe(false);
});

test('危險確認預設聚焦取消，Escape 與遮罩可取消，確認後才刪除戰役', async ({
	page,
}) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	const openConfirm = page.getByRole('button', { name: '永久刪除此戰役' });
	const confirmDialog = page.getByRole('dialog', { name: '永久刪除戰役' });
	const cancelButton = confirmDialog.getByRole('button', { name: '取消' });
	const confirmButton = confirmDialog.getByRole('button', {
		name: '永久刪除戰役',
	});

	await openConfirm.click();
	await expect(confirmDialog).toBeVisible();
	await expect(cancelButton).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(confirmDialog).not.toBeVisible();
	expect(requests.some((request) => request.startsWith('DELETE /rest/v1/campaigns'))).toBe(
		false,
	);

	await openConfirm.click();
	await expect(confirmDialog).toBeVisible();
	await page.mouse.click(4, 4);
	await expect(confirmDialog).not.toBeVisible();
	expect(requests.some((request) => request.startsWith('DELETE /rest/v1/campaigns'))).toBe(
		false,
	);

	await openConfirm.click();
	await confirmButton.click();
	await expect(page).toHaveURL('/');
	await expect(
		page.getByRole('status').filter({ hasText: '戰役已永久刪除' }),
	).toBeVisible();
	expect(requests.filter((request) => request.startsWith('DELETE /rest/v1/campaigns'))).toHaveLength(
		1,
	);
});
