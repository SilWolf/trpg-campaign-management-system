/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Drawer } from 'vaul';
import { Sparkles, X } from 'lucide-react';

import AppHeader from '@/components/AppHeader';
import CharacterStatusBar from '@/components/CharacterStatusBar';
import CharacterModal from '@/components/CharacterModal';
import CurrencyPanel from '@/components/CurrencyPanel';
import HomebrewModal from '@/components/HomebrewModal';
import InventoryGrid from '@/components/InventoryGrid';
import InventoryToolbar from '@/components/InventoryToolbar';
import ItemTooltip from '@/components/ItemTooltip';
import { useCampaignSync } from '@/hooks/useCampaignSync';
import { useInventoryActions } from '@/hooks/useInventoryActions';
import { useCharacterPermissions } from '@/hooks/useCharacterPermissions';
import { checkIsAuthenticated, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
	INITIAL_CHARACTERS,
	INITIAL_ITEMS,
	RARITY_CONFIG,
	WEAPON_MASTERIES,
} from '@/data';
import {
	CAMP_CHEST_ID,
	type Character,
	type InventoryDisplayMode,
	type InventoryItem,
	type ViewMode,
} from '@/types';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';

export const Route = createFileRoute('/_protected/campaigns/$campaignId/')({
	beforeLoad: async () => {
		if (!(await checkIsAuthenticated())) throw redirect({ to: '/login' });
	},
	component: CampaignInventoryPage,
});

