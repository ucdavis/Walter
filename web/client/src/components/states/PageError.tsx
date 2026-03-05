import { WalterDream } from '@/shared/WalterDream.tsx';
import React from 'react';

type PageErrorProps = {
  actions?: React.ReactNode;
  children?: React.ReactNode;
  detail?: React.ReactNode;
  message?: React.ReactNode;
  statusCode?: number | string;
  title?: React.ReactNode;
};

export function PageError({
  actions,
  children,
  detail,
  message,
  statusCode,
  title = 'Something went wrong',
}: PageErrorProps) {
  return (
    <div
      aria-label="Error"
      aria-live="polite"
      className="mx-auto mt-8 max-w-3xl text-center"
      role="alert"
    >
      <WalterDream className="mx-auto h-32 w-32" />
      <div className="mt-6 rounded-box border border-main-border bg-base-100 px-6 py-8 shadow-sm">
        {statusCode ? (
          <div className="badge badge-soft badge-error">{statusCode}</div>
        ) : null}
        <h1 className="mt-3 text-3xl font-semibold text-base-content">
          {title}
        </h1>
        {message ? (
          <p className="mt-4 text-lg text-base-content/85">{message}</p>
        ) : null}
        {detail ? (
          <p className="mt-2 text-sm text-base-content/65">{detail}</p>
        ) : null}
        {children ? <div className="mt-6">{children}</div> : null}
        {actions ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
