/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
	AlertCircle,
	Check,
	Image,
	PackagePlus,
	Pencil,
	Plus,
	RotateCw,
	Store,
	Trash2,
	X,
} from 'lucide-react';
import { RARITY_CONFIG, WEAPON_MASTERIES } from '@/data';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	createCampaignShopItems,
	deleteCampaignShopItem,
	loadCampaignShopItems,
	loadCampaignShops,
	saveCampaignShop,
	saveCampaignShopItem,
	type CampaignShopItemValues,
	type CampaignShopValues,
} from '@/lib/campaignShops';
import { parseCampaignShopImport } from '@/lib/campaignShopImport';
import {
	loadBlacksmithCatalogDefinitions,
	loadBlacksmithCatalogs,
} from '@/lib/blacksmithCatalog';
import { loadBlacksmithTemplates } from '@/lib/blacksmithItems';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button, Input, Textarea } from '@/components/ui';
import ItemIcon from '../../-parts/ItemIcon';
import { ShopTransactionsPanel } from '../-parts/ShopTransactionsPanel';
import type {
	BlacksmithItem,
	BlacksmithTemplate,
	CampaignShop,
	CampaignShopItem,
	CampaignShopItemSnapshot,
	CampaignShopItemSourceType,
	ItemCategory,
	ItemAffix,
	Rarity,
	WeaponMasteryKey,
} from '@/types';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/shops/$shopId/settings',
)({
	component: CampaignShopsPage,
});

type ShopForm = {
	name: string;
	backgroundImageUrl: string;
	isActive: boolean;
};

type ItemForm = {
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
	requiresAttunement: boolean;
	maxCharges: string;
	effects: string;
	flavor: string;
	dmNotes: string;
	isEquippable: boolean;
	isConsumable: boolean;
	isImportant: boolean;
	affixesJson: string;
	unitPriceGp: string;
	stockAvailable: string;
	requiresApproval: boolean;
	isActive: boolean;
};

type SourceTab = 'catalog' | 'mine' | 'shared';

interface ImportSource {
	key: string;
	name: string;
	detail: string;
	sourceType: Exclude<CampaignShopItemSourceType, 'manual'>;
	sourceId: string;
	snapshot: CampaignShopItemSnapshot;
}

const EMPTY_SHOP: ShopForm = {
	name: '',
	backgroundImageUrl: '',
	isActive: true,
};

const EMPTY_ITEM: ItemForm = {
	name: '',
	category: 'Misc',
	subType: '',
	rarity: 'Common',
	icon: 'Package',
	damage: '',
	mastery: 'None',
	ac: '',
	weight: '0',
	valueGp: '0',
	requiresAttunement: false,
	maxCharges: '0',
	effects: '',
	flavor: '',
	dmNotes: '',
	isEquippable: false,
	isConsumable: false,
	isImportant: false,
	affixesJson: '[]',
	unitPriceGp: '1',
	stockAvailable: '0',
	requiresApproval: false,
	isActive: true,
};

const INPUT_CLASS =
	'w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
	Weapon: '武器',
	Armor: '護甲',
	Consumable: '消耗品',
	Misc: '雜物',
};

const WEAPON_MASTERY_KEYS: ReadonlySet<string> = new Set([
	'None',
	'Cleave',
	'Graze',
	'Nick',
	'Push',
	'Sap',
	'Slow',
	'Topple',
	'Vex',
]);

const ITEM_CATEGORIES: { value: ItemCategory; label: string }[] = [
	{ value: 'Weapon', label: '武器' },
	{ value: 'Armor', label: '護甲' },
	{ value: 'Consumable', label: '消耗品' },
	{ value: 'Misc', label: '雜物' },
];
const ITEM_RARITIES: Rarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];

function isWeaponMasteryKey(value: string): value is WeaponMasteryKey {
	return WEAPON_MASTERY_KEYS.has(value);
}

function itemFormFromSnapshot(
	snapshot: CampaignShopItemSnapshot,
	item?: Pick<
		CampaignShopItem,
		'unitPriceGp' | 'stockAvailable' | 'requiresApproval' | 'isActive'
	>,
): ItemForm {
	return {
		name: snapshot.name,
		category: snapshot.category,
		subType: snapshot.subType,
		rarity: snapshot.rarity,
		icon: snapshot.icon,
		damage: snapshot.damage ?? '',
		mastery: snapshot.mastery,
		ac: snapshot.ac ?? '',
		weight: String(snapshot.weight),
		valueGp: String(snapshot.valueGp),
		requiresAttunement: snapshot.requiresAttunement,
		maxCharges: String(snapshot.maxCharges),
		effects: snapshot.effects,
		flavor: snapshot.flavor,
		dmNotes: snapshot.dmNotes,
		isEquippable: Boolean(snapshot.isEquippable),
		isConsumable: Boolean(snapshot.isConsumable),
		isImportant: Boolean(snapshot.isImportant),
		affixesJson: JSON.stringify(snapshot.affixes ?? [], null, 2),
		unitPriceGp: String(item?.unitPriceGp ?? Math.max(snapshot.valueGp, 0.01)),
		stockAvailable: String(item?.stockAvailable ?? 0),
		requiresApproval: item?.requiresApproval ?? false,
		isActive: item?.isActive ?? true,
	};
}

function parseAffixes(value: string): ItemAffix[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error('附魔詞條必須是有效的 JSON 陣列。');
	}
	if (
		!Array.isArray(parsed) ||
		!parsed.every(
			(entry) =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof entry.id === 'string' &&
				typeof entry.name === 'string' &&
				typeof entry.desc === 'string' &&
				(entry.isHidden === undefined || typeof entry.isHidden === 'boolean'),
		)
	) {
		throw new Error('每筆附魔詞條都必須包含字串 id、name、desc 及選用的布林 isHidden。');
	}
	return parsed;
}

