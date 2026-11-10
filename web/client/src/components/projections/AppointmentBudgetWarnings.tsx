import { useState } from 'react';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { sourceLabel } from '@/lib/projectionSources.ts';
import {
  getAppointmentFundingShortfalls,
  type SourceFundingBalances,
  type SourceFundingShortfall,
} from '@/lib/projectionFundingBalances.ts';
import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function budgetShortfallLabel(warnings: SourceFundingShortfall[]) {
  const categories = new Set(
    warnings.flatMap(({ personnelDeficits }) =>
      personnelDeficits.map(({ category }) => category)
    )
  );
  return categories.size === 2
    ? 'Salary and fringe shortfall'
    : categories.has('salary')
      ? 'Salary budget shortfall'
      : categories.has('fringe')
        ? 'Fringe budget shortfall'
        : 'Projected funding shortfall';
}

const monthIndex = (month: string) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

function warningRanges(warnings: SourceFundingShortfall[]) {
  const entries = warnings.flatMap((warning) =>
    warning.basis === 'sponsored'
      ? warning.personnelDeficits.map((deficit) => ({
          label: deficit.category === 'salary' ? 'Salary' : 'Fringe',
          missingBudget: deficit.missingBudget,
          month: warning.month,
          remaining: deficit.remaining,
        }))
      : [
          {
            label: 'Source overall',
            missingBudget: false,
            month: warning.month,
            remaining: warning.remaining,
          },
        ]
  );
  const ranges: { label: string; months: typeof entries }[] = [];
  for (const label of new Set(entries.map((entry) => entry.label))) {
    for (const entry of entries
      .filter((entry) => entry.label === label)
      .sort((a, b) => a.month.localeCompare(b.month))) {
      const previous = ranges.at(-1);
      if (
        previous?.label === label &&
        monthIndex(entry.month) ===
          monthIndex(previous.months.at(-1)!.month) + 1
      ) {
        previous.months.push(entry);
      } else {
        ranges.push({ label, months: [entry] });
      }
    }
  }
  return ranges;
}

