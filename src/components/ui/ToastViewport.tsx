import {
	CheckCircle2,
	CircleAlert,
	Info,
	TriangleAlert,
	X,
	type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui';

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
		container: 'border-success/70 bg-success/15',
		iconClass: 'text-success-foreground',
		role: 'status',
	},
	error: {
		icon: CircleAlert,
		container: 'border-destructive/70 bg-destructive/15',
		iconClass: 'text-destructive-foreground',
		role: 'alert',
	},
	warning: {
		icon: TriangleAlert,
		container: 'border-warning/70 bg-warning/15',
		iconClass: 'text-warning-foreground',
		role: 'status',
	},
	info: {
		icon: Info,
		container: 'border-info/70 bg-info/15',
		iconClass: 'text-info-foreground',
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
						className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 text-card-foreground shadow-xl motion-reduce:transition-none ${style.container}`}
						role={style.role}
					>
						<Icon
							aria-hidden="true"
							className={`mt-0.5 size-5 shrink-0 ${style.iconClass}`}
						/>
						<div className="min-w-0 flex-1">
							<p className="font-medium break-words">{toast.message}</p>
							{toast.description && (
								<p className="mt-1 text-sm break-words text-muted-foreground">
									{toast.description}
								</p>
							)}
						</div>
						<Button
							aria-label="關閉通知"
							onClick={() => onDismiss(toast.id)}
							type="button"
							variant="ghost"
							size="sm"
							prefixIcon={<X aria-hidden="true" />}
						/>
					</div>
				);
			})}
		</section>
	);
}
