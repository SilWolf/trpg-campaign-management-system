import type {
	BlacksmithItem,
	BlacksmithTemplate,
	InventoryItem,
	WeaponMasteryKey,
} from '@/types';

export type BlacksmithImportSource = BlacksmithItem | BlacksmithTemplate;

export type BlacksmithImportDefinition = Pick<
	InventoryItem,
	| 'name'
	| 'category'
	| 'subType'
	| 'rarity'
	| 'icon'
	| 'damage'
	| 'mastery'
	| 'ac'
	| 'weight'
	| 'valueGp'
	| 'requiresAttunement'
	| 'isHomebrew'
	| 'maxCharges'
	| 'effects'
	| 'flavor'
	| 'dmNotes'
	| 'isEquippable'
	| 'isConsumable'
	| 'isImportant'
	| 'affixes'
>;

export type DbBlacksmithImportDefinition = {
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
};

const WEAPON_MASTERIES: WeaponMasteryKey[] = [
	'None',
	'Cleave',
	'Graze',
	'Nick',
	'Push',
	'Sap',
	'Slow',
	'Topple',
	'Vex',
];

function isWeaponMasteryKey(value: string): value is WeaponMasteryKey {
	return WEAPON_MASTERIES.includes(value as WeaponMasteryKey);
}

export function toBlacksmithImportDefinition(
	source: BlacksmithImportSource,
): BlacksmithImportDefinition {
	if ('catalogId' in source) {
		return {
			name: source.name,
			category: source.category,
			subType: source.subTypes.join('、'),
			rarity: source.rarity,
			icon: source.icon,
			damage: source.category === 'Armor' ? null : source.damage,
			mastery:
				source.category === 'Weapon' &&
				source.weaponMastery &&
				isWeaponMasteryKey(source.weaponMastery)
					? source.weaponMastery
					: 'None',
			ac: source.category === 'Armor' ? source.ac : null,
			weight: source.weight,
			valueGp: source.valueGp,
			requiresAttunement: source.requiresAttunement,
			isHomebrew: false,
			maxCharges: 0,
			effects: source.description,
			flavor: source.source,
			dmNotes: '',
			isEquippable:
				source.category === 'Weapon' ||
				source.category === 'Armor' ||
				source.requiresAttunement,
			isConsumable: source.category === 'Consumable',
			isImportant: false,
			affixes: [],
		};
	}

	return {
		name: source.name,
		category: source.category,
		subType: source.subType,
		rarity: source.rarity,
		icon: source.icon,
		damage: source.damage,
		mastery: source.mastery,
		ac: source.ac,
		weight: source.weight,
		valueGp: source.valueGp,
		requiresAttunement: source.requiresAttunement,
		isHomebrew: source.isHomebrew,
		maxCharges: source.maxCharges,
		effects: source.effects,
		flavor: source.flavor,
		dmNotes: source.dmNotes,
		isEquippable: source.isEquippable,
		isConsumable: source.isConsumable,
		isImportant: source.isImportant,
		affixes: source.affixes,
	};
}

export function toDbBlacksmithImportDefinition(
	item: BlacksmithImportDefinition,
): DbBlacksmithImportDefinition {
	return {
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
		is_equippable: Boolean(item.isEquippable),
		is_consumable: Boolean(item.isConsumable),
		is_important: Boolean(item.isImportant),
		affixes: item.affixes ?? [],
	};
}
