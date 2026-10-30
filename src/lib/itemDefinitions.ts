import type {
	AllItem,
	HomebrewForm,
	InventoryItem,
	ItemBaseCategory,
	ItemBaseRarity,
} from '@/types';

export function createDefaultItemDefinitionForm(): HomebrewForm {
	return {
		name: '',
		category: 'Weapon',
		subTypes: ['長劍 (雙用)'],
		rarity: 'Rare',
		icon: 'Sword',
		weaponProperties: {
			damage: '1d8+2 揮砍',
			mastery: 'Vex',
			properties: [],
		},
		armorProperties: { ac: '' },
		weight: '3',
		valueGp: '1000',
		quantity: '1',
		isRequireAttunement: true,
		isIdentified: false,
		maxCharges: '0',
		effects: '',
		flavor: '',
		dmNotes: '',
		isPrivate: false,
		isEquippable: true,
		isConsumable: false,
		isImportant: false,
		isStackable: false,
		affixes: [],
	};
}

function parseNonNegativeNumber(value: string, label: string): number {
	const parsed = Number(value);
	if (!value.trim() || !Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${label}必須是大於或等於 0 的有效數值。`);
	}
	return parsed;
}

export function itemDefinitionFormToItem(form: HomebrewForm): AllItem {
	const name = form.name.trim();
	if (!name || name.length > 120) {
		throw new Error('物品名稱必須為 1 至 120 個字元。');
	}
	if (form.subTypes.some((subType) => subType.length > 120)) {
		throw new Error('每個物品子類型不可超過 120 個字元。');
	}
	const icon = form.icon.trim();
	if (!icon || icon.length > 500) {
		throw new Error('圖示名稱必須為 1 至 500 個字元。');
	}
	const maxCharges = Number(form.maxCharges);
	if (!Number.isSafeInteger(maxCharges) || maxCharges < 0) {
		throw new Error('最大充能必須是大於或等於 0 的整數。');
	}
	const common = {
		name,
		subTypes: form.subTypes.map((subType) => subType.trim()).filter(Boolean),
		rarity: form.rarity,
		icon,
		weight: parseNonNegativeNumber(form.weight, '重量'),
		valueGp: parseNonNegativeNumber(form.valueGp, '價值'),
		affixes: form.affixes,
		effects: form.effects || '無特殊規則描述。',
		flavor: form.flavor || '',
		dmNotes: form.dmNotes || '',
		maxCharges,
		isEquippable: form.isEquippable,
		isConsumable: form.isConsumable,
		isRequireAttunement: form.isRequireAttunement,
		isStackable: form.isStackable,
	};
	if (form.category === 'Weapon') {
		const damage = form.weaponProperties.damage.trim();
		if (!damage) throw new Error('武器必須填寫傷害描述。');
		return {
			...common,
			category: 'Weapon',
			weaponProperties: {
				damage,
				...(form.weaponProperties.mastery
					? { mastery: form.weaponProperties.mastery }
					: {}),
				properties: form.weaponProperties.properties,
			},
		};
	}
	if (form.category === 'Armor') {
		const ac = form.armorProperties.ac.trim();
		if (!ac) throw new Error('護甲必須填寫護甲值。');
		return { ...common, category: 'Armor', armorProperties: { ac } };
	}
	return { ...common, category: form.category };
}

type ItemDefinitionSource = AllItem &
	Partial<
		Pick<
			InventoryItem,
			'quantity' | 'isIdentified' | 'isPrivate' | 'isImportant'
		>
	>;

export function itemToDefinitionForm(
	item: ItemDefinitionSource,
): HomebrewForm {
	return {
		...createDefaultItemDefinitionForm(),
		name: item.name,
		category: item.category,
		subTypes: [...item.subTypes],
		rarity: item.rarity,
		icon: item.icon ?? 'Package',
		weaponProperties:
			item.category === 'Weapon'
				? {
						...item.weaponProperties,
						mastery: item.weaponProperties.mastery ?? '',
					}
				: { damage: '', mastery: '', properties: [] },
		armorProperties:
			item.category === 'Armor' ? { ...item.armorProperties } : { ac: '' },
		weight: String(item.weight),
		valueGp: String(item.valueGp),
		quantity: String(item.quantity ?? 1),
		isRequireAttunement: item.isRequireAttunement,
		isIdentified: item.isIdentified ?? false,
		maxCharges: String(item.maxCharges ?? 0),
		effects: item.effects,
		flavor: item.flavor ?? '',
		dmNotes: item.dmNotes ?? '',
		isPrivate: item.isPrivate ?? false,
		isEquippable: item.isEquippable,
		isConsumable: item.isConsumable,
		isImportant: item.isImportant ?? false,
		isStackable: item.isStackable ?? false,
		affixes: item.affixes.map((affix) => ({ ...affix })),
	};
}

function createAffixId(): string {
	return `affix-${crypto.randomUUID()}`;
}

export function copyItemToDefinitionForm(item: AllItem): HomebrewForm {
	const form = itemToDefinitionForm(item);
	return {
		...form,
		isIdentified: false,
		isPrivate: false,
		quantity: '1',
		affixes: form.affixes.map((affix) => ({
			...affix,
			id: createAffixId(),
		})),
	};
}

export function createBlankItemDefinitionForm(
	category: ItemBaseCategory = 'Misc',
	rarity: ItemBaseRarity = 'Common',
): HomebrewForm {
	return {
		...createDefaultItemDefinitionForm(),
		category,
		rarity,
		name: '',
		subTypes: [],
		icon: 'Package',
		weaponProperties: { damage: '', mastery: '', properties: [] },
		armorProperties: { ac: '' },
		weight: '0',
		valueGp: '0',
		isRequireAttunement: false,
		isEquippable: false,
		isConsumable: false,
		isStackable: false,
	};
}
