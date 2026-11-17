import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

export function ProjectionDialog({
  children,
  edgeToEdge = false,
  header,
  initialFocusRef,
  onClose,
  returnFocusTo,
  title,
  wide = false,
}: {
  children: ReactNode;
  edgeToEdge?: boolean;
  header?: (titleId: string) => ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  returnFocusTo?: () => HTMLElement | null;
  title: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      dialog.close();
      const target = returnFocusTo?.() ?? opener;
      if (target?.isConnected) {
        target.focus();
      }
    };
  }, [initialFocusRef, returnFocusTo]);
  return (
    <dialog
      aria-labelledby={titleId}
      className={
        edgeToEdge
          ? 'm-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-x-hidden overflow-y-auto rounded-lg border border-main-border bg-base-100 p-0 text-base text-base-content shadow-xl backdrop:bg-base-content/30'
          : `m-auto max-h-[calc(100dvh-2rem)] ${wide ? 'w-[min(64rem,calc(100vw-2rem))]' : 'w-[min(48rem,calc(100vw-2rem))]'} max-w-none overflow-x-hidden overflow-y-auto rounded-lg border border-main-border bg-base-100 p-0 text-base text-base-content shadow-xl backdrop:bg-base-content/30`
      }
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      ref={ref}
    >
      <div className="min-w-0 max-w-full">
        {edgeToEdge && header ? (
          header(titleId)
        ) : (
          <header className="border-b border-main-border bg-base-200 px-5 py-5 sm:px-6">
            {header ? (
              header(titleId)
            ) : (
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl font-semibold" id={titleId}>
                  {title}
                </h2>
                <button
                  aria-label={`Close ${title.toLowerCase()}`}
                  className="btn btn-ghost btn-sm btn-square"
                  onClick={onClose}
                  type="button"
                >
                  <XMarkIcon aria-hidden="true" className="size-5" />
                </button>
              </div>
            )}
          </header>
        )}
        {edgeToEdge ? (
          children
        ) : (
          <div className="p-5 sm:p-6 [&_.modal-action]:border-t [&_.modal-action]:border-main-border [&_.modal-action]:pt-4">
            {children}
          </div>
        )}
      </div>
    </dialog>
  );
}
