import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

interface AggieEnterpriseLinkProps {
  /** Text shown as the link label (e.g. the transaction number). */
  children: React.ReactNode;
  /** Deep link from `lib/aggieEnterprise.ts`; null renders the label as plain text. */
  href: string | null;
}

/**
 * Renders an external link into Aggie Enterprise. Falls back to plain text
 * when the deep link can't be built (the id is missing).
 */
export function AggieEnterpriseLink({
  children,
  href,
}: AggieEnterpriseLinkProps) {
  if (!href) {
    return <>{children}</>;
  }

  return (
    <a
      className="link inline-flex items-center gap-1"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
      <span
        className="tooltip tooltip-bottom"
        data-tip="Open in Aggie Enterprise"
      >
        <ArrowTopRightOnSquareIcon aria-hidden="true" className="w-4 h-4" />
      </span>
    </a>
  );
}
