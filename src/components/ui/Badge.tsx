import type { HTMLAttributes } from 'react';
import { cn } from './utils';

export type BadgeVariant =
	| 'default'
	| 'secondary'
	| 'success'
	| 'destructive'
	| 'warning'
	| 'info'
	| 'disabled';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
	default: 'border-primary/60 bg-primary/20 text-primary-foreground',
	secondary: 'border-border bg-muted text-muted-foreground',
	success: 'border-success/60 bg-success/20 text-success-foreground',
	destructive:
		'border-destructive/60 bg-destructive/20 text-destructive-foreground',
	warning: 'border-warning/60 bg-warning/20 text-warning-foreground',
	info: 'border-info/60 bg-info/20 text-info-foreground',
	disabled: 'border-border bg-disabled text-disabled-foreground',
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
