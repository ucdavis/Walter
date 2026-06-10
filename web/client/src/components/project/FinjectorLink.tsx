import { CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { buildFinjectorUrl } from '@/lib/finjector.ts';

interface FinjectorLinkProps {
  /** Text shown as the link label (e.g. the project number or task code). */
  children: React.ReactNode;
  org: string | null | undefined;
  project: string | null | undefined;
  task: string | null | undefined;
}

/**
 * Renders its children as a link to the Finjector chart-string details, with a
 * trailing external-link icon. Falls back to plain text when the chart string
 * can't be built (a required segment is missing).
 */
export function FinjectorLink({
  children,
  org,
  project,
  task,
}: FinjectorLinkProps) {
  const url = buildFinjectorUrl(project, task, org);

  if (!url) {
    return <>{children}</>;
  }

  return (
    <a
      className="link inline-flex items-center gap-1"
      href={url}
      rel="noopener noreferrer"
      target="_blank"
      title="View chart string in Finjector"
    >
      {children}
      <CurrencyDollarIcon aria-hidden="true" className="w-4 h-4" />
    </a>
  );
}
