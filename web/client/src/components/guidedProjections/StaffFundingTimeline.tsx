import type {
  PlanStaff,
  ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';
import { staffFundingMonths } from '@/components/guidedProjections/staffFundingTimeline.ts';
import { monthLabel } from '@/components/projections/projection.ts';

const percent = (value: number) => `${Number(value.toFixed(1))}%`;

export default function StaffFundingTimeline({
  onEdit,
  person,
  plan,
}: {
  onEdit: (month: string) => void;
  person: PlanStaff;
  plan: ProjectionPlan;
}) {
  const months = staffFundingMonths(person, plan);
  return (
    <div className="min-w-0 border-t border-main-border p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
        <span className="font-medium">Monthly project funding</span>
        <span>
          {percent((person.serverJob?.fte ?? 1) * 100)} appointment · Select a
          month to edit shares
        </span>
      </div>
      <div
        aria-label={`${person.name} monthly funding`}
        className="overflow-x-auto pb-1 focus-visible:outline-2 focus-visible:outline-primary"
        role="region"
        tabIndex={0}
      >
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${months.length}, minmax(3.75rem, 1fr))`,
          }}
        >
          {months.map(
            ({ active, appointment, month, open, over, shares, total }) => {
              const status = !person.included
                ? 'Excluded'
                : !active
                  ? 'Not active'
                  : '';
              const summary =
                status ||
                [
                  ...shares.map(
                    (share) => `${percent(share.percent)} ${share.name}`
                  ),
                  ...(open > 0.000_01 ? [`${percent(open)} open`] : []),
                  ...(over > 0.000_01
                    ? [`${percent(over)} over appointment`]
                    : []),
                ].join(', ');
              const scale = Math.max(appointment, total, 1);
              return (
                <button
                  aria-haspopup="dialog"
                  aria-label={`${person.name}, ${monthLabel(month)}: ${summary}. Edit funding shares`}
                  className="group/month min-w-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  key={month}
                  onClick={() => onEdit(month)}
                  type="button"
                >
                  <span className="mb-2 block text-center text-xs font-medium text-base-content/70">
                    {monthLabel(month)}
                  </span>
                  <span
                    className={`flex h-28 flex-col overflow-hidden rounded-sm border bg-base-200 transition-colors group-hover/month:border-primary ${over > 0.000_01 ? 'border-error' : 'border-main-border'}`}
                  >
                    {status ? (
                      <span className="m-auto px-1 text-center text-xs text-base-content/50">
                        {status}
                      </span>
                    ) : (
                      <>
                        {shares.map((share) => (
                          <span
                            className="block shrink-0 overflow-hidden px-1.5 text-[11px] leading-tight font-medium"
                            key={share.id}
                            style={{
                              backgroundColor: share.color,
                              color: fundingTextColor(share.color),
                              height: `${(share.percent / scale) * 100}%`,
                            }}
                          >
                            <span className="block">
                              {percent(share.percent)}
                            </span>
                            <span className="block truncate">
                              {share.label}
                            </span>
                          </span>
                        ))}
                        {open > 0.000_01 && (
                          <span className="min-h-0 flex-1 overflow-hidden px-1.5 py-1 text-[11px] leading-tight text-base-content/60">
                            {percent(open)} open
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span className="mt-1 block h-4 text-center text-[11px] text-error">
                    {over > 0.000_01 ? `${percent(over)} over` : ''}
                  </span>
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}

function fundingTextColor(color: string) {
  const hex = color.replace('#', '');
  const [red, green, blue] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.040_45
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
