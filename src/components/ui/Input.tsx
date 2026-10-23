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
							'text-sm font-medium text-stone-200',
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
						'w-full rounded-control border bg-ui-surface px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500',
						'border-ui-border outline-none transition-colors',
						'focus-visible:border-ui-focus focus-visible:ring-2 focus-visible:ring-ui-focus/40',
						'disabled:cursor-not-allowed disabled:opacity-50',
						error &&
							'border-red-500/80 focus-visible:border-red-400 focus-visible:ring-red-400/40',
						className,
					)}
				/>
				{description && (
					<p id={descriptionId} className='text-xs text-stone-400'>
						{description}
					</p>
				)}
				{error && (
					<p id={errorId} role='alert' className='text-xs text-red-300'>
						{error}
					</p>
				)}
			</div>
		);
	},
);

Input.displayName = 'Input';
