import React, { useState, useMemo } from 'react';
import {
	Sword,
	Shield,
	FlaskConical,
	Scroll,
	Gem,
	Coins,
	Backpack,
	Sparkles,
	Eye,
	EyeOff,
	Plus,
	Trash2,
	ArrowUpDown,
	Search,
	User,
	Scale,
	Lock,
	Unlock,
	Flame,
	Zap,
	Heart,
	HelpCircle,
	CheckCircle2,
	AlertTriangle,
	Hammer,
	Crown,
	Wand2,
	Package,
	RefreshCw,
	ChevronRight,
	Info,
	ShieldAlert,
	Star,
	Move,
} from 'lucide-react';

// ==========================================
// D&D 5R (2024) 武器精通 (Weapon Mastery) 字典
// ==========================================
const WEAPON_MASTERIES = {
	None: { name: '無', desc: '' },
	Cleave: {
		name: '順劈 (Cleave)',
		desc: '近戰命中一個生物時，可對距離你5呎內且在原目標5呎內的第二個生物進行一次近戰攻擊檢定（傷害不加屬性調整值，每回合一次）。',
	},
	Graze: {
		name: '擦傷 (Graze)',
		desc: '當你對一個生物的攻擊檢定失手時，仍可對該生物造成等同於你攻擊所用屬性調整值的同類型傷害。',
	},
	Nick: {
		name: '輕削 (Nick)',
		desc: '當你發動輕型（Light）武器屬性帶來的額外攻擊時，你可以將其作為攻擊動作的一部分發動，而非消耗附贈動作（每回合一次）。',
	},
	Push: {
		name: '推撞 (Push)',
		desc: '命中生物時，若其體型不超過大型（Large），你可以將其往遠離你的方向直線推開最多 10 呎。',
	},
	Sap: {
		name: '削弱 (Sap)',
		desc: '命中生物時，該生物在下個你的回合開始前的下一次攻擊檢定具有劣勢（Disadvantage）。',
	},
	Slow: {
		name: '遲緩 (Slow)',
		desc: '命中生物並造成傷害時，直到你的下個回合開始前，該生物的速度減少 10 呎（多次命中不疊加）。',
	},
	Topple: {
		name: '擊倒 (Topple)',
		desc: '命中生物時，可迫使目標進行一次體質豁免（DC 8 + 熟練加值 + 攻擊屬性調整值），失敗則陷入倒地（Prone）狀態。',
	},
	Vex: {
		name: '煩擾 (Vex)',
		desc: '命中生物並造成傷害時，你在下個回合結束前對該生物進行的下一次攻擊檢定具有優勢（Advantage）。',
	},
};

// ==========================================
// 稀有度視覺配置 (BG3 風格色彩與發光)
// ==========================================
const RARITY_CONFIG = {
	Common: {
		label: '普通',
		color: '#9ca3af',
		border: 'border-stone-600/80 hover:border-stone-400',
		bg: 'from-stone-800/90 via-stone-900/95 to-stone-950',
		headerGradient: 'from-stone-700/80 via-stone-800/90 to-stone-950',
		glow: '',
		text: 'text-stone-300',
		badgeBg: 'bg-stone-800 text-stone-300 border-stone-600',
	},
	Uncommon: {
		label: '非普通',
		color: '#22c55e',
		border: 'border-emerald-500/70 hover:border-emerald-400',
		bg: 'from-emerald-950/60 via-stone-900/95 to-stone-950',
		headerGradient: 'from-emerald-900/90 via-emerald-950/90 to-stone-950',
		glow: 'shadow-[inset_0_0_12px_rgba(34,197,94,0.25),0_0_8px_rgba(34,197,94,0.15)]',
		text: 'text-emerald-400',
		badgeBg: 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50',
	},
	Rare: {
		label: '稀有',
		color: '#3b82f6',
		border: 'border-blue-500/80 hover:border-blue-400',
		bg: 'from-blue-950/65 via-stone-900/95 to-stone-950',
		headerGradient: 'from-blue-900/90 via-blue-950/90 to-stone-950',
		glow: 'shadow-[inset_0_0_14px_rgba(59,130,246,0.3),0_0_10px_rgba(59,130,246,0.2)]',
		text: 'text-blue-400',
		badgeBg: 'bg-blue-950/90 text-blue-300 border-blue-500/50',
	},
	VeryRare: {
		label: '極珍稀',
		color: '#a855f7',
		border: 'border-purple-500/80 hover:border-purple-400',
		bg: 'from-purple-950/65 via-stone-900/95 to-stone-950',
		headerGradient: 'from-purple-900/90 via-purple-950/90 to-stone-950',
		glow: 'shadow-[inset_0_0_16px_rgba(168,85,247,0.35),0_0_12px_rgba(168,85,247,0.25)]',
		text: 'text-purple-400',
		badgeBg: 'bg-purple-950/90 text-purple-300 border-purple-500/50',
	},
	Legendary: {
		label: '傳奇',
		color: '#f59e0b',
		border: 'border-amber-400/90 hover:border-amber-300',
		bg: 'from-amber-950/70 via-stone-900/95 to-stone-950',
		headerGradient: 'from-amber-700/90 via-amber-950/90 to-stone-950',
		glow: 'shadow-[inset_0_0_18px_rgba(245,158,11,0.4),0_0_15px_rgba(245,158,11,0.3)]',
		text: 'text-amber-400',
		badgeBg: 'bg-amber-950/90 text-amber-300 border-amber-400/60',
	},
	Artifact: {
		label: '神器',
		color: '#ef4444',
		border: 'border-red-500/90 hover:border-red-400',
		bg: 'from-red-950/75 via-stone-900/95 to-stone-950',
		headerGradient: 'from-red-800/90 via-red-950/90 to-stone-950',
		glow: 'shadow-[inset_0_0_20px_rgba(239,68,68,0.45),0_0_16px_rgba(239,68,68,0.35)]',
		text: 'text-red-400',
		badgeBg: 'bg-red-950/90 text-red-300 border-red-500/60',
	},
};

// ==========================================
// 預設角色與初始背包資料
// ==========================================
const INITIAL_CHARACTERS = [
	{
		id: 'tav',
		name: '塔夫 (Tav)',
		title: 'Lv.8 復仇誓言聖武士',
		str: 18, // 負重上限 18 * 15 = 270 lbs
		avatar: '🛡️',
		currencies: { pp: 2, gp: 485, ep: 0, sp: 34, cp: 80 },
	},
	{
		id: 'shadowheart',
		name: '影心 (Shadowheart)',
		title: 'Lv.8 詭術領域牧師',
		str: 12, // 負重上限 180 lbs
		avatar: '🌙',
		currencies: { pp: 0, gp: 210, ep: 15, sp: 60, cp: 20 },
	},
	{
		id: 'gale',
		name: '蓋爾 (Gale)',
		title: 'Lv.8 塑能學派法師',
		str: 9, // 負重上限 135 lbs
		avatar: '🔮',
		currencies: { pp: 5, gp: 120, ep: 0, sp: 12, cp: 5 },
	},
	{
		id: 'camp',
		name: '營地旅人儲物箱',
		title: '小隊公用倉庫 & 公基金',
		str: 999, // 無限負重
		avatar: '🏕️',
		currencies: { pp: 14, gp: 2450, ep: 40, sp: 310, cp: 500 },
	},
];

