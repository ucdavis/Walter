import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';
import { FinancialCategoriesTable } from '@/components/project/FinancialCategoriesTable.tsx';

interface FinancialDetailsProps {
  summary: ProjectSummary;
}

export function FinancialDetails({ summary }: FinancialDetailsProps) {
  return (
    <section className="section-margin">
      <h2 className="h2">Financial Details</h2>

      <dl className="grid grid-cols-5 gap-4 mt-4 mb-2">
        <div>
          <dd className="stat-label">Budget</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.budget} />
          </dt>
        </div>
        <div>
          <dd className="stat-label">Current Balance</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.balance} />
          </dt>
        </div>
      </dl>

      <div className="mt-4">
        <FinancialCategoriesTable categories={summary.categories} />
      </div>
    </section>
  );
}