function snapshotFromTemplate(
	template: BlacksmithTemplate,
): CampaignShopItemSnapshot {
	return {
		name: template.name,
		category: template.category,
		subType: template.subType,
		rarity: template.rarity,
		icon: template.icon,
		damage: template.damage,
		mastery: template.mastery,
		ac: template.ac,
		weight: template.weight,
		valueGp: template.valueGp,
		requiresAttunement: template.requiresAttunement,
		isHomebrew: true,
		maxCharges: template.maxCharges,
		effects: template.effects,
		flavor: template.flavor,
		dmNotes: template.dmNotes,
		isEquippable: template.isEquippable,
		isConsumable: template.isConsumable,
		isImportant: template.isImportant,
		affixes: template.affixes,
	};
}

function snapshotFromCatalog(item: BlacksmithItem): CampaignShopItemSnapshot {
	return {
		name: item.name,
		category: item.category,
		subType: item.subTypes.join('、'),
		rarity: item.rarity,
		icon: item.icon,
		damage: item.category === 'Armor' ? null : item.damage,
		mastery:
			item.category === 'Weapon' &&
			item.weaponMastery &&
			isWeaponMasteryKey(item.weaponMastery)
				? item.weaponMastery
				: 'None',
		ac: item.category === 'Armor' ? item.ac : null,
		weight: item.weight,
		valueGp: item.valueGp,
		requiresAttunement: item.requiresAttunement,
		isHomebrew: false,
		maxCharges: 0,
		effects: item.description,
		flavor: '',
		dmNotes: '',
		isEquippable: item.category === 'Weapon' || item.category === 'Armor',
		isConsumable: item.category === 'Consumable',
		isImportant: false,
		affixes: [],
	};
}

