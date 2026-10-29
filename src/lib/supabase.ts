import { createClient } from '@supabase/supabase-js';
import {
	getItemArmorClass,
	getItemDamage,
	getItemWeaponMastery,
	resolveItemFlags,
	type AllItem,
	type Character,
	type CharacterPermission,
	type CurrencyType,
	type LegacyCurrencyWallet,
	type CampaignJourney,
	type CampaignJourneyDmNote,
	type CampaignJourneyVisibility,
	type BlacksmithTemplate,
	type CampaignShop,
	type CampaignShopItem,
	type CampaignShopItemSnapshot,
	type CampaignShopOrder,
	type CampaignShopOrderStatus,
	type CampaignShopRefreshPolicy,
	type InventoryItem,
	type ItemBaseCategory,
	type ItemBaseRarity,
	type WeaponItemMastery,
} from '@/types';
import { normalizeCampaignShopRefreshPolicy } from '@/lib/campaignShopRefresh';
import { normalizeAvatarReference } from '@/lib/imageReferences';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
	string | undefined;

const ITEM_BASE_CATEGORIES: readonly ItemBaseCategory[] = [
	'Weapon',
	'Armor',
	'Potion',
	'Poison',
	'Ring',
	'Rod',
	'Scroll',
	'Staff',
	'Wand',
	'WondrousItem',
	'TradeGood',
	'Gemstone',
	'Tool',
	'AdventureGear',
	'FoodAndDrink',
	'Mount',
	'Vehicle',
	'Misc',
];
const WEAPON_MASTERIES: readonly WeaponItemMastery[] = [
	'Cleave',
	'Graze',
	'Nick',
	'Push',
	'Sap',
	'Slow',
	'Topple',
	'Vex',
];
const ITEM_BASE_RARITIES: readonly ItemBaseRarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCanonicalItemBase(value: unknown): AllItem | null {
	if (
		!isRecord(value) ||
		!ITEM_BASE_CATEGORIES.includes(value.category as ItemBaseCategory) ||
		typeof value.name !== 'string' ||
		!Array.isArray(value.subTypes) ||
		!value.subTypes.every((entry) => typeof entry === 'string') ||
		!ITEM_BASE_RARITIES.includes(value.rarity as ItemBaseRarity) ||
		typeof value.weight !== 'number' ||
		!Number.isFinite(value.weight) ||
		value.weight < 0 ||
		typeof value.valueGp !== 'number' ||
		!Number.isFinite(value.valueGp) ||
		value.valueGp < 0 ||
		!Array.isArray(value.affixes) ||
		!value.affixes.every(
			(affix) =>
				isRecord(affix) &&
				typeof affix.id === 'string' &&
				typeof affix.name === 'string' &&
				typeof affix.desc === 'string' &&
				(affix.isHidden === undefined || typeof affix.isHidden === 'boolean'),
		) ||
		typeof value.effects !== 'string' ||
		typeof value.dmNotes !== 'string' ||
		(value.icon !== undefined &&
			value.icon !== null &&
			typeof value.icon !== 'string') ||
		(value.flavor !== undefined &&
			value.flavor !== null &&
			typeof value.flavor !== 'string') ||
		(value.maxCharges !== undefined &&
			value.maxCharges !== null &&
			(typeof value.maxCharges !== 'number' ||
				!Number.isSafeInteger(value.maxCharges) ||
				value.maxCharges < 0)) ||
		typeof value.isEquippable !== 'boolean' ||
		typeof value.isConsumable !== 'boolean' ||
		typeof value.isRequireAttunement !== 'boolean'
	) {
		return null;
	}
	if (value.category === 'Weapon') {
		if (
			!isRecord(value.weaponProperties) ||
			typeof value.weaponProperties.damage !== 'string' ||
			!Array.isArray(value.weaponProperties.properties) ||
			!value.weaponProperties.properties.every((entry) => typeof entry === 'string') ||
			(value.weaponProperties.mastery !== undefined &&
				!WEAPON_MASTERIES.includes(
					value.weaponProperties.mastery as WeaponItemMastery,
				))
		) {
			return null;
		}
		return value as unknown as AllItem;
	}
	if (value.category === 'Armor') {
		if (!isRecord(value.armorProperties) || typeof value.armorProperties.ac !== 'string') {
			return null;
		}
		return value as unknown as AllItem;
	}
	return value as unknown as AllItem;
}

function legacyCategory(category: string): ItemBaseCategory {
	if (category === 'Consumable') return 'AdventureGear';
	if (ITEM_BASE_CATEGORIES.includes(category as ItemBaseCategory)) {
		return category as ItemBaseCategory;
	}
	throw new Error(`資料庫物品分類不受支援：${category}`);
}

