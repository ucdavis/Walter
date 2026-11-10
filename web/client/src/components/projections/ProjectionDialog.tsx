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
          : 'modal'
      }
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={ref}
    >
      <div
        className={
          edgeToEdge
            ? 'min-w-0 max-w-full'
            : `modal-box rounded-xl border border-base-300 p-6${wide ? ' max-w-4xl' : ''}`
        }
      >
        {header ? (
          header(titleId)
        ) : (
          <h2 className="text-xl font-semibold" id={titleId}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </dialog>
  );
}
