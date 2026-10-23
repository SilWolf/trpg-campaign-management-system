import {
	useState,
	type Dispatch,
	type FormEvent,
	type SetStateAction,
} from 'react';
import {
	CAMP_CHEST_ID,
	canStackItems,
	resolveItemFlags,
	type Character,
	type CurrencyType,
	type HomebrewForm,
	type InventoryItem,
	type ItemAffix,
	type Rarity,
} from '@/types';
import { getItemImageUrl, ITEM_IMAGE_ICON_PREFIX } from '@/lib/itemIcon';

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

interface UseInventoryActionsProps {
	characters: Character[];
	setCharacters: Dispatch<SetStateAction<Character[]>>;
	campChestCurrency: Record<CurrencyType, number>;
	setCampChestCurrency: Dispatch<SetStateAction<Record<CurrencyType, number>>>;
	items: InventoryItem[];
	setItems: Dispatch<SetStateAction<InventoryItem[]>>;
	activeCharId: string;
	setActiveCharId: Dispatch<SetStateAction<string>>;
	viewerCharId: string;
	setViewerCharId: Dispatch<SetStateAction<string>>;
	activeCharacter: Character;
	attunedCount: number;
	currentBagTab: 'public' | 'private';
	setBagTab: Dispatch<SetStateAction<'public' | 'private'>>;
	setSelectedItemId: Dispatch<SetStateAction<string>>;
	showToast: (message: string) => void;
}

