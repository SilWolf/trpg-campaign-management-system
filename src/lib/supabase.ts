import { createClient } from '@supabase/supabase-js';
import {
	resolveItemFlags,
	type Character,
	type CharacterPermission,
	type CurrencyType,
	type BlacksmithTemplate,
	type CampaignShop,
	type CampaignShopItem,
	type CampaignShopItemSnapshot,
	type CampaignShopItemSourceType,
	type CampaignShopOrder,
	type CampaignShopOrderStatus,
	type InventoryItem,
} from '@/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
	string | undefined;

// 若未設定環境變數則為 null，自動退回單機模式
export const supabase =
	supabaseUrl && supabaseAnonKey
		? createClient(supabaseUrl, supabaseAnonKey)
		: null;

export const isSupabaseConfigured = Boolean(supabase);

export type CampaignCurrency = Record<CurrencyType, number>;

export interface DbCampaignCurrency {
	camp_chest_currency?: Partial<CampaignCurrency> | null;
}

export const toDbCampaignCurrency = (
	currency: CampaignCurrency,
): Pick<DbCampaignCurrency, 'camp_chest_currency'> => ({
	camp_chest_currency: currency,
});

export const fromDbCampaignCurrency = (
	row: DbCampaignCurrency | null | undefined,
): CampaignCurrency => {
	const currency = row?.camp_chest_currency;
	const valueFor = (coin: CurrencyType) => {
		const value = currency?.[coin];
		return typeof value === 'number' && Number.isFinite(value) ? value : 0;
	};
	return {
		pp: valueFor('pp'),
		gp: valueFor('gp'),
		ep: valueFor('ep'),
		sp: valueFor('sp'),
		cp: valueFor('cp'),
	};
};

