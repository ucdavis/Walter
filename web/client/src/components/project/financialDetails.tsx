import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';

// Import Heroicons
import {
  AcademicCapIcon,
  PaperClipIcon,
  ArchiveBoxIcon,
  UserIcon,
  GlobeAltIcon,
  BoltIcon,
  BriefcaseIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';

const ICONS = {
  Contract: UserIcon,
  Default: BriefcaseIcon,
  Fringe: PaperClipIcon,
  Indirect: BoltIcon,
  Salaries: AcademicCapIcon,
  Supplies: ArchiveBoxIcon,
  Travel: GlobeAltIcon,
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
  return ICONS.Default;
};

interface FinancialDetailsProps {
  summary: ProjectSummary;
}

export function FinancialDetails({ summary }: FinancialDetailsProps) {
  return (
    <section className="section-margin">
      <div className="flex justify-between">
        <h2 className="h2">Financial Details</h2>
        <button className="btn btn-outline btn-primary btn-sm flex items-center gap-2">
          <BookOpenIcon className="w-4 h-4" />
          View More
        </button>
      </div>

      <div className="grid grid-cols-5 gap-4 mt-4 mb-6">
        <div>
          <div className="h5">Budget</div>
          <div className="h4">
            <Currency value={summary.totals.budget} />
          </div>
        </div>
        <div>
          <div className="h5">Current Balance</div>
          <div className="h4">
            <Currency value={summary.totals.balance} />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto mt-4">
        <table className="table walter-table">
          <thead>
            <tr>
              <th className="text-left">Category name</th>
              <th className="text-right">Budget</th>
              <th className="text-right">Expense</th>
              <th className="text-right">Encumbrance</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((category) => {
              const Icon = resolveIcon(category.name);
              return (
                <tr key={category.name}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5" />
                      <span>{category.name}</span>
                    </div>
                  </td>
                  <td className="text-right">
                    <Currency value={category.budget} />
                  </td>
                  <td className="text-right">
                    <Currency value={category.expense} />
                  </td>
                  <td className="text-right">
                    <Currency value={category.encumbrance} />
                  </td>
                  <td className="text-right">
                    <Currency value={category.balance} />
                  </td>
                </tr>
              );
            })}

            {/* Totals Row */}
            <tr className="totaltr">
              <td>TOTALS</td>
              <td className="text-right">
                <Currency value={summary.totals.budget} />
              </td>
              <td className="text-right">
                <Currency value={summary.totals.expense} />
              </td>
              <td className="text-right">
                <Currency value={summary.totals.encumbrance} />
              </td>
              <td className="text-right">
                <Currency value={summary.totals.balance} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
