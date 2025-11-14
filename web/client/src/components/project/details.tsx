import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';

interface ProjectDetailsProps {
  summary: ProjectSummary;
}

const formatDate = (value: string | null) => {
  if (!value) {
    return 'Not provided';
  }

  const date = new Date(value);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const displayValue = (value: string | null) => value ?? 'Not provided';

export function ProjectDetails({ summary }: ProjectDetailsProps) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="mb-4">Project Details</h2>
      <p className="text-gray-600 text-sm mb-6">
        Financial snapshot for <strong>{summary.projectName}</strong>. This
        view consolidates funding, expenses, and responsibilities for quick
        reference.
      </p>
      <div className="grid grid-cols-5 gap-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Start Date</div>
          <div className="text-sm">{formatDate(summary.awardStartDate)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">End Date</div>
          <div className="text-sm">{formatDate(summary.awardEndDate)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">PM</div>
          <div className="text-sm text-blue-600 underline cursor-pointer">
            {displayValue(summary.pm)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">PI</div>
          <div className="text-sm text-blue-600 underline cursor-pointer">
            {displayValue(summary.pi)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">ID</div>
          <div className="text-sm">{summary.projectNumber}</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-4 mt-6">
        <div>
          <div className="text-xs text-gray-500 mb-1">Co-PI</div>
          <div className="text-sm">{displayValue(summary.copi)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">PA</div>
          <div className="text-sm">{displayValue(summary.pa)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Status</div>
          <div className="text-sm">{displayValue(summary.projectStatusCode)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Total Budget</div>
          <Currency className="text-sm" value={summary.totals.budget} />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Balance</div>
          <Currency className="text-sm" value={summary.totals.balance} />
        </div>
      </div>
    </section>
  );
}
