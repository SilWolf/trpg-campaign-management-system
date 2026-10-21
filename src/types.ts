export type Rarity =
	| 'Common'
	| 'Uncommon'
	| 'Rare'
	| 'VeryRare'
	| 'Legendary'
	| 'Artifact';
export type ItemCategory = 'Weapon' | 'Armor' | 'Consumable' | 'Misc';
export type WeaponMasteryKey =
	| 'None'
	| 'Cleave'
	| 'Graze'
	| 'Nick'
	| 'Push'
	| 'Sap'
	| 'Slow'
	| 'Topple'
	| 'Vex';
export type WeaponMasteryInfo = { name: string; desc: string };
export type CurrencyType = 'pp' | 'gp' | 'ep' | 'sp' | 'cp';
export type ViewMode = 'player' | 'dm';

// 新增：背包展示模式（緊湊格字 vs 列表展示）與四大自動分類
export type InventoryDisplayMode = 'grid6' | 'grid' | 'list';
export type ItemSection = 'Equipment' | 'Consumable' | 'Important' | 'Misc';

export type ItemAffix = {
	id: string;
	name: string;
	desc: string; // 支援 Markdown
	isHidden?: boolean; // 是否對玩家隱藏，直到 DM 揭露
};

export type InventoryItem = {
	id: string;
	ownerId: string;
	slot?: number; // 設為選填以相容舊資料，新系統不再使用格位座標
	name: string;
	category: ItemCategory;
	subType: string;
	rarity: Rarity;
	icon: string;
	damage: string | null;
	mastery: WeaponMasteryKey;
	ac: string | null;
	weight: number;
	valueGp: number;
	quantity: number;
	equipped: boolean;
	requiresAttunement: boolean;
	attuned: boolean;
	isHomebrew: boolean;
	isIdentified: boolean;
	charges: number;
	maxCharges: number;
	effects: string;
	flavor: string;
	dmNotes: string;
	playerNotes?: string; // 玩家自己在物品上寫的備註 (支援 Markdown)
	isPrivate?: boolean; // 是否放在「私人背包」(僅本人與 DM 可見)
	isEquippable?: boolean; // 可否裝備？
	isConsumable?: boolean; // 可否消耗？
	isImportant?: boolean; // 是否重要物品？
	affixes?: ItemAffix[]; // 附魔詞條陣列
};

export type Character = {
	id: string;
	name: string;
	title: string;
	str: number;
	avatar: string;
	currencies: Record<CurrencyType, number>;
};

export type HomebrewForm = {
	name: string;
	category: ItemCategory;
	subType: string;
	rarity: Rarity;
	icon: string;
	damage: string;
	mastery: WeaponMasteryKey;
	ac: string;
	weight: string;
	valueGp: string;
	quantity: string;
	requiresAttunement: boolean;
	isIdentified: boolean;
	maxCharges: string;
	effects: string;
	flavor: string;
	dmNotes: string;
	isPrivate?: boolean;
	isEquippable: boolean;
	isConsumable: boolean;
	isImportant: boolean;
	affixes: ItemAffix[];
};

export type RarityStyle = {
	label: string;
	color: string;
	border: string;
	bg: string;
	headerGradient: string;
	glow: string;
	text: string;
	badgeBg: string;
};

export function resolveItemFlags(item: InventoryItem) {
	const isEquippable =
		item.isEquippable !== undefined
			? item.isEquippable
			: item.category === 'Weapon' ||
				item.category === 'Armor' ||
				item.requiresAttunement;
	const isConsumable =
		item.isConsumable !== undefined
			? item.isConsumable
			: item.category === 'Consumable';
	const isImportant = Boolean(item.isImportant);
	return { isEquippable, isConsumable, isImportant };
}

export function getItemSection(item: InventoryItem): ItemSection {
	const { isEquippable, isConsumable, isImportant } = resolveItemFlags(item);
	if (isImportant) return 'Important';
	if (isEquippable) return 'Equipment';
	if (isConsumable) return 'Consumable';
	return 'Misc';
}

// 新增：營地儲物箱專屬 Owner ID
export const CAMP_CHEST_ID = 'camp-chest';
