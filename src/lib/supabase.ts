import { createClient } from '@supabase/supabase-js';
import type { Character, InventoryItem } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
	| string
	| undefined;

// 若未設定環境變數則為 null，自動退回單機模式
export const supabase =
	supabaseUrl && supabaseAnonKey
		? createClient(supabaseUrl, supabaseAnonKey)
		: null;

export const isSupabaseConfigured = Boolean(supabase);

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
}

export const toDbItem = (item: InventoryItem): DbInventoryItem => ({
	id: item.id,
	owner_id: item.ownerId,
	slot: item.slot,
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
});

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
});

export interface DbCharacter {
	id: string;
	name: string;
	title: string;
	avatar: string;
	str: number;
	currencies: Character['currencies'];
}

export const toDbCharacter = (char: Character): DbCharacter => ({
	id: char.id,
	name: char.name,
	title: char.title,
	avatar: char.avatar,
	str: Number(char.str),
	currencies: char.currencies,
});

export const fromDbCharacter = (row: DbCharacter): Character => ({
	id: row.id,
	name: row.name,
	title: row.title,
	avatar: row.avatar,
	str: Number(row.str),
	currencies: row.currencies,
});
