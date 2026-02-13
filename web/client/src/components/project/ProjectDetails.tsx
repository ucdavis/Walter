import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';

interface ProjectDetailsProps {
  summary: ProjectSummary;
}

const displayValue = (value: string | null) => value ?? 'Not provided';

export function ProjectDetails({ summary }: ProjectDetailsProps) {
  return (
    <section className="section-margin">
      <h2 className="h2">Faculty Department Portfolio Report</h2>
      <div className="fancy-data mt-4">
        <dl className="grid grid-cols-1 md:grid-cols-4 gap-6 divide-y md:divide-y-0 divide-main-border">
          <div className="flex flex-col">
            <dt className="font-proxima-bold text-lg">Start</dt>
            <dd className="text-xl">{formatDate(summary.awardStartDate)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="font-proxima-bold text-lg">End</dt>
            <dd className="text-xl">{formatDate(summary.awardEndDate)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="font-proxima-bold text-lg">Total Budget</dt>
            <dd className="text-xl">
              <Currency value={summary.totals.budget} />
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="font-proxima-bold text-lg">Balance</dt>
            <dd className="text-xl text-success font-proxima-bold">
              <Currency value={summary.totals.balance} />
            </dd>
          </div>
        </dl>
        <hr className="border-main-border my-5" />
        <dl className="grid items-stretch gap-6 md:gap-8 grid-cols-1 md:grid-cols-3">
          <div className="flex flex-col">
            <div>
              <dt className="stat-label">Status</dt>
              <dd className="stat-value">
                <div className="badge badge-soft badge-primary">
                  {displayValue(summary.projectStatusCode)}
                </div>
              </dd>
            </div>
            <div>
              <dt className="stat-label">ID</dt>
              <dd className="stat-value">{summary.projectNumber}</dd>
            </div>
          </div>
          <div className="flex flex-col">
            <div>
              <dt className="stat-label">PM</dt>
              <dd className="stat-value">{displayValue(summary.pm)}</dd>
            </div>
          </div>
          <div className="flex flex-col">
            <div>
              <dt className="stat-label">PI</dt>
              <dd className="stat-value">{displayValue(summary.pi)}</dd>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}
