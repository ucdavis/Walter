import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';
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
  summary: ProjectSummary;
}

const displayValue = (value: string | null) => value ?? 'Not provided';

export function ProjectDetails({ summary }: ProjectDetailsProps) {
  return (
    <section className="section-margin">
      <div className="fancy-data mt-4">
        <dl className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <div className="flex flex-col">
            <IdentificationIcon className="w-4 h-4" />
            <dt className="stat-label">Project Number</dt>
            <dd className="stat-value">{summary.projectNumber}</dd>
          </div>
          <div className="flex flex-col">
            <ClockIcon className="w-4 h-4" />
            <dt className="stat-label">Project Start</dt>
            <dd className="stat-value">{formatDate(summary.awardStartDate)}</dd>
          </div>
          <div className="flex flex-col">
            <ClockIcon className="w-4 h-4" />
            <dt className="stat-label">Project End</dt>
            <dd className="stat-value">{formatDate(summary.awardEndDate)}</dd>
          </div>

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
            <dt className="stat-label">Balance</dt>
            <dd className="stat-value text-success font-proxima-bold">
              <Currency value={summary.totals.balance} />
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
