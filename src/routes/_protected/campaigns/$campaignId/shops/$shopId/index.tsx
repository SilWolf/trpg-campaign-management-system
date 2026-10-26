/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Image, Pencil, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import { loadCampaignShopItems, loadCampaignShops } from '@/lib/campaignShops';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import ItemIcon from '../../-parts/ItemIcon';
import { ShopTransactionsPanel } from '../-parts/ShopTransactionsPanel';
import type { CampaignShop, CampaignShopItem, ItemCategory, Rarity } from '@/types';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/shops/$shopId/',
)({
	component: CampaignShopDetail,
});

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

function CampaignShopDetail() {
	const { campaignId, shopId } = Route.useParams();
	const { isDm } = useUserCampaignRole(campaignId);
	const { user, isGuest } = useAuth();
	const [shop, setShop] = useState<CampaignShop | null>(null);
	const [items, setItems] = useState<CampaignShopItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visibleItems = useMemo(
		() => items.filter((item) => isDm || item.isActive),
		[isDm, items],
	);

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
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'campaign_shop_items',
					filter: `campaign_id=eq.${campaignId}`,
				},
				() => void reload(),
			)
			.subscribe();

		return () => {
			isMounted = false;
			if (channel) void supabase?.removeChannel(channel);
		};
	}, [campaignId, isGuest, shopId]);

	if (!isSupabaseConfigured || isGuest) {
		return (
			<main className='rounded-lg border border-amber-800/50 bg-stone-900/80 p-6'>
				<h1 className='font-serif text-2xl font-bold text-amber-200'>戰役商店</h1>
				<p className='mt-3 text-sm text-stone-400'>
					商店雲端功能需要登入 Supabase 帳號。
				</p>
			</main>
		);
	}

	if (isLoading) {
		return (
			<main className='rounded-lg border border-stone-800 bg-stone-900/60 p-8 text-center text-sm text-stone-400'>
				載入商店中…
			</main>
		);
	}

	if (errorMessage) {
		return (
			<main role='alert' className='rounded-lg border border-red-800/70 bg-red-950/40 p-4 text-sm text-red-200'>
				{errorMessage}
			</main>
		);
	}

	if (!shop || (!isDm && !shop.isActive)) {
		return (
			<main className='rounded-lg border border-stone-800 bg-stone-900/60 p-8 text-center'>
				<Store className='mx-auto mb-3 h-8 w-8 text-stone-600' />
				<p className='text-stone-400'>找不到這家商店，或商店目前未營業。</p>
				<Link
					to='/campaigns/$campaignId/shops'
					params={{ campaignId }}
					className='mt-4 inline-block text-sm text-amber-300 hover:text-amber-200'
				>
					返回商店列表
				</Link>
			</main>
		);
	}

	return (
		<main data-testid='campaign-shop-detail' data-shop-id={shop.id}>
			<div className='mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-amber-900/40 pb-4'>
				<div>
					<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
						戰役商店
					</p>
					<h1 className='mt-1 font-serif text-3xl font-bold text-amber-100'>
						{shop.name}
					</h1>
				</div>
				{isDm && (
					<Link
						to='/campaigns/$campaignId/shops/$shopId/settings'
						params={{ campaignId, shopId }}
					>
						<Button
							type='button'
							variant='secondary'
							className='border border-stone-700 bg-stone-950 text-stone-300'
						>
							<Pencil className='h-4 w-4' />
							商店設定
						</Button>
					</Link>
				)}
			</div>

			<div className='overflow-hidden rounded-lg border border-stone-800 bg-stone-900/70'>
				{shop.backgroundImageUrl ? (
					<img src={shop.backgroundImageUrl} alt='' className='h-48 w-full object-cover' />
				) : (
					<div className='flex h-36 items-center justify-center bg-gradient-to-br from-amber-950/50 via-stone-900 to-stone-950'>
						<Image className='h-8 w-8 text-amber-900' />
					</div>
				)}
				<div className='px-4 py-3'>
					<h2 className='font-serif text-xl font-bold text-amber-100'>{shop.name}</h2>
					<p className='mt-1 text-xs text-stone-500'>
						{shop.isActive ? '營業中' : '已停用'}
					</p>
				</div>
			</div>

			<section className='mt-5 rounded-lg border border-stone-800 bg-stone-900/50 p-4'>
				<div className='mb-4 flex items-center justify-between'>
					<div>
						<h2 className='font-serif text-xl font-bold text-amber-100'>商品目錄</h2>
						<p className='mt-1 text-xs text-stone-500'>
							選擇角色與可修改的錢包，即可購買或送出審查請求。
						</p>
					</div>
					<span className='font-mono text-xs text-stone-500'>{visibleItems.length} 項</span>
				</div>
				{visibleItems.length === 0 ? (
					<div className='rounded-md border border-dashed border-stone-700 p-8 text-center text-sm text-stone-500'>
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
								<div className='flex items-start gap-3'>
									<div
										className='relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-700 bg-stone-950'
										data-testid='shop-item-icon'
									>
										<ItemIcon
											iconName={item.itemSnapshot.icon}
											className='h-7 w-7 text-stone-300'
										/>
									</div>
									<div className='min-w-0 flex-1'>
										<h3 className='truncate font-serif font-bold text-stone-100'>
											{item.itemSnapshot.name}
										</h3>
										<p className='mt-1 text-xs text-stone-500'>
											{CATEGORY_LABELS[item.itemSnapshot.category]}・
											{RARITY_LABELS[item.itemSnapshot.rarity]}
										</p>
									</div>
								</div>
								<p className='mt-3 font-mono text-lg text-amber-300'>
									{item.unitPriceGp.toLocaleString('zh-TW')} gp
								</p>
								<div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500'>
									<span>
										庫存 <span className='font-mono text-stone-300'>{item.stockAvailable}</span>
									</span>
									{isDm && !item.isActive && <span>停用</span>}
									{item.requiresApproval && (
										<span className='text-purple-300'>需 DM 審查</span>
									)}
								</div>
							</article>
						))}
					</div>
				)}
			</section>

			{shop && user?.id && (
				<ShopTransactionsPanel
					campaignId={campaignId}
					shop={shop}
					items={visibleItems}
					isDm={isDm}
					canManageOrders={false}
					userId={user.id}
				/>
			)}
		</main>
	);
}
