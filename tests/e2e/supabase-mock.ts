import type { Page } from '@playwright/test';

const testUser = {
	id: 'a77ecb75-91dc-43a2-a20e-0a4c32fe8841',
	aud: 'authenticated',
	role: 'authenticated',
	email: 'adventurer@example.test',
	email_confirmed_at: '2025-01-01T00:00:00.000Z',
	phone: '',
	confirmed_at: '2025-01-01T00:00:00.000Z',
	last_sign_in_at: '2025-01-01T00:00:00.000Z',
	app_metadata: { provider: 'email', providers: ['email'] },
	user_metadata: { full_name: '測試冒險者' },
	identities: [],
	created_at: '2025-01-01T00:00:00.000Z',
	updated_at: '2025-01-01T00:00:00.000Z',
};

const testSession = {
	access_token: 'playwright-test-access-token',
	refresh_token: 'playwright-test-refresh-token',
	token_type: 'bearer',
	expires_in: 3600,
	expires_at: Math.floor(Date.now() / 1000) + 3600,
	user: testUser,
};

type CampaignSettingsRole = 'dm' | 'player';

export async function seedAuthenticatedSession(page: Page) {
	await page.addInitScript((session) => {
		localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
	}, testSession);
}

export async function mockSupabase(
	page: Page,
	options: {
		campaignSettingsRole?: CampaignSettingsRole;
		campaignInventoryRole?: CampaignSettingsRole;
		createCampaignError?: string;
	} = {},
) {
	const requests: string[] = [];
	const functionRequests: unknown[] = [];
	const campaignSettingsRole = options.campaignSettingsRole;
	const campaignInventoryRole = options.campaignInventoryRole;
	const campaignRole = campaignInventoryRole ?? campaignSettingsRole;
	const campaignCharacters = [
		{
			id: 'settings-character',
			name: '測試冒險者',
			title: '遊俠',
			str: 14,
			avatar: '🏹',
			user_id:
				campaignSettingsRole === 'player' ? testUser.id : 'other-player-id',
			campaign_id: 'settings-campaign',
			currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
			private_currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		},
		{
			id: 'second-settings-character',
			name: '第二位冒險者',
			title: '吟遊詩人',
			str: 10,
			avatar: '🎻',
			user_id: 'other-player-id',
			campaign_id: 'settings-campaign',
			currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
			private_currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		},
	];
	const inventoryCharacters = [
		{
			id: 'inventory-character',
			name: '測試冒險者',
			title: '遊俠',
			str: 10,
			avatar: '🏹',
			user_id: 'other-player-id',
			campaign_id: 'inventory-campaign',
			currencies: { pp: 0, gp: 20, ep: 0, sp: 0, cp: 0 },
			private_currencies: { pp: 0, gp: 80, ep: 0, sp: 0, cp: 0 },
		},
		{
			id: 'inventory-target-character',
			name: '移轉目標',
			title: '吟遊詩人',
			str: 10,
			avatar: '🎻',
			user_id: 'transfer-player-id',
			campaign_id: 'inventory-campaign',
			currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
			private_currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		},
	];
	const inventoryItems = [
		{
			id: 'inventory-public-potion',
			owner_id: 'inventory-character',
			slot: 0,
			name: '治療藥水',
			category: 'Consumable',
			sub_type: '藥水',
			rarity: 'Common',
			icon: 'FlaskConical',
			damage: null,
			mastery: 'None',
			ac: null,
			weight: 0.5,
			value_gp: 50,
			quantity: 2,
			equipped: false,
			requires_attunement: false,
			attuned: false,
			is_homebrew: false,
			is_identified: true,
			charges: 0,
			max_charges: 0,
			effects: '恢復生命。',
			flavor: '',
			dm_notes: '',
			player_notes: '',
			is_private: false,
			is_equippable: false,
			is_consumable: true,
			is_important: false,
			affixes: [],
		},
		{
			id: 'inventory-private-letter',
			owner_id: 'inventory-character',
			slot: 1,
			name: '暗袋密信',
			category: 'Misc',
			sub_type: '信件',
			rarity: 'Rare',
			icon: 'Scroll',
			damage: null,
			mastery: 'None',
			ac: null,
			weight: 1.5,
			value_gp: 10,
			quantity: 1,
			equipped: false,
			requires_attunement: false,
			attuned: false,
			is_homebrew: false,
			is_identified: true,
			charges: 0,
			max_charges: 0,
			effects: '不可公開的內容。',
			flavor: '',
			dm_notes: '',
			player_notes: '',
			is_private: true,
			is_equippable: false,
			is_consumable: false,
			is_important: false,
			affixes: [],
		},
	];
	const campaignMembers = [
		{
			user_id: 'settings-dm-id',
			role: 'dm',
			max_characters: 1,
			invited_at: null,
			accepted_at: '2025-01-01T00:00:00.000Z',
			profiles: { full_name: '測試地下城主', email: 'dm@example.test' },
		},
		{
			user_id: testUser.id,
			role: campaignSettingsRole,
			max_characters: 1,
			invited_at: null,
			accepted_at: '2025-01-01T00:00:00.000Z',
			profiles: {
				full_name: '測試冒險者',
				email: testUser.email,
			},
		},
		{
			user_id: 'other-player-id',
			role: 'player',
			max_characters: 1,
			invited_at: null,
			accepted_at: '2025-01-01T00:00:00.000Z',
			profiles: { full_name: '其他玩家', email: 'other@example.test' },
		},
		{
			user_id: 'transfer-player-id',
			role: 'player',
			max_characters: 1,
			invited_at: null,
			accepted_at: '2025-01-01T00:00:00.000Z',
			profiles: { full_name: '移轉目標', email: 'transfer@example.test' },
		},
	];

	await page.route('http://127.0.0.1:54321/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const method = request.method();
		requests.push(`${method} ${url.pathname}${url.search}`);

		if (url.pathname === '/auth/v1/signup' && method === 'POST') {
			await route.fulfill({
				json: {
					user: {
						...testUser,
						email: request.postDataJSON().email,
					},
					session: null,
				},
			});
			return;
		}

		if (url.pathname === '/auth/v1/token' && method === 'POST') {
			const body = request.postDataJSON() as { email?: string };
			if (body.email === 'wrong@example.com') {
				await route.fulfill({
					status: 400,
					json: {
						code: 'invalid_credentials',
						message: 'Invalid login credentials',
					},
				});
				return;
			}

			await route.fulfill({
				json: {
					...testSession,
					user: { ...testUser, email: body.email ?? testUser.email },
				},
			});
			return;
		}

		if (
			url.pathname === '/auth/v1/user' &&
			(method === 'PATCH' || method === 'PUT')
		) {
			const body = request.postDataJSON() as {
				email?: string;
				data?: { full_name?: string };
			};
			await route.fulfill({
				json: {
					...testUser,
					email: body.email ?? testUser.email,
					user_metadata: {
						...testUser.user_metadata,
						...body.data,
					},
				},
			});
			return;
		}

		if (url.pathname === '/auth/v1/user' && method === 'GET') {
			await route.fulfill({ json: testUser });
			return;
		}

		if (
			url.pathname === '/functions/v1/create-campaign' &&
			method === 'POST'
		) {
			functionRequests.push(request.postDataJSON());
			if (options.createCampaignError) {
				await route.fulfill({
					status: 500,
					json: { error: options.createCampaignError },
				});
				return;
			}
			await route.fulfill({
				status: 201,
				json: {
					campaign_id: 'mock-created-campaign',
					invite_code: 'SAMPLE1',
					character_id_map: {},
				},
			});
			return;
		}

		if (
			url.pathname === '/rest/v1/rpc/join_campaign_by_invite_code' &&
			method === 'POST'
		) {
			await route.fulfill({
				json: { campaign_id: 'mock-campaign-id', name: '測試戰役' },
			});
			return;
		}

		if (
			url.pathname === '/rest/v1/campaigns' &&
			method === 'GET' &&
			url.searchParams.has('invite_code')
		) {
			await route.fulfill({
				json: { id: 'mock-campaign-id', name: '測試戰役' },
			});
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/campaigns' &&
			method === 'GET'
		) {
			await route.fulfill({
				json: {
					id: campaignInventoryRole
						? 'inventory-campaign'
						: 'settings-campaign',
					name: campaignInventoryRole
						? '背包隔離測試戰役'
						: '隔離測試戰役',
					invite_code: 'TEST42',
				},
			});
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/campaign_members' &&
			method === 'GET'
		) {
			if (url.searchParams.get('select') === 'role') {
				await route.fulfill({
					json: { role: campaignRole },
				});
				return;
			}

			await route.fulfill({ json: campaignMembers });
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/characters' &&
			method === 'GET'
		) {
			await route.fulfill({
				json: campaignInventoryRole
					? inventoryCharacters
					: campaignCharacters,
			});
			return;
		}

		if (
			campaignInventoryRole &&
			url.pathname === '/rest/v1/inventory_items' &&
			method === 'GET'
		) {
			await route.fulfill({ json: inventoryItems });
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/character_permissions' &&
			method === 'GET'
		) {
			await route.fulfill({ json: [] });
			return;
		}

		if (
			url.pathname === '/functions/v1/invite-player' &&
			method === 'POST'
		) {
			await route.fulfill({ status: 200, json: { success: true } });
			return;
		}

		if (url.pathname.startsWith('/rest/v1/rpc/')) {
			await route.fulfill({ status: 200, body: 'null' });
			return;
		}

		if (url.pathname.startsWith('/rest/v1/')) {
			if (method === 'GET') {
				await route.fulfill({ json: [] });
			} else {
				await route.fulfill({ status: 204 });
			}
			return;
		}

		await route.fulfill({
			status: 404,
			json: { message: `未設定測試替身：${method} ${url.pathname}` },
		});
	});

	return { requests, functionRequests };
}
