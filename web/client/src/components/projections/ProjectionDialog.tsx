import { useEffect, useId, useRef, type ReactNode } from 'react';

export function ProjectionDialog({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, []);
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
      <div className="modal-box">
        <h2 className="text-xl font-bold" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
