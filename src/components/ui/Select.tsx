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
						className={cn('text-sm font-medium text-foreground', labelClassName)}
					>
						{label}
					</label>
				)}
				<select
					{...props}
					ref={ref}
					id={selectId}
					className={cn(
						'w-full rounded-control border border-border bg-input px-3 py-2 text-sm text-foreground outline-none transition-colors',
						'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
						'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground',
						className,
					)}
				/>
			</div>
		);
	},
);

Select.displayName = 'Select';
