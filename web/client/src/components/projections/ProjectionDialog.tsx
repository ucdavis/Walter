import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

export function ProjectionDialog({
  children,
  initialFocusRef,
  onClose,
  returnFocusTo,
  title,
  wide = false,
}: {
  children: ReactNode;
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
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={ref}
    >
      <div className={`modal-box${wide ? ' max-w-4xl' : ''}`}>
        <h2 className="text-xl font-bold" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
