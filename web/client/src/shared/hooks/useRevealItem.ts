import { useCallback, useRef } from 'react';

/** Reveals an item after React has rendered it, without moving focus out of an open modal. */
export function useRevealItem() {
  const items = useRef(new Map<string, HTMLElement>());
  const registerItem = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) {
        items.current.set(id, element);
      } else {
        items.current.delete(id);
      }
    },
    []
  );
  const revealItem = useCallback(
    (
      id: string,
      {
        block = 'start',
        focus = true,
      }: {
        block?: ScrollLogicalPosition;
        focus?: boolean;
      } = {}
    ) => {
      requestAnimationFrame(() => {
        const element = items.current.get(id);
        if (!element) {
          return;
        }
        element.scrollIntoView({
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block,
        });
        const dialog = document.querySelector('dialog[open]');
        if (focus && (!dialog || dialog.contains(element))) {
          element
            .querySelector<HTMLElement>(
              'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)'
            )
            ?.focus({ preventScroll: true });
        }
      });
    },
    []
  );
  return { registerItem, revealItem };
}
