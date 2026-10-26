/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import { loadCampaignShops } from '@/lib/campaignShops';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui';
import type { CampaignShop } from '@/types';
import { CampaignShopDialog } from './-parts/CampaignShopDialog';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/shops/',
)({
	component: CampaignShopsIndex,
});

function CampaignShopsIndex() {
	const { campaignId } = Route.useParams();
	const { isDm, loading: roleLoading } = useUserCampaignRole(campaignId);
	const { isGuest } = useAuth();
	const [shops, setShops] = useState<CampaignShop[]>([]);
	const [isCreating, setIsCreating] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!isSupabaseConfigured || isGuest) return;
		let isMounted = true;
		loadCampaignShops(campaignId)
			.then((nextShops) => {
				if (isMounted) setShops(nextShops);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(
						error instanceof Error ? error.message : '載入戰役商店失敗。',
					);
				}
			});
		return () => {
			isMounted = false;
		};
	}, [campaignId, isGuest]);

	const visibleShops = shops.filter((shop) => isDm || shop.isActive);

	return (
		<main data-testid='campaign-shops-page' data-campaign-id={campaignId}>
			<div className='mb-6 flex flex-col justify-between gap-4 border-b border-amber-900/40 pb-5 sm:flex-row sm:items-end'>
				<div>
					<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
						戰役商店
					</p>
					<h1 className='mt-1 font-serif text-3xl font-bold text-amber-100'>
						全部商店
					</h1>
					<p className='mt-2 text-sm text-stone-400'>
						瀏覽本戰役已建立的商店，選擇商店即可查看商品與交易。
					</p>
				</div>
				{isDm && (
					<Button
						type='button'
						onClick={() => setIsCreating(true)}
						className='border border-amber-500/60 bg-amber-800 text-amber-50 hover:bg-amber-700'
					>
						<Plus className='h-4 w-4' />
						建立商店
					</Button>
				)}
			</div>

			{errorMessage && (
				<p role='alert' className='mb-4 rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200'>
					{errorMessage}
				</p>
			)}

			{isCreating && isDm && (
				<CampaignShopDialog
					campaignId={campaignId}
					onClose={() => setIsCreating(false)}
					onSaved={(shop) => setShops((current) => [...current, shop])}
				/>
			)}

			{roleLoading ? (
				<p className='rounded-lg border border-stone-800 bg-stone-900/60 p-8 text-center text-sm text-stone-400'>
					載入戰役商店中…
				</p>
			) : !isSupabaseConfigured || isGuest ? (
				<p className='rounded-lg border border-amber-800/50 bg-stone-900/80 p-6 text-sm text-stone-400'>
					商店雲端功能需要登入 Supabase 帳號；離線或訪客模式不會建立本機商店或假冒同步狀態。
				</p>
			) : visibleShops.length === 0 ? (
				<div className='rounded-lg border border-dashed border-stone-700 bg-stone-900/40 p-10 text-center'>
					<Store className='mx-auto mb-3 h-8 w-8 text-stone-600' />
					<p className='text-stone-400'>
						{isDm ? '尚未建立商店。' : '目前沒有啟用中的商店。'}
					</p>
				</div>
			) : (
				<div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
					{visibleShops.map((shop) => (
						<Link
							key={shop.id}
							to='/campaigns/$campaignId/shops/$shopId'
							params={{ campaignId, shopId: shop.id }}
							className='group overflow-hidden rounded-lg border border-stone-800 bg-stone-900/70 transition hover:border-amber-800/70'
						>
							{shop.backgroundImageUrl ? (
								<img
									src={shop.backgroundImageUrl}
									alt=''
									className='h-36 w-full object-cover'
								/>
							) : (
								<div className='flex h-28 items-center justify-center bg-gradient-to-br from-amber-950/50 via-stone-900 to-stone-950'>
									<Store className='h-8 w-8 text-amber-900' />
								</div>
							)}
							<div className='flex items-center justify-between gap-3 px-4 py-3'>
								<h2 className='font-serif text-lg font-bold text-amber-100 group-hover:text-amber-200'>
									{shop.name}
								</h2>
								{!shop.isActive && (
									<span className='text-xs text-stone-500'>已停用</span>
								)}
							</div>
						</Link>
					))}
				</div>
			)}
		</main>
	);
}
