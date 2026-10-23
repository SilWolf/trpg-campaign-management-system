import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export type BadgeVariant =
	| 'default'
	| 'secondary'
	| 'magic'
	| 'private'
	| 'camp'
	| 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
	default: 'border-amber-700/60 bg-amber-950/70 text-amber-200',
	secondary: 'border-stone-700 bg-stone-900 text-stone-300',
	magic: 'border-purple-700/60 bg-purple-950/70 text-purple-200',
	private: 'border-emerald-700/60 bg-emerald-950/70 text-emerald-200',
	camp: 'border-cyan-700/60 bg-cyan-950/70 text-cyan-200',
	danger: 'border-red-700/60 bg-red-950/70 text-red-200',
};

export function Badge({
	children,
	className,
	variant = 'default',
	...props
}: BadgeProps) {
	return (
		<span
			{...props}
			className={cn(
				'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
				variantClasses[variant],
				className,
			)}
		>
			{children}
		</span>
	);
}
