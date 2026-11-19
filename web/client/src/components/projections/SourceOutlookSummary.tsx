import type { Ref } from 'react';
import { SourceCategoryShortfallWarning } from '@/components/projections/SourceCategoryShortfallWarning.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatProjectionCurrency as money } from '@/components/projections/projectionFormatting.ts';
import { FRINGE_CATEGORY, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import type { SourceOutlook } from '@/lib/projectionOutlook.ts';
import type { ProjectionNavigation } from '@/lib/projectionWorkspace.ts';

const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });

export function SourceOutlookHeader({
  headingRef,
  onNavigate,
  onViewCategoryBalances,
  outlook,
  planStartDate,
}: {
  headingRef?: Ref<HTMLHeadingElement>;
  onNavigate: (location: ProjectionNavigation) => void;
  onViewCategoryBalances: (id: number) => void;
  outlook: SourceOutlook;
  planStartDate: string;
}) {
  const { source } = outlook;
  const dates = [
    source.startDate && source.startDate > planStartDate
      ? `Funding starts ${dateLabel(source.startDate)}`
      : null,
    source.endDate ? `Funding ends ${dateLabel(source.endDate)}` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-2">
      <h2
        className="scroll-mt-24 text-xl font-semibold break-words"
        ref={headingRef}
        tabIndex={-1}
      >
        {outlook.label}
      </h2>
      {dates.length > 0 && (
        <p className="text-sm text-base-content/80">{dates.join(' · ')}</p>
      )}
      {(outlook.firstShortfallMonth ||
        outlook.categoryShortfalls.length === 0) && (
        <p
          className={`text-sm ${outlook.firstShortfallMonth ? 'text-error' : 'text-base-content/80'}`}
        >
          {outlook.firstShortfallMonth
            ? `First below zero in ${fundingMonthLabel(outlook.firstShortfallMonth)}`
            : outlook.outside
              ? 'Outside forecast period. Its entered funding and allocations remain saved.'
              : outlook.endBalance === null
                ? 'No forecast data in this period'
                : outlook.fundingBasis === 'unknown'
                  ? 'Overall balance stays within funding; category budgets unverified'
                  : 'Stays within funding throughout this plan'}
        </p>
      )}
      <SourceCategoryShortfallWarning
        onView={onViewCategoryBalances}
        outlook={outlook}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          className="btn btn-sm"
          onClick={() => onNavigate({ section: 'funding', source: source.id })}
          type="button"
        >
          Edit funding source
        </button>
        <button
          className="btn btn-sm"
          onClick={() => onNavigate({ section: 'expenses', source: source.id })}
          type="button"
        >
          Edit other expenses
        </button>
      </div>
    </div>
  );
}

export function SourceForecastCosts({ outlook }: { outlook: SourceOutlook }) {
  const salary =
    outlook.categories.find(
      ({ expenditureCategory }) => expenditureCategory === SALARY_CATEGORY
    )?.forecast ?? 0;
  const fringe =
    outlook.categories.find(
      ({ expenditureCategory }) => expenditureCategory === FRINGE_CATEGORY
    )?.forecast ?? 0;
  const amounts = [
    { amount: salary, label: 'Salary' },
    { amount: fringe, label: 'Fringe' },
    ...(outlook.staffFees !== 0
      ? [{ amount: outlook.staffFees, label: 'Staff fees' }]
      : []),
    {
      amount: outlook.forecast - salary - fringe - outlook.staffFees,
      label: 'Other expenses',
    },
  ];
  return (
    <dl
      aria-label="Forecast spending breakdown"
      className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-3 text-sm xl:px-6"
    >
      {amounts.map(({ amount, label }) => (
        <div className="flex items-baseline gap-2" key={label}>
          <dt className="text-base-content/70">{label}</dt>
          <dd className="font-semibold tabular-nums">{money(amount)}</dd>
        </div>
      ))}
    </dl>
  );
}
