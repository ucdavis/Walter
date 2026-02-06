import WalterLoad from '@/shared/walterLoad.tsx';
import React from 'react';

type PageLoadingProps = {
  message?: React.ReactNode;
};

export function PageLoading({ message }: PageLoadingProps) {
  return (
    <div
      aria-label="Loading"
      aria-live="polite"
      className="mx-auto text-center mt-8"
      role="status"
    >
      <WalterLoad className="mx-auto w-32 h-32" />
      {message && <p className="text-center text-lg">{message}</p>}
    </div>
  );
}
