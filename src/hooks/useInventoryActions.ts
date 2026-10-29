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
	type AllItem,
	type HomebrewForm,
	type InventoryItem,
	type ItemAffix,
	type ItemBaseRarity,
} from '@/types';
import type { ToastKind } from '@/components/ui/ToastViewport';
import { getItemImageUrl, ITEM_IMAGE_ICON_PREFIX } from '@/lib/itemIcon';
import { identifyInventoryItem } from '@/lib/campaignShops';
import { deleteCampaignCharacter } from '@/lib/campaignCharacterDeletion';
import {
	legacyWalletFromGpCents,
	legacyWalletToGpCents,
} from '@/lib/supabase';
import {
	splitInventoryStack,
	transferInventoryStack,
} from '@/lib/inventoryTransactions';

const DEFAULT_FORM: HomebrewForm = {
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
	affixes: [],
};

const MAX_GP_CENTS = 100_000_000;

function gpToCents(gp: number): number {
	const cents = Math.round(gp * 100);
	if (
		!Number.isFinite(gp) ||
		gp < 0 ||
		Math.abs(gp * 100 - cents) > 1e-7 ||
		cents > MAX_GP_CENTS
	) {
		throw new Error('GP 餘額必須是 0 至 1,000,000.00 間、最多兩位小數的數值。');
	}
	return cents;
}

function formatGpCents(cents: number): string {
	return (cents / 100).toFixed(2).replace(/\.?0+$/, '');
}

function updateCharacterWallet(
	character: Character,
	walletType: 'public' | 'private',
	balanceCents: number,
): Character {
	const gpField = walletType === 'private' ? 'privateGp' : 'gp';
	const legacyField =
		walletType === 'private' ? 'privateCurrencies' : 'currencies';
	return {
		...character,
		[gpField]: balanceCents / 100,
		[legacyField]: legacyWalletFromGpCents(BigInt(balanceCents)),
	};
}

