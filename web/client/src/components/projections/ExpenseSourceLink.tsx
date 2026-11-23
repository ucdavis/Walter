import { projectionExpenseSourceTooltip } from '@/shared/tooltips.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { isSponsoredProject, sourceLabel } from '@/lib/projectionSources.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

export function ExpenseSourceLink({
  onSelect,
  source,
}: {
  onSelect: (id: number) => void;
  source: ProjectionFundingSource;
}) {
  const identity =
    [
      source.projectNumber && `Project ${source.projectNumber}`,
      source.taskNumber && `Task ${source.taskNumber}`,
    ]
      .filter(Boolean)
      .join(' · ') || 'Planned funding';
  const taskName =
    source.taskName &&
    source.taskName !== source.name &&
    source.taskName !== source.projectName &&
    source.taskName !== source.taskNumber
      ? source.taskName
      : null;
  // Sponsored projects are shown by project only; their task adds nothing for the reader.
  const sponsored = isSponsoredProject(source);
  const label = sponsored
    ? source.name
    : source.sourceKind === 'Task' && source.taskNumber
      ? taskName || `Task ${source.taskNumber}`
      : source.name;
  const detail =
    (sponsored || label === `Task ${source.taskNumber}`) && source.projectNumber
      ? `Project ${source.projectNumber}`
      : identity;
  return (
    <TooltipLabel
      asChild
      label={
        <button
          aria-label={`View expenses for ${sourceLabel(source)}`}
          className="block max-w-56 text-left text-sm"
          onClick={() => onSelect(source.id)}
          type="button"
        >
          <span className="link link-hover line-clamp-2 font-medium text-primary">
            {label}
          </span>
          <span className="mt-1 block text-xs text-base-content/70">
            {detail}
          </span>
        </button>
      }
      tooltip={projectionExpenseSourceTooltip(sourceLabel(source), identity)}
    />
  );
}
