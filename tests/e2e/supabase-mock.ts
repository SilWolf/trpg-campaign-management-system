import type { Page } from '@playwright/test';
import type { Rarity } from '@/types';

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
		campaignSettingsCharacterOwner?: string;
		campaignSettingsSaveError?: string;
		campaignCharacterUpdateError?: string;
		campaignJourneysSeed?: Record<string, unknown>[];
		campaignJourneyPrivateAccess?: 0 | 1 | 2;
		campaignJourneyWriteError?: string;
		campaignJourneyDmNoteWriteError?: string;
		campaignJourneyDmNotesSeed?: Record<string, unknown>[];
		campaignOfficialCatalogIds?: string[];
		campaignInventoryRole?: CampaignSettingsRole;
		campaignInventoryWalletGp?: { public: number; private: number };
		campaignInventoryTargetGp?: number;
		campaignInventoryThirdCharacter?: boolean;
		extraInventoryItems?: Record<string, unknown>[];
		createCampaignError?: string;
		deleteCampaignCharacterError?: string;
		campaignItemDistributionError?: string;
		campaignItemDistributionDelayMs?: number;
		campaignItemDistributionRequireConfirmationFirst?: boolean;
		blankCampaign?: boolean;
		blacksmithSharedItems?: Record<string, unknown>[];
		blacksmithImportCampaigns?: { id: string; name: string }[];
		blacksmithImportCharacters?: { id: string; name: string }[];
		blacksmithImportError?: string;
		campaignShopSeed?: boolean;
		campaignShopItemIcon?: string;
		campaignShopItemRarity?: Rarity;
		campaignShopItemEffects?: string;
		campaignShopItemUnidentified?: boolean;
		campaignShopItemCount?: number;
		campaignShopWalletGp?: number;
		campaignShopDirectPriceGp?: number;
		campaignShopWalletAccess?: { public: number; private: number };
		campaignShopRpcErrors?: Partial<
			Record<
				| 'purchase_campaign_shop_item'
				| 'request_campaign_shop_item'
				| 'checkout_campaign_shop_cart'
				| 'approve_campaign_shop_order'
				| 'reject_campaign_shop_order'
				| 'cancel_campaign_shop_order'
				| 'refresh_campaign_shop_items',
				string
			>
		>;
	} = {},
) {
	let currentCampaignOfficialCatalogIds =
		options.campaignOfficialCatalogIds ?? ['dnd-2024-srd-5.2'];
	const requests: string[] = [];
	const functionRequests: unknown[] = [];
	const campaignJourneyWrites: unknown[] = [];
	const campaignJourneyDmNoteWrites: unknown[] = [];
	const characterWrites: unknown[] = [];
	const campaignUpdates: unknown[] = [];
	const permissionUpdates: unknown[] = [];
	const blacksmithImportRequests: unknown[] = [];
	const blacksmithItems = [...(options.blacksmithSharedItems ?? [])];
	const campaignShops: Record<string, unknown>[] = options.campaignShopSeed
		? [
				{
					id: 'mock-shop-1',
					campaign_id: 'settings-campaign',
					name: '灰港冒險者商會',
					background_image_url: null,
					is_active: true,
					created_at: '2025-01-01T00:00:00.000Z',
					updated_at: '2025-01-01T00:00:00.000Z',
				},
			]
		: [];
	const shopItemDefinition = {
		name: '治療藥水',
		category: 'Potion',
		subTypes: ['藥水'],
		rarity: options.campaignShopItemRarity ?? 'Common',
		icon: options.campaignShopItemIcon ?? 'FlaskConical',
		weight: 0.5,
		valueGp: 2,
		affixes: [],
		isEquippable: false,
		isConsumable: true,
		isRequireAttunement: false,
		maxCharges: 0,
		...(options.campaignShopItemEffects
			? { effects: options.campaignShopItemEffects }
			: { effects: '' }),
		flavor: '',
		dmNotes: '',
	};
	const shopItemSnapshot = options.campaignShopItemUnidentified
		? {
				category: shopItemDefinition.category,
				subTypes: shopItemDefinition.subTypes,
				weight: shopItemDefinition.weight,
			}
		: shopItemDefinition;
	const campaignShopItems: Record<string, unknown>[] = options.campaignShopSeed
		? [
				{
					id: 'shop-item-direct',
					campaign_id: 'settings-campaign',
					shop_id: 'mock-shop-1',
					item_snapshot: shopItemSnapshot,
					item_identified_snapshot: options.campaignShopItemUnidentified
						? shopItemDefinition
						: null,
					is_identified: !options.campaignShopItemUnidentified,
					unit_price_gp: options.campaignShopDirectPriceGp ?? 2,
					stock_available: 4,
					stock_reserved: 0,
					requires_approval: false,
					is_active: true,
					created_at: '2025-01-01T00:00:00.000Z',
					updated_at: '2025-01-01T00:00:00.000Z',
				},
				{
					id: 'shop-item-review',
					campaign_id: 'settings-campaign',
					shop_id: 'mock-shop-1',
					item_snapshot: {
						...shopItemSnapshot,
						name: '治療藥水（需審查）',
					},
					is_identified: true,
					unit_price_gp: 3,
					stock_available: 4,
					stock_reserved: 0,
					requires_approval: true,
					is_active: true,
					created_at: '2025-01-01T00:00:00.000Z',
					updated_at: '2025-01-01T00:00:00.000Z',
				},
				...Array.from(
					{
						length: Math.max(
							0,
							(options.campaignShopItemCount ?? 2) - 2,
						),
					},
					(_, index) => ({
						id: `shop-item-${index + 3}`,
						campaign_id: 'settings-campaign',
						shop_id: 'mock-shop-1',
						item_snapshot: {
							...shopItemSnapshot,
							name: `測試商品 ${index + 3}`,
						},
						is_identified: true,
						unit_price_gp: index + 4,
						stock_available: 4,
						stock_reserved: 0,
						requires_approval: false,
						is_active: true,
						created_at: '2025-01-01T00:00:00.000Z',
						updated_at: '2025-01-01T00:00:00.000Z',
					}),
				),
			]
		: [];
	const campaignShopOrders: Record<string, unknown>[] = [];
	const campaignShopRpcRequests: { name: string; body: unknown }[] = [];
	let nextShopId = 1;
	let nextShopItemId = 1;
	let nextShopOrderId = 1;
	const campaignSettingsRole = options.campaignSettingsRole;
	const campaignInventoryRole = options.campaignInventoryRole;
	const campaignRole = campaignInventoryRole ?? campaignSettingsRole;
	const campaignJourneys = [...(options.campaignJourneysSeed ?? [])];
	const campaignJourneyDmNotes = [
		...(options.campaignJourneyDmNotesSeed ?? []),
	];
	const campaignCharacters = [
		{
			id: 'settings-character',
			name: '測試冒險者',
			title: '遊俠',
			str: 14,
			avatar: '🏹',
			user_id:
				options.campaignSettingsCharacterOwner ??
				(campaignSettingsRole === 'player' ? testUser.id : 'other-player-id'),
			campaign_id: 'settings-campaign',
			gp: 0,
			private_gp: 0,
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
			gp: 0,
			private_gp: 0,
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
			gp: options.campaignInventoryWalletGp?.public ?? 20,
			private_gp: options.campaignInventoryWalletGp?.private ?? 80,
			currencies: {
				pp: 0,
				gp: Math.floor(options.campaignInventoryWalletGp?.public ?? 20),
				ep: 0,
				sp: 0,
				cp: Math.round(
					((options.campaignInventoryWalletGp?.public ?? 20) % 1) * 100,
				),
			},
			private_currencies: {
				pp: 0,
				gp: Math.floor(options.campaignInventoryWalletGp?.private ?? 80),
				ep: 0,
				sp: 0,
				cp: Math.round(
					((options.campaignInventoryWalletGp?.private ?? 80) % 1) * 100,
				),
			},
		},
		{
			id: 'inventory-target-character',
			name: '移轉目標',
			title: '吟遊詩人',
			str: 10,
			avatar: '🎻',
			user_id: 'transfer-player-id',
			campaign_id: 'inventory-campaign',
			gp: options.campaignInventoryTargetGp ?? 0,
			private_gp: 0,
			currencies: {
				pp: 0,
				gp: Math.floor(options.campaignInventoryTargetGp ?? 0),
				ep: 0,
				sp: 0,
				cp: Math.round(((options.campaignInventoryTargetGp ?? 0) % 1) * 100),
			},
			private_currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		},
	];
	if (options.campaignInventoryThirdCharacter) {
		inventoryCharacters.push({
			id: 'inventory-third-character',
			name: '第三名角色',
			title: '法師',
			str: 10,
			avatar: '🧙',
			user_id: 'third-player-id',
			campaign_id: 'inventory-campaign',
			gp: 0,
			private_gp: 0,
			currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
			private_currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		});
	}
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
	let nextDispatchInventoryId = 1;
	let dispatchConfirmationReturned = false;
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
		if (
			url.pathname === '/rest/v1/characters' &&
			(method === 'POST' || method === 'PATCH')
		) {
			characterWrites.push(request.postDataJSON());
		}
		if (
			url.pathname === '/rest/v1/character_permissions' &&
			method === 'POST'
		) {
			permissionUpdates.push(request.postDataJSON());
		}

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
			url.pathname === '/functions/v1/delete-campaign-character' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as {
				campaignId: string;
				characterId: string;
			};
			functionRequests.push({
				name: 'delete-campaign-character',
				body,
			});
			if (options.deleteCampaignCharacterError) {
				await route.fulfill({
					status: 403,
					json: { error: options.deleteCampaignCharacterError },
				});
				return;
			}
			await route.fulfill({
				json: { deleted: true, characterId: body.characterId },
			});
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
			url.pathname === '/functions/v1/campaign-shop-purchase' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as {
				campaignId: string;
				shopId: string;
				characterId: string;
				walletType: string;
				items: { shopItemId: string; quantity: number }[];
			};
			functionRequests.push({ name: 'campaign-shop-purchase', body });
			const rpcBody = {
				p_campaign_id: body.campaignId,
				p_shop_id: body.shopId,
				p_character_id: body.characterId,
				p_wallet_type: body.walletType,
				p_items: body.items.map((item) => ({
					shop_item_id: item.shopItemId,
					quantity: item.quantity,
				})),
			};
			campaignShopRpcRequests.push({
				name: 'checkout_campaign_shop_cart',
				body: rpcBody,
			});
			const rpcError = options.campaignShopRpcErrors?.checkout_campaign_shop_cart;
			if (rpcError) {
				await route.fulfill({ status: 400, json: { error: rpcError } });
				return;
			}
			const checkoutId = `mock-shop-checkout-${nextShopOrderId++}`;
			const requiresApproval = body.items.some((line) =>
				campaignShopItems.find((item) => item.id === line.shopItemId)
					?.requires_approval,
			);
			for (const line of body.items) {
				const item = campaignShopItems.find(
					(row) => row.id === line.shopItemId,
				);
				if (!item || Number(item.stock_available) < line.quantity) {
					await route.fulfill({
						status: 409,
						json: { error: '商品不存在或庫存不足。' },
					});
					return;
				}
				item.stock_available = Number(item.stock_available) - line.quantity;
				if (requiresApproval) {
					item.stock_reserved = Number(item.stock_reserved) + line.quantity;
				}
				campaignShopOrders.push({
					id: `mock-shop-order-${nextShopOrderId++}`,
					checkout_id: checkoutId,
					campaign_id: body.campaignId,
					shop_id: item.shop_id,
					shop_item_id: item.id,
					character_id: body.characterId,
					item_snapshot: item.item_snapshot,
					is_identified: item.is_identified,
					shop_name_snapshot: '灰港冒險者商會',
					unit_price_gp: item.unit_price_gp,
					quantity: line.quantity,
					total_price_gp: Number(item.unit_price_gp) * line.quantity,
					status: requiresApproval ? 'pending' : 'completed',
					requires_approval: requiresApproval,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					reviewed_at: null,
				});
			}
			await route.fulfill({ json: { checkoutId } });
			return;
		}

		if (
			url.pathname === '/functions/v1/identify-inventory-item' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as {
				campaignId: string;
				itemId: string;
			};
			functionRequests.push({ name: 'identify-inventory-item', body });
			await route.fulfill({ json: { itemId: body.itemId } });
			return;
		}

		if (
			url.pathname === '/functions/v1/dispatch-campaign-items' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as {
				requestId: string;
				campaignId: string;
				ownerId: string;
				isPrivate: boolean;
				items: {
					itemBase: Record<string, unknown>;
					blacksmithItemId: string | null;
					isHomebrew: boolean;
					isImportant: boolean;
					quantity: number;
				}[];
			};
			functionRequests.push({ name: 'dispatch-campaign-items', body });
			if (
				options.campaignItemDistributionRequireConfirmationFirst &&
				!body.confirmLargeBatch &&
				!dispatchConfirmationReturned
			) {
				dispatchConfirmationReturned = true;
				await route.fulfill({
					json: { requiresConfirmation: true, predictedInsertCount: 11 },
				});
				return;
			}
			if (options.campaignItemDistributionError) {
				await route.fulfill({
					status: 409,
					json: { error: options.campaignItemDistributionError },
				});
				return;
			}
			const inventoryIds: string[] = [];
			for (const line of body.items) {
				const itemBase = line.itemBase;
				const weaponProperties =
					typeof itemBase.weaponProperties === 'object' &&
					itemBase.weaponProperties !== null
						? (itemBase.weaponProperties as Record<string, unknown>)
						: null;
				const armorProperties =
					typeof itemBase.armorProperties === 'object' &&
					itemBase.armorProperties !== null
						? (itemBase.armorProperties as Record<string, unknown>)
						: null;
				const rowCount = itemBase.isStackable === true ? 1 : line.quantity;
				for (let index = 0; index < rowCount; index += 1) {
					const id = `dispatch-inventory-${nextDispatchInventoryId++}`;
					inventoryIds.push(id);
					inventoryItems.push({
						id,
						campaign_id: body.campaignId,
						owner_id: body.ownerId,
						blacksmith_item_id: line.blacksmithItemId,
						slot: 0,
						name: itemBase.name,
						category: itemBase.category,
						sub_type: Array.isArray(itemBase.subTypes)
							? itemBase.subTypes[0] ?? ''
							: '',
						rarity: itemBase.rarity,
						icon: itemBase.icon ?? 'Package',
						damage: weaponProperties?.damage ?? null,
						mastery: weaponProperties?.mastery ?? 'None',
						ac: armorProperties?.ac ?? null,
						weight: itemBase.weight,
						value_gp: itemBase.valueGp,
						quantity: itemBase.isStackable === true ? line.quantity : 1,
						equipped: false,
						requires_attunement: itemBase.isRequireAttunement,
						attuned: false,
						is_homebrew: line.isHomebrew,
						is_identified: true,
						charges: 0,
						max_charges: itemBase.maxCharges ?? 0,
						effects: itemBase.effects,
						flavor: itemBase.flavor ?? '',
						dm_notes: itemBase.dmNotes,
						player_notes: '',
						is_private: body.ownerId === 'camp-chest' ? false : body.isPrivate,
						is_equippable: itemBase.isEquippable,
						is_consumable: itemBase.isConsumable,
						is_important: line.isImportant,
						affixes: itemBase.affixes,
						item_base: itemBase,
					});
				}
			}
			if (options.campaignItemDistributionDelayMs) {
				await new Promise((resolve) =>
					setTimeout(resolve, options.campaignItemDistributionDelayMs),
				);
			}
			await route.fulfill({
				json: {
					operationId: body.requestId,
					insertedCount: inventoryIds.length,
					updatedCount: 0,
					inventoryIds,
					replayed: false,
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
			url.pathname === '/rest/v1/rpc/import_blacksmith_item' &&
			method === 'POST'
		) {
			blacksmithImportRequests.push(request.postDataJSON());
			if (options.blacksmithImportError) {
				await route.fulfill({
					status: 400,
					json: { message: options.blacksmithImportError },
				});
				return;
			}
			await route.fulfill({ json: 'new-imported-item-id' });
			return;
		}

		if (
			url.pathname === '/rest/v1/campaigns' &&
			method === 'GET' &&
			url.searchParams.get('select') === 'id,name' &&
			url.searchParams.has('dm_id')
		) {
			await route.fulfill({
				json: options.blacksmithImportCampaigns ?? [
					{ id: 'dm-campaign', name: 'DM 測試戰役' },
				],
			});
			return;
		}

		if (
			url.pathname === '/rest/v1/characters' &&
			method === 'GET' &&
			url.searchParams.get('select') === 'id,name' &&
			url.searchParams.has('campaign_id')
		) {
			await route.fulfill({
				json: options.blacksmithImportCharacters ?? [
					{ id: 'dm-character', name: '接收角色' },
				],
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

		if (url.pathname === '/rest/v1/blacksmith_items') {
			const matchesFilter = (row: Record<string, unknown>, key: string) => {
				const filter = url.searchParams.get(key);
				if (!filter) return true;
				const [operator, value] = filter.split('.', 2);
				if (operator === 'eq') return String(row[key] ?? '') === value;
				if (operator === 'neq') return String(row[key] ?? '') !== value;
				return false;
			};
			if (method === 'POST' || method === 'PATCH') {
				const payload = request.postDataJSON() as Record<string, unknown>;
				if (payload.mastery === null) {
					await route.fulfill({
						status: 400,
						json: {
							message: 'null value in column "mastery" of relation "blacksmith_items" violates not-null constraint',
						},
					});
					return;
				}
			}
			if (method === 'GET') {
				await route.fulfill({
					json: blacksmithItems.filter((row) =>
						['owner_id', 'is_shared'].every((key) => matchesFilter(row, key)),
					),
				});
				return;
			}
			if (method === 'POST') {
				const payload = request.postDataJSON() as Record<string, unknown>;
				if (typeof payload.id !== 'string' || typeof payload.owner_id !== 'string') {
					await route.fulfill({
						status: 400,
						json: { message: '樣板 ID 與作者 ID 為必要欄位' },
					});
					return;
				}
				const row = {
					...payload,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				};
				blacksmithItems.push(row);
				await route.fulfill({ status: 201, json: row });
				return;
			}
			if (method === 'PATCH') {
				const idFilter = url.searchParams.get('id')?.slice('eq.'.length);
				const ownerFilter = url.searchParams
					.get('owner_id')
					?.slice('eq.'.length);
				const row = blacksmithItems.find(
					(item) => item.id === idFilter && item.owner_id === ownerFilter,
				);
				if (!row) {
					await route.fulfill({
						status: 404,
						json: { message: '找不到鍛造樣板' },
					});
					return;
				}
				Object.assign(row, request.postDataJSON(), {
					updated_at: new Date().toISOString(),
				});
				await route.fulfill({ json: row });
				return;
			}
			if (method === 'DELETE') {
				const idFilter = url.searchParams.get('id')?.slice('eq.'.length);
				const ownerFilter = url.searchParams
					.get('owner_id')
					?.slice('eq.'.length);
				const index = blacksmithItems.findIndex(
					(item) => item.id === idFilter && item.owner_id === ownerFilter,
				);
				if (index < 0) {
					await route.fulfill({
						status: 404,
						json: { message: '找不到鍛造樣板' },
					});
					return;
				}
				blacksmithItems.splice(index, 1);
				await route.fulfill({ status: 204 });
				return;
			}
		}

		if (
			url.pathname === '/rest/v1/campaign_shops' ||
			url.pathname === '/rest/v1/campaign_shop_items'
		) {
			const rows =
				url.pathname === '/rest/v1/campaign_shops'
					? campaignShops
					: campaignShopItems;
			const matchesCampaign = (row: Record<string, unknown>) => {
				const filter = url.searchParams.get('campaign_id');
				const id = url.searchParams.get('id')?.slice('eq.'.length);
				const shopId = url.searchParams.get('shop_id')?.slice('eq.'.length);
				return (
					(!filter || String(row.campaign_id) === filter.slice('eq.'.length)) &&
					(!id || String(row.id) === id) &&
					(!shopId || String(row.shop_id) === shopId)
				);
			};
			if (method === 'GET') {
				const filteredRows = rows.filter(matchesCampaign);
				if (
					request.headers().accept?.includes(
						'application/vnd.pgrst.object+json',
					)
				) {
					await route.fulfill({
						json: filteredRows[0] ?? null,
						status: filteredRows.length === 1 ? 200 : 406,
					});
					return;
				}
				await route.fulfill({
					json: filteredRows,
				});
				return;
			}
			if (method === 'POST') {
				const payload: unknown = request.postDataJSON();
				const values = Array.isArray(payload) ? payload : [payload];
				const inserted = values.map((value) => {
					const row = value as Record<string, unknown>;
					const isShop = url.pathname === '/rest/v1/campaign_shops';
					const saved = {
						...row,
						id: isShop
							? `mock-shop-${nextShopId++}`
							: `mock-shop-item-${nextShopItemId++}`,
						stock_reserved: row.stock_reserved ?? 0,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					};
					rows.push(saved);
					return saved;
				});
				await route.fulfill({
					status: 201,
					json: Array.isArray(payload) ? inserted : inserted[0],
				});
				return;
			}
			if (method === 'PATCH') {
				const idFilter =
					url.searchParams.get('id')?.slice('eq.'.length) ?? '';
				const row = rows.find(
					(item) => item.id === idFilter && matchesCampaign(item),
				);
				if (!row) {
					await route.fulfill({
						status: 404,
						json: { message: '找不到商店資料' },
					});
					return;
				}
				Object.assign(row, request.postDataJSON(), {
					updated_at: new Date().toISOString(),
				});
				await route.fulfill({ json: row });
				return;
			}
			if (method === 'DELETE') {
				const idFilter =
					url.searchParams.get('id')?.slice('eq.'.length) ?? '';
				const index = rows.findIndex(
					(item) => item.id === idFilter && matchesCampaign(item),
				);
				if (index < 0) {
					await route.fulfill({
						status: 404,
						json: { message: '找不到商店商品' },
					});
					return;
				}
				rows.splice(index, 1);
				await route.fulfill({ status: 204 });
				return;
			}
		}

		if (
			url.pathname === '/rest/v1/rpc/get_campaign_character_wallets' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as {
				p_campaign_id?: string;
				p_character_ids?: string[] | null;
			};
			const isInventoryCampaign =
				body.p_campaign_id === 'inventory-campaign';
			const role = isInventoryCampaign
				? campaignInventoryRole
				: campaignSettingsRole;
			const rows = isInventoryCampaign ? inventoryCharacters : campaignCharacters;
			const requestedIds = Array.isArray(body.p_character_ids)
				? new Set(body.p_character_ids)
				: null;
			const wallets = (options.blankCampaign ? [] : rows).flatMap((character) => {
				if (
					character.campaign_id !== body.p_campaign_id ||
					(requestedIds && !requestedIds.has(character.id))
				) {
					return [];
				}
				const isDm = role === 'dm';
				const isOwner = character.user_id === testUser.id;
				const isDefaultPublicRead =
					isInventoryCampaign || character.user_id !== testUser.id;
				const walletAccess =
					options.campaignShopWalletAccess ??
					{ public: 1, private: 0 };
				const canReadPublic =
					isDm ||
					isOwner ||
					(isDefaultPublicRead && walletAccess.public >= 1);
				const canReadPrivate =
					isDm ||
					isOwner ||
					(!isInventoryCampaign && walletAccess.private >= 1);
				const publicBalance = isInventoryCampaign
					? character.id === 'inventory-character'
						? (options.campaignInventoryWalletGp?.public ?? 20)
						: character.id === 'inventory-target-character'
							? (options.campaignInventoryTargetGp ?? 0)
							: 0
					: (options.campaignShopWalletGp ?? 0);
				const privateBalance =
					isInventoryCampaign && character.id === 'inventory-character'
						? (options.campaignInventoryWalletGp?.private ?? 80)
						: isInventoryCampaign
							? 0
							: (options.campaignShopWalletGp ?? 0);
				return [
					...(canReadPublic
						? [
								{
									character_id: character.id,
									wallet_type: 'public',
									balance_gp: publicBalance,
								},
							]
						: []),
					...(canReadPrivate
						? [
								{
									character_id: character.id,
									wallet_type: 'private',
									balance_gp: privateBalance,
								},
							]
						: []),
				];
			});
			await route.fulfill({ json: wallets });
			return;
		}

		if (
			url.pathname === '/rest/v1/rpc/transfer_campaign_currency' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as Record<string, unknown>;
			campaignShopRpcRequests.push({
				name: 'transfer_campaign_currency',
				body,
			});
			const amountCents = Number(body.p_amount_cents);
			const recipientCount =
				body.p_target_character_id === null
					? options.campaignInventoryThirdCharacter
						? 2
						: 1
					: 1;
			await route.fulfill({
				json: {
					operationId: `mock-currency-transfer-${campaignShopRpcRequests.length}`,
					shareCents:
						body.p_target_character_id === null
							? Math.floor(amountCents / recipientCount)
							: amountCents,
					remainderCents:
						body.p_target_character_id === null
							? amountCents % recipientCount
							: 0,
					recipientCount,
				},
			});
			return;
		}

		if (
			url.pathname === '/rest/v1/rpc/make_inventory_item_public' &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as Record<string, unknown>;
			campaignShopRpcRequests.push({
				name: 'make_inventory_item_public',
				body,
			});
			await route.fulfill({ json: null });
			return;
		}

		if (
			url.pathname.startsWith('/rest/v1/rpc/') &&
			[
				'save_campaign_shop_item',
				'load_campaign_shop_item_definitions',
				'purchase_campaign_shop_item',
				'request_campaign_shop_item',
				'checkout_campaign_shop_cart',
				'approve_campaign_shop_order',
				'reject_campaign_shop_order',
				'cancel_campaign_shop_order',
				'refresh_campaign_shop_items',
			].some((name) => url.pathname.endsWith(`/${name}`))
		) {
			const rpcName = url.pathname.split('/').pop() ?? '';
			const body = request.postDataJSON() as Record<string, unknown>;
			campaignShopRpcRequests.push({ name: rpcName, body });
			const rpcError =
				options.campaignShopRpcErrors?.[
					rpcName as keyof NonNullable<typeof options.campaignShopRpcErrors>
				];
			if (rpcError) {
				await route.fulfill({ status: 400, json: { message: rpcError } });
				return;
			}
			if (rpcName === 'load_campaign_shop_item_definitions') {
				await route.fulfill({
					json: campaignShopItems
						.filter(
							(item) =>
								item.campaign_id === body.p_campaign_id &&
								item.shop_id === body.p_shop_id &&
								item.is_identified === false,
						)
						.map((item) => ({
							item_id: item.id,
							item_snapshot: item.item_identified_snapshot,
						})),
				});
				return;
			}
			if (rpcName === 'save_campaign_shop_item') {
				const itemId =
					typeof body.p_item_id === 'string'
						? body.p_item_id
						: `mock-shop-item-${nextShopItemId++}`;
				const snapshot = body.p_item_snapshot as Record<string, unknown>;
				const isIdentified = snapshot.is_identified !== false;
				const nestedBase = snapshot.item_base as
					| Record<string, unknown>
					| undefined;
				const base = nestedBase ?? snapshot;
				const fullSnapshot = {
					...Object.fromEntries(
						Object.entries(snapshot).filter(
							([key]) => key !== 'is_identified' && key !== 'item_base',
						),
					),
					...Object.fromEntries(
						Object.entries(base).filter(
							([key]) => key !== 'is_identified' && key !== 'item_base',
						),
					),
				};
				const rowSnapshot = isIdentified
					? fullSnapshot
					: {
							category: base?.category ?? 'Misc',
							subTypes: base?.subTypes ?? [],
							weight: base?.weight ?? 0,
						};
				const saved = {
					id: itemId,
					campaign_id: body.p_campaign_id,
					shop_id: body.p_shop_id,
					item_snapshot: rowSnapshot,
					item_identified_snapshot: isIdentified ? null : fullSnapshot,
					is_identified: isIdentified,
					unit_price_gp: body.p_unit_price_gp,
					stock_available: body.p_stock_available,
					stock_reserved: 0,
					requires_approval: body.p_requires_approval,
					is_active: body.p_is_active,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				};
				const existingIndex = campaignShopItems.findIndex(
					(item) => item.id === itemId,
				);
				if (existingIndex < 0) campaignShopItems.push(saved);
				else campaignShopItems[existingIndex] = saved;
				await route.fulfill({ json: itemId });
				return;
			}
			if (rpcName === 'refresh_campaign_shop_items') {
				const changes = Array.isArray(body.p_changes) ? body.p_changes : [];
				const keepItems = body.p_keep_items === true;
				let deleted = 0;
				if (!keepItems) {
					for (let index = campaignShopItems.length - 1; index >= 0; index -= 1) {
						const item = campaignShopItems[index];
						if (
							item.campaign_id === body.p_campaign_id &&
							item.shop_id === body.p_shop_id
						) {
							campaignShopItems.splice(index, 1);
							deleted += 1;
						}
					}
				}
				for (const rawChange of changes) {
					const change = rawChange as Record<string, unknown>;
					const snapshot = change.item_snapshot as Record<string, unknown>;
					const base = snapshot.item_base as
						| Record<string, unknown>
						| undefined;
					campaignShopItems.push({
						id: `shop-refresh-item-${nextShopItemId++}`,
						campaign_id: body.p_campaign_id,
						shop_id: body.p_shop_id,
						item_snapshot: base
							? {
									...Object.fromEntries(
										Object.entries(snapshot).filter(
											([key]) =>
												key !== 'item_base' && key !== 'is_identified',
										),
									),
									...base,
								}
							: snapshot,
						is_identified: true,
						unit_price_gp: change.unit_price_gp,
						stock_available: change.stock_available,
						stock_reserved: 0,
						requires_approval: false,
						is_active: true,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					});
				}
				await route.fulfill({
					json: {
						created: changes.length,
						deleted,
					},
				});
				return;
			}
			if (
				rpcName === 'purchase_campaign_shop_item' ||
				rpcName === 'request_campaign_shop_item'
			) {
				const item = campaignShopItems.find(
					(row) => row.id === body.p_shop_item_id,
				);
				if (!item) {
					await route.fulfill({
						status: 400,
						json: { message: '找不到測試商店商品' },
					});
					return;
				}
				const quantity = Number(body.p_quantity);
				item.stock_available = Number(item.stock_available) - quantity;
				const isPending = rpcName === 'request_campaign_shop_item';
				if (isPending) {
					item.stock_reserved = Number(item.stock_reserved) + quantity;
				}
				const orderId = `mock-shop-order-${nextShopOrderId++}`;
				campaignShopOrders.push({
					id: orderId,
					checkout_id: null,
					campaign_id: body.p_campaign_id,
					shop_id: item.shop_id,
					shop_item_id: item.id,
					character_id: body.p_character_id,
					item_snapshot: item.item_snapshot,
					is_identified: item.is_identified,
					shop_name_snapshot: '灰港冒險者商會',
					unit_price_gp: item.unit_price_gp,
					quantity,
					total_price_gp: Number(item.unit_price_gp) * quantity,
					status: isPending ? 'pending' : 'completed',
					requires_approval: isPending,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					reviewed_at: null,
				});
				await route.fulfill({ json: orderId });
				return;
			}

			if (rpcName === 'checkout_campaign_shop_cart') {
				const checkoutId = `mock-shop-checkout-${nextShopOrderId++}`;
				const cartLines = body.p_items as
					| { shop_item_id: string; quantity: number }[]
					| undefined;
				if (!cartLines?.length) {
					await route.fulfill({
						status: 400,
						json: { message: '購物車沒有商品' },
					});
					return;
				}
				const requiresApproval = cartLines.some((line) =>
					campaignShopItems.find((item) => item.id === line.shop_item_id)
						?.requires_approval,
				);
				for (const line of cartLines) {
					const item = campaignShopItems.find(
						(row) => row.id === line.shop_item_id,
					);
					if (!item) {
						await route.fulfill({
							status: 400,
							json: { message: '找不到測試商店商品' },
						});
						return;
					}
					const quantity = Number(line.quantity);
					item.stock_available = Number(item.stock_available) - quantity;
					if (requiresApproval) {
						item.stock_reserved = Number(item.stock_reserved) + quantity;
					}
					campaignShopOrders.push({
						id: `mock-shop-order-${nextShopOrderId++}`,
						checkout_id: checkoutId,
						campaign_id: body.p_campaign_id,
						shop_id: item.shop_id,
						shop_item_id: item.id,
						character_id: body.p_character_id,
						item_snapshot: item.item_snapshot,
						is_identified: item.is_identified,
						shop_name_snapshot: '灰港冒險者商會',
						unit_price_gp: item.unit_price_gp,
						quantity,
						total_price_gp: Number(item.unit_price_gp) * quantity,
						status: requiresApproval ? 'pending' : 'completed',
						requires_approval: requiresApproval,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
						reviewed_at: null,
					});
				}
				await route.fulfill({ json: checkoutId });
				return;
			}

			const order = campaignShopOrders.find(
				(row) => row.id === body.p_order_id,
			);
			if (order) {
				const group = campaignShopOrders.filter(
					(entry) =>
						(order.checkout_id && entry.checkout_id === order.checkout_id) ||
						(!order.checkout_id && entry.id === order.id),
				);
				for (const groupOrder of group) {
					const item = campaignShopItems.find(
						(row) => row.id === groupOrder.shop_item_id,
					);
					if (item && groupOrder.status === 'pending') {
						item.stock_reserved =
							Number(item.stock_reserved) - Number(groupOrder.quantity);
						if (
							rpcName === 'reject_campaign_shop_order' ||
							rpcName === 'cancel_campaign_shop_order'
						) {
							item.stock_available =
								Number(item.stock_available) + Number(groupOrder.quantity);
							groupOrder.status =
								rpcName === 'reject_campaign_shop_order'
									? 'rejected'
									: 'cancelled';
						} else {
							groupOrder.status = 'completed';
						}
						groupOrder.updated_at = new Date().toISOString();
					}
				}
			}
			await route.fulfill({ json: String(body.p_order_id ?? '') });
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/campaigns' &&
			method === 'GET'
		) {
			if (url.searchParams.get('select') === 'camp_chest_gp') {
				await route.fulfill({
					json: { camp_chest_gp: 0 },
				});
				return;
			}
			if (!url.searchParams.has('id')) {
				await route.fulfill({ json: [] });
				return;
			}
			await route.fulfill({
				json: {
					id: campaignInventoryRole
						? 'inventory-campaign'
						: 'settings-campaign',
					name: campaignInventoryRole
						? '背包隔離測試戰役'
						: '隔離測試戰役',
					invite_code: 'TEST42',
					official_catalog_ids: currentCampaignOfficialCatalogIds,
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
				json: options.blankCampaign
					? []
					: campaignInventoryRole
					? inventoryCharacters
					: campaignCharacters,
			});
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/characters' &&
			method === 'PATCH'
		) {
			if (options.campaignCharacterUpdateError) {
				await route.fulfill({
					status: 403,
					json: { message: options.campaignCharacterUpdateError },
				});
				return;
			}
			const characterId = url.searchParams.get('id')?.slice('eq.'.length);
			const character = campaignCharacters.find((row) => row.id === characterId);
			if (!character) {
				await route.fulfill({ json: null });
				return;
			}
			Object.assign(character, request.postDataJSON());
			await route.fulfill({
				json: { id: character.id },
			});
			return;
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/characters' &&
			method === 'POST'
		) {
			await route.fulfill({
				status: 201,
				json: request.postDataJSON(),
			});
			return;
		}

		if (
			campaignInventoryRole &&
			url.pathname === '/rest/v1/inventory_items' &&
			method === 'GET'
		) {
			await route.fulfill({
				json: options.blankCampaign
					? []
					: [...inventoryItems, ...(options.extraInventoryItems ?? [])],
			});
			return;
		}

		if (
			url.pathname === '/rest/v1/inventory_items' &&
			(method === 'POST' || method === 'PATCH')
		) {
			const payload: unknown = request.postDataJSON();
			const rows = Array.isArray(payload) ? payload : [payload];
			if (rows.some((row) => row.mastery === null)) {
				await route.fulfill({
					status: 400,
					json: {
						message: 'null value in column "mastery" of relation "inventory_items" violates not-null constraint',
					},
				});
				return;
			}
		}

		if (
			campaignRole &&
			url.pathname === '/rest/v1/character_permissions' &&
			method === 'GET'
		) {
			if (options.campaignJourneyPrivateAccess !== undefined) {
				await route.fulfill({
					json: [
						{
							id: 'journey-access-permission',
							campaign_id: 'settings-campaign',
							character_id: 'second-settings-character',
							user_id: testUser.id,
							public_bag_access: 1,
							private_bag_access: 0,
							public_wallet_access: 1,
							private_wallet_access: 0,
							journey_access: options.campaignJourneyPrivateAccess,
							can_edit_profile: false,
							can_delete_character: false,
							can_manage_permissions: false,
						},
					],
				});
				return;
			}
			await route.fulfill({
				json: options.campaignShopWalletAccess
					? [
							{
								character_id: 'settings-character',
								public_wallet_access:
									options.campaignShopWalletAccess.public,
								private_wallet_access:
									options.campaignShopWalletAccess.private,
							},
						]
					: [],
			});
			return;
		}

		if (url.pathname === '/rest/v1/campaign_journeys') {
			if (options.campaignJourneyWriteError && method !== 'GET') {
				await route.fulfill({
					status: 400,
					json: { message: options.campaignJourneyWriteError, code: '42501' },
				});
				return;
			}
			if (method === 'GET') {
				const visibleJourneys = campaignJourneys.filter((journey) => {
					if (journey.campaign_id !== 'settings-campaign') return false;
					if (journey.visibility !== 'private') return true;
					if (campaignSettingsRole === 'dm') return true;
					if (journey.character_id === 'settings-character') return true;
					return (options.campaignJourneyPrivateAccess ?? 0) >= 1;
				});
				await route.fulfill({ json: visibleJourneys });
				return;
			}
			if (method === 'POST') {
				const body = request.postDataJSON() as Record<string, unknown>;
				campaignJourneyWrites.push(body);
				const journey = {
					id: `mock-journey-${campaignJourneys.length + 1}`,
					campaign_id: 'settings-campaign',
					title: '',
					tags: '',
					content: '',
					character_id: null,
					created_by: testUser.id,
					created_at: new Date().toISOString(),
					is_quest: false,
					is_completed: false,
					visibility: 'public',
					...body,
				};
				campaignJourneys.push(journey);
				await route.fulfill({ status: 201, json: journey });
				return;
			}
			if (method === 'PATCH') {
				campaignJourneyWrites.push(request.postDataJSON());
				const journeyId = url.searchParams.get('id')?.replace('eq.', '');
				const journey = campaignJourneys.find((row) => row.id === journeyId);
				if (!journey) {
					await route.fulfill({ status: 404, json: { message: '筆記不存在。' } });
					return;
				}
				Object.assign(journey, request.postDataJSON());
				await route.fulfill({ json: journey });
				return;
			}
			if (method === 'DELETE') {
				const journeyId = url.searchParams.get('id')?.replace('eq.', '');
				const journeyIndex = campaignJourneys.findIndex(
					(row) => row.id === journeyId,
				);
				if (journeyIndex < 0) {
					await route.fulfill({ json: null });
					return;
				}
				const [deletedJourney] = campaignJourneys.splice(journeyIndex, 1);
				await route.fulfill({ json: { id: deletedJourney.id } });
				return;
			}
		}

		if (url.pathname === '/rest/v1/campaign_journey_dm_notes') {
			if (campaignSettingsRole !== 'dm') {
				await route.fulfill({
					status: 403,
					json: { message: 'Only campaign DMs can access DM journey notes.' },
				});
				return;
			}
			if (options.campaignJourneyDmNoteWriteError && method !== 'GET') {
				await route.fulfill({
					status: 400,
					json: {
						message: options.campaignJourneyDmNoteWriteError,
						code: '42501',
					},
				});
				return;
			}
			if (method === 'GET') {
				const journeyId = url.searchParams
					.get('journey_id')
					?.replace('eq.', '');
				const note = campaignJourneyDmNotes.find(
					(row) =>
						row.campaign_id === 'settings-campaign' &&
						row.journey_id === journeyId,
				);
				await route.fulfill({ json: note ?? null });
				return;
			}
			if (method === 'POST' || method === 'PATCH') {
				const body = request.postDataJSON() as Record<string, unknown>;
				campaignJourneyDmNoteWrites.push(body);
				const note = campaignJourneyDmNotes.find(
					(row) =>
						row.campaign_id === body.campaign_id &&
						row.journey_id === body.journey_id,
				);
				if (note) Object.assign(note, body);
				else campaignJourneyDmNotes.push(body);
				await route.fulfill({
					status: method === 'POST' ? 201 : 200,
					json: note ?? body,
				});
				return;
			}
		}

		if (
			url.pathname === '/rest/v1/campaign_shop_orders' &&
			method === 'GET'
		) {
			await route.fulfill({ json: campaignShopOrders });
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
			if (
				url.pathname === '/rest/v1/campaigns' &&
				(method === 'PATCH' || method === 'POST')
			) {
				const body = request.postDataJSON() as Record<string, unknown>;
				campaignUpdates.push(body);
				if ('name' in body && options.campaignSettingsSaveError) {
					await route.fulfill({
						status: 400,
						json: { message: options.campaignSettingsSaveError },
					});
					return;
				}
				if (Array.isArray(body.official_catalog_ids)) {
					currentCampaignOfficialCatalogIds = body.official_catalog_ids as string[];
					await route.fulfill({
						json: { official_catalog_ids: body.official_catalog_ids },
					});
					return;
				}
			}
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

	return {
		requests,
		functionRequests,
		campaignUpdates,
		permissionUpdates,
		characterWrites,
		blacksmithImportRequests,
		campaignShopRpcRequests,
		campaignJourneyWrites,
		campaignJourneyDmNoteWrites,
		setCampaignOfficialCatalogIds: (catalogIds: string[]) => {
			currentCampaignOfficialCatalogIds = catalogIds;
		},
	};
}
