import { PlanNotesField } from '@/components/projections/PlanDetailsFields.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { getSourceForecastWindow } from '@/lib/piProjection.ts';
import { sourceLabel, sourcePlanningBalance } from '@/lib/projectionSources.ts';
import {
  getFundingSourceOutlook,
  type ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

export function ProjectionReviewStep({
  draft,
  name,
  notes,
  notesDisabled,
  onNotesChange,
  results,
}: {
  draft: ProjectionDraft;
  name: string;
  notes: string;
  notesDisabled: boolean;
  onNotesChange: (notes: string) => void;
  results: ProjectionResults;
}) {
  return (
    <div className="mt-5 space-y-4">
      <h3 className="text-xl font-bold">{name.trim()}</h3>
      <p className="mt-2">
        Plan started {draft.seededAt.slice(0, 10)}. Source capture dates are
        shown below.
      </p>
      <p className="mt-1 text-sm">
        {draft.content.historyMonths}-month spending history.
      </p>
      <p className="text-sm">
        {draft.content.forecastMonths}-month forecast,{' '}
        {fundingMonthLabel(results.forecastWindow.startMonth)} through{' '}
        {fundingMonthLabel(results.forecastWindow.endMonth)}.
      </p>
      <PlanNotesField
        disabled={notesDisabled}
        onChange={onNotesChange}
        value={notes}
      />
      <h3 className="mt-6 text-xl font-bold">Funding outlook</h3>
      {draft.content.fundingSources.length === 0 && (
        <p className="mt-3">No eligible funding sources in this snapshot.</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {draft.content.fundingSources.map((source) => {
          const months = getFundingSourceOutlook(results.rows, source.id);
          const snapshotBalance = sourcePlanningBalance(source);
          const endBalance = months.at(-1)?.remaining ?? 0;
          const outside = getSourceForecastWindow(
            source,
            results.forecastWindow
          ).isBeyondForecast;
          return (
            <article
              className="rounded-box border border-base-300 p-5"
              key={source.id}
            >
              <h4 className="text-lg font-bold">{sourceLabel(source)}</h4>
              <p className="mt-1 text-sm">
                {source.sourceKind === 'Planned'
                  ? 'Planned funding'
                  : `Captured ${source.capturedAt.slice(0, 10)}`}
              </p>
              <p className="mt-1 text-sm">
                Through {source.endDate ?? 'the forecast horizon'}
              </p>
              {outside && (
                <p className="mt-2 text-sm">
                  This source starts after the forecast period and contributes
                  no forecast costs or balance in this period.
                </p>
              )}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>Planning balance</dt>
                  <dd>{formatCurrency(snapshotBalance)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Remaining forecast</dt>
                  <dd>
                    {formatCurrency(
                      months.reduce((sum, month) => sum + month.forecast, 0)
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 font-bold">
                  <dt>
                    Projected balance at{' '}
                    {fundingMonthLabel(results.forecastWindow.endMonth)}
                  </dt>
                  <dd className={endBalance < 0 ? 'text-error' : ''}>
                    {formatCurrency(endBalance)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
