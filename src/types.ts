export type Rarity =
	| 'Common'
	| 'Uncommon'
	| 'Rare'
	| 'VeryRare'
	| 'Legendary'
	| 'Artifact';
export type ItemCategory = 'Weapon' | 'Armor' | 'Consumable' | 'Misc';
export type WeaponMastery =
	| 'None'
	| 'Cleave'
	| 'Graze'
	| 'Nick'
	| 'Push'
	| 'Sap'
	| 'Slow'
	| 'Topple'
	| 'Vex';
export type CurrencyType = 'pp' | 'gp' | 'ep' | 'sp' | 'cp';
export type ViewMode = 'player' | 'dm';

export type InventoryItem = {
	id: string;
	ownerId: string;
	slot: number;
	name: string;
	category: ItemCategory;
	subType: string;
	rarity: Rarity;
	icon: string;
	damage: string | null;
	mastery: WeaponMastery;
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
	mastery: WeaponMastery;
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
