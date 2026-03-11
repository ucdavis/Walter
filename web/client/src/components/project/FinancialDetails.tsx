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

      <dl className={`grid gap-4 mt-4 mb-2 ${summary.isInternal ? 'grid-cols-6' : 'grid-cols-4'}`}>
        <div>
          <dd className="stat-label">Budget</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.budget} />
          </dt>
        </div>
        {summary.isInternal && (
          <>
            <div>
              <dd className="stat-label">Beg. Balance</dd>
              <dt className="stat-value">
                <Currency value={summary.totals.beginningBalance} />
              </dt>
            </div>
            <div>
              <dd className="stat-label">Revenue</dd>
              <dt className="stat-value">
                <Currency value={summary.totals.revenue} />
              </dt>
            </div>
          </>
        )}
        <div>
          <dd className="stat-label">Expense</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.expense} />
          </dt>
        </div>
        <div>
          <dd className="stat-label">Commitment</dd>
          <dt className="stat-value">
            <Currency value={summary.totals.encumbrance} />
          </dt>
        </div>
        <div>
          <dd className="stat-label">Balance</dd>
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
