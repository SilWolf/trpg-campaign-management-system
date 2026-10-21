import { useState, useMemo, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';

import InventoryGrid from './components/InventoryGrid';
import HomebrewModal from './components/HomebrewModal';
import CurrencyPanel from './components/CurrencyPanel';
import ItemTooltip from './components/ItemTooltip';
import { useCampaignSync } from './hooks/useCampaignSync';
import {
	INITIAL_CHARACTERS,
	INITIAL_ITEMS,
	RARITY_CONFIG,
	WEAPON_MASTERIES,
} from './data';
import {
	CAMP_CHEST_ID,
	canStackItems,
	resolveItemFlags,
	type CurrencyType,
	type HomebrewForm,
	type InventoryDisplayMode,
	type ItemAffix,
	type InventoryItem,
	type Rarity,
	type ViewMode,
} from './types';
import {
	Coins,
	Backpack,
	Sparkles,
	Plus,
	ArrowUpDown,
	Search,
	User,
	Scale,
	Crown,
	Lock,
	Globe,
	Grid3x3,
	LayoutGrid,
	List,
	Tent,
} from 'lucide-react';

const DEFAULT_FORM: HomebrewForm = {
	name: '',
	category: 'Weapon',
	subType: '長劍 (雙用)',
	rarity: 'Rare',
	icon: 'Sword',
	damage: '1d8+2 揮砍',
	mastery: 'Vex',
	ac: '',
	weight: '3',
	valueGp: '1000',
	quantity: '1',
	requiresAttunement: true,
	isIdentified: false,
	maxCharges: '0',
	effects: '',
	flavor: '',
	dmNotes: '',
	isPrivate: false,
	isEquippable: true,
	isConsumable: false,
	isImportant: false,
	affixes: [],
};

export default function App() {
	// 視角狀態：'player' | 'dm'
	const [viewMode, setViewMode] = useState<ViewMode>('dm');
	// 玩家視角下「我是哪位玩家」
	const [viewerCharId, setViewerCharId] = useState<string>('tav');
	// 當前檢視的背包角色
	const [activeCharId, setActiveCharId] = useState<string>('tav');
	// 背包空間分頁：'public' (公開行囊) | 'private' (私人暗袋)
	const [bagTab, setBagTab] = useState<'public' | 'private'>('public');
	// 展示模式切換：'grid6' (一列6個) | 'grid' (緊湊格字) | 'list' (詳細列表)
	const [displayMode, setDisplayMode] = useState<InventoryDisplayMode>('grid');

	// Supabase 即時同步狀態
	const { characters, setCharacters, items, setItems, syncStatus } =
		useCampaignSync(INITIAL_CHARACTERS, INITIAL_ITEMS);

	// 當前檢視/選中的物品 ID
	const [selectedItemId, setSelectedItemId] = useState('item-1');
	const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

	const handleSelectItem = (id: string) => {
		setSelectedItemId(id);
		if (window.innerWidth < 1024) {
			setIsMobileSheetOpen(true);
		}
	};

	// 背包搜尋與硬幣計重
	const [searchQuery, setSearchQuery] = useState('');
	const [countCoinWeight, setCountCoinWeight] = useState(true);

	const [copiedAffix, setCopiedAffix] = useState<ItemAffix | null>(null);

	// 彈窗狀態：自創道具鍛造/編輯工坊 & 金幣調整
	const [isHomebrewModalOpen, setIsHomebrewModalOpen] = useState(false);
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
	const [toastMessage, setToastMessage] = useState<string | null>(null);

	// 自創/編輯道具表單狀態
	const [newItemForm, setNewItemForm] = useState<HomebrewForm>(DEFAULT_FORM);

	const showToast = (msg: string) => {
		setToastMessage(msg);
		setTimeout(() => setToastMessage(null), 3000);
	};

	const isCampChestActive = activeCharId === CAMP_CHEST_ID;

	// 營地儲物箱沒有私人暗袋，只有公開空間
	const canViewPrivateBag =
		!isCampChestActive && (viewMode === 'dm' || activeCharId === viewerCharId);

	const currentBagTab = !canViewPrivateBag ? 'public' : bagTab;

	const activeCharacter = useMemo(() => {
		const found = characters.find((c) => c.id === activeCharId);
		if (found) return found;
		if (activeCharId === CAMP_CHEST_ID) {
			return {
				id: CAMP_CHEST_ID,
				name: '營地儲物箱',
				title: '團隊共用行囊與公庫',
				str: 999,
				avatar: '🏕️',
				currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
			};
		}
		return characters[0];
	}, [characters, activeCharId]);

	const allCharacterItems = useMemo(
		() => items.filter((item) => item.ownerId === activeCharId),
		[items, activeCharId],
	);

	const visibleBagItems = useMemo(() => {
		return allCharacterItems.filter((item) => {
			if (!canViewPrivateBag && item.isPrivate) return false;
			return currentBagTab === 'private'
				? Boolean(item.isPrivate)
				: !item.isPrivate;
		});
	}, [allCharacterItems, canViewPrivateBag, currentBagTab]);

	const attunedCount = useMemo(
		() => allCharacterItems.filter((item) => item.attuned).length,
		[allCharacterItems],
	);

	const currencyStats = useMemo(() => {
		const { pp, gp, ep, sp, cp } = activeCharacter.currencies;
		const totalCoins = pp + gp + ep + sp + cp;
		const coinWeight = countCoinWeight ? +(totalCoins / 50).toFixed(1) : 0;
		const totalValueInGp = +(
			pp * 10 +
			gp +
			ep * 0.5 +
			sp * 0.1 +
			cp * 0.01
		).toFixed(2);
		return { totalCoins, coinWeight, totalValueInGp };
	}, [activeCharacter, countCoinWeight]);

	const encumbranceStats = useMemo(() => {
		const itemsForCalc = canViewPrivateBag
			? allCharacterItems
			: allCharacterItems.filter((i) => !i.isPrivate);

		const itemsWeight = itemsForCalc.reduce(
			(sum, item) => sum + item.weight * item.quantity,
			0,
		);
		const totalWeight = +(itemsWeight + currencyStats.coinWeight).toFixed(1);
		const maxWeight = activeCharacter.str * 15;
		const percentage = Math.min(
			100,
			Math.round((totalWeight / maxWeight) * 100),
		);
		const totalItemsValueGp = visibleBagItems.reduce(
			(sum, item) => sum + item.valueGp * item.quantity,
			0,
		);
		return {
			itemsWeight,
			totalWeight,
			maxWeight,
			percentage,
			totalItemsValueGp,
		};
	}, [
		allCharacterItems,
		visibleBagItems,
		canViewPrivateBag,
		currencyStats.coinWeight,
		activeCharacter.str,
	]);

	const inspectedItem = useMemo(() => {
		const found = visibleBagItems.find((i) => i.id === selectedItemId);
		return found || visibleBagItems[0] || null;
	}, [selectedItemId, visibleBagItems]);

	// 搜尋匹配判斷
	const isItemMatchingFilter = (item: InventoryItem | null | undefined) => {
		if (!item) return false;
		const displayName =
			!item.isIdentified && viewMode === 'player' ? '未知魔法物品' : item.name;
		return (
			!searchQuery.trim() ||
			displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.subType.toLowerCase().includes(searchQuery.toLowerCase())
		);
	};

	// 自動整理排序 (依稀有度 / 重量 / 價值重新排列各分類內的物品順序)
	const handleAutoSort = (sortBy: 'rarity' | 'weight' | 'value') => {
		const rarityOrder: Record<Rarity, number> = {
			Artifact: 6,
			Legendary: 5,
			VeryRare: 4,
			Rare: 3,
			Uncommon: 2,
			Common: 1,
		};

		setItems((prev) => {
			const others = prev.filter((i) => i.ownerId !== activeCharId);
			const charOnes = [...prev.filter((i) => i.ownerId === activeCharId)].sort(
				(a, b) => {
					if (sortBy === 'rarity') {
						return (
							rarityOrder[b.rarity] - rarityOrder[a.rarity] ||
							b.valueGp - a.valueGp
						);
					}
					if (sortBy === 'weight') {
						return b.weight * b.quantity - a.weight * a.quantity;
					}
					if (sortBy === 'value') {
						return b.valueGp * b.quantity - a.valueGp * a.quantity;
					}
					return 0;
				},
			);
			return [...others, ...charOnes];
		});

		showToast(
			`已依${sortBy === 'rarity' ? '稀有度' : sortBy === 'weight' ? '重量' : '價值'}重新排序各分類物品`,
		);
	};

	// ==========================================
	// 物品操作：裝備、同調、充能、鑑定、玩家備註、私人背包切換
	// ==========================================
	const toggleEquip = (item: InventoryItem) => {
		setItems((prev) =>
			prev.map((i) => (i.id === item.id ? { ...i, equipped: !i.equipped } : i)),
		);
		showToast(`${item.equipped ? '已卸下' : '已裝備'}：${item.name}`);
	};

	const toggleAttune = (item: InventoryItem) => {
		if (!item.attuned && attunedCount >= 3) {
			showToast('⚠️ 同調失敗：D&D 5R 規則每名角色最多只能同調 3 件魔法物品！');
			return;
		}
		setItems((prev) =>
			prev.map((i) => (i.id === item.id ? { ...i, attuned: !i.attuned } : i)),
		);
		showToast(
			`${item.attuned ? '已解除同調' : '✨ 已完成魔法同調'}：${item.name}`,
		);
	};

	const toggleIdentify = (item: InventoryItem) => {
		setItems((prev) =>
			prev.map((i) =>
				i.id === item.id ? { ...i, isIdentified: !i.isIdentified } : i,
			),
		);
		showToast(
			`${!item.isIdentified ? '👁️ 已向玩家揭露真實屬性' : '🔒 已設為未鑑定狀態'}：${item.name}`,
		);
	};

	const updatePlayerNotes = (item: InventoryItem, notes: string) => {
		setItems((prev) =>
			prev.map((i) => (i.id === item.id ? { ...i, playerNotes: notes } : i)),
		);
		showToast(`📝 已儲存「${item.name}」的玩家備註`);
	};

	const togglePrivateItem = (item: InventoryItem) => {
		const targetPrivateState = !item.isPrivate;
		setItems((prev) =>
			prev.map((i) =>
				i.id === item.id ? { ...i, isPrivate: targetPrivateState } : i,
			),
		);
		showToast(
			targetPrivateState
				? `🔒 已將「${item.name}」藏入私人暗袋（其他玩家不可見）`
				: `🌐 已將「${item.name}」移回公開行囊`,
		);
	};

	const adjustCharges = (item: InventoryItem, delta: number) => {
		setItems((prev) =>
			prev.map((i) => {
				if (i.id !== item.id) return i;
				const nextCharges = Math.max(
					0,
					Math.min(i.maxCharges, i.charges + delta),
				);
				return { ...i, charges: nextCharges };
			}),
		);
	};

	const consumeOrSplitStack = (
		item: InventoryItem,
		action: 'consume' | 'split',
	) => {
		if (action === 'consume') {
			if (item.quantity <= 1) {
				setItems((prev) => prev.filter((i) => i.id !== item.id));
			} else {
				setItems((prev) =>
					prev.map((i) =>
						i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i,
					),
				);
			}
			showToast(`已使用 1 個 ${item.name}`);
		} else if (action === 'split' && item.quantity > 1) {
			const half = Math.floor(item.quantity / 2);
			const remain = item.quantity - half;
			const newClone: InventoryItem = {
				...item,
				id: `item-${Date.now()}`,
				quantity: half,
			};
			setItems((prev) => [
				...prev.map((i) => (i.id === item.id ? { ...i, quantity: remain } : i)),
				newClone,
			]);
			showToast(`已拆分出 ${half} 個 ${item.name}`);
		}
	};

	const transferItemToCharacter = (
		item: InventoryItem,
		targetCharId: string,
		transferQty?: number,
	) => {
		if (targetCharId === item.ownerId) return;

		const qty = Math.max(
			1,
			Math.min(item.quantity, transferQty ?? item.quantity),
		);
		const isPartial = qty < item.quantity;

		const targetCharName =
			targetCharId === CAMP_CHEST_ID
				? '🏕️ 營地儲物箱'
				: characters.find((c) => c.id === targetCharId)?.name;

		// 建立準備移交過去的物品基準狀態（卸下裝備、解除同調、設為公開）
		const transferredBase: InventoryItem = {
			...item,
			ownerId: targetCharId,
			quantity: qty,
			equipped: false,
			attuned: false,
			isPrivate: false,
		};

		setItems((prev) => {
			// 檢查目標角色是否已有可合併的「同名同詞條」公開物品
			const existingMatch = prev.find(
				(i) =>
					i.ownerId === targetCharId &&
					i.id !== item.id &&
					canStackItems(i, transferredBase),
			);

			if (existingMatch) {
				// A. 目標已有同款物品 -> 直接合併數量
				return prev
					.map((i) => {
						if (i.id === existingMatch.id) {
							return { ...i, quantity: i.quantity + qty };
						}
						if (i.id === item.id) {
							return isPartial ? { ...i, quantity: i.quantity - qty } : null;
						}
						return i;
					})
					.filter((i): i is InventoryItem => i !== null);
			} else {
				// B. 目標沒有同款物品 -> 全部轉移 或 拆出新堆疊給目標
				if (!isPartial) {
					return prev.map((i) => (i.id === item.id ? transferredBase : i));
				} else {
					const newStack: InventoryItem = {
						...transferredBase,
						id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					};
					return [
						...prev.map((i) =>
							i.id === item.id ? { ...i, quantity: i.quantity - qty } : i,
						),
						newStack,
					];
				}
			}
		});

		showToast(
			`📦 已將 ${qty} 個「${item.name}」移交至 ${targetCharName}（同名同詞條自動堆疊）`,
		);
	};

	const deleteItem = (item: InventoryItem) => {
		setItems((prev) => prev.filter((i) => i.id !== item.id));
		showToast(`已銷毀物品：${item.name}`);
	};

	// ==========================================
	// 貨幣調整與自動換算
	// ==========================================
	const updateCurrency = (coinType: CurrencyType, delta: number) => {
		setCharacters((prev) =>
			prev.map((char) => {
				if (char.id !== activeCharId) return char;
				const nextVal = Math.max(0, char.currencies[coinType] + delta);
				return {
					...char,
					currencies: { ...char.currencies, [coinType]: nextVal },
				};
			}),
		);
	};

	const consolidateCoinsToGold = () => {
		setCharacters((prev) =>
			prev.map((char) => {
				if (char.id !== activeCharId) return char;
				const pp = char.currencies.pp;
				let { gp, ep, sp, cp } = char.currencies;
				sp += Math.floor(cp / 10);
				cp = cp % 10;
				gp += Math.floor(sp / 10) + Math.floor(ep / 2);
				sp = sp % 10;
				ep = ep % 2;
				return { ...char, currencies: { pp, gp, ep, sp, cp } };
			}),
		);
		showToast('🪙 已自動將銅幣、銀幣與電金幣換算為金幣 (GP)！');
	};

	// ==========================================
	// DM 鍛造新道具 或 編輯現有道具
	// ==========================================
	const openCreateHomebrewModal = () => {
		setEditingItemId(null);
		setNewItemForm({
			...DEFAULT_FORM,
			isPrivate: currentBagTab === 'private',
		});
		setIsHomebrewModalOpen(true);
	};

	const openEditItemModal = (item: InventoryItem) => {
		const flags = resolveItemFlags(item);
		setEditingItemId(item.id);
		setNewItemForm({
			name: item.name,
			category: item.category,
			subType: item.subType,
			rarity: item.rarity,
			icon: item.icon,
			damage: item.damage || '',
			mastery: item.mastery || 'None',
			ac: item.ac || '',
			weight: String(item.weight),
			valueGp: String(item.valueGp),
			quantity: String(item.quantity),
			requiresAttunement: item.requiresAttunement,
			isIdentified: item.isIdentified,
			maxCharges: String(item.maxCharges),
			effects: item.effects,
			flavor: item.flavor,
			dmNotes: item.dmNotes || '',
			isPrivate: Boolean(item.isPrivate),
			isEquippable: flags.isEquippable,
			isConsumable: flags.isConsumable,
			isImportant: flags.isImportant,
			affixes: item.affixes ? [...item.affixes] : [],
		});
		setIsHomebrewModalOpen(true);
	};

	const handleSaveHomebrewOrEditItem = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!newItemForm.name.trim()) return;

		if (editingItemId) {
			const maxChg = parseInt(newItemForm.maxCharges, 10) || 0;
			setItems((prev) =>
				prev.map((item) => {
					if (item.id !== editingItemId) return item;
					return {
						...item,
						name: newItemForm.name.trim(),
						category: newItemForm.category,
						subType: newItemForm.subType || '奇物',
						rarity: newItemForm.rarity,
						icon: newItemForm.icon,
						damage:
							newItemForm.category === 'Weapon' ? newItemForm.damage : null,
						mastery:
							newItemForm.category === 'Weapon' ? newItemForm.mastery : 'None',
						ac: newItemForm.category === 'Armor' ? newItemForm.ac : null,
						weight: parseFloat(newItemForm.weight) || 1.0,
						valueGp: parseInt(newItemForm.valueGp, 10) || 0,
						quantity: parseInt(newItemForm.quantity, 10) || 1,
						requiresAttunement: newItemForm.requiresAttunement,
						isIdentified: newItemForm.isIdentified,
						maxCharges: maxChg,
						charges: Math.min(item.charges, maxChg),
						effects: newItemForm.effects || '無特殊規則描述。',
						flavor: newItemForm.flavor || '',
						dmNotes: newItemForm.dmNotes || '',
						isPrivate: Boolean(newItemForm.isPrivate),
						isEquippable: newItemForm.isEquippable,
						isConsumable: newItemForm.isConsumable,
						isImportant: newItemForm.isImportant,
						affixes: newItemForm.affixes || [],
					};
				}),
			);
			setIsHomebrewModalOpen(false);
			setEditingItemId(null);
			showToast(`✨ 已更新物品「${newItemForm.name.trim()}」的內容與分類！`);
			return;
		}

		const targetPrivate = Boolean(newItemForm.isPrivate);
		const createdItem: InventoryItem = {
			id: `hb-${Date.now()}`,
			ownerId: activeCharId,
			slot: 0,
			name: newItemForm.name.trim(),
			category: newItemForm.category,
			subType: newItemForm.subType || '自創奇物',
			rarity: newItemForm.rarity,
			icon: newItemForm.icon,
			damage: newItemForm.category === 'Weapon' ? newItemForm.damage : null,
			mastery: newItemForm.category === 'Weapon' ? newItemForm.mastery : 'None',
			ac: newItemForm.category === 'Armor' ? newItemForm.ac : null,
			weight: parseFloat(newItemForm.weight) || 1.0,
			valueGp: parseInt(newItemForm.valueGp, 10) || 100,
			quantity: parseInt(newItemForm.quantity, 10) || 1,
			equipped: false,
			requiresAttunement: newItemForm.requiresAttunement,
			attuned: false,
			isHomebrew: true,
			isIdentified: newItemForm.isIdentified,
			charges: parseInt(newItemForm.maxCharges, 10) || 0,
			maxCharges: parseInt(newItemForm.maxCharges, 10) || 0,
			effects: newItemForm.effects || '無特殊規則描述。',
			flavor: newItemForm.flavor || '「由地下城主親手鍛造的神秘器物。」',
			dmNotes: newItemForm.dmNotes || '',
			playerNotes: '',
			isPrivate: targetPrivate,
			isEquippable: newItemForm.isEquippable,
			isConsumable: newItemForm.isConsumable,
			isImportant: newItemForm.isImportant,
			affixes: newItemForm.affixes || [],
		};

		setItems((prev) => [...prev, createdItem]);
		setBagTab(targetPrivate ? 'private' : 'public');
		setSelectedItemId(createdItem.id);
		setIsHomebrewModalOpen(false);
		showToast(
			`✨ 已鍛造自創道具「${createdItem.name}」並放入 ${activeCharacter.name} 的${targetPrivate ? '私人' : '公開'}背包！`,
		);
	};

	const updateItemAffixes = (item: InventoryItem, nextAffixes: ItemAffix[]) => {
		setItems((prev) =>
			prev.map((i) => (i.id === item.id ? { ...i, affixes: nextAffixes } : i)),
		);
	};

	const handleCopyAffix = (affix: ItemAffix) => {
		setCopiedAffix(affix);
		showToast(`📋 已複製詞條「${affix.name}」，可切換至其他物品貼上！`);
	};

	const handlePasteAffixToItem = (item: InventoryItem) => {
		if (!copiedAffix) return;
		const cloned: ItemAffix = {
			...copiedAffix,
			id: `affix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		};
		updateItemAffixes(item, [...(item.affixes || []), cloned]);
		showToast(`✨ 已將詞條「${copiedAffix.name}」貼上至「${item.name}」！`);
	};

	const handleConsolidateStacks = () => {
		setItems((prev) => {
			// 分離出「屬於其他角色」的物品與「目前檢視中角色/儲物箱」的物品
			const others = prev.filter((i) => i.ownerId !== activeCharId);
			const currentOwnerItems = prev.filter((i) => i.ownerId === activeCharId);

			const consolidated: InventoryItem[] = [];

			currentOwnerItems.forEach((item) => {
				// 檢查前面已合併的清單中有沒有「可堆疊」的同款物品
				const existing = consolidated.find((target) =>
					canStackItems(target, item),
				);

				if (existing) {
					// 若有，直接將數量累加
					existing.quantity += item.quantity;
				} else {
					// 若沒有，將這件物品放入合併清單
					consolidated.push({ ...item });
				}
			});

			return [...others, ...consolidated];
		});

		showToast(`📦 已成功將背包內所有同名同詞條的物品自動合併疊加！`);
	};

	return (
		<div className='min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-600/40 selection:text-amber-200 relative overflow-x-hidden'>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.14),_rgba(12,10,9,0.95)_70%)]' />

			{toastMessage && (
				<div className='fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 border border-amber-500/80 text-amber-200 px-5 py-2.5 rounded-md shadow-[0_0_25px_rgba(245,158,11,0.35)] flex items-center gap-2.5 text-sm font-medium animate-bounce'>
					<Sparkles className='w-4 h-4 text-amber-400 shrink-0' />
					<span>{toastMessage}</span>
				</div>
			)}

			{/* ========================================== */}
			{/* 頂部導覽列                                  */}
			{/* ========================================== */}
			<header className='relative z-10 border-b border-amber-900/40 bg-stone-950/90 backdrop-blur-md px-4 lg:px-8 py-3'>
				<div className='max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3'>
					<div className='flex items-center gap-3'>
						<div className='w-10 h-10 rounded-lg bg-gradient-to-br from-amber-700 via-amber-900 to-stone-950 border border-amber-500/60 flex items-center justify-center shadow-[0_0_15px_rgba(217,119,6,0.3)]'>
							<Backpack className='w-5 h-5 text-amber-300' />
						</div>
						<div>
							<div className='flex items-center gap-2 flex-wrap'>
								<h1 className='text-lg sm:text-xl font-serif font-bold tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent'>
									博德之門戰役軍械庫
								</h1>
								<span className='text-[11px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 font-semibold'>
									D&amp;D 5R (2024)
								</span>
								<span
									className={`text-[11px] px-2 py-0.5 rounded border flex items-center gap-1.5 font-medium ${
										syncStatus === 'synced'
											? 'bg-emerald-950/80 border-emerald-600/50 text-emerald-300'
											: syncStatus === 'connecting'
												? 'bg-amber-950/80 border-amber-600/50 text-amber-300 animate-pulse'
												: syncStatus === 'error'
													? 'bg-red-950/80 border-red-600/50 text-red-300'
													: 'bg-stone-900 border-stone-700 text-stone-400'
									}`}
								>
									<span
										className={`w-2 h-2 rounded-full ${
											syncStatus === 'synced'
												? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
												: syncStatus === 'connecting'
													? 'bg-amber-400'
													: syncStatus === 'error'
														? 'bg-red-400'
														: 'bg-stone-500'
										}`}
									/>
									{syncStatus === 'synced'
										? 'Supabase 即時同步中'
										: syncStatus === 'connecting'
											? '連線雲端中...'
											: syncStatus === 'error'
												? '同步異常'
												: '單機預覽模式'}
								</span>
							</div>
							<p className='text-xs text-stone-400'>
								自動四大分類歸納、6格 / 緊湊格字 / 列表三模式、私人暗袋與
								Markdown 支援
							</p>
						</div>
					</div>

					<div className='flex flex-wrap items-center gap-2.5'>
						{viewMode === 'player' && (
							<div className='flex items-center gap-1.5 bg-stone-900 border border-stone-700 rounded-md px-2.5 py-1 text-xs'>
								<span className='text-stone-400'>我的身分:</span>
								<select
									value={viewerCharId}
									onChange={(e) => {
										setViewerCharId(e.target.value);
										setActiveCharId(e.target.value);
									}}
									className='bg-transparent text-amber-300 font-semibold outline-none cursor-pointer'
								>
									{characters.map((c) => (
										<option
											key={c.id}
											value={c.id}
											className='bg-stone-900 text-stone-200'
										>
											{c.avatar} {c.name}
										</option>
									))}
								</select>
							</div>
						)}

						{viewMode === 'dm' && (
							<button
								onClick={openCreateHomebrewModal}
								className='flex items-center gap-2 px-3.5 py-2 rounded bg-gradient-to-b from-purple-700 to-purple-950 border border-purple-400/70 hover:border-purple-300 text-purple-100 text-xs sm:text-sm font-medium shadow-[0_0_15px_rgba(168,85,247,0.35)] hover:brightness-110 transition cursor-pointer'
							>
								<Plus className='w-4 h-4 text-purple-300' />
								<span>鍛造自創道具 (Homebrew)</span>
							</button>
						)}

						<div className='flex bg-stone-900 p-1 rounded-lg border border-amber-800/50'>
							<button
								onClick={() => setViewMode('player')}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
									viewMode === 'player'
										? 'bg-amber-700/90 text-amber-50 border border-amber-400/60 shadow'
										: 'text-stone-400 hover:text-stone-200'
								}`}
							>
								<User className='w-3.5 h-3.5' />
								<span>玩家視角</span>
							</button>
							<button
								onClick={() => setViewMode('dm')}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
									viewMode === 'dm'
										? 'bg-red-900/90 text-red-100 border border-red-400/70 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
										: 'text-stone-400 hover:text-stone-200'
								}`}
							>
								<Crown className='w-3.5 h-3.5 text-amber-400' />
								<span>DM 上帝視角</span>
							</button>
						</div>
					</div>
				</div>
			</header>

			{/* ========================================== */}
			{/* 角色切換與頂部狀態欄                        */}
			{/* ========================================== */}
			<section className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-5'>
				<div className='grid grid-cols-1 lg:grid-cols-12 gap-4 bg-gradient-to-b from-stone-900/90 to-stone-950/95 border border-amber-800/40 rounded-lg p-4 shadow-xl'>
					<div className='lg:col-span-5 flex flex-wrap sm:flex-nowrap items-center gap-2'>
						{characters
							.filter((c) => c.id !== CAMP_CHEST_ID)
							.map((char) => {
								const isSelected = char.id === activeCharId;
								const isMe = viewMode === 'player' && char.id === viewerCharId;
								return (
									<button
										key={char.id}
										onClick={() => setActiveCharId(char.id)}
										className={`flex-1 min-w-[120px] flex items-center gap-2.5 p-2.5 rounded-md border text-left transition cursor-pointer relative ${
											isSelected
												? 'bg-gradient-to-b from-amber-950/80 to-stone-900 border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
												: 'bg-stone-900/60 border-stone-800 hover:border-amber-800/50 opacity-75 hover:opacity-100'
										}`}
									>
										{isMe && (
											<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-emerald-900 border border-emerald-400 text-emerald-200 font-semibold'>
												我
											</span>
										)}
										<div className='w-9 h-9 rounded-full bg-stone-800 border border-amber-600/50 flex items-center justify-center text-lg shrink-0'>
											{char.avatar}
										</div>
										<div className='overflow-hidden'>
											<div className='text-xs font-serif font-bold text-amber-100 truncate'>
												{char.name}
											</div>
											<div className='text-[10px] text-stone-400 truncate'>
												{char.title}
											</div>
										</div>
									</button>
								);
							})}
						{/* 新增：團隊共用營地儲物箱按鈕 */}
						<button
							onClick={() => setActiveCharId(CAMP_CHEST_ID)}
							className={`flex-1 min-w-[130px] flex items-center gap-2.5 p-2.5 rounded-md border text-left transition cursor-pointer relative ${
								isCampChestActive
									? 'bg-gradient-to-b from-cyan-950/90 to-stone-900 border-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
									: 'bg-stone-900/60 border-stone-800 hover:border-cyan-800/50 opacity-80 hover:opacity-100'
							}`}
						>
							<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/70 text-cyan-200 font-semibold'>
								共用
							</span>
							<div className='w-9 h-9 rounded-full bg-stone-800 border border-cyan-600/50 flex items-center justify-center text-lg shrink-0'>
								🏕️
							</div>
							<div className='overflow-hidden'>
								<div className='text-xs font-serif font-bold text-cyan-100 truncate'>
									營地儲物箱
								</div>
								<div className='text-[10px] text-stone-400 truncate'>
									共 {items.filter((i) => i.ownerId === CAMP_CHEST_ID).length}{' '}
									件公物
								</div>
							</div>
						</button>
					</div>

					{/* 中間：負重進度條與同調欄位 */}
					<div className='lg:col-span-4 flex flex-col justify-center gap-2 border-t lg:border-t-0 lg:border-x border-stone-800 pt-3 lg:pt-0 lg:px-4'>
						{isCampChestActive ? (
							<div className='space-y-1.5'>
								<div className='flex items-center justify-between text-xs'>
									<span className='flex items-center gap-1.5 text-cyan-300 font-medium'>
										<Tent className='w-3.5 h-3.5 text-cyan-400' />
										<span>營地儲物箱容量 (無限負重)</span>
									</span>
									<span className='font-mono font-semibold text-cyan-200'>
										目前已存放 {encumbranceStats.totalWeight} lbs
									</span>
								</div>
								<p className='text-[11px] text-stone-400 leading-relaxed'>
									所有隊員皆可隨時將笨重的戰利品、備用裝備或團隊物資送往營地，或從儲物箱領出至個人背包。
								</p>
							</div>
						) : (
							<>
								<div>
									<div className='flex items-center justify-between text-xs mb-1'>
										<span className='flex items-center gap-1.5 text-stone-300 font-medium'>
											<Scale className='w-3.5 h-3.5 text-amber-400' />
											<span>負重 (力量 {activeCharacter.str})</span>
										</span>
										<span
											className={`font-mono font-semibold ${
												encumbranceStats.percentage > 85
													? 'text-red-400'
													: 'text-amber-200'
											}`}
										>
											{encumbranceStats.totalWeight} /{' '}
											{encumbranceStats.maxWeight} lbs
										</span>
									</div>
									<div className='w-full h-2 bg-stone-950 rounded-full overflow-hidden border border-stone-700/80'>
										<div
											className={`h-full transition-all duration-300 ${
												encumbranceStats.percentage > 90
													? 'bg-gradient-to-r from-red-600 to-red-400'
													: encumbranceStats.percentage > 65
														? 'bg-gradient-to-r from-amber-600 to-yellow-400'
														: 'bg-gradient-to-r from-amber-700 to-amber-400'
											}`}
											style={{ width: `${encumbranceStats.percentage}%` }}
										/>
									</div>
								</div>

								<div className='flex items-center justify-between text-[11px] text-stone-400 pt-0.5'>
									<div className='flex items-center gap-1.5'>
										<span>同調欄位:</span>
										<div className='flex items-center gap-1'>
											{[1, 2, 3].map((slot) => (
												<span
													key={slot}
													className={`w-3 h-3 rounded-sm rotate-45 inline-block border transition ${
														slot <= attunedCount
															? 'bg-amber-400 border-amber-200 shadow-[0_0_6px_#f59e0b]'
															: 'bg-stone-900 border-stone-600'
													}`}
												/>
											))}
										</div>
										<span className='text-amber-300 font-mono ml-1'>
											{attunedCount}/3
										</span>
									</div>

									<label className='flex items-center gap-1.5 cursor-pointer hover:text-stone-200'>
										<input
											type='checkbox'
											checked={countCoinWeight}
											onChange={(e) => setCountCoinWeight(e.target.checked)}
											className='accent-amber-500 rounded'
										/>
										<span>計入硬幣重 ({currencyStats.coinWeight} lb)</span>
									</label>
								</div>
							</>
						)}
					</div>

					{/* 右側：D&D 五種貨幣錢包 */}
					<div className='lg:col-span-3 flex flex-col justify-between border-t lg:border-t-0 border-stone-800 pt-3 lg:pt-0'>
						<div className='flex items-center justify-between mb-1.5'>
							<span className='text-xs text-stone-400 flex items-center gap-1'>
								<Coins className='w-3.5 h-3.5 text-amber-400' />
								<span>角色錢包 (折合 {currencyStats.totalValueInGp} GP)</span>
							</span>
							<button
								onClick={() => setIsCoinModalOpen(true)}
								className='text-[11px] px-2 py-0.5 rounded bg-amber-950/90 hover:bg-amber-900 text-amber-300 border border-amber-600/50 transition cursor-pointer'
							>
								管理金錢
							</button>
						</div>

						<div className='grid grid-cols-5 gap-1.5 text-center'>
							{[
								{
									key: 'pp',
									label: 'PP 鉑',
									color: 'text-slate-200 border-slate-400/50 bg-slate-900/70',
								},
								{
									key: 'gp',
									label: 'GP 金',
									color: 'text-amber-300 border-amber-500/60 bg-amber-950/50',
								},
								{
									key: 'ep',
									label: 'EP 電',
									color: 'text-cyan-300 border-cyan-600/50 bg-cyan-950/40',
								},
								{
									key: 'sp',
									label: 'SP 銀',
									color: 'text-stone-300 border-stone-500/50 bg-stone-800/70',
								},
								{
									key: 'cp',
									label: 'CP 銅',
									color:
										'text-orange-400 border-orange-600/50 bg-orange-950/40',
								},
							].map((coin) => (
								<div
									key={coin.key}
									onClick={() => setIsCoinModalOpen(true)}
									className={`px-1 py-1 rounded border ${coin.color} cursor-pointer hover:brightness-125 transition`}
									title='點擊調整貨幣數量'
								>
									<div className='text-xs font-mono font-bold'>
										{activeCharacter.currencies[coin.key as CurrencyType]}
									</div>
									<div className='text-[9px] opacity-80'>{coin.label}</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* ========================================== */}
			{/* 主內容區：改為 Flex 並頂部對齊 (items-start)，避免較低一側被拉長 */}
			{/* ========================================== */}
			<main className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-5 flex flex-col lg:flex-row lg:items-start gap-6'>
				{/* 左側分類背包 (佔 7/12 寬度) */}
				<div className='w-full lg:w-7/12 flex flex-col bg-gradient-to-b from-[#171412] via-[#12100e] to-[#0c0a09] border-2 border-amber-800/50 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.85)] overflow-hidden'>
					{/* 頂部工具列：公開/私人行囊切換 + 搜尋 + 展示模式切換 + 排序 */}
					<div className='p-3.5 bg-stone-950/90 border-b border-amber-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
						{/* 左側：公開行囊 vs 私人暗袋 */}
						<div className='flex items-center gap-2'>
							<button
								onClick={() => setBagTab('public')}
								className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
									currentBagTab === 'public'
										? 'bg-amber-800/80 text-amber-100 border border-amber-400/70 shadow'
										: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
								}`}
							>
								<Globe className='w-3.5 h-3.5 text-amber-300' />
								<span>
									公開行囊 (
									{allCharacterItems.filter((i) => !i.isPrivate).length})
								</span>
							</button>

							{canViewPrivateBag ? (
								<button
									onClick={() => setBagTab('private')}
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
										currentBagTab === 'private'
											? 'bg-emerald-900/80 text-emerald-100 border border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
											: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-emerald-300'
									}`}
								>
									<Lock className='w-3.5 h-3.5 text-emerald-400' />
									<span>
										私人暗袋 (
										{allCharacterItems.filter((i) => i.isPrivate).length})
									</span>
								</button>
							) : (
								<span className='text-[11px] text-stone-500 flex items-center gap-1 px-2'>
									<Lock className='w-3 h-3' />
									<span>私人暗袋已隱藏</span>
								</span>
							)}
						</div>

						{/* 右側：搜尋、展示模式切換 (6格/格字/列表)、排序 */}
						<div className='flex items-center gap-2'>
							<div className='relative flex-1 sm:w-40'>
								<Search className='w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2' />
								<input
									type='text'
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder='搜尋道具名稱...'
									className='w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-stone-200 placeholder:text-stone-500 outline-none'
								/>
							</div>

							{/* 一列6個 vs 緊湊格字 vs 列表展示切換器 */}
							<div className='flex bg-stone-900 p-0.5 rounded border border-stone-700'>
								<button
									onClick={() => setDisplayMode('grid6')}
									title='一列 6 個展示'
									className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
										displayMode === 'grid6'
											? 'bg-amber-700/80 text-amber-100'
											: 'text-stone-400 hover:text-stone-200'
									}`}
								>
									<Grid3x3 className='w-3.5 h-3.5' />
									<span className='hidden md:inline'>6格</span>
								</button>
								<button
									onClick={() => setDisplayMode('grid')}
									title='緊湊格字展示'
									className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
										displayMode === 'grid'
											? 'bg-amber-700/80 text-amber-100'
											: 'text-stone-400 hover:text-stone-200'
									}`}
								>
									<LayoutGrid className='w-3.5 h-3.5' />
									<span className='hidden md:inline'>格字</span>
								</button>
								<button
									onClick={() => setDisplayMode('list')}
									title='詳細列表展示'
									className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
										displayMode === 'list'
											? 'bg-amber-700/80 text-amber-100'
											: 'text-stone-400 hover:text-stone-200'
									}`}
								>
									<List className='w-3.5 h-3.5' />
									<span className='hidden md:inline'>列表</span>
								</button>
							</div>

							{/* 排序選單 */}
							<div className='relative group'>
								<button className='flex items-center gap-1 px-2.5 py-1.5 rounded bg-stone-900 border border-stone-700 hover:border-amber-600/60 text-xs text-stone-300 cursor-pointer'>
									<ArrowUpDown className='w-3.5 h-3.5 text-amber-400' />
									<span>排序與整理</span>
								</button>
								<div className='absolute right-0 mt-1 w-32 bg-stone-900 border border-amber-700/70 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30 py-1 text-xs'>
									<button
										onClick={() => handleAutoSort('rarity')}
										className='w-full px-3 py-1.5 text-left hover:bg-amber-900/40 text-stone-200 cursor-pointer'
									>
										✨ 依稀有度排序
									</button>
									<button
										onClick={() => handleAutoSort('value')}
										className='w-full px-3 py-1.5 text-left hover:bg-amber-900/40 text-stone-200 cursor-pointer'
									>
										🪙 依價值排序
									</button>
									<button
										onClick={() => handleAutoSort('weight')}
										className='w-full px-3 py-1.5 text-left hover:bg-amber-900/40 text-stone-200 cursor-pointer'
									>
										⚖️ 依重量排序
									</button>
									<div className='border-t border-stone-800 my-1' />
									<button
										onClick={handleConsolidateStacks}
										className='w-full px-3 py-1.5 text-left hover:bg-emerald-950/60 text-emerald-300 font-medium cursor-pointer flex items-center gap-1'
									>
										<span>📦 合併同名同詞條堆疊</span>
									</button>
								</div>
							</div>
						</div>
					</div>

					<InventoryGrid
						items={visibleBagItems}
						viewMode={viewMode}
						displayMode={displayMode}
						inspectedItemId={inspectedItem?.id ?? null}
						totalItemsValueGp={encumbranceStats.totalItemsValueGp}
						rarityConfig={RARITY_CONFIG}
						isItemMatchingFilter={isItemMatchingFilter}
						setSelectedItemId={handleSelectItem}
						toggleEquip={toggleEquip}
					/>
				</div>
				{/* 右側物品檢視卡：僅桌面版顯示 (lg 以上) */}
				<div className='hidden lg:block lg:w-5/12 shrink-0 sticky top-5'>
					<ItemTooltip
						inspectedItem={inspectedItem}
						viewMode={viewMode}
						rarityConfig={RARITY_CONFIG}
						weaponMasteries={WEAPON_MASTERIES}
						characters={characters}
						activeCharId={activeCharId}
						viewerCharId={viewerCharId}
						adjustCharges={adjustCharges}
						toggleEquip={toggleEquip}
						toggleAttune={toggleAttune}
						consumeOrSplitStack={consumeOrSplitStack}
						transferItemToCharacter={transferItemToCharacter}
						toggleIdentify={toggleIdentify}
						deleteItem={(item) => {
							deleteItem(item);
							setIsMobileSheetOpen(false);
						}}
						onOpenEditModal={(item) => {
							setIsMobileSheetOpen(false);
							openEditItemModal(item);
						}}
						onUpdatePlayerNotes={updatePlayerNotes}
						onTogglePrivate={togglePrivateItem}
						copiedAffix={copiedAffix}
						onCopyAffix={handleCopyAffix}
						onPasteAffix={handlePasteAffixToItem}
						onUpdateAffixes={updateItemAffixes}
					/>
				</div>

				{/* 手機版專屬 Bottom Sheet (lg 以下點擊彈出) */}
				<Drawer.Root
					open={isMobileSheetOpen}
					onOpenChange={setIsMobileSheetOpen}
				>
					<Drawer.Portal>
						<Drawer.Overlay className='fixed inset-0 bg-black/75 backdrop-blur-xs z-40 lg:hidden' />
						<Drawer.Content className='fixed bottom-0 left-0 right-0 max-h-[88vh] bg-[#110e0c] border-t-2 border-amber-700/60 rounded-t-2xl z-50 flex flex-col lg:hidden outline-none shadow-[0_-10px_40px_rgba(0,0,0,0.9)]'>
							{/* 頂部拖曳把手與關閉鈕 */}
							<div className='flex items-center justify-between px-4 py-2.5 border-b border-stone-800/80 shrink-0'>
								<div className='w-6' />
								<div className='w-12 h-1.5 rounded-full bg-stone-700' />
								<button
									onClick={() => setIsMobileSheetOpen(false)}
									className='p-1 rounded-md text-stone-400 hover:text-stone-200 hover:bg-stone-800'
								>
									<X className='w-4 h-4' />
								</button>
							</div>

							{/* 內部可滾動詳情區 */}
							<div className='overflow-y-auto p-3 overscroll-contain'>
								<Drawer.Title className='sr-only'>物品詳細資訊</Drawer.Title>
								<ItemTooltip
									inspectedItem={inspectedItem}
									viewMode={viewMode}
									rarityConfig={RARITY_CONFIG}
									weaponMasteries={WEAPON_MASTERIES}
									characters={characters}
									activeCharId={activeCharId}
									viewerCharId={viewerCharId}
									adjustCharges={adjustCharges}
									toggleEquip={toggleEquip}
									toggleAttune={toggleAttune}
									consumeOrSplitStack={consumeOrSplitStack}
									transferItemToCharacter={(item, targetId, qty) => {
										transferItemToCharacter(item, targetId, qty);
										setIsMobileSheetOpen(false);
									}}
									toggleIdentify={toggleIdentify}
									deleteItem={(item) => {
										deleteItem(item);
										setIsMobileSheetOpen(false);
									}}
									onOpenEditModal={(item) => {
										setIsMobileSheetOpen(false);
										openEditItemModal(item);
									}}
									onUpdatePlayerNotes={updatePlayerNotes}
									onTogglePrivate={togglePrivateItem}
									copiedAffix={copiedAffix}
									onCopyAffix={handleCopyAffix}
									onPasteAffix={handlePasteAffixToItem}
									onUpdateAffixes={updateItemAffixes}
								/>
							</div>
						</Drawer.Content>
					</Drawer.Portal>
				</Drawer.Root>
			</main>

			{/* 彈窗 1：DM 自創與編輯道具工坊 */}
			<HomebrewModal
				isOpen={isHomebrewModalOpen}
				isEditing={Boolean(editingItemId)}
				form={newItemForm}
				setForm={setNewItemForm}
				onSubmit={handleSaveHomebrewOrEditItem}
				characterName={activeCharacter.name}
				onClose={() => {
					setIsHomebrewModalOpen(false);
					setEditingItemId(null);
				}}
				weaponMasteries={WEAPON_MASTERIES}
				copiedAffix={copiedAffix}
				onCopyAffix={handleCopyAffix}
			/>

			{/* 彈窗 2：角色錢包與五種貨幣管理 */}
			<CurrencyPanel
				isOpen={isCoinModalOpen}
				activeCharacter={activeCharacter}
				onClose={() => setIsCoinModalOpen(false)}
				onUpdateCurrency={updateCurrency}
				onConsolidateCoinsToGold={consolidateCoinsToGold}
			/>
		</div>
	);
}
