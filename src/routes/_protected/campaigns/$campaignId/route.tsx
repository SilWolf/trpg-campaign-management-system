// src/routes/_protected/campaigns/$campaignId/route.tsx
/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	Outlet,
	createFileRoute,
	Link,
	useParams,
} from '@tanstack/react-router';
import {
	Backpack,
	Settings,
	Shield,
	ArrowLeft,
	Store,
	BookOpenText,
} from 'lucide-react';
import { SystemLinkBar } from '@/components/SystemLinkBar';

export const Route = createFileRoute('/_protected/campaigns/$campaignId')({
	component: CampaignLayout,
});

function CampaignLayout() {
	const { campaignId } = useParams({
		from: '/_protected/campaigns/$campaignId',
	});
	useUserCampaignRole(campaignId); // 保持身分檢查

	return (
		<div className='min-h-screen bg-background text-foreground font-sans selection:bg-primary/40 selection:text-primary-foreground relative overflow-x-hidden flex flex-col'>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_18%,transparent),var(--background)_70%)]' />

			{/* 頂部全域戰役導航列 */}
			<header className='relative z-20 border-b border-primary/40 bg-background/90 backdrop-blur-md px-4 lg:px-8 py-3'>
				<div className='mx-auto flex max-w-7xl flex-col gap-3'>
					<SystemLinkBar />
					<div className='flex flex-col items-center justify-between gap-3 sm:flex-row'>
						<div className='flex items-center gap-3'>
							<Link
								to='/'
								className='flex shrink-0 items-center gap-1 rounded-md border border-border bg-card/80 px-2.5 py-2 text-xs text-foreground transition hover:border-primary hover:text-primary-foreground'
							>
								<ArrowLeft className='h-3.5 w-3.5' />
								<span>返回大廳</span>
							</Link>
							<div className='flex items-center gap-2'>
								<Shield className='w-5 h-5 text-card-foreground' />
								<span className='font-serif font-bold text-card-foreground'>
									戰役 ID: <span className='text-highlight'>{campaignId}</span>
								</span>
							</div>
						</div>

						{/* 戰役內部分頁切換：全面開放所有成員進入設定中心 */}
						<nav
							aria-label='戰役分頁'
							className='w-full overflow-x-auto rounded-lg border border-border bg-card p-1 sm:w-auto'
						>
							<div className='flex w-max min-w-full items-center gap-1'>
							<Link
								to='/campaigns/$campaignId'
								params={{ campaignId }}
								activeOptions={{ exact: true }}
								className='flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&.active]:bg-primary/80 [&.active]:text-primary-foreground'
							>
								<Backpack className='w-3.5 h-3.5' />
								<span>軍械庫與背包</span>
							</Link>

							<Link
								to='/campaigns/$campaignId/shops'
								params={{ campaignId }}
								className='flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&.active]:bg-primary/80 [&.active]:text-primary-foreground'
							>
								<Store className='w-3.5 h-3.5' />
								<span>戰役商店</span>
							</Link>

							<Link
								to='/campaigns/$campaignId/journeys'
								params={{ campaignId }}
								className='flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&.active]:bg-primary/80 [&.active]:text-primary-foreground'
							>
								<BookOpenText className='h-3.5 w-3.5' />
								<span>冒險筆記</span>
							</Link>

							<Link
								to='/campaigns/$campaignId/settings'
								params={{ campaignId }}
								className='flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&.active]:bg-primary/80 [&.active]:text-primary-foreground'
							>
								<Settings className='w-3.5 h-3.5' />
								<span>戰役與角色設定</span>
							</Link>
							</div>
						</nav>
					</div>
				</div>
			</header>

			{/* 子頁面內容渲染區 */}
			<div className='flex-1 relative z-10'>
				<Outlet />
			</div>
		</div>
	);
}
