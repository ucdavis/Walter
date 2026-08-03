import {
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import {
  buildFinjectorChartString,
  buildFinjectorUrl,
} from '@/lib/finjector.ts';
import { useEffect, useRef, useState } from 'react';

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
      <ArrowTopRightOnSquareIcon aria-hidden="true" className="w-4 h-4" />
    </a>
  );
}

/** Copies the PPM chart string that is used to open the project in Finjector. */
export function ChartStringCopyButton({
  org,
  project,
  task,
}: Omit<FinjectorLinkProps, 'children'>) {
  const [copied, setCopied] = useState(false);
  const resetFeedbackTimeout = useRef<number | undefined>(undefined);
  const chartString = buildFinjectorChartString(project, task, org);

  useEffect(
    () => () => {
      window.clearTimeout(resetFeedbackTimeout.current);
    },
    []
  );

  if (!chartString) {
    return null;
  }

  const copyChartString = async () => {
    try {
      await navigator.clipboard.writeText(chartString);
      setCopied(true);
      window.clearTimeout(resetFeedbackTimeout.current);
      resetFeedbackTimeout.current = window.setTimeout(
        () => setCopied(false),
        2000
      );
    } catch {
      setCopied(false);
    }
  };

  const tooltip = copied ? 'Chartstring copied' : 'Copy chartstring';

  return (
    <div className="tooltip tooltip-bottom" data-tip={tooltip}>
      <button
        aria-label={tooltip}
        className="btn btn-ghost btn-xs"
        onClick={copyChartString}
        type="button"
      >
        <ClipboardDocumentIcon aria-hidden="true" className="w-4 h-4" />
      </button>
    </div>
  );
}
