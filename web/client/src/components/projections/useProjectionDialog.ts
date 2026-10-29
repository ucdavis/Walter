import { useEffect, useRef } from 'react';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll.ts';

export function useProjectionDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useLockBodyScroll(true);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return ref;
}
