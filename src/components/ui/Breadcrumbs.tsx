import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

type BreadcrumbDestination = '/blacksmith' | '/blacksmith/officials';

interface BreadcrumbItem {
	label: string;
	to?: BreadcrumbDestination;
	current?: boolean;
}

interface BreadcrumbsProps {
	items: BreadcrumbItem[];
	className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
	return (
		<nav aria-label='麵包屑' className={className}>
			<ol className='flex flex-wrap items-center gap-1 text-sm text-stone-400'>
				{items.map((item, index) => (
					<li key={`${item.label}-${index}`} className='flex items-center gap-1'>
						{index > 0 && (
							<ChevronRight
								aria-hidden='true'
								className='h-3.5 w-3.5 text-stone-600'
							/>
						)}
						{item.to ? (
							<Link
								to={item.to}
								className='transition-colors hover:text-amber-200'
							>
								{item.label}
							</Link>
						) : (
							<span
								aria-current={item.current ? 'page' : undefined}
								className={item.current ? 'text-amber-200' : undefined}
							>
								{item.label}
							</span>
						)}
					</li>
				))}
			</ol>
		</nav>
	);
}