function CampaignInventoryPage() {
	const { campaignId } = Route.useParams();
	const { isDm, user } = useUserCampaignRole(campaignId);
	const { isGuest } = useAuth();

	const [viewMode, setViewMode] = useState<ViewMode>('player');
	const [viewerCharId, setViewerCharId] = useState<string>('tav');
	const [activeCharId, setActiveCharId] = useState<string>('tav');
	const [bagTab, setBagTab] = useState<'public' | 'private'>('public');
	const [displayMode, setDisplayMode] = useState<InventoryDisplayMode>('grid');
	const [maxCharsPerPlayer, setMaxCharsPerPlayer] = useState<number>(1);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (isDm) setViewMode('dm');
		else setViewMode('player');
	}, [isDm]);

	// 讀取當前玩家在此戰役的個人角色創建上限 (campaign_members.max_characters)
	useEffect(() => {
		async function fetchMyCharacterLimit() {
			if (!supabase || !user?.id) return;
			const { data } = await supabase
				.from('campaign_members')
				.select('max_characters')
				.eq('campaign_id', campaignId)
				.eq('user_id', user.id)
				.single();
			if (data && typeof data.max_characters === 'number') {
				setMaxCharsPerPlayer(data.max_characters);
			}
		}
		fetchMyCharacterLimit();
	}, [campaignId, user?.id]);

	const {
		characters,
		setCharacters,
		items,
		setItems,
		permissions,
		campChestCurrency,
		setCampChestCurrency,
		syncStatus,
	} = useCampaignSync(
		campaignId,
		INITIAL_CHARACTERS,
		INITIAL_ITEMS,
		!isGuest && Boolean(user?.id),
	);
	useEffect(() => {
		if (
			activeCharId === CAMP_CHEST_ID ||
			characters.some((character) => character.id === activeCharId)
		) {
			return;
		}

		const nextCharacter =
			characters.find(
				(character) =>
					character.userId === user?.id && character.id !== CAMP_CHEST_ID,
			) ??
			characters.find((character) => character.id !== CAMP_CHEST_ID) ??
			characters[0];

		if (nextCharacter) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- 遠端戰役角色載入後需同步修正無效的預設選取。
			setActiveCharId(nextCharacter.id);
		} else if (syncStatus === 'synced') {
			// 空白戰役仍可直接進入虛擬營地箱。
			setActiveCharId(CAMP_CHEST_ID);
		}
	}, [activeCharId, characters, syncStatus, user?.id]);
	const [selectedItemId, setSelectedItemId] = useState('item-1');
	const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [countCoinWeight, setCountCoinWeight] = useState(true);
	const [isCharModalOpen, setIsCharModalOpen] = useState(false);
	const [editingCharacter, setEditingCharacter] = useState<Character | null>(
		null,
	);
	const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
	const [toastMessage, setToastMessage] = useState<string | null>(null);

	const showToast = (message: string) => {
		setToastMessage(message);
		setTimeout(() => setToastMessage(null), 3000);
	};

	const activeCharacter = useMemo(() => {
		const found = characters.find((character) => character.id === activeCharId);
		if (found && found.id !== CAMP_CHEST_ID) return found;
		return {
			id: CAMP_CHEST_ID,
			name: '營地儲物箱',
			title: '團隊共用行囊與公庫',
			str: 999,
			avatar: '🏕️',
			campaignId,
			userId: '',
			currencies: campChestCurrency,
			privateCurrencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		};
	}, [characters, activeCharId, campaignId, campChestCurrency]);

	// 計算當前登入使用者對 activeCharacter 的 7 項細粒度權限
	const charPerms = useCharacterPermissions(
		activeCharId,
		user?.id,
		permissions,
		isDm,
		viewMode,
		activeCharacter?.userId,
	);

	const isCampChestActive = activeCharId === CAMP_CHEST_ID;
	const canViewPrivateBag = !isCampChestActive && charPerms.canReadPrivateBag;
	const currentBagTab = !canViewPrivateBag ? 'public' : bagTab;

	const canReadCurrentBag =
		currentBagTab === 'private'
			? charPerms.canReadPrivateBag
			: charPerms.canReadPublicBag;
	const canEditCurrentBag =
		currentBagTab === 'private'
			? charPerms.canEditPrivateBag
			: charPerms.canEditPublicBag;

	// 計算當前玩家已創建的角色數，檢查是否可創建新角色
	const myCreatedCharCount = useMemo(() => {
		if (!user?.id) return 0;
		return characters.filter(
			(c) => c.id !== CAMP_CHEST_ID && c.userId === user.id,
		).length;
	}, [characters, user]);

	const canCreateCharacter =
		(isDm && viewMode === 'dm') || myCreatedCharCount < maxCharsPerPlayer;
	const createCharTooltip =
		isDm && viewMode === 'dm'
			? 'DM 新增冒險者隊員 (無數量限制)'
			: maxCharsPerPlayer <= 0
				? '本戰役目前設定禁止玩家自行創建角色'
				: canCreateCharacter
					? `創建新冒險者角色 (目前已創建 ${myCreatedCharCount}/${maxCharsPerPlayer})`
					: `已達本戰役玩家可創建角色數量上限 (${myCreatedCharCount}/${maxCharsPerPlayer})`;

	const allCharacterItems = useMemo(
		() => items.filter((item) => item.ownerId === activeCharId),
		[items, activeCharId],
	);

	const visibleBagItems = useMemo(() => {
		if (!canReadCurrentBag) return [];
		return allCharacterItems.filter((item) =>
			currentBagTab === 'private' ? Boolean(item.isPrivate) : !item.isPrivate,
		);
	}, [allCharacterItems, canReadCurrentBag, currentBagTab]);

	const attunedCount = useMemo(
		() =>
			allCharacterItems.filter((item) => {
				if (item.isPrivate && !charPerms.canReadPrivateBag) return false;
				if (!item.isPrivate && !charPerms.canReadPublicBag) return false;
				return item.attuned;
			}).length,
		[
			allCharacterItems,
			charPerms.canReadPrivateBag,
			charPerms.canReadPublicBag,
		],
	);

	// 狀態列顯示的錢包（隨當前公開/私人分頁切換）
	const isDisplayingPrivateWallet =
		!isCampChestActive && currentBagTab === 'private';
	const displayedCurrencies = useMemo(
		() =>
			isDisplayingPrivateWallet
				? activeCharacter.privateCurrencies || {
						pp: 0,
						gp: 0,
						ep: 0,
						sp: 0,
						cp: 0,
					}
				: activeCharacter.currencies,
		[
			activeCharacter.currencies,
			activeCharacter.privateCurrencies,
			isDisplayingPrivateWallet,
		],
	);
	const canReadDisplayedWallet = isDisplayingPrivateWallet
		? charPerms.canReadPrivateWallet
		: charPerms.canReadPublicWallet;

	const currencyStats = useMemo(() => {
		const pub = charPerms.canReadPublicWallet
			? activeCharacter.currencies
			: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
		const priv = charPerms.canReadPrivateWallet
			? activeCharacter.privateCurrencies || {
					pp: 0,
					gp: 0,
					ep: 0,
					sp: 0,
					cp: 0,
				}
			: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

		const totalCoinsForWeight =
			pub.pp +
			pub.gp +
			pub.ep +
			pub.sp +
			pub.cp +
			(priv.pp + priv.gp + priv.ep + priv.sp + priv.cp);
		const coinWeight = countCoinWeight
			? +(totalCoinsForWeight / 50).toFixed(1)
			: 0;

		const { pp, gp, ep, sp, cp } = displayedCurrencies;
		const totalValueInGp = +(
			pp * 10 +
			gp +
			ep * 0.5 +
			sp * 0.1 +
			cp * 0.01
		).toFixed(2);

		return { coinWeight, totalValueInGp };
	}, [
		activeCharacter,
		charPerms.canReadPublicWallet,
		charPerms.canReadPrivateWallet,
		countCoinWeight,
		displayedCurrencies,
	]);

	// 負重計算嚴格過濾無閱讀權限的背包與錢包，避免洩漏暗袋重量
	const encumbranceStats = useMemo(() => {
		const itemsForCalc = allCharacterItems.filter((item) => {
			if (item.isPrivate) return charPerms.canReadPrivateBag;
			return charPerms.canReadPublicBag;
		});
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
		charPerms.canReadPrivateBag,
		charPerms.canReadPublicBag,
		currencyStats.coinWeight,
		activeCharacter.str,
	]);

	const inspectedItem = useMemo(() => {
		const found = visibleBagItems.find((item) => item.id === selectedItemId);
		return found || visibleBagItems[0] || null;
	}, [selectedItemId, visibleBagItems]);

	const canEditInspectedItem = useMemo(() => {
		if (!inspectedItem) return false;
		return inspectedItem.isPrivate
			? charPerms.canEditPrivateBag
			: charPerms.canEditPublicBag;
	}, [inspectedItem, charPerms.canEditPrivateBag, charPerms.canEditPublicBag]);

	const handleSelectItem = (id: string) => {
		setSelectedItemId(id);
		if (window.innerWidth < 1024) setIsMobileSheetOpen(true);
	};

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

	const actions = useInventoryActions({
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
	});

	return (
		<div
			data-campaign-id={campaignId}
			className='min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-600/40 selection:text-amber-200 relative overflow-x-hidden'
		>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.14),_rgba(12,10,9,0.95)_70%)]' />

			{toastMessage && (
				<div className='fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 border border-amber-500/80 text-amber-200 px-5 py-2.5 rounded-md shadow-[0_0_25px_rgba(245,158,11,0.35)] flex items-center gap-2.5 text-sm font-medium animate-bounce'>
					<Sparkles className='w-4 h-4 text-amber-400 shrink-0' />
					<span>{toastMessage}</span>
				</div>
			)}

			<AppHeader
				isDm={isDm}
				viewMode={viewMode}
				setViewMode={setViewMode}
				characters={characters}
				viewerCharId={viewerCharId}
				setViewerCharId={setViewerCharId}
				setActiveCharId={setActiveCharId}
				syncStatus={syncStatus}
				onCreateHomebrew={actions.openCreateHomebrewModal}
			/>

			<CharacterStatusBar
				placement='characters'
				characters={characters}
				items={items}
				activeCharId={activeCharId}
				setActiveCharId={setActiveCharId}
				viewMode={viewMode}
				viewerCharId={viewerCharId}
				activeCharacter={activeCharacter}
				isCampChestActive={isCampChestActive}
				encumbranceStats={encumbranceStats}
				attunedCount={attunedCount}
				countCoinWeight={countCoinWeight}
				setCountCoinWeight={setCountCoinWeight}
				coinWeight={currencyStats.coinWeight}
				totalValueInGp={currencyStats.totalValueInGp}
				displayedCurrencies={displayedCurrencies}
				isDisplayingPrivateWallet={isDisplayingPrivateWallet}
				canReadDisplayedWallet={canReadDisplayedWallet}
				canEditCharacterModal={
					charPerms.canEditProfile || charPerms.canDeleteCharacter
				}
				canCreateCharacter={canCreateCharacter}
				createCharTooltip={createCharTooltip}
				onOpenCurrencyPanel={() => setIsCoinModalOpen(true)}
				onEditCharacter={() => {
					setEditingCharacter(activeCharacter);
					setIsCharModalOpen(true);
				}}
				onAddCharacter={() => {
					if (!canCreateCharacter) {
						showToast(`⚠️ ${createCharTooltip}`);
						return;
					}
					setEditingCharacter(null);
					setIsCharModalOpen(true);
				}}
			/>

			<main className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-5 flex flex-col lg:flex-row lg:items-start gap-6'>
				<div className='w-full lg:w-7/12 flex flex-col bg-gradient-to-b from-[#171412] via-[#12100e] to-[#0c0a09] border-2 border-amber-800/50 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.85)] overflow-hidden'>
					<CharacterStatusBar
						placement='status'
						characters={characters}
						items={items}
						activeCharId={activeCharId}
						setActiveCharId={setActiveCharId}
						viewMode={viewMode}
						viewerCharId={viewerCharId}
						activeCharacter={activeCharacter}
						isCampChestActive={isCampChestActive}
						encumbranceStats={encumbranceStats}
						attunedCount={attunedCount}
						countCoinWeight={countCoinWeight}
						setCountCoinWeight={setCountCoinWeight}
						coinWeight={currencyStats.coinWeight}
						totalValueInGp={currencyStats.totalValueInGp}
						displayedCurrencies={displayedCurrencies}
						isDisplayingPrivateWallet={isDisplayingPrivateWallet}
						canReadDisplayedWallet={canReadDisplayedWallet}
						canEditCharacterModal={
							charPerms.canEditProfile || charPerms.canDeleteCharacter
						}
						canCreateCharacter={canCreateCharacter}
						createCharTooltip={createCharTooltip}
						onOpenCurrencyPanel={() => setIsCoinModalOpen(true)}
						onEditCharacter={() => {
							setEditingCharacter(activeCharacter);
							setIsCharModalOpen(true);
						}}
						onAddCharacter={() => {
							if (!canCreateCharacter) {
								showToast(`⚠️ ${createCharTooltip}`);
								return;
							}
							setEditingCharacter(null);
							setIsCharModalOpen(true);
						}}
					/>

					<InventoryToolbar
						allCharacterItems={allCharacterItems}
						canReadPublicBag={charPerms.canReadPublicBag}
						canViewPrivateBag={canViewPrivateBag}
						canEditCurrentBag={canEditCurrentBag}
						currentBagTab={currentBagTab}
						setBagTab={setBagTab}
						searchQuery={searchQuery}
						setSearchQuery={setSearchQuery}
						displayMode={displayMode}
						setDisplayMode={setDisplayMode}
						handleAutoSort={actions.handleAutoSort}
						handleConsolidateStacks={actions.handleConsolidateStacks}
					/>

					<InventoryGrid
						items={visibleBagItems}
						viewMode={viewMode}
						displayMode={displayMode}
						inspectedItemId={inspectedItem?.id ?? null}
						totalItemsValueGp={encumbranceStats.totalItemsValueGp}
						rarityConfig={RARITY_CONFIG}
						canReadCurrentBag={canReadCurrentBag}
						canEditCurrentBag={canEditCurrentBag}
						isItemMatchingFilter={isItemMatchingFilter}
						setSelectedItemId={handleSelectItem}
						toggleEquip={actions.toggleEquip}
					/>
				</div>

				<div className='hidden lg:block lg:w-5/12 shrink-0 sticky top-5'>
					<ItemTooltip
						inspectedItem={inspectedItem}
						viewMode={viewMode}
						rarityConfig={RARITY_CONFIG}
						weaponMasteries={WEAPON_MASTERIES}
						characters={characters}
						activeCharId={activeCharId}
						viewerCharId={viewerCharId}
						canEditItemBag={canEditInspectedItem}
						canMoveBetweenPublicAndPrivate={
							charPerms.canEditPublicBag && charPerms.canEditPrivateBag
						}
						adjustCharges={actions.adjustCharges}
						toggleEquip={actions.toggleEquip}
						toggleAttune={actions.toggleAttune}
						consumeOrSplitStack={actions.consumeOrSplitStack}
						transferItemToCharacter={actions.transferItemToCharacter}
						toggleIdentify={actions.toggleIdentify}
						deleteItem={(item) => {
							actions.deleteItem(item);
							setIsMobileSheetOpen(false);
						}}
						onOpenEditModal={(item) => {
							setIsMobileSheetOpen(false);
							actions.openEditItemModal(item);
						}}
						onUpdatePlayerNotes={actions.updatePlayerNotes}
						onTogglePrivate={actions.togglePrivateItem}
						copiedAffix={actions.copiedAffix}
						onCopyAffix={actions.handleCopyAffix}
						onPasteAffix={actions.handlePasteAffixToItem}
						onUpdateAffixes={actions.updateItemAffixes}
					/>
				</div>

				<Drawer.Root
					open={isMobileSheetOpen}
					onOpenChange={setIsMobileSheetOpen}
				>
					<Drawer.Portal>
						<Drawer.Overlay className='fixed inset-0 bg-black/75 backdrop-blur-xs z-40 lg:hidden' />
						<Drawer.Content className='fixed bottom-0 left-0 right-0 max-h-[88vh] bg-[#110e0c] border-t-2 border-amber-700/60 rounded-t-2xl z-50 flex flex-col lg:hidden outline-none shadow-[0_-10px_40px_rgba(0,0,0,0.9)]'>
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
									canEditItemBag={canEditInspectedItem}
									canMoveBetweenPublicAndPrivate={
										charPerms.canEditPublicBag && charPerms.canEditPrivateBag
									}
									adjustCharges={actions.adjustCharges}
									toggleEquip={actions.toggleEquip}
									toggleAttune={actions.toggleAttune}
									consumeOrSplitStack={actions.consumeOrSplitStack}
									transferItemToCharacter={(item, targetId, qty) => {
										actions.transferItemToCharacter(item, targetId, qty);
										setIsMobileSheetOpen(false);
									}}
									toggleIdentify={actions.toggleIdentify}
									deleteItem={(item) => {
										actions.deleteItem(item);
										setIsMobileSheetOpen(false);
									}}
									onOpenEditModal={(item) => {
										setIsMobileSheetOpen(false);
										actions.openEditItemModal(item);
									}}
									onUpdatePlayerNotes={actions.updatePlayerNotes}
									onTogglePrivate={actions.togglePrivateItem}
									copiedAffix={actions.copiedAffix}
									onCopyAffix={actions.handleCopyAffix}
									onPasteAffix={actions.handlePasteAffixToItem}
									onUpdateAffixes={actions.updateItemAffixes}
								/>
							</div>
						</Drawer.Content>
					</Drawer.Portal>
				</Drawer.Root>
			</main>

			<HomebrewModal
				isOpen={actions.isHomebrewModalOpen}
				isEditing={Boolean(actions.editingItemId)}
				form={actions.newItemForm}
				setForm={actions.setNewItemForm}
				onSubmit={actions.handleSaveHomebrewOrEditItem}
				characterName={activeCharacter.name}
				onClose={() => {
					actions.setIsHomebrewModalOpen(false);
					actions.setEditingItemId(null);
				}}
				weaponMasteries={WEAPON_MASTERIES}
				copiedAffix={actions.copiedAffix}
				onCopyAffix={actions.handleCopyAffix}
			/>

			<CurrencyPanel
				isOpen={isCoinModalOpen}
				activeCharacter={activeCharacter}
				characters={characters}
				initialWalletTab={currentBagTab}
				canReadPublicWallet={charPerms.canReadPublicWallet}
				canEditPublicWallet={charPerms.canEditPublicWallet}
				canReadPrivateWallet={charPerms.canReadPrivateWallet}
				canEditPrivateWallet={charPerms.canEditPrivateWallet}
				onClose={() => setIsCoinModalOpen(false)}
				onUpdateCurrency={actions.updateCurrency}
				onConsolidateCoinsToGold={actions.consolidateCoinsToGold}
				onTransferCurrency={actions.transferCurrency}
				onTransferBetweenOwnWallets={actions.transferBetweenOwnWallets}
				onSplitCampCoinToParty={actions.splitCampCoinToParty}
			/>

			<CharacterModal
				isOpen={isCharModalOpen}
				character={editingCharacter}
				campaignId={campaignId}
				userId={user?.id ?? 'guest'}
				canEditProfile={charPerms.canEditProfile}
				canDeleteCharacter={charPerms.canDeleteCharacter}
				onClose={() => setIsCharModalOpen(false)}
				onSave={actions.handleSaveCharacter}
				onDelete={actions.handleDeleteCharacter}
			/>
		</div>
	);
}
