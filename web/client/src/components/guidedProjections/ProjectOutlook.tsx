import { useId } from 'react';
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money } from '@/components/guidedProjections/defaults.ts';
import {
  BalanceYAxisTick,
  buildBalanceAxisTicks,
  VerticalMarkerLabel,
} from '@/components/project/ProjectBurndownChart.tsx';
import { monthLabel } from '@/components/projections/projection.ts';
import type {
  PlanResult,
  ProjectResult,
} from '@/components/guidedProjections/planModel.ts';

export function LiveResults({
  incomplete = false,
  onProject,
  projectId,
  result,
}: {
  incomplete?: boolean;
  onProject: (id: string | null) => void;
  projectId: string | null;
  result: PlanResult;
}) {
  const gradient = useId();
  const selected = result.funds.find((fund) => fund.id === projectId);
  const points = result.chart.map((point, index) => ({
    month: point.month,
    ...Object.fromEntries(
      result.funds.map((fund) => [fund.id, fund.chart[index].balance])
    ),
  }));
  const gaps = result.funds.filter((fund) => fund.firstDeficit);
  const endingMonth = result.chart.at(-1)?.month;
  const scope = selected ? [selected] : result.funds;
  const ending = selected?.ending ?? result.ending;
  const visibleBalances = scope.flatMap((fund) =>
    fund.chart.map((point) => point.balance)
  );
  const minBalance = Math.min(0, ...visibleBalances);
  const maxBalance = Math.max(0, ...visibleBalances);
  const padding = Math.max((maxBalance - minBalance) * 0.1, 1000);
  const yDomainMin = minBalance < 0 ? minBalance - padding : 0;
  const yDomainMax = maxBalance > 0 ? maxBalance + padding : 0;
  const yAxisTicks = buildBalanceAxisTicks(yDomainMin, yDomainMax);
  const useDenseXAxisTicks = points.length >= 24;
  return (
    <section
      aria-label="Live project outlook"
      className="min-w-0 overflow-hidden rounded-lg border border-main-border bg-base-100 text-base"
    >
      <div className="flex flex-wrap items-start justify-between gap-5 p-5 xl:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">Project outlook</h2>
          <p
            className={`mt-1 text-sm ${gaps.length ? 'text-error' : 'text-base-content/80'}`}
          >
            {gaps.length
              ? `${gaps.length} of ${result.funds.length} projects ${gaps.length === 1 ? 'runs' : 'run'} short`
              : incomplete
                ? 'Staffing costs need review'
                : result.funds.length
                  ? 'Each project stays within funding'
                  : 'Select a project to see its outlook'}
          </p>
          <p className="mt-1 text-sm text-base-content/80">
            Balances stay separate. Select a project to explore its forecast.
          </p>
        </div>
        <label className="grid w-full min-w-0 gap-1.5 text-sm font-medium sm:w-80 lg:w-96">
          Explore a project
          <select
            className="select w-full min-w-0"
            onChange={(event) => onProject(event.target.value || null)}
            value={selected?.id ?? ''}
          >
            <option value="">All projects · separate balances</option>
            {result.funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="grid gap-4 border-y border-main-border bg-base-200 px-5 py-4 sm:grid-cols-3 sm:gap-6 xl:px-6">
        <div>
          <dt className="text-sm text-base-content/80">
            Opening planning balance
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {money(scope.reduce((sum, fund) => sum + fund.startingBalance, 0))}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-base-content/80">Planned spending</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {money(scope.reduce((sum, fund) => sum + fund.spending, 0))}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-base-content/80">
            {selected ? 'Ending balance' : 'Combined ending balance'}
            {endingMonth && ` · ${monthLabel(endingMonth)}`}
          </dt>
          <dd
            className={`mt-1 text-2xl font-semibold tabular-nums ${ending < 0 ? 'text-error' : ''}`}
          >
            {money(ending)}
          </dd>
        </div>
      </dl>
      <div className="p-5 xl:p-6">
        {selected && (
          <div className="mb-4 min-w-0">
            <h3 className="text-lg font-semibold break-words">
              {selected.name}
            </h3>
            <p
              className={`mt-1 text-sm ${selected.firstDeficit ? 'text-error' : 'text-base-content/80'}`}
            >
              {selected.firstDeficit
                ? `First below zero in ${monthLabel(selected.firstDeficit)}`
                : incomplete
                  ? 'Balance excludes missing staffing costs'
                  : 'Stays within funding throughout this plan'}
            </p>
          </div>
        )}
        <div
          aria-label={
            selected
              ? `Monthly remaining balance for ${selected.name}`
              : 'Monthly remaining balances by project'
          }
          className="h-72 w-full sm:h-80"
        >
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart
              accessibilityLayer
              data={points}
              margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
            >
              <defs>
                <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={selected?.color ?? 'var(--color-primary)'}
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="100%"
                    stopColor={selected?.color ?? 'var(--color-primary)'}
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--color-main-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                angle={useDenseXAxisTicks ? -35 : 0}
                dataKey="month"
                height={useDenseXAxisTicks ? 56 : undefined}
                interval={useDenseXAxisTicks ? 0 : 'preserveStartEnd'}
                minTickGap={useDenseXAxisTicks ? 0 : undefined}
                tick={{
                  fill: 'currentColor',
                  fontSize: useDenseXAxisTicks ? 10 : 12,
                  textAnchor: useDenseXAxisTicks ? 'end' : 'middle',
                }}
                tickFormatter={(month: string) => {
                  const [name, year] = monthLabel(month).split(' ');
                  return `${name}-${year.slice(-2)}`;
                }}
                tickMargin={useDenseXAxisTicks ? 10 : undefined}
              />
              <YAxis
                domain={[
                  yAxisTicks[0] ?? yDomainMin,
                  yAxisTicks.at(-1) ?? yDomainMax,
                ]}
                tick={<BalanceYAxisTick />}
                ticks={yAxisTicks}
              />
              <Tooltip
                contentStyle={{
                  border: '1px solid var(--color-main-border)',
                  borderRadius: 8,
                  maxWidth: 300,
                  whiteSpace: 'nowrap',
                }}
                formatter={(value, name) => {
                  const title = String(name ?? '');
                  return [
                    money(Number(value)),
                    title.length > 24
                      ? `${title.slice(0, 23).trimEnd()}…`
                      : title,
                  ];
                }}
                labelFormatter={(month) => monthLabel(String(month))}
                wrapperClassName="text-sm"
              />
              <ReferenceLine
                ifOverflow="extendDomain"
                stroke="var(--color-error)"
                strokeDasharray="5 5"
                y={0}
              />
              {selected?.firstDeficit && (
                <ReferenceLine
                  label={
                    <VerticalMarkerLabel
                      align="end"
                      labelText={`Shortfall · ${monthLabel(selected.firstDeficit)}`}
                    />
                  }
                  stroke="var(--color-error)"
                  strokeDasharray="3 5"
                  strokeOpacity={0.7}
                  strokeWidth={1.5}
                  x={selected.firstDeficit}
                />
              )}
              {selected ? (
                <Area
                  dataKey={selected.id}
                  fill={`url(#${gradient})`}
                  isAnimationActive={false}
                  name={selected.name}
                  stroke={selected.color}
                  strokeWidth={2.5}
                  type="linear"
                />
              ) : (
                result.funds.map((fund) => (
                  <Line
                    activeDot={{ onClick: () => onProject(fund.id), r: 6 }}
                    dataKey={fund.id}
                    dot={false}
                    isAnimationActive={false}
                    key={fund.id}
                    name={fund.name}
                    onClick={() => onProject(fund.id)}
                    stroke={fund.color}
                    strokeWidth={3}
                    style={{ cursor: 'pointer' }}
                    type="linear"
                  />
                ))
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1.5 mb-3.5 text-center text-sm text-base-content/80">
          Month-end balances ·{' '}
          {result.chart[0] && monthLabel(result.chart[0].month)} to{' '}
          {endingMonth && monthLabel(endingMonth)}
        </p>
        {selected ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-main-border pt-5 sm:grid-cols-3 lg:grid-cols-5 [&_span]:block [&_strong]:mt-1 [&_strong]:block [&_strong]:font-semibold [&_strong]:tabular-nums text-sm">
            <div>
              <span className="text-base-content/80">Salary</span>
              <strong>{money(selected.salary)}</strong>
            </div>
            <div>
              <span className="text-base-content/80">Fringe</span>
              <strong>{money(selected.fringe)}</strong>
            </div>
            {selected.fees !== 0 && (
              <div>
                <span className="text-base-content/80">Fee remission</span>
                <strong>{money(selected.fees)}</strong>
              </div>
            )}
            {!selected.serverProject && (
              <div>
                <span className="text-base-content/80">
                  Indirect costs · {selected.indirectRate}%
                </span>
                <strong>{money(selected.indirect)}</strong>
              </div>
            )}
            <div>
              <span className="text-base-content/80">Other expenses</span>
              <strong>{money(selected.other)}</strong>
            </div>
          </div>
        ) : null}
      </div>
      {!selected && result.funds.length > 0 && (
        <div className="overflow-x-auto border-t border-main-border">
          <table className="table w-full text-sm">
            <caption className="px-5 pt-5 pb-3 text-left text-lg font-semibold text-base-content xl:px-6">
              Funding Sources
            </caption>
            <thead className="text-base-content/80">
              <tr>
                <th className="pl-5 xl:pl-6" scope="col">
                  Project/Task
                </th>
                <th scope="col">Funding outlook</th>
                <th className="text-right" scope="col">
                  Planned spending
                </th>
                <th className="pr-5 text-right xl:pr-6" scope="col">
                  Ending balance
                </th>
              </tr>
            </thead>
            <tbody>
              {result.funds.map((fund) => (
                <tr className="hover:bg-base-200/50" key={fund.id}>
                  <td className="max-w-72 pl-5 xl:pl-6">
                    <button
                      className="flex w-full min-w-0 items-center gap-2 text-left text-base-content hover:underline"
                      onClick={() => onProject(fund.id)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: fund.color }}
                      />
                      <span
                        className="truncate font-semibold"
                        title={fund.name}
                      >
                        {fund.name}
                      </span>
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    </button>
                  </td>
                  <td className="whitespace-nowrap">
                    {fund.firstDeficit ? (
                      <span className="inline-flex items-center gap-1.5 text-error">
                        <ExclamationTriangleIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        Shortfall · {monthLabel(fund.firstDeficit)}
                      </span>
                    ) : (
                      <span className="text-base-content/80">
                        Within funding
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {money(fund.spending)}
                  </td>
                  <td
                    className={`pr-5 text-right font-semibold tabular-nums xl:pr-6 ${fund.ending < 0 ? 'text-error' : ''}`}
                  >
                    {money(fund.ending)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ProjectDetail({
  fund,
  onStaffing,
}: {
  fund: ProjectResult;
  onStaffing: () => void;
}) {
  const lastMonth = fund.chart.at(-1)!.month;
  return (
    <div className="[&>h2]:leading-snug [&>h2]:tracking-normal [&>h2_i]:me-1.5 [&>h2_i]:inline-block [&>h2_i]:size-2 [&>h2_i]:rounded-full">
      <h2 className="text-2xl font-semibold">
        <i style={{ background: fund.color }} />
        {fund.name}
      </h2>
      <p className="text-sm leading-relaxed text-base-content/80">
        Project dates: {monthLabel(fund.startDate.slice(0, 7))} to{' '}
        {monthLabel(fund.endDate.slice(0, 7))}
      </p>
      {fund.firstDeficit && (
        <div
          className="alert alert-soft alert-warning flex items-start gap-3 rounded-lg p-5 text-left shadow-none"
          role="status"
        >
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-6 shrink-0"
          />
          <div className="min-w-0">
            <strong className="block text-base font-semibold text-base-content">
              {`Runs short in ${monthLabel(fund.firstDeficit)}`}
            </strong>
            <span className="mt-1 block text-sm font-normal leading-relaxed text-base-content/80">
              Projected ending balance: {money(fund.ending)} in{' '}
              {monthLabel(lastMonth)}.
            </span>
          </div>
        </div>
      )}
      <div className="mt-5 mb-7 grid grid-cols-2 gap-3 [&_span]:block [&_span]:text-base-content/80 [&_strong]:mt-1 [&_strong]:block [&_strong]:font-semibold [&_strong]:tracking-normal">
        <div>
          <span className="text-sm">
            {fund.serverProject
              ? 'Opening planning balance'
              : 'Starting balance'}
          </span>
          <strong className="text-3xl">{money(fund.startingBalance)}</strong>
        </div>
        <div>
          <span className="text-sm">Planned spending</span>
          <strong className="text-3xl">{money(fund.spending)}</strong>
        </div>
      </div>
      {fund.serverProject && (
        <p className="mb-5 text-sm text-base-content/80">
          The opening balance restores costs already posted in the snapshot
          month before calculating that full month.
        </p>
      )}
      <div className="flex items-center justify-between gap-2.5 [&>button]:flex [&>button]:items-center [&>button]:gap-1 [&>button]:text-right [&>button]:text-primary [&_svg]:size-4">
        <h3 className="text-lg font-semibold">People funded here</h3>
        <button className="text-sm" onClick={onStaffing} type="button">
          Edit funding shares <ArrowRightIcon className="size-5 shrink-0" />
        </button>
      </div>
      <p className="mt-1.5 mb-3.5 text-base-content/80 text-sm">
        {fund.serverProject
          ? 'Staffing costs include salary, benefits, vacation accrual, and fee remission.'
          : 'Project costs include salary, fringe, and indirect costs.'}
      </p>
      {fund.staff.length ? (
        fund.staff.map((person) => (
          <div
            className="flex items-center justify-between gap-3.5 border-t border-main-border py-3 [&_small]:mt-1 [&_small]:block [&_small]:text-base-content/80 text-sm"
            key={person.id}
          >
            <div>
              <strong>{person.name}</strong>
              {person.splits.map((split) => (
                <small className="text-sm" key={split.id}>
                  {split.percent}% · {monthLabel(split.startMonth)} to{' '}
                  {monthLabel(split.endMonth)}
                </small>
              ))}
            </div>
            <strong>{money(person.cost)}</strong>
          </div>
        ))
      ) : (
        <p className="mt-1.5 mb-3.5 text-base-content/80 text-sm">
          No staffing costs in this planning period.
        </p>
      )}
      <details className="mt-6 border-t border-main-border pt-4 [&>summary]:cursor-pointer [&>summary]:font-semibold [&>summary>span]:float-right [&>summary>span]:font-normal [&>summary>span]:text-base-content/80 text-sm">
        <summary className="text-base">
          Month-by-month balances{' '}
          <span className="text-sm">{fund.chart.length} months</span>
        </summary>
        <div className="mt-3.5 overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_caption]:mb-2 [&_caption]:text-left [&_caption]:text-base-content/80 [&_th]:border-b [&_th]:border-main-border [&_th]:px-1.5 [&_th]:py-2.5 [&_th]:text-right [&_th]:font-medium [&_th]:whitespace-nowrap [&_th:first-child]:text-left [&_td]:border-b [&_td]:border-main-border [&_td]:px-1.5 [&_td]:py-2.5 [&_td]:text-right [&_td]:whitespace-nowrap [&_thead]:text-base-content/80 [&_small]:block text-sm">
          <table className="table walter-table walter-subtable">
            <caption className="text-sm">
              Monthly spending and ending balance for {fund.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">People</th>
                <th scope="col">Other</th>
                <th scope="col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {fund.chart.map((point) => (
                <tr
                  className={
                    point.balance < 0
                      ? 'bg-error/10 [&>td:last-child]:font-semibold [&>td:last-child]:text-error'
                      : ''
                  }
                  key={point.month}
                >
                  <th scope="row">
                    {monthLabel(point.month)}
                    {point.month === fund.firstDeficit && (
                      <small className="text-sm">First shortfall</small>
                    )}
                  </th>
                  <td>{money(point.personnel)}</td>
                  <td>{money(point.other)}</td>
                  <td>{money(point.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
