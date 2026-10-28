import { Link } from '@tanstack/react-router';
import { Hammer, Swords } from 'lucide-react';

export function SystemLinkBar() {
	return (
		<nav
			aria-label='系統導覽'
			className='flex items-center gap-2 rounded-lg border border-border bg-card p-1'
		>
			<Link
				data-testid='system-link-campaign'
				to='/'
				activeOptions={{ exact: true }}
				className='flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&.active]:bg-primary/80 [&.active]:text-primary-foreground'
			>
				<Swords aria-hidden='true' className='h-3.5 w-3.5' />
				<span>返回戰役系統</span>
			</Link>
			<Link
				data-testid='system-link-blacksmith'
				to='/blacksmith'
				className='flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground [&.active]:bg-primary/80 [&.active]:text-primary-foreground'
			>
				<Hammer aria-hidden='true' className='h-3.5 w-3.5' />
				<span>鍛造工坊</span>
			</Link>
		</nav>
	);
}
