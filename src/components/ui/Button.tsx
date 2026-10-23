import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
	primary:
		'border border-amber-500/70 bg-amber-700 text-amber-50 hover:bg-amber-600',
	secondary:
		'border border-ui-border bg-ui-surface text-stone-200 hover:border-stone-500 hover:bg-ui-surface-raised',
	danger: 'border border-red-500/70 bg-red-900/80 text-red-100 hover:bg-red-800',
	ghost: 'border border-transparent bg-transparent text-stone-300 hover:bg-stone-800 hover:text-stone-100',
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: 'min-h-8 px-2.5 text-xs',
	md: 'min-h-9 px-3.5 text-sm',
	lg: 'min-h-11 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			children,
			className,
			disabled,
			loading = false,
			size = 'md',
			type = 'button',
			variant = 'primary',
			...props
		},
		ref,
	) => (
		<button
			{...props}
			ref={ref}
			type={type}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={cn(
				'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950',
				'disabled:pointer-events-none disabled:opacity-50',
				variantClasses[variant],
				sizeClasses[size],
				className,
			)}
		>
			{loading && (
				<>
					<span
						aria-hidden='true'
						className='size-4 animate-spin rounded-full border-2 border-current border-r-transparent'
					/>
					<span className='sr-only'>處理中</span>
				</>
			)}
			{children}
		</button>
	),
);

Button.displayName = 'Button';
