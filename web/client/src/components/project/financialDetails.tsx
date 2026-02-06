import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { Currency } from '@/shared/Currency.tsx';
import { FinancialCategoriesTable } from '@/components/project/FinancialCategoriesTable.tsx';
import { Link } from '@tanstack/react-router';

import { BookOpenIcon } from '@heroicons/react/24/outline';

const financialCsvColumns = [
  { header: 'Category', key: 'name' as const },
  { header: 'Budget', key: 'budget' as const },
  { header: 'Expenses', key: 'expense' as const },
  { header: 'Encumbrance', key: 'encumbrance' as const },
  { header: 'Balance', key: 'balance' as const },
];

interface FinancialDetailsProps {
  summary: ProjectSummary;
}

export function FinancialDetails({ summary }: FinancialDetailsProps) {
  const isSingleProject = summary.projectNumber !== 'MULTIPLE';

  return (
    <section className="section-margin">
      <div className="flex justify-between">
        <h2 className="h2">Financial Details</h2>
        <div className="flex gap-2">
          <ExportDataButton
            columns={financialCsvColumns}
            data={summary.categories.map((c) => ({
              balance: c.balance,
              budget: c.budget,
              encumbrance: c.encumbrance,
              expense: c.expense,
              name: c.name,
            }))}
            filename="financial-details.csv"
          />
          {isSingleProject && (
            <Link
              className="btn btn-default btn-sm flex items-center gap-2"
              to="./transactions"
            >
              <BookOpenIcon className="w-4 h-4" />
              Transactions
            </Link>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-5 gap-4 mt-4 mb-6">
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
        <FinancialCategoriesTable
          categories={summary.categories}
          totals={summary.totals}
        />
      </div>
    </section>
  );
}
