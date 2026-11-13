import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import type { Ref } from 'react';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
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
  outlook,
  ref,
  summaryId,
}: {
  minimizeRef?: Ref<HTMLButtonElement>;
  minimizeTooltipEnabled?: boolean;
  onMinimize?: () => void;
  onNavigate: (location: ProjectionNavigation) => void;
  outlook: ProjectionOutlook;
  ref?: Ref<HTMLElement>;
  summaryId?: string;
}) {
  const first = outlook.shortfallSources.find(
    (source) => source.firstShortfallMonth === outlook.firstShortfallMonth
  );
  const gaps = outlook.gapAppointmentIds.length;
  const overlaps = outlook.overlapAppointmentIds.length;
  if (!first && !gaps && !overlaps) {
    return null;
  }
  return (
    <section
      aria-label="Funding summary"
      className={`mb-5 grid grid-cols-[auto_1fr_auto] items-start gap-3 sm:flex rounded-lg border p-4 text-sm ${first ? 'border-error/30 bg-error/5' : 'border-warning/50 bg-warning/5'}`}
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
                First funding shortfall:{' '}
                {fundingMonthLabel(first.firstShortfallMonth!)}
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
              <p className="mt-1 text-base-content/70">
                {outlook.shortfallSources.length}{' '}
                {outlook.shortfallSources.length === 1
                  ? 'source falls'
                  : 'sources fall'}{' '}
                below zero. Balances remain separate, even when grouped by
                project.
              </p>
            </div>
            <button
              aria-label={`Explore ${first.label}`}
              className="btn btn-outline btn-error btn-sm self-start sm:self-auto"
              onClick={() =>
                onNavigate({ section: 'overview', source: first.source.id })
              }
              type="button"
            >
              Explore funding source
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
              className="btn btn-outline btn-sm self-start sm:self-auto"
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
      className="grid gap-4 border-y border-base-300 bg-base-200/40 p-4 sm:grid-cols-3 sm:p-5"
    >
      <div>
        <dt className="text-sm text-base-content/70">
          {selected ? 'Planning balance' : 'Funding included in period'}
        </dt>
        <dd className="mt-1 text-xl font-semibold">
          {formatCurrency(scope.planningBalance)}
        </dd>
        {!selected && (
          <p className="mt-1 text-xs text-base-content/70">
            Sources keep their own capture and availability dates.
          </p>
        )}
      </div>
      <div>
        <dt className="text-sm text-base-content/70">Net forecast costs</dt>
        <dd className="mt-1 text-xl font-semibold">
          {formatCurrency(scope.forecast)}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-base-content/70">
          Projected balance at {fundingMonthLabel(endMonth)}
        </dt>
        <dd
          className={`mt-1 text-xl font-semibold ${scope.endBalance !== null && scope.endBalance < 0 ? 'text-error' : ''}`}
        >
          {scope.endBalance === null
            ? 'No contribution in this period'
            : formatCurrency(scope.endBalance)}
        </dd>
      </div>
    </dl>
  );
}
