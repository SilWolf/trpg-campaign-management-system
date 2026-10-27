/* eslint-disable react-refresh/only-export-components */
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type FormEvent,
} from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
	AlertCircle,
	Check,
	ChevronLeft,
	ChevronRight,
	Image,
	PackagePlus,
	Pencil,
	Plus,
	RotateCw,
	Store,
	Trash2,
	X,
} from 'lucide-react';
import {
	ITEM_CATEGORY_LABELS,
	RARITY_CONFIG,
	WEAPON_MASTERIES,
} from '@/data';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/FeedbackContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	deleteCampaignShopItem,
	loadCampaignShopItems,
	loadCampaignShops,
	saveCampaignShopItem,
	type CampaignShopItemValues,
} from '@/lib/campaignShops';
import {
	blacksmithItemToCampaignShopSnapshot,
} from '@/lib/campaignShopRefresh';
import {
	loadBlacksmithCatalogDefinitions,
	loadBlacksmithCatalogs,
} from '@/lib/blacksmithCatalog';
import { loadBlacksmithTemplates } from '@/lib/blacksmithItems';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button, Input, Textarea } from '@/components/ui';
import ReactMarkdown from 'react-markdown';
import { CampaignShopDialog } from '../-parts/CampaignShopDialog';
import { CampaignShopRefreshPanel } from '../-parts/CampaignShopRefreshPanel';
import ItemIcon from '../../-parts/ItemIcon';
import { ShopTransactionsPanel } from '../-parts/ShopTransactionsPanel';
import type {
	BlacksmithTemplate,
	AllItem,
	CampaignShop,
	CampaignShopItem,
	CampaignShopItemSnapshot,
	CampaignShopItemSourceType,
	ItemBaseCategory,
	ItemAffix,
	ItemBaseRarity,
	WeaponItemMastery,
} from '@/types';
import { getItemArmorClass, getItemDamage } from '@/types';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/shops/$shopId/settings',
)({
	component: CampaignShopsPage,
});

type ItemForm = {
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
	armorProperties: { ac: string };
	weight: string;
	valueGp: string;
	isRequireAttunement: boolean;
	maxCharges: string;
	effects: string;
	flavor: string;
	dmNotes: string;
	isEquippable: boolean;
	isConsumable: boolean;
	isImportant: boolean;
	isUnidentified: boolean;
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

const EMPTY_ITEM: ItemForm = {
	name: '',
	category: 'Misc',
	subTypes: [],
	rarity: 'Common',
	icon: 'Package',
	weaponProperties: { damage: '', mastery: '', properties: [] },
	armorProperties: { ac: '' },
	weight: '0',
	valueGp: '0',
	isRequireAttunement: false,
	maxCharges: '0',
	effects: '',
	flavor: '',
	dmNotes: '',
	isEquippable: false,
	isConsumable: false,
	isImportant: false,
	isUnidentified: false,
	affixesJson: '[]',
	unitPriceGp: '1',
	stockAvailable: '0',
	requiresApproval: false,
	isActive: true,
};

const INPUT_CLASS =
	'w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600';

const CATEGORY_LABELS = ITEM_CATEGORY_LABELS;
const ITEM_CATEGORIES = Object.entries(ITEM_CATEGORY_LABELS).map(
	([value, label]) => ({ value: value as ItemBaseCategory, label }),
);
const ITEM_RARITIES: ItemBaseRarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];

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
		subTypes: [...snapshot.subTypes],
		rarity: snapshot.rarity,
		icon: snapshot.icon ?? 'Package',
		weaponProperties:
			snapshot.category === 'Weapon'
				? {
						...snapshot.weaponProperties,
						mastery: snapshot.weaponProperties.mastery ?? '',
					}
				: { damage: '', mastery: '', properties: [] },
		armorProperties:
			snapshot.category === 'Armor'
				? { ...snapshot.armorProperties }
				: { ac: '' },
		weight: String(snapshot.weight),
		valueGp: String(snapshot.valueGp),
		isRequireAttunement: snapshot.isRequireAttunement,
		maxCharges: String(snapshot.maxCharges),
		effects: snapshot.effects,
		flavor: snapshot.flavor,
		dmNotes: snapshot.dmNotes,
		isEquippable: Boolean(snapshot.isEquippable),
		isConsumable: Boolean(snapshot.isConsumable),
		isImportant: Boolean(snapshot.isImportant),
		isUnidentified: snapshot.isIdentified === false,
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
		throw new Error(
			'每筆附魔詞條都必須包含字串 id、name、desc 及選用的布林 isHidden。',
		);
	}
	return parsed;
}

