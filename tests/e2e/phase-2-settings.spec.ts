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
	await expect(
		page.getByRole('status').filter({ hasText: '戰役設定已成功更新' }),
	).toBeVisible();
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
	await expect(
		page.getByRole('status').filter({ hasText: '已成功透過 Supabase Auth' }),
	).toBeVisible();
	expect(requests).toContain('POST /functions/v1/invite-player');
});

test('DM 可在商店分頁多選戰役官方規則書', async ({ page }) => {
	const { campaignUpdates } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignOfficialCatalogIds: [],
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByTestId('campaign-settings-tab-shops').click();
	const panel = page.getByTestId('campaign-shop-settings');
	await expect(panel).toBeVisible();
	const srdCatalog = page.getByTestId(
		'campaign-official-catalog-dnd-2024-srd-5.2',
	);
	await srdCatalog.check();
	await panel.getByRole('button', { name: '儲存設定' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '設定已儲存' }),
	).toBeVisible();
	expect(campaignUpdates).toContainEqual({
		official_catalog_ids: ['dnd-2024-srd-5.2'],
	});
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

	await page.getByTestId('campaign-settings-tab-characters').click();
	const characterTab = page.getByRole('tab', { name: /測試冒險者/ });
	await characterTab.click();
	await expect(
		page.getByTestId(
			'character-permission-public-bag-settings-character-a77ecb75-91dc-43a2-a20e-0a4c32fe8841',
		),
	).toBeDisabled();
	await expect(
		page.getByTestId(
			'character-permission-journey-settings-character-a77ecb75-91dc-43a2-a20e-0a4c32fe8841',
		),
	).toBeDisabled();
	await expect(page.getByTestId('character-transfer')).toHaveCount(0);
});

test('DM 可設定冒險筆記等級並將 journey_access 寫入 permission row', async ({
	page,
}) => {
	const { permissionUpdates } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();

	const journeyAccess = page.getByTestId(
		'character-permission-journey-settings-character-transfer-player-id',
	);
	await expect(journeyAccess).toHaveValue('0');
	await expect(journeyAccess).toBeEnabled();
	await journeyAccess.selectOption('1');
	await expect(journeyAccess).toHaveValue('1');
	expect(permissionUpdates).toEqual([
		expect.objectContaining({
			campaign_id: 'settings-campaign',
			character_id: 'settings-character',
			user_id: 'transfer-player-id',
			journey_access: 1,
		}),
	]);

	await journeyAccess.selectOption('2');
	expect(permissionUpdates[1]).toEqual(
		expect.objectContaining({ journey_access: 2 }),
	);
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
	const charactersTab = page.getByTestId('campaign-settings-tab-characters');
	await expect(charactersTab).toBeFocused();
	await expect(charactersTab).toHaveAttribute('aria-selected', 'true');
	await charactersTab.click();
	await characterTab.click();
	await expect(page.getByTestId('campaign-settings-panel')).toBeVisible();

	await page.getByTestId('character-transfer').click();
	const transferDialog = page.getByRole('dialog', { name: '轉移角色擁有權' });
	await expect(transferDialog).toBeVisible();
	await transferDialog.getByRole('button', { name: '取消' }).click();
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

	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();
	const characterName = page.getByLabel('角色名稱 *');
	await characterName.fill('更新後的角色');
	await page.getByRole('button', { name: '儲存角色基本資料' }).click();
	await expect(
		page
			.getByRole('status')
			.filter({ hasText: '角色「更新後的角色」基本資料已更新' }),
	).toBeVisible();
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

	await page.getByTestId('character-delete').click();
	const deleteDialog = page.getByRole('dialog', {
		name: '移除角色並收納遺物',
	});
	await expect(deleteDialog).toBeVisible();
	await deleteDialog.getByRole('button', { name: '取消' }).click();
	expect(requests.some((request) => request.startsWith('DELETE '))).toBe(false);
});

