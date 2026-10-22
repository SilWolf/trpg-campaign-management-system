/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { Outlet, createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/_protected/settings')({
	component: UserSettingLayout,
});

function UserSettingLayout() {
	return (
		<div className='min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-600/40 selection:text-amber-200 relative overflow-x-hidden flex flex-col'>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.14),_rgba(12,10,9,0.95)_70%)]' />

			{/* 頂部全域戰役導航列 */}
			<header className='relative z-20 border-b border-amber-900/40 bg-stone-950/90 backdrop-blur-md px-4 lg:px-8 py-3'>
				<div className='max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3'>
					<div className='flex items-center gap-3'>
						<Link
							to='/'
							className='flex shrink-0 items-center gap-1 rounded-md border border-stone-700 bg-stone-900/80 px-2.5 py-2 text-xs text-stone-300 transition hover:border-amber-700 hover:text-amber-200'
						>
							<ArrowLeft className='h-3.5 w-3.5' />
							<span>返回大廳</span>
						</Link>
					</div>
					<div className='flex-1'></div>
				</div>
			</header>

			{/* 子頁面內容渲染區 */}
			<div className='flex-1 relative z-10'>
				<Outlet />
			</div>
		</div>
	);
}
