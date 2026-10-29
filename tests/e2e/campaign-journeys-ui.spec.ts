import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const journeysUrl = '/campaigns/settings-campaign/journeys';

function journey(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		id: 'journey-public-1',
		campaign_id: 'settings-campaign',
		title: '灰港的線索',
		tags: '線索, 灰港',
		content: '在港口發現一封密信。',
		character_id: null,
		created_by: 'a77ecb75-91dc-43a2-a20e-0a4c32fe8841',
		created_at: '2025-01-02T03:04:05.000Z',
		is_quest: true,
		is_completed: false,
		visibility: 'public',
		...overrides,
	};
}

test('戰役導航顯示筆記入口，任務／完成／標籤篩選只篩選可讀筆記', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignJourneysSeed: [
			journey(),
			journey({
				id: 'journey-completed',
				title: '已結束的委託',
				tags: '委託',
				content: '',
				is_quest: false,
				is_completed: true,
			}),
			journey({
				id: 'journey-private-hidden',
				title: '不可讀的秘密標題',
				character_id: 'second-settings-character',
				visibility: 'private',
			}),
		],
		campaignJourneyPrivateAccess: 0,
	});
	await seedAuthenticatedSession(page);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto(journeysUrl);

	await expect(page.getByRole('link', { name: /冒險筆記/ }).first()).toBeVisible();
	await expect(page.getByTestId('journey-card-journey-public-1')).toBeVisible();
	await expect(page.getByTestId('journey-card-journey-completed')).toBeVisible();
	await expect(page.getByText('不可讀的秘密標題')).toHaveCount(0);

	await page.getByTestId('journey-filter-quests').click();
	await expect(page.getByTestId('journey-card-journey-public-1')).toBeVisible();
	await expect(page.getByTestId('journey-card-journey-completed')).toHaveCount(0);
	await page.getByTestId('journey-filter-completed').click();
	await expect(page.getByTestId('journey-card-journey-completed')).toBeVisible();
	await expect(page.getByTestId('journey-card-journey-public-1')).toHaveCount(0);

	await page.getByTestId('journey-filter-all').click();
	await page.getByLabel('依標籤篩選冒險筆記').selectOption('線索');
	await expect(page.getByTestId('journey-card-journey-public-1')).toBeVisible();
	await expect(page.getByTestId('journey-card-journey-completed')).toHaveCount(0);

	const dimensions = await page.evaluate(() => ({
		documentWidth: document.documentElement.scrollWidth,
		viewportWidth: document.documentElement.clientWidth,
	}));
	expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
});

test('玩家可建立無角色公開筆記，標籤會正規化並呈現在列表', async ({
	page,
}) => {
	const { campaignJourneyWrites } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
	});
	await seedAuthenticatedSession(page);
	await page.goto(journeysUrl);

	await page.getByTestId('journey-create-open').click();
	await page.getByTestId('journey-title').fill('隊伍初次會合');
	await page.getByTestId('journey-tags').fill('  開場, 線索, , 開場 ');
	await page.getByTestId('journey-content').fill('## 旅店\n\n隊伍在此會合。');
	await page.getByTestId('journey-is-quest').check();
	await page.getByTestId('journey-save').click();

	await expect(page.getByTestId('journey-card-mock-journey-1')).toContainText(
		'隊伍初次會合',
	);
	await expect(page.getByTestId('journey-card-mock-journey-1')).toContainText(
		'開場',
	);
	await expect(page.getByTestId('journey-card-mock-journey-1')).toContainText(
		'線索',
	);
	await expect(page.getByTestId('journey-form')).toHaveCount(0);
	expect(campaignJourneyWrites).toEqual([
		expect.objectContaining({
			campaign_id: 'settings-campaign',
			title: '隊伍初次會合',
			tags: '開場, 線索',
			character_id: null,
			visibility: 'public',
			is_quest: true,
		}),
	]);
});

