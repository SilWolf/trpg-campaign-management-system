/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
	useParams,
} from '@tanstack/react-router';
import { Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import { loadCampaignShops } from '@/lib/campaignShops';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { CampaignShop } from '@/types';

export const Route = createFileRoute('/_protected/campaigns/$campaignId/shops')({
	component: CampaignShopsLayout,
});

function CampaignShopsLayout() {
	const { campaignId } = useParams({
		from: '/_protected/campaigns/$campaignId/shops',
	});
	const { isDm } = useUserCampaignRole(campaignId);
	const { isGuest } = useAuth();
	const { pathname } = useLocation();
	const [shops, setShops] = useState<CampaignShop[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!isSupabaseConfigured || isGuest) return;

		let isMounted = true;
		const reload = () =>
			loadCampaignShops(campaignId)
				.then((nextShops) => {
					if (isMounted) {
						setShops(nextShops);
						setErrorMessage(null);
					}
				})
				.catch((error: unknown) => {
					if (isMounted) {
						setErrorMessage(
							error instanceof Error ? error.message : '載入商店列表失敗。',
						);
					}
				});

		void reload();
		const channel = supabase
			?.channel(`campaign-shops-navigation-${campaignId}`)
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

		return () => {
			isMounted = false;
			if (channel) void supabase?.removeChannel(channel);
		};
	}, [campaignId, isGuest, pathname]);

	const visibleShops =
		isSupabaseConfigured && !isGuest
			? shops.filter((shop) => isDm || shop.isActive)
			: [];

	return (
		<div className='mx-auto grid max-w-7xl gap-5 px-4 py-5 text-stone-200 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8'>
			<aside
				aria-label='商店快速導覽'
				className='h-fit rounded-lg border border-stone-800 bg-stone-900/70 p-3'
			>
				<div className='mb-3 flex items-center justify-between px-2'>
					<h2 className='font-serif font-bold text-stone-200'>商店快速導覽</h2>
					<span className='font-mono text-xs text-stone-500'>
						{visibleShops.length}
					</span>
				</div>
				{errorMessage ? (
					<p role='alert' className='px-2 py-3 text-sm text-red-300'>
						{errorMessage}
					</p>
				) : visibleShops.length === 0 ? (
					<p className='px-2 py-3 text-sm text-stone-500'>
						{isGuest || !isSupabaseConfigured
							? '登入後即可查看戰役商店。'
							: '目前沒有商店。'}
					</p>
				) : (
					<nav className='flex gap-1 overflow-x-auto lg:flex-col'>
						{visibleShops.map((shop) => (
							<Link
								key={shop.id}
								to='/campaigns/$campaignId/shops/$shopId'
								params={{ campaignId, shopId: shop.id }}
								activeOptions={{ exact: true }}
								className='flex min-w-0 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-stone-400 transition hover:bg-stone-800 hover:text-stone-100 [&.active]:bg-amber-950/50 [&.active]:text-amber-200 lg:w-full'
							>
								<Store className='h-4 w-4 shrink-0 text-amber-400' />
								<span className='truncate'>{shop.name}</span>
								{!shop.isActive && (
									<span className='text-[10px] text-stone-500'>停用</span>
								)}
							</Link>
						))}
					</nav>
				)}
				<Link
					to='/campaigns/$campaignId/shops'
					params={{ campaignId }}
					activeOptions={{ exact: true }}
					className='mt-3 block rounded-md border-t border-stone-800 px-3 pt-3 text-xs text-stone-400 hover:text-amber-200 [&.active]:text-amber-200'
				>
					查看全部商店
				</Link>
			</aside>
			<div className='min-w-0'>
				<Outlet />
			</div>
		</div>
	);
}
