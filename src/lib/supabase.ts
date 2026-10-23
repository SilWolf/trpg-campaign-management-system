import { createClient } from '@supabase/supabase-js';
import {
	resolveItemFlags,
	type Character,
	type CharacterPermission,
	type CurrencyType,
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
