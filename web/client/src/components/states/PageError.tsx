import React from 'react';

type PageErrorProps = {
  children?: React.ReactNode;
};

export function PageError({ children }: PageErrorProps) {
  return (
    <div
      aria-label="Error"
      aria-live="polite"
      className="flex flex-col items-center justify-center"
      role="status"
    >
      {children && <div>{children}</div>}
    </div>
  );
}
