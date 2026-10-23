import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from './utils';

export interface TextareaProps
	extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	label?: string;
	description?: string;
	error?: string;
	containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
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
			...props
		},
		ref,
	) => {
		const generatedId = useId();
		const textareaId = id ?? generatedId;
		const descriptionId = description ? `${textareaId}-description` : undefined;
		const errorId = error ? `${textareaId}-error` : undefined;
		const describedBy = [ariaDescribedBy, descriptionId, errorId]
			.filter(Boolean)
			.join(' ') || undefined;

		return (
			<div className={cn('grid gap-1.5', containerClassName)}>
				{label && (
					<label
						htmlFor={textareaId}
						className='text-sm font-medium text-stone-200'
					>
						{label}
					</label>
				)}
				<textarea
					{...props}
					ref={ref}
					id={textareaId}
					aria-describedby={describedBy}
					aria-invalid={error ? true : ariaInvalid}
					className={cn(
						'min-h-24 w-full resize-y rounded-control border bg-ui-surface px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500',
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

Textarea.displayName = 'Textarea';