function manualSnapshot(name: string): CampaignShopItemSnapshot {
	return {
		name,
		category: 'Misc',
		subType: '',
		rarity: 'Common',
		icon: 'Package',
		damage: null,
		mastery: 'None',
		ac: null,
		weight: 0,
		valueGp: 0,
		requiresAttunement: false,
		isHomebrew: false,
		maxCharges: 0,
		effects: '',
		flavor: '',
		dmNotes: '',
		isEquippable: false,
		isConsumable: false,
		isImportant: false,
		affixes: [],
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return fallback;
}

function CampaignShopsPage() {
	const { campaignId, shopId } = Route.useParams();
	const { isDm, loading: roleLoading } = useUserCampaignRole(campaignId);
	const { user, isGuest } = useAuth();
	const [shops, setShops] = useState<CampaignShop[]>([]);
	const [shopItems, setShopItems] = useState<CampaignShopItem[]>([]);
	const [shopForm, setShopForm] = useState<ShopForm>(EMPTY_SHOP);
	const [editingShopId, setEditingShopId] = useState<string | null>(null);
	const [isShopEditorOpen, setIsShopEditorOpen] = useState(false);
	const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
	const [editingItem, setEditingItem] = useState<CampaignShopItem | null>(null);
	const [deleteConfirmationItemId, setDeleteConfirmationItemId] = useState<string | null>(null);
	const [selectedSource, setSelectedSource] = useState<ImportSource | null>(null);
	const [sourceTab, setSourceTab] = useState<SourceTab>('catalog');
	const [sourceQuery, setSourceQuery] = useState('');
	const [sources, setSources] = useState<ImportSource[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingSources, setIsLoadingSources] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [sourceError, setSourceError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [batchText, setBatchText] = useState('');

	const selectedShop = shops.find((shop) => shop.id === shopId) ?? null;
	const visibleItems = shopItems;
	const importRows = useMemo(
		() => parseCampaignShopImport(batchText),
		[batchText],
	);
	const visibleSources = useMemo(() => {
		const query = sourceQuery.trim().toLocaleLowerCase();
		return sources.filter((source) => {
			if (
				sourceTab === 'mine' &&
				(source.sourceType !== 'blacksmith' || source.detail !== '我的樣板')
			) {
				return false;
			}
			if (sourceTab === 'shared' && source.detail !== '分享樣板') return false;
			if (sourceTab === 'catalog' && source.sourceType !== 'catalog') return false;
			return (
				!query ||
				`${source.name} ${source.detail} ${source.snapshot.subType}`
					.toLocaleLowerCase()
					.includes(query)
			);
		});
	}, [sourceQuery, sourceTab, sources]);

	const reloadShops = useCallback(async () => {
		setShops(await loadCampaignShops(campaignId));
	}, [campaignId]);

	const reloadItems = useCallback(async () => {
		if (!shopId) {
			setShopItems([]);
			return;
		}
		setShopItems(await loadCampaignShopItems(campaignId, shopId));
	}, [campaignId, shopId]);

	useEffect(() => {
		let isMounted = true;
		if (!isSupabaseConfigured || isGuest) {
			return () => {
				isMounted = false;
			};
		}

		Promise.resolve()
			.then(() => loadCampaignShops(campaignId))
			.then((nextShops) => {
				if (!isMounted) return;
				setShops(nextShops);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(getErrorMessage(error, '載入戰役商店失敗。'));
				}
			})
			.finally(() => {
				if (isMounted) setIsLoading(false);
			});

		return () => {
			isMounted = false;
		};
	}, [campaignId, isGuest]);

	useEffect(() => {
		let isMounted = true;
		if (!shopId || !isSupabaseConfigured || isGuest) {
			return () => {
				isMounted = false;
			};
		}
		Promise.resolve()
			.then(() => loadCampaignShopItems(campaignId, shopId))
			.then((nextItems) => {
				if (isMounted) setShopItems(nextItems);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(getErrorMessage(error, '載入商店商品失敗。'));
				}
			});
		return () => {
			isMounted = false;
		};
	}, [campaignId, isGuest, shopId]);

	useEffect(() => {
		if (!isDm || !user?.id || isGuest) return;
		let isMounted = true;
		Promise.resolve().then(() => {
			if (isMounted) {
				setIsLoadingSources(true);
				setSourceError(null);
			}
			return Promise.all([
			loadBlacksmithCatalogDefinitions().then(async (definitions) =>
				(
					await Promise.all(
						definitions.map(async (definition) =>
							(await loadBlacksmithCatalogs(definition.catalogId)).map(
								(item): ImportSource => ({
									key: `catalog:${item.catalogId}:${item.itemId}`,
									name: item.name,
									detail: `${definition.title}・${CATEGORY_LABELS[item.category]}`,
									sourceType: 'catalog',
									sourceId: `${item.catalogId}:${item.itemId}`,
									snapshot: snapshotFromCatalog(item),
								}),
							),
						),
					)
				).flat(),
			),
			loadBlacksmithTemplates(user.id),
			]);
		})
			.then(([catalogSources, templates]) => {
				if (!isMounted) return;
				const templateSources = [
					...templates.mine.map((template) => ({
						key: `mine:${template.id}`,
						name: template.name,
						detail: '我的樣板',
						sourceType: 'blacksmith' as const,
						sourceId: template.id,
						snapshot: snapshotFromTemplate(template),
					})),
					...templates.shared.map((template) => ({
						key: `shared:${template.id}`,
						name: template.name,
						detail: '分享樣板',
						sourceType: 'blacksmith' as const,
						sourceId: template.id,
						snapshot: snapshotFromTemplate(template),
					})),
				];
				setSources([...catalogSources, ...templateSources]);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setSourceError(getErrorMessage(error, '載入鍛造工坊來源失敗。'));
				}
			})
			.finally(() => {
				if (isMounted) setIsLoadingSources(false);
			});
		return () => {
			isMounted = false;
		};
	}, [isDm, isGuest, user?.id]);

	useEffect(() => {
		if (!supabase || isGuest) return;
		const channel = supabase
			.channel(`campaign-shops-${campaignId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'campaign_shops',
					filter: `campaign_id=eq.${campaignId}`,
				},
				() => {
					void reloadShops().catch((error: unknown) =>
						setErrorMessage(getErrorMessage(error, '同步商店資料失敗。')),
					);
				},
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'campaign_shop_items',
					filter: `campaign_id=eq.${campaignId}`,
				},
				() => {
					void reloadItems().catch((error: unknown) =>
						setErrorMessage(getErrorMessage(error, '同步商品資料失敗。')),
					);
				},
			)
			.subscribe();
		return () => {
			void supabase?.removeChannel(channel);
		};
	}, [campaignId, isGuest, reloadItems, reloadShops]);

	const handleSaveShop = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = shopForm.name.trim();
		if (!name || name.length > 120) {
			setErrorMessage('商店名稱必須為 1 至 120 個字元。');
			return;
		}
		const imageUrl = shopForm.backgroundImageUrl.trim();
		if (imageUrl) {
			try {
				const parsed = new URL(imageUrl);
				if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
					throw new Error('invalid protocol');
				}
			} catch {
				setErrorMessage('背景圖片網址必須是有效的 http 或 https 網址。');
				return;
			}
		}

		setIsSaving(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			const values: CampaignShopValues = {
				name,
				backgroundImageUrl: imageUrl || null,
				isActive: shopForm.isActive,
			};
			await saveCampaignShop(
				campaignId,
				values,
				editingShopId ?? undefined,
			);
			await reloadShops();
			setIsShopEditorOpen(false);
			setEditingShopId(null);
			setShopForm(EMPTY_SHOP);
			setNotice(editingShopId ? '商店設定已更新。' : '商店已建立。');
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '儲存商店失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const startShopEdit = (shop: CampaignShop) => {
		setEditingShopId(shop.id);
		setShopForm({
			name: shop.name,
			backgroundImageUrl: shop.backgroundImageUrl ?? '',
			isActive: shop.isActive,
		});
		setIsShopEditorOpen(true);
		setErrorMessage(null);
	};

	const startItemEdit = (item: CampaignShopItem) => {
		setEditingItem(item);
		setSelectedSource(null);
		setItemForm(itemFormFromSnapshot(item.itemSnapshot, item));
		setDeleteConfirmationItemId(null);
		setErrorMessage(null);
	};

	const validateItemForm = (): {
		name: string;
		unitPriceGp: number;
		stockAvailable: number;
		itemSnapshot: CampaignShopItemSnapshot;
	} => {
		const name = itemForm.name.trim();
		const unitPriceGp = Number(itemForm.unitPriceGp);
		const stockAvailable = Number(itemForm.stockAvailable);
		if (!name || name.length > 120) {
			throw new Error('商品名稱必須為 1 至 120 個字元。');
		}
		if (
			!Number.isFinite(unitPriceGp) ||
			unitPriceGp <= 0 ||
			unitPriceGp >= 10_000_000_000 ||
			!/^\d+(?:\.\d{1,2})?$/.test(itemForm.unitPriceGp)
		) {
			throw new Error('單價必須大於 0，且小於 10,000,000,000 gp，最多兩位小數。');
		}
		if (
			!Number.isSafeInteger(stockAvailable) ||
			stockAvailable < 0 ||
			stockAvailable > 2_147_483_647
		) {
			throw new Error('可用庫存必須是 0 至 2,147,483,647 的整數。');
		}
		if (!itemForm.icon.trim() || itemForm.icon.trim().length > 500) {
			throw new Error('圖示名稱必須為 1 至 500 個字元。');
		}
		if (itemForm.subType.length > 120) {
			throw new Error('物品子類型不可超過 120 個字元。');
		}
		const parseItemNumber = (value: string, label: string) => {
			if (!value.trim()) throw new Error(`${label}不可空白。`);
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed < 0) {
				throw new Error(`${label}必須是大於或等於 0 的有效數值。`);
			}
			return parsed;
		};
		const weight = parseItemNumber(itemForm.weight, '重量');
		const valueGp = parseItemNumber(itemForm.valueGp, '物品價值');
		const maxCharges = parseItemNumber(itemForm.maxCharges, '最大充能');
		if (!Number.isInteger(maxCharges)) throw new Error('最大充能必須是整數。');
		const itemSnapshot: CampaignShopItemSnapshot = {
			name,
			category: itemForm.category,
			subType: itemForm.subType.trim(),
			rarity: itemForm.rarity,
			icon: itemForm.icon.trim(),
			damage: itemForm.damage.trim() || null,
			mastery: itemForm.mastery,
			ac: itemForm.ac.trim() || null,
			weight,
			valueGp,
			requiresAttunement: itemForm.requiresAttunement,
			isHomebrew: editingItem?.itemSnapshot.isHomebrew ?? selectedSource?.snapshot.isHomebrew ?? true,
			maxCharges,
			effects: itemForm.effects,
			flavor: itemForm.flavor,
			dmNotes: itemForm.dmNotes,
			isEquippable: itemForm.isEquippable,
			isConsumable: itemForm.isConsumable,
			isImportant: itemForm.isImportant,
			affixes: parseAffixes(itemForm.affixesJson),
		};
		return { name, unitPriceGp, stockAvailable, itemSnapshot };
	};

	const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedShop) return;
		setIsSaving(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			const { unitPriceGp, stockAvailable, itemSnapshot } = validateItemForm();
			if (editingItem) {
				const values: CampaignShopItemValues = {
					itemSnapshot,
					sourceType: editingItem.sourceType,
					sourceId: editingItem.sourceId,
					unitPriceGp,
					stockAvailable,
					requiresApproval: itemForm.requiresApproval,
					isActive: itemForm.isActive,
				};
				await saveCampaignShopItem(
					campaignId,
					selectedShop.id,
					values,
					editingItem.id,
				);
				setNotice('商品設定已更新。');
			} else {
				const source = selectedSource;
				if (!source) throw new Error('找不到要匯入的鍛造物品來源。');
				await saveCampaignShopItem(campaignId, selectedShop.id, {
					itemSnapshot,
					sourceType: source.sourceType,
					sourceId: source.sourceId,
					unitPriceGp,
					stockAvailable,
					requiresApproval: itemForm.requiresApproval,
					isActive: itemForm.isActive,
				});
				setNotice('商品已加入商店。');
			}
			await reloadItems();
			setEditingItem(null);
			setSelectedSource(null);
			setItemForm(EMPTY_ITEM);
			setDeleteConfirmationItemId(null);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '儲存商品失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const beginSourceImport = (source: ImportSource) => {
		setEditingItem(null);
		setSelectedSource(source);
		setItemForm(itemFormFromSnapshot(source.snapshot));
		setDeleteConfirmationItemId(null);
		setErrorMessage(null);
	};

	const handleDeleteItem = async (item: CampaignShopItem) => {
		if (deleteConfirmationItemId !== item.id) {
			setDeleteConfirmationItemId(item.id);
			return;
		}
		if (!selectedShop) return;
		setIsSaving(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			await deleteCampaignShopItem(campaignId, selectedShop.id, item.id);
			await reloadItems();
			setEditingItem(null);
			setDeleteConfirmationItemId(null);
			setNotice('商品與其關聯的訂單紀錄已刪除。');
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '刪除商品失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const handleBatchImport = async () => {
		if (!selectedShop || importRows.errors.length || importRows.rows.length === 0) {
			return;
		}
		setIsSaving(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			const rows: CampaignShopItemValues[] = importRows.rows.map((row) => ({
				itemSnapshot: manualSnapshot(row.name),
				sourceType: 'manual',
				sourceId: null,
				unitPriceGp: row.unitPriceGp,
				stockAvailable: row.stockAvailable,
				requiresApproval: false,
				isActive: true,
			}));
			await createCampaignShopItems(campaignId, selectedShop.id, rows);
			await reloadItems();
			setBatchText('');
			setNotice(`已匯入 ${rows.length} 項手動商品。`);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '批次匯入商品失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const updateItemForm = <K extends keyof ItemForm>(
		key: K,
		value: ItemForm[K],
	) => setItemForm((current) => ({ ...current, [key]: value }));

	if (!isSupabaseConfigured || isGuest) {
		return (
			<main className='relative z-10 mx-auto max-w-5xl px-4 py-10 text-stone-200'>
				<div className='rounded-lg border border-amber-800/50 bg-stone-900/80 p-6'>
					<h1 className='font-serif text-2xl font-bold text-amber-200'>戰役商店</h1>
					<p className='mt-3 text-sm text-stone-400'>
						商店雲端功能需要登入 Supabase 帳號；離線或訪客模式不會建立本機商店或假冒同步狀態。
					</p>
					<Link
						to='/campaigns/$campaignId'
						params={{ campaignId }}
						className='mt-5 inline-flex text-sm text-amber-300 hover:text-amber-200'
					>
						返回軍械庫
					</Link>
				</div>
			</main>
		);
	}

	if (!roleLoading && !isDm) {
		return (
			<main className='rounded-lg border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-200'>
				只有 DM 可以管理商店。
				<Link
					to='/campaigns/$campaignId/shops/$shopId'
					params={{ campaignId, shopId }}
					className='ml-2 text-amber-300 hover:text-amber-200'
				>
					返回商店
				</Link>
			</main>
		);
	}

	return (
		<main
			data-testid='campaign-shops-page'
			data-campaign-id={campaignId}
			className='relative z-10 mx-auto max-w-7xl px-4 py-6 text-stone-200 lg:px-8'
		>
			<div className='mb-6 flex flex-col justify-between gap-4 border-b border-amber-900/40 pb-5 sm:flex-row sm:items-end'>
				<div>
					<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
						戰役商店
					</p>
					<h1 className='mt-1 font-serif text-3xl font-bold text-amber-100'>
						{selectedShop?.name ?? '冒險補給與珍寶'}
					</h1>
					<p className='mt-2 text-sm text-stone-400'>
						商店商品為獨立快照；鍛造來源後續變更不會改寫既有商品。
					</p>
				</div>
				<div className='flex flex-wrap gap-2'>
					<Button
						type='button'
						variant='secondary'
						onClick={() => {
							void reloadShops()
								.then(reloadItems)
								.catch((error: unknown) =>
									setErrorMessage(getErrorMessage(error, '重新載入商店失敗。')),
								);
						}}
						className='border border-stone-700 bg-stone-900 text-stone-300'
					>
						<RotateCw className='h-4 w-4' />
						重新整理
					</Button>

				</div>
			</div>

			{errorMessage && (
				<div role='alert' className='mb-4 flex items-start gap-2 rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200'>
					<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
					<span>{errorMessage}</span>
				</div>
			)}
			{notice && (
				<div role='status' className='mb-4 rounded-md border border-emerald-800/70 bg-emerald-950/30 p-3 text-sm text-emerald-200'>
					{notice}
				</div>
			)}

			{isShopEditorOpen && (
				<form
					onSubmit={handleSaveShop}
					className='mb-6 grid gap-4 rounded-lg border border-amber-800/50 bg-stone-900/80 p-4 sm:grid-cols-2'
					data-testid='shop-editor'
				>
					<div className='sm:col-span-2 flex items-center justify-between'>
						<h2 className='font-serif text-xl font-bold text-amber-200'>
							{editingShopId ? '編輯商店' : '建立商店'}
						</h2>
						<Button
							type='button'
							variant='ghost'
							aria-label='關閉商店編輯'
							onClick={() => setIsShopEditorOpen(false)}
							className='text-stone-400 hover:text-stone-100'
						>
							<X className='h-4 w-4' />
						</Button>
					</div>
					<label className='text-sm text-stone-300'>
						商店名稱
						<Input
							required
							maxLength={120}
							value={shopForm.name}
							onChange={(event) =>
								setShopForm((current) => ({ ...current, name: event.target.value }))
							}
							className={`mt-1 ${INPUT_CLASS}`}
							placeholder='例如：灰港冒險者商會'
							data-testid='shop-name'
						/>
					</label>
					<label className='text-sm text-stone-300'>
						背景圖片網址（選填）
						<Input
							type='url'
							maxLength={2048}
							value={shopForm.backgroundImageUrl}
							onChange={(event) =>
								setShopForm((current) => ({
									...current,
									backgroundImageUrl: event.target.value,
								}))
							}
							className={`mt-1 ${INPUT_CLASS}`}
							placeholder='https://example.com/shop.webp'
						/>
					</label>
					{shopForm.backgroundImageUrl && (
						<div className='sm:col-span-2 overflow-hidden rounded-md border border-stone-700'>
							<img
								src={shopForm.backgroundImageUrl}
								alt='商店背景預覽'
								className='h-36 w-full object-cover'
								onError={(event) => {
									event.currentTarget.style.display = 'none';
								}}
							/>
						</div>
					)}
					<label className='flex items-center gap-2 text-sm text-stone-300 sm:col-span-2'>
						<input
							type='checkbox'
							checked={shopForm.isActive}
							onChange={(event) =>
								setShopForm((current) => ({
									...current,
									isActive: event.target.checked,
								}))
							}
							className='accent-amber-500'
						/>
						啟用商店（停用後只對 DM 顯示，歷史資料保留）
					</label>
					<div className='sm:col-span-2 flex justify-end gap-2'>
						<Button
							type='button'
							variant='ghost'
							onClick={() => setIsShopEditorOpen(false)}
							className='text-stone-400'
						>
							取消
						</Button>
						<Button
							type='submit'
							loading={isSaving}
							className='border border-amber-500/60 bg-amber-800 text-amber-50'
						>
							<Check className='h-4 w-4' />
							儲存商店
						</Button>
					</div>
				</form>
			)}

			{isLoading || roleLoading ? (
				<div className='rounded-lg border border-stone-800 bg-stone-900/60 p-8 text-center text-sm text-stone-400'>
					載入戰役商店中…
				</div>
			) : (
				<section className='min-w-0 space-y-6'>
						{selectedShop ? (
							<>
								<div className='overflow-hidden rounded-lg border border-stone-800 bg-stone-900/70'>
									{selectedShop.backgroundImageUrl ? (
										<img
											src={selectedShop.backgroundImageUrl}
											alt=''
											className='h-48 w-full object-cover'
											onError={(event) => {
												event.currentTarget.style.display = 'none';
											}}
										/>
									) : (
										<div className='flex h-36 items-center justify-center bg-gradient-to-br from-amber-950/50 via-stone-900 to-stone-950'>
											<Image className='h-8 w-8 text-amber-900' />
										</div>
									)}
									<div className='flex items-center justify-between gap-3 px-4 py-3'>
										<div>
											<h2 className='font-serif text-xl font-bold text-amber-100'>
												{selectedShop.name}
											</h2>
											<p className='mt-1 text-xs text-stone-500'>
												{selectedShop.isActive ? '營業中' : '已停用'}
											</p>
										</div>
										<Button
											type='button'
											variant='secondary'
											onClick={() => startShopEdit(selectedShop)}
											className='border border-stone-700 bg-stone-950 text-stone-300'
										>
											<Pencil className='h-4 w-4' />
											編輯商店
										</Button>
									</div>
								</div>

								<div className='rounded-lg border border-stone-800 bg-stone-900/50 p-4'>
									<div className='mb-4 flex items-center justify-between'>
										<div>
											<h2 className='font-serif text-xl font-bold text-amber-100'>
												商品目錄
											</h2>
											<p className='mt-1 text-xs text-stone-500'>
												可用庫存不包含待審保留數量。
											</p>
										</div>
										<span className='font-mono text-xs text-stone-500'>
											{visibleItems.length} 項
										</span>
									</div>
									{visibleItems.length === 0 ? (
										<div className='rounded-md border border-dashed border-stone-700 p-8 text-center text-sm text-stone-500'>
											<PackagePlus className='mx-auto mb-2 h-6 w-6 text-stone-600' />
											尚無商品
										</div>
									) : (
										<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
											{visibleItems.map((item) => (
												<article
													key={item.id}
													className={`overflow-hidden rounded-xl border bg-gradient-to-b p-4 ${RARITY_CONFIG[item.itemSnapshot.rarity].border} ${RARITY_CONFIG[item.itemSnapshot.rarity].bg} ${RARITY_CONFIG[item.itemSnapshot.rarity].glow}`}
													data-testid='shop-item-card'
												>
													<div className={`-mx-4 -mt-4 mb-3 flex items-start gap-3 border-b border-stone-800 bg-gradient-to-r p-4 ${RARITY_CONFIG[item.itemSnapshot.rarity].headerGradient}`}>
														<div className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${RARITY_CONFIG[item.itemSnapshot.rarity].border} bg-stone-950`}>
															<ItemIcon iconName={item.itemSnapshot.icon} className='h-7 w-7 text-stone-300' />
														</div>
														<div className='min-w-0 flex-1'>
															<h3 className={`truncate font-serif font-bold ${RARITY_CONFIG[item.itemSnapshot.rarity].text}`}>
																{item.itemSnapshot.name}
															</h3>
															<p className='mt-1 text-xs text-stone-400'>
																{CATEGORY_LABELS[item.itemSnapshot.category]}・
																{item.itemSnapshot.subType || '未分類'}・
																{RARITY_CONFIG[item.itemSnapshot.rarity].label}
															</p>
															{!item.isActive && <span className='mt-1 inline-block text-[10px] text-stone-500'>停用</span>}
														</div>
													</div>
													<p className='line-clamp-3 whitespace-pre-wrap text-sm text-stone-300'>
														{item.itemSnapshot.effects || item.itemSnapshot.flavor || '尚無效果描述。'}
													</p>
													<div className='mt-3 flex flex-wrap gap-2 text-xs text-stone-400'>
														{item.itemSnapshot.damage && <span>傷害 {item.itemSnapshot.damage}</span>}
														{item.itemSnapshot.ac && <span>護甲值 {item.itemSnapshot.ac}</span>}
														{item.itemSnapshot.requiresAttunement && <span className='text-purple-300'>需調諧</span>}
														{item.itemSnapshot.isImportant && <span className='text-amber-300'>重要物品</span>}
													</div>
													<p className='mt-3 font-mono text-xs text-stone-500'>
														重量 {item.itemSnapshot.weight} lb · 物品價值 {item.itemSnapshot.valueGp} GP
													</p>
													<p className='mt-3 font-mono text-lg text-amber-300'>
														{item.unitPriceGp.toLocaleString('zh-TW')} gp
													</p>
													<div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500'>
														<span>
															可用{' '}
															<span className='font-mono text-stone-300'>
																{item.stockAvailable}
															</span>
														</span>
														<span>
															保留{' '}
															<span className='font-mono text-stone-300'>
																{item.stockReserved}
															</span>
														</span>
														{item.requiresApproval && (
															<span className='text-purple-300'>需 DM 審查</span>
														)}
													</div>
													<Button
														type='button'
														variant='ghost'
														size='sm'
														onClick={() => startItemEdit(item)}
														className='mt-3 w-full border border-stone-800 text-stone-300 hover:border-amber-800 hover:text-amber-200'
													>
														<Pencil className='h-3.5 w-3.5' />
														編輯商品
													</Button>
												</article>
											))}
										</div>
									)}
								</div>
							</>
						) : (
							<div className='rounded-lg border border-dashed border-stone-700 bg-stone-900/40 p-10 text-center'>
								<Store className='mx-auto mb-3 h-8 w-8 text-stone-600' />
								<p className='text-stone-400'>
									建立第一家戰役商店以開始管理商品。
								</p>
							</div>
						)}

						{selectedShop && (
							<>
								{(editingItem || selectedSource) && (
									<div className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4'>
										<form
											onSubmit={handleSaveItem}
											className='my-auto max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-xl border border-purple-800/70 bg-stone-950 p-5 shadow-2xl'
											data-testid='shop-item-editor'
											role='dialog'
											aria-modal='true'
											aria-labelledby='shop-item-editor-title'
										>
											<div className='flex items-center justify-between border-b border-stone-800 pb-3'>
												<h2 id='shop-item-editor-title' className='font-serif text-xl font-bold text-purple-200'>
													{editingItem ? '編輯商品' : '匯入商品設定'}
												</h2>
												<Button
													type='button'
													variant='ghost'
													aria-label='取消商品編輯'
													onClick={() => {
														setEditingItem(null);
														setSelectedSource(null);
														setDeleteConfirmationItemId(null);
													}}
													className='text-stone-400'
												>
													<X className='h-4 w-4' />
												</Button>
											</div>

											<div className='grid gap-3 sm:grid-cols-2'>
												<label className='text-sm text-stone-300'>
													商品名稱
													<Input required maxLength={120} value={itemForm.name} onChange={(event) => updateItemForm('name', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													圖示名稱
													<Input required maxLength={500} value={itemForm.icon} onChange={(event) => updateItemForm('icon', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} placeholder='例如：Sword、FlaskConical' />
												</label>
												<label className='text-sm text-stone-300'>
													物品分類
													<select value={itemForm.category} onChange={(event) => updateItemForm('category', event.target.value as ItemCategory)} className={`mt-1 ${INPUT_CLASS}`}>
														{ITEM_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
													</select>
												</label>
												<label className='text-sm text-stone-300'>
													子類型
													<Input maxLength={120} value={itemForm.subType} onChange={(event) => updateItemForm('subType', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													稀有度
													<select value={itemForm.rarity} onChange={(event) => updateItemForm('rarity', event.target.value as Rarity)} className={`mt-1 ${INPUT_CLASS}`}>
														{ITEM_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{RARITY_CONFIG[rarity].label}</option>)}
													</select>
												</label>
												<label className='text-sm text-stone-300'>
													傷害
													<Input value={itemForm.damage} onChange={(event) => updateItemForm('damage', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													武器精通
													<select value={itemForm.mastery} onChange={(event) => updateItemForm('mastery', event.target.value as WeaponMasteryKey)} className={`mt-1 ${INPUT_CLASS}`}>
														{Object.entries(WEAPON_MASTERIES).map(([key, mastery]) => <option key={key} value={key}>{mastery.name}</option>)}
													</select>
												</label>
												<label className='text-sm text-stone-300'>
													護甲值
													<Input value={itemForm.ac} onChange={(event) => updateItemForm('ac', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													重量（磅）
													<Input required type='number' min={0} step='any' value={itemForm.weight} onChange={(event) => updateItemForm('weight', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													物品價值（GP）
													<Input required type='number' min={0} step='any' value={itemForm.valueGp} onChange={(event) => updateItemForm('valueGp', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													最大充能
													<Input required type='number' min={0} step={1} value={itemForm.maxCharges} onChange={(event) => updateItemForm('maxCharges', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													商店售價（gp）
													<Input required inputMode='decimal' value={itemForm.unitPriceGp} onChange={(event) => updateItemForm('unitPriceGp', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
												<label className='text-sm text-stone-300'>
													可用庫存
													<Input required type='number' min={0} step={1} value={itemForm.stockAvailable} onChange={(event) => updateItemForm('stockAvailable', event.target.value)} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
											</div>

											<div className='grid gap-2 sm:grid-cols-2'>
												{([
													['requiresAttunement', '需要調諧', 'accent-purple-500'],
													['isEquippable', '可裝備', 'accent-amber-500'],
													['isConsumable', '消耗品', 'accent-amber-500'],
													['isImportant', '重要物品', 'accent-amber-500'],
													['requiresApproval', '購買需要 DM 審查', 'accent-purple-500'],
													['isActive', '啟用商品', 'accent-amber-500'],
												] as const).map(([key, label, color]) => (
													<label key={key} className='flex items-center gap-2 text-sm text-stone-300'>
														<input type='checkbox' checked={itemForm[key]} onChange={(event) => updateItemForm(key, event.target.checked)} className={color} />
														{label}
													</label>
												))}
											</div>

											<label className='block text-sm text-stone-300'>
												效果描述
												<Textarea value={itemForm.effects} onChange={(event) => updateItemForm('effects', event.target.value)} className={`mt-1 min-h-24 ${INPUT_CLASS}`} />
											</label>
											<label className='block text-sm text-stone-300'>
												風味描述
												<Textarea value={itemForm.flavor} onChange={(event) => updateItemForm('flavor', event.target.value)} className={`mt-1 min-h-20 ${INPUT_CLASS}`} />
											</label>
											<label className='block text-sm text-stone-300'>
												DM 備註
												<Textarea value={itemForm.dmNotes} onChange={(event) => updateItemForm('dmNotes', event.target.value)} className={`mt-1 min-h-20 ${INPUT_CLASS}`} />
											</label>
											<label className='block text-sm text-stone-300'>
												附魔詞條（JSON）
												<Textarea value={itemForm.affixesJson} onChange={(event) => updateItemForm('affixesJson', event.target.value)} className={`mt-1 min-h-28 font-mono text-xs ${INPUT_CLASS}`} />
											</label>

											{editingItem && (
												<div className='border-t border-red-900/60 pt-3'>
													{deleteConfirmationItemId === editingItem.id && (
														<p role='alert' className='mb-2 text-sm text-red-300'>
															刪除商品會一併刪除其所有關聯訂單（包括待審與已完成），且無法復原。
														</p>
													)}
													<Button
														type='button'
														variant='ghost'
														disabled={isSaving}
														onClick={() => void handleDeleteItem(editingItem)}
														className='border border-red-900/70 text-red-300 hover:bg-red-950/50'
													>
														<Trash2 className='h-4 w-4' />
														{deleteConfirmationItemId === editingItem.id ? '再次按下確認刪除' : '刪除商品'}
													</Button>
												</div>
											)}

											<div className='flex justify-end gap-2 border-t border-stone-800 pt-3'>
												<Button
													type='button'
													variant='ghost'
													onClick={() => {
														setEditingItem(null);
														setSelectedSource(null);
														setDeleteConfirmationItemId(null);
													}}
													className='text-stone-400'
												>
													取消
												</Button>
												<Button type='submit' loading={isSaving} className='border border-purple-500/60 bg-purple-900 text-purple-50'>
													<Check className='h-4 w-4' />
													儲存商品
												</Button>
											</div>
										</form>
									</div>
								)}

								<div className='rounded-lg border border-stone-800 bg-stone-900/60 p-4'>
									<h2 className='font-serif text-xl font-bold text-amber-100'>
										從鍛造工坊匯入
									</h2>
									<p className='mt-1 text-xs text-stone-500'>
										選擇官方目錄、自己的樣板或其他玩家分享的樣板；匯入後會保存獨立快照。
									</p>
									<div className='mt-4 flex flex-wrap gap-2' role='tablist' aria-label='商品來源'>
										{([
											['catalog', '官方目錄'],
											['mine', '我的樣板'],
											['shared', '分享樣板'],
										] as const).map(([tab, label]) => (
											<Button
												key={tab}
												type='button'
												variant='secondary'
												role='tab'
												aria-selected={sourceTab === tab}
												onClick={() => setSourceTab(tab)}
												className={
													sourceTab === tab
														? 'border border-amber-700 bg-amber-950/70 text-amber-200'
														: 'border border-stone-800 bg-stone-950 text-stone-400'
												}
											>
												{label}
											</Button>
										))}
									</div>
									<Input
										value={sourceQuery}
										onChange={(event) => setSourceQuery(event.target.value)}
										className={`mt-3 ${INPUT_CLASS}`}
										placeholder='搜尋名稱、類型或來源…'
										aria-label='搜尋商品來源'
									/>
									{sourceError && (
										<p role='alert' className='mt-3 text-sm text-red-300'>
											{sourceError}
										</p>
									)}
									{isLoadingSources ? (
										<p className='py-5 text-center text-sm text-stone-500'>
											載入工坊來源中…
										</p>
									) : (
										<div className='mt-3 max-h-72 space-y-1 overflow-y-auto'>
											{visibleSources.slice(0, 100).map((source) => (
												<div
													key={source.key}
													className='flex items-center justify-between gap-3 rounded-md border border-stone-800 bg-stone-950/70 px-3 py-2'
												>
													<div className='min-w-0'>
														<p className='truncate text-sm text-stone-200'>
															{source.name}
														</p>
														<p className='truncate text-xs text-stone-500'>
															{source.detail}
														</p>
													</div>
													<Button
														type='button'
														size='sm'
														onClick={() => beginSourceImport(source)}
														className='shrink-0 border border-amber-700/60 bg-amber-950/70 text-amber-200'
													>
														<Plus className='h-3.5 w-3.5' />
														加入
													</Button>
												</div>
											))}
											{visibleSources.length === 0 && !sourceError && (
												<p className='py-4 text-center text-sm text-stone-500'>
													{sources.length ? '沒有符合條件的物品。' : '沒有可匯入的來源物品。'}
												</p>
											)}
											{visibleSources.length > 100 && (
												<p className='py-2 text-center text-xs text-stone-500'>
													目前顯示前 100 項，請縮小搜尋範圍。
												</p>
											)}
										</div>
									)}
								</div>

								<div className='rounded-lg border border-stone-800 bg-stone-900/60 p-4'>
									<h2 className='font-serif text-xl font-bold text-amber-100'>
										批次匯入手動商品
									</h2>
									<p className='mt-1 text-xs text-stone-500'>
										每行格式：名稱 | 單價（gp） | 庫存。驗證全數通過後才會一次匯入。
									</p>
									<Textarea
										value={batchText}
										onChange={(event) => setBatchText(event.target.value)}
										className={`mt-3 min-h-28 ${INPUT_CLASS}`}
										placeholder={'治療藥水 | 50 | 8\n火把 | 0.01 | 20'}
										aria-label='批次商品資料'
									/>
									{batchText.trim() && (
										<div className='mt-3 space-y-1' aria-live='polite'>
											{importRows.errors.map((error) => (
												<p
													key={`${error.line}:${error.raw}`}
													className='text-sm text-red-300'
												>
													第 {error.line} 行：{error.message}
												</p>
											))}
											{!importRows.errors.length && importRows.rows.length > 0 && (
												<div className='rounded-md border border-emerald-900/70 bg-emerald-950/20 p-3 text-sm text-emerald-200'>
													預覽 {importRows.rows.length} 項：
													{importRows.rows.map((row) => (
														<p
															key={`${row.line}:${row.name}`}
															className='mt-1 text-xs text-emerald-100'
														>
															第 {row.line} 行・{row.name}・
															{row.unitPriceGp} gp・庫存 {row.stockAvailable}
														</p>
													))}
												</div>
											)}
										</div>
									)}
									<div className='mt-3 flex justify-end'>
										<Button
											type='button'
											disabled={
												isSaving ||
												importRows.errors.length > 0 ||
												importRows.rows.length === 0
											}
											onClick={() => void handleBatchImport()}
											className='border border-amber-700/60 bg-amber-900 text-amber-100'
										>
											<PackagePlus className='h-4 w-4' />
											確認匯入
										</Button>
									</div>
								</div>
							</>
						)}
						{selectedShop && user?.id && (
							<ShopTransactionsPanel
								campaignId={campaignId}
								shop={selectedShop}
								items={visibleItems}
								isDm={true}
								canManageOrders
								userId={user.id}
							/>
						)}
				</section>
			)}
		</main>
	);
}