export interface DbCampaignShop {
	id: string;
	campaign_id: string;
	name: string;
	background_image_url: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export const toDbCampaignShop = (
	shop: Pick<CampaignShop, 'campaignId' | 'name' | 'backgroundImageUrl' | 'isActive'>,
): Pick<
	DbCampaignShop,
	'campaign_id' | 'name' | 'background_image_url' | 'is_active'
> => ({
	campaign_id: shop.campaignId,
	name: shop.name,
	background_image_url: shop.backgroundImageUrl,
	is_active: shop.isActive,
});

export const fromDbCampaignShop = (row: DbCampaignShop): CampaignShop => ({
	id: row.id,
	campaignId: row.campaign_id,
	name: row.name,
	backgroundImageUrl: row.background_image_url ?? null,
	isActive: Boolean(row.is_active),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export interface DbCampaignShopItem {
	id: string;
	campaign_id: string;
	shop_id: string;
	item_snapshot: Partial<DbCampaignShopItemSnapshot> | null;
	source_type: CampaignShopItemSourceType;
	source_id: string | null;
	unit_price_gp: number | string;
	stock_available: number;
	stock_reserved: number;
	requires_approval: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface DbCampaignShopItemSnapshot {
	name: string;
	category: InventoryItem['category'];
	sub_type: string;
	rarity: InventoryItem['rarity'];
	icon: string;
	damage: string | null;
	mastery: InventoryItem['mastery'];
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
	affixes: NonNullable<InventoryItem['affixes']>;
}

const fromDbCampaignShopItemSnapshot = (
	snapshot: Partial<DbCampaignShopItemSnapshot> | null | undefined,
): CampaignShopItemSnapshot => ({
	name: snapshot?.name ?? '',
	category: snapshot?.category ?? 'Misc',
	subType: snapshot?.sub_type ?? '',
	rarity: snapshot?.rarity ?? 'Common',
	icon: snapshot?.icon ?? 'Package',
	damage: snapshot?.damage ?? null,
	mastery: snapshot?.mastery ?? 'None',
	ac: snapshot?.ac ?? null,
	weight: Number(snapshot?.weight ?? 0),
	valueGp: Number(snapshot?.value_gp ?? 0),
	requiresAttunement: Boolean(snapshot?.requires_attunement),
	isHomebrew: Boolean(snapshot?.is_homebrew),
	maxCharges: Number(snapshot?.max_charges ?? 0),
	effects: snapshot?.effects ?? '',
	flavor: snapshot?.flavor ?? '',
	dmNotes: snapshot?.dm_notes ?? '',
	isEquippable: Boolean(snapshot?.is_equippable),
	isConsumable: Boolean(snapshot?.is_consumable),
	isImportant: Boolean(snapshot?.is_important),
	affixes: snapshot?.affixes ?? [],
});

const toDbCampaignShopItemSnapshot = (
	snapshot: CampaignShopItemSnapshot,
): DbCampaignShopItemSnapshot => ({
	name: snapshot.name,
	category: snapshot.category,
	sub_type: snapshot.subType,
	rarity: snapshot.rarity,
	icon: snapshot.icon,
	damage: snapshot.damage,
	mastery: snapshot.mastery,
	ac: snapshot.ac,
	weight: snapshot.weight,
	value_gp: snapshot.valueGp,
	requires_attunement: snapshot.requiresAttunement,
	is_homebrew: snapshot.isHomebrew,
	max_charges: snapshot.maxCharges,
	effects: snapshot.effects,
	flavor: snapshot.flavor,
	dm_notes: snapshot.dmNotes,
	is_equippable: Boolean(snapshot.isEquippable),
	is_consumable: Boolean(snapshot.isConsumable),
	is_important: Boolean(snapshot.isImportant),
	affixes: snapshot.affixes ?? [],
});

export const toDbCampaignShopItem = (
	item: Pick<
		CampaignShopItem,
		| 'campaignId'
		| 'shopId'
		| 'itemSnapshot'
		| 'sourceType'
		| 'sourceId'
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
	| 'source_type'
	| 'source_id'
	| 'unit_price_gp'
	| 'stock_available'
	| 'requires_approval'
	| 'is_active'
> => ({
	campaign_id: item.campaignId,
	shop_id: item.shopId,
	item_snapshot: toDbCampaignShopItemSnapshot(item.itemSnapshot),
	source_type: item.sourceType,
	source_id: item.sourceId,
	unit_price_gp: item.unitPriceGp,
	stock_available: item.stockAvailable,
	requires_approval: item.requiresApproval,
	is_active: item.isActive,
});

export const fromDbCampaignShopItem = (
	row: DbCampaignShopItem,
): CampaignShopItem => ({
	id: row.id,
	campaignId: row.campaign_id,
	shopId: row.shop_id,
	itemSnapshot: fromDbCampaignShopItemSnapshot(row.item_snapshot),
	sourceType: row.source_type,
	sourceId: row.source_id ?? null,
	unitPriceGp: Number(row.unit_price_gp),
	stockAvailable: Number(row.stock_available),
	stockReserved: Number(row.stock_reserved ?? 0),
	requiresApproval: Boolean(row.requires_approval),
	isActive: Boolean(row.is_active),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export interface DbCampaignShopOrder {
	id: string;
	checkout_id?: string | null;
	campaign_id: string;
	shop_id: string;
	shop_item_id: string;
	character_id: string;
	item_snapshot: Partial<DbCampaignShopItemSnapshot> | null;
	shop_name_snapshot: string;
	unit_price_gp: number | string;
	quantity: number;
	total_price_gp: number | string;
	status: CampaignShopOrderStatus;
	requires_approval: boolean;
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
	itemSnapshot: fromDbCampaignShopItemSnapshot(row.item_snapshot),
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
	category: InventoryItem['category'];
	sub_type: string;
	rarity: InventoryItem['rarity'];
	icon: string;
	damage: string | null;
	mastery: InventoryItem['mastery'];
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
}
export const toDbItem = (item: InventoryItem): DbInventoryItem => {
	const flags = resolveItemFlags(item);
	return {
		id: item.id,
		owner_id: item.ownerId,
		slot: Number(item.slot ?? 0),
		name: item.name,
		category: item.category,
		sub_type: item.subType,
		rarity: item.rarity,
		icon: item.icon,
		damage: item.damage,
		mastery: item.mastery,
		ac: item.ac,
		weight: Number(item.weight),
		value_gp: Number(item.valueGp),
		quantity: Number(item.quantity),
		equipped: item.equipped,
		requires_attunement: item.requiresAttunement,
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
	};
};

export const fromDbItem = (row: DbInventoryItem): InventoryItem => ({
	id: row.id,
	ownerId: row.owner_id,
	slot: Number(row.slot),
	name: row.name,
	category: row.category,
	subType: row.sub_type,
	rarity: row.rarity,
	icon: row.icon,
	damage: row.damage,
	mastery: row.mastery,
	ac: row.ac,
	weight: Number(row.weight),
	valueGp: Number(row.value_gp),
	quantity: Number(row.quantity),
	equipped: Boolean(row.equipped),
	requiresAttunement: Boolean(row.requires_attunement),
	attuned: Boolean(row.attuned),
	isHomebrew: Boolean(row.is_homebrew),
	isIdentified: Boolean(row.is_identified),
	charges: Number(row.charges),
	maxCharges: Number(row.max_charges),
	effects: row.effects || '',
	flavor: row.flavor || '',
	dmNotes: row.dm_notes || '',
	playerNotes: row.player_notes || '',
	isPrivate: Boolean(row.is_private),
	isEquippable:
		row.is_equippable !== undefined
			? Boolean(row.is_equippable)
			: row.category === 'Weapon' ||
				row.category === 'Armor' ||
				Boolean(row.requires_attunement),
	isConsumable:
		row.is_consumable !== undefined
			? Boolean(row.is_consumable)
			: row.category === 'Consumable',
	isImportant: Boolean(row.is_important),
	affixes: row.affixes ?? [],
});

export interface DbBlacksmithItem {
	id: string;
	owner_id: string;
	name: string;
	category: BlacksmithTemplate['category'];
	sub_type: string;
	rarity: BlacksmithTemplate['rarity'];
	icon: string;
	damage: string | null;
	mastery: BlacksmithTemplate['mastery'];
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
}

export const toDbBlacksmithItem = (
	item: BlacksmithTemplate,
): DbBlacksmithItem => ({
	id: item.id,
	owner_id: item.ownerId,
	name: item.name,
	category: item.category,
	sub_type: item.subType,
	rarity: item.rarity,
	icon: item.icon,
	damage: item.damage,
	mastery: item.mastery,
	ac: item.ac,
	weight: item.weight,
	value_gp: item.valueGp,
	requires_attunement: item.requiresAttunement,
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
});

export const fromDbBlacksmithItem = (
	row: DbBlacksmithItem,
): BlacksmithTemplate => ({
	id: row.id,
	ownerId: row.owner_id,
	name: row.name,
	category: row.category,
	subType: row.sub_type ?? '',
	rarity: row.rarity ?? 'Common',
	icon: row.icon ?? 'Package',
	damage: row.damage ?? null,
	mastery: row.mastery ?? 'None',
	ac: row.ac ?? null,
	weight: Number(row.weight ?? 0),
	valueGp: Number(row.value_gp ?? 0),
	requiresAttunement: Boolean(row.requires_attunement),
	isHomebrew: row.is_homebrew ?? true,
	maxCharges: Number(row.max_charges ?? 0),
	effects: row.effects ?? '',
	flavor: row.flavor ?? '',
	dmNotes: row.dm_notes ?? '',
	isEquippable: Boolean(row.is_equippable),
	isConsumable: Boolean(row.is_consumable),
	isImportant: Boolean(row.is_important),
	affixes: row.affixes ?? [],
	isShared: Boolean(row.is_shared),
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export interface DbCharacter {
	id: string;
	name: string;
	title: string;
	avatar: string;
	str: number;
	user_id: string;
	campaign_id: string;
	currencies: Character['currencies'];
	private_currencies?: Character['privateCurrencies'];
}

export const toDbCharacter = (char: Character): DbCharacter => ({
	id: char.id,
	name: char.name,
	title: char.title,
	avatar: char.avatar,
	str: Number(char.str),
	user_id: char.userId,
	campaign_id: char.campaignId,
	currencies: char.currencies,
	private_currencies: char.privateCurrencies || {
		pp: 0,
		gp: 0,
		ep: 0,
		sp: 0,
		cp: 0,
	},
});

export const fromDbCharacter = (row: DbCharacter): Character => ({
	id: row.id,
	name: row.name,
	title: row.title,
	avatar: row.avatar,
	str: Number(row.str),
	userId: row.user_id,
	campaignId: row.campaign_id,
	currencies: row.currencies || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
	privateCurrencies: row.private_currencies || {
		pp: 0,
		gp: 0,
		ep: 0,
		sp: 0,
		cp: 0,
	},
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
	canEditProfile: Boolean(row.can_edit_profile),
	canDeleteCharacter: Boolean(row.can_delete_character),
	canManagePermissions: Boolean(row.can_manage_permissions),
});
