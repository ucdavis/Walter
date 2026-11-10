import {
  BanknotesIcon,
  ListBulletIcon,
  PencilSquareIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { useMemo } from 'react';
import { FundingOutlookTotals } from '@/components/projections/FundingOutlookSummary.tsx';
import { PlanNotesField } from '@/components/projections/PlanDetailsFields.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import type { ProjectionResults } from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

export function ProjectionReviewStep({
  disabled,
  draft,
  name,
  notes,
  onEditStep,
  onNotesChange,
  results,
}: {
  disabled: boolean;
  draft: ProjectionDraft;
  name: string;
  notes: string;
  onEditStep: (step: 0 | 1 | 2) => void;
  onNotesChange: (notes: string) => void;
  results: ProjectionResults;
}) {
  const outlook = useMemo(
    () => buildProjectionOutlook(draft, results),
    [draft, results]
  );
  const gaps = outlook.gapAppointmentIds.length;
  const overlaps = outlook.overlapAppointmentIds.length;
  const sourceCount = draft.content.fundingSources.length;
  const appointmentCount = draft.content.appointments.length;
  const expenseCount = draft.content.fundingSources.reduce(
    (count, source) => count + source.expenses.length,
    0
  );
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl font-bold">{name.trim()}</h3>
        <p className="mt-1 text-sm">
          {draft.content.forecastMonths}-month forecast,{' '}
          {fundingMonthLabel(results.forecastWindow.startMonth)} through{' '}
          {fundingMonthLabel(results.forecastWindow.endMonth)}.
        </p>
      </div>
      <nav aria-label="Edit setup" className="grid gap-4 sm:grid-cols-3">
        {[
          {
            action: 'Edit funding sources',
            detail: 'Each source keeps its own balance and forecast.',
            icon: BanknotesIcon,
            step: 0 as const,
            title: 'Funding sources',
            value: `${sourceCount} funding ${sourceCount === 1 ? 'source' : 'sources'}`,
          },
          {
            action: 'Edit staffing',
            detail: 'Salary, benefits, dates, and funding allocations.',
            icon: UserGroupIcon,
            step: 1 as const,
            title: 'Staffing',
            value: `${appointmentCount} ${appointmentCount === 1 ? 'appointment' : 'appointments'}`,
          },
          {
            action: 'Edit other expenses',
            detail: `${draft.content.historyMonths}-month history for expense estimates.`,
            icon: ListBulletIcon,
            step: 2 as const,
            title: 'Other expenses',
            value: `${expenseCount} added ${expenseCount === 1 ? 'expense' : 'expenses'}`,
          },
        ].map(({ action, detail, icon: Icon, step, title, value }) => (
          <div
            className="flex flex-col rounded-lg border border-main-border p-4"
            key={step}
          >
            <h3 className="flex items-center gap-2 text-sm font-medium text-base-content/80">
              <Icon aria-hidden="true" className="size-5" />
              {title}
            </h3>
            <p className="mt-4 text-xl font-semibold">{value}</p>
            <p className="mt-2 text-sm text-base-content/80">{detail}</p>
            <button
              className="btn btn-ghost btn-sm mt-3 self-start px-0 text-primary"
              disabled={disabled}
              onClick={() => onEditStep(step)}
              type="button"
            >
              <PencilSquareIcon aria-hidden="true" className="size-4" />
              {action}
            </button>
          </div>
        ))}
      </nav>
      <FundingOutlookTotals
        endMonth={results.forecastWindow.endMonth}
        outlook={outlook}
        selected={undefined}
      />
      {(outlook.firstShortfallMonth || gaps > 0 || overlaps > 0) && (
        <section
          aria-label="Items to review"
          className="space-y-1 rounded-box border border-warning/50 bg-warning/5 p-4 text-sm"
        >
          {outlook.firstShortfallMonth && (
            <p>
              {outlook.shortfallSources.length}{' '}
              {outlook.shortfallSources.length === 1
                ? 'funding source falls'
                : 'funding sources fall'}{' '}
              below zero, first in{' '}
              {fundingMonthLabel(outlook.firstShortfallMonth)}.
            </p>
          )}
          {gaps > 0 && (
            <p>
              {gaps} {gaps === 1 ? 'appointment has' : 'appointments have'}{' '}
              unallocated time.
            </p>
          )}
          {overlaps > 0 && (
            <p>
              {overlaps}{' '}
              {overlaps === 1 ? 'appointment has' : 'appointments have'}{' '}
              overlapping allocations.
            </p>
          )}
          <p className="text-base-content/80">
            You can create this plan and make adjustments later.
          </p>
        </section>
      )}
      {outlook.sources.length === 0 ? (
        <p className="text-sm">No funding sources selected.</p>
      ) : (
        <details className="rounded-box border border-main-border">
          <summary className="cursor-pointer p-4 text-sm font-medium">
            Funding source details ({outlook.sources.length})
          </summary>
          <div className="px-4 pb-4">
            <p className="mb-3 text-sm text-base-content/80">
              Plan started {draft.seededAt.slice(0, 10)}.{' '}
              {draft.content.historyMonths}-month spending history.
            </p>
            <div
              aria-label="Funding source balances"
              className="overflow-x-auto"
              role="region"
              tabIndex={0}
            >
              <table className="table w-full text-sm">
                <caption className="sr-only">
                  Funding source balances at{' '}
                  {fundingMonthLabel(results.forecastWindow.endMonth)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Funding source</th>
                    <th className="text-right" scope="col">
                      Projected end balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outlook.sources.map((source) => (
                    <tr key={source.source.id}>
                      <th className="font-normal" scope="row">
                        <span className="font-medium">{source.label}</span>
                        <span className="mt-1 block text-xs text-base-content/80">
                          {source.source.sourceKind === 'Planned'
                            ? 'Planned funding'
                            : `Captured ${source.source.capturedAt.slice(0, 10)}`}
                        </span>
                        {source.outside ? (
                          <span className="mt-1 block">
                            Outside forecast period
                          </span>
                        ) : source.endBalance === null ? (
                          <span className="mt-1 block">
                            No forecast data in this period
                          </span>
                        ) : source.firstShortfallMonth ? (
                          <span className="mt-1 block text-error">
                            First shortfall{' '}
                            {fundingMonthLabel(source.firstShortfallMonth)}.
                            {source.endBalance >= 0 && ' Recovers by plan end.'}
                          </span>
                        ) : null}
                      </th>
                      <td
                        className={`text-right tabular-nums ${source.endBalance !== null && source.endBalance < 0 ? 'text-error' : ''}`}
                      >
                        {source.endBalance === null
                          ? 'Not included'
                          : formatCurrency(source.endBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
      <PlanNotesField
        disabled={disabled}
        onChange={onNotesChange}
        rows={2}
        value={notes}
      />
    </div>
  );
}