function snapshotFromTemplate(
	template: BlacksmithTemplate,
): CampaignShopItemSnapshot {
	const base = {
		name: template.name,
		subTypes: [...template.subTypes],
		rarity: template.rarity,
		icon: template.icon ?? 'Package',
		weight: template.weight,
		valueGp: template.valueGp,
		affixes: [...template.affixes],
		effects: template.effects,
		flavor: template.flavor ?? '',
		dmNotes: template.dmNotes,
		maxCharges: template.maxCharges ?? 0,
		isEquippable: template.isEquippable,
		isConsumable: template.isConsumable,
		isRequireAttunement: template.isRequireAttunement,
		isHomebrew: true,
		isImportant: template.isImportant,
	};
	if (template.category === 'Weapon') {
		return {
			...base,
			category: 'Weapon',
			weaponProperties: { ...template.weaponProperties },
		};
	}
	if (template.category === 'Armor') {
		return {
			...base,
			category: 'Armor',
			armorProperties: { ...template.armorProperties },
		};
	}
	return { ...base, category: template.category };
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
	const toast = useToast();
	const [shops, setShops] = useState<CampaignShop[]>([]);
	const [shopItems, setShopItems] = useState<CampaignShopItem[]>([]);
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [requestedPage, setRequestedPage] = useState(1);
	const [editingShop, setEditingShop] = useState<CampaignShop | null>(null);
	const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
	const [editingItem, setEditingItem] = useState<CampaignShopItem | null>(null);
	const [deleteConfirmationItemId, setDeleteConfirmationItemId] = useState<
		string | null
	>(null);
	const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
	const [sourceTab, setSourceTab] = useState<SourceTab>('catalog');
	const [sourceQuery, setSourceQuery] = useState('');
	const [sources, setSources] = useState<ImportSource[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingSources, setIsLoadingSources] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [sourceError, setSourceError] = useState<string | null>(null);

	const selectedShop = shops.find((shop) => shop.id === shopId) ?? null;
	const visibleItems = shopItems;
	const pageSize = 10;
	const pageCount = Math.max(1, Math.ceil(visibleItems.length / pageSize));
	const currentPage = Math.min(requestedPage, pageCount);
	const paginatedItems = visibleItems.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);
	const selectedItem =
		visibleItems.find((item) => item.id === selectedItemId) ??
		visibleItems[0] ??
		null;
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
			if (sourceTab === 'catalog' && source.sourceType !== 'catalog')
				return false;
			return (
				!query ||
				`${source.name} ${source.detail} ${source.snapshot.subTypes.join(' ')}`
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
		Promise.resolve()
			.then(() => {
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
											snapshot: blacksmithItemToCampaignShopSnapshot(item),
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

	const handleShopSaved = async (shop: CampaignShop) => {
		setIsSaving(true);
		const successMessage =
			shop.id === editingShop?.id ? '商店設定已更新。' : '商店已建立。';
		try {
			setShops((current) =>
				current.some((entry) => entry.id === shop.id)
					? current.map((entry) => (entry.id === shop.id ? shop : entry))
					: [shop, ...current],
			);
			toast.success(successMessage);
			try {
				await reloadShops();
			} catch (error) {
				toast.error(
					`${successMessage}但無法重新載入商店資料：${getErrorMessage(
						error,
						'同步商店資料失敗。',
					)}`,
				);
			}
		} finally {
			setIsSaving(false);
		}
	};

	const startShopEdit = (shop: CampaignShop) => {
		setEditingShop(shop);
		setErrorMessage(null);
	};

	const startItemEdit = (item: CampaignShopItem) => {
		setEditingItem(item);
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
			throw new Error(
				'單價必須大於 0，且小於 10,000,000,000 gp，最多兩位小數。',
			);
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
		if (itemForm.subTypes.some((subType) => subType.length > 120)) {
			throw new Error('每個物品子類型不可超過 120 個字元。');
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
		const affixes = parseAffixes(itemForm.affixesJson);
		const common = {
			name,
			subTypes: itemForm.subTypes.map((subType) => subType.trim()).filter(Boolean),
			rarity: itemForm.rarity,
			icon: itemForm.icon.trim(),
			weight,
			valueGp,
			affixes,
			effects: itemForm.effects,
			flavor: itemForm.flavor,
			dmNotes: itemForm.dmNotes,
			maxCharges,
			isEquippable: itemForm.isEquippable,
			isConsumable: itemForm.isConsumable,
			isRequireAttunement: itemForm.isRequireAttunement,
		};
		let base: AllItem;
		if (itemForm.category === 'Weapon') {
			const damage = itemForm.weaponProperties.damage.trim();
			if (!damage) throw new Error('武器必須填寫傷害描述。');
			base = {
				...common,
				category: 'Weapon',
				weaponProperties: {
					damage,
					...(itemForm.weaponProperties.mastery
						? { mastery: itemForm.weaponProperties.mastery }
						: {}),
					properties: itemForm.weaponProperties.properties,
				},
			};
		} else if (itemForm.category === 'Armor') {
			const ac = itemForm.armorProperties.ac.trim();
			if (!ac) throw new Error('護甲必須填寫護甲值。');
			base = { ...common, category: 'Armor', armorProperties: { ac } };
		} else {
			base = { ...common, category: itemForm.category };
		}
		const itemSnapshot: CampaignShopItemSnapshot = {
			...base,
			icon: base.icon ?? 'Package',
			flavor: base.flavor ?? '',
			maxCharges: base.maxCharges ?? 0,
			isHomebrew: editingItem?.itemSnapshot.isHomebrew ?? true,
			isImportant: itemForm.isImportant,
			isIdentified: !itemForm.isUnidentified,
		};
		return { name, unitPriceGp, stockAvailable, itemSnapshot };
	};

	const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedShop) return;
		let values: CampaignShopItemValues | null = null;
		try {
			const { unitPriceGp, stockAvailable, itemSnapshot } = validateItemForm();
			if (editingItem) {
				values = {
					itemSnapshot,
					sourceType: editingItem.sourceType,
					sourceId: editingItem.sourceId,
					unitPriceGp,
					stockAvailable,
					requiresApproval: itemForm.requiresApproval,
					isActive: itemForm.isActive,
				};
			}
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '商品資料格式錯誤。'));
			return;
		}
		setIsSaving(true);
		setErrorMessage(null);
		try {
			if (editingItem && values) {
				await saveCampaignShopItem(
					campaignId,
					selectedShop.id,
					values,
					editingItem.id,
				);
				toast.success('商品設定已更新。');
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '儲存商品失敗。'));
			setIsSaving(false);
			return;
		}
		try {
			await reloadItems();
		} catch (error) {
			toast.error(
				`商品設定已儲存，但無法重新載入商品資料：${getErrorMessage(
					error,
					'同步商品資料失敗。',
				)}`,
			);
		}
		setEditingItem(null);
		setItemForm(EMPTY_ITEM);
		setDeleteConfirmationItemId(null);
		setIsSaving(false);
	};

	const handleSourceImport = async (source: ImportSource) => {
		if (!selectedShop) return;
		const unitPriceGp = Math.max(source.snapshot.valueGp, 0.01);
		const itemSnapshot = {
			...source.snapshot,
			name: source.snapshot.name.trim(),
		};
		if (
			!itemSnapshot.name ||
			itemSnapshot.name.length > 120 ||
			!Number.isFinite(unitPriceGp) ||
			unitPriceGp >= 10_000_000_000
		) {
			setErrorMessage('來源商品名稱或物品價值無法作為有效售價。');
			return;
		}
		setIsSaving(true);
		setErrorMessage(null);
		try {
			await saveCampaignShopItem(campaignId, selectedShop.id, {
				itemSnapshot,
				sourceType: source.sourceType,
				sourceId: source.sourceId,
				unitPriceGp,
				stockAvailable: 0,
				requiresApproval: false,
				isActive: true,
			});
			toast.success(`「${source.name}」已加入商店。`);
			try {
				await reloadItems();
			} catch (error) {
				toast.error(
					`「${source.name}」已加入商店，但無法重新載入商品資料：${getErrorMessage(
						error,
						'同步商品資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '加入商品失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDeleteItem = async (item: CampaignShopItem) => {
		if (deleteConfirmationItemId !== item.id) {
			setDeleteConfirmationItemId(item.id);
			return;
		}
		if (!selectedShop) return;
		setIsSaving(true);
		setErrorMessage(null);
		try {
			await deleteCampaignShopItem(campaignId, selectedShop.id, item.id);
			setShopItems((current) =>
				current.filter((candidate) => candidate.id !== item.id),
			);
			setEditingItem(null);
			setDeleteConfirmationItemId(null);
			toast.success('商品與其關聯的訂單紀錄已刪除。');
			try {
				await reloadItems();
			} catch (error) {
				toast.error(
					`商品已刪除，但無法重新載入商品資料：${getErrorMessage(
						error,
						'同步商品資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '刪除商品失敗。'));
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
					<h1 className='font-serif text-2xl font-bold text-amber-200'>
						戰役商店
					</h1>
					<p className='mt-3 text-sm text-stone-400'>
						商店雲端功能需要登入 Supabase
						帳號；離線或訪客模式不會建立本機商店或假冒同步狀態。
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
				<div
					role='alert'
					className='mb-4 flex items-start gap-2 rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200'
				>
					<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
					<span>{errorMessage}</span>
				</div>
			)}
			{editingShop && (
				<CampaignShopDialog
					campaignId={campaignId}
					shop={editingShop}
					onClose={() => setEditingShop(null)}
					onSaved={handleShopSaved}
				/>
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

							<CampaignShopRefreshPanel
								key={selectedShop.id}
								campaignId={campaignId}
								shop={selectedShop}
								items={shopItems}
								onReloadShops={reloadShops}
								onReloadItems={reloadItems}
							/>

							<section className='rounded-lg border border-stone-800 bg-stone-900/50 p-4'>
								<div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
									<div>
										<h2 className='font-serif text-xl font-bold text-amber-100'>
											商品目錄
										</h2>
										<p className='mt-1 text-xs text-stone-500'>
											選擇商品查看詳細資料；可用庫存不包含待審保留數量。
										</p>
									</div>
									<div className='flex items-center gap-3'>
										<Button
											type='button'
											variant='secondary'
											onClick={() => setIsImportDialogOpen(true)}
											className='border border-purple-800/70 bg-purple-950/40 text-purple-200'
										>
											<PackagePlus className='h-4 w-4' />
											從鍛造工坊匯入
										</Button>
									</div>
								</div>
								<div className='flex flex-col gap-4 lg:flex-row'>
									<div className='min-w-0 rounded-md border border-stone-800 bg-stone-950/40 lg:flex-[3]'>
										<div className='border-b border-stone-800 px-3 py-2'>
											<span className='font-mono text-xs text-stone-500'>
												{visibleItems.length} 項商品
											</span>
										</div>
										{visibleItems.length === 0 ? (
											<div className='rounded-md border border-dashed border-stone-700 p-8 text-center text-sm text-stone-500'>
												<PackagePlus className='mx-auto mb-2 h-6 w-6 text-stone-600' />
												尚無商品
											</div>
										) : (
											<div className='max-h-[38rem] divide-y divide-stone-800 overflow-y-auto'>
												{paginatedItems.map((item) => {
													const isSelected = selectedItem?.id === item.id;
													return (
														<article
															key={item.id}
															className='flex min-w-0 items-center gap-2 p-2'
															data-testid='shop-item-card'
														>
															<Button
																type='button'
																variant='ghost'
																aria-label={`查看${item.itemSnapshot.name}`}
																aria-pressed={isSelected}
																onClick={() => setSelectedItemId(item.id)}
																className={`min-w-0 flex flex-1 items-center justify-between gap-3 rounded-none px-2 py-1 text-left ${
																	isSelected
																		? 'border-amber-500/80 bg-amber-950/40'
																		: 'border-transparent hover:border-stone-600 hover:bg-stone-900'
																}`}
															>
																<div className='flex min-w-0 flex-1 items-center gap-2'>
																	<div className='relative h-9 w-9 shrink-0 overflow-hidden rounded border border-stone-700 bg-stone-950'>
																		<ItemIcon
																			iconName={item.itemSnapshot.icon}
																			className='h-6 w-6 text-stone-300'
																		/>
																	</div>
																	<div className='min-w-0'>
																		<h3 className='truncate font-serif text-sm font-bold text-stone-100'>
																			{item.itemSnapshot.name}
																		</h3>
																		<p className='mt-1 truncate text-xs text-stone-500'>
																			{
																				CATEGORY_LABELS[
																					item.itemSnapshot.category
																				]
																			}
																			・
																			{
																				RARITY_CONFIG[item.itemSnapshot.rarity]
																					.label
																			}
																		</p>
																	</div>
																</div>
																<div className='flex shrink-0 flex-col items-end gap-2'>
																	<span className='font-mono text-sm text-amber-300'>
																		{item.unitPriceGp.toLocaleString('zh-TW')}{' '}
																		gp
																	</span>
																	<span className='text-[11px] text-stone-500'>
																		庫存 {item.stockAvailable}
																	</span>
																</div>
																{!item.isActive && (
																	<span className='text-[11px] text-stone-500'>
																		停用
																	</span>
																)}
																{item.requiresApproval && (
																	<span className='text-[11px] text-purple-300'>
																		需 DM 審查
																	</span>
																)}
															</Button>
															<Button
																type='button'
																variant='ghost'
																size='sm'
																onClick={() => startItemEdit(item)}
																aria-label={`編輯${item.itemSnapshot.name}`}
																className='shrink-0 border border-stone-800 text-stone-300 hover:border-amber-800 hover:text-amber-200'
															>
																<Pencil className='h-3.5 w-3.5' />
															</Button>
														</article>
													);
												})}
											</div>
										)}
										{visibleItems.length > pageSize && (
											<nav
												aria-label='商品列表分頁'
												className='flex flex-wrap items-center justify-between gap-3 border-t border-stone-800 px-3 py-2'
											>
												<p
													data-testid='shop-items-pagination-status'
													className='text-xs text-stone-400'
												>
													第{' '}
													<span className='font-mono text-stone-200'>
														{currentPage}
													</span>{' '}
													/{' '}
													<span className='font-mono text-stone-200'>
														{pageCount}
													</span>{' '}
													頁
													<span className='hidden sm:inline'>
														{' '}
														· 顯示 {(currentPage - 1) * pageSize + 1}–
														{Math.min(
															currentPage * pageSize,
															visibleItems.length,
														)}{' '}
														筆
													</span>
												</p>
												<div className='flex gap-2'>
													<Button
														type='button'
														variant='secondary'
														size='sm'
														aria-label='上一頁'
														disabled={currentPage === 1}
														onClick={() =>
															setRequestedPage((page) => Math.max(1, page - 1))
														}
														className='gap-1'
													>
														<ChevronLeft
															aria-hidden='true'
															className='h-4 w-4'
														/>
														上一頁
													</Button>
													<Button
														type='button'
														variant='secondary'
														size='sm'
														aria-label='下一頁'
														disabled={currentPage === pageCount}
														onClick={() =>
															setRequestedPage((page) =>
																Math.min(pageCount, page + 1),
															)
														}
														className='gap-1'
													>
														下一頁
														<ChevronRight
															aria-hidden='true'
															className='h-4 w-4'
														/>
													</Button>
												</div>
											</nav>
										)}
									</div>

									<aside
										className='min-w-0 rounded-md border border-stone-800 bg-stone-950/60 p-4 lg:min-w-72 lg:flex-[2]'
										aria-label='物品詳細'
										data-testid='shop-item-details'
									>
										{selectedItem ? (
											<>
												<div className='flex items-start gap-3 border-b border-stone-800 pb-4'>
													<div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stone-700 bg-stone-950'>
														<ItemIcon
															iconName={selectedItem.itemSnapshot.icon}
															className='h-8 w-8 text-stone-300'
														/>
													</div>
													<div className='min-w-0 flex-1'>
														<h3 className='font-serif text-xl font-bold text-amber-100'>
															{selectedItem.itemSnapshot.name}
														</h3>
														<p className='mt-1 text-xs text-stone-400'>
															{
																CATEGORY_LABELS[
																	selectedItem.itemSnapshot.category
																]
															}
															・
															{
																RARITY_CONFIG[selectedItem.itemSnapshot.rarity]
																	.label
															}
															{selectedItem.itemSnapshot.subTypes.length > 0
																? `・${selectedItem.itemSnapshot.subTypes.join('、')}`
																: ''}
														</p>
													</div>
												</div>

												<div className='grid grid-cols-2 gap-2 border-b border-stone-800 py-3 text-sm'>
													{getItemDamage(selectedItem.itemSnapshot) && (
														<div>
															<p className='text-[11px] text-stone-500'>傷害</p>
															<p className='font-mono text-amber-200'>
																{getItemDamage(selectedItem.itemSnapshot)}
															</p>
														</div>
													)}
													{getItemArmorClass(selectedItem.itemSnapshot) && (
														<div>
															<p className='text-[11px] text-stone-500'>
																護甲等級
															</p>
															<p className='font-mono text-sky-200'>
																AC {getItemArmorClass(selectedItem.itemSnapshot)}
															</p>
														</div>
													)}
													<div>
														<p className='text-[11px] text-stone-500'>重量</p>
														<p className='font-mono text-stone-200'>
															{selectedItem.itemSnapshot.weight} lb
														</p>
													</div>
													<div>
														<p className='text-[11px] text-stone-500'>
															物品價值
														</p>
														<p className='font-mono text-stone-200'>
															{selectedItem.itemSnapshot.valueGp} gp
														</p>
													</div>
													<div>
														<p className='text-[11px] text-stone-500'>
															商店價格
														</p>
														<p className='font-mono text-amber-300'>
															{selectedItem.unitPriceGp.toLocaleString('zh-TW')}{' '}
															gp
														</p>
													</div>
													<div>
														<p className='text-[11px] text-stone-500'>
															可用庫存
														</p>
														<p className='font-mono text-stone-200'>
															{selectedItem.stockAvailable}
														</p>
													</div>
													<div>
														<p className='text-[11px] text-stone-500'>
															保留庫存
														</p>
														<p className='font-mono text-stone-200'>
															{selectedItem.stockReserved}
														</p>
													</div>
												</div>

												<div className='flex flex-wrap gap-2 border-b border-stone-800 py-3 text-xs'>
													{selectedItem.itemSnapshot.isRequireAttunement && (
														<span className='text-purple-300'>需調諧</span>
													)}
													{selectedItem.itemSnapshot.isEquippable && (
														<span className='text-stone-300'>可裝備</span>
													)}
													{selectedItem.itemSnapshot.isConsumable && (
														<span className='text-stone-300'>消耗品</span>
													)}
													{selectedItem.itemSnapshot.isImportant && (
														<span className='text-amber-300'>重要物品</span>
													)}
													{selectedItem.requiresApproval && (
														<span className='text-purple-300'>
															購買需 DM 審查
														</span>
													)}
													{!selectedItem.isActive && (
														<span className='text-stone-500'>
															此商品目前已停用
														</span>
													)}
												</div>

												{selectedItem.itemSnapshot.flavor && (
													<div className='border-b border-stone-800 py-3'>
														<h4 className='mb-1 text-xs font-semibold text-stone-400'>
															物品描述
														</h4>
														<div className='prose prose-invert max-w-none text-sm leading-relaxed text-stone-200'>
															<ReactMarkdown>
																{selectedItem.itemSnapshot.flavor}
															</ReactMarkdown>
														</div>
													</div>
												)}
												{selectedItem.itemSnapshot.effects && (
													<div className='border-b border-stone-800 py-3'>
														<h4 className='mb-1 text-xs font-semibold text-stone-400'>
															物品效果
														</h4>
														<div className='prose prose-invert max-w-none text-sm leading-relaxed text-stone-200'>
															<ReactMarkdown>
																{selectedItem.itemSnapshot.effects}
															</ReactMarkdown>
														</div>
													</div>
												)}
												{(selectedItem.itemSnapshot.affixes ?? []).map(
													(affix) => (
														<div
															key={affix.id}
															className='border-b border-stone-800 py-3 last:border-0'
														>
															<h4 className='mb-1 text-xs font-semibold text-purple-300'>
																{affix.name}
															</h4>
															<div className='prose prose-invert max-w-none text-sm leading-relaxed text-stone-200'>
																<ReactMarkdown>{affix.desc}</ReactMarkdown>
															</div>
														</div>
													),
												)}
												<Button
													type='button'
													variant='ghost'
													onClick={() => startItemEdit(selectedItem)}
													className='mt-3 w-full border border-stone-800 text-stone-300 hover:border-amber-800 hover:text-amber-200'
												>
													<Pencil className='h-3.5 w-3.5' />
													編輯商品
												</Button>
											</>
										) : (
											<div className='flex min-h-48 items-center justify-center text-center text-sm text-stone-500'>
												請先從左側選擇商品以查看詳細資料。
											</div>
										)}
									</aside>
								</div>
							</section>
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
							{editingItem && (
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
											<h2
												id='shop-item-editor-title'
												className='font-serif text-xl font-bold text-purple-200'
											>
												編輯商品
											</h2>
											<Button
												type='button'
												variant='ghost'
												aria-label='取消商品編輯'
												onClick={() => {
													setEditingItem(null);
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
												<Input
													required
													maxLength={120}
													value={itemForm.name}
													onChange={(event) =>
														updateItemForm('name', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												圖示名稱
												<Input
													required
													maxLength={500}
													value={itemForm.icon}
													onChange={(event) =>
														updateItemForm('icon', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
													placeholder='例如：Sword、FlaskConical'
												/>
											</label>
											<label className='text-sm text-stone-300'>
												物品分類
												<select
													value={itemForm.category}
													onChange={(event) =>
														updateItemForm(
															'category',
															event.target.value as ItemBaseCategory,
														)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												>
													{ITEM_CATEGORIES.map((category) => (
														<option key={category.value} value={category.value}>
															{category.label}
														</option>
													))}
												</select>
											</label>
											<label className='text-sm text-stone-300'>
												子類型
												<Input
													maxLength={120}
													value={itemForm.subTypes.join('、')}
													onChange={(event) =>
														updateItemForm(
															'subTypes',
															event.target.value
																.split(/[、,，]/)
																.map((part) => part.trim())
																.filter(Boolean),
														)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												稀有度
												<select
													value={itemForm.rarity}
													onChange={(event) =>
														updateItemForm(
															'rarity',
															event.target.value as ItemBaseRarity,
														)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												>
													{ITEM_RARITIES.map((rarity) => (
														<option key={rarity} value={rarity}>
															{RARITY_CONFIG[rarity].label}
														</option>
													))}
												</select>
											</label>
											{itemForm.category === 'Weapon' && (
												<>
													<label className='text-sm text-stone-300'>
														傷害
														<Input
															required
															value={itemForm.weaponProperties.damage}
															onChange={(event) =>
																updateItemForm('weaponProperties', {
																	...itemForm.weaponProperties,
																	damage: event.target.value,
																})
															}
															className={`mt-1 ${INPUT_CLASS}`}
														/>
													</label>
													<label className='text-sm text-stone-300'>
														武器特性（以頓號分隔）
														<Input
															value={itemForm.weaponProperties.properties.join('、')}
															onChange={(event) =>
																updateItemForm('weaponProperties', {
																	...itemForm.weaponProperties,
																	properties: event.target.value
																		.split(/[、,，]/)
																		.map((part) => part.trim())
																		.filter(Boolean),
																})
															}
															className={`mt-1 ${INPUT_CLASS}`}
														/>
													</label>
													<label className='text-sm text-stone-300'>
														武器精通
														<select
															value={itemForm.weaponProperties.mastery}
															onChange={(event) =>
																updateItemForm('weaponProperties', {
																	...itemForm.weaponProperties,
																	mastery: event.target.value as WeaponItemMastery | '',
																})
															}
															className={`mt-1 ${INPUT_CLASS}`}
														>
															<option value=''>無</option>
															{Object.entries(WEAPON_MASTERIES)
																.filter(([key]) => key !== 'None')
																.map(([key, mastery]) => (
																	<option key={key} value={key}>
																		{mastery.name}
																	</option>
																))}
														</select>
													</label>
												</>
											)}
											{itemForm.category === 'Armor' && (
												<label className='text-sm text-stone-300'>
													護甲值
													<Input
														required
														value={itemForm.armorProperties.ac}
														onChange={(event) =>
															updateItemForm('armorProperties', {
																ac: event.target.value,
															})
														}
														className={`mt-1 ${INPUT_CLASS}`}
													/>
												</label>
											)}
											<label className='text-sm text-stone-300'>
												重量（磅）
												<Input
													required
													type='number'
													min={0}
													step='any'
													value={itemForm.weight}
													onChange={(event) =>
														updateItemForm('weight', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												物品價值（GP）
												<Input
													required
													type='number'
													min={0}
													step='any'
													value={itemForm.valueGp}
													onChange={(event) =>
														updateItemForm('valueGp', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												最大充能
												<Input
													required
													type='number'
													min={0}
													step={1}
													value={itemForm.maxCharges}
													onChange={(event) =>
														updateItemForm('maxCharges', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												商店售價（gp）
												<Input
													required
													inputMode='decimal'
													value={itemForm.unitPriceGp}
													onChange={(event) =>
														updateItemForm('unitPriceGp', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												可用庫存
												<Input
													required
													type='number'
													min={0}
													step={1}
													value={itemForm.stockAvailable}
													onChange={(event) =>
														updateItemForm('stockAvailable', event.target.value)
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
										</div>

										<div className='grid gap-2 sm:grid-cols-2'>
											{(
												[
													[
														'isRequireAttunement',
														'需要調諧',
														'accent-purple-500',
													],
													['isEquippable', '可裝備', 'accent-amber-500'],
													['isConsumable', '消耗品', 'accent-amber-500'],
													['isImportant', '重要物品', 'accent-amber-500'],
													[
														'isUnidentified',
														'以未鑑定狀態列出',
														'accent-purple-500',
													],
													[
														'requiresApproval',
														'購買需要 DM 審查',
														'accent-purple-500',
													],
													['isActive', '啟用商品', 'accent-amber-500'],
												] as const
											).map(([key, label, color]) => (
												<label
													key={key}
													className='flex items-center gap-2 text-sm text-stone-300'
												>
													<input
														type='checkbox'
														checked={itemForm[key]}
														onChange={(event) =>
															updateItemForm(key, event.target.checked)
														}
														className={color}
													/>
													{label}
												</label>
											))}
										</div>

										<label className='block text-sm text-stone-300'>
											效果描述
											<Textarea
												value={itemForm.effects}
												onChange={(event) =>
													updateItemForm('effects', event.target.value)
												}
												className={`mt-1 min-h-24 ${INPUT_CLASS}`}
											/>
										</label>
										<label className='block text-sm text-stone-300'>
											風味描述
											<Textarea
												value={itemForm.flavor}
												onChange={(event) =>
													updateItemForm('flavor', event.target.value)
												}
												className={`mt-1 min-h-20 ${INPUT_CLASS}`}
											/>
										</label>
										<label className='block text-sm text-stone-300'>
											DM 備註
											<Textarea
												value={itemForm.dmNotes}
												onChange={(event) =>
													updateItemForm('dmNotes', event.target.value)
												}
												className={`mt-1 min-h-20 ${INPUT_CLASS}`}
											/>
										</label>
										<label className='block text-sm text-stone-300'>
											附魔詞條（JSON）
											<Textarea
												value={itemForm.affixesJson}
												onChange={(event) =>
													updateItemForm('affixesJson', event.target.value)
												}
												className={`mt-1 min-h-28 font-mono text-xs ${INPUT_CLASS}`}
											/>
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
													{deleteConfirmationItemId === editingItem.id
														? '再次按下確認刪除'
														: '刪除商品'}
												</Button>
											</div>
										)}

										<div className='flex justify-end gap-2 border-t border-stone-800 pt-3'>
											<Button
												type='button'
												variant='ghost'
												onClick={() => {
													setEditingItem(null);
													setDeleteConfirmationItemId(null);
												}}
												className='text-stone-400'
											>
												取消
											</Button>
											<Button
												type='submit'
												loading={isSaving}
												className='border border-purple-500/60 bg-purple-900 text-purple-50'
											>
												<Check className='h-4 w-4' />
												儲存商品
											</Button>
										</div>
									</form>
								</div>
							)}

							{isImportDialogOpen && (
								<div className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4'>
									<section
										role='dialog'
										aria-modal='true'
										aria-labelledby='shop-source-dialog-title'
										className='my-auto max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-xl border border-purple-800/70 bg-stone-950 p-5 shadow-2xl'
										data-testid='shop-source-dialog'
									>
										<div className='flex items-start justify-between gap-4 border-b border-stone-800 pb-3'>
											<div>
												<h2
													id='shop-source-dialog-title'
													className='font-serif text-xl font-bold text-amber-100'
												>
													從鍛造工坊匯入
												</h2>
												<p className='mt-1 text-xs text-stone-500'>
													選擇官方目錄、自己的樣板或其他玩家分享的樣板；加入後會保存獨立快照。
												</p>
											</div>
											<Button
												type='button'
												variant='ghost'
												aria-label='關閉鍛造工坊匯入'
												onClick={() => setIsImportDialogOpen(false)}
												className='text-stone-400'
											>
												<X className='h-4 w-4' />
											</Button>
										</div>
										<div
											className='mt-4 flex flex-wrap gap-2'
											role='tablist'
											aria-label='商品來源'
										>
											{(
												[
													['catalog', '官方目錄'],
													['mine', '我的樣板'],
													['shared', '分享樣板'],
												] as const
											).map(([tab, label]) => (
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
															disabled={isSaving}
															onClick={() => void handleSourceImport(source)}
															className='shrink-0 border border-amber-700/60 bg-amber-950/70 text-amber-200'
														>
															<Plus className='h-3.5 w-3.5' />
															加入
														</Button>
													</div>
												))}
												{visibleSources.length === 0 && !sourceError && (
													<p className='py-4 text-center text-sm text-stone-500'>
														{sources.length
															? '沒有符合條件的物品。'
															: '沒有可匯入的來源物品。'}
													</p>
												)}
												{visibleSources.length > 100 && (
													<p className='py-2 text-center text-xs text-stone-500'>
														目前顯示前 100 項，請縮小搜尋範圍。
													</p>
												)}
											</div>
										)}
									</section>
								</div>
							)}
						</>
					)}
					{selectedShop && user?.id && (
						<ShopTransactionsPanel
							campaignId={campaignId}
							shop={selectedShop}
							items={visibleItems}
							isDm
							canManageOrders
							userId={user.id}
							showPurchaseForm={false}
							showPublicHistory={false}
						/>
					)}
				</section>
			)}
		</main>
	);
}
