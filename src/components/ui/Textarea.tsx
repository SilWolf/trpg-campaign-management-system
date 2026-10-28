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
						className='text-sm font-medium text-foreground'
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
						'min-h-24 w-full resize-y rounded-control border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
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

Textarea.displayName = 'Textarea';