function createLegacyItemBase(row: {
	name: string;
	category: string;
	sub_type?: string | null;
	rarity?: string | null;
	icon?: string | null;
	damage?: string | null;
	mastery?: string | null;
	ac?: string | null;
	weight?: number | string | null;
	value_gp?: number | string | null;
	requires_attunement?: boolean | null;
	max_charges?: number | string | null;
	effects?: string | null;
	flavor?: string | null;
	dm_notes?: string | null;
	is_equippable?: boolean | null;
	is_consumable?: boolean | null;
	is_important?: boolean | null;
	affixes?: AllItem['affixes'] | null;
}): AllItem {
	if (!row.name.trim()) throw new Error('資料庫物品缺少名稱。');
	const category = legacyCategory(row.category);
	if (category === 'Weapon' && !row.damage?.trim()) {
		throw new Error(`武器「${row.name}」缺少傷害欄位。`);
	}
	if (category === 'Armor' && !row.ac?.trim()) {
		throw new Error(`護甲「${row.name}」缺少護甲值欄位。`);
	}
	const common = {
		name: row.name,
		subTypes: row.sub_type ? [row.sub_type] : [],
		rarity: ((
			row.rarity === 'Uncommon' ||
			row.rarity === 'Rare' ||
			row.rarity === 'VeryRare' ||
			row.rarity === 'Legendary' ||
			row.rarity === 'Artifact'
				? row.rarity
				: 'Common') as ItemBaseRarity),
		icon: row.icon ?? 'Package',
		weight: Number(row.weight ?? 0),
		valueGp: Number(row.value_gp ?? 0),
		affixes: row.affixes ?? [],
		effects: row.effects ?? '',
		flavor: row.flavor ?? '',
		dmNotes: row.dm_notes ?? '',
		maxCharges: Number(row.max_charges ?? 0),
		isEquippable: Boolean(row.is_equippable),
		isConsumable:
			Boolean(row.is_consumable) || row.category === 'Consumable',
		isRequireAttunement: Boolean(row.requires_attunement),
	};
	if (category === 'Weapon') {
		return {
			...common,
			category,
			weaponProperties: {
				damage: row.damage ?? '',
				...(WEAPON_MASTERIES.includes(row.mastery as WeaponItemMastery)
					? { mastery: row.mastery as WeaponItemMastery }
					: {}),
				properties: [],
			},
		};
	}
	if (category === 'Armor') {
		return { ...common, category, armorProperties: { ac: row.ac ?? '' } };
	}
	return { ...common, category };
}

function serializeItemBase(item: AllItem): AllItem {
	const common = {
		name: item.name,
		subTypes: [...item.subTypes],
		rarity: item.rarity,
		icon: item.icon,
		weight: item.weight,
		valueGp: item.valueGp,
		affixes: item.affixes,
		effects: item.effects,
		flavor: item.flavor,
		dmNotes: item.dmNotes,
		maxCharges: item.maxCharges,
		isEquippable: item.isEquippable,
		isConsumable: item.isConsumable,
		isRequireAttunement: item.isRequireAttunement,
	};
	if (item.category === 'Weapon') {
		return { ...common, category: item.category, weaponProperties: item.weaponProperties };
	}
	if (item.category === 'Armor') {
		return { ...common, category: item.category, armorProperties: item.armorProperties };
	}
	return { ...common, category: item.category };
}

function legacyDbCategory(item: Pick<AllItem, 'category' | 'isConsumable'>): string {
	if (item.category === 'Weapon' || item.category === 'Armor') return item.category;
	return item.isConsumable ? 'Consumable' : 'Misc';
}

function serializeCampaignShopRefreshPolicy(
	policy: CampaignShopRefreshPolicy,
): unknown {
	return {
		...policy,
		rules: policy.rules.map((rule) => ({
			...rule,
			possibleItemsOrFilters: rule.possibleItemsOrFilters.map((candidate) => {
				if (!('itemId' in candidate)) return candidate;
				return {
					...candidate,
					category: legacyDbCategory(candidate),
					icon: candidate.icon ?? 'Package',
					description: candidate.effects,
					requiresAttunement: candidate.isRequireAttunement,
					damage: getItemDamage(candidate),
					ac: getItemArmorClass(candidate),
					item_base: serializeItemBase(candidate),
				};
			}),
		})),
	};
}

