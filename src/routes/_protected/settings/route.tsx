/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { Outlet, createFileRoute } from '@tanstack/react-router';
import { SystemLinkBar } from '@/components/SystemLinkBar';

export const Route = createFileRoute('/_protected/settings')({
	component: UserSettingLayout,
});

function UserSettingLayout() {
	return (
		<div className='min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-600/40 selection:text-amber-200 relative overflow-x-hidden flex flex-col'>
			<div className='fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.14),_rgba(12,10,9,0.95)_70%)]' />

			{/* 頂部系統導覽列 */}
			<header className='relative z-20 border-b border-amber-900/40 bg-stone-950/90 backdrop-blur-md px-4 lg:px-8 py-3'>
				<div className='mx-auto max-w-7xl'>
					<SystemLinkBar />
				</div>
			</header>

			{/* 子頁面內容渲染區 */}
			<div className='flex-1 relative z-10'>
				<Outlet />
			</div>
		</div>
	);
}
