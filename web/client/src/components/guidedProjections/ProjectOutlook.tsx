import { useId } from 'react';
import {
  ArrowRightIcon,
  CheckCircleIcon,
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
import { money, shortMoney } from '@/components/guidedProjections/defaults.ts';
import { monthLabel } from '@/components/projections/projection.ts';
import type {
  PlanResult,
  ProjectResult,
} from '@/components/guidedProjections/planModel.ts';

export function LiveResults({
  onProject,
  projectId,
  result,
}: {
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
  return (
    <section
      aria-label="Live project outlook"
      className="card min-w-0 border border-main-border bg-base-200 p-5 xl:p-6 text-base"
    >
      <div>
        <h2 className="text-2xl font-semibold">
          {gaps.length
            ? `${gaps.length} of ${result.funds.length} projects ${gaps.length === 1 ? 'runs' : 'run'} short`
            : result.funds.length
              ? 'Each project stays within funding'
              : 'Select a project to see its outlook'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-base-content/70">
          Balances stay separate. Select a line or a project below to explore.
        </p>
      </div>
      <label className="flex min-w-0 flex-col gap-2 font-medium my-5 grid gap-1.5 text-sm">
        Explore a project
        <select
          className="select w-full text-base"
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
      {selected && (
        <>
          <h3 className="mb-3.5 text-lg font-semibold leading-snug">
            {selected.name}
          </h3>
          <span className="block text-sm text-base-content/70">
            Ending balance · {endingMonth && monthLabel(endingMonth)}
          </span>
          <strong
            className={`my-1 block text-4xl font-bold ${selected.ending < 0 ? 'text-error' : ''}`}
          >
            {money(selected.ending)}
          </strong>
          <p
            className={`text-sm leading-relaxed ${selected.firstDeficit ? 'text-error' : 'text-base-content/70'}`}
          >
            {selected.firstDeficit
              ? `First below zero in ${monthLabel(selected.firstDeficit)}`
              : 'Stays within funding throughout this plan'}
          </p>
        </>
      )}
      <div
        aria-label={
          selected
            ? `Monthly remaining balance for ${selected.name}`
            : 'Monthly remaining balances by project'
        }
        className="mt-4 mb-1 h-60 w-full"
      >
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart
            accessibilityLayer
            data={points}
            margin={{ bottom: 0, left: 0, right: 12, top: 28 }}
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
            <CartesianGrid stroke="var(--color-main-border)" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="month"
              minTickGap={24}
              tick={{ className: 'text-sm fill-base-content/70' }}
              tickFormatter={(month: string) => monthLabel(month).split(' ')[0]}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ className: 'text-sm fill-base-content/70' }}
              tickFormatter={shortMoney}
              tickLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid var(--color-main-border)',
                borderRadius: 8,
                maxWidth: 300,
                whiteSpace: 'normal',
              }}
              formatter={(value) => money(Number(value))}
              labelFormatter={(month) => monthLabel(String(month))}
              wrapperClassName="text-sm"
            />
            <ReferenceLine
              label={{
                className: 'text-xs fill-error',
                position: 'insideTopRight',
                value: 'Zero balance',
              }}
              stroke="var(--color-error)"
              strokeDasharray="4 4"
              y={0}
            />
            {selected?.firstDeficit && (
              <ReferenceLine
                label={{
                  className: 'text-xs fill-error',
                  position: 'top',
                  value: `Shortfall · ${monthLabel(selected.firstDeficit)}`,
                }}
                stroke="var(--color-error)"
                strokeDasharray="3 4"
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
      <p className="mt-1.5 mb-3.5 text-center text-sm text-base-content/70">
        Month-end balances ·{' '}
        {result.chart[0] && monthLabel(result.chart[0].month)} to{' '}
        {endingMonth && monthLabel(endingMonth)}
      </p>
      {selected ? (
        <div className="grid gap-3 border-t border-main-border pt-3.5 [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-3 [&>div:last-child]:border-t [&>div:last-child]:border-main-border [&>div:last-child]:pt-3 text-sm">
          <div>
            <span className="text-base-content/70">Starting balance</span>
            <strong>{money(selected.startingBalance)}</strong>
          </div>
          <div>
            <span className="text-base-content/70">Salary</span>
            <strong>{money(selected.salary)}</strong>
          </div>
          <div>
            <span className="text-base-content/70">Fringe</span>
            <strong>{money(selected.fringe)}</strong>
          </div>
          <div>
            <span className="text-base-content/70">
              Indirect costs · {selected.indirectRate}%
            </span>
            <strong>{money(selected.indirect)}</strong>
          </div>
          <div>
            <span className="text-base-content/70">Other expenses</span>
            <strong>{money(selected.other)}</strong>
          </div>
          <div>
            <span className="text-base-content/70">Total planned spending</span>
            <strong>{money(selected.spending)}</strong>
          </div>
        </div>
      ) : (
        <div className="[&>button]:flex [&>button]:w-full [&>button]:items-center [&>button]:gap-1.5 [&>button]:border-t [&>button]:border-main-border [&>button]:py-3 [&>button]:text-left [&>button:hover]:bg-base-200 [&_i]:me-1.5 [&_i]:inline-block [&_i]:size-2 [&_i]:shrink-0 [&_i]:rounded-full [&_span]:min-w-0 [&_span]:flex-1 [&_strong]:block [&_small]:mt-1 [&_small]:block [&_b]:whitespace-nowrap [&_svg]:size-4 text-sm">
          {result.funds.map((fund) => (
            <button
              key={fund.id}
              onClick={() => onProject(fund.id)}
              type="button"
            >
              <i style={{ background: fund.color }} />
              <span>
                <strong className="text-sm font-semibold leading-normal">
                  {fund.name}
                </strong>
                <small className="text-sm text-base-content/70">
                  {fund.firstDeficit
                    ? `Shortfall starts ${monthLabel(fund.firstDeficit)}`
                    : 'Within funding'}
                </small>
              </span>
              <b className={fund.ending < 0 ? 'text-error' : ''}>
                {shortMoney(fund.ending)}
              </b>
              <ArrowRightIcon className="size-5 shrink-0" />
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-main-border pt-4 text-sm text-base-content/70">
        <span>All projects combined · ending</span>
        <strong
          className={`text-base font-semibold ${result.ending < 0 ? 'text-error' : ''}`}
        >
          {money(result.ending)}
        </strong>
      </div>
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
      <p className="text-sm leading-relaxed text-base-content/70">
        Project dates: {monthLabel(fund.startDate.slice(0, 7))} to{' '}
        {monthLabel(fund.endDate.slice(0, 7))}
      </p>
      <div
        className={`alert alert-soft flex items-start gap-3 rounded-lg p-5 text-left shadow-none ${fund.firstDeficit ? 'alert-warning' : 'alert-success'}`}
        role="status"
      >
        {fund.firstDeficit ? (
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />
        ) : (
          <CheckCircleIcon aria-hidden="true" className="mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <strong className="block text-base font-semibold text-base-content">
            {fund.firstDeficit
              ? `Runs short in ${monthLabel(fund.firstDeficit)}`
              : 'Within funding for this plan'}
          </strong>
          <span className="mt-1 block text-sm font-normal leading-relaxed text-base-content/70">
            Projected ending balance: {money(fund.ending)} in{' '}
            {monthLabel(lastMonth)}.
          </span>
        </div>
      </div>
      <div className="mt-5 mb-7 grid grid-cols-2 gap-3 [&_span]:block [&_span]:text-base-content/70 [&_strong]:mt-1 [&_strong]:block [&_strong]:font-semibold [&_strong]:tracking-normal">
        <div>
          <span className="text-sm">Starting balance</span>
          <strong className="text-3xl">{money(fund.startingBalance)}</strong>
        </div>
        <div>
          <span className="text-sm">Planned spending</span>
          <strong className="text-3xl">{money(fund.spending)}</strong>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2.5 [&>button]:flex [&>button]:items-center [&>button]:gap-1 [&>button]:text-right [&>button]:text-primary [&_svg]:size-4">
        <h3 className="text-lg font-semibold">People funded here</h3>
        <button className="text-sm" onClick={onStaffing} type="button">
          Edit funding shares <ArrowRightIcon className="size-5 shrink-0" />
        </button>
      </div>
      <p className="mt-1.5 mb-3.5 text-base-content/70 text-sm">
        Project costs include salary, fringe, and indirect costs.
      </p>
      {fund.staff.length ? (
        fund.staff.map((person) => (
          <div
            className="flex items-center justify-between gap-3.5 border-t border-main-border py-3 [&_small]:mt-1 [&_small]:block [&_small]:text-base-content/70 text-sm"
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
        <p className="mt-1.5 mb-3.5 text-base-content/70 text-sm">
          No staffing costs in this planning period.
        </p>
      )}
      <details className="mt-6 border-t border-main-border pt-4 [&>summary]:cursor-pointer [&>summary]:font-semibold [&>summary>span]:float-right [&>summary>span]:font-normal [&>summary>span]:text-base-content/70 text-sm">
        <summary className="text-base">
          Month-by-month balances{' '}
          <span className="text-sm">{fund.chart.length} months</span>
        </summary>
        <div className="mt-3.5 overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_caption]:mb-2 [&_caption]:text-left [&_caption]:text-base-content/70 [&_th]:border-b [&_th]:border-main-border [&_th]:px-1.5 [&_th]:py-2.5 [&_th]:text-right [&_th]:font-medium [&_th]:whitespace-nowrap [&_th:first-child]:text-left [&_td]:border-b [&_td]:border-main-border [&_td]:px-1.5 [&_td]:py-2.5 [&_td]:text-right [&_td]:whitespace-nowrap [&_thead]:text-base-content/70 [&_small]:block text-sm">
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
