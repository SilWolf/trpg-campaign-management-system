/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Drawer } from 'vaul';
import { Coins, Crown, Gift, X } from 'lucide-react';

import { Button } from '@/components/ui';
import AppHeader from './-parts/AppHeader';
import CharacterStatusBar from './-parts/CharacterStatusBar';
import CurrencyPanel from './-parts/CurrencyPanel';
import CurrencyEditPanel from './-parts/CurrencyEditPanel';
import type { CurrencyWalletOption } from './-parts/CurrencyPanel';
import HomebrewModal from './-parts/HomebrewModal';
import InventoryGrid from './-parts/InventoryGrid';
import InventoryToolbar from './-parts/InventoryToolbar';
import ItemDistributionDialog from './-parts/ItemDistributionDialog';
import ItemTooltip from './-parts/ItemTooltip';
import { useCampaignSync } from '@/hooks/useCampaignSync';
import { gpFromLegacyCurrencyWallet, supabase } from '@/lib/supabase';
import { useInventoryActions } from '@/hooks/useInventoryActions';
import {
	evaluateCharacterPermissions,
	useCharacterPermissions,
} from '@/hooks/useCharacterPermissions';
import { checkIsAuthenticated, useAuth } from '@/contexts/AuthContext';
import {
	INITIAL_CHARACTERS,
	INITIAL_ITEMS,
	RARITY_CONFIG,
	WEAPON_MASTERIES,
} from '@/data';
import {
	CAMP_CHEST_ID,
	type InventoryDisplayMode,
	type InventoryItem,
	type ViewMode,
} from '@/types';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import { useToast } from '@/contexts/FeedbackContext';
import type { ToastKind } from '@/components/ui/ToastViewport';

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
	const toast = useToast();

	const [viewSelection, setViewSelection] = useState('dm');
	const [viewerCharId, setViewerCharId] = useState<string>('tav');
	const [activeCharId, setActiveCharId] = useState<string>('tav');
	const [displayMode, setDisplayMode] = useState<InventoryDisplayMode>('grid');
	const [previewPlayerState, setPreviewPlayerState] = useState<{
		campaignId: string;
		players: { id: string; name: string }[];
	}>({ campaignId: '', players: [] });
	const previewPlayers =
		previewPlayerState.campaignId === campaignId
			? previewPlayerState.players
			: [];
	const isSelectedPlayerAvailable = previewPlayers.some(
		(player) => player.id === viewSelection,
	);
	const viewMode: ViewMode =
		isDm && (viewSelection === 'dm' || !isSelectedPlayerAvailable)
			? 'dm'
			: 'player';
	const effectiveIsDm = isDm && viewMode === 'dm';
	const effectiveUserId =
		isDm && viewMode === 'player' ? viewSelection : user?.id;

	useEffect(() => {
		if (!isDm || !supabase) {
			return;
		}

		let cancelled = false;
		void (async () => {
			const { data, error } = await supabase
				.from('campaign_members')
				.select(
					'user_id, role, accepted_at, profiles (full_name, email)',
				)
				.eq('campaign_id', campaignId);

			if (cancelled) return;
			if (error) {
				toast.error('無法載入戰役玩家，請稍後重試。');
				return;
			}

			const players = (data ?? [])
				.filter((member) => member.role === 'player' && member.accepted_at)
				.map((member) => {
					const profile = Array.isArray(member.profiles)
						? member.profiles[0]
						: member.profiles;
					return {
						id: member.user_id,
						name: profile?.full_name || profile?.email || member.user_id,
					};
				});
			setPreviewPlayerState({ campaignId, players });
		})();

		return () => {
			cancelled = true;
		};
	}, [campaignId, isDm, toast]);

	const {
		characters,
		setCharacters,
		items,
		setItems,
		refreshItems,
		permissions,
		campChestCurrency,
		setCampChestCurrency,
		syncStatus,
		isRemoteCampaign,
	} = useCampaignSync(
		campaignId,
		INITIAL_CHARACTERS,
		INITIAL_ITEMS,
		!isGuest && Boolean(user?.id),
	);
	useEffect(() => {
		const viewerCharacter = characters.find(
			(character) =>
				character.userId === effectiveUserId &&
				character.id !== CAMP_CHEST_ID,
		);
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setViewerCharId(viewerCharacter?.id ?? '');
	}, [characters, effectiveUserId]);

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
					character.userId === effectiveUserId &&
					character.id !== CAMP_CHEST_ID,
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
	}, [activeCharId, characters, effectiveUserId, syncStatus]);
	const [selectedItemId, setSelectedItemId] = useState('item-1');
	const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [countCoinWeight, setCountCoinWeight] = useState(true);
	const [isCoinModalOpen, setIsCoinModalOpen] = useState(false);
	const [isCurrencyEditOpen, setIsCurrencyEditOpen] = useState(false);
	const [isItemDistributionOpen, setIsItemDistributionOpen] = useState(false);
	const showToast = (message: string, kind: ToastKind = 'success') => {
		toast[kind](message);
	};

	const activeCharacter = useMemo(() => {
		const found = characters.find((character) => character.id === activeCharId);
		if (found && found.id !== CAMP_CHEST_ID) return found;
		return {
			id: CAMP_CHEST_ID,
			name: '營地儲物箱',
			title: '團隊共用行囊與公庫',
			str: 999,
			avatar: 'avatar:default',
			campaignId,
			userId: '',
			gp: gpFromLegacyCurrencyWallet(campChestCurrency),
			privateGp: 0,
			currencies: campChestCurrency,
			privateCurrencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		};
	}, [characters, activeCharId, campaignId, campChestCurrency]);

	// 依目前預覽身分計算 activeCharacter 的細粒度權限
	const charPerms = useCharacterPermissions(
		activeCharId,
		effectiveUserId,
		permissions,
		effectiveIsDm,
		viewMode,
		activeCharacter?.userId,
	);

	const isCampChestActive = activeCharId === CAMP_CHEST_ID;
	const currencyWalletOptions = useMemo(() => {
		const sourceWallets: CurrencyWalletOption[] = [];
		const destinationWallets: CurrencyWalletOption[] = [];

		for (const character of characters) {
			if (character.id === CAMP_CHEST_ID) continue;
			const walletPermissions = evaluateCharacterPermissions(
				character.id,
				effectiveUserId,
				permissions,
				effectiveIsDm,
				viewMode,
				character.userId,
			);
			const wallets = [
				{
					walletType: 'public' as const,
					balanceGp: character.gp,
					canEdit: walletPermissions.canEditPublicWallet,
					canRead: walletPermissions.canReadPublicWallet,
				},
				{
					walletType: 'private' as const,
					balanceGp: character.privateGp,
					canEdit: walletPermissions.canEditPrivateWallet,
					canRead: walletPermissions.canReadPrivateWallet,
				},
			];

			for (const wallet of wallets) {
				const option = {
					characterId: character.id,
					characterName: character.name,
					walletType: wallet.walletType,
				};
				destinationWallets.push({
					...option,
					...(wallet.canRead ? { balanceGp: wallet.balanceGp } : {}),
				});
				if (wallet.canEdit) {
					sourceWallets.push({ ...option, balanceGp: wallet.balanceGp });
				}
			}
		}

		const campChestWallet: CurrencyWalletOption = {
			characterId: CAMP_CHEST_ID,
			characterName: '營地儲物箱',
			walletType: 'public',
			balanceGp: gpFromLegacyCurrencyWallet(campChestCurrency),
		};
		sourceWallets.push(campChestWallet);
		destinationWallets.push(campChestWallet);

		return { sourceWallets, destinationWallets };
	}, [
		characters,
		permissions,
		effectiveUserId,
		effectiveIsDm,
		viewMode,
		campChestCurrency,
	]);
	const dmCurrencyWallets = useMemo<CurrencyWalletOption[]>(() => {
		const wallets = characters.flatMap((character) => [
			{
				characterId: character.id,
				characterName: character.name,
				walletType: 'public' as const,
				balanceGp: character.gp,
			},
			{
				characterId: character.id,
				characterName: character.name,
				walletType: 'private' as const,
				balanceGp: character.privateGp,
			},
		]);
		return [
			...wallets,
			{
				characterId: CAMP_CHEST_ID,
				characterName: '營地儲物箱',
				walletType: 'public',
				balanceGp: gpFromLegacyCurrencyWallet(campChestCurrency),
			},
		];
	}, [characters, campChestCurrency]);
	const canViewPrivateBag = !isCampChestActive && charPerms.canReadPrivateBag;
	const canEditPrivateBag =
		canViewPrivateBag && charPerms.canEditPrivateBag;
	const canReadPublicBag =
		!isCampChestActive && charPerms.canReadPublicBag;
	const canEditAnyBag =
		charPerms.canEditPublicBag || charPerms.canEditPrivateBag;
	const canEditItem = (item: InventoryItem) =>
		item.isPrivate
			? canEditPrivateBag
			: charPerms.canEditPublicBag;

	const allCharacterItems = useMemo(
		() => items.filter((item) => item.ownerId === activeCharId),
		[items, activeCharId],
	);

	const visibleBagItems = useMemo(() => {
		return allCharacterItems.filter((item) => {
			if (item.isPrivate) return canViewPrivateBag;
			return isCampChestActive || canReadPublicBag;
		});
	}, [
		allCharacterItems,
		canViewPrivateBag,
		canReadPublicBag,
		isCampChestActive,
	]);

	const attunedCount = useMemo(
		() => visibleBagItems.filter((item) => item.attuned).length,
		[visibleBagItems],
	);

	const canReadPublicWallet =
		isCampChestActive || charPerms.canReadPublicWallet;
	const canReadPrivateWallet =
		!isCampChestActive && charPerms.canReadPrivateWallet;
	const canEditAnyWallet =
		charPerms.canEditPublicWallet || charPerms.canEditPrivateWallet;
	const preferredWalletType =
		!isCampChestActive &&
		!charPerms.canEditPublicWallet &&
		charPerms.canEditPrivateWallet
			? 'private'
			: 'public';
	const canDispatchItems =
		effectiveIsDm && isRemoteCampaign && !isGuest && Boolean(user?.id);

	const currencyStats = useMemo(() => {
		const readableGpCents =
			(charPerms.canReadPublicWallet
				? Math.round(activeCharacter.gp * 100)
				: 0) +
			(charPerms.canReadPrivateWallet
				? Math.round(activeCharacter.privateGp * 100)
				: 0);
		const wholeGp = Math.floor(readableGpCents / 100);
		const coinWeight = countCoinWeight ? (wholeGp * 2) / 100 : 0;
		return { coinWeight };
	}, [
		activeCharacter,
		charPerms.canReadPublicWallet,
		charPerms.canReadPrivateWallet,
		countCoinWeight,
	]);

	// 負重計算嚴格過濾無閱讀權限的背包與錢包，避免洩漏暗袋重量
	const encumbranceStats = useMemo(() => {
		const itemsForCalc = allCharacterItems.filter((item) =>
			item.isPrivate ? canViewPrivateBag : isCampChestActive || canReadPublicBag,
		);
		const itemsWeight = itemsForCalc.reduce(
			(sum, item) => sum + item.weight * item.quantity,
			0,
		);
		const totalWeight = +(itemsWeight + currencyStats.coinWeight).toFixed(2);
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
		canReadPublicBag,
		isCampChestActive,
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
			item.subTypes.join(' ').toLowerCase().includes(searchQuery.toLowerCase())
		);
	};

	const actions = useInventoryActions({
		campaignId,
		isDm: effectiveIsDm,
		isRemoteCampaign,
		characters,
		setCharacters,
		canEditPublicBag: charPerms.canEditPublicBag,
		canEditPrivateBag: charPerms.canEditPrivateBag,
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
		setSelectedItemId,
		showToast,
	});

	return (
		<div
			data-campaign-id={campaignId}
			className='min-h-screen bg-background text-foreground font-sans selection:bg-primary/40 selection:text-primary-foreground relative overflow-x-hidden'
		>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_18%,transparent),var(--background)_70%)]' />

			<AppHeader
				isDm={isDm}
				viewSelection={viewMode === 'dm' ? 'dm' : viewSelection}
				onViewSelectionChange={(selection) => {
					setViewSelection(selection);
					if (selection !== 'dm') {
						const playerCharacter = characters.find(
							(character) => character.userId === selection,
						);
						if (playerCharacter) setActiveCharId(playerCharacter.id);
					}
				}}
				players={previewPlayers}
				syncStatus={syncStatus}
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
				publicGp={activeCharacter.gp}
				privateGp={activeCharacter.privateGp}
				canReadPublicWallet={canReadPublicWallet}
				canReadPrivateWallet={canReadPrivateWallet}
				canEditAnyWallet={canEditAnyWallet}
				onOpenCurrencyPanel={() => setIsCoinModalOpen(true)}
			/>

			<main className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-5 flex flex-col lg:flex-row lg:items-start gap-6'>
				<div className='w-full lg:w-7/12 flex flex-col bg-gradient-to-b from-card via-background to-background border-2 border-primary/50 rounded-lg shadow-lg overflow-hidden'>
					{effectiveIsDm && (
						<section
							aria-label='DM 操作'
							data-testid='dm-operation-bar'
							className='flex flex-wrap items-center justify-between gap-3 border-b border-dm/50 bg-dm/5 px-3.5 py-3'
						>
							<div className='flex items-center gap-2 text-sm font-serif font-bold text-dm'>
								<Crown className='size-4' />
								<span>DM 操作</span>
							</div>
							<div className='flex flex-wrap items-center gap-2'>
								<Button
									type='button'
									variant='secondary-dm'
									size='sm'
									data-testid='inventory-currency-edit'
									onClick={() => setIsCurrencyEditOpen(true)}
									prefixIcon={<Coins />}
								>
									增減金錢
								</Button>
								{canDispatchItems && (
									<Button
										type='button'
										variant='secondary-dm'
										size='sm'
										data-testid='inventory-dispatch-items'
										onClick={() => setIsItemDistributionOpen(true)}
										prefixIcon={<Gift />}
									>
										派發物品
									</Button>
								)}
							</div>
						</section>
					)}

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
						publicGp={activeCharacter.gp}
						privateGp={activeCharacter.privateGp}
						canReadPublicWallet={canReadPublicWallet}
						canReadPrivateWallet={canReadPrivateWallet}
						canEditAnyWallet={canEditAnyWallet}
						onOpenCurrencyPanel={() => setIsCoinModalOpen(true)}
					/>

					<InventoryToolbar
						canEditAnyBag={canEditAnyBag}
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
						canEditAnyBag={canEditAnyBag}
						canEditItem={canEditItem}
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
						canMakeItemPublic={canEditPrivateBag}
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
						onMakeItemPublic={actions.makeItemPublic}
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
						<Drawer.Overlay className='fixed inset-0 bg-background/75 backdrop-blur-xs z-40 lg:hidden' />
						<Drawer.Content className='fixed bottom-0 left-0 right-0 max-h-[88vh] bg-card border-t-2 border-primary/60 rounded-t-2xl z-50 flex flex-col lg:hidden outline-none shadow-lg'>
							<div className='flex items-center justify-between px-4 py-2.5 border-b border-border/80 shrink-0'>
								<div className='w-6' />
								<div className='w-12 h-1.5 rounded-full bg-accent' />
								<Button
									onClick={() => setIsMobileSheetOpen(false)}
									variant='ghost'
									size='sm'
									prefixIcon={<X />}
								>
								</Button>
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
									canMakeItemPublic={canEditPrivateBag}
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
									onMakeItemPublic={actions.makeItemPublic}
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
				campaignId={campaignId}
				canManageItemImage={effectiveIsDm && !isGuest && Boolean(user)}
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

			{effectiveIsDm && isRemoteCampaign && !isGuest && user?.id && (
					<ItemDistributionDialog
						isOpen={isItemDistributionOpen}
						campaignId={campaignId}
						userId={user.id}
						characters={characters}
						items={items}
						onClose={() => setIsItemDistributionOpen(false)}
						refreshItems={refreshItems}
					/>
			)}

			<CurrencyPanel
				isOpen={isCoinModalOpen}
				activeCharacter={activeCharacter}
				initialWalletTab={preferredWalletType}
				sourceWallets={currencyWalletOptions.sourceWallets}
				destinationWallets={currencyWalletOptions.destinationWallets}
				onClose={() => setIsCoinModalOpen(false)}
				onTransferCurrency={actions.transferCurrency}
			/>

			{effectiveIsDm && isCurrencyEditOpen && (
				<CurrencyEditPanel
					isOpen={isCurrencyEditOpen}
					wallets={dmCurrencyWallets}
					initialWalletId={JSON.stringify([
						activeCharacter.id,
						isCampChestActive ? 'public' : preferredWalletType,
					])}
					onClose={() => setIsCurrencyEditOpen(false)}
					onSave={actions.setCurrencyBalance}
				/>
			)}

		</div>
	);
}