test('ACL 1 可閱讀私人筆記但不能編輯，ACL 0 不會取得私人筆記標題', async ({
	page,
}) => {
	const privateJourney = journey({
		id: 'journey-private',
		title: '角色的私密日記',
		character_id: 'second-settings-character',
		visibility: 'private',
		is_quest: false,
	});
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignJourneyPrivateAccess: 1,
		campaignJourneysSeed: [privateJourney],
	});
	await seedAuthenticatedSession(page);
	await page.goto(journeysUrl);
	await page.getByTestId('journey-sidebar-link-journey-private').click();

	await expect(page.getByTestId('journey-detail-title')).toHaveText(
		'角色的私密日記',
	);
	await expect(page.getByTestId('journey-edit')).toHaveCount(0);
	await expect(page.getByTestId('journey-delete')).toHaveCount(0);

	const aclZeroPage = await page.context().newPage();
	await mockSupabase(aclZeroPage, {
		campaignSettingsRole: 'player',
		campaignJourneyPrivateAccess: 0,
		campaignJourneysSeed: [privateJourney],
	});
	await seedAuthenticatedSession(aclZeroPage);
	await aclZeroPage.goto(journeysUrl);
	await expect(aclZeroPage.getByText('角色的私密日記')).toHaveCount(0);
	await aclZeroPage.close();
});

test('筆記建立、編輯與確認刪除成功後列表與詳情同步', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignJourneysSeed: [journey()],
	});
	await seedAuthenticatedSession(page);
	await page.goto(journeysUrl);
	await page.getByTestId('journey-card-journey-public-1').click();

	await expect(page.getByTestId('journey-detail-title')).toHaveText('灰港的線索');
	await page.getByTestId('journey-edit').click();
	await page.getByTestId('journey-title').fill('改寫後的線索');
	await page.getByTestId('journey-save').click();
	await expect(page.getByTestId('journey-detail-title')).toHaveText(
		'改寫後的線索',
	);

	await page.getByTestId('journey-delete').click();
	const confirmation = page.getByRole('dialog', { name: '刪除冒險筆記' });
	await confirmation.getByRole('button', { name: '刪除筆記' }).click();
	await expect(page.getByTestId('journey-empty-state')).toBeVisible();
	expect(requests.some((request) => request.startsWith('PATCH /rest/v1/campaign_journeys'))).toBe(
		true,
	);
	expect(requests.some((request) => request.startsWith('DELETE /rest/v1/campaign_journeys'))).toBe(
		true,
	);
});

test('直接進入未知筆記會顯示明確狀態，Markdown 不執行原始 HTML', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignJourneysSeed: [
			journey({
				content: '<script>window.__journeyXss = true</script>\n\n**安全的 Markdown**',
			}),
		],
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${journeysUrl}/journey-public-1`);

	await expect(page.getByTestId('journey-detail-title')).toHaveText('灰港的線索');
	await expect(page.getByTestId('journey-markdown-content').locator('strong')).toHaveText(
		'安全的 Markdown',
	);
	await expect(page.getByTestId('journey-markdown-content').locator('script')).toHaveCount(
		0,
	);

	await page.goto(`${journeysUrl}/unknown-journey`);
	await expect(page.getByTestId('journey-not-found')).toContainText(
		'找不到這篇筆記',
	);
});

test('儲存遭拒時保留編輯內容並顯示錯誤', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignJourneyWriteError: '目前帳號沒有修改權限。',
		campaignJourneysSeed: [journey()],
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${journeysUrl}/journey-public-1`);
	await page.getByTestId('journey-edit').click();
	await page.getByTestId('journey-title').fill('尚未儲存的內容');
	await page.getByTestId('journey-save').click();

	await expect(page.getByRole('alert')).toContainText('目前帳號沒有修改權限');
	await expect(page.getByTestId('journey-title')).toHaveValue('尚未儲存的內容');
});
