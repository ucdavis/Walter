import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import type { SourceOutlook } from '@/lib/projectionOutlook.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { projectionCategoryShortfallTooltip } from '@/shared/tooltips.ts';

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
          <span>
            Category shortfall · {fundingMonthLabel(firstMonth)}
            {outlook.categoryShortfalls.every(
              ({ recoveredMonth }) => recoveredMonth !== null
            ) && <span className="block text-xs">Recovers by plan end</span>}
          </span>
        </button>
      }
      tooltip={
        <ul className="space-y-2">
          {outlook.categoryShortfalls.map((shortfall) => (
            <li key={shortfall.expenditureCategory}>
              <p className="font-semibold">{shortfall.expenditureCategory}</p>
              <p>
                {projectionCategoryShortfallTooltip({
                  firstMonth: fundingMonthLabel(shortfall.firstMonth),
                  missingBudget: shortfall.missingBudget,
                  recoveredMonth: shortfall.recoveredMonth
                    ? fundingMonthLabel(shortfall.recoveredMonth)
                    : null,
                })}
              </p>
            </li>
          ))}
        </ul>
      }
      variant="card"
    />
  );
}
