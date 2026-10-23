import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const campaignSettingsUrl = '/campaigns/settings-campaign/settings';

test('DM 可更新戰役設定與玩家配額，並取得邀請操作回饋', async ({ page }) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await expect(
		page.getByRole('heading', { name: '戰役與角色控制權限中心' }),
	).toBeVisible();
	await expect(page.getByLabel('戰役名稱')).toBeEnabled();
	await expect(page.getByRole('button', { name: '發送邀請' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: '永久刪除此戰役' }),
	).toBeVisible();

	await page.getByLabel('戰役名稱').fill('更新後的測試戰役');
	await page.getByRole('button', { name: '儲存變更' }).click();
	await expect(page.getByTestId('campaign-settings-notice')).toContainText(
		'戰役設定已成功更新',
	);
	expect(requests.some((request) => request.startsWith('PATCH /rest/v1/campaigns'))).toBe(
		true,
	);

	const quota = page.getByTestId('campaign-member-quota-other-player-id');
	await quota.fill('3');
	await expect
		.poll(() =>
			requests.some((request) =>
				request.startsWith('PATCH /rest/v1/campaign_members'),
			),
		)
		.toBe(true);

	await page.getByLabel('受邀玩家電子郵件').fill('invitee@example.test');
	await page.getByRole('button', { name: '發送邀請' }).click();
	await expect(page.getByTestId('campaign-settings-notice')).toContainText(
		'已成功透過 Supabase Auth',
	);
	expect(requests).toContain('POST /functions/v1/invite-player');
});

test('一般成員只能檢視 Campaign 設定，且不能修改自己的權限列', async ({
	page,
}) => {
	await mockSupabase(page, { campaignSettingsRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await expect(page.getByLabel('戰役名稱')).toBeDisabled();
	await expect(page.getByRole('button', { name: '發送邀請' })).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: '永久刪除此戰役' }),
	).toHaveCount(0);
	await expect(
		page.getByTestId('campaign-member-quota-other-player-id'),
	).toHaveCount(0);

	const characterTab = page.getByRole('tab', { name: /測試冒險者/ });
	await characterTab.click();
	await expect(
		page.getByTestId(
			'character-permission-public-bag-settings-character-a77ecb75-91dc-43a2-a20e-0a4c32fe8841',
		),
	).toBeDisabled();
	await expect(page.getByTestId('character-transfer')).toHaveCount(0);
});

test('Campaign 設定頁籤支援鍵盤操作，角色移轉確認可取消', async ({
	page,
}) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	const generalTab = page.getByRole('tab', {
		name: /戰役常規設定與成員配額/,
	});
	await generalTab.focus();
	await generalTab.press('ArrowRight');

	const characterTab = page.getByRole('tab', { name: /測試冒險者/ });
	await expect(characterTab).toBeFocused();
	await expect(characterTab).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByTestId('campaign-settings-panel')).toBeVisible();

	page.once('dialog', (dialog) => dialog.dismiss());
	await page.getByTestId('character-transfer').click();
	await expect
		.poll(() =>
			requests.some((request) =>
				request.startsWith('PATCH /rest/v1/characters'),
			),
		)
		.toBe(false);
});

test('設定表單會驗證必填欄位，角色與權限更新保留原操作邊界', async ({
	page,
}) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	const campaignName = page.getByLabel('戰役名稱');
	await campaignName.fill('');
	await page.getByRole('button', { name: '儲存變更' }).click();
	await expect
		.poll(() =>
			campaignName.evaluate((input) => (input as HTMLInputElement).validity.valid),
		)
		.toBe(false);
	expect(
		requests.some((request) => request.startsWith('PATCH /rest/v1/campaigns')),
	).toBe(false);

	await page.getByTestId('campaign-settings-tab-settings-character').click();
	const characterName = page.getByLabel('角色名稱 *');
	await characterName.fill('更新後的角色');
	await page.getByRole('button', { name: '儲存角色基本資料' }).click();
	await expect(page.getByTestId('campaign-settings-notice')).toContainText(
		'角色「更新後的角色」基本資料已更新',
	);
	expect(
		requests.some((request) => request.startsWith('PATCH /rest/v1/characters')),
	).toBe(true);

	await page
		.getByTestId(
			'character-permission-public-bag-settings-character-other-player-id',
		)
		.selectOption('1');
	await expect
		.poll(() =>
			requests.some((request) =>
				request.startsWith('POST /rest/v1/character_permissions'),
			),
		)
		.toBe(true);

	page.once('dialog', async (dialog) => {
		expect(dialog.type()).toBe('confirm');
		await dialog.dismiss();
	});
	await page.getByTestId('character-delete').click();
	expect(requests.some((request) => request.startsWith('DELETE '))).toBe(false);
});

test('永久刪除戰役前會要求確認，取消後停留在設定頁', async ({ page }) => {
	await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	page.once('dialog', async (dialog) => {
		expect(dialog.type()).toBe('confirm');
		await dialog.dismiss();
	});
	await page.getByRole('button', { name: '永久刪除此戰役' }).click();

	await expect(page).toHaveURL(new RegExp(`${campaignSettingsUrl}$`));
});

test('Campaign 設定頁在窄螢幕沒有水平溢出', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await expect(
		page.getByRole('heading', { name: '戰役與角色控制權限中心' }),
	).toBeVisible();
	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(hasHorizontalOverflow).toBe(false);
});
