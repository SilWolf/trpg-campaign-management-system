import { expect, test } from '@playwright/test';

test('冒險筆記轉換器 round-trip 涵蓋可見性、角色、旗標與標籤', async ({
	page,
}) => {
	await page.goto('/');
	const results = await page.evaluate(async () => {
		const {
			fromDbCampaignJourney,
			fromDbCampaignJourneyDmNote,
			parseCampaignJourneyTags,
			toDbCampaignJourney,
			toDbCampaignJourneyDmNote,
		} = await import('/src/lib/supabase.ts');
		const base = {
			id: 'journey-1',
			campaignId: 'campaign-1',
			title: '古老遺跡',
			tags: ['線索', '主線任務'],
			content: '在遺跡中發現了記號。',
			createdBy: 'user-1',
			createdAt: '2026-10-29T00:00:00Z',
			isQuest: true,
			isCompleted: false,
		};
		const publicJourney = {
			...base,
			characterId: null,
			visibility: 'public' as const,
		};
		const privateJourney = {
			...base,
			id: 'journey-2',
			characterId: 'character-1',
			visibility: 'private' as const,
			isCompleted: true,
			tags: ['私人物件'],
		};
		const nullableFallback = fromDbCampaignJourney({
			id: 'journey-3',
			campaign_id: 'campaign-1',
			title: '舊資料',
			created_by: 'user-1',
			created_at: '2026-10-29T00:00:00Z',
			tags: null,
			content: null,
			character_id: null,
			is_quest: null,
			is_completed: null,
			visibility: null,
		});
		const dmNote = {
			journeyId: 'journey-1',
			campaignId: 'campaign-1',
			content: 'DM 專屬線索',
		};
		return {
			publicJourney: fromDbCampaignJourney(toDbCampaignJourney(publicJourney)),
			privateJourney: fromDbCampaignJourney(toDbCampaignJourney(privateJourney)),
			dmNote: fromDbCampaignJourneyDmNote(toDbCampaignJourneyDmNote(dmNote)),
			nullableFallback,
			parsedTags: parseCampaignJourneyTags(' 線索, ,任務,線索, 任務 '),
		};
	});

	expect(results.publicJourney).toEqual({
		id: 'journey-1',
		campaignId: 'campaign-1',
		title: '古老遺跡',
		tags: ['線索', '主線任務'],
		content: '在遺跡中發現了記號。',
		characterId: null,
		createdBy: 'user-1',
		createdAt: '2026-10-29T00:00:00Z',
		isQuest: true,
		isCompleted: false,
		visibility: 'public',
	});
	expect(results.privateJourney.visibility).toBe('private');
	expect(results.privateJourney.characterId).toBe('character-1');
	expect(results.privateJourney.isCompleted).toBe(true);
	expect(results.privateJourney.tags).toEqual(['私人物件']);
	expect(results.dmNote).toEqual({
		journeyId: 'journey-1',
		campaignId: 'campaign-1',
		content: 'DM 專屬線索',
	});
	expect(results.nullableFallback).toMatchObject({
		tags: [],
		content: '',
		characterId: null,
		isQuest: false,
		isCompleted: false,
		visibility: 'public',
	});
	expect(results.parsedTags).toEqual(['線索', '任務']);
});

