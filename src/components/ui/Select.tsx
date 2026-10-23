import { forwardRef, useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from './utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
	label?: string;
	labelClassName?: string;
	containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
	(
		{ className, containerClassName, id, label, labelClassName, ...props },
		ref,
	) => {
		const generatedId = useId();
		const selectId = id ?? generatedId;

		return (
			<div className={cn('grid gap-1.5', containerClassName)}>
				{label && (
					<label
						htmlFor={selectId}
						className={cn('text-sm font-medium text-stone-200', labelClassName)}
					>
						{label}
					</label>
				)}
				<select
					{...props}
					ref={ref}
					id={selectId}
					className={cn(
						'w-full rounded-control border border-ui-border bg-ui-surface px-3 py-2 text-sm text-stone-100 outline-none transition-colors',
						'focus-visible:border-ui-focus focus-visible:ring-2 focus-visible:ring-ui-focus/40',
						'disabled:cursor-not-allowed disabled:opacity-50',
						className,
					)}
				/>
			</div>
		);
	},
);

Select.displayName = 'Select';
