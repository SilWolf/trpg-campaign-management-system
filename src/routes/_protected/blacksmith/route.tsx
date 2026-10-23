/* eslint-disable react-refresh/only-export-components */
import { Outlet, createFileRoute } from '@tanstack/react-router';
import { SystemLinkBar } from '@/components/SystemLinkBar';

export const Route = createFileRoute('/_protected/blacksmith')({
	component: BlacksmithLayout,
});

function BlacksmithLayout() {
	return (
		<>
			<header className='relative z-20 border-b border-amber-900/40 bg-stone-950/90 px-4 py-3 backdrop-blur-md lg:px-8'>
				<div className='mx-auto max-w-7xl'>
					<SystemLinkBar />
				</div>
			</header>
			<Outlet />
		</>
	);
}
