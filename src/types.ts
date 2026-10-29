export type ItemBaseCategory =
	| 'Weapon'
	| 'Armor'
	| 'Potion'
	| 'Poison'
	| 'Ring'
	| 'Rod'
	| 'Scroll'
	| 'Staff'
	| 'Wand'
	| 'WondrousItem'
	| 'TradeGood'
	| 'Gemstone'
	| 'Tool'
	| 'AdventureGear'
	| 'FoodAndDrink'
	| 'Mount'
	| 'Vehicle'
	| 'Misc';

export type ItemBaseRarity =
	| 'Common'
	| 'Uncommon'
	| 'Rare'
	| 'VeryRare'
	| 'Legendary'
	| 'Artifact';

export interface BlacksmithCatalogDefinition {
	catalogId: string;
	title: string;
	itemsFile: string;
	lookupFile: string;
}

export interface BlacksmithCatalogIndex {
	schemaVersion: number;
	catalogs: BlacksmithCatalogDefinition[];
}

export interface BlacksmithLookupEntry {
	sourceKey: string;
	itemId: string;
	name: string;
	aliases: string[];
	searchTerms: string[];
}

type BlacksmithCatalogMetadata = {
	catalogId: string;
	catalogTitle: string;
	itemId: string;
	sourceKey: string;
	source: string;
	aliases: string[];
	searchTerms: string[];
};

export type BlacksmithItem = AllItem &
	BlacksmithCatalogMetadata & {
		icon?: string | null;
		flavor?: string | null;
	};

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
export type WeaponItemMastery = Exclude<WeaponMasteryKey, 'None'>;
export type WeaponMasteryInfo = { name: string; desc: string };
export type CurrencyType = 'pp' | 'gp' | 'ep' | 'sp' | 'cp';
export type ViewMode = 'player' | 'dm';
export type CampaignShopOrderStatus =
	| 'completed'
	| 'pending'
	| 'rejected'
	| 'cancelled';
export type CampaignShopWalletType = 'public' | 'private';
export interface CampaignShopRefreshRange {
	min?: number;
	max?: number | null;
	p?: number;
	step?: number;
}

export type CampaignShopRefreshCandidate =
	| BlacksmithItem
	| {
			source: string;
			param: {
				search?: string;
				rarity?: ItemBaseRarity;
				category?: ItemBaseCategory;
			};
	  };

export interface CampaignShopRefreshRule {
	possibleItemsOrFilters: CampaignShopRefreshCandidate[];
	pickCount?: number | null | CampaignShopRefreshRange;
	stockAvailable: CampaignShopRefreshRange;
	listAsUnidentified: boolean;
}

export interface CampaignShopRefreshPolicy {
	flags: {
		keepItemsOnRefresh: boolean;
	};
	rules: CampaignShopRefreshRule[];
}

export interface CampaignShopRefreshExpectedItem {
	id: string;
	updatedAt: string;
}

export interface CampaignShopRefreshItemChange {
	sourceId: string;
	itemSnapshot: CampaignShopItemSnapshot;
	unitPriceGp: number;
	stockAvailable: number;
}

export interface CampaignShopRefreshResult {
	created: number;
	deleted: number;
}

// 背包展示模式與四大自動分類
export type InventoryDisplayMode = 'grid6' | 'grid' | 'list';
export type ItemSection = 'Equipment' | 'Consumable' | 'Important' | 'Misc';

// ==========================================
// 角色控制權限系統型別 (ACL)
// ==========================================
export type AccessLevel = 0 | 1 | 2; // 0: 無權限, 1: 僅閱讀, 2: 閱讀+修改

export interface CharacterPermission {
	id: string;
	campaignId: string;
	characterId: string;
	userId: string;
	publicBagAccess: AccessLevel;
	privateBagAccess: AccessLevel;
	publicWalletAccess: AccessLevel;
	privateWalletAccess: AccessLevel;
	journeyAccess: AccessLevel;
	canEditProfile: boolean;
	canDeleteCharacter: boolean;
	canManagePermissions: boolean;
}

