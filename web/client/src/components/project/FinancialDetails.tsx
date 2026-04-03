import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface FinancialDetailsProps {
  summary: ProjectSummary;
}

export function FinancialDetails({ summary }: FinancialDetailsProps) {
  return (
    <section className="section-margin">
      <h2 className="h2">Financial Details</h2>

      <dl className="grid gap-4 mt-4 mb-2 grid-cols-4">
        <div>
          <dd className="stat-label">Budget</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.budget} />
          </dt>
        </div>
        <div>
          <dd className="stat-label">Expense</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.expense} />
          </dt>
        </div>
        <div>
          <dd className="stat-label">
            <TooltipLabel
              drawerStyle="spotlight"
              label="Commitment"
              tooltip={tooltipDefinitions.commitment}
            />
          </dd>
          <dt className="stat-value">
            <Currency value={summary.totals.encumbrance} />
          </dt>
        </div>
        <div>
          <dd className="stat-label">
            <TooltipLabel
              drawerStyle="spotlight"
              label="Balance"
              tooltip={tooltipDefinitions.balance}
            />
          </dd>
          <dt className="stat-value">
            <Currency value={summary.totals.balance} />
          </dt>
        </div>
      </dl>
    </section>
  );
}
