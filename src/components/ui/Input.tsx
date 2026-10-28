import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	description?: string;
	error?: string;
	containerClassName?: string;
	labelClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
	(
		{
			'aria-describedby': ariaDescribedBy,
			'aria-invalid': ariaInvalid,
			className,
			containerClassName,
			description,
			error,
			id,
			label,
			labelClassName,
			...props
		},
		ref,
	) => {
		const generatedId = useId();
		const inputId = id ?? generatedId;
		const descriptionId = description ? `${inputId}-description` : undefined;
		const errorId = error ? `${inputId}-error` : undefined;
		const describedBy = [ariaDescribedBy, descriptionId, errorId]
			.filter(Boolean)
			.join(' ') || undefined;

		return (
			<div className={cn('grid gap-1.5', containerClassName)}>
				{label && (
					<label
						htmlFor={inputId}
						className={cn(
							'text-sm font-medium text-foreground',
							labelClassName,
						)}
					>
						{label}
					</label>
				)}
				<input
					{...props}
					ref={ref}
					id={inputId}
					aria-describedby={describedBy}
					aria-invalid={error ? true : ariaInvalid}
					className={cn(
						'w-full rounded-control border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
						'outline-none transition-colors',
						'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
						'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground disabled:placeholder:text-disabled-foreground',
						error &&
							'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40',
						className,
					)}
				/>
				{description && (
					<p id={descriptionId} className='text-xs text-muted-foreground'>
						{description}
					</p>
				)}
				{error && (
					<p id={errorId} role='alert' className='text-xs text-destructive-foreground'>
						{error}
					</p>
				)}
			</div>
		);
	},
);

Input.displayName = 'Input';
