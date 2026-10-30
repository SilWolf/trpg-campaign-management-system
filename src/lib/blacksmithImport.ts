import type {
	AllItem,
	BlacksmithItem,
	BlacksmithTemplate,
} from '@/types';

export type BlacksmithImportSource = BlacksmithItem | BlacksmithTemplate;

export type BlacksmithImportDefinition = AllItem & {
	isHomebrew: boolean;
	isImportant: boolean;
};

export type DbBlacksmithImportDefinition = {
	is_homebrew: boolean;
	is_important: boolean;
	item_base: AllItem;
};

export function toBlacksmithItemBase(source: AllItem): AllItem {
	const base = {
		name: source.name,
		subTypes: [...source.subTypes],
		rarity: source.rarity,
		icon: source.icon ?? null,
		weight: source.weight,
		valueGp: source.valueGp,
		affixes: (source.affixes ?? []).map((affix) => ({ ...affix })),
		effects: source.effects,
		flavor: source.flavor ?? null,
		dmNotes: source.dmNotes,
		maxCharges: source.maxCharges ?? null,
		isEquippable: source.isEquippable,
		isConsumable: source.isConsumable,
		isRequireAttunement: source.isRequireAttunement,
		isStackable: source.isStackable ?? false,
	};
	if (source.category === 'Weapon') {
		return {
			...base,
			category: 'Weapon',
			weaponProperties: { ...source.weaponProperties },
		};
	}
	if (source.category === 'Armor') {
		return {
			...base,
			category: 'Armor',
			armorProperties: { ...source.armorProperties },
		};
	}
	return { ...base, category: source.category };
}

export function toBlacksmithImportDefinition(
	source: BlacksmithImportSource,
): BlacksmithImportDefinition {
	return {
		...toBlacksmithItemBase(source),
		isHomebrew: 'catalogId' in source ? false : source.isHomebrew,
		isImportant: 'catalogId' in source ? false : source.isImportant,
	};
}

export function toDbBlacksmithImportDefinition(
	item: BlacksmithImportDefinition,
): DbBlacksmithImportDefinition {
	return {
		item_base: toBlacksmithItemBase(item),
		is_homebrew: item.isHomebrew,
		is_important: item.isImportant,
	};
}