export function useInventoryActions({
	characters,
	setCharacters,
	campChestCurrency,
	setCampChestCurrency,
	items,
	setItems,
	activeCharId,
	setActiveCharId,
	viewerCharId,
	setViewerCharId,
	activeCharacter,
	attunedCount,
	currentBagTab,
	setBagTab,
	setSelectedItemId,
	showToast,
}: UseInventoryActionsProps) {
	void items;
	const [copiedAffix, setCopiedAffix] = useState<ItemAffix | null>(null);
	const [isHomebrewModalOpen, setIsHomebrewModalOpen] = useState(false);
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [newItemForm, setNewItemForm] = useState<HomebrewForm>(DEFAULT_FORM);

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
		const transferredBase: InventoryItem = {
			...item,
			ownerId: targetCharId,
			quantity: qty,
			equipped: false,
			attuned: false,
			isPrivate: false,
		};

		setItems((prev) => {
			const existingMatch = prev.find(
				(i) =>
					i.ownerId === targetCharId &&
					i.id !== item.id &&
					canStackItems(i, transferredBase),
			);

			if (existingMatch) {
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
			}

			if (!isPartial) {
				return prev.map((i) => (i.id === item.id ? transferredBase : i));
			}
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
		});

		showToast(
			`📦 已將 ${qty} 個「${item.name}」移交至 ${targetCharName}（同名同詞條自動堆疊）`,
		);
	};

	const deleteItem = (item: InventoryItem) => {
		setItems((prev) => prev.filter((i) => i.id !== item.id));
		showToast(`已銷毀物品：${item.name}`);
	};

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
					return b.valueGp * b.quantity - a.valueGp * a.quantity;
				},
			);
			return [...others, ...charOnes];
		});

		showToast(
			`已依${sortBy === 'rarity' ? '稀有度' : sortBy === 'weight' ? '重量' : '價值'}重新排序各分類物品`,
		);
	};

	const handleConsolidateStacks = () => {
		setItems((prev) => {
			const others = prev.filter((i) => i.ownerId !== activeCharId);
			const currentOwnerItems = prev.filter((i) => i.ownerId === activeCharId);
			const consolidated: InventoryItem[] = [];

			currentOwnerItems.forEach((item) => {
				const existing = consolidated.find((target) =>
					canStackItems(target, item),
				);
				if (existing) existing.quantity += item.quantity;
				else consolidated.push({ ...item });
			});

			return [...others, ...consolidated];
		});
		showToast('📦 已成功將背包內所有同名同詞條的物品自動合併疊加！');
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

	const updateCurrency = (
		coinType: CurrencyType,
		delta: number,
		walletType: 'public' | 'private' = 'public',
	) => {
		if (activeCharId === CAMP_CHEST_ID) {
			setCampChestCurrency((wallet) => ({
				...wallet,
				[coinType]: Math.max(0, (wallet[coinType] ?? 0) + delta),
			}));
			return;
		}

		setCharacters((prev) =>
			prev.map((char) => {
				if (char.id !== activeCharId) return char;
				const field =
					walletType === 'private' ? 'privateCurrencies' : 'currencies';
				const currentWallet = char[field] || {
					pp: 0,
					gp: 0,
					ep: 0,
					sp: 0,
					cp: 0,
				};
				const nextVal = Math.max(0, (currentWallet[coinType] ?? 0) + delta);
				return {
					...char,
					[field]: { ...currentWallet, [coinType]: nextVal },
				};
			}),
		);
	};

	const consolidateCoinsToGold = (
		walletType: 'public' | 'private' = 'public',
	) => {
		const convertWallet = (wallet: Record<CurrencyType, number>) => {
			const pp = wallet.pp;
			let { gp, ep, sp, cp } = wallet;
			sp += Math.floor(cp / 10);
			cp = cp % 10;
			gp += Math.floor(sp / 10) + Math.floor(ep / 2);
			sp = sp % 10;
			ep = ep % 2;
			return { ...wallet, pp, gp, ep, sp, cp };
		};
		if (activeCharId === CAMP_CHEST_ID) {
			setCampChestCurrency(convertWallet(campChestCurrency));
		} else {
			setCharacters((prev) =>
				prev.map((char) => {
					if (char.id !== activeCharId) return char;
					const field =
						walletType === 'private' ? 'privateCurrencies' : 'currencies';
					const wallet = char[field] || {
						pp: 0,
						gp: 0,
						ep: 0,
						sp: 0,
						cp: 0,
					};
					return { ...char, [field]: convertWallet(wallet) };
				}),
			);
		}
		showToast('🪙 已自動將銅幣、銀幣與電金幣換算為金幣 (GP)！');
	};

	const transferBetweenOwnWallets = (
		fromWallet: 'public' | 'private',
		coinType: CurrencyType,
		amount: number,
	) => {
		if (activeCharId === CAMP_CHEST_ID || amount <= 0) return;
		const fromField =
			fromWallet === 'private' ? 'privateCurrencies' : 'currencies';
		const toField =
			fromWallet === 'private' ? 'currencies' : 'privateCurrencies';
		const available = activeCharacter[fromField]?.[coinType] ?? 0;
		const actualAmount = Math.min(available, amount);

		if (actualAmount <= 0) {
			showToast('⚠️ 該幣種餘額不足，無法轉移！');
			return;
		}

		setCharacters((prev) =>
			prev.map((char) => {
				if (char.id !== activeCharId) return char;
				const src = char[fromField] || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
				const dst = char[toField] || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
				return {
					...char,
					[fromField]: {
						...src,
						[coinType]: (src[coinType] ?? 0) - actualAmount,
					},
					[toField]: {
						...dst,
						[coinType]: (dst[coinType] ?? 0) + actualAmount,
					},
				};
			}),
		);

		showToast(
			fromWallet === 'public'
				? `🔒 已將 ${actualAmount} ${coinType.toUpperCase()} 藏入私人錢包！`
				: `🌐 已將 ${actualAmount} ${coinType.toUpperCase()} 移回公開錢包！`,
		);
	};

	const transferCurrency = (
		targetCharId: string,
		coinType: CurrencyType,
		amount: number,
		fromWallet: 'public' | 'private' = 'public',
	) => {
		if (targetCharId === activeCharId || amount <= 0) return;
		const fromField =
			fromWallet === 'private' && activeCharId !== CAMP_CHEST_ID
				? 'privateCurrencies'
				: 'currencies';
		const sourceWallet =
			activeCharId === CAMP_CHEST_ID
				? campChestCurrency
				: activeCharacter[fromField];
		const available = sourceWallet?.[coinType] ?? 0;
		const actualAmount = Math.min(available, amount);

		if (actualAmount <= 0) {
			showToast('⚠️ 該幣種餘額不足，無法轉出！');
			return;
		}

		const targetName =
			targetCharId === CAMP_CHEST_ID
				? '🏕️ 營地儲物箱'
				: characters.find((c) => c.id === targetCharId)?.name;

		if (activeCharId === CAMP_CHEST_ID) {
			setCampChestCurrency((wallet) => ({
				...wallet,
				[coinType]: Math.max(0, wallet[coinType] - actualAmount),
			}));
			setCharacters((prev) =>
				prev.map((char) =>
					char.id === targetCharId
						? {
								...char,
								currencies: {
									...char.currencies,
									[coinType]: (char.currencies[coinType] ?? 0) + actualAmount,
								},
							}
						: char,
				),
			);
		} else if (targetCharId === CAMP_CHEST_ID) {
			setCharacters((prev) =>
				prev.map((char) => {
					if (char.id !== activeCharId) return char;
					const source = char[fromField] || {
						pp: 0,
						gp: 0,
						ep: 0,
						sp: 0,
						cp: 0,
					};
					return {
						...char,
						[fromField]: {
							...source,
							[coinType]: Math.max(0, source[coinType] - actualAmount),
						},
					};
				}),
			);
			setCampChestCurrency((wallet) => ({
				...wallet,
				[coinType]: wallet[coinType] + actualAmount,
			}));
		} else {
			setCharacters((prev) =>
				prev.map((char) => {
					if (char.id === activeCharId) {
						const source = char[fromField] || {
							pp: 0,
							gp: 0,
							ep: 0,
							sp: 0,
							cp: 0,
						};
						return {
							...char,
							[fromField]: {
								...source,
								[coinType]: Math.max(0, source[coinType] - actualAmount),
							},
						};
					}
					if (char.id === targetCharId) {
						return {
							...char,
							currencies: {
								...char.currencies,
								[coinType]: (char.currencies[coinType] ?? 0) + actualAmount,
							},
						};
					}
					return char;
				}),
			);
		}

		showToast(
			`🪙 已將 ${actualAmount} ${coinType.toUpperCase()} 轉入 ${targetName} 的公開錢包！`,
		);
	};

	const splitCampCoinToParty = (coinType: CurrencyType) => {
		if (activeCharId !== CAMP_CHEST_ID) return;
		const partyMembers = characters.filter(
			(character) => character.id !== CAMP_CHEST_ID,
		);
		if (partyMembers.length === 0) return;

		const total = campChestCurrency[coinType];
		const eachShare = Math.floor(total / partyMembers.length);
		const remainder = total % partyMembers.length;

		if (eachShare <= 0) {
			showToast(
				`⚠️ 公庫的 ${coinType.toUpperCase()} 不足平分給 ${partyMembers.length} 名隊員！`,
			);
			return;
		}

		setCampChestCurrency((wallet) => ({ ...wallet, [coinType]: remainder }));
		setCharacters((prev) =>
			prev.map((char) => {
				if (char.id === CAMP_CHEST_ID) return char;
				return {
					...char,
					currencies: {
						...char.currencies,
						[coinType]: char.currencies[coinType] + eachShare,
					},
				};
			}),
		);

		showToast(
			`🎉 已將公庫 ${coinType.toUpperCase()} 平分給全隊，每人獲得 ${eachShare} ${coinType.toUpperCase()}（餘 ${remainder} 留存公庫）！`,
		);
	};

	const handleSaveCharacter = (charData: Character) => {
		setCharacters((prev) => {
			const exists = prev.some((c) => c.id === charData.id);
			return exists
				? prev.map((c) => (c.id === charData.id ? charData : c))
				: [...prev, charData];
		});
		setActiveCharId(charData.id);
		showToast(`✨ 角色「${charData.name}」資料已更新！`);
	};

	const handleDeleteCharacter = (charId: string) => {
		if (charId === CAMP_CHEST_ID) return;
		const realCharacters = characters.filter(
			(character) => character.id !== CAMP_CHEST_ID,
		);
		if (realCharacters.length <= 1) {
			showToast('⚠️ 戰役中至少需保留一名冒險者角色！');
			return;
		}
		const targetChar = characters.find((c) => c.id === charId);
		if (!targetChar) return;

		const publicWallet = targetChar.currencies;
		const privateWallet = targetChar.privateCurrencies;
		setCampChestCurrency((wallet) => ({
			pp: wallet.pp + publicWallet.pp + privateWallet.pp,
			gp: wallet.gp + publicWallet.gp + privateWallet.gp,
			ep: wallet.ep + publicWallet.ep + privateWallet.ep,
			sp: wallet.sp + publicWallet.sp + privateWallet.sp,
			cp: wallet.cp + publicWallet.cp + privateWallet.cp,
		}));
		setCharacters((prev) => prev.filter((character) => character.id !== charId));

		setItems((prev) => {
			const others = prev.filter(
				(i) => i.ownerId !== charId && i.ownerId !== CAMP_CHEST_ID,
			);
			const campItems = prev
				.filter((i) => i.ownerId === CAMP_CHEST_ID)
				.map((i) => ({ ...i }));
			const charItems = prev.filter((i) => i.ownerId === charId);

			charItems.forEach((item) => {
				const movedItem: InventoryItem = {
					...item,
					ownerId: CAMP_CHEST_ID,
					equipped: false,
					attuned: false,
					isPrivate: false,
				};
				const existing = campItems.find((target) =>
					canStackItems(target, movedItem),
				);
				if (existing) existing.quantity += movedItem.quantity;
				else campItems.push(movedItem);
			});

			return [...others, ...campItems];
		});

		const nextCharId =
			realCharacters.find((character) => character.id !== charId)?.id ||
			CAMP_CHEST_ID;
		if (activeCharId === charId) setActiveCharId(nextCharId);
		if (viewerCharId === charId) setViewerCharId(nextCharId);
		showToast(
			`🏕️ 已移除角色「${targetChar.name}」，其所有裝備與公開/私人錢包已全數移入營地儲物箱！`,
		);
	};

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
		if (
			newItemForm.icon.startsWith(ITEM_IMAGE_ICON_PREFIX) &&
			!getItemImageUrl(newItemForm.icon)
		) {
			showToast('圖片網址必須使用 HTTPS。');
			return;
		}

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

	return {
		toggleEquip,
		toggleAttune,
		toggleIdentify,
		updatePlayerNotes,
		togglePrivateItem,
		adjustCharges,
		consumeOrSplitStack,
		transferItemToCharacter,
		deleteItem,
		handleAutoSort,
		handleConsolidateStacks,
		copiedAffix,
		updateItemAffixes,
		handleCopyAffix,
		handlePasteAffixToItem,
		updateCurrency,
		consolidateCoinsToGold,
		transferBetweenOwnWallets,
		transferCurrency,
		splitCampCoinToParty,
		handleSaveCharacter,
		handleDeleteCharacter,
		isHomebrewModalOpen,
		setIsHomebrewModalOpen,
		editingItemId,
		setEditingItemId,
		newItemForm,
		setNewItemForm,
		openCreateHomebrewModal,
		openEditItemModal,
		handleSaveHomebrewOrEditItem,
	};
}