test('DM 可在角色分頁新增冒險者角色', async ({ page }) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('character-add').click();
	const characterForm = page.getByTestId('character-form');
	await characterForm.getByLabel('角色名稱 *').fill('新建立的冒險者');
	await characterForm.getByRole('button', { name: '儲存角色' }).click();

	await expect(
		page.getByRole('status').filter({ hasText: '已新增角色「新建立的冒險者」' }),
	).toBeVisible();
	expect(
		requests.some((request) => request.startsWith('POST /rest/v1/characters')),
	).toBe(true);
	await expect(
		page.getByRole('tab', { name: /新建立的冒險者/ }),
	).toBeVisible();
});

test('移除角色時將錢幣併入戰役營地箱且不建立虛擬角色列', async ({
	page,
}) => {
	const { requests, functionRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();
	await page.getByTestId('character-delete').click();
	const deleteDialog = page.getByRole('dialog', {
		name: '移除角色並收納遺物',
	});
	await expect(deleteDialog).toBeVisible();
	await deleteDialog.getByRole('button', { name: '移除角色' }).click();

	await expect(page.getByRole('status').filter({ hasText: '已移除角色' })).toBeVisible();
	expect(functionRequests).toContainEqual({
		name: 'delete-campaign-character',
		body: {
			campaignId: 'settings-campaign',
			characterId: 'settings-character',
		},
	});
	expect(
		requests.some(
			(request) =>
				request.startsWith('PATCH /rest/v1/campaigns') ||
				request.startsWith('DELETE /rest/v1/characters') ||
				request.startsWith('PATCH /rest/v1/inventory_items') ||
				request.startsWith('POST /rest/v1/inventory_items'),
		),
	).toBe(false);
	expect(
		requests.some((request) => request.startsWith('POST /rest/v1/characters')),
	).toBe(false);
});

test('角色刪除交易失敗時保留角色並顯示錯誤', async ({ page }) => {
	const { functionRequests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		deleteCampaignCharacterError: '沒有權限移除此角色。',
	});
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();
	await page.getByTestId('character-delete').click();
	const deleteDialog = page.getByRole('dialog', {
		name: '移除角色並收納遺物',
	});
	await deleteDialog.getByRole('button', { name: '移除角色' }).click();

	await expect(
		page.getByRole('alert').filter({ hasText: '移除角色失敗：沒有權限' }),
	).toBeVisible();
	await expect(
		page.getByRole('tab', { name: /測試冒險者/ }),
	).toBeVisible();
	expect(functionRequests).toContainEqual({
		name: 'delete-campaign-character',
		body: {
			campaignId: 'settings-campaign',
			characterId: 'settings-character',
		},
	});
});

test('永久刪除戰役前會要求確認，取消後停留在設定頁', async ({ page }) => {
	await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByRole('button', { name: '永久刪除此戰役' }).click();
	const deleteCampaignDialog = page.getByRole('dialog', {
		name: '永久刪除戰役',
	});
	await expect(deleteCampaignDialog).toBeVisible();
	await deleteCampaignDialog.getByRole('button', { name: '取消' }).click();

	await expect(page).toHaveURL(new RegExp(`${campaignSettingsUrl}$`));
});

test('確認永久刪除戰役後執行刪除並返回大廳', async ({ page }) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(campaignSettingsUrl);

	await page.getByRole('button', { name: '永久刪除此戰役' }).click();
	const deleteCampaignDialog = page.getByRole('dialog', {
		name: '永久刪除戰役',
	});
	await deleteCampaignDialog.getByRole('button', { name: '永久刪除戰役' }).click();

	await expect(page).toHaveURL('/');
	await expect(
		page.getByRole('status').filter({ hasText: '戰役已永久刪除' }),
	).toBeVisible();
	expect(requests.some((request) => request.startsWith('DELETE /rest/v1/campaigns'))).toBe(
		true,
	);
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
