import type { PlanFunding } from '@/components/guidedProjections/defaults.ts';
import { money } from '@/components/guidedProjections/defaults.ts';
import { monthLabel } from '@/components/projections/projection.ts';
import { formatDate } from '@/lib/date.ts';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import {
  staffingProjectTooltipLabels as labels,
  tooltipDefinitions,
} from '@/shared/tooltips.ts';

export default function StaffFundingTooltip({
  fund,
  month,
  share,
}: {
  fund?: PlanFunding;
  month: string;
  share: {
    color: string;
    exhausted?: boolean;
    name: string;
    percent: number;
    remainingBalance?: number;
  };
}) {
  const project = fund?.serverProject;
  const fields = [
    { label: labels.percent, value: `${Number(share.percent.toFixed(1))}%` },
    { label: labels.projectNumber, value: project?.projectNumber },
    { label: labels.projectType, value: project?.projectType },
    {
      label: labels.award,
      value: [project?.awardNumber, project?.awardName]
        .filter(Boolean)
        .join(' · '),
    },
    {
      label: labels.task,
      value: [project?.taskNumber, project?.taskName]
        .filter(Boolean)
        .join(' · '),
    },
    { label: labels.description, value: !project ? fund?.description : null },
    {
      label: labels.fundingDates,
      value: fund
        ? `${formatDate(fund.startDate)} – ${formatDate(fund.endDate)}`
        : null,
    },
    {
      label: labels.availableBalance,
      value: fund ? money(fund.startingBalance) : null,
    },
    {
      label: labels.remainingBalance,
      value:
        share.remainingBalance !== undefined
          ? money(share.remainingBalance)
          : null,
    },
    {
      label: labels.indirectRate,
      value:
        fund && !project ? `${Number(fund.indirectRate.toFixed(1))}%` : null,
    },
  ].filter((field) => field.value);

  return (
    <div>
      <p className="mb-2 font-sans text-base font-bold">{monthLabel(month)}</p>
      <p className="mb-3 flex items-start gap-2 font-sans font-bold">
        <span
          aria-hidden="true"
          className="mt-1 size-3 shrink-0 rounded-sm"
          style={{ backgroundColor: share.color }}
        />
        <span className="min-w-0 break-words">{share.name}</span>
      </p>
      {share.exhausted && (
        <p className="mb-3 flex items-center gap-2 font-semibold text-error">
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="size-4 shrink-0"
          />
          {tooltipDefinitions.staffingFundingExhausted}
        </p>
      )}
      <dl className="space-y-2 border-t border-main-border pt-3">
        {fields.map((field) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4"
            key={field.label}
          >
            <dt className="text-base-content/60">{field.label}</dt>
            <dd className="text-right font-medium break-words">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {!fund && (
        <p className="mt-3 border-t border-main-border pt-3 text-base-content/60">
          {tooltipDefinitions.outsidePortfolioFunding}
        </p>
      )}
    </div>
  );
}
