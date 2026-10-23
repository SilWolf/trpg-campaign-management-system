// src/routes/_protected/campaigns/$campaignId/route.tsx
/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	Outlet,
	createFileRoute,
	Link,
	useParams,
} from '@tanstack/react-router';
import { Backpack, Settings, Shield, ArrowLeft } from 'lucide-react';
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
		<div className='min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-600/40 selection:text-amber-200 relative overflow-x-hidden flex flex-col'>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.14),_rgba(12,10,9,0.95)_70%)]' />

			{/* 頂部全域戰役導航列 */}
			<header className='relative z-20 border-b border-amber-900/40 bg-stone-950/90 backdrop-blur-md px-4 lg:px-8 py-3'>
				<div className='mx-auto flex max-w-7xl flex-col gap-3'>
					<SystemLinkBar />
					<div className='flex flex-col items-center justify-between gap-3 sm:flex-row'>
						<div className='flex items-center gap-3'>
							<Link
								to='/'
								className='flex shrink-0 items-center gap-1 rounded-md border border-stone-700 bg-stone-900/80 px-2.5 py-2 text-xs text-stone-300 transition hover:border-amber-700 hover:text-amber-200'
							>
								<ArrowLeft className='h-3.5 w-3.5' />
								<span>返回大廳</span>
							</Link>
							<div className='flex items-center gap-2'>
								<Shield className='w-5 h-5 text-amber-400' />
								<span className='font-serif font-bold text-amber-200'>
									戰役 ID: {campaignId}
								</span>
							</div>
						</div>

						{/* 戰役內部分頁切換：全面開放所有成員進入設定中心 */}
						<nav className='flex items-center gap-2 bg-stone-900 p-1 rounded-lg border border-stone-800'>
							<Link
								to='/campaigns/$campaignId'
								params={{ campaignId }}
								activeOptions={{ exact: true }}
								className='flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition [&.active]:bg-amber-800/80 [&.active]:text-amber-100 text-stone-400 hover:text-stone-200'
							>
								<Backpack className='w-3.5 h-3.5' />
								<span>軍械庫與背包</span>
							</Link>

							<Link
								to='/campaigns/$campaignId/settings'
								params={{ campaignId }}
								className='flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition [&.active]:bg-amber-800/80 [&.active]:text-amber-100 text-stone-400 hover:text-stone-200'
							>
								<Settings className='w-3.5 h-3.5' />
								<span>戰役與角色設定</span>
							</Link>
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
