import {
	CheckCircle2,
	CircleAlert,
	Info,
	TriangleAlert,
	X,
	type LucideIcon,
} from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
	description?: string;
	duration?: number;
}

export interface ToastApi {
	success(message: string, options?: ToastOptions): void;
	error(message: string, options?: ToastOptions): void;
	warning(message: string, options?: ToastOptions): void;
	info(message: string, options?: ToastOptions): void;
	dismiss(id: string): void;
}

interface ToastEntry {
	id: string;
	kind: ToastKind;
	message: string;
	description?: string;
}

interface ToastViewportProps {
	toasts: ToastEntry[];
	onDismiss: (id: string) => void;
}

const TOAST_STYLES: Record<
	ToastKind,
	{ icon: LucideIcon; container: string; iconClass: string; role: 'status' | 'alert' }
> = {
	success: {
		icon: CheckCircle2,
		container: 'border-emerald-800 bg-stone-950',
		iconClass: 'text-emerald-400',
		role: 'status',
	},
	error: {
		icon: CircleAlert,
		container: 'border-red-800 bg-stone-950',
		iconClass: 'text-red-400',
		role: 'alert',
	},
	warning: {
		icon: TriangleAlert,
		container: 'border-amber-800 bg-stone-950',
		iconClass: 'text-amber-400',
		role: 'status',
	},
	info: {
		icon: Info,
		container: 'border-cyan-900 bg-stone-950',
		iconClass: 'text-cyan-300',
		role: 'status',
	},
};

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
	if (toasts.length === 0) return null;

	return (
		<section
			aria-label="操作通知"
			className="pointer-events-none fixed inset-x-4 top-4 z-[60] ml-auto flex max-h-[70vh] max-w-md flex-col gap-3 overflow-y-auto sm:inset-x-auto sm:right-4"
		>
			{toasts.map((toast) => {
				const style = TOAST_STYLES[toast.kind];
				const Icon = style.icon;

				return (
					<div
						key={toast.id}
						aria-atomic="true"
						aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
						className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 text-stone-100 shadow-xl motion-reduce:transition-none ${style.container}`}
						role={style.role}
					>
						<Icon
							aria-hidden="true"
							className={`mt-0.5 size-5 shrink-0 ${style.iconClass}`}
						/>
						<div className="min-w-0 flex-1">
							<p className="font-medium break-words">{toast.message}</p>
							{toast.description && (
								<p className="mt-1 text-sm break-words text-stone-300">
									{toast.description}
								</p>
							)}
						</div>
						<button
							aria-label="關閉通知"
							className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 motion-reduce:transition-none"
							onClick={() => onDismiss(toast.id)}
							type="button"
						>
							<X aria-hidden="true" className="size-4" />
						</button>
					</div>
				);
			})}
		</section>
	);
}