const INITIAL_ITEMS = [
	{
		id: 'item-1',
		ownerId: 'tav',
		slot: 0,
		name: '博德安之巨劍 (Giantslayer)',
		category: 'Weapon',
		subType: '巨劍 (雙手・重型)',
		rarity: 'Legendary',
		icon: 'Sword',
		damage: '2d6+3 揮砍',
		mastery: 'Cleave',
		ac: null,
		weight: 6.0,
		valueGp: 4500,
		quantity: 1,
		equipped: true,
		requiresAttunement: true,
		attuned: true,
		isHomebrew: false,
		isIdentified: true,
		charges: 1,
		maxCharges: 1,
		effects:
			'【巨人殺手】命中時，將你的力量調整值兩倍加到傷害中，並在攻擊大型或更大生物時獲得優勢。\n【泰坦化】每長休一次，可巨大化自身10回合，獲得 27 臨時生命值。',
		flavor:
			'「傳說中博德之門建立者博德安曾揮舞此劍斬殺巨龍，劍刃上仍流淌著遠古的金輝。」',
		dmNotes:
			'當玩家進入飛龍關底層時，此劍會與安蘇的遺骸產生共鳴並自動觸發劇情檢定。',
	},
	{
		id: 'item-2',
		ownerId: 'tav',
		slot: 1,
		name: '黯蝕誓約全身鎧甲',
		category: 'Armor',
		subType: '重甲 (板甲)',
		rarity: 'VeryRare',
		icon: 'Shield',
		damage: null,
		mastery: 'None',
		ac: '18 + 傷害減免 2',
		weight: 65.0,
		valueGp: 2800,
		quantity: 1,
		equipped: true,
		requiresAttunement: true,
		attuned: true,
		isHomebrew: true,
		isIdentified: true,
		charges: 3,
		maxCharges: 3,
		effects:
			'【堅不可摧】所有受到的穿刺、揮砍、鈍擊傷害減少 2 點。\n【復仇反擊】消耗 1 發充能，當被近戰命中時以反應釋放 2d8 黯蝕火焰。',
		flavor: '「以幽暗地域精金與墮落聖武士的殘骸鍛造而成，觸碰時冰冷刺骨。」',
		dmNotes:
			'【DM自創道具】每次耗盡所有充能時，穿戴者須進行 DC 14 感知豁免，失敗則累積一層「噬魂印記」。',
	},
	{
		id: 'item-3',
		ownerId: 'tav',
		slot: 2,
		name: '猩紅渴望匕首',
		category: 'Weapon',
		subType: '匕首 (輕型・靈巧・投擲)',
		rarity: 'Rare',
		icon: 'Zap',
		damage: '1d4+2 穿刺 + 1d4 黯蝕',
		mastery: 'Nick',
		ac: null,
		weight: 1.0,
		valueGp: 850,
		quantity: 1,
		equipped: false,
		requiresAttunement: true,
		attuned: false,
		isHomebrew: true,
		isIdentified: false, // 預設未鑑定！測試玩家視角與DM視角差異
		charges: 0,
		maxCharges: 0,
		effects:
			'【鮮血盛宴】以輕削（Nick）發動額外攻擊並命中時，恢復等同於黯蝕傷害量的生命值。',
		flavor: '「刀柄上的紅寶石宛如活物的心臟般微微搏動，渴望著新鮮的血液。」',
		dmNotes:
			'【隱藏詛咒】未經移除詛咒直接同調者，在戰鬥中若滿血則無法自願收起武器，必須攻擊最近的生物。',
	},
	{
		id: 'item-4',
		ownerId: 'tav',
		slot: 4,
		name: '高等治療藥水',
		category: 'Consumable',
		subType: '藥水 (5R 附贈動作飲用)',
		rarity: 'Uncommon',
		icon: 'FlaskConical',
		damage: '恢復 4d4+4 HP',
		mastery: 'None',
		ac: null,
		weight: 0.5,
		valueGp: 150,
		quantity: 5,
		equipped: false,
		requiresAttunement: false,
		attuned: false,
		isHomebrew: false,
		isIdentified: true,
		charges: 0,
		maxCharges: 0,
		effects:
			'【2024 5R 規則】飲用或餵食此藥水僅需消耗一個「附贈動作 (Bonus Action)」，立即恢復 4d4 + 4 點生命值。',
		flavor:
			'「裝在精緻水晶瓶中的鮮紅液體，搖晃時散發出淡淡的柑橘與魔法微光。」',
		dmNotes: '其中一瓶是在鬼婆茶室撿到的，但這批是乾淨的正常藥水。',
	},
	{
		id: 'item-5',
		ownerId: 'tav',
		slot: 5,
		name: '洛山達之血 (Blood of Lathander)',
		category: 'Weapon',
		subType: '硬頭錘 (單手)',
		rarity: 'Legendary',
		icon: 'Flame',
		damage: '1d6+3 鈍擊',
		mastery: 'Sap',
		ac: null,
		weight: 4.0,
		valueGp: 3200,
		quantity: 1,
		equipped: false,
		requiresAttunement: true,
		attuned: false,
		isHomebrew: false,
		isIdentified: true,
		charges: 1,
		maxCharges: 1,
		effects:
			'【晨曦聖光】散發 20 呎神聖光芒，範圍內不死生物與邪魔目盲。\n【烈日束】每長休可釋放一次 6 環陽炎射線（Sunbeam）。',
		flavor: '「封存著晨曦之主一滴神聖琥珀精血的傳奇戰錘。」',
		dmNotes: '若借給影心裝備，在莎爾神殿內會引發神罰環境事件。',
	},
	{
		id: 'item-6',
		ownerId: 'tav',
		slot: 7,
		name: '迷蹤步法術卷軸',
		category: 'Consumable',
		subType: '2環咒法卷軸',
		rarity: 'Uncommon',
		icon: 'Scroll',
		damage: '傳送 30 呎',
		mastery: 'None',
		ac: null,
		weight: 0.1,
		valueGp: 120,
		quantity: 3,
		equipped: false,
		requiresAttunement: false,
		attuned: false,
		isHomebrew: false,
		isIdentified: true,
		charges: 0,
		maxCharges: 0,
		effects:
			'以一個附贈動作朗讀卷軸，你被銀色薄霧包圍，傳送至 30 呎內一處你可見且未被佔據的空間。',
		flavor: '「羊皮紙上以秘銀墨水書寫著空間折躍的奧術符文。」',
		dmNotes: '',
	},
	{
		id: 'item-7',
		ownerId: 'tav',
		slot: 10,
		name: '星界銀劍碎片稜鏡',
		category: 'Misc',
		subType: '劇情神器・奇物',
		rarity: 'Artifact',
		icon: 'Gem',
		damage: null,
		mastery: 'None',
		ac: '+2 心靈豁免',
		weight: 2.0,
		valueGp: 9999,
		quantity: 1,
		equipped: false,
		requiresAttunement: true,
		attuned: true,
		isHomebrew: true,
		isIdentified: true,
		charges: 1,
		maxCharges: 1,
		effects:
			'【主腦屏蔽】免疫奪心魔的心靈感應與支配怪物效果。\n【星界共鳴】可開啟通往星界位面的短暫裂隙。',
		flavor: '「多面體表面刻滿了吉斯洋基文字，內部似乎囚禁著某種強大的存在。」',
		dmNotes:
			'【戰役核心道具】無法被丟棄或出售。玩家每次使用充能會推進主線腐化進度條 +10%。',
	},
	{
		id: 'item-8',
		ownerId: 'tav',
		slot: 12,
		name: '破城者重戰錘',
		category: 'Weapon',
		subType: '戰錘 (雙用 1d8/1d10)',
		rarity: 'Rare',
		icon: 'Hammer',
		damage: '1d8+2 鈍擊 + 1d6 雷鳴',
		mastery: 'Push',
		ac: null,
		weight: 5.0,
		valueGp: 1100,
		quantity: 1,
		equipped: false,
		requiresAttunement: false,
		attuned: false,
		isHomebrew: true,
		isIdentified: true,
		charges: 0,
		maxCharges: 0,
		effects:
			'【攻城屬性】對物件與建築物造成雙倍傷害。\n【雷鳴推撞】配合推撞（Push）武器精通時，額外將目標推遠 5 呎（共 15 呎）。',
		flavor: '「矮人王國深爐鍛造的攻城重錘，揮擊時伴隨著沉悶的雷鳴。」',
		dmNotes: '可用於擊碎第3章地下墓穴的封印石門。',
	},
	// 影心的初始物品
	{
		id: 'item-sh-1',
		ownerId: 'shadowheart',
		slot: 0,
		name: '暗夜法官長矛',
		category: 'Weapon',
		subType: '長矛 (雙用)',
		rarity: 'VeryRare',
		icon: 'Sword',
		damage: '1d8+2 穿刺 + 1d6 黯蝕',
		mastery: 'Sap',
		ac: null,
		weight: 3.0,
		valueGp: 2200,
		quantity: 1,
		equipped: true,
		requiresAttunement: true,
		attuned: true,
		isHomebrew: false,
		isIdentified: true,
		charges: 2,
		maxCharges: 2,
		effects:
			'處於微光或黑暗環境時，攻擊檢定獲得優勢，且重擊門檻降低 1 點（19-20 重擊）。',
		flavor: '「受莎爾女神祝福的漆黑長矛，矛尖永遠籠罩在陰影之中。」',
		dmNotes: '若影心背棄莎爾，此武器可轉化為塞倫涅月光長矛。',
	},
];

