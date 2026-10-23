import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

export interface CheckboxProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
	label: ReactNode;
	labelClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
	({ className, id, label, labelClassName, ...props }, ref) => {
		const generatedId = useId();
		const checkboxId = id ?? generatedId;

		return (
			<label
				htmlFor={checkboxId}
				className={cn(
					'flex items-center gap-2 text-sm text-stone-300',
					labelClassName,
				)}
			>
				<input
					{...props}
					ref={ref}
					id={checkboxId}
					type='checkbox'
					className={cn(
						'size-4 shrink-0 rounded border-stone-600 accent-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus',
						'disabled:cursor-not-allowed',
						className,
					)}
				/>
				<span>{label}</span>
			</label>
		);
	},
);

Checkbox.displayName = 'Checkbox';
