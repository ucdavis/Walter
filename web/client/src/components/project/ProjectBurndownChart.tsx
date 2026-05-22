import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  createProjectBurndown,
  type ProjectBurndownPoint,
} from '@/lib/projectBurndown.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import type { PersonnelRecord } from '@/queries/personnel.ts';

interface ProjectBurndownSectionProps {
  isError: boolean;
  isLoading: boolean;
  personnel: PersonnelRecord[] | undefined;
  summary: ProjectSummary;
}

interface BurndownTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ProjectBurndownPoint }>;
}

const BALANCE_COLOR = 'var(--color-primary)';
const DEFICIT_COLOR = 'var(--color-error)';
const GRID_COLOR = 'var(--color-main-border)';

function BurndownTooltip({ active, payload }: BurndownTooltipProps) {
  const point = payload?.find((item) => item.payload)?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="rounded-md border border-main-border bg-base-100 p-4 text-sm shadow-lg">
      <p className="font-proxima-bold text-base mb-3">{point.label}</p>
      <dl className="space-y-2">
        <div className="flex justify-between gap-8">
          <dt className="text-base-content/70">Remaining Balance</dt>
          <dd className="font-medium">
            {formatCurrency(point.remainingBalance)}
          </dd>
        </div>
        <div className="flex justify-between gap-8">
          <dt className="text-base-content/70">Projected Spend</dt>
          <dd className="font-medium">{formatCurrency(point.totalSpend)}</dd>
        </div>
      </dl>

      {!point.isStartingBalance && point.personnel.length > 0 && (
        <div className="mt-3 border-t border-main-border pt-3">
          <p className="font-proxima-bold mb-2">Personnel</p>
          <div className="space-y-2">
            {point.personnel.map((person) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4"
                key={person.id}
              >
                <span className="truncate" title={person.label}>
                  {person.label}
                </span>
                <span className="font-medium">
                  {formatCurrency(person.total)}
                </span>
                <span className="text-xs text-base-content/60">
                  Salary {formatCurrency(person.salary)}
                </span>
                <span className="text-xs text-base-content/60">
                  CBR {formatCurrency(person.fringe)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildChartData(points: ProjectBurndownPoint[]) {
  const firstNegativeIndex = points.findIndex(
    (point) => point.remainingBalance < 0
  );

  return points.map((point, index) => ({
    ...point,
    negativeLineBalance:
      firstNegativeIndex >= 0 && index >= Math.max(firstNegativeIndex - 1, 0)
        ? point.remainingBalance
        : null,
    positiveLineBalance:
      firstNegativeIndex >= 0 && index >= firstNegativeIndex
        ? null
        : point.remainingBalance,
  }));
}

export function ProjectBurndownSection({
  isError,
  isLoading,
  personnel,
  summary,
}: ProjectBurndownSectionProps) {
  const points = useMemo(
    () =>
      createProjectBurndown({
        personnel: personnel ?? [],
        projectEndDate: summary.awardEndDate,
        startingBalance: summary.totals.balance,
      }),
    [personnel, summary.awardEndDate, summary.totals.balance]
  );
  const chartData = useMemo(() => buildChartData(points), [points]);
  const balances = points.map((point) => point.remainingBalance);
  const minBalance = Math.min(0, ...balances);
  const maxBalance = Math.max(0, ...balances);
  const padding = Math.max((maxBalance - minBalance) * 0.1, 1000);
  const projectedEnd =
    points.at(-1)?.remainingBalance ?? summary.totals.balance;

  return (
    <section className="section-margin">
      <h2 className="h2">Project Burndown</h2>

      {isLoading && (
        <div className="fancy-data min-h-64 flex items-center justify-center text-base-content/70">
          Loading project burndown...
        </div>
      )}

      {isError && (
        <div className="fancy-data text-error">
          Error loading project burndown.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="fancy-data">
          <div className="h-80" data-testid="project-burndown-chart">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart
                data={chartData}
                margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
              >
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                />
                <YAxis
                  domain={[minBalance - padding, maxBalance + padding]}
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    `$${(value / 1000).toFixed(0)}k`
                  }
                />
                <ReferenceLine
                  ifOverflow="extendDomain"
                  stroke={DEFICIT_COLOR}
                  strokeDasharray="5 5"
                  y={0}
                />
                <Tooltip content={<BurndownTooltip />} />
                <Line
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                  dataKey="positiveLineBalance"
                  dot={{ fill: BALANCE_COLOR, r: 4 }}
                  isAnimationActive={false}
                  name="Remaining Balance"
                  stroke={BALANCE_COLOR}
                  strokeWidth={3}
                  type="monotone"
                />
                <Line
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                  dataKey="negativeLineBalance"
                  dot={{ fill: DEFICIT_COLOR, r: 4 }}
                  isAnimationActive={false}
                  name="Projected Deficit"
                  stroke={DEFICIT_COLOR}
                  strokeWidth={3}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="stat-label">Starting Balance</p>
              <p className="stat-value">
                {formatCurrency(summary.totals.balance)}
              </p>
            </div>
            <div>
              <p className="stat-label">Projected End</p>
              <p
                className={
                  projectedEnd < 0 ? 'stat-value text-error' : 'stat-value'
                }
              >
                {formatCurrency(projectedEnd)}
              </p>
            </div>
            <div>
              <p className="stat-label">Projection</p>
              <p className="stat-value">{points.length - 1} months</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
