import { useEffect, useRef, useState } from 'react';

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
						<button
							className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
							disabled={isResolving}
							onClick={() => resolve(false)}
							ref={cancelButtonRef}
							type="button"
						>
							{request.options.cancelLabel ?? '取消'}
						</button>
						<button
							className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${
								variant === 'danger'
									? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-destructive'
									: 'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-ring'
							}`}
							disabled={isResolving}
							onClick={() => resolve(true)}
							type="button"
						>
							{request.options.confirmLabel ?? '確認'}
						</button>
					</div>
				</div>
			)}
		</dialog>
	);
}