// 圖示渲染器
const ItemIcon = ({ iconName, className = 'w-7 h-7' }) => {
	const icons = {
		Sword: <Sword className={className} />,
		Shield: <Shield className={className} />,
		FlaskConical: <FlaskConical className={className} />,
		Scroll: <Scroll className={className} />,
		Gem: <Gem className={className} />,
		Flame: <Flame className={className} />,
		Zap: <Zap className={className} />,
		Hammer: <Hammer className={className} />,
		Crown: <Crown className={className} />,
		Wand2: <Wand2 className={className} />,
		Package: <Package className={className} />,
	};
	return icons[iconName] || <Gem className={className} />;
};

export default function App() {
	// 視角狀態：'player' | 'dm'
	const [viewMode, setViewMode] = useState('dm');
	// 當前選中角色
	const [characters, setCharacters] = useState(INITIAL_CHARACTERS);
	const [activeCharId, setActiveCharId] = useState('tav');
	// 背包物品清單
	const [items, setItems] = useState(INITIAL_ITEMS);
	// 當前檢視/選中的物品 ID
	const [selectedItemId, setSelectedItemId] = useState('item-1');
	// 懸停預覽的物品 ID
	const [hoveredItemId, setHoveredItemId] = useState(null);

	// 背包篩選與搜尋
	const [categoryFilter, setCategoryFilter] = useState('All');
	const [searchQuery, setSearchQuery] = useState('');
	const [countCoinWeight, setCountCoinWeight] = useState(true); // D&D 規則：50枚硬幣 = 1磅

	// 拖曳與點擊換位狀態
	const [draggedSlot, setDraggedSlot] = useState(null);
	const [moveSourceSlot, setMoveSourceSlot] = useState(null); // 支援手機/點擊換位

	// 彈窗狀態：自創道具鍛造工坊 & 金幣調整
	const [isHomebrewModalOpen, setIsHomebrewModalOpen] = useState(false);
	const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
	const [toastMessage, setToastMessage] = useState(null);

	// 新建自創道具表單狀態
	const [newItemForm, setNewItemForm] = useState({
		name: '',
		category: 'Weapon',
		subType: '長劍 (雙用)',
		rarity: 'Rare',
		icon: 'Sword',
		damage: '1d8+2 揮砍',
		mastery: 'Vex',
		ac: '',
		weight: 3.0,
		valueGp: 1000,
		quantity: 1,
		requiresAttunement: true,
		isIdentified: false,
		maxCharges: 0,
		effects: '',
		flavor: '',
		dmNotes: '',
	});

	// 顯示輕量提示訊息
	const showToast = (msg) => {
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
	const isItemMatchingFilter = (item) => {
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

	const swapOrMoveSlot = (fromSlot, toSlot) => {
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
	const handleAutoSort = (sortBy) => {
		const rarityOrder = {
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

		const slotMap = {};
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
	const toggleEquip = (item) => {
		setItems((prev) =>
			prev.map((i) => (i.id === item.id ? { ...i, equipped: !i.equipped } : i)),
		);
		showToast(`${item.equipped ? '已卸下' : '已裝備'}：${item.name}`);
	};

	const toggleAttune = (item) => {
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

	const toggleIdentify = (item) => {
		setItems((prev) =>
			prev.map((i) =>
				i.id === item.id ? { ...i, isIdentified: !i.isIdentified } : i,
			),
		);
		showToast(
			`${!item.isIdentified ? '👁️ 已向玩家揭露真實屬性' : '🔒 已設為未鑑定狀態'}：${item.name}`,
		);
	};

	const adjustCharges = (item, delta) => {
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

	const consumeOrSplitStack = (item, action) => {
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

	const transferItemToCharacter = (item, targetCharId) => {
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

	const deleteItem = (item) => {
		setItems((prev) => prev.filter((i) => i.id !== item.id));
		showToast(`已銷毀物品：${item.name}`);
	};

	// ==========================================
	// 貨幣調整與自動換算
	// ==========================================
	const updateCurrency = (coinType, delta) => {
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
				let { pp, gp, ep, sp, cp } = char.currencies;
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
	const handleCreateHomebrewItem = (e) => {
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
										{activeCharacter.currencies[coin.key]}
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

					{/* BG3 6x6 背包網格主體 */}
					<div className='p-4 sm:p-5 grid grid-cols-6 gap-2.5 sm:gap-3 bg-[radial-gradient(circle_at_center,_rgba(28,25,23,0.8),_rgba(12,10,9,0.95))]'>
						{Array.from({ length: TOTAL_SLOTS }).map((_, slotIndex) => {
							const slotItem = characterItems.find((i) => i.slot === slotIndex);
							const isSelected = slotItem && inspectedItem?.id === slotItem.id;
							const isMoveSource = moveSourceSlot === slotIndex;

							// 判斷玩家視角下是否為「未鑑定」物品
							const isMaskedUnidentified =
								slotItem && !slotItem.isIdentified && viewMode === 'player';

							// 若未鑑定且在玩家視角，隱藏真實稀有度光框，改用神秘紫灰框
							const rarityStyle = slotItem
								? isMaskedUnidentified
									? RARITY_CONFIG.Common
									: RARITY_CONFIG[slotItem.rarity] || RARITY_CONFIG.Common
								: null;

							const matchesFilter = slotItem
								? isItemMatchingFilter(slotItem)
								: true;

							return (
								<div
									key={slotIndex}
									draggable={!!slotItem}
									onDragStart={() => setDraggedSlot(slotIndex)}
									onDragOver={(e) => e.preventDefault()}
									onDrop={() => {
										swapOrMoveSlot(draggedSlot, slotIndex);
										setDraggedSlot(null);
									}}
									onMouseEnter={() => {
										if (slotItem) setHoveredItemId(slotItem.id);
									}}
									onMouseLeave={() => setHoveredItemId(null)}
									onClick={() => {
										// 若處於移動換位模式
										if (moveSourceSlot !== null) {
											swapOrMoveSlot(moveSourceSlot, slotIndex);
											setMoveSourceSlot(null);
											return;
										}
										if (slotItem) {
											setSelectedItemId(slotItem.id);
										}
									}}
									onDoubleClick={() => {
										if (
											slotItem &&
											(slotItem.category === 'Weapon' ||
												slotItem.category === 'Armor')
										) {
											toggleEquip(slotItem);
										}
									}}
									className={`aspect-square rounded-md relative flex items-center justify-center transition-all duration-150 select-none ${
										slotItem
											? `bg-gradient-to-br ${rarityStyle.bg} border-2 ${rarityStyle.border} ${rarityStyle.glow} cursor-grab active:cursor-grabbing`
											: 'bg-[#100e0c] border border-stone-800/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)] hover:border-amber-900/60'
									} ${
										isSelected
											? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-stone-950 scale-[1.03] z-10'
											: ''
									} ${
										isMoveSource ? 'ring-2 ring-cyan-400 animate-pulse' : ''
									} ${!matchesFilter ? 'opacity-25 grayscale' : ''}`}
								>
									{/* 空格底紋裝飾 */}
									{!slotItem && (
										<div className='w-2 h-2 rotate-45 border border-stone-800/60 opacity-40' />
									)}

									{/* 格內物品內容 */}
									{slotItem && (
										<>
											{/* 左上角：已裝備標記 (BG3 風格金色護盾角標) */}
											{slotItem.equipped && (
												<div
													className='absolute top-1 left-1 px-1 py-0.5 rounded bg-amber-500 text-stone-950 text-[9px] font-extrabold leading-none shadow'
													title='已裝備'
												>
													裝備
												</div>
											)}

											{/* 右上角：同調寶石 / 未鑑定迷霧 / 自創標記 */}
											<div className='absolute top-1 right-1 flex items-center gap-0.5'>
												{!slotItem.isIdentified && (
													<span
														className='w-4 h-4 rounded-full bg-purple-950/90 border border-purple-400 text-purple-200 flex items-center justify-center text-[10px] font-bold shadow'
														title='未鑑定魔法物品'
													>
														?
													</span>
												)}
												{slotItem.attuned && (
													<span
														className='w-3.5 h-3.5 rounded-full bg-amber-950/90 border border-amber-400 text-amber-300 flex items-center justify-center shadow-[0_0_6px_#f59e0b]'
														title='已同調 (Attuned)'
													>
														<Sparkles className='w-2.5 h-2.5' />
													</span>
												)}
											</div>

											{/* 中央道具圖示 */}
											<div
												className={`${rarityStyle.text} drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]`}
											>
												{isMaskedUnidentified ? (
													<HelpCircle className='w-7 h-7 sm:w-8 sm:h-8 text-purple-400/80 animate-pulse' />
												) : (
													<ItemIcon
														iconName={slotItem.icon}
														className='w-7 h-7 sm:w-8 sm:h-8'
													/>
												)}
											</div>

											{/* 左下角：DM 自創 (Homebrew) 紫色微章 */}
											{slotItem.isHomebrew &&
												(viewMode === 'dm' || slotItem.isIdentified) && (
													<span
														className='absolute bottom-1 left-1 px-1 rounded bg-purple-950/90 border border-purple-500/60 text-[8px] text-purple-300 font-semibold'
														title='DM 自創道具 (Homebrew)'
													>
														自創
													</span>
												)}

											{/* 右下角：堆疊數量 */}
											{slotItem.quantity > 1 && (
												<span className='absolute bottom-0.5 right-1.5 text-xs font-mono font-bold text-stone-100 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]'>
													{slotItem.quantity}
												</span>
											)}
										</>
									)}
								</div>
							);
						})}
					</div>

					{/* 背包底部統計列 */}
					<div className='mt-auto px-4 py-3 bg-stone-950 border-t border-amber-900/40 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400'>
						<div className='flex items-center gap-4'>
							<span>
								已用格數：
								<strong className='text-stone-200'>
									{characterItems.length}
								</strong>{' '}
								/ {TOTAL_SLOTS}
							</span>
							<span>
								背包物品總估值：
								<strong className='text-amber-300'>
									{encumbranceStats.totalItemsValueGp} GP
								</strong>
							</span>
						</div>
						<div className='flex items-center gap-2 text-[11px]'>
							<span className='inline-block w-2 h-2 rounded-full bg-emerald-500' />{' '}
							非普通
							<span className='inline-block w-2 h-2 rounded-full bg-blue-500 ml-1' />{' '}
							稀有
							<span className='inline-block w-2 h-2 rounded-full bg-purple-500 ml-1' />{' '}
							極珍稀
							<span className='inline-block w-2 h-2 rounded-full bg-amber-400 ml-1' />{' '}
							傳奇
							<span className='inline-block w-2 h-2 rounded-full bg-red-500 ml-1' />{' '}
							神器
						</div>
					</div>
				</div>

				{/* ========================================== */}
				{/* 右側：博德之門3 風格物品懸停/檢視資訊卡 (Tooltip Card) */}
				{/* ========================================== */}
				<div className='lg:col-span-5'>
					{inspectedItem ? (
						(() => {
							const isMasked =
								!inspectedItem.isIdentified && viewMode === 'player';
							const rarity = isMasked
								? RARITY_CONFIG.Common
								: RARITY_CONFIG[inspectedItem.rarity] || RARITY_CONFIG.Common;
							const masteryInfo =
								WEAPON_MASTERIES[inspectedItem.mastery] ||
								WEAPON_MASTERIES.None;

							return (
								<div
									className={`rounded-lg border-2 ${rarity.border} bg-[#110f0d] shadow-[0_0_45px_rgba(0,0,0,0.95)] overflow-hidden transition-all duration-200 sticky top-5`}
								>
									{/* 卡片頂部：稀有度漸層標題區 */}
									<div
										className={`p-5 bg-gradient-to-b ${rarity.headerGradient} border-b border-amber-500/20 relative`}
									>
										<div className='flex items-start justify-between gap-4'>
											<div>
												{/* 稀有度與分類標籤 */}
												<div className='flex flex-wrap items-center gap-1.5 mb-1.5'>
													<span
														className={`text-[11px] font-bold px-2 py-0.5 rounded border ${rarity.badgeBg}`}
													>
														{isMasked ? '未知稀有度' : rarity.label}
													</span>
													<span className='text-xs text-stone-300'>
														{inspectedItem.subType}
													</span>
													{inspectedItem.isHomebrew &&
														(viewMode === 'dm' ||
															inspectedItem.isIdentified) && (
															<span className='text-[11px] px-2 py-0.5 rounded bg-purple-950/90 border border-purple-400/60 text-purple-200 font-medium'>
																✨ DM 自創道具
															</span>
														)}
													{!inspectedItem.isIdentified && (
														<span className='text-[11px] px-2 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 font-semibold'>
															{viewMode === 'dm'
																? '👁️ 玩家端目前未鑑定'
																: '❓ 未鑑定物品'}
														</span>
													)}
												</div>

												{/* 物品名稱 */}
												<h2
													className={`text-xl sm:text-2xl font-serif font-bold tracking-wide ${
														isMasked ? 'text-purple-300' : rarity.text
													}`}
												>
													{isMasked
														? '未知的魔法物品 (未鑑定)'
														: inspectedItem.name}
												</h2>
											</div>

											{/* 右上角大型道具圖示框 */}
											<div
												className={`w-14 h-14 rounded-lg bg-stone-950/80 border-2 ${rarity.border} flex items-center justify-center shrink-0 shadow-inner ${rarity.text}`}
											>
												{isMasked ? (
													<HelpCircle className='w-8 h-8 text-purple-400' />
												) : (
													<ItemIcon
														iconName={inspectedItem.icon}
														className='w-8 h-8'
													/>
												)}
											</div>
										</div>

										{/* 核心數值列 (傷害 / AC / 同調狀態) */}
										{!isMasked && (
											<div className='mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-4 text-sm'>
												{inspectedItem.damage && (
													<div className='flex items-center gap-1.5'>
														<Sword className='w-4 h-4 text-amber-400' />
														<span className='text-stone-300'>傷害/效果：</span>
														<strong className='text-amber-200 font-mono'>
															{inspectedItem.damage}
														</strong>
													</div>
												)}
												{inspectedItem.ac && (
													<div className='flex items-center gap-1.5'>
														<Shield className='w-4 h-4 text-amber-400' />
														<span className='text-stone-300'>
															護甲等級 (AC)：
														</span>
														<strong className='text-amber-200 font-mono'>
															{inspectedItem.ac}
														</strong>
													</div>
												)}
												{inspectedItem.requiresAttunement && (
													<div className='flex items-center gap-1 text-xs text-amber-300/90 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/40'>
														<Sparkles className='w-3.5 h-3.5' />
														<span>
															需同調 (
															{inspectedItem.attuned ? '已同調' : '未同調'})
														</span>
													</div>
												)}
											</div>
										)}
									</div>

									{/* 卡片中段：D&D 5R 規則細節、武器精通、充能與風味文字 */}
									<div className='p-5 space-y-4 text-sm'>
										{isMasked ? (
											<div className='p-4 rounded-md bg-purple-950/20 border border-purple-800/50 text-purple-200 space-y-2'>
												<div className='flex items-center gap-2 font-semibold'>
													<EyeOff className='w-4 h-4 text-purple-400' />
													<span>這件物品散發著晦澀難懂的奧術波動</span>
												</div>
												<p className='text-xs text-stone-400 leading-relaxed'>
													在完成《鑑定術
													(Identify)》或花費一次短休仔細研究之前，你無法得知它的真實名稱、魔法特性與潛在詛咒。請向你的
													DM 提出鑑定申請。
												</p>
											</div>
										) : (
											<>
												{/* 魔法特性與規則說明 */}
												<div className='space-y-1.5'>
													<div className='text-xs font-semibold uppercase tracking-wider text-amber-500/90'>
														物品特性與規則效果
													</div>
													<div className='text-stone-200 whitespace-pre-line leading-relaxed bg-stone-900/60 p-3 rounded border border-stone-800 text-xs sm:text-sm'>
														{inspectedItem.effects}
													</div>
												</div>

												{/* D&D 5R 武器精通專區 (Weapon Mastery) */}
												{inspectedItem.mastery &&
													inspectedItem.mastery !== 'None' && (
														<div className='p-3 rounded-md bg-gradient-to-r from-amber-950/50 to-stone-900/80 border border-amber-700/50'>
															<div className='flex items-center gap-2 text-amber-300 font-serif font-bold text-xs sm:text-sm mb-1'>
																<Star className='w-4 h-4 fill-amber-400 text-amber-400' />
																<span>5R 武器精通：{masteryInfo.name}</span>
															</div>
															<p className='text-xs text-stone-300 leading-relaxed'>
																{masteryInfo.desc}
															</p>
														</div>
													)}

												{/* 充能次數管理 (Charges) */}
												{inspectedItem.maxCharges > 0 && (
													<div className='flex items-center justify-between p-2.5 rounded bg-stone-900/90 border border-stone-800'>
														<div className='flex items-center gap-2'>
															<Zap className='w-4 h-4 text-cyan-400' />
															<span className='text-xs text-stone-300'>
																魔法充能 ({inspectedItem.charges} /{' '}
																{inspectedItem.maxCharges})
															</span>
														</div>
														<div className='flex items-center gap-1.5'>
															{Array.from({
																length: inspectedItem.maxCharges,
															}).map((_, idx) => (
																<span
																	key={idx}
																	className={`w-3 h-3 rounded-full border ${
																		idx < inspectedItem.charges
																			? 'bg-cyan-400 border-cyan-200 shadow-[0_0_8px_#22d3ee]'
																			: 'bg-stone-950 border-stone-700'
																	}`}
																/>
															))}
															<button
																onClick={() => adjustCharges(inspectedItem, -1)}
																className='ml-2 px-2 py-0.5 text-xs rounded bg-stone-800 hover:bg-stone-700 text-stone-200 cursor-pointer'
																title='消耗 1 發充能'
															>
																-1
															</button>
															<button
																onClick={() => adjustCharges(inspectedItem, 1)}
																className='px-2 py-0.5 text-xs rounded bg-stone-800 hover:bg-stone-700 text-stone-200 cursor-pointer'
																title='恢復 1 發充能'
															>
																+1
															</button>
														</div>
													</div>
												)}
											</>
										)}

										{/* DM 專屬隱藏筆記與詛咒觸發條件 (僅在 DM 視角顯示) */}
										{viewMode === 'dm' && inspectedItem.dmNotes && (
											<div className='p-3 rounded-md bg-red-950/35 border border-red-500/50 space-y-1'>
												<div className='flex items-center gap-1.5 text-xs font-bold text-red-400'>
													<ShieldAlert className='w-4 h-4' />
													<span>DM 隱藏筆記 / 暗線詛咒 (玩家不可見)</span>
												</div>
												<p className='text-xs text-red-200/90 leading-relaxed'>
													{inspectedItem.dmNotes}
												</p>
											</div>
										)}

										{/* BG3 古典斜體風味引言 */}
										<blockquote className='italic text-xs text-stone-400 border-l-2 border-amber-700/60 pl-3 py-0.5 font-serif'>
											{inspectedItem.flavor}
										</blockquote>

										{/* 底部重量與價值 */}
										<div className='pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400 font-mono'>
											<span>
												單件重量：
												<strong className='text-stone-200'>
													{inspectedItem.weight} lb
												</strong>
												{inspectedItem.quantity > 1 &&
													` (總重 ${(inspectedItem.weight * inspectedItem.quantity).toFixed(1)} lb)`}
											</span>
											<span>
												價值：
												<strong className='text-amber-300'>
													{isMasked ? '??? GP' : `${inspectedItem.valueGp} GP`}
												</strong>
											</span>
										</div>

										{/* 互動操作按鈕列 */}
										<div className='pt-3 border-t border-stone-800 space-y-2.5'>
											<div className='flex flex-wrap gap-2'>
												{/* 裝備/卸下 */}
												{(inspectedItem.category === 'Weapon' ||
													inspectedItem.category === 'Armor') && (
													<button
														onClick={() => toggleEquip(inspectedItem)}
														className={`flex-1 py-2 px-3 rounded text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
															inspectedItem.equipped
																? 'bg-stone-800 border-stone-600 text-stone-200 hover:bg-stone-700'
																: 'bg-gradient-to-b from-amber-600 to-amber-800 border-amber-400 text-amber-50 hover:brightness-110'
														}`}
													>
														<Sword className='w-3.5 h-3.5' />
														<span>
															{inspectedItem.equipped
																? '卸下裝備'
																: '裝備此物品'}
														</span>
													</button>
												)}

												{/* 同調/解除同調 */}
												{inspectedItem.requiresAttunement && (
													<button
														onClick={() => toggleAttune(inspectedItem)}
														className={`flex-1 py-2 px-3 rounded text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
															inspectedItem.attuned
																? 'bg-amber-950/90 border-amber-500 text-amber-300'
																: 'bg-stone-900 border-amber-700/60 text-amber-200 hover:bg-amber-950/50'
														}`}
													>
														<Sparkles className='w-3.5 h-3.5' />
														<span>
															{inspectedItem.attuned ? '解除同調' : '進行同調'}
														</span>
													</button>
												)}

												{/* 消耗品：飲用/使用 與 拆分堆疊 */}
												{inspectedItem.category === 'Consumable' && (
													<button
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'consume')
														}
														className='flex-1 py-2 px-3 rounded text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 border border-emerald-400 text-emerald-50 transition cursor-pointer'
													>
														🧪 使用 / 消耗 1 個
													</button>
												)}
												{inspectedItem.quantity > 1 && (
													<button
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'split')
														}
														className='py-2 px-3 rounded text-xs font-medium bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-200 transition cursor-pointer'
													>
														拆分堆疊
													</button>
												)}

												{/* 點擊換位按鈕 (方便手機/平板操作) */}
												<button
													onClick={() => {
														setMoveSourceSlot(
															moveSourceSlot === inspectedItem.slot
																? null
																: inspectedItem.slot,
														);
													}}
													className={`py-2 px-3 rounded text-xs font-medium border transition cursor-pointer flex items-center gap-1 ${
														moveSourceSlot === inspectedItem.slot
															? 'bg-cyan-900 border-cyan-400 text-cyan-100'
															: 'bg-stone-900 border-stone-700 text-stone-300 hover:border-stone-500'
													}`}
												>
													<Move className='w-3.5 h-3.5' />
													<span>
														{moveSourceSlot === inspectedItem.slot
															? '取消移動'
															: '移動格位'}
													</span>
												</button>
											</div>

											{/* 移交給其他隊友或營地儲物箱 */}
											<div className='flex items-center justify-between gap-2 bg-stone-900/80 p-2 rounded border border-stone-800'>
												<span className='text-xs text-stone-400'>
													📦 移交給隊友：
												</span>
												<div className='flex items-center gap-1.5'>
													{characters
														.filter((c) => c.id !== activeCharId)
														.map((targetChar) => (
															<button
																key={targetChar.id}
																onClick={() =>
																	transferItemToCharacter(
																		inspectedItem,
																		targetChar.id,
																	)
																}
																className='px-2 py-1 rounded bg-stone-800 hover:bg-amber-900/60 border border-stone-700 hover:border-amber-500/60 text-[11px] text-stone-200 transition cursor-pointer'
																title={`發送至 ${targetChar.name}`}
															>
																{targetChar.avatar}{' '}
																{targetChar.name.split(' ')[0]}
															</button>
														))}
												</div>
											</div>

											{/* DM 專用控制列：一鍵切換鑑定狀態 & 刪除 */}
											{viewMode === 'dm' && (
												<div className='flex items-center justify-between gap-2 pt-2 border-t border-red-950/60'>
													<button
														onClick={() => toggleIdentify(inspectedItem)}
														className='flex-1 py-1.5 px-3 rounded text-xs font-medium bg-purple-950/80 hover:bg-purple-900 border border-purple-500/60 text-purple-200 flex items-center justify-center gap-1.5 transition cursor-pointer'
													>
														{inspectedItem.isIdentified ? (
															<>
																<EyeOff className='w-3.5 h-3.5' />
																<span>設為未鑑定 (對玩家隱藏)</span>
															</>
														) : (
															<>
																<Eye className='w-3.5 h-3.5' />
																<span>完成鑑定 (向玩家公開屬性)</span>
															</>
														)}
													</button>
													<button
														onClick={() => deleteItem(inspectedItem)}
														className='p-1.5 rounded bg-red-950/60 hover:bg-red-900 border border-red-700/60 text-red-300 transition cursor-pointer'
														title='銷毀此物品'
													>
														<Trash2 className='w-4 h-4' />
													</button>
												</div>
											)}
										</div>
									</div>
								</div>
							);
						})()
					) : (
						<div className='h-64 rounded-lg border border-stone-800 bg-stone-950/60 flex flex-col items-center justify-center text-stone-500 p-6 text-center'>
							<Backpack className='w-10 h-10 mb-2 opacity-40' />
							<p className='text-sm'>
								將游標懸停或點擊左側網格中的道具，即可檢視《博德之門3》風格詳細資訊卡。
							</p>
						</div>
					)}
				</div>
			</main>

			{/* ========================================== */}
			{/* 彈窗 1：DM 自創道具鍛造工坊 (Homebrew Creator Modal) */}
			{/* ========================================== */}
			{isHomebrewModalOpen && (
				<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
					<div className='bg-[#141210] border-2 border-purple-500/70 rounded-lg max-w-xl w-full p-6 shadow-[0_0_50px_rgba(168,85,247,0.3)] my-8'>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
							<div className='flex items-center gap-2'>
								<Sparkles className='w-5 h-5 text-purple-400' />
								<h3 className='text-lg font-serif font-bold text-purple-200'>
									DM 自創道具鍛造工坊 (Homebrew Forge)
								</h3>
							</div>
							<button
								onClick={() => setIsHomebrewModalOpen(false)}
								className='text-stone-400 hover:text-stone-200 text-sm cursor-pointer'
							>
								✕ 關閉
							</button>
						</div>

						<form
							onSubmit={handleCreateHomebrewItem}
							className='space-y-3.5 text-xs sm:text-sm'
						>
							<div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
								<div>
									<label className='block text-stone-400 mb-1'>
										道具名稱 *
									</label>
									<input
										type='text'
										required
										placeholder='例如：深淵凝視長弓'
										value={newItemForm.name}
										onChange={(e) =>
											setNewItemForm({ ...newItemForm, name: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none focus:border-purple-400'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>
										稀有度 (決定發光邊框)
									</label>
									<select
										value={newItemForm.rarity}
										onChange={(e) =>
											setNewItemForm({ ...newItemForm, rarity: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none focus:border-purple-400'
									>
										<option value='Common'>普通 (Common - 灰框)</option>
										<option value='Uncommon'>非普通 (Uncommon - 綠光)</option>
										<option value='Rare'>稀有 (Rare - 藍光)</option>
										<option value='VeryRare'>極珍稀 (Very Rare - 紫光)</option>
										<option value='Legendary'>傳奇 (Legendary - 金光)</option>
										<option value='Artifact'>神器 (Artifact - 橘紅光)</option>
									</select>
								</div>
							</div>

							<div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
								<div>
									<label className='block text-stone-400 mb-1'>分類</label>
									<select
										value={newItemForm.category}
										onChange={(e) =>
											setNewItemForm({
												...newItemForm,
												category: e.target.value,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									>
										<option value='Weapon'>武器 (Weapon)</option>
										<option value='Armor'>護甲 (Armor)</option>
										<option value='Consumable'>消耗品 (Consumable)</option>
										<option value='Misc'>奇物/神器 (Misc)</option>
									</select>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>
										子類型描述
									</label>
									<input
										type='text'
										value={newItemForm.subType}
										onChange={(e) =>
											setNewItemForm({
												...newItemForm,
												subType: e.target.value,
											})
										}
										placeholder='如：長劍 (雙用)'
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>圖示樣式</label>
									<select
										value={newItemForm.icon}
										onChange={(e) =>
											setNewItemForm({ ...newItemForm, icon: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									>
										<option value='Sword'>⚔️ 刀劍 (Sword)</option>
										<option value='Hammer'>🔨 戰錘 (Hammer)</option>
										<option value='Shield'>🛡️ 護盾/重甲 (Shield)</option>
										<option value='Wand2'>🪄 魔杖/法杖 (Wand)</option>
										<option value='FlaskConical'>🧪 藥水 (Potion)</option>
										<option value='Scroll'>📜 卷軸 (Scroll)</option>
										<option value='Gem'>💎 寶石/稜鏡 (Gem)</option>
										<option value='Flame'>🔥 聖火遺物 (Flame)</option>
										<option value='Crown'>👑 頭冠/飾品 (Crown)</option>
									</select>
								</div>
							</div>

							{/* 若為武器，顯示傷害與 5R 武器精通 */}
							{newItemForm.category === 'Weapon' && (
								<div className='grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded bg-stone-900/70 border border-stone-800'>
									<div>
										<label className='block text-amber-300 mb-1'>
											武器傷害骰與屬性
										</label>
										<input
											type='text'
											value={newItemForm.damage}
											onChange={(e) =>
												setNewItemForm({
													...newItemForm,
													damage: e.target.value,
												})
											}
											placeholder='1d8+2 揮砍 + 1d6 火焰'
											className='w-full bg-stone-950 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
										/>
									</div>
									<div>
										<label className='block text-amber-300 mb-1'>
											5R 武器精通 (Weapon Mastery)
										</label>
										<select
											value={newItemForm.mastery}
											onChange={(e) =>
												setNewItemForm({
													...newItemForm,
													mastery: e.target.value,
												})
											}
											className='w-full bg-stone-950 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
										>
											{Object.entries(WEAPON_MASTERIES).map(([key, val]) => (
												<option key={key} value={key}>
													{val.name}
												</option>
											))}
										</select>
									</div>
								</div>
							)}

							{/* 重量、價值、充能次數 */}
							<div className='grid grid-cols-3 gap-3'>
								<div>
									<label className='block text-stone-400 mb-1'>
										重量 (lbs)
									</label>
									<input
										type='number'
										step='0.1'
										value={newItemForm.weight}
										onChange={(e) =>
											setNewItemForm({ ...newItemForm, weight: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>價值 (GP)</label>
									<input
										type='number'
										value={newItemForm.valueGp}
										onChange={(e) =>
											setNewItemForm({
												...newItemForm,
												valueGp: e.target.value,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>
										每日充能上限
									</label>
									<input
										type='number'
										min='0'
										max='10'
										value={newItemForm.maxCharges}
										onChange={(e) =>
											setNewItemForm({
												...newItemForm,
												maxCharges: e.target.value,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
							</div>

							<div>
								<label className='block text-stone-400 mb-1'>
									規則效果描述 (玩家鑑定後可見)
								</label>
								<textarea
									rows={2}
									value={newItemForm.effects}
									onChange={(e) =>
										setNewItemForm({ ...newItemForm, effects: e.target.value })
									}
									placeholder='描述此道具的加值、主動技能或被動光環...'
									className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
								/>
							</div>

							<div>
								<label className='block text-red-400 mb-1'>
									🔒 DM 隱藏筆記 / 詛咒觸發條件 (僅在 DM 視角顯示)
								</label>
								<textarea
									rows={2}
									value={newItemForm.dmNotes}
									onChange={(e) =>
										setNewItemForm({ ...newItemForm, dmNotes: e.target.value })
									}
									placeholder='例如：每次使用技能須擲 DC15 感知豁免，失敗則受到精神控制...'
									className='w-full bg-red-950/20 border border-red-800/60 rounded px-3 py-1.5 text-red-100'
								/>
							</div>

							<div className='flex flex-wrap items-center gap-6 pt-1'>
								<label className='flex items-center gap-2 cursor-pointer'>
									<input
										type='checkbox'
										checked={newItemForm.requiresAttunement}
										onChange={(e) =>
											setNewItemForm({
												...newItemForm,
												requiresAttunement: e.target.checked,
											})
										}
										className='accent-amber-500'
									/>
									<span>需要同調 (Requires Attunement)</span>
								</label>

								<label className='flex items-center gap-2 cursor-pointer text-purple-300'>
									<input
										type='checkbox'
										checked={!newItemForm.isIdentified}
										onChange={(e) =>
											setNewItemForm({
												...newItemForm,
												isIdentified: !e.target.checked,
											})
										}
										className='accent-purple-500'
									/>
									<span>發放時設為「未鑑定」狀態 (隱藏真實效果)</span>
								</label>
							</div>

							<div className='pt-3 border-t border-stone-800 flex justify-end gap-3'>
								<button
									type='button'
									onClick={() => setIsHomebrewModalOpen(false)}
									className='px-4 py-2 rounded bg-stone-800 text-stone-300 hover:bg-stone-700 cursor-pointer'
								>
									取消
								</button>
								<button
									type='submit'
									className='px-5 py-2 rounded bg-gradient-to-r from-purple-700 to-amber-700 hover:brightness-110 text-white font-semibold shadow-lg cursor-pointer'
								>
									✨ 鍛造並發放給 {activeCharacter.name}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* ========================================== */}
			{/* 彈窗 2：角色錢包與五種貨幣管理 (Currency Modal) */}
			{/* ========================================== */}
			{isCoinModalOpen && (
				<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4'>
					<div className='bg-[#141210] border-2 border-amber-500/70 rounded-lg max-w-md w-full p-6 shadow-2xl'>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
							<div className='flex items-center gap-2'>
								<Coins className='w-5 h-5 text-amber-400' />
								<h3 className='text-lg font-serif font-bold text-amber-200'>
									{activeCharacter.name} 的錢包管理
								</h3>
							</div>
							<button
								onClick={() => setIsCoinModalOpen(false)}
								className='text-stone-400 hover:text-stone-200 text-sm cursor-pointer'
							>
								✕ 關閉
							</button>
						</div>

						<div className='space-y-3'>
							{[
								{
									key: 'pp',
									name: '鉑幣 (PP)',
									rate: '1 PP = 10 GP',
									color: 'text-slate-200',
								},
								{
									key: 'gp',
									name: '金幣 (GP)',
									rate: '標準通用貨幣',
									color: 'text-amber-300',
								},
								{
									key: 'ep',
									name: '電金幣 (EP)',
									rate: '2 EP = 1 GP',
									color: 'text-cyan-300',
								},
								{
									key: 'sp',
									name: '銀幣 (SP)',
									rate: '10 SP = 1 GP',
									color: 'text-stone-300',
								},
								{
									key: 'cp',
									name: '銅幣 (CP)',
									rate: '100 CP = 1 GP',
									color: 'text-orange-400',
								},
							].map((coin) => (
								<div
									key={coin.key}
									className='flex items-center justify-between p-2.5 rounded bg-stone-900 border border-stone-800'
								>
									<div>
										<div className={`font-bold text-sm ${coin.color}`}>
											{coin.name}
										</div>
										<div className='text-[11px] text-stone-500'>
											{coin.rate}
										</div>
									</div>
									<div className='flex items-center gap-1.5'>
										<button
											onClick={() => updateCurrency(coin.key, -10)}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-red-950 text-xs text-stone-300 cursor-pointer'
										>
											-10
										</button>
										<button
											onClick={() => updateCurrency(coin.key, -1)}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-red-950 text-xs text-stone-300 cursor-pointer'
										>
											-1
										</button>
										<span className='w-16 text-center font-mono font-bold text-sm text-stone-100'>
											{activeCharacter.currencies[coin.key]}
										</span>
										<button
											onClick={() => updateCurrency(coin.key, 1)}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-emerald-950 text-xs text-stone-300 cursor-pointer'
										>
											+1
										</button>
										<button
											onClick={() => updateCurrency(coin.key, 10)}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-emerald-950 text-xs text-stone-300 cursor-pointer'
										>
											+10
										</button>
									</div>
								</div>
							))}
						</div>

						<div className='mt-5 pt-3 border-t border-stone-800 flex items-center justify-between gap-2'>
							<button
								onClick={consolidateCoinsToGold}
								className='flex items-center gap-1.5 px-3 py-2 rounded bg-amber-950 hover:bg-amber-900 border border-amber-600/60 text-amber-200 text-xs font-medium cursor-pointer'
							>
								<RefreshCw className='w-3.5 h-3.5' />
								<span>一鍵將零錢換成金幣 (減輕硬幣重量)</span>
							</button>
							<button
								onClick={() => setIsCoinModalOpen(false)}
								className='px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs cursor-pointer'
							>
								完成
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
