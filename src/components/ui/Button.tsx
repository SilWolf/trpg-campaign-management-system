import { cloneElement, forwardRef, isValidElement } from 'react';
import type { ReactElement } from 'react';
import type { ReactNode } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './utils';

export type ButtonVariant =
	| 'primary'
	| 'secondary'
	| 'secondary-active'
	| 'destructive'
	| 'danger'
	| 'ghost'
	| 'primary-dm'
	| 'secondary-dm'
	| 'ghost-dm';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonStyleProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	className?: string;
	prefixIcon?: ReactElement<{ className?: string }>;
}

export type ButtonProps = ButtonStyleProps &
	(
		| ({
				asChild?: false;
				loading?: boolean;
		  } & ButtonHTMLAttributes<HTMLButtonElement>)
		| {
				asChild: true;
				children: ReactElement<{
					className?: string;
					children?: ReactNode;
				}>;
		  }
	);

const variantClasses: Record<ButtonVariant, string> = {
	primary:
		'border border-primary/70 bg-primary text-primary-foreground hover:bg-primary/90',
	['secondary-active']:
		'border border-primary/70 bg-primary/30 text-secondary-foreground hover:border-accent hover:bg-primary/30 hover:text-secondary-foreground',
	secondary:
		'border border-border bg-card text-secondary-foreground hover:border-accent hover:bg-accent hover:text-accent-foreground',
	destructive:
		'border border-destructive/70 bg-destructive/80 text-destructive-foreground hover:bg-destructive',
	danger:
		'border border-destructive/70 bg-destructive/80 text-destructive-foreground hover:bg-destructive',
	ghost:
		'border border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
	'primary-dm':
		'border border-dm/70 bg-dm text-dm-foreground hover:bg-dm/90',
	'secondary-dm':
		'border border-dm/50 bg-dm/10 text-dm hover:border-dm hover:bg-dm/20',
	'ghost-dm':
		'border border-transparent bg-transparent text-dm hover:bg-dm/10',
};

const sizeClasses: Record<ButtonSize, string> = {
	sm: 'min-h-8 px-2.5 text-xs [&_.lucide]:size-3.5',
	md: 'min-h-9 px-3.5 text-sm [&_.lucide]:size-4',
	lg: 'min-h-11 px-5 text-base [&_.lucide]:size-5',
};

function normalizePrefixIcon(
	prefixIcon: ReactElement<{ className?: string }> | undefined,
) {
	if (!prefixIcon) return null;
	return cloneElement(prefixIcon, {
		className: undefined,
	});
}

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
				'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground',
				variantClasses[variant],
				sizeClasses[size],
				className,
			);

		if (props.asChild) {
			if (
				!isValidElement<{
					className?: string;
					children?: ReactNode;
				}>(props.children)
			) {
				throw new TypeError('Button asChild requires a single element child.');
			}

			return cloneElement(props.children, {
				className: cn(
					getButtonClassName(props.variant, props.size, props.className),
					props.children.props.className,
				),
				children: (
					<>
						{normalizePrefixIcon(props.prefixIcon)}
						{props.children.props.children}
					</>
				),
			});
		}

		const {
			children,
			className,
			disabled,
			loading = false,
			prefixIcon,
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
				{normalizePrefixIcon(prefixIcon)}
				{children}
			</button>
		);
	},
);

Button.displayName = 'Button';
