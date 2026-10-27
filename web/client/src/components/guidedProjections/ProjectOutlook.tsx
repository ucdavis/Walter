import { useId } from 'react';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
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
    <section aria-label="Live project outlook" className="hp-live-panel">
      <div className="hp-live-heading">
        <h2>Project outlooks</h2>
        <span>
          <i /> Live
        </span>
      </div>
      <label className="hp-chart-select">
        Explore a project
        <select
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
      {selected ? (
        <>
          <h3 className="hp-chart-project-name">{selected.name}</h3>
          <span className="hp-balance-label">
            Ending balance · {endingMonth && monthLabel(endingMonth)}
          </span>
          <strong
            className={`hp-live-balance ${selected.ending < 0 ? 'hp-negative' : ''}`}
          >
            {money(selected.ending)}
          </strong>
          <p className={selected.firstDeficit ? 'hp-negative' : ''}>
            {selected.firstDeficit
              ? `First below zero in ${monthLabel(selected.firstDeficit)}`
              : 'Stays within funding throughout this plan'}
          </p>
        </>
      ) : (
        <div className="hp-project-status">
          <strong>
            {gaps.length
              ? `${gaps.length} of ${result.funds.length} projects ${gaps.length === 1 ? 'runs' : 'run'} short`
              : result.funds.length
                ? 'Each project stays within funding'
                : 'Select a project to see its outlook'}
          </strong>
          <p>
            Balances stay separate. Select a line or a project below to explore.
          </p>
        </div>
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
                  stopColor={selected?.color ?? '#257f73'}
                  stopOpacity={0.18}
                />
                <stop
                  offset="100%"
                  stopColor={selected?.color ?? '#257f73'}
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e9eeed" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="month"
              minTickGap={24}
              tick={{ fill: '#7a898b', fontSize: 11 }}
              tickFormatter={(month: string) => monthLabel(month).split(' ')[0]}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: '#7a898b', fontSize: 11 }}
              tickFormatter={shortMoney}
              tickLine={false}
              width={57}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid #dce6e4',
                borderRadius: 8,
                fontSize: 12,
                maxWidth: 300,
                whiteSpace: 'normal',
              }}
              formatter={(value) => money(Number(value))}
              labelFormatter={(month) => monthLabel(String(month))}
            />
            <ReferenceLine
              label={{
                fill: '#a45548',
                fontSize: 10,
                position: 'insideTopRight',
                value: 'Zero balance',
              }}
              stroke="#c47a6b"
              strokeDasharray="4 4"
              y={0}
            />
            {selected?.firstDeficit && (
              <ReferenceLine
                label={{
                  fill: '#a45548',
                  fontSize: 10,
                  position: 'top',
                  value: `Shortfall · ${monthLabel(selected.firstDeficit)}`,
                }}
                stroke="#b86455"
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
      <p className="hp-chart-period">
        Month-end balances ·{' '}
        {result.chart[0] && monthLabel(result.chart[0].month)} to{' '}
        {endingMonth && monthLabel(endingMonth)}
      </p>
      {selected ? (
        <div className="hp-costs">
          <div>
            <span>Starting balance</span>
            <strong>{money(selected.startingBalance)}</strong>
          </div>
          <div>
            <span>Salary</span>
            <strong>{money(selected.salary)}</strong>
          </div>
          <div>
            <span>Fringe</span>
            <strong>{money(selected.fringe)}</strong>
          </div>
          <div>
            <span>Indirect costs · {selected.indirectRate}%</span>
            <strong>{money(selected.indirect)}</strong>
          </div>
          <div>
            <span>Other expenses</span>
            <strong>{money(selected.other)}</strong>
          </div>
          <div>
            <span>Total planned spending</span>
            <strong>{money(selected.spending)}</strong>
          </div>
        </div>
      ) : (
        <div className="hp-chart-legend">
          {result.funds.map((fund) => (
            <button
              key={fund.id}
              onClick={() => onProject(fund.id)}
              type="button"
            >
              <i style={{ background: fund.color }} />
              <span>
                <strong>{fund.name}</strong>
                <small>
                  {fund.firstDeficit
                    ? `Shortfall starts ${monthLabel(fund.firstDeficit)}`
                    : 'Within funding'}
                </small>
              </span>
              <b className={fund.ending < 0 ? 'hp-negative' : ''}>
                {shortMoney(fund.ending)}
              </b>
              <ArrowRightIcon />
            </button>
          ))}
        </div>
      )}
      <div className="hp-portfolio-total">
        <span>All projects combined · ending</span>
        <strong className={result.ending < 0 ? 'hp-negative' : ''}>
          {money(result.ending)}
        </strong>
      </div>
    </section>
  );
}

export function ProjectDetail({
  fund,
  onBack,
  onStaffing,
}: {
  fund: ProjectResult;
  onBack: () => void;
  onStaffing: () => void;
}) {
  const lastMonth = fund.chart.at(-1)!.month;
  return (
    <div className="hp-project-detail">
      <button className="gp-back" onClick={onBack} type="button">
        <ArrowLeftIcon /> All project balances
      </button>
      <span className="gp-eyebrow">PROJECT DETAIL · {fund.id}</span>
      <h2>
        <i style={{ background: fund.color }} />
        {fund.name}
      </h2>
      <p>
        Project dates: {monthLabel(fund.startDate.slice(0, 7))} to{' '}
        {monthLabel(fund.endDate.slice(0, 7))}
      </p>
      <div
        className={`hp-project-insight ${fund.firstDeficit ? 'hp-project-insight-gap' : ''}`}
      >
        <strong>
          {fund.firstDeficit
            ? `Runs short in ${monthLabel(fund.firstDeficit)}`
            : 'Within funding for this plan'}
        </strong>
        <p>
          {fund.firstDeficit
            ? `The balance first drops below zero in ${monthLabel(fund.firstDeficit)} and reaches ${money(fund.ending)} by ${monthLabel(lastMonth)}.`
            : `${money(fund.ending)} remains at the end of ${monthLabel(lastMonth)}.`}
        </p>
      </div>
      <div className="hp-project-metrics">
        <div>
          <span>Starting balance</span>
          <strong>{money(fund.startingBalance)}</strong>
        </div>
        <div>
          <span>Planned spending</span>
          <strong>{money(fund.spending)}</strong>
        </div>
      </div>
      <div className="hp-detail-heading">
        <h3>People funded here</h3>
        <button onClick={onStaffing} type="button">
          Edit funding shares <ArrowRightIcon />
        </button>
      </div>
      <p className="hp-detail-caption">
        Project costs include salary, fringe, and indirect costs.
      </p>
      {fund.staff.length ? (
        fund.staff.map((person) => (
          <div className="hp-funded-person" key={person.id}>
            <div>
              <strong>{person.name}</strong>
              {person.splits.map((split) => (
                <small key={split.id}>
                  {split.percent}% · {monthLabel(split.startMonth)} to{' '}
                  {monthLabel(split.endMonth)}
                </small>
              ))}
            </div>
            <strong>{money(person.cost)}</strong>
          </div>
        ))
      ) : (
        <p className="hp-detail-caption">
          No staffing costs in this planning period.
        </p>
      )}
      <details className="hp-monthly-detail">
        <summary>
          Month-by-month balances <span>{fund.chart.length} months</span>
        </summary>
        <div className="hp-monthly-scroll">
          <table>
            <caption>
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
                      <small>First shortfall</small>
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
