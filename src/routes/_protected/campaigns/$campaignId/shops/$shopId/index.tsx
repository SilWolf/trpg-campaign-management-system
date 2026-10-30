/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
	ChevronLeft,
	ChevronRight,
	HelpCircle,
	Image,
	Minus,
	Pencil,
	Plus,
	ShoppingBag,
	Store,
} from 'lucide-react';
import { ITEM_CATEGORY_LABELS, RARITY_CONFIG } from '@/data';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	loadCampaignShopItems,
	loadCampaignShops,
	subscribeCampaignSecureChanges,
} from '@/lib/campaignShops';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import ReactMarkdown from 'react-markdown';
import ItemIcon from '../../-parts/ItemIcon';
import { ShopTransactionsPanel } from '../-parts/ShopTransactionsPanel';
import {
	getItemArmorClass,
	getItemDamage,
	type CampaignShop,
	type CampaignShopItem,
	type ItemBaseCategory,
} from '@/types';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/shops/$shopId/',
)({
	component: CampaignShopDetail,
});

const CATEGORY_LABELS: Record<ItemBaseCategory, string> = ITEM_CATEGORY_LABELS;

const ITEM_EFFECTS_MAX_HEIGHT = 200;

function isUnidentifiedShopItem(item: CampaignShopItem): boolean {
	return (
		!item.isIdentified ||
		item.itemSnapshot.isIdentified === false ||
		item.itemSnapshot.name === '未鑑定物品'
	);
}

