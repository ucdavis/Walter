import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { FinjectorLink } from '@/components/project/FinjectorLink.tsx';
import { Currency } from '@/shared/Currency.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import type { ReactNode } from 'react';
import {
  AcademicCapIcon,
  BanknotesIcon,
  BellAlertIcon,
  ClipboardDocumentCheckIcon,
  IdentificationIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { ClockIcon } from '@heroicons/react/24/outline';

interface ProjectDetailsProps {
  actions?: ReactNode;
  summary: ProjectSummary;
}

const displayValue = (value: string | null) => value ?? 'Not provided';

const hasTimeline = (summary: ProjectSummary) =>
  Boolean(summary.awardStartDate || summary.awardEndDate);

const formatTimeline = (summary: ProjectSummary) =>
  `${formatDate(summary.awardStartDate)} - ${formatDate(summary.awardEndDate)}`;

export function ProjectDetails({ actions, summary }: ProjectDetailsProps) {
  return (
    <section className="section-margin">
      <div className="fancy-data mt-4">
        <dl className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <div className="flex flex-col">
            <IdentificationIcon className="w-4 h-4" />
            <dt className="stat-label">Project Number</dt>
            <dd className="stat-value">
              {/* Sponsored projects link to Finjector at the project level; internal
                  projects link per task in the Task Breakdown instead. */}
              {summary.isInternal ? (
                summary.projectNumber
              ) : (
                <FinjectorLink
                  org={summary.projectOwningOrgCode}
                  project={summary.projectNumber}
                  task={summary.taskNum}
                >
                  {summary.projectNumber}
                </FinjectorLink>
              )}
            </dd>
          </div>
          {hasTimeline(summary) && (
            <div className="flex flex-col">
              <ClockIcon className="w-4 h-4" />
              <dt className="stat-label">Timeline</dt>
              <dd className="stat-value">{formatTimeline(summary)}</dd>
            </div>
          )}

          <div className="flex flex-col">
            <BellAlertIcon className="w-4 h-4" />
            <dt className="stat-label">Status</dt>
            <dd className="stat-value">
              <div className="badge badge-soft badge-primary">
                {displayValue(summary.projectStatusCode)}
              </div>
            </dd>
          </div>
          <div className="flex flex-col">
            <UserIcon className="w-4 h-4" />
            <dt className="stat-label">Project Manager</dt>
            <dd className="stat-value">{displayValue(summary.pm)}</dd>
          </div>
          <div className="flex flex-col">
            <AcademicCapIcon className="w-4 h-4" />
            <dt className="stat-label">Principal Investigator</dt>
            <dd className="stat-value">{displayValue(summary.pi)}</dd>
          </div>
          <div className="flex flex-col">
            <ClipboardDocumentCheckIcon className="w-4 h-4" />
            <dt className="stat-label">Total Budget</dt>
            <dd className="stat-value">
              <Currency value={summary.totals.budget} />
            </dd>
          </div>
          <div className="flex flex-col">
            <BanknotesIcon className="w-4 h-4" />
            <dt className="stat-label">
              <TooltipLabel
                label="Balance"
                tooltip={tooltipDefinitions.balance}
              />
            </dt>
            <dd className="stat-value">
              <Currency value={summary.totals.balance} />
            </dd>
          </div>
        </dl>
      </div>
      {actions ? (
        <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