export type CampaignJourneyVisibility = 'public' | 'private';
export type CampaignJourneyListFilter = 'all' | 'quests' | 'completed';

export interface CampaignJourney {
	id: string;
	campaignId: string;
	title: string;
	tags: string[];
	content: string;
	characterId: string | null;
	createdBy: string;
	createdAt: string;
	isQuest: boolean;
	isCompleted: boolean;
	visibility: CampaignJourneyVisibility;
}

export interface CampaignJourneyDmNote {
	journeyId: string;
	campaignId: string;
	content: string;
}

export type ItemAffix = {
	id: string;
	name: string;
	desc: string; // 支援 Markdown
	isHidden?: boolean; // 是否對玩家隱藏，直到 DM 揭露
};

export type ItemBase = {
	name: string;
	category: ItemBaseCategory;
	subTypes: string[];
	rarity: ItemBaseRarity;
	icon?: string | null;
	weight: number;
	valueGp: number;
	affixes: ItemAffix[];
	effects: string;
	flavor?: string | null;
	dmNotes: string;
	maxCharges?: number | null;
	isEquippable: boolean;
	isConsumable: boolean;
	isRequireAttunement: boolean;
};

type GeneralItem = Omit<ItemBase, 'category'> & {
	category: Exclude<ItemBaseCategory, 'Weapon' | 'Armor'>;
};

export type WeaponItem = Omit<ItemBase, 'category'> & {
	category: 'Weapon';
	weaponProperties: {
		damage: string;
		mastery?: WeaponItemMastery;
		properties: string[];
	};
};

export type ArmorItem = Omit<ItemBase, 'category'> & {
	category: 'Armor';
	armorProperties: {
		ac: string;
	};
};

export type AllItem = GeneralItem | WeaponItem | ArmorItem;

export function getItemDamage(item: AllItem): string | null {
	return item.category === 'Weapon' ? item.weaponProperties.damage : null;
}

export function getItemArmorClass(item: AllItem): string | null {
	return item.category === 'Armor' ? item.armorProperties.ac : null;
}

export function getItemWeaponMastery(
	item: AllItem,
): WeaponItemMastery | null {
	return item.category === 'Weapon' ? item.weaponProperties.mastery ?? null : null;
}

type InventoryItemState = {
	id: string;
	ownerId: string;
	slot?: number;
	quantity: number;
	equipped: boolean;
	attuned: boolean;
	isHomebrew: boolean;
	isIdentified: boolean;
	charges: number;
	maxCharges: number;
	icon: string;
	flavor: string;
	playerNotes?: string;
	isPrivate?: boolean;
	isImportant: boolean;
};

export type InventoryItem = AllItem & InventoryItemState;

export type BlacksmithTemplate = AllItem & {
	id: string;
	ownerId: string;
	isHomebrew: boolean;
	isImportant: boolean;
	isShared: boolean;
	createdAt: string;
	updatedAt: string;
	icon: string;
	flavor: string;
	maxCharges: number;
};

export type CampaignShopItemSnapshot = AllItem & {
	isIdentified?: boolean;
	isHomebrew: boolean;
	isImportant: boolean;
	icon: string;
	flavor: string;
	maxCharges: number;
};

export interface CampaignShop {
	id: string;
	campaignId: string;
	name: string;
	flavor: string;
	backgroundImageUrl: string | null;
	isActive: boolean;
	refreshPolicy: CampaignShopRefreshPolicy;
	createdAt: string;
	updatedAt: string;
}

