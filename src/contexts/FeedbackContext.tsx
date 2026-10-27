/* eslint-disable react-refresh/only-export-components -- Context 同時匯出 Provider 與 Hook。 */
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import type { ToastOptions, ToastApi, ToastKind } from '@/components/ui/ToastViewport';
import { ToastViewport } from '@/components/ui/ToastViewport';
import {
	ConfirmDialog,
	type ConfirmOptions,
	type ConfirmRequest,
} from '@/components/ui/ConfirmDialog';

interface ToastEntry {
	id: string;
	kind: ToastKind;
	message: string;
	description?: string;
	duration: number;
}

interface FeedbackContextValue {
	toast: ToastApi;
	confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_TOAST_DURATIONS: Record<ToastKind, number> = {
	success: 4000,
	error: 8000,
	warning: 6000,
	info: 4000,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastEntry[]>([]);
	const [confirmQueue, setConfirmQueue] = useState<ConfirmRequest[]>([]);
	const toastIdRef = useRef(0);
	const confirmIdRef = useRef(0);
	const toastTimersRef = useRef(new Map<string, number>());
	const confirmQueueRef = useRef<ConfirmRequest[]>([]);

	const dismissToast = useCallback((id: string) => {
		const timer = toastTimersRef.current.get(id);
		if (timer !== undefined) {
			window.clearTimeout(timer);
			toastTimersRef.current.delete(id);
		}
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	const addToast = useCallback(
		(kind: ToastKind, message: string, options?: ToastOptions) => {
			const id = `feedback-toast-${++toastIdRef.current}`;
			const duration = options?.duration ?? DEFAULT_TOAST_DURATIONS[kind];
			setToasts((current) => [
				{
					id,
					kind,
					message,
					description: options?.description,
					duration: Math.max(0, duration),
				},
				...current,
			]);
		},
		[],
	);

	const toast = useMemo<ToastApi>(
		() => ({
			success: (message, options) => addToast('success', message, options),
			error: (message, options) => addToast('error', message, options),
			warning: (message, options) => addToast('warning', message, options),
			info: (message, options) => addToast('info', message, options),
			dismiss: dismissToast,
		}),
		[addToast, dismissToast],
	);

	useEffect(() => {
		const visibleIds = new Set(
			toasts.slice(0, MAX_VISIBLE_TOASTS).map((toastEntry) => toastEntry.id),
		);

		for (const [id, timer] of toastTimersRef.current) {
			if (!visibleIds.has(id)) {
				window.clearTimeout(timer);
				toastTimersRef.current.delete(id);
			}
		}

		for (const toastEntry of toasts.slice(0, MAX_VISIBLE_TOASTS)) {
			if (toastTimersRef.current.has(toastEntry.id)) continue;
			const timer = window.setTimeout(() => {
				toastTimersRef.current.delete(toastEntry.id);
				dismissToast(toastEntry.id);
			}, toastEntry.duration);
			toastTimersRef.current.set(toastEntry.id, timer);
		}
	}, [dismissToast, toasts]);

	const confirm = useCallback((options: ConfirmOptions) => {
		return new Promise<boolean>((resolve) => {
			const request: ConfirmRequest = {
				id: `feedback-confirm-${++confirmIdRef.current}`,
				options,
				resolve,
			};
			confirmQueueRef.current = [...confirmQueueRef.current, request];
			setConfirmQueue(confirmQueueRef.current);
		});
	}, []);

	const resolveConfirm = useCallback((id: string, result: boolean) => {
		const [current, ...remaining] = confirmQueueRef.current;
		if (!current || current.id !== id) return;

		confirmQueueRef.current = remaining;
		current.resolve(result);
		setConfirmQueue(remaining);
	}, []);

	useEffect(
		() => () => {
			for (const timer of toastTimersRef.current.values()) {
				window.clearTimeout(timer);
			}
			toastTimersRef.current.clear();

			const pendingRequests = confirmQueueRef.current;
			confirmQueueRef.current = [];
			for (const request of pendingRequests) {
				request.resolve(false);
			}
		},
		[],
	);

	const contextValue = useMemo(
		() => ({ toast, confirm }),
		[confirm, toast],
	);
	const currentConfirm = confirmQueue[0] ?? null;

	return (
		<FeedbackContext.Provider value={contextValue}>
			{children}
			<ToastViewport
				toasts={toasts.slice(0, MAX_VISIBLE_TOASTS)}
				onDismiss={dismissToast}
			/>
			<ConfirmDialog
				key={currentConfirm?.id ?? 'idle'}
				request={currentConfirm}
				onResolve={resolveConfirm}
			/>
		</FeedbackContext.Provider>
	);
}

export function useToast() {
	const context = useContext(FeedbackContext);
	if (!context) throw new Error('useToast 必須在 FeedbackProvider 內使用。');
	return context.toast;
}

export function useConfirm() {
	const context = useContext(FeedbackContext);
	if (!context) throw new Error('useConfirm 必須在 FeedbackProvider 內使用。');
	return context.confirm;
}