export function FundingWarningDetails({
  onViewSource,
  sources,
  warnings,
}: {
  onViewSource?: (id: number) => void;
  sources: ProjectionFundingSource[];
  warnings: SourceFundingShortfall[];
}) {
  return (
    <div className="space-y-4">
      {[...new Set(warnings.map(({ fundingSourceId }) => fundingSourceId))].map(
        (id) => {
          const source = sources.find((item) => item.id === id);
          const sourceWarnings = warnings.filter(
            ({ fundingSourceId }) => fundingSourceId === id
          );
          return (
            <section key={id}>
              <h4 className="font-semibold break-words">
                {source ? sourceLabel(source) : 'Funding source'}
              </h4>
              <div className="mt-2 space-y-3 text-sm">
                {warningRanges(sourceWarnings).map((range) => {
                  const first = range.months[0];
                  const last = range.months.at(-1)!;
                  const amounts = range.months
                    .filter(({ remaining }) => remaining < 0)
                    .map(({ remaining }) => Math.abs(remaining));
                  const smallest = Math.min(...amounts);
                  const largest = Math.max(...amounts);
                  const missing = range.months.some(
                    ({ missingBudget }) => missingBudget
                  );
                  return (
                    <div key={`${range.label}-${first.month}`}>
                      <p className="font-semibold">
                        {range.label} · {fundingMonthLabel(first.month)}
                        {last.month !== first.month
                          ? ` – ${fundingMonthLabel(last.month)}`
                          : ''}
                      </p>
                      {missing && (
                        <p className="text-error">
                          No {range.label.toLowerCase()} budget recorded
                        </p>
                      )}
                      {amounts.length > 0 && (
                        <p className="text-error">{`Shortfall ${formatCurrency(smallest)}${smallest !== largest ? ` – ${formatCurrency(largest)}` : ''}`}</p>
                      )}
                      {range.months.length > 1 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs">
                            Monthly amounts
                          </summary>
                          <dl className="mt-1 space-y-1">
                            {range.months.map((month) => (
                              <div
                                className="flex justify-between gap-3"
                                key={month.month}
                              >
                                <dt>{fundingMonthLabel(month.month)}</dt>
                                <dd>
                                  {month.missingBudget
                                    ? `${month.remaining < 0 ? `${formatCurrency(month.remaining)} · ` : ''}No budget recorded`
                                    : formatCurrency(month.remaining)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
              {onViewSource && (
                <button
                  className="btn btn-link btn-sm mt-2 h-auto px-0"
                  onClick={() => onViewSource(id)}
                  type="button"
                >
                  {sourceWarnings[0]?.basis === 'sponsored'
                    ? 'View category balances'
                    : 'View funding outlook'}
                </button>
              )}
            </section>
          );
        }
      )}
      <p className="text-xs text-base-content/70">
        Allocations and forecast costs remain unchanged.
      </p>
    </div>
  );
}

export function AppointmentBudgetWarnings({
  months,
  onViewSource,
  sourceBalances,
  sources,
}: {
  months: AppointmentFundingMonth[];
  onViewSource?: (id: number) => void;
  sourceBalances: SourceFundingBalances;
  sources: ProjectionFundingSource[];
}) {
  const [openBasis, setOpenBasis] = useState<'sponsored' | 'general' | null>(
    null
  );
  const warnings = getAppointmentFundingShortfalls(months, sourceBalances);
  const unknownIds = [
    ...new Set(
      months.flatMap(({ shares }) =>
        shares
          .filter(
            ({ fundingSourceId, percent }) =>
              percent > 0 &&
              fundingSourceId !== null &&
              sourceBalances.get(fundingSourceId)?.basis === 'unknown'
          )
          .map(({ fundingSourceId }) => fundingSourceId!)
      )
    ),
  ];
  return (
    <>
      {openBasis && (
        <ProjectionDialog
          onClose={() => setOpenBasis(null)}
          title={budgetShortfallLabel(
            warnings.filter(({ basis }) => basis === openBasis)
          )}
        >
          <div className="mt-4">
            <FundingWarningDetails
              onViewSource={
                onViewSource
                  ? (id) => {
                      setOpenBasis(null);
                      onViewSource(id);
                    }
                  : undefined
              }
              sources={sources}
              warnings={warnings.filter(({ basis }) => basis === openBasis)}
            />
          </div>
          <div className="modal-action">
            <button
              className="btn"
              onClick={() => setOpenBasis(null)}
              type="button"
            >
              Close
            </button>
          </div>
        </ProjectionDialog>
      )}
      {(['sponsored', 'general'] as const).map((basis) => {
        const matching = warnings.filter((warning) => warning.basis === basis);
        return (
          matching.length > 0 && (
            <TooltipLabel
              asChild
              key={basis}
              label={
                <button
                  aria-haspopup="dialog"
                  className="badge badge-error badge-soft h-auto gap-1 py-1 text-left"
                  onClick={() => setOpenBasis(basis)}
                  type="button"
                >
                  <ExclamationTriangleIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
                  {budgetShortfallLabel(matching)}
                </button>
              }
              tooltip={
                <FundingWarningDetails sources={sources} warnings={matching} />
              }
              variant="card"
            />
          )
        );
      })}
      {unknownIds.length > 0 && (
        <TooltipLabel
          asChild
          clickToOpen
          label={
            <button
              className="badge badge-neutral badge-soft h-auto py-1"
              type="button"
            >
              Funding basis unknown
            </button>
          }
          tooltip={
            <div>
              <p>
                Salary and fringe budget restrictions cannot be determined for
                these sources:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {unknownIds.map((id) => (
                  <li key={id}>
                    {sourceLabel(sources.find((source) => source.id === id)!)}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                The source overall balance is still available in its outlook.
              </p>
            </div>
          }
          variant="card"
        />
      )}
    </>
  );
}