export function toDbCampaignShopRefreshPolicy(
	policy: CampaignShopRefreshPolicy | undefined,
): unknown {
	return serializeCampaignShopRefreshPolicy(
		normalizeCampaignShopRefreshPolicy(policy),
	);
}

// 若未設定環境變數則為 null，自動退回單機模式
export const supabase =
	supabaseUrl && supabaseAnonKey
		? createClient(supabaseUrl, supabaseAnonKey)
		: null;

export const isSupabaseConfigured = Boolean(supabase);

export type CampaignCurrency = LegacyCurrencyWallet;

const CURRENCY_TYPES: readonly CurrencyType[] = ['pp', 'gp', 'ep', 'sp', 'cp'];
const MAX_GP_CENTS = 100_000_000n;
const CURRENCY_TO_CENTS: Record<CurrencyType, bigint> = {
	pp: 1000n,
	gp: 100n,
	ep: 50n,
	sp: 10n,
	cp: 1n,
};

function gpValueToCents(value: unknown, fieldName: string): bigint {
	if (value === undefined || value === null) return 0n;
	if (typeof value !== 'number' && typeof value !== 'string') {
		throw new Error(`${fieldName} 必須是有效的 GP 數值。`);
	}
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
	if (!match) {
		throw new Error(`${fieldName} 必須是非負且最多兩位小數的 GP 數值。`);
	}
	const cents =
		BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
	if (cents > MAX_GP_CENTS) {
		throw new Error(`${fieldName} 不得超過 1,000,000.00 GP。`);
	}
	return cents;
}

export function legacyWalletToGpCents(wallet: LegacyCurrencyWallet): bigint {
	let cents = 0n;
	for (const currency of CURRENCY_TYPES) {
		const amount = wallet[currency];
		if (!Number.isSafeInteger(amount) || amount < 0) {
			throw new Error(`舊錢包的 ${currency.toUpperCase()} 數量必須是非負整數。`);
		}
		cents += BigInt(amount) * CURRENCY_TO_CENTS[currency];
	}
	if (cents > MAX_GP_CENTS) {
		throw new Error('錢包餘額不得超過 1,000,000.00 GP。');
	}
	return cents;
}

export function gpFromLegacyCurrencyWallet(wallet: LegacyCurrencyWallet): number {
	return Number(legacyWalletToGpCents(wallet)) / 100;
}

function legacyWalletFromUnknown(value: unknown): LegacyCurrencyWallet {
	const wallet =
		typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return Object.fromEntries(
		CURRENCY_TYPES.map((currency) => {
			const amount = wallet[currency];
			return [
				currency,
				typeof amount === 'number' &&
				Number.isSafeInteger(amount) &&
				amount >= 0
					? amount
					: 0,
			];
		}),
	) as LegacyCurrencyWallet;
}

export function legacyWalletFromGpCents(cents: bigint): LegacyCurrencyWallet {
	return {
		pp: 0,
		gp: Number(cents / 100n),
		ep: 0,
		sp: 0,
		cp: Number(cents % 100n),
	};
}

export function syncCharacterGpFromLegacyWallets(
	character: Character,
): Character {
	return {
		...character,
		gp: gpFromLegacyCurrencyWallet(character.currencies),
		privateGp: gpFromLegacyCurrencyWallet(character.privateCurrencies),
	};
}

export interface DbCampaignCurrency {
	camp_chest_gp?: number | string | null;
	camp_chest_currency?: Partial<CampaignCurrency> | null;
}

export const toDbCampaignCurrency = (
	currency: CampaignCurrency,
): Pick<DbCampaignCurrency, 'camp_chest_gp' | 'camp_chest_currency'> => {
	const cents = legacyWalletToGpCents(currency);
	return {
		camp_chest_gp: Number(cents) / 100,
		camp_chest_currency: currency,
	};
};

export const fromDbCampaignCurrency = (
	row: DbCampaignCurrency | null | undefined,
): CampaignCurrency => {
	return legacyWalletFromGpCents(
		gpValueToCents(row?.camp_chest_gp, '營地箱 GP'),
	);
};

export interface DbCampaignShop {
	id: string;
	campaign_id: string;
	name: string;
	flavor?: string | null;
	background_image_url: string | null;
	is_active: boolean;
	refresh_policy?: unknown;
	created_at: string;
	updated_at: string;
}

export const toDbCampaignShop = (
	shop: Pick<
		CampaignShop,
		'campaignId' | 'name' | 'backgroundImageUrl' | 'isActive'
	> &
		Partial<Pick<CampaignShop, 'flavor' | 'refreshPolicy'>>,
): Pick<
	DbCampaignShop,
	| 'campaign_id'
	| 'name'
	| 'flavor'
	| 'background_image_url'
	| 'is_active'
	| 'refresh_policy'