function formToAllItem(form: HomebrewForm): AllItem {
	const maxCharges = Number.parseInt(form.maxCharges, 10) || 0;
	const common = {
		name: form.name.trim(),
		subTypes: form.subTypes,
		rarity: form.rarity,
		icon: form.icon.trim(),
		weight: Number.parseFloat(form.weight) || 0,
		valueGp: Number.parseFloat(form.valueGp) || 0,
		affixes: form.affixes,
		effects: form.effects || '無特殊規則描述。',
		flavor: form.flavor || '',
		dmNotes: form.dmNotes || '',
		maxCharges,
		isEquippable: form.isEquippable,
		isConsumable: form.isConsumable,
		isRequireAttunement: form.isRequireAttunement,
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

interface UseInventoryActionsProps {
	campaignId: string;
	isDm: boolean;
	isRemoteCampaign: boolean;
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
	showToast: (message: string, kind?: ToastKind) => void;
}

export function useInventoryActions({
	campaignId,
	isDm,
	isRemoteCampaign,
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
			showToast(
				'同調失敗：D&D 5R 規則每名角色最多只能同調 3 件魔法物品！',
				'warning',
			);
			return;
		}
		setItems((prev) =>
			prev.map((i) => (i.id === item.id ? { ...i, attuned: !i.attuned } : i)),
		);
		showToast(
			`${item.attuned ? '已解除同調' : '✨ 已完成魔法同調'}：${item.name}`,
		);
	};

	const toggleIdentify = async (item: InventoryItem) => {
		if (!isDm || item.isIdentified) {
			showToast('只有該戰役 DM 可以鑑定尚未揭露的物品。', 'warning');
			return;
		}
		try {
			await identifyInventoryItem(campaignId, item.id);
			showToast(`👁️ 已完成鑑定，正在同步公開物品資料：${item.name}`);
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : '物品鑑定失敗，請稍後重試。',
				'error',
			);
		}
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
			if (isRemoteCampaign) {
				void splitInventoryStack(campaignId, item.id, half)
					.then(() => showToast(`已拆分出 ${half} 個 ${item.name}`))
					.catch((error: unknown) =>
						showToast(
							error instanceof Error ? error.message : '拆分物品失敗。',
							'error',
						),
					);
				return;
			}
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
		if (isRemoteCampaign) {
			void transferInventoryStack(campaignId, item.id, targetCharId, qty)
				.then(() => {
					const targetCharName =
						targetCharId === CAMP_CHEST_ID
							? '🏕️ 營地儲物箱'
							: characters.find((character) => character.id === targetCharId)?.name;
					showToast(
						`📦 已將 ${qty} 個「${item.name}」移交至 ${targetCharName ?? '指定角色'}`,
					);
				})
				.catch((error: unknown) =>
					showToast(
						error instanceof Error ? error.message : '移轉物品失敗。',
						'error',
					),
				);
			return;
		}
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
		const rarityOrder: Record<ItemBaseRarity, number> = {
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

	const setCurrencyBalance = (
		characterId: string,
		walletType: 'public' | 'private',
		balanceCents: number,
	): boolean => {
		if (!isDm) {
			showToast('只有 DM 可以直接修改戶口存款。', 'warning');
			return false;
		}
		if (
			!Number.isSafeInteger(balanceCents) ||
			balanceCents < 0 ||
			balanceCents > MAX_GP_CENTS
		) {
			showToast('存款必須是 0 至 1,000,000.00 間、最多兩位小數的 GP。', 'warning');
			return false;
		}

		try {
			if (characterId === CAMP_CHEST_ID) {
				if (walletType !== 'public') {
					showToast('營地公庫只有公開錢包。', 'warning');
					return false;
				}
				setCampChestCurrency(legacyWalletFromGpCents(BigInt(balanceCents)));
			} else {
				const character = characters.find((entry) => entry.id === characterId);
				if (!character || !['public', 'private'].includes(walletType)) {
					showToast('找不到要修改的角色戶口。', 'error');
					return false;
				}
				setCharacters((previous) =>
					previous.map((entry) =>
						entry.id === characterId
							? updateCharacterWallet(entry, walletType, balanceCents)
							: entry,
					),
				);
			}

			showToast(`已將戶口存款修改為 ${formatGpCents(balanceCents)} GP。`);
			return true;
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : '修改戶口存款失敗。',
				'error',
			);
			return false;
		}
	};

	const transferCurrency = (
		sourceCharacterId: string,
		sourceWallet: 'public' | 'private',
		targetCharacterId: string | null,
		targetWallet: 'public' | 'private',
		amountCents: number,
	) => {
		if (
			sourceCharacterId === targetCharacterId &&
			sourceWallet === targetWallet
		) {
			showToast('轉出戶口與轉入戶口不可相同。', 'warning');
			return false;
		}
		if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
			showToast('轉帳金額必須至少為 0.01 GP。', 'warning');
			return false;
		}
		const sourceCharacter =
			sourceCharacterId === CAMP_CHEST_ID
				? undefined
				: characters.find((character) => character.id === sourceCharacterId);
		const splitRecipients =
			targetCharacterId === null
				? characters.filter(
						(character) =>
							character.id !== CAMP_CHEST_ID &&
							character.id !== sourceCharacterId,
					)
				: [];
		const targetCharacter =
			targetCharacterId === null || targetCharacterId === CAMP_CHEST_ID
				? undefined
				: characters.find((character) => character.id === targetCharacterId);
		if (
			(sourceCharacterId !== CAMP_CHEST_ID && !sourceCharacter) ||
			(targetCharacterId !== null &&
				targetCharacterId !== CAMP_CHEST_ID &&
				!targetCharacter)
		) {
			showToast('找不到轉帳來源或目標角色。', 'error');
			return false;
		}
		if (
			(sourceCharacterId === CAMP_CHEST_ID && sourceWallet === 'private') ||
			((targetCharacterId === CAMP_CHEST_ID ||
				targetCharacterId === null) &&
				targetWallet === 'private')
		) {
			showToast('平分轉帳與營地公庫只支援公開錢包。', 'warning');
			return false;
		}
		if (targetCharacterId === null && splitRecipients.length === 0) {
			showToast('沒有可分配的其他角色。', 'warning');
			return false;
		}

		try {
			const sourceCents = sourceCharacter
				? gpToCents(
						sourceWallet === 'private'
							? sourceCharacter.privateGp
							: sourceCharacter.gp,
					)
				: Number(legacyWalletToGpCents(campChestCurrency));
			const targetCents =
				targetCharacterId === CAMP_CHEST_ID
					? Number(legacyWalletToGpCents(campChestCurrency))
					: targetCharacter
						? gpToCents(
								targetWallet === 'private'
									? targetCharacter.privateGp
									: targetCharacter.gp,
							)
						: 0;
			const shareCents =
				targetCharacterId === null
					? Math.floor(amountCents / splitRecipients.length)
					: amountCents;
			const remainderCents =
				targetCharacterId === null
					? amountCents % splitRecipients.length
					: 0;

			if (targetCharacterId === null && shareCents <= 0) {
				showToast('轉帳金額不足以分配給每名角色至少 0.01 GP。', 'warning');
				return false;
			}

			if (amountCents > sourceCents) {
				showToast('GP 餘額不足，無法轉出。', 'warning');
				return false;
			}
			if (
				targetCharacterId !== null &&
				targetCents + amountCents > MAX_GP_CENTS
			) {
				showToast('目標錢包餘額不可超過 1,000,000.00 GP。', 'warning');
				return false;
			}
			const overflowedRecipient =
				targetCharacterId === null
					? splitRecipients.find(
							(character) =>
								gpToCents(character.gp) + shareCents > MAX_GP_CENTS,
						)
					: undefined;
			if (overflowedRecipient) {
				showToast(
					`角色「${overflowedRecipient.name}」的公開錢包餘額將超過 1,000,000.00 GP，無法平分。`,
					'warning',
				);
				return false;
			}

			if (sourceCharacterId === CAMP_CHEST_ID) {
				setCampChestCurrency(
					legacyWalletFromGpCents(
						BigInt(sourceCents - amountCents + remainderCents),
					),
				);
			}
			if (targetCharacterId === CAMP_CHEST_ID) {
				setCampChestCurrency(
					legacyWalletFromGpCents(BigInt(targetCents + amountCents)),
				);
			}
			setCharacters((previous) =>
				previous.map((character) => {
					let updated = character;
					if (character.id === sourceCharacterId) {
						updated = updateCharacterWallet(
							updated,
							sourceWallet,
							sourceCents - amountCents + remainderCents,
						);
					}
					if (targetCharacterId === null) {
						if (splitRecipients.some((recipient) => recipient.id === character.id)) {
							const currentCents = gpToCents(character.gp);
							updated = updateCharacterWallet(
								updated,
								'public',
								currentCents + shareCents,
							);
						}
					} else if (character.id === targetCharacterId) {
						updated = updateCharacterWallet(
							updated,
							targetWallet,
							targetCents + amountCents,
						);
					}
					return updated;
				}),
			);

			const sourceName = sourceCharacter?.name ?? '營地儲物箱';
			const targetName =
				targetCharacterId === null
					? `其他 ${splitRecipients.length} 名角色`
					: (targetCharacter?.name ?? '營地儲物箱');
			showToast(
				targetCharacterId === null
					? `🪙 已將 ${formatGpCents(shareCents)} GP 平分轉入其他 ${splitRecipients.length} 名角色的公開錢包，每人獲得 ${formatGpCents(shareCents)} GP；未能平分的 ${formatGpCents(remainderCents)} GP 留在轉出戶口。`
					: `🪙 已將 ${formatGpCents(amountCents)} GP 從「${sourceName}」${sourceWallet === 'private' ? '私人' : '公開'}錢包轉入「${targetName}」${targetWallet === 'private' ? '私人' : '公開'}錢包！`,
			);
			return true;
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : '轉帳失敗，請稍後重試。',
				'error',
			);
			return false;
		}
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

	const handleDeleteCharacter = async (charId: string) => {
		if (charId === CAMP_CHEST_ID) return;
		const realCharacters = characters.filter(
			(character) => character.id !== CAMP_CHEST_ID,
		);
		if (realCharacters.length <= 1) {
			showToast('戰役中至少需保留一名冒險者角色！', 'warning');
			return;
		}
		const targetChar = characters.find((c) => c.id === charId);
		if (!targetChar) return;

		if (isRemoteCampaign) {
			try {
				await deleteCampaignCharacter(campaignId, charId);
				showToast(
					`🏕️ 已移除角色「${targetChar.name}」，其物品與雙錢包已併入營地儲物箱！`,
				);
			} catch (error) {
				showToast(
					'移除角色失敗：' +
						(error instanceof Error ? error.message : '未知錯誤'),
					'error',
				);
			}
			return;
		}

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
			subTypes: [...item.subTypes],
			rarity: item.rarity,
			icon: item.icon,
			weaponProperties:
				item.category === 'Weapon'
					? { ...item.weaponProperties, mastery: item.weaponProperties.mastery ?? '' }
					: { damage: '', mastery: '', properties: [] },
			armorProperties:
				item.category === 'Armor' ? { ...item.armorProperties } : { ac: '' },
			weight: String(item.weight),
			valueGp: String(item.valueGp),
			quantity: String(item.quantity),
			isRequireAttunement: item.isRequireAttunement,
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
			showToast('圖片網址必須使用 HTTPS。', 'warning');
			return;
		}

		let baseItem: AllItem;
		try {
			baseItem = formToAllItem(newItemForm);
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : '物品資料無效。',
				'warning',
			);
			return;
		}
		const inventoryBase: AllItem & {
			icon: string;
			flavor: string;
			maxCharges: number;
		} = {
			...baseItem,
			icon: baseItem.icon ?? 'Package',
			flavor: baseItem.flavor ?? '',
			maxCharges: baseItem.maxCharges ?? 0,
		};

		if (editingItemId) {
			setItems((prev) =>
				prev.map((item) => {
					if (item.id !== editingItemId) return item;
					return {
						...inventoryBase,
						id: item.id,
						ownerId: item.ownerId,
						slot: item.slot,
						quantity: Number.parseInt(newItemForm.quantity, 10) || 1,
						equipped: item.equipped,
						attuned: item.attuned,
						isHomebrew: item.isHomebrew,
						isIdentified: newItemForm.isIdentified,
						charges: Math.min(item.charges, inventoryBase.maxCharges),
						maxCharges: inventoryBase.maxCharges,
						playerNotes: item.playerNotes,
						isPrivate: Boolean(newItemForm.isPrivate),
						isImportant: newItemForm.isImportant,
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
			...inventoryBase,
			id: `hb-${Date.now()}`,
			ownerId: activeCharId,
			slot: 0,
			quantity: parseInt(newItemForm.quantity, 10) || 1,
			equipped: false,
			attuned: false,
			isHomebrew: true,
			isIdentified: newItemForm.isIdentified,
			charges: parseInt(newItemForm.maxCharges, 10) || 0,
			playerNotes: '',
			isPrivate: targetPrivate,
			isImportant: newItemForm.isImportant,
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
		setCurrencyBalance,
		transferCurrency,
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
