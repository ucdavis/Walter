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
      className="card hp-live-panel text-base"
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
      <label className="hp-chart-select text-sm">
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
          <h3 className="hp-chart-project-name text-lg font-semibold leading-snug">
            {selected.name}
          </h3>
          <span className="hp-balance-label text-sm text-base-content/70">
            Ending balance · {endingMonth && monthLabel(endingMonth)}
          </span>
          <strong
            className={`hp-live-balance text-4xl font-bold ${selected.ending < 0 ? 'text-error' : ''}`}
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
        className="hp-chart"
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
      <p className="hp-chart-period text-sm text-base-content/70">
        Month-end balances ·{' '}
        {result.chart[0] && monthLabel(result.chart[0].month)} to{' '}
        {endingMonth && monthLabel(endingMonth)}
      </p>
      {selected ? (
        <div className="hp-costs text-sm">
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
        <div className="hp-chart-legend text-sm">
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
              <ArrowRightIcon />
            </button>
          ))}
        </div>
      )}
      <div className="hp-portfolio-total text-sm text-base-content/70">
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
    <div className="hp-project-detail">
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
      <div className="hp-project-metrics">
        <div>
          <span className="text-sm">Starting balance</span>
          <strong className="text-3xl">{money(fund.startingBalance)}</strong>
        </div>
        <div>
          <span className="text-sm">Planned spending</span>
          <strong className="text-3xl">{money(fund.spending)}</strong>
        </div>
      </div>
      <div className="hp-detail-heading">
        <h3 className="text-lg font-semibold">People funded here</h3>
        <button className="text-sm" onClick={onStaffing} type="button">
          Edit funding shares <ArrowRightIcon />
        </button>
      </div>
      <p className="hp-detail-caption text-sm">
        Project costs include salary, fringe, and indirect costs.
      </p>
      {fund.staff.length ? (
        fund.staff.map((person) => (
          <div className="hp-funded-person text-sm" key={person.id}>
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
        <p className="hp-detail-caption text-sm">
          No staffing costs in this planning period.
        </p>
      )}
      <details className="hp-monthly-detail text-sm">
        <summary className="text-base">
          Month-by-month balances{' '}
          <span className="text-sm">{fund.chart.length} months</span>
        </summary>
        <div className="hp-monthly-scroll text-sm">
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
                  className={point.balance < 0 ? 'hp-deficit-row' : ''}
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
