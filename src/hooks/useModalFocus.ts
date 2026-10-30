import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useModalFocus(
	containerRef: RefObject<HTMLElement | null>,
	isOpen: boolean,
	onClose: () => void,
) {
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		const container = containerRef.current;
		if (!isOpen || !container) return;

		const previousFocus =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const focusableSelector =
			'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const getFocusableElements = () =>
			Array.from(
				container.querySelectorAll<HTMLElement>(focusableSelector),
			).filter((element) => element.getAttribute('aria-hidden') !== 'true');

		container.focus();

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				onCloseRef.current();
				return;
			}
			if (event.key !== 'Tab') return;

			const focusableElements = getFocusableElements();
			const first = focusableElements[0];
			const last = focusableElements.at(-1);
			const active = document.activeElement;
			if (!first || !last) {
				event.preventDefault();
				container.focus();
			} else if (
				event.shiftKey &&
				(active === first || !container.contains(active))
			) {
				event.preventDefault();
				last.focus();
			} else if (
				!event.shiftKey &&
				(active === last || !container.contains(active))
			) {
				event.preventDefault();
				first.focus();
			}
		};

		container.addEventListener('keydown', handleKeyDown);
		return () => {
			container.removeEventListener('keydown', handleKeyDown);
			if (previousFocus?.isConnected) previousFocus.focus();
		};
	}, [containerRef, isOpen]);
}