test('冒險筆記資料存取限制 campaign 範圍且非 DM 不會查詢 DM 表', async ({
	page,
}) => {
	const requests: { method: string; url: string; body: string | null }[] = [];
	const row = {
		id: 'journey-1',
		campaign_id: 'campaign-1',
		title: '古老遺跡',
		tags: '線索',
		content: '在遺跡中發現了記號。',
		character_id: null,
		created_by: 'user-1',
		created_at: '2026-10-29T00:00:00Z',
		is_quest: true,
		is_completed: false,
		visibility: 'public',
	};
	await page.route('**/rest/v1/campaign_journeys**', async (route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') {
			await route.fulfill({
				status: 204,
				headers: {
					'access-control-allow-origin': '*',
					'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
					'access-control-allow-headers': '*',
				},
			});
			return;
		}
		requests.push({
			method: request.method(),
			url: request.url(),
			body: request.postData(),
		});
		const method = request.method();
		if (method === 'GET') {
			await route.fulfill({
				status: 200,
				headers: { 'access-control-allow-origin': '*' },
				json: [],
			});
		} else if (method === 'DELETE') {
			await route.fulfill({
				status: 200,
				headers: { 'access-control-allow-origin': '*' },
				json: { id: row.id },
			});
		} else {
			await route.fulfill({
				status: 200,
				headers: { 'access-control-allow-origin': '*' },
				json: row,
			});
		}
	});

	await page.goto('/');
	const result = await page.evaluate(async () => {
		const {
			createCampaignJourney,
			deleteCampaignJourney,
			loadCampaignJourney,
			loadCampaignJourneyDmNote,
			loadCampaignJourneys,
			updateCampaignJourney,
		} = await import('/src/lib/campaignJourneys.ts');
		await loadCampaignJourneys('campaign-1');
		const missing = await loadCampaignJourney('campaign-1', 'journey-1');
		await createCampaignJourney('campaign-1', {
			title: '新筆記',
			tags: [' 線索 ', '', '線索'],
			content: '',
			characterId: null,
			isQuest: false,
			isCompleted: false,
			visibility: 'public',
		});
		await updateCampaignJourney('campaign-1', 'journey-1', {
			title: '更新標題',
		});
		await deleteCampaignJourney('campaign-1', 'journey-1');
		let dmGuardError = '';
		try {
			await loadCampaignJourneyDmNote('campaign-1', 'journey-1', false);
		} catch (error) {
			dmGuardError = error instanceof Error ? error.message : String(error);
		}
		return { missing, dmGuardError };
	});

	expect(result.missing).toBeNull();
	expect(result.dmGuardError).toContain('只有確認為戰役 DM');
	expect(requests).toHaveLength(5);
	for (const request of requests) {
		const url = new URL(request.url);
		expect(url.searchParams.get('select')).not.toBe('*');
		expect(url.searchParams.get('select')).not.toContain('dm');
		if (request.method === 'POST') {
			const body = JSON.parse(request.body ?? '{}') as Record<string, unknown>;
			expect(body.campaign_id).toBe('campaign-1');
			expect(body).not.toHaveProperty('created_by');
			expect(body).not.toHaveProperty('created_at');
		} else {
			expect(url.searchParams.get('campaign_id')).toBe('eq.campaign-1');
		}
	}
	expect(requests[1].url).toContain('id=eq.journey-1');
	expect(requests[3].url).toContain('id=eq.journey-1');
	expect(requests[4].url).toContain('id=eq.journey-1');
	expect(JSON.parse(requests[2].body ?? '{}')).toMatchObject({ tags: '線索' });
});

test('冒險筆記資料存取會將 Supabase 錯誤傳回呼叫端', async ({ page }) => {
	await page.route('**/rest/v1/campaign_journeys**', async (route) => {
		const request = route.request();
		if (request.method() === 'OPTIONS') {
			await route.fulfill({
				status: 204,
				headers: {
					'access-control-allow-origin': '*',
					'access-control-allow-methods': 'GET, OPTIONS',
					'access-control-allow-headers': '*',
				},
			});
			return;
		}
		await route.fulfill({
			status: 500,
			headers: { 'access-control-allow-origin': '*' },
			json: { code: 'XX000', message: 'journey query failed' },
		});
	});
	await page.goto('/');
	const errorMessage = await page.evaluate(async () => {
		const { loadCampaignJourneys } = await import('/src/lib/campaignJourneys.ts');
		try {
			await loadCampaignJourneys('campaign-1');
			return '';
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	});
	expect(errorMessage).toContain('journey query failed');
});
