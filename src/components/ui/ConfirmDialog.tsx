import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: ConfirmVariant;
}

export interface ConfirmRequest {
	id: string;
	options: ConfirmOptions;
	resolve: (result: boolean) => void;
}

interface ConfirmDialogProps {
	request: ConfirmRequest | null;
	onResolve: (id: string, result: boolean) => void;
}

export function ConfirmDialog({ request, onResolve }: ConfirmDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const cancelButtonRef = useRef<HTMLButtonElement>(null);
	const [isResolving, setIsResolving] = useState(false);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (!request) {
			if (dialog.open) dialog.close();
			return;
		}

		if (!dialog.open) dialog.showModal();
		cancelButtonRef.current?.focus();

		return () => {
			if (dialog.open) dialog.close();
		};
	}, [request]);

	const resolve = (result: boolean) => {
		if (!request || isResolving) return;
		setIsResolving(true);
		onResolve(request.id, result);
	};

	const variant = request?.options.variant ?? 'default';

	return (
		<dialog
			aria-describedby="feedback-confirm-message"
			aria-labelledby="feedback-confirm-title"
			className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop:bg-background/75"
			onCancel={(event) => {
				event.preventDefault();
				resolve(false);
			}}
			onClick={(event) => {
				if (event.target === event.currentTarget) resolve(false);
			}}
			ref={dialogRef}
		>
			{request && (
				<div className="p-6">
					<h2
						className="font-serif text-xl font-bold text-popover-foreground"
						id="feedback-confirm-title"
					>
						{request.options.title}
					</h2>
					<p
						className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
						id="feedback-confirm-message"
					>
						{request.options.message}
					</p>
					<div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
						<Button
							disabled={isResolving}
							onClick={() => resolve(false)}
							ref={cancelButtonRef}
							type="button"
							variant="secondary"
						>
							{request.options.cancelLabel ?? '取消'}
						</Button>
						<Button
							disabled={isResolving}
							onClick={() => resolve(true)}
							type="button"
							variant={variant === 'danger' ? 'destructive' : 'primary'}
						>
							{request.options.confirmLabel ?? '確認'}
						</Button>
					</div>
				</div>
			)}
		</dialog>
	);
}
