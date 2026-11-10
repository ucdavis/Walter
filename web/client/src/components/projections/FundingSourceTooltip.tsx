import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { sourcePlanningBalance } from '@/lib/projectionSources.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  style: 'percent',
});

export function FundingSourceTooltip({
  color,
  month,
  outside,
  remaining,
  share,
  source,
}: {
  color: string;
  month: string;
  outside: boolean;
  remaining?: number;
  share: number;
  source?: ProjectionFundingSource;
}) {
  const fields = [
    { label: 'Average appointment share', value: percent.format(share) },
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
    {
      label: 'Planning balance',
      value: source ? formatCurrency(sourcePlanningBalance(source)) : null,
    },
    {
      label: 'Projected month-end balance',
      value: source
        ? remaining === undefined
          ? 'No forecast for this month'
          : formatCurrency(remaining)
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
      {source && remaining !== undefined && remaining < 0 && (
        <p className="mb-3 flex items-start gap-2 font-semibold text-error">
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          Projected month-end balance is below zero.
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
          : 'Balances include all expenditure categories for this source.'}
      </p>
    </div>
  );
}
