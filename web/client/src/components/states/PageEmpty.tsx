import { WalterDream } from '@/shared/WalterDream.tsx';
import React from 'react';

type PageEmptyProps = {
  message?: React.ReactNode;
};

export function PageEmpty({ message }: PageEmptyProps) {
  return (
    <div
      aria-label="Empty data"
      aria-live="polite"
      className="mx-auto text-center mt-8"
      role="status"
    >
      <WalterDream className="mx-auto w-32 h-32" />
      {message && <p className="text-center text-lg mt-8">{message}</p>}
    </div>
  );
}
