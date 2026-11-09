import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type {
  ProjectionOutlook,
  SourceOutlook,
} from '@/lib/projectionOutlook.ts';
import type { ProjectionNavigation } from '@/lib/projectionWorkspace.ts';

export function FundingOutlookNotice({
  onNavigate,
  outlook,
}: {
  onNavigate: (location: ProjectionNavigation) => void;
  outlook: ProjectionOutlook;
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
      className="mt-4 space-y-3 rounded-box border border-warning/50 bg-warning/5 p-4 text-sm"
    >
      {first && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-error">Projected shortfall</p>
            <p className="mt-1">
              {outlook.shortfallSources.length}{' '}
              {outlook.shortfallSources.length === 1
                ? 'source falls'
                : 'sources fall'}{' '}
              below zero. First in{' '}
              {fundingMonthLabel(first.firstShortfallMonth!)}. Balances remain
              separate, even when grouped by project.
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() =>
              onNavigate({ section: 'overview', source: first.source.id })
            }
            type="button"
          >
            Explore {first.label}
          </button>
        </div>
      )}
      {(gaps > 0 || overlaps > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            {gaps > 0 &&
              `${gaps} ${gaps === 1 ? 'appointment has' : 'appointments have'} unallocated time`}
            {gaps > 0 && overlaps > 0 && '; '}
            {overlaps > 0 &&
              `${overlaps} ${overlaps === 1 ? 'appointment has' : 'appointments have'} overlapping allocations`}
            . Unallocated shares do not charge a funding source.
          </p>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onNavigate({ section: 'staffing' })}
            type="button"
          >
            Review staffing
          </button>
        </div>
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
