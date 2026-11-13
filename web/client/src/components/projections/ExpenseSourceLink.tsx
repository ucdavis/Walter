import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { sourceLabel } from '@/lib/projectionSources.ts';
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
            {source.name}
          </span>
          <span className="mt-1 block text-xs text-base-content/70">
            {identity}
          </span>
        </button>
      }
      tooltip={`${sourceLabel(source)} · ${identity}`}
    />
  );
}