> => ({
	campaign_id: shop.campaignId,
	name: shop.name,
	flavor: shop.flavor ?? '',
	background_image_url: shop.backgroundImageUrl,
	is_active: shop.isActive,
	refresh_policy: toDbCampaignShopRefreshPolicy(shop.refreshPolicy),
});

export const fromDbCampaignShop = (row: DbCampaignShop): CampaignShop => ({
	id: row.id,
	campaignId: row.campaign_id,
	name: row.name,
	flavor: row.flavor ?? '',
	backgroundImageUrl: row.background_image_url ?? null,
	isActive: Boolean(row.is_active),
	refreshPolicy: normalizeCampaignShopRefreshPolicy(row.refresh_policy),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export interface DbCampaignShopItem {
	id: string;
	campaign_id: string;
	shop_id: string;
	item_snapshot: Partial<DbCampaignShopItemSnapshot> | null;
	is_identified: boolean;
	unit_price_gp: number | string;
	stock_available: number;
	stock_reserved: number;
	requires_approval: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface DbCampaignShopItemSnapshot {
	name?: string;
	category?: string;
	subTypes?: string[];
	sub_type?: string | null;
	rarity?: string | null;
	icon?: string | null;
	damage?: string | null;
	mastery?: string | null;
	ac?: string | null;
	weight?: number | string | null;
	value_gp?: number | string | null;
	requires_attunement?: boolean | null;
	is_homebrew?: boolean | null;
	max_charges?: number | string | null;
	effects?: string | null;
	flavor?: string | null;
	dm_notes?: string | null;
	is_equippable?: boolean | null;
	is_consumable?: boolean | null;
	is_important?: boolean | null;
	is_identified?: boolean | null;
	affixes?: AllItem['affixes'] | null;
	valueGp?: number;
	isEquippable?: boolean;
	isConsumable?: boolean;
	isRequireAttunement?: boolean;
	weaponProperties?: Extract<AllItem, { category: 'Weapon' }>['weaponProperties'];
	armorProperties?: Extract<AllItem, { category: 'Armor' }>['armorProperties'];
	item_base?: unknown;
}

const fromDbCampaignShopItemSnapshot = (
	snapshot: Partial<DbCampaignShopItemSnapshot> | null | undefined,
	isIdentified = snapshot?.is_identified !== false,
	revealUnidentifiedDefinition = false,
): CampaignShopItemSnapshot => {
	if (!isIdentified && !revealUnidentifiedDefinition) {
		const category = ITEM_BASE_CATEGORIES.includes(
			snapshot?.category as ItemBaseCategory,
		)
			? (snapshot?.category as ItemBaseCategory)
			: 'Misc';
		const common = {
			name: '未鑑定物品',
			subTypes: Array.isArray(snapshot?.subTypes)
				? snapshot.subTypes.filter((value): value is string => typeof value === 'string')
				: [],
			rarity: 'Common' as const,
			icon: 'HelpCircle',
			weight:
				typeof snapshot?.weight === 'number' && Number.isFinite(snapshot.weight)
					? snapshot.weight
					: 0,
			valueGp: 0,
			affixes: [],
			effects: '',
			flavor: '',
			dmNotes: '',
			maxCharges: 0,
			isEquippable: false,
			isConsumable: false,
			isRequireAttunement: false,
			isHomebrew: false,
			isImportant: false,
			isIdentified: false,
		};
		if (category === 'Weapon') {
			return {
				...common,
				category,
				weaponProperties: { damage: '未鑑定', properties: [] },
			};
		}
		if (category === 'Armor') {
			return {
				...common,
				category,
				armorProperties: { ac: '未鑑定' },
			};
		}
		return { ...common, category };
	}
	const canonical =
		snapshot?.item_base == null
			? readCanonicalItemBase(snapshot)
			: readCanonicalItemBase(snapshot.item_base);
	if (snapshot?.item_base != null && !canonical) {
		throw new Error('商店快照中的 item_base 格式無效。');
	}
	const base = canonical
		? serializeItemBase(canonical)
		: createLegacyItemBase({
				name: snapshot?.name ?? '',
				category: snapshot?.category ?? 'Misc',
				sub_type: snapshot?.sub_type,
				rarity: snapshot?.rarity,
				icon: snapshot?.icon,
				damage: snapshot?.damage,
				mastery: snapshot?.mastery,
				ac: snapshot?.ac,
				weight: snapshot?.weight,
				value_gp: snapshot?.value_gp,
				requires_attunement: snapshot?.requires_attunement,
				max_charges: snapshot?.max_charges,
				effects: snapshot?.effects,
				flavor: snapshot?.flavor,
				dm_notes: snapshot?.dm_notes,
				is_equippable: snapshot?.is_equippable,
				is_consumable: snapshot?.is_consumable,
				affixes: snapshot?.affixes,
			});
	return {
		...base,
		icon: base.icon ?? 'Package',
		flavor: base.flavor ?? '',
		maxCharges: base.maxCharges ?? 0,
		isHomebrew: Boolean(snapshot?.is_homebrew),
		isImportant: Boolean(snapshot?.is_important),
		isIdentified,
	};
};

const toDbCampaignShopItemSnapshot = (
	snapshot: CampaignShopItemSnapshot,
): DbCampaignShopItemSnapshot => {
	const legacyProjection: DbCampaignShopItemSnapshot = {
		name: snapshot.name,
		category: legacyDbCategory(snapshot),
		sub_type: snapshot.subTypes[0] ?? '',
		rarity: snapshot.rarity,
		icon: snapshot.icon,
		damage: getItemDamage(snapshot),
		mastery: getItemWeaponMastery(snapshot) ?? 'None',
		ac: getItemArmorClass(snapshot),
		weight: snapshot.weight,
		value_gp: snapshot.valueGp,
		requires_attunement: snapshot.isRequireAttunement,
		is_homebrew: snapshot.isHomebrew,
		max_charges: snapshot.maxCharges,
		effects: snapshot.effects,
		flavor: snapshot.flavor,
		dm_notes: snapshot.dmNotes,
		is_equippable: snapshot.isEquippable,
		is_consumable: snapshot.isConsumable,
		is_important: Boolean(snapshot.isImportant),
		is_identified: snapshot.isIdentified !== false,
		affixes: snapshot.affixes,
	};
	return Object.assign(legacyProjection, serializeItemBase(snapshot));
};

export const toDbCampaignShopItem = (
	item: Pick<
		CampaignShopItem,
		| 'campaignId'
		| 'shopId'
		| 'itemSnapshot'
		| 'unitPriceGp'
		| 'stockAvailable'
		| 'requiresApproval'
		| 'isActive'
	>,
): Pick<
	DbCampaignShopItem,
	| 'campaign_id'
	| 'shop_id'
	| 'item_snapshot'
	| 'unit_price_gp'
	| 'stock_available'
	| 'requires_approval'
	| 'is_active'
> => ({
	campaign_id: item.campaignId,
	shop_id: item.shopId,
	item_snapshot: toDbCampaignShopItemSnapshot(item.itemSnapshot),
	unit_price_gp: item.unitPriceGp,
	stock_available: item.stockAvailable,
	requires_approval: item.requiresApproval,
	is_active: item.isActive,
});

export const fromDbCampaignShopItem = (
	row: DbCampaignShopItem,
	revealUnidentifiedDefinition = false,
): CampaignShopItem => ({
	id: row.id,
	campaignId: row.campaign_id,
	shopId: row.shop_id,
	itemSnapshot: fromDbCampaignShopItemSnapshot(
		row.item_snapshot,
		row.is_identified,
		revealUnidentifiedDefinition,
	),
	isIdentified: Boolean(row.is_identified),
	unitPriceGp: Number(row.unit_price_gp),
	stockAvailable: Number(row.stock_available),
	stockReserved: Number(row.stock_reserved ?? 0),
	requiresApproval: Boolean(row.requires_approval),
	isActive: Boolean(row.is_active),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export interface DbCampaignShopItemDefinition {
	item_id: string;
	item_snapshot: Partial<DbCampaignShopItemSnapshot> | null;
}

export interface DbCampaignShopOrder {
	id: string;
	checkout_id?: string | null;
	campaign_id: string;
	shop_id: string;
	shop_item_id: string | null;
	character_id: string;
	item_snapshot: Partial<DbCampaignShopItemSnapshot> | null;
	shop_name_snapshot: string;
	unit_price_gp: number | string;
	quantity: number;
	total_price_gp: number | string;
	status: CampaignShopOrderStatus;
	requires_approval: boolean;
	is_identified: boolean;
	created_at: string;
	updated_at: string;
	reviewed_at: string | null;
}

export const fromDbCampaignShopOrder = (
	row: DbCampaignShopOrder,
): CampaignShopOrder => ({
	id: row.id,
	checkoutId: row.checkout_id ?? null,
	campaignId: row.campaign_id,
	shopId: row.shop_id,
	shopItemId: row.shop_item_id,
	characterId: row.character_id,
	itemSnapshot: fromDbCampaignShopItemSnapshot(
		row.item_snapshot,
		row.is_identified,
	),
	shopNameSnapshot: row.shop_name_snapshot,
	unitPriceGp: Number(row.unit_price_gp),
	quantity: Number(row.quantity),
	totalPriceGp: Number(row.total_price_gp),
	status: row.status,
	requiresApproval: Boolean(row.requires_approval),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	reviewedAt: row.reviewed_at ?? null,
});

// ==========================================
// 資料庫欄位 (snake_case) <-> 前端型別 (camelCase) 轉換器
// ==========================================
export interface DbInventoryItem {
	id: string;
	owner_id: string;
	slot: number;
	name: string;
	category: string;
	sub_type: string;
	rarity: string;
	icon: string;
	damage: string | null;
	mastery: string | null;
	ac: string | null;
	weight: number;
	value_gp: number;
	quantity: number;
	equipped: boolean;
	requires_attunement: boolean;
	attuned: boolean;
	is_homebrew: boolean;
	is_identified: boolean;
	charges: number;
	max_charges: number;
	effects: string;
	flavor: string;
	dm_notes: string;
	player_notes: string;
	is_private: boolean;
	is_equippable: boolean;
	is_consumable: boolean;
	is_important: boolean;
	affixes: InventoryItem['affixes'];
	item_base?: unknown;
}
export const toDbItem = (item: InventoryItem): DbInventoryItem => {
	const flags = resolveItemFlags(item);
	return {
		id: item.id,
		owner_id: item.ownerId,
		slot: Number(item.slot ?? 0),
		name: item.name,
		category: legacyDbCategory(item),
		sub_type: item.subTypes[0] ?? '',
		rarity: item.rarity,
		icon: item.icon,
		damage: getItemDamage(item),
		mastery: getItemWeaponMastery(item) ?? 'None',
		ac: getItemArmorClass(item),
		weight: Number(item.weight),
		value_gp: Number(item.valueGp),
		quantity: Number(item.quantity),
		equipped: item.equipped,
		requires_attunement: item.isRequireAttunement,
		attuned: item.attuned,
		is_homebrew: item.isHomebrew,
		is_identified: item.isIdentified,
		charges: Number(item.charges),
		max_charges: Number(item.maxCharges),
		effects: item.effects,
		flavor: item.flavor,
		dm_notes: item.dmNotes,
		player_notes: item.playerNotes || '',
		is_private: Boolean(item.isPrivate),
		is_equippable: flags.isEquippable,
		is_consumable: flags.isConsumable,
		is_important: flags.isImportant,
		affixes: item.affixes ?? [],
		item_base: serializeItemBase(item),
	};
};

export const fromDbItem = (row: DbInventoryItem): InventoryItem => {
	const canonical =
		row.item_base == null ? null : readCanonicalItemBase(row.item_base);
	if (row.item_base != null && !canonical) {
		throw new Error(`物品 ${row.id} 的 item_base 格式無效。`);
	}
	const base =
		canonical ??
		createLegacyItemBase({
			...row,
			is_equippable:
				row.is_equippable ??
				(row.category === 'Weapon' ||
					row.category === 'Armor' ||
					Boolean(row.requires_attunement)),
		});
	return {
		...base,
		id: row.id,
		ownerId: row.owner_id,
		slot: Number(row.slot),
		icon: base.icon ?? 'Package',
		flavor: base.flavor ?? '',
		maxCharges: Number(base.maxCharges ?? row.max_charges ?? 0),
		quantity: Number(row.quantity),
		equipped: Boolean(row.equipped),
		attuned: Boolean(row.attuned),
		isHomebrew: Boolean(row.is_homebrew),
		isIdentified: Boolean(row.is_identified),
		charges: Number(row.charges),
		playerNotes: row.player_notes || '',
		isPrivate: Boolean(row.is_private),
		isImportant: Boolean(row.is_important),
	};
};

export interface DbBlacksmithItem {
	id: string;
	owner_id: string;
	name: string;
	category: string;
	sub_type: string;
	rarity: string;
	icon: string;
	damage: string | null;
	mastery: string | null;
	ac: string | null;
	weight: number;
	value_gp: number;
	requires_attunement: boolean;
	is_homebrew: boolean;
	max_charges: number;
	effects: string;
	flavor: string;
	dm_notes: string;
	is_equippable: boolean;
	is_consumable: boolean;
	is_important: boolean;
	affixes: BlacksmithTemplate['affixes'];
	is_shared: boolean;
	created_at: string;
	updated_at: string;
	item_base?: unknown;
}

export const toDbBlacksmithItem = (
	item: BlacksmithTemplate,
): DbBlacksmithItem => ({
	id: item.id,
	owner_id: item.ownerId,
	name: item.name,
	category: legacyDbCategory(item),
	sub_type: item.subTypes[0] ?? '',
	rarity: item.rarity,
	icon: item.icon,
	damage: getItemDamage(item),
	mastery: getItemWeaponMastery(item) ?? 'None',
	ac: getItemArmorClass(item),
	weight: item.weight,
	value_gp: item.valueGp,
	requires_attunement: item.isRequireAttunement,
	is_homebrew: item.isHomebrew,
	max_charges: item.maxCharges,
	effects: item.effects,
	flavor: item.flavor,
	dm_notes: item.dmNotes,
	is_equippable: item.isEquippable,
	is_consumable: item.isConsumable,
	is_important: item.isImportant,
	affixes: item.affixes,
	is_shared: item.isShared,
	created_at: item.createdAt,
	updated_at: item.updatedAt,
	item_base: serializeItemBase(item),
});

export const fromDbBlacksmithItem = (
	row: DbBlacksmithItem,
): BlacksmithTemplate => {
	const canonical =
		row.item_base == null ? null : readCanonicalItemBase(row.item_base);
	if (row.item_base != null && !canonical) {
		throw new Error(`鍛造物品 ${row.id} 的 item_base 格式無效。`);
	}
	const base = canonical ?? createLegacyItemBase(row);
	return {
		...base,
		id: row.id,
		ownerId: row.owner_id,
		icon: base.icon ?? 'Package',
		flavor: base.flavor ?? '',
		maxCharges: Number(base.maxCharges ?? row.max_charges ?? 0),
		isHomebrew: row.is_homebrew ?? true,
		isImportant: Boolean(row.is_important),
		isShared: Boolean(row.is_shared),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
};

export interface DbCharacter {
	id: string;
	name: string;
	title: string;
	avatar: string | null;
	str: number;
	user_id: string;
	campaign_id: string;
	gp?: number | string | null;
	private_gp?: number | string | null;
	currencies?: Partial<LegacyCurrencyWallet> | null;
	private_currencies?: Partial<LegacyCurrencyWallet> | null;
}

export const toDbCharacter = (char: Character): DbCharacter => {
	const gpCents = gpValueToCents(char.gp, '角色公開錢包 GP');
	const privateGpCents = gpValueToCents(char.privateGp, '角色私人錢包 GP');
	if (
		legacyWalletToGpCents(char.currencies) !== gpCents ||
		legacyWalletToGpCents(char.privateCurrencies) !== privateGpCents
	) {
		throw new Error('角色 GP 餘額與舊錢包相容資料不一致。');
	}
	return {
		id: char.id,
		name: char.name,
		title: char.title,
		avatar: normalizeAvatarReference(char.avatar),
		str: Number(char.str),
		user_id: char.userId,
		campaign_id: char.campaignId,
		gp: Number(gpCents) / 100,
		private_gp: Number(privateGpCents) / 100,
		currencies: char.currencies,
		private_currencies: char.privateCurrencies,
	};
};

export const fromDbCharacter = (row: DbCharacter): Character => {
	const gpCents = gpValueToCents(row.gp, `角色 ${row.id} 公開錢包 GP`);
	const privateGpCents = gpValueToCents(
		row.private_gp,
		`角色 ${row.id} 私人錢包 GP`,
	);
	const currencies = legacyWalletFromUnknown(row.currencies);
	const privateCurrencies = legacyWalletFromUnknown(row.private_currencies);
	if (
		row.currencies != null &&
		legacyWalletToGpCents(currencies) !== gpCents
	) {
		throw new Error(`角色 ${row.id} 公開錢包 GP 與相容欄位不一致。`);
	}
	if (
		row.private_currencies != null &&
		legacyWalletToGpCents(privateCurrencies) !== privateGpCents
	) {
		throw new Error(`角色 ${row.id} 私人錢包 GP 與相容欄位不一致。`);
	}
	return {
		id: row.id,
		name: row.name,
		title: row.title,
		avatar: normalizeAvatarReference(row.avatar),
		str: Number(row.str),
		userId: row.user_id,
		campaignId: row.campaign_id,
		gp: Number(gpCents) / 100,
		privateGp: Number(privateGpCents) / 100,
		currencies:
			row.currencies == null
				? legacyWalletFromGpCents(gpCents)
				: currencies,
		privateCurrencies:
			row.private_currencies == null
				? legacyWalletFromGpCents(privateGpCents)
				: privateCurrencies,
	};
};

export interface DbCampaignJourney {
	id: string;
	campaign_id: string;
	title: string;
	tags?: string | null;
	content?: string | null;
	character_id?: string | null;
	created_by: string;
	created_at: string;
	is_quest?: boolean | null;
	is_completed?: boolean | null;
	visibility?: string | null;
}

export interface DbCampaignJourneyDmNote {
	journey_id: string;
	campaign_id: string;
	content?: string | null;
}

export const parseCampaignJourneyTags = (tags: string | null | undefined) => {
	const uniqueTags = new Set<string>();
	for (const tag of (tags ?? '').split(',')) {
		const normalizedTag = tag.trim();
		if (normalizedTag) uniqueTags.add(normalizedTag);
	}
	return [...uniqueTags];
};

export const serializeCampaignJourneyTags = (tags: readonly string[]) => {
	const uniqueTags = new Set<string>();
	for (const tag of tags) {
		const normalizedTag = tag.trim();
		if (normalizedTag) uniqueTags.add(normalizedTag);
	}
	return [...uniqueTags].join(', ');
};

export const toDbCampaignJourney = (
	journey: CampaignJourney,
): DbCampaignJourney => ({
	id: journey.id,
	campaign_id: journey.campaignId,
	title: journey.title,
	tags: serializeCampaignJourneyTags(journey.tags),
	content: journey.content,
	character_id: journey.characterId,
	created_by: journey.createdBy,
	created_at: journey.createdAt,
	is_quest: journey.isQuest,
	is_completed: journey.isCompleted,
	visibility: journey.visibility,
});

export const fromDbCampaignJourney = (
	row: DbCampaignJourney,
): CampaignJourney => ({
	id: row.id,
	campaignId: row.campaign_id,
	title: row.title,
	tags: parseCampaignJourneyTags(row.tags),
	content: row.content ?? '',
	characterId: row.character_id ?? null,
	createdBy: row.created_by,
	createdAt: row.created_at,
	isQuest: row.is_quest ?? false,
	isCompleted: row.is_completed ?? false,
	visibility: (row.visibility === 'private'
		? 'private'
		: 'public') satisfies CampaignJourneyVisibility,
});

export const toDbCampaignJourneyDmNote = (
	note: CampaignJourneyDmNote,
): DbCampaignJourneyDmNote => ({
	journey_id: note.journeyId,
	campaign_id: note.campaignId,
	content: note.content,
});

export const fromDbCampaignJourneyDmNote = (
	row: DbCampaignJourneyDmNote,
): CampaignJourneyDmNote => ({
	journeyId: row.journey_id,
	campaignId: row.campaign_id,
	content: row.content ?? '',
});

export interface DbCharacterPermission {
	id: string;
	campaign_id: string;
	character_id: string;
	user_id: string;
	public_bag_access: 0 | 1 | 2;
	private_bag_access: 0 | 1 | 2;
	public_wallet_access: 0 | 1 | 2;
	private_wallet_access: 0 | 1 | 2;
	journey_access?: 0 | 1 | 2 | null;
	can_edit_profile: boolean;
	can_delete_character: boolean;
	can_manage_permissions: boolean;
}

export const toDbPermission = (
	perm: CharacterPermission,
): DbCharacterPermission => ({
	id: perm.id,
	campaign_id: perm.campaignId,
	character_id: perm.characterId,
	user_id: perm.userId,
	public_bag_access: perm.publicBagAccess,
	private_bag_access: perm.privateBagAccess,
	public_wallet_access: perm.publicWalletAccess,
	private_wallet_access: perm.privateWalletAccess,
	journey_access: perm.journeyAccess,
	can_edit_profile: perm.canEditProfile,
	can_delete_character: perm.canDeleteCharacter,
	can_manage_permissions: perm.canManagePermissions,
});

export const fromDbPermission = (
	row: DbCharacterPermission,
): CharacterPermission => ({
	id: row.id,
	campaignId: row.campaign_id,
	characterId: row.character_id,
	userId: row.user_id,
	publicBagAccess: row.public_bag_access ?? 1,
	privateBagAccess: row.private_bag_access ?? 0,
	publicWalletAccess: row.public_wallet_access ?? 1,
	privateWalletAccess: row.private_wallet_access ?? 0,
	journeyAccess: row.journey_access ?? 0,
	canEditProfile: Boolean(row.can_edit_profile),
	canDeleteCharacter: Boolean(row.can_delete_character),
	canManagePermissions: Boolean(row.can_manage_permissions),
});