export interface CampaignShopItem {
	id: string;
	campaignId: string;
	shopId: string;
	itemSnapshot: CampaignShopItemSnapshot;
	isIdentified: boolean;
	unitPriceGp: number;
	stockAvailable: number;
	stockReserved: number;
	requiresApproval: boolean;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CampaignShopOrder {
	id: string;
	checkoutId: string | null;
	campaignId: string;
	shopId: string;
	shopItemId: string | null;
	characterId: string;
	itemSnapshot: CampaignShopItemSnapshot;
	shopNameSnapshot: string;
	unitPriceGp: number;
	quantity: number;
	totalPriceGp: number;
	status: CampaignShopOrderStatus;
	requiresApproval: boolean;
	createdAt: string;
	updatedAt: string;
	reviewedAt: string | null;
}

export type Character = {
	userId: string;
	campaignId: string;
	id: string;
	name: string;
	title: string;
	str: number;
	avatar: string;
	currencies: Record<CurrencyType, number>; // 公開錢包
	privateCurrencies: Record<CurrencyType, number>; // 私人暗袋錢包
};

export type HomebrewForm = {
	name: string;
	category: ItemBaseCategory;
	subTypes: string[];
	rarity: ItemBaseRarity;
	icon: string;
	weaponProperties: {
		damage: string;
		mastery: WeaponItemMastery | '';
		properties: string[];
	};
	armorProperties: {
		ac: string;
	};
	weight: string;
	valueGp: string;
	quantity: string;
	isRequireAttunement: boolean;
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

export type RarityTokenName =
	| 'common'
	| 'uncommon'
	| 'rare'
	| 'very-rare'
	| 'legendary'
	| 'artifact';

type RarityTokenClass = `rarity-${RarityTokenName}`;

export type RarityStyle = {
	label: string;
	color: `var(--rarity-${RarityTokenName}-border)`;
	border: `${RarityTokenClass} border-[var(--rarity-border)]`;
	bg: `${RarityTokenClass} bg-[var(--rarity-background)] bg-[image:var(--rarity-gradient)]`;
	headerGradient: `${RarityTokenClass} bg-[var(--rarity-background)] bg-[image:var(--rarity-header-gradient)]`;
	glow: `${RarityTokenClass} shadow-[var(--rarity-glow)]`;
	text: `${RarityTokenClass} text-[var(--rarity-foreground)]`;
	badgeBg: `${RarityTokenClass} bg-[var(--rarity-background)] text-[var(--rarity-foreground)] border-[var(--rarity-border)]`;
};

export function resolveItemFlags(item: InventoryItem) {
	const isEquippable = item.isEquippable;
	const isConsumable = item.isConsumable;
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

export function canStackItems(a: InventoryItem, b: InventoryItem): boolean {
	if (a.equipped || b.equipped || a.attuned || b.attuned) return false;
	if (a.maxCharges > 0 || b.maxCharges > 0) return false;

	const sameBasic =
		a.name.trim() === b.name.trim() &&
		a.category === b.category &&
		a.subTypes.join('\u0000') === b.subTypes.join('\u0000') &&
		a.rarity === b.rarity &&
		a.weight === b.weight &&
		a.valueGp === b.valueGp &&
		a.isRequireAttunement === b.isRequireAttunement &&
		JSON.stringify(a.category === 'Weapon' ? a.weaponProperties : null) ===
			JSON.stringify(b.category === 'Weapon' ? b.weaponProperties : null) &&
		JSON.stringify(a.category === 'Armor' ? a.armorProperties : null) ===
			JSON.stringify(b.category === 'Armor' ? b.armorProperties : null) &&
		a.isIdentified === b.isIdentified &&
		Boolean(a.isPrivate) === Boolean(b.isPrivate);

	if (!sameBasic) return false;

	const affA = a.affixes || [];
	const affB = b.affixes || [];
	if (affA.length !== affB.length) return false;

	return affA.every(
		(ax, idx) =>
			ax.name === affB[idx].name &&
			ax.desc === affB[idx].desc &&
			Boolean(ax.isHidden) === Boolean(affB[idx].isHidden),
	);
}

export const CAMP_CHEST_ID = 'camp-chest';
