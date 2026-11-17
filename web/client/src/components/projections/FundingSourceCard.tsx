import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { projectionSeriesColor as chartSeriesColor } from '@/components/projections/projectionFormatting.ts';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import { sourceLabel, sourcePlanningBalance } from '@/lib/projectionSources.ts';
import {
  getSourceForecastWindow,
  type ProjectionForecastWindow,
} from '@/lib/piProjection.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function FundingSourceCard({
  colorIndex,
  forecastWindow,
  grouped = false,
  onEdit,
  source,
}: {
  colorIndex: number;
  forecastWindow?: ProjectionForecastWindow;
  grouped?: boolean;
  onEdit: (id: number) => void;
  source: ProjectionFundingSource;
}) {
  const project = source.projectName ?? source.projectNumber;
  const window =
    forecastWindow && getSourceForecastWindow(source, forecastWindow);
  const outsideForecast =
    window && (window.isBeyondForecast || window.startMonth > window.endMonth);
  const futureStart =
    source.startDate &&
    forecastWindow &&
    source.startDate.slice(0, 7) > forecastWindow.startMonth;
  const taskTitle =
    source.taskName &&
    source.taskName !== project &&
    source.taskName !== source.taskNumber
      ? source.taskName
      : `Task ${source.taskNumber ?? ''}`;
  const title = grouped
    ? source.name !== project && source.name !== source.taskName
      ? source.name
      : taskTitle
    : source.name;
  return (
    <article
      aria-label={`${sourceLabel(source)} funding source`}
      className="relative min-w-0 scroll-mt-24 overflow-hidden rounded-lg border border-main-border bg-base-100"
    >
      <div className="flex h-full flex-col px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <h3
            className="line-clamp-2 h-[2lh] min-w-0 flex-1 text-lg font-semibold leading-snug break-words"
            title={title}
          >
            {title}
          </h3>
          <span
            aria-hidden="true"
            className="mt-2 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: chartSeriesColor(colorIndex) }}
          />
        </div>
        <div className="mt-auto mb-3 flex min-h-5 items-center justify-between gap-x-4 pt-2 text-sm text-base-content/80">
          <span className="min-w-0 truncate" title={sourceLabel(source)}>
            {source.taskNumber
              ? `${grouped ? '' : `Project ${source.projectNumber} · `}Task ${source.taskNumber}`
              : 'Planned funding'}
          </span>
          <span className="ms-auto shrink-0">
            {source.endDate
              ? `Ends ${fundingMonthLabel(source.endDate.slice(0, 7))}`
              : 'No end date'}
          </span>
        </div>
        {(futureStart || outsideForecast) && (
          <p className="mb-3 text-sm text-base-content/80">
            {futureStart &&
              `Available from ${fundingMonthLabel(source.startDate!.slice(0, 7))}`}
            {futureStart && outsideForecast && ' · '}
            {outsideForecast && 'Outside this forecast'}
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-main-border pt-3">
          <dl className="min-w-0">
            <dt className="text-sm text-base-content/80">
              {futureStart || outsideForecast
                ? 'Planning balance'
                : 'Available balance'}
            </dt>
            <dd
              className={`mt-0.5 text-xl font-semibold tabular-nums ${sourcePlanningBalance(source) < 0 ? 'text-error' : ''}`}
            >
              {formatCurrency(sourcePlanningBalance(source))}
            </dd>
          </dl>
          <button
            aria-haspopup="dialog"
            aria-label={`Edit ${sourceLabel(source)}`}
            className="btn btn-ghost btn-sm gap-2 text-primary"
            onClick={() => onEdit(source.id)}
            type="button"
          >
            Edit details
          </button>
        </div>
      </div>
    </article>
  );
}
