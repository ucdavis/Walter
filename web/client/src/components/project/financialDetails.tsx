import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';

const ICONS: Record<string, string> = {
  Contract: '📄',
  Fringe: '🎁',
  Indirect: '💰',
  Salaries: '👤',
  Supplies: '📦',
  Travel: '✈️',
};

const resolveIcon = (category: string) => {
  const key = category.toLowerCase();
  if (key.includes('salary') || key.includes('wage')) {
    return ICONS.Salaries;
  }
  if (key.includes('fringe')) {
    return ICONS.Fringe;
  }
  if (key.includes('supplies') || key.includes('services')) {
    return ICONS.Supplies;
  }
  if (key.includes('contract')) {
    return ICONS.Contract;
  }
  if (key.includes('travel')) {
    return ICONS.Travel;
  }
  if (key.includes('indirect') || key.includes('overhead')) {
    return ICONS.Indirect;
  }
  return '💼';
};

interface FinancialDetailsProps {
  summary: ProjectSummary;
}

export function FinancialDetails({ summary }: FinancialDetailsProps) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="mb-4">Financial Details</h2>
      <div className="flex gap-8 mb-6">
        <div>
          <div className="text-sm text-gray-500 mb-1">Budget</div>
          <Currency value={summary.totals.budget} />
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Current Balance</div>
          <Currency value={summary.totals.balance} />
        </div>
      </div>
      <div className="flex justify-end mb-4">
        <button className="btn btn-outline btn-sm">
          <span className="mr-2">📄</span>
          View More
        </button>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600">
                Expenditure category name
              </th>
              <th className="text-right px-4 py-3 text-gray-600">Budget</th>
              <th className="text-right px-4 py-3 text-gray-600">Expense</th>
              <th className="text-right px-4 py-3 text-gray-600">
                Encumbrance
              </th>
              <th className="text-right px-4 py-3 text-gray-600">Balance</th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((category) => (
              <tr className="border-t border-gray-200" key={category.name}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{resolveIcon(category.name)}</span>
                    <span>{category.name}</span>
                  </div>
                </td>
                <td className="text-right px-4 py-3">
                  <Currency value={category.budget} />
                </td>
                <td className="text-right px-4 py-3">
                  <Currency value={category.expense} />
                </td>
                <td className="text-right px-4 py-3">
                  <Currency value={category.encumbrance} />
                </td>
                <td className="text-right px-4 py-3">
                  <Currency value={category.balance} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="px-4 py-3 font-semibold">TOTALS</td>
              <td className="text-right px-4 py-3">
                <Currency value={summary.totals.budget} />
              </td>
              <td className="text-right px-4 py-3">
                <Currency value={summary.totals.expense} />
              </td>
              <td className="text-right px-4 py-3">
                <Currency value={summary.totals.encumbrance} />
              </td>
              <td className="text-right px-4 py-3">
                <Currency value={summary.totals.balance} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
