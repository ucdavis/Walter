import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import type { SourceOutlook } from '@/lib/projectionOutlook.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';

export function SourceCategoryShortfallWarning({
  onView,
  outlook,
}: {
  onView: (id: number) => void;
  outlook: SourceOutlook;
}) {
  const firstMonth = outlook.categoryShortfalls
    .map(({ firstMonth }) => firstMonth)
    .sort()[0];
  if (!firstMonth) {
    return null;
  }
  return (
    <TooltipLabel
      asChild
      label={
        <button
          aria-label={`View category shortfalls for ${outlook.label}`}
          className="inline-flex items-center gap-1.5 text-left text-sm text-error underline decoration-dotted underline-offset-4"
          onClick={() => onView(outlook.source.id)}
          type="button"
        >
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="size-4 shrink-0"
          />
          Category shortfall · {fundingMonthLabel(firstMonth)}
        </button>
      }
      tooltip={
        <ul className="space-y-2">
          {outlook.categoryShortfalls.map((shortfall) => (
            <li key={shortfall.expenditureCategory}>
              <p className="font-semibold">{shortfall.expenditureCategory}</p>
              <p>
                {shortfall.missingBudget
                  ? 'No budget recorded'
                  : 'First shortfall'}
                {' · '}
                {fundingMonthLabel(shortfall.firstMonth)}
              </p>
            </li>
          ))}
        </ul>
      }
      variant="card"
    />
  );
}
