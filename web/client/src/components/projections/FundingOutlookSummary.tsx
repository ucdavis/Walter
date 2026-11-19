import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import type { Ref } from 'react';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import type {
  ProjectionOutlook,
  SourceOutlook,
} from '@/lib/projectionOutlook.ts';
import type { ProjectionNavigation } from '@/lib/projectionWorkspace.ts';

export function FundingOutlookNotice({
  minimizeRef,
  minimizeTooltipEnabled = true,
  onMinimize,
  onNavigate,
  onViewCategoryBalances,
  outlook,
  ref,
  summaryId,
}: {
  minimizeRef?: Ref<HTMLButtonElement>;
  minimizeTooltipEnabled?: boolean;
  onMinimize?: () => void;
  onNavigate: (location: ProjectionNavigation) => void;
  onViewCategoryBalances?: (id: number) => void;
  outlook: ProjectionOutlook;
  ref?: Ref<HTMLElement>;
  summaryId?: string;
}) {
  const firstOverall = outlook.shortfallSources.find(
    (source) => source.firstShortfallMonth === outlook.firstShortfallMonth
  );
  const firstCategory = outlook.categoryShortfallSources.find((source) =>
    source.categoryShortfalls.some(
      ({ firstMonth }) => firstMonth === outlook.firstCategoryShortfallMonth
    )
  );
  const categoryFirst = Boolean(
    firstCategory &&
      (!outlook.firstShortfallMonth ||
        outlook.firstCategoryShortfallMonth! <= outlook.firstShortfallMonth)
  );
  const first = categoryFirst ? firstCategory : firstOverall;
  const firstMonth = categoryFirst
    ? outlook.firstCategoryShortfallMonth
    : outlook.firstShortfallMonth;
  const gaps = outlook.gapAppointmentIds.length;
  const overlaps = outlook.overlapAppointmentIds.length;
  if (!first && !gaps && !overlaps) {
    return null;
  }
  return (
    <section
      aria-label="Funding summary"
      className={`alert alert-soft mb-6 grid grid-cols-[auto_1fr_auto] items-start gap-3 sm:flex text-sm ${first ? 'alert-error' : 'alert-warning'}`}
      ref={ref}
    >
      <ExclamationTriangleIcon
        aria-hidden="true"
        className={`mt-0.5 size-5 shrink-0 ${first ? 'text-error' : 'text-warning'}`}
        data-funding-summary-icon
      />
      <div className="col-span-3 row-start-2 min-w-0 flex-1 space-y-3">
        {first && (
          <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-error">
                {categoryFirst
                  ? 'First category budget shortfall'
                  : 'First funding shortfall'}
                : {fundingMonthLabel(firstMonth!)}
              </p>
              <p className="mt-1 font-semibold break-words">
                {first.source.name}
                {first.source.taskNumber
                  ? ` · Task ${first.source.taskNumber}`
                  : ''}
                {first.source.taskName &&
                first.source.taskName !== first.source.taskNumber &&
                first.source.taskName !== first.source.name
                  ? ` · ${first.source.taskName}`
                  : ''}
              </p>
              {categoryFirst && (
                <p className="mt-1">
                  {first.categoryShortfalls
                    .filter((shortfall) => shortfall.firstMonth === firstMonth)
                    .map(({ expenditureCategory }) => expenditureCategory)
                    .join(' · ')}
                </p>
              )}
              {outlook.categoryShortfallSources.length > 0 && (
                <p className="mt-1 text-base-content/80">
                  {outlook.categoryShortfallSources.length}{' '}
                  {outlook.categoryShortfallSources.length === 1
                    ? 'source has'
                    : 'sources have'}{' '}
                  category budget shortfalls. An overall surplus does not cover
                  these categories.
                  {outlook.categoryShortfallSources.every((source) =>
                    source.categoryShortfalls.every(
                      ({ recoveredMonth }) => recoveredMonth !== null
                    )
                  ) && ' These category balances recover by plan end.'}
                </p>
              )}
              {outlook.shortfallSources.length > 0 && (
                <p className="mt-1 text-base-content/80">
                  {outlook.shortfallSources.length}{' '}
                  {outlook.shortfallSources.length === 1
                    ? 'source falls'
                    : 'sources fall'}{' '}
                  below zero. Balances remain separate, even when grouped by
                  project.
                </p>
              )}
            </div>
            <button
              aria-label={
                categoryFirst
                  ? `View category balances for ${first.label}`
                  : `Explore ${first.label}`
              }
              className="btn btn-sm self-start sm:self-auto"
              onClick={() =>
                categoryFirst && onViewCategoryBalances
                  ? onViewCategoryBalances(first.source.id)
                  : onNavigate({ section: 'overview', source: first.source.id })
              }
              type="button"
            >
              {categoryFirst
                ? 'View category balances'
                : 'Explore funding source'}
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
        {(gaps > 0 || overlaps > 0) && (
          <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <p>
              {gaps > 0 &&
                `${gaps} ${gaps === 1 ? 'appointment has' : 'appointments have'} unallocated time`}
              {gaps > 0 && overlaps > 0 && '; '}
              {overlaps > 0 &&
                `${overlaps} ${overlaps === 1 ? 'appointment has' : 'appointments have'} overlapping allocations`}
              . Unallocated shares do not charge a funding source.
            </p>
            <button
              className="btn btn-sm self-start sm:self-auto"
              onClick={() => onNavigate({ section: 'staffing' })}
              type="button"
            >
              Review staffing
            </button>
          </div>
        )}
      </div>
      {onMinimize && (
        <TooltipLabel
          asChild
          focusEnabled={minimizeTooltipEnabled}
          hoverEnabled={minimizeTooltipEnabled}
          label={
            <button
              aria-controls={summaryId}
              aria-expanded="true"
              aria-label="Minimize funding summary"
              className="btn btn-ghost btn-sm col-start-3 row-start-1 shrink-0"
              onClick={onMinimize}
              ref={minimizeRef}
              type="button"
            >
              <ArrowsPointingInIcon aria-hidden="true" className="size-4" />
              Minimize
            </button>
          }
          open={minimizeTooltipEnabled ? undefined : false}
          tooltip={tooltipDefinitions.minimizeFundingSummary}
        />
      )}
    </section>
  );
}

export function FundingOutlookTotals({
  endMonth,
  outlook,
  selected,
}: {
  endMonth: string;
  outlook: ProjectionOutlook;
  selected: SourceOutlook | undefined;
}) {
  const scope = selected ?? outlook;
  return (
    <dl
      aria-label="Outlook totals"
      className="grid gap-4 border-y border-main-border bg-base-200 px-5 py-4 sm:grid-cols-3 sm:gap-6 xl:px-6"
    >
      <div>
        <dt className="text-sm text-base-content/80">
          Opening planning balance
        </dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(scope.planningBalance)}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-base-content/80">Planned spending</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(scope.forecast)}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-base-content/80">
          {selected ? 'Ending balance' : 'Combined ending balance'} ·{' '}
          {fundingMonthLabel(endMonth)}
        </dt>
        <dd
          className={`mt-1 text-2xl font-semibold tabular-nums ${scope.endBalance !== null && scope.endBalance < 0 ? 'text-error' : ''}`}
        >
          {scope.endBalance === null
            ? 'No contribution in this period'
            : formatCurrency(scope.endBalance)}
        </dd>
      </div>
    </dl>
  );
}
