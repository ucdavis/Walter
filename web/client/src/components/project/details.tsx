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
      <h2 className="h2">Project Details</h2>
      <p className="text-base">
        Financial snapshot for <strong>{summary.projectName}</strong>. This view
        consolidates funding, expenses, and responsibilities for quick
        reference.
      </p>
      <div className="grid grid-cols-5 gap-4 mt-4">
        <div>
          <div className="h5">Start Date</div>
          <div className="text-base">{formatDate(summary.awardStartDate)}</div>
        </div>
        <div>
          <div className="h5">End Date</div>
          <div className="text-base">{formatDate(summary.awardEndDate)}</div>
        </div>
        <div>
          <div className="h5">PM</div>
          <div className="text-base text-primary-color underline cursor-pointer">
            {displayValue(summary.pm)}
          </div>
        </div>
        <div>
          <div className="h5">PI</div>
          <div className="text-base text-primary-color underline cursor-pointer">
            {displayValue(summary.pi)}
          </div>
        </div>
        <div>
          <div className="h5">ID</div>
          <div className="text-base">{summary.projectNumber}</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-4 mt-6">
        <div>
          <div className="h5">Co-PI</div>
          <div className="text-base">{displayValue(summary.copi)}</div>
        </div>
        <div>
          <div className="h5">PA</div>
          <div className="text-base">{displayValue(summary.pa)}</div>
        </div>
        <div>
          <div className="h5">Status</div>
          <div className="text-base">
            {displayValue(summary.projectStatusCode)}
          </div>
        </div>
        <div>
          <div className="h5">Total Budget</div>
          <Currency value={summary.totals.budget} />
        </div>
        <div>
          <div className="h5">Balance</div>
          <Currency value={summary.totals.balance} />
        </div>
      </div>
    </section>
  );
}
