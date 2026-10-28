import { cloneElement, forwardRef, isValidElement } from 'react';
import type { ReactElement } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonStyleProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	className?: string;
}

export type ButtonProps = ButtonStyleProps &
	(
		| ({
				asChild?: false;
				loading?: boolean;
		  } & ButtonHTMLAttributes<HTMLButtonElement>)
		| {
				asChild: true;
				children: ReactElement<{ className?: string }>;
		  }
	);

const variantClasses: Record<ButtonVariant, string> = {
	primary:
		'border border-amber-500/70 bg-primary text-primary-foreground hover:bg-amber-600',
	secondary:
		'border border-border bg-card text-secondary-foreground hover:border-stone-500 hover:bg-muted',
	danger: 'border border-red-500/70 bg-destructive/80 text-destructive-foreground hover:bg-red-800',
	ghost: 'border border-transparent bg-transparent text-stone-300 hover:bg-stone-800 hover:text-stone-100',
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: 'min-h-8 px-2.5 text-xs',
	md: 'min-h-9 px-3.5 text-sm',
	lg: 'min-h-11 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	(props, ref) => {
		const getButtonClassName = (
			variant: ButtonVariant = 'primary',
			size: ButtonSize = 'md',
			className?: string,
		) =>
			cn(
				'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
				'disabled:pointer-events-none disabled:opacity-50',
				variantClasses[variant],
				sizeClasses[size],
				className,
			);

		if (props.asChild) {
			if (!isValidElement<{ className?: string }>(props.children)) {
				throw new TypeError('Button asChild requires a single element child.');
			}

			return cloneElement(props.children, {
				className: cn(
					getButtonClassName(props.variant, props.size, props.className),
					props.children.props.className,
				),
			});
		}

		const {
			children,
			className,
			disabled,
			loading = false,
			size,
			variant,
			...buttonProps
		} = props;

		return (
			<button
				{...buttonProps}
				ref={ref}
				type={buttonProps.type ?? 'button'}
				disabled={disabled || loading}
				aria-busy={loading || undefined}
				className={getButtonClassName(variant, size, className)}
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
		);
	},
);

Button.displayName = 'Button';
