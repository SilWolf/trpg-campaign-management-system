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
	X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	createCampaignShopItems,
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
import { ShopTransactionsPanel } from './-parts/ShopTransactionsPanel';
import type {
	BlacksmithItem,
	BlacksmithTemplate,
	CampaignShop,
	CampaignShopItem,
	CampaignShopItemSnapshot,
	CampaignShopItemSourceType,
	ItemCategory,
	Rarity,
	WeaponMasteryKey,
} from '@/types';

export const Route = createFileRoute('/_protected/campaigns/$campaignId/shops/')({
	component: CampaignShopsPage,
});

type ShopForm = {
	name: string;
	backgroundImageUrl: string;
	isActive: boolean;
};

type ItemForm = {
	name: string;
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

const RARITY_LABELS: Record<Rarity, string> = {
	Common: '普通',
	Uncommon: '非普通',
	Rare: '稀有',
	VeryRare: '極稀有',
	Legendary: '傳奇',
	Artifact: '神器',
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

function isWeaponMasteryKey(value: string): value is WeaponMasteryKey {
	return WEAPON_MASTERY_KEYS.has(value);
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
	const { campaignId } = Route.useParams();
	const { isDm, loading: roleLoading } = useUserCampaignRole(campaignId);
	const { user, isGuest } = useAuth();
	const [shops, setShops] = useState<CampaignShop[]>([]);
	const [shopItems, setShopItems] = useState<CampaignShopItem[]>([]);
	const [selectedShopId, setSelectedShopId] = useState('');
	const [shopForm, setShopForm] = useState<ShopForm>(EMPTY_SHOP);
	const [editingShopId, setEditingShopId] = useState<string | null>(null);
	const [isShopEditorOpen, setIsShopEditorOpen] = useState(false);
	const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
	const [editingItem, setEditingItem] = useState<CampaignShopItem | null>(null);
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

	const selectedShop = shops.find((shop) => shop.id === selectedShopId) ?? null;
	const visibleShops = useMemo(
		() => shops.filter((shop) => isDm || shop.isActive),
		[isDm, shops],
	);
	const visibleItems = useMemo(
		() => shopItems.filter((item) => isDm || item.isActive),
		[isDm, shopItems],
	);
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
		const nextShops = await loadCampaignShops(campaignId);
		setShops(nextShops);
		setSelectedShopId((current) =>
			nextShops.some((shop) => shop.id === current)
				? current
				: (nextShops.find((shop) => shop.isActive) ?? nextShops[0])?.id ?? '',
		);
	}, [campaignId]);

	const reloadItems = useCallback(async () => {
		if (!selectedShopId) {
			setShopItems([]);
			return;
		}
		setShopItems(await loadCampaignShopItems(campaignId, selectedShopId));
	}, [campaignId, selectedShopId]);

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
				setSelectedShopId(
					(current) =>
						(nextShops.some((shop) => shop.id === current)
							? nextShops.find((shop) => shop.id === current)
							: (nextShops.find((shop) => shop.isActive) ?? nextShops[0]))?.id ??
						'',
				);
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
		if (!selectedShopId || !isSupabaseConfigured || isGuest) {
			return () => {
				isMounted = false;
			};
		}
		Promise.resolve()
			.then(() => loadCampaignShopItems(campaignId, selectedShopId))
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
	}, [campaignId, isGuest, selectedShopId]);

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
			const saved = await saveCampaignShop(
				campaignId,
				values,
				editingShopId ?? undefined,
			);
			await reloadShops();
			setSelectedShopId(saved.id);
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
		setItemForm({
			name: item.itemSnapshot.name,
			unitPriceGp: String(item.unitPriceGp),
			stockAvailable: String(item.stockAvailable),
			requiresApproval: item.requiresApproval,
			isActive: item.isActive,
		});
		setErrorMessage(null);
	};

	const validateItemForm = (): {
		name: string;
		unitPriceGp: number;
		stockAvailable: number;
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
		return { name, unitPriceGp, stockAvailable };
	};

	const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedShop) return;
		setIsSaving(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			const { name, unitPriceGp, stockAvailable } = validateItemForm();
			if (editingItem) {
				const values: CampaignShopItemValues = {
					itemSnapshot: { ...editingItem.itemSnapshot, name },
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
					itemSnapshot: { ...source.snapshot, name },
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
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '儲存商品失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const beginSourceImport = (source: ImportSource) => {
		setEditingItem(null);
		setSelectedSource(source);
		setItemForm({
			...EMPTY_ITEM,
			name: source.name,
			unitPriceGp: String(Math.max(source.snapshot.valueGp, 0.01)),
		});
		setErrorMessage(null);
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
					{isDm && (
						<Button
							type='button'
							onClick={() => {
								setEditingShopId(null);
								setShopForm(EMPTY_SHOP);
								setIsShopEditorOpen(true);
								setErrorMessage(null);
							}}
							className='border border-amber-500/60 bg-amber-800 text-amber-50 hover:bg-amber-700'
						>
							<Plus className='h-4 w-4' />
							建立商店
						</Button>
					)}
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

			{isShopEditorOpen && isDm && (
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
				<div className='grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]'>
					<aside className='rounded-lg border border-stone-800 bg-stone-900/70 p-3'>
						<div className='mb-3 flex items-center justify-between px-2'>
							<h2 className='font-serif font-bold text-stone-200'>商店列表</h2>
							<span className='font-mono text-xs text-stone-500'>
								{visibleShops.length}
							</span>
						</div>
						{visibleShops.length === 0 ? (
							<p className='px-2 py-5 text-sm text-stone-500'>
								{isDm ? '尚未建立商店。' : '目前沒有啟用中的商店。'}
							</p>
						) : (
							<div className='space-y-1'>
								{visibleShops.map((shop) => (
									<div
										key={shop.id}
										className={`flex items-center gap-1 rounded-md border ${
											selectedShopId === shop.id
												? 'border-amber-700/70 bg-amber-950/40'
												: 'border-transparent hover:bg-stone-800/70'
										}`}
									>
										<button
											type='button'
											onClick={() => {
												setSelectedShopId(shop.id);
												setErrorMessage(null);
												setNotice(null);
											}}
											className='flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm'
										>
											<Store className='h-4 w-4 shrink-0 text-amber-400' />
											<span className='truncate'>{shop.name}</span>
											{!shop.isActive && (
												<span className='text-[10px] text-stone-500'>停用</span>
											)}
										</button>
										{isDm && (
											<Button
												type='button'
												variant='ghost'
												size='sm'
												aria-label={`編輯${shop.name}`}
												onClick={() => startShopEdit(shop)}
												className='mr-1 p-2 text-stone-400 hover:text-amber-300'
											>
												<Pencil className='h-3.5 w-3.5' />
											</Button>
										)}
									</div>
								))}
							</div>
						)}
					</aside>

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
										{isDm && (
											<Button
												type='button'
												variant='secondary'
												onClick={() => startShopEdit(selectedShop)}
												className='border border-stone-700 bg-stone-950 text-stone-300'
											>
												<Pencil className='h-4 w-4' />
												編輯商店
											</Button>
										)}
									</div>
								</div>

								<div className='rounded-lg border border-stone-800 bg-stone-900/50 p-4'>
									<div className='mb-4 flex items-center justify-between'>
										<div>
											<h2 className='font-serif text-xl font-bold text-amber-100'>
												商品目錄
											</h2>
											<p className='mt-1 text-xs text-stone-500'>
												{isDm
													? '可用庫存不包含待審保留數量。'
													: '選擇角色與可修改的錢包，即可購買或送出審查請求。'}
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
													className='rounded-md border border-stone-800 bg-stone-950/70 p-3'
													data-testid='shop-item-card'
												>
													<div className='flex items-start justify-between gap-2'>
														<div className='min-w-0'>
															<h3 className='truncate font-serif font-bold text-stone-100'>
																{item.itemSnapshot.name}
															</h3>
															<p className='mt-1 text-xs text-stone-500'>
																{CATEGORY_LABELS[item.itemSnapshot.category]}・
																{RARITY_LABELS[item.itemSnapshot.rarity]}
															</p>
														</div>
														{isDm && !item.isActive && (
															<span className='shrink-0 text-[10px] text-stone-500'>
																停用
															</span>
														)}
													</div>
													<p className='mt-3 font-mono text-lg text-amber-300'>
														{item.unitPriceGp.toLocaleString('zh-TW')} gp
													</p>
													<div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500'>
														<span>
															{isDm ? '可用' : '庫存'}{' '}
															<span className='font-mono text-stone-300'>
																{item.stockAvailable}
															</span>
														</span>
														{isDm && (
															<span>
																保留{' '}
																<span className='font-mono text-stone-300'>
																	{item.stockReserved}
																</span>
															</span>
														)}
														{item.requiresApproval && (
															<span className='text-purple-300'>需 DM 審查</span>
														)}
													</div>
													{isDm && (
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
													)}
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
									{isDm ? '建立第一家戰役商店以開始管理商品。' : '目前沒有啟用中的商店。'}
								</p>
							</div>
						)}

						{isDm && selectedShop && (
							<>
								{editingItem && (
									<form
										onSubmit={handleSaveItem}
										className='rounded-lg border border-purple-800/50 bg-stone-900/80 p-4'
										data-testid='shop-item-editor'
									>
										<div className='mb-4 flex items-center justify-between'>
											<h2 className='font-serif text-xl font-bold text-purple-200'>
												{editingItem ? '編輯商品' : '匯入商品設定'}
											</h2>
											<Button
												type='button'
												variant='ghost'
												aria-label='取消商品編輯'
												onClick={() => {
													setEditingItem(null);
													setSelectedSource(null);
												}}
												className='text-stone-400'
											>
												<X className='h-4 w-4' />
											</Button>
										</div>
										<div className='grid gap-3 sm:grid-cols-2'>
											<label className='text-sm text-stone-300 sm:col-span-2'>
												商品名稱
												<Input
													required
													maxLength={120}
													value={itemForm.name}
													onChange={(event) =>
														setItemForm((current) => ({
															...current,
															name: event.target.value,
														}))
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='text-sm text-stone-300'>
												單價（gp）
												<Input
													required
													inputMode='decimal'
													value={itemForm.unitPriceGp}
													onChange={(event) =>
														setItemForm((current) => ({
															...current,
															unitPriceGp: event.target.value,
														}))
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
														setItemForm((current) => ({
															...current,
															stockAvailable: event.target.value,
														}))
													}
													className={`mt-1 ${INPUT_CLASS}`}
												/>
											</label>
											<label className='flex items-center gap-2 text-sm text-stone-300'>
												<input
													type='checkbox'
													checked={itemForm.requiresApproval}
													onChange={(event) =>
														setItemForm((current) => ({
															...current,
															requiresApproval: event.target.checked,
														}))
													}
													className='accent-purple-500'
												/>
												購買需要 DM 審查
											</label>
											<label className='flex items-center gap-2 text-sm text-stone-300'>
												<input
													type='checkbox'
													checked={itemForm.isActive}
													onChange={(event) =>
														setItemForm((current) => ({
															...current,
															isActive: event.target.checked,
														}))
													}
													className='accent-amber-500'
												/>
												啟用商品
											</label>
										</div>
										<div className='mt-4 flex justify-end gap-2'>
											<Button
												type='button'
												variant='ghost'
												onClick={() => {
													setEditingItem(null);
													setSelectedSource(null);
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
								isDm={isDm}
								userId={user.id}
							/>
						)}
					</section>
				</div>
			)}
		</main>
	);
}
