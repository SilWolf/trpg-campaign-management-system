export type Rarity =
	'Common' | 'Uncommon' | 'Rare' | 'VeryRare' | 'Legendary' | 'Artifact';
export type ItemCategory = 'Weapon' | 'Armor' | 'Consumable' | 'Misc';
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

interface BlacksmithItemBase {
	catalogId: string;
	catalogTitle: string;
	itemId: string;
	sourceKey: string;
	name: string;
	subTypes: string[];
	rarity: InventoryItem['rarity'];
	icon: string;
	weight: number;
	valueGp: number;
	requiresAttunement: InventoryItem['requiresAttunement'];
	description: string;
	source: string;
	aliases: string[];
	searchTerms: string[];
}

export type BlacksmithItem = BlacksmithItemBase &
	(
		| { category: 'Armor'; ac: string | null; damage?: never }
		| {
				category: 'Weapon';
				damage: string | null;
				ac?: never;
				weaponProperties?: string[];
				weaponMastery?: string;
		  }
		| {
				category: 'Consumable' | 'Misc';
				damage: string | null;
				ac?: never;
				weaponProperties?: never;
				weaponMastery?: never;
		  }
	);

export interface BlacksmithTemplate {
	id: string;
	ownerId: string;
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
	requiresAttunement: boolean;
	isHomebrew: boolean;
	maxCharges: number;
	effects: string;
	flavor: string;
	dmNotes: string;
	isEquippable: boolean;
	isConsumable: boolean;
	isImportant: boolean;
	affixes: ItemAffix[];
	isShared: boolean;
	createdAt: string;
	updatedAt: string;
}

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
export type CampaignShopItemSourceType = 'catalog' | 'blacksmith' | 'manual';
export type CampaignShopOrderStatus =
	| 'completed'
	| 'pending'
	| 'rejected'
	| 'cancelled';
export type CampaignShopWalletType = 'public' | 'private';

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
	canEditProfile: boolean;
	canDeleteCharacter: boolean;
	canManagePermissions: boolean;
}

export type ItemAffix = {
	id: string;
	name: string;
	desc: string; // 支援 Markdown
	isHidden?: boolean; // 是否對玩家隱藏，直到 DM 揭露
};

export type InventoryItem = {
	id: string;
	ownerId: string;
	slot?: number;
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
	playerNotes?: string;
	isPrivate?: boolean;
	isEquippable?: boolean;
	isConsumable?: boolean;
	isImportant?: boolean;
	affixes?: ItemAffix[];
};

export type CampaignShopItemSnapshot = Omit<
	InventoryItem,
	| 'id'
	| 'ownerId'
	| 'slot'
	| 'quantity'
	| 'equipped'
	| 'attuned'
	| 'isIdentified'
	| 'charges'
	| 'playerNotes'
	| 'isPrivate'
>;

export interface CampaignShop {
	id: string;
	campaignId: string;
	name: string;
	backgroundImageUrl: string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CampaignShopItem {
	id: string;
	campaignId: string;
	shopId: string;
	itemSnapshot: CampaignShopItemSnapshot;
	sourceType: CampaignShopItemSourceType;
	sourceId: string | null;
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
	shopItemId: string;
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

export function canStackItems(a: InventoryItem, b: InventoryItem): boolean {
	if (a.equipped || b.equipped || a.attuned || b.attuned) return false;
	if (a.maxCharges > 0 || b.maxCharges > 0) return false;

	const sameBasic =
		a.name.trim() === b.name.trim() &&
		a.category === b.category &&
		a.subType.trim() === b.subType.trim() &&
		a.rarity === b.rarity &&
		a.weight === b.weight &&
		a.valueGp === b.valueGp &&
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