function CampaignShopDetail() {
	const { campaignId, shopId } = Route.useParams();
	const { isDm } = useUserCampaignRole(campaignId);
	const { user, isGuest } = useAuth();
	const [shop, setShop] = useState<CampaignShop | null>(null);
	const [items, setItems] = useState<CampaignShopItem[]>([]);
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [cartQuantities, setCartQuantities] = useState<Record<string, number>>(
		{},
	);
	const [checkoutOpen, setCheckoutOpen] = useState(false);
	const [requestedPage, setRequestedPage] = useState(1);
	const [expandedItemEffectsId, setExpandedItemEffectsId] = useState<
		string | null
	>(null);
	const [longItemEffectsId, setLongItemEffectsId] = useState<string | null>(
		null,
	);
	const itemEffectsContentRef = useRef<HTMLDivElement>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visibleItems = useMemo(
		() => items.filter((item) => item.isActive),
		[items],
	);
	const pageSize = 10;
	const pageCount = Math.max(1, Math.ceil(visibleItems.length / pageSize));
	const currentPage = Math.min(requestedPage, pageCount);
	const paginatedItems = visibleItems.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);
	const cartItems = items.flatMap((item) => {
		const quantity = cartQuantities[item.id] ?? 0;
		return quantity > 0 ? [{ item, quantity }] : [];
	});
	const checkoutItems = items.flatMap((item) => {
		const quantity = cartQuantities[item.id];
		return quantity === undefined ? [] : [{ item, quantity }];
	});
	const cartItemCount = cartItems.reduce(
		(total, entry) => total + entry.quantity,
		0,
	);
	const cartTotalGp = cartItems.reduce(
		(total, entry) => total + entry.item.unitPriceGp * entry.quantity,
		0,
	);
	const cartIsValid =
		cartItems.length > 0 &&
		cartItems.every(
			({ item, quantity }) => item.isActive && quantity <= item.stockAvailable,
		);
	const handleCheckoutOpenChange = (open: boolean) => {
		if (!open) {
			setCartQuantities((current) =>
				Object.fromEntries(
					Object.entries(current).filter(([, quantity]) => quantity > 0),
				),
			);
		}
		setCheckoutOpen(open);
	};
	const selectedItem =
		visibleItems.find((item) => item.id === selectedItemId) ??
		visibleItems[0] ??
		null;
	const selectedItemIsUnidentified =
		selectedItem !== null && isUnidentifiedShopItem(selectedItem);
	const selectedItemDisplayName = selectedItemIsUnidentified
		? `未鑑定的${CATEGORY_LABELS[selectedItem.itemSnapshot.category]}`
		: (selectedItem?.itemSnapshot.name ?? '');
	const selectedItemRarityStyle = selectedItem
		? selectedItemIsUnidentified
			? RARITY_CONFIG.Common
			: RARITY_CONFIG[selectedItem.itemSnapshot.rarity]
		: RARITY_CONFIG.Common;
	const isItemEffectsExpanded =
		selectedItem !== null && expandedItemEffectsId === selectedItem.id;
	const hasLongItemEffects =
		selectedItem !== null && longItemEffectsId === selectedItem.id;
	const selectedItemEffectId = selectedItem?.id;
	const selectedItemEffects = selectedItem?.itemSnapshot.effects;

	useEffect(() => {
		const content = itemEffectsContentRef.current;
		if (!content || !selectedItemEffectId) return;

		const observer = new ResizeObserver(() => {
			setLongItemEffectsId(
				content.scrollHeight > ITEM_EFFECTS_MAX_HEIGHT
					? selectedItemEffectId
					: null,
			);
		});
		observer.observe(content);
		return () => observer.disconnect();
	}, [selectedItemEffectId, selectedItemEffects]);

	useEffect(() => {
		if (!isSupabaseConfigured || isGuest) {
			return;
		}
		let isMounted = true;
		const reload = async () => {
			try {
				const shops = await loadCampaignShops(campaignId);
				const currentShop = shops.find((entry) => entry.id === shopId) ?? null;
				if (!currentShop) {
					if (isMounted) {
						setShop(null);
						setItems([]);
					}
					return;
				}
				const nextItems = await loadCampaignShopItems(campaignId, shopId);
				if (isMounted) {
					setShop(currentShop);
					setItems(nextItems);
					setErrorMessage(null);
				}
			} catch (error) {
				if (isMounted) {
					setErrorMessage(
						error instanceof Error ? error.message : '載入商店資料失敗。',
					);
				}
			} finally {
				if (isMounted) setIsLoading(false);
			}
		};
		void reload();

		const channel = supabase
			?.channel(`campaign-shop-detail-${shopId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'campaign_shops',
					filter: `campaign_id=eq.${campaignId}`,
				},
				() => void reload(),
			)
			.subscribe();
		const secureChannel = subscribeCampaignSecureChanges(
			campaignId,
			() => void reload(),
			(error) => {
				if (isMounted) {
					setErrorMessage(error.message || '商店安全同步頻道連線失敗。');
				}
			},
		);

		return () => {
			isMounted = false;
			if (channel) void supabase?.removeChannel(channel);
			secureChannel();
		};
	}, [campaignId, isGuest, shopId]);

	if (!isSupabaseConfigured || isGuest) {
		return (
			<main className='rounded-lg border border-primary/50 bg-card/80 p-6'>
				<h1 className='font-serif text-2xl font-bold text-card-foreground'>
					戰役商店
				</h1>
				<p className='mt-3 text-sm text-muted-foreground'>
					商店雲端功能需要登入 Supabase 帳號。
				</p>
			</main>
		);
	}

	if (isLoading) {
		return (
			<main className='rounded-lg border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground'>
				載入商店中…
			</main>
		);
	}

	if (errorMessage) {
		return (
			<main
				role='alert'
				className='rounded-lg border border-destructive/70 bg-destructive/40 p-4 text-sm text-destructive-foreground'
			>
				{errorMessage}
			</main>
		);
	}

	if (!shop || !shop.isActive) {
		return (
			<main className='rounded-lg border border-border bg-card/60 p-8 text-center'>
				<Store className='mx-auto mb-3 h-8 w-8 text-muted-foreground' />
				<p className='text-muted-foreground'>
					找不到這家商店，或商店目前未營業。
				</p>
				<Link
					to='/campaigns/$campaignId/shops'
					params={{ campaignId }}
					className='mt-4 inline-block text-sm text-primary-foreground hover:text-primary-foreground'
				>
					返回商店列表
				</Link>
			</main>
		);
	}

	return (
		<main data-testid='campaign-shop-detail' data-shop-id={shop.id}>
			<div className='mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-primary/40 pb-4'>
				<div>
					<p className='text-xs font-semibold tracking-[0.2em] text-muted-foreground'>
						戰役商店
					</p>
					<h1 className='mt-1 font-serif text-3xl font-bold text-foreground'>
						{shop.name}
					</h1>
					{shop.flavor && (
						<p className='mt-2 whitespace-pre-line text-sm text-muted-foreground'>
							{shop.flavor}
						</p>
					)}
				</div>
				{isDm && (
					<Link
						to='/campaigns/$campaignId/shops/$shopId/settings'
						params={{ campaignId, shopId }}
					>
						<Button type='button' variant='secondary-dm' prefixIcon={<Pencil />}>
							商店設定
						</Button>
					</Link>
				)}
			</div>

			<div className='overflow-hidden rounded-lg border border-border bg-card/70'>
				{shop.backgroundImageUrl ? (
					<img
						src={shop.backgroundImageUrl}
						alt=''
						className='h-48 w-full object-cover'
					/>
				) : (
					<div className='flex h-36 items-center justify-center bg-gradient-to-br from-primary/50 via-card to-background'>
						<Image className='h-8 w-8 text-primary-foreground' />
					</div>
				)}
			</div>

			<section className='mt-5 rounded-lg border border-border bg-card/50 p-4'>
				<div className='mb-4'>
					<h2 className='font-serif text-xl font-bold text-card-foreground'>
						商品目錄
					</h2>
					<p className='mt-1 text-xs text-muted-foreground'>
						選擇商品查看詳細資料，使用 +1／-1 調整數量，再選擇角色與錢包結帳。
					</p>
				</div>
				<div className='flex flex-col gap-4 lg:flex-row'>
					<div className='min-w-0 rounded-md border border-border bg-background/40 lg:flex-[3]'>
						<div className='border-b border-border px-3 py-2'>
							<span className='font-mono text-xs text-muted-foreground'>
								{visibleItems.length} 項商品
							</span>
						</div>
						{visibleItems.length === 0 ? (
							<div className='rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
								尚無商品
							</div>
						) : (
							<div className='h-[39rem] divide-y divide-border overflow-y-auto'>
								{paginatedItems.map((item) => {
									const isSelected = selectedItem?.id === item.id;
									const quantity = cartQuantities[item.id] ?? 0;
									const isUnidentified = isUnidentifiedShopItem(item);
									const isMasked = isUnidentified;
									const displayName =
										isMasked || item.itemSnapshot.name === '未鑑定物品'
											? `未鑑定的${CATEGORY_LABELS[item.itemSnapshot.category]}`
											: item.itemSnapshot.name;
									const rarityStyle = isMasked
										? RARITY_CONFIG.Common
										: RARITY_CONFIG[item.itemSnapshot.rarity];
									const canAdd =
										shop.isActive &&
										item.isActive &&
										quantity < item.stockAvailable;
									return (
										<div
											key={item.id}
											className='flex min-w-0 items-stretch border-b border-border last:border-b-0'
											data-testid='shop-item-rarity-card'
											style={{ borderLeftColor: rarityStyle.color }}
										>
											<Button
												type='button'
												variant='ghost'
												aria-label={`查看${displayName}`}
												aria-pressed={isSelected}
												onClick={() => setSelectedItemId(item.id)}
												data-testid='shop-item-card'
												className='flex-1 py-2 rounded-none text-left'
											>
												<div className='flex min-w-0 flex-1 items-center gap-2'>
													<div
														className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-background ${rarityStyle.border} ${rarityStyle.bg} ${rarityStyle.glow}`}
														data-testid='shop-item-icon'
													>
														{isMasked ? (
															<HelpCircle className='h-6 w-6 text-foreground' />
														) : (
															<ItemIcon
																iconName={item.itemSnapshot.icon}
																className={`h-6 w-6 ${rarityStyle.text}`}
																imageSize='512'
															/>
														)}
													</div>
													<div className='min-w-0'>
														<h3
															className={`truncate font-serif text-sm font-bold ${rarityStyle.text}`}
														>
															{displayName}
														</h3>
														<p className='mt-1 truncate text-xs text-muted-foreground'>
															{CATEGORY_LABELS[item.itemSnapshot.category]}
															{!isUnidentified && (
																<>
																	・
																	<span
																		data-testid='shop-item-rarity'
																		className={`inline-flex rounded border px-1 py-0.5 leading-none ${rarityStyle.badgeBg}`}
																	>
																		{rarityStyle.label}
																	</span>
																</>
															)}
														</p>
													</div>
												</div>
												<div className='flex shrink-0 flex-col items-end gap-2'>
													<span className='font-mono text-sm text-money'>
														{item.unitPriceGp.toLocaleString('zh-TW')} gp
													</span>
													<span className='text-[11px] text-muted-foreground'>
														庫存 {item.stockAvailable}
													</span>
												</div>
												{item.requiresApproval && (
													<span className='text-[11px] text-primary-foreground'>
														需 DM 審查
													</span>
												)}
											</Button>
											<div
												className='flex shrink-0 items-center justify-center gap-2 px-3'
												aria-label={`${displayName}購買數量`}
											>
												<Button
													type='button'
													variant='secondary'
													size='sm'
													aria-label={`-1 ${displayName}`}
													disabled={quantity === 0}
													onClick={() =>
														setCartQuantities((current) => ({
															...current,
															[item.id]: Math.max(
																0,
																(current[item.id] ?? 0) - 1,
															),
														}))
													}
													prefixIcon={<Minus />}
												></Button>
												<span
													className='min-w-6 text-center font-mono text-sm text-foreground'
													data-testid={`shop-cart-quantity-${item.id}`}
												>
													{quantity}
												</span>
												<Button
													type='button'
													variant='secondary'
													size='sm'
													aria-label={`+1 ${displayName}`}
													disabled={!canAdd}
													onClick={() =>
														setCartQuantities((current) => ({
															...current,
															[item.id]: (current[item.id] ?? 0) + 1,
														}))
													}
													prefixIcon={<Plus />}
												></Button>
											</div>
										</div>
									);
								})}
							</div>
						)}
						{visibleItems.length > pageSize && (
							<nav
								aria-label='商品列表分頁'
								className='flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2'
							>
								<p
									data-testid='shop-items-pagination-status'
									className='text-xs text-muted-foreground'
								>
									第{' '}
									<span className='font-mono text-foreground'>
										{currentPage}
									</span>{' '}
									/{' '}
									<span className='font-mono text-foreground'>{pageCount}</span>{' '}
									頁
									<span className='hidden sm:inline'>
										{' '}
										· 顯示 {(currentPage - 1) * pageSize + 1}–
										{Math.min(currentPage * pageSize, visibleItems.length)} 筆
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
										prefixIcon={<ChevronLeft aria-hidden='true' />}
									>
										上一頁
									</Button>
									<Button
										type='button'
										variant='secondary'
										size='sm'
										aria-label='下一頁'
										disabled={currentPage === pageCount}
										onClick={() =>
											setRequestedPage((page) => Math.min(pageCount, page + 1))
										}
										prefixIcon={<ChevronRight aria-hidden='true' />}
									>
										下一頁
									</Button>
								</div>
							</nav>
						)}
					</div>

					<aside
						className='min-w-0 rounded-md border border-border bg-background/60 p-4 lg:min-w-72 lg:flex-[2]'
						aria-label='物品詳細'
						data-testid='shop-item-details'
					>
						{selectedItem ? (
							<>
								<div className='flex items-start gap-3 border-b border-border pb-4'>
									<div
										className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-b ${selectedItemRarityStyle.border} ${selectedItemRarityStyle.bg} ${selectedItemRarityStyle.glow}`}
										data-testid='shop-item-detail-icon'
									>
										{selectedItemIsUnidentified ? (
											<HelpCircle className='h-8 w-8 text-muted-foreground' />
										) : (
											<ItemIcon
												iconName={selectedItem.itemSnapshot.icon}
												className='h-8 w-8 text-foreground'
												imageSize='512'
											/>
										)}
									</div>
									<div className='min-w-0'>
										<h3
											className={`font-serif text-xl font-bold ${
												selectedItemIsUnidentified
													? 'text-foreground'
													: selectedItemRarityStyle.text
											}`}
										>
											{selectedItemDisplayName}
										</h3>
										<p className='mt-1 text-xs text-muted-foreground'>
											{selectedItemIsUnidentified
												? '未鑑定'
												: `${CATEGORY_LABELS[selectedItem.itemSnapshot.category]}・${selectedItemRarityStyle.label}${
														selectedItem.itemSnapshot.subTypes.length > 0
															? `・${selectedItem.itemSnapshot.subTypes.join('、')}`
															: ''
													}`}
										</p>
									</div>
								</div>

								<div className='grid grid-cols-2 gap-2 border-b border-border py-3 text-sm'>
									{!selectedItemIsUnidentified &&
										getItemDamage(selectedItem.itemSnapshot) && (
											<div>
												<p className='text-[11px] text-muted-foreground'>
													傷害
												</p>
												<p className='font-mono text-primary-foreground'>
													{getItemDamage(selectedItem.itemSnapshot)}
												</p>
											</div>
										)}
									{!selectedItemIsUnidentified &&
										getItemArmorClass(selectedItem.itemSnapshot) && (
											<div>
												<p className='text-[11px] text-muted-foreground'>
													護甲等級
												</p>
												<p className='font-mono text-foreground'>
													AC {getItemArmorClass(selectedItem.itemSnapshot)}
												</p>
											</div>
										)}
									{!selectedItemIsUnidentified && (
										<div>
											<p className='text-[11px] text-muted-foreground'>重量</p>
											<p className='font-mono text-foreground'>
												{selectedItem.itemSnapshot.weight} lb
											</p>
										</div>
									)}
									<div>
										<p className='text-[11px] text-muted-foreground'>
											商店價格
										</p>
										<p className='font-mono text-money'>
											{selectedItem.unitPriceGp.toLocaleString('zh-TW')} gp
										</p>
									</div>
									<div>
										<p className='text-[11px] text-muted-foreground'>
											可用庫存
										</p>
										<p className='font-mono text-foreground'>
											{selectedItem.stockAvailable}
										</p>
									</div>
									{!selectedItemIsUnidentified &&
										selectedItem.itemSnapshot.isRequireAttunement && (
											<div className='self-end text-xs text-foreground'>
												需同調
											</div>
										)}
								</div>

								{!selectedItemIsUnidentified &&
									selectedItem.itemSnapshot.flavor && (
										<div className='border-b border-border py-3'>
											<h4 className='mb-1 text-xs font-semibold text-muted-foreground'>
												物品描述
											</h4>
											<div className='prose prose-invert max-w-none text-sm leading-relaxed text-foreground'>
												<ReactMarkdown>
													{selectedItem.itemSnapshot.flavor}
												</ReactMarkdown>
											</div>
										</div>
									)}
								{selectedItemIsUnidentified ? (
									<div className='border-b border-border py-3 text-sm italic text-foreground'>
										此物品散發著晦澀難明的魔法波動，無法得知其確切能力。
									</div>
								) : selectedItem.itemSnapshot.effects ? (
									<div className='border-b border-border py-3'>
										<h4 className='mb-1 text-xs font-semibold text-muted-foreground'>
											物品效果
										</h4>
										<div
											className={`max-w-none overflow-hidden ${
												isItemEffectsExpanded ? 'max-h-none' : 'max-h-[200px]'
											}`}
											data-testid='shop-item-effects'
										>
											<div
												ref={itemEffectsContentRef}
												className='prose prose-invert max-w-none text-sm leading-relaxed text-foreground'
											>
												<ReactMarkdown>
													{selectedItem.itemSnapshot.effects}
												</ReactMarkdown>
											</div>
										</div>
										{hasLongItemEffects && (
											<Button
												type='button'
												variant='ghost'
												size='sm'
												aria-expanded={isItemEffectsExpanded}
												onClick={() =>
													setExpandedItemEffectsId(
														isItemEffectsExpanded ? null : selectedItem.id,
													)
												}
											>
												{isItemEffectsExpanded ? '收合' : '顯示全部'}
											</Button>
										)}
									</div>
								) : null}
								{!selectedItemIsUnidentified &&
									(selectedItem.itemSnapshot.affixes ?? [])
										.filter((affix) => !affix.isHidden)
										.map((affix) => (
											<div
												key={affix.id}
												className='border-b border-border py-3 last:border-0'
											>
												<h4 className='mb-1 text-xs font-semibold text-foreground'>
													{affix.name}
												</h4>
												<div className='prose prose-invert max-w-none text-sm leading-relaxed text-foreground'>
													<ReactMarkdown>{affix.desc}</ReactMarkdown>
												</div>
											</div>
										))}
								{selectedItem.requiresApproval && (
									<p className='mt-3 text-xs text-foreground'>
										此商品購買需要 DM 審查。
									</p>
								)}
							</>
						) : (
							<div className='flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground'>
								請先從左側選擇商品以查看詳細資料。
							</div>
						)}
					</aside>
				</div>
				<div className='mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4'>
					<div>
						<p className='text-xs text-muted-foreground'>已挑選商品</p>
						<p className='mt-1 text-sm text-foreground'>
							<span className='font-mono'>{cartItemCount}</span> 件
							<span className='mx-2 text-muted-foreground'>·</span>
							總價值{' '}
							<span className='font-mono text-primary-foreground'>
								{cartTotalGp.toLocaleString('zh-TW', {
									maximumFractionDigits: 2,
								})}{' '}
								gp
							</span>
						</p>
					</div>
					<Button
						type='button'
						disabled={!cartIsValid || !shop.isActive}
						onClick={() => setCheckoutOpen(true)}
						data-testid='shop-checkout-open'
						prefixIcon={<ShoppingBag />}
					>
						結帳
					</Button>
				</div>
			</section>

			{shop && user?.id && (
				<ShopTransactionsPanel
					campaignId={campaignId}
					shop={shop}
					items={visibleItems}
					isDm={isDm}
					canManageOrders={false}
					userId={user.id}
					showPurchaseForm={false}
					cartItems={checkoutItems}
					checkoutOpen={checkoutOpen}
					onCheckoutOpenChange={handleCheckoutOpenChange}
					onCartQuantityChange={(itemId, quantity) =>
						setCartQuantities((current) => ({
							...current,
							[itemId]: quantity,
						}))
					}
					onCheckoutComplete={() => setCartQuantities({})}
				/>
			)}
		</main>
	);
}
