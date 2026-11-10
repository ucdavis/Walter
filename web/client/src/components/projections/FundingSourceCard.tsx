import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { chartSeriesColor } from '@/shared/chartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { sourceLabel, sourcePlanningBalance } from '@/lib/projectionSources.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function FundingSourceCard({
  colorIndex,
  grouped = false,
  onEdit,
  onRemove,
  source,
}: {
  colorIndex: number;
  grouped?: boolean;
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
  source: ProjectionFundingSource;
}) {
  const project = source.projectName ?? source.projectNumber;
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
      className="min-w-0 rounded-lg border border-main-border bg-base-100 p-4"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-1.5 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: chartSeriesColor(colorIndex) }}
        />
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{title}</h3>
          {!grouped && source.projectName && source.projectName !== title && (
            <p className="mt-1 text-sm break-words text-base-content/70">
              {source.projectName}
            </p>
          )}
          {(!grouped || title !== `Task ${source.taskNumber ?? ''}`) && (
            <p className="mt-1 text-sm text-base-content/70">
              {!grouped &&
                source.projectNumber &&
                `Project ${source.projectNumber} · `}
              {source.taskNumber
                ? `Task ${source.taskNumber}`
                : source.sourceKind === 'Planned'
                  ? 'Planned funding'
                  : ''}
            </p>
          )}
          {!grouped &&
            source.taskName &&
            source.taskName !== title &&
            source.taskName !== source.taskNumber &&
            source.taskName !== project && (
              <p className="mt-1 text-sm break-words text-base-content/70">
                {source.taskName}
              </p>
            )}
        </div>
      </div>
      <p className="mt-3 text-sm text-base-content/70">
        {source.startDate && source.endDate
          ? `${source.startDate} to ${source.endDate}`
          : source.startDate
            ? `From ${source.startDate}`
            : source.endDate
              ? `Through ${source.endDate}`
              : 'No date limits'}
      </p>
      <p className="mt-3 text-sm text-base-content/70">
        Planning balance{' '}
        <span className="block text-xl font-semibold text-base-content tabular-nums">
          {formatCurrency(sourcePlanningBalance(source))}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          aria-label={`Edit ${sourceLabel(source)}`}
          className="btn btn-ghost btn-sm px-2 text-primary"
          onClick={() => onEdit(source.id)}
          type="button"
        >
          <PencilSquareIcon aria-hidden="true" className="size-4" />
          Edit details
        </button>
        <button
          aria-label={`Remove ${sourceLabel(source)}`}
          className="btn btn-ghost btn-sm px-2"
          onClick={() => onRemove(source.id)}
          type="button"
        >
          <TrashIcon aria-hidden="true" className="size-4" />
          Remove
        </button>
      </div>
    </article>
  );
}
