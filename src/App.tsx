import { useState, useMemo, type FormEvent } from 'react';
import InventoryGrid from './components/InventoryGrid';
import HomebrewModal from './components/HomebrewModal';
import CurrencyPanel from './components/CurrencyPanel';
import ItemTooltip from './components/ItemTooltip';
import {
	INITIAL_CHARACTERS,
	INITIAL_ITEMS,
	RARITY_CONFIG,
	WEAPON_MASTERIES,
} from './data';
import type {
	CurrencyType,
	HomebrewForm,
	InventoryItem,
	Rarity,
	ViewMode,
} from './types';
import {
	Sword,
	Shield,
	FlaskConical,
	Gem,
	Coins,
	Backpack,
	Sparkles,
	Plus,
	ArrowUpDown,
	Search,
	User,
	Scale,
	Crown,
} from 'lucide-react';
import { useCampaignSync } from './hooks/useCampaignSync';

export default function App() {
	// 視角狀態：'player' | 'dm'
	const [viewMode, setViewMode] = useState<ViewMode>('dm');
	// 當前選中角色
	// 背包物品清單
	const { characters, setCharacters, items, setItems, syncStatus } =
		useCampaignSync(INITIAL_CHARACTERS, INITIAL_ITEMS);
	const [activeCharId, setActiveCharId] = useState('tav');
	// 當前檢視/選中的物品 ID
	const [selectedItemId, setSelectedItemId] = useState('item-1');
	// 懸停預覽的物品 ID
	const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

	// 背包篩選與搜尋
	const [categoryFilter, setCategoryFilter] = useState('All');
	const [searchQuery, setSearchQuery] = useState('');
	const [countCoinWeight, setCountCoinWeight] = useState(true); // D&D 規則：50枚硬幣 = 1磅

	// 拖曳與點擊換位狀態
	const [draggedSlot, setDraggedSlot] = useState<number | null>(null);
	const [moveSourceSlot, setMoveSourceSlot] = useState<number | null>(null); // 支援手機/點擊換位

	// 彈窗狀態：自創道具鍛造工坊 & 金幣調整
	const [isHomebrewModalOpen, setIsHomebrewModalOpen] = useState(false);
	const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
	const [toastMessage, setToastMessage] = useState<string | null>(null);

	// 新建自創道具表單狀態
	const [newItemForm, setNewItemForm] = useState<HomebrewForm>({
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
	});

	// 顯示輕量提示訊息
	const showToast = (msg: string) => {
		setToastMessage(msg);
		setTimeout(() => setToastMessage(null), 3000);
	};

	// 取得當前角色
	const activeCharacter = useMemo(
		() => characters.find((c) => c.id === activeCharId) || characters[0],
		[characters, activeCharId],
	);

	// 取得當前角色的背包物品
	const characterItems = useMemo(
		() => items.filter((item) => item.ownerId === activeCharId),
		[items, activeCharId],
	);

	// 計算同調欄位數量 (D&D 5R 上限為 3)
	const attunedCount = useMemo(
		() => characterItems.filter((item) => item.attuned).length,
		[characterItems],
	);

	// 計算硬幣總重量與總價值(折合GP)
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

	// 計算物品總重量與負重上限 (STR * 15)
	const encumbranceStats = useMemo(() => {
		const itemsWeight = characterItems.reduce(
			(sum, item) => sum + item.weight * item.quantity,
			0,
		);
		const totalWeight = +(itemsWeight + currencyStats.coinWeight).toFixed(1);
		const maxWeight = activeCharacter.str * 15;
		const percentage = Math.min(
			100,
			Math.round((totalWeight / maxWeight) * 100),
		);
		const totalItemsValueGp = characterItems.reduce(
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
	}, [characterItems, currencyStats.coinWeight, activeCharacter.str]);

	// 決定右側資訊卡要顯示哪個物品（優先顯示滑鼠懸停，否則顯示點擊鎖定的物品）
	const inspectedItem = useMemo(() => {
		const targetId = hoveredItemId || selectedItemId;
		const found = items.find(
			(i) => i.id === targetId && i.ownerId === activeCharId,
		);
		return found || characterItems[0] || null;
	}, [hoveredItemId, selectedItemId, items, activeCharId, characterItems]);

	// 篩選匹配判斷（在網格中把不符篩選條件的物品變暗，保留 BG3 空間感）
	const isItemMatchingFilter = (item: InventoryItem | null | undefined) => {
		if (!item) return false;
		const matchesCategory =
			categoryFilter === 'All' || item.category === categoryFilter;
		const displayName =
			!item.isIdentified && viewMode === 'player' ? '未知魔法物品' : item.name;
		const matchesSearch =
			!searchQuery.trim() ||
			displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.subType.toLowerCase().includes(searchQuery.toLowerCase());
		return matchesCategory && matchesSearch;
	};

	// ==========================================
	// 背包網格拖曳與交換邏輯 (共 36 格：6列 x 6欄)
	// ==========================================
	const TOTAL_SLOTS = 36;

	const swapOrMoveSlot = (fromSlot: number | null, toSlot: number | null) => {
		if (fromSlot === null || toSlot === null || fromSlot === toSlot) return;

		setItems((prevItems) => {
			const sourceItem = prevItems.find(
				(i) => i.ownerId === activeCharId && i.slot === fromSlot,
			);
			const targetItem = prevItems.find(
				(i) => i.ownerId === activeCharId && i.slot === toSlot,
			);

			if (!sourceItem) return prevItems;

			// 若是同名且可堆疊的消耗品，則合併堆疊
			if (
				targetItem &&
				sourceItem.name === targetItem.name &&
				sourceItem.category === 'Consumable'
			) {
				showToast(`已合併堆疊：${sourceItem.name}`);
				return prevItems
					.map((item) => {
						if (item.id === targetItem.id) {
							return { ...item, quantity: item.quantity + sourceItem.quantity };
						}
						return item;
					})
					.filter((item) => item.id !== sourceItem.id);
			}

			// 否則互換格位座標
			return prevItems.map((item) => {
				if (item.id === sourceItem.id) {
					return { ...item, slot: toSlot };
				}
				if (targetItem && item.id === targetItem.id) {
					return { ...item, slot: fromSlot };
				}
				return item;
			});
		});
	};

	// 自動整理排序 (依稀有度 / 重量 / 價值)
	const handleAutoSort = (sortBy: 'rarity' | 'weight' | 'value') => {
		const rarityOrder: Record<Rarity, number> = {
			Artifact: 6,
			Legendary: 5,
			VeryRare: 4,
			Rare: 3,
			Uncommon: 2,
			Common: 1,
		};

		const sortedCharItems = [...characterItems].sort((a, b) => {
			if (sortBy === 'rarity') {
				return (
					rarityOrder[b.rarity] - rarityOrder[a.rarity] || b.valueGp - a.valueGp
				);
			}
			if (sortBy === 'weight') {
				return b.weight * b.quantity - a.weight * a.quantity;
			}
			if (sortBy === 'value') {
				return b.valueGp * b.quantity - a.valueGp * a.quantity;
			}
			return 0;
		});

		const slotMap: Record<string, number> = {};
		sortedCharItems.forEach((item, index) => {
			slotMap[item.id] = index;
		});

		setItems((prev) =>
			prev.map((item) =>
				item.ownerId === activeCharId
					? { ...item, slot: slotMap[item.id] }
					: item,
			),
		);
		showToast(
			`已依${sortBy === 'rarity' ? '稀有度' : sortBy === 'weight' ? '重量' : '價值'}重新整理背包`,
		);
	};

	// ==========================================
	// 物品操作：裝備、同調、充能、鑑定、移交、拆分
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
			// 尋找第一個空格
			const occupiedSlots = new Set(characterItems.map((i) => i.slot));
			let emptySlot = -1;
			for (let s = 0; s < TOTAL_SLOTS; s++) {
				if (!occupiedSlots.has(s)) {
					emptySlot = s;
					break;
				}
			}
			if (emptySlot === -1) {
				showToast('⚠️ 背包已滿，無法拆分堆疊！');
				return;
			}
			const half = Math.floor(item.quantity / 2);
			const remain = item.quantity - half;
			const newClone = {
				...item,
				id: `item-${Date.now()}`,
				slot: emptySlot,
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
	) => {
		if (targetCharId === item.ownerId) return;
		const targetItems = items.filter((i) => i.ownerId === targetCharId);
		const occupied = new Set(targetItems.map((i) => i.slot));
		let firstFreeSlot = 0;
		while (occupied.has(firstFreeSlot)) firstFreeSlot++;

		const targetCharName = characters.find((c) => c.id === targetCharId)?.name;
		setItems((prev) =>
			prev.map((i) =>
				i.id === item.id
					? {
							...i,
							ownerId: targetCharId,
							slot: firstFreeSlot,
							equipped: false,
							attuned: false,
						}
					: i,
			),
		);
		showToast(`📦 已將物品移交給 ${targetCharName}`);
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

	// 一鍵將零錢 (CP/SP/EP) 往上兌換成 GP
	const consolidateCoinsToGold = () => {
		setCharacters((prev) =>
			prev.map((char) => {
				if (char.id !== activeCharId) return char;
				const pp = char.currencies.pp;
				let { gp, ep, sp, cp } = char.currencies;
				// 先把 CP 換 SP
				sp += Math.floor(cp / 10);
				cp = cp % 10;
				// 把 SP 與 EP 換 GP
				gp += Math.floor(sp / 10) + Math.floor(ep / 2);
				sp = sp % 10;
				ep = ep % 2;
				return { ...char, currencies: { pp, gp, ep, sp, cp } };
			}),
		);
		showToast('🪙 已自動將銅幣、銀幣與電金幣換算為金幣 (GP)！');
	};

	// ==========================================
	// DM 鍛造並發放自創道具 (Homebrew Minting)
	// ==========================================
	const handleCreateHomebrewItem = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!newItemForm.name.trim()) return;

		const occupied = new Set(characterItems.map((i) => i.slot));
		let emptySlot = 0;
		while (occupied.has(emptySlot) && emptySlot < TOTAL_SLOTS) emptySlot++;

		const createdItem = {
			id: `hb-${Date.now()}`,
			ownerId: activeCharId,
			slot: emptySlot,
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
		};

		setItems((prev) => [...prev, createdItem]);
		setSelectedItemId(createdItem.id);
		setIsHomebrewModalOpen(false);
		showToast(
			`✨ 已鍛造自創道具「${createdItem.name}」並放入 ${activeCharacter.name} 的背包！`,
		);
	};

	return (
		<div className='min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-600/40 selection:text-amber-200 relative overflow-x-hidden'>
			{/* 背景古典暗紋與光暈 */}
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.14),_rgba(12,10,9,0.95)_70%)]' />

			{/* 頂部動態提示 Toast */}
			{toastMessage && (
				<div className='fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 border border-amber-500/80 text-amber-200 px-5 py-2.5 rounded-md shadow-[0_0_25px_rgba(245,158,11,0.35)] flex items-center gap-2.5 text-sm font-medium animate-bounce'>
					<Sparkles className='w-4 h-4 text-amber-400 shrink-0' />
					<span>{toastMessage}</span>
				</div>
			)}

			{/* ========================================== */}
			{/* 頂部導覽列：戰役標題 & DM/玩家視角切換器 */}
			{/* ========================================== */}
			<header className='relative z-10 border-b border-amber-900/40 bg-stone-950/90 backdrop-blur-md px-4 lg:px-8 py-3'>
				<div className='max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3'>
					{/* 左側標題 */}
					<div className='flex items-center gap-3'>
						<div className='w-10 h-10 rounded-lg bg-gradient-to-br from-amber-700 via-amber-900 to-stone-950 border border-amber-500/60 flex items-center justify-center shadow-[0_0_15px_rgba(217,119,6,0.3)]'>
							<Backpack className='w-5 h-5 text-amber-300' />
						</div>
						<div>
							<div className='flex items-center gap-2'>
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
								支援武器精通 (Weapon Mastery)、未鑑定迷霧與即時網格拖曳
							</p>
						</div>
					</div>

					{/* 右側：視角切換與 DM 鍛造按鈕 */}
					<div className='flex items-center gap-3'>
						{viewMode === 'dm' && (
							<button
								onClick={() => setIsHomebrewModalOpen(true)}
								className='flex items-center gap-2 px-3.5 py-2 rounded bg-gradient-to-b from-purple-700 to-purple-950 border border-purple-400/70 hover:border-purple-300 text-purple-100 text-xs sm:text-sm font-medium shadow-[0_0_15px_rgba(168,85,247,0.35)] hover:brightness-110 transition cursor-pointer'
							>
								<Plus className='w-4 h-4 text-purple-300' />
								<span>鍛造自創道具 (Homebrew)</span>
							</button>
						)}

						{/* 玩家視角 vs DM 上帝視角 */}
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
			{/* 角色切換與頂部狀態欄（負重、同調、五種貨幣） */}
			{/* ========================================== */}
			<section className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-5'>
				<div className='grid grid-cols-1 lg:grid-cols-12 gap-4 bg-gradient-to-b from-stone-900/90 to-stone-950/95 border border-amber-800/40 rounded-lg p-4 shadow-xl'>
					{/* 左側：小隊成員選擇器 */}
					<div className='lg:col-span-5 flex flex-wrap sm:flex-nowrap items-center gap-2'>
						{characters.map((char) => {
							const isSelected = char.id === activeCharId;
							return (
								<button
									key={char.id}
									onClick={() => {
										setActiveCharId(char.id);
										setMoveSourceSlot(null);
									}}
									className={`flex-1 min-w-[120px] flex items-center gap-2.5 p-2.5 rounded-md border text-left transition cursor-pointer ${
										isSelected
											? 'bg-gradient-to-b from-amber-950/80 to-stone-900 border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
											: 'bg-stone-900/60 border-stone-800 hover:border-amber-800/50 opacity-75 hover:opacity-100'
									}`}
								>
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
					</div>

					{/* 中間：負重進度條與同調欄位 */}
					<div className='lg:col-span-4 flex flex-col justify-center gap-2 border-t lg:border-t-0 lg:border-x border-stone-800 pt-3 lg:pt-0 lg:px-4'>
						{/* 負重條 */}
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
									{encumbranceStats.totalWeight} / {encumbranceStats.maxWeight}{' '}
									lbs
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

						{/* 同調欄位與硬幣計重開關 */}
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
			{/* 主內容區：左側 BG3 背包網格 (7欄) + 右側物品檢視卡 (5欄) */}
			{/* ========================================== */}
			<main className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6'>
				{/* ========================================== */}
				{/* 左側：博德之門3 風格背包網格區 */}
				{/* ========================================== */}
				<div className='lg:col-span-7 flex flex-col bg-gradient-to-b from-[#171412] via-[#12100e] to-[#0c0a09] border-2 border-amber-800/50 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.85)] overflow-hidden'>
					{/* 背包過濾標籤與搜尋列 */}
					<div className='p-3.5 bg-stone-950/90 border-b border-amber-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
						{/* 分類頁籤 */}
						<div className='flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0'>
							{[
								{ id: 'All', label: '全部', icon: Backpack },
								{ id: 'Weapon', label: '武器', icon: Sword },
								{ id: 'Armor', label: '護甲', icon: Shield },
								{ id: 'Consumable', label: '消耗品', icon: FlaskConical },
								{ id: 'Misc', label: '奇物/雜物', icon: Gem },
							].map((tab) => {
								const IconComp = tab.icon;
								const active = categoryFilter === tab.id;
								return (
									<button
										key={tab.id}
										onClick={() => setCategoryFilter(tab.id)}
										className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition cursor-pointer ${
											active
												? 'bg-gradient-to-b from-amber-700 to-amber-900 text-amber-100 border border-amber-400/70 shadow'
												: 'bg-stone-900/80 text-stone-400 border border-stone-800 hover:text-stone-200'
										}`}
									>
										<IconComp className='w-3.5 h-3.5' />
										<span>{tab.label}</span>
									</button>
								);
							})}
						</div>

						{/* 搜尋與排序 */}
						<div className='flex items-center gap-2'>
							<div className='relative flex-1 sm:w-44'>
								<Search className='w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2' />
								<input
									type='text'
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder='搜尋道具名稱...'
									className='w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded pl-8 pr-2.5 py-1 text-xs text-stone-200 placeholder:text-stone-500 outline-none'
								/>
							</div>

							<div className='relative group'>
								<button className='flex items-center gap-1 px-2.5 py-1.5 rounded bg-stone-900 border border-stone-700 hover:border-amber-600/60 text-xs text-stone-300 cursor-pointer'>
									<ArrowUpDown className='w-3.5 h-3.5 text-amber-400' />
									<span>整理</span>
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
								</div>
							</div>
						</div>
					</div>

					{/* 操作小提示 */}
					<div className='px-4 py-1.5 bg-stone-900/70 border-b border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400'>
						<span>
							💡 支援<strong>滑鼠拖曳 (Drag &amp; Drop)</strong>{' '}
							換位；若使用觸控螢幕，可點擊物品後再點擊目標空格移動。
						</span>
						{moveSourceSlot !== null && (
							<span className='text-amber-400 font-semibold animate-pulse'>
								請點擊要交換的目標格位...
							</span>
						)}
					</div>

					<InventoryGrid
						items={characterItems}
						totalSlots={TOTAL_SLOTS}
						viewMode={viewMode}
						inspectedItemId={inspectedItem?.id ?? null}
						moveSourceSlot={moveSourceSlot}
						draggedSlot={draggedSlot}
						totalItemsValueGp={encumbranceStats.totalItemsValueGp}
						rarityConfig={RARITY_CONFIG}
						isItemMatchingFilter={isItemMatchingFilter}
						setDraggedSlot={setDraggedSlot}
						setHoveredItemId={setHoveredItemId}
						setSelectedItemId={setSelectedItemId}
						setMoveSourceSlot={setMoveSourceSlot}
						swapOrMoveSlot={swapOrMoveSlot}
						toggleEquip={toggleEquip}
					/>
				</div>

				{/* ========================================== */}
				<ItemTooltip
					inspectedItem={inspectedItem}
					viewMode={viewMode}
					rarityConfig={RARITY_CONFIG}
					weaponMasteries={WEAPON_MASTERIES}
					characters={characters}
					activeCharId={activeCharId}
					moveSourceSlot={moveSourceSlot}
					setMoveSourceSlot={setMoveSourceSlot}
					adjustCharges={adjustCharges}
					toggleEquip={toggleEquip}
					toggleAttune={toggleAttune}
					consumeOrSplitStack={consumeOrSplitStack}
					transferItemToCharacter={transferItemToCharacter}
					toggleIdentify={toggleIdentify}
					deleteItem={deleteItem}
				/>
			</main>

			{/* ========================================== */}
			{/* 彈窗 1：DM 自創道具鍛造工坊 (Homebrew Creator Modal) */}
			{/* ========================================== */}
			<HomebrewModal
				isOpen={isHomebrewModalOpen}
				form={newItemForm}
				setForm={setNewItemForm}
				onSubmit={handleCreateHomebrewItem}
				characterName={activeCharacter.name}
				onClose={() => setIsHomebrewModalOpen(false)}
				weaponMasteries={WEAPON_MASTERIES}
			/>

			{/* ========================================== */}
			{/* 彈窗 2：角色錢包與五種貨幣管理 (Currency Modal) */}
			{/* ========================================== */}
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
