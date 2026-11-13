import { hasSourceCategoryBudget } from '@/lib/projectionBudgets.ts';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import {
  getSourceFundingBasis,
  type SourceFundingMonth,
} from '@/lib/projectionFundingBalances.ts';
import { SALARY_CATEGORY, FRINGE_CATEGORY } from '@/lib/piProjection.ts';
import { budgetShortfallLabel } from '@/components/projections/AppointmentBudgetWarnings.tsx';
import { sourcePlanningBalance } from '@/lib/projectionSources.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  style: 'percent',
});

export function FundingSourceTooltip({
  balance,
  color,
  month,
  outside,
  share,
  source,
}: {
  balance?: SourceFundingMonth;
  color: string;
  month: string;
  outside: boolean;
  share: number;
  source?: ProjectionFundingSource;
}) {
  const basis = source ? getSourceFundingBasis(source) : null;
  const shortfall =
    source &&
    balance &&
    (basis === 'categories'
      ? balance.personnelDeficits.length > 0
      : basis === 'general' && balance.remaining < 0);
  const warningLabel =
    balance && basis === 'categories'
      ? budgetShortfallLabel([
          {
            basis,
            fundingSourceId: source!.id,
            month,
            personnelDeficits: balance.personnelDeficits,
            remaining: balance.remaining,
          },
        ])
      : 'Projected funding shortfall';
  const categoryValue = (
    category: string,
    key: 'salary' | 'fringe',
    value: number | undefined
  ) => {
    if (!balance) {
      return 'No forecast for this month';
    }
    if (!source || !hasSourceCategoryBudget(source, category)) {
      return balance.personnelDeficits.some(
        (deficit) => deficit.category === key && deficit.missingBudget
      )
        ? `${value !== undefined && value < 0 ? `${formatCurrency(value)} · ` : ''}No ${key} budget recorded`
        : '—';
    }
    return formatCurrency(value ?? 0);
  };
  const fields = [
    { label: 'Average appointment share', value: percent.format(share) },
    {
      label: 'Source overall planning balance',
      value: source ? formatCurrency(sourcePlanningBalance(source)) : null,
    },
    {
      label: 'Source overall month-end balance',
      value: source
        ? balance === undefined
          ? 'No forecast for this month'
          : formatCurrency(balance.remaining)
        : null,
    },
    ...(basis === 'categories'
      ? [
          {
            label: 'Salary month-end balance',
            value: categoryValue(
              SALARY_CATEGORY,
              'salary',
              balance?.salaryRemaining
            ),
          },
          {
            label: 'Fringe month-end balance',
            value: categoryValue(
              FRINGE_CATEGORY,
              'fringe',
              balance?.fringeRemaining
            ),
          },
        ]
      : []),
    {
      label: 'Project',
      value: source ? source.projectNumber : null,
    },
    { label: 'Project type', value: source?.projectType },
    {
      label: 'Task',
      value: source
        ? [
            ...new Set([source.taskNumber, source.taskName].filter(Boolean)),
          ].join(' · ')
        : null,
    },
    {
      label: 'Award',
      value: source
        ? [
            source.awardNumber,
            source.awardName !== source.name &&
            source.awardName !== source.projectName
              ? source.awardName
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : null,
    },
    {
      label: 'Plan funding dates',
      value: source
        ? `${formatDate(source.startDate, 'No start date')} to ${formatDate(source.endDate, 'No end date')}`
        : null,
    },
  ].filter(
    ({ value }) => value !== null && value !== undefined && value !== ''
  );
  return (
    <div>
      <p className="mb-2 font-sans text-base font-bold">
        {fundingMonthLabel(month)}
      </p>
      <p className="mb-3 flex items-start gap-2 font-sans font-bold">
        <span
          aria-hidden="true"
          className="mt-1 size-3 shrink-0 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 break-words">
          {outside ? 'Outside this plan' : source ? source.name : 'Unallocated'}
        </span>
      </p>
      {shortfall && (
        <p className="mb-3 flex items-start gap-2 font-semibold text-error">
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {warningLabel}
        </p>
      )}
      <dl className="space-y-2 border-t border-main-border pt-3">
        {fields.map(({ label, value }) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4"
            key={label}
          >
            <dt className="text-base-content/60">{label}</dt>
            <dd className="text-right font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-main-border pt-3 text-xs text-base-content/70">
        {outside
          ? 'This share is explicitly funded outside this plan. No funding balance is tracked here. '
          : basis === 'categories'
            ? 'Salary and fringe use separate category budgets. Source overall includes all expenditure categories.'
            : basis === 'general'
              ? 'Personnel uses this source’s overall available pool.'
              : 'Funding basis unknown. Salary and fringe budget restrictions cannot be determined.'}
      </p>
    </div>
  );
}
