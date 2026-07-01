import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildChartData, type ChartDatum } from '@/lib/financialSummary.ts';
import type { FinancialSummaryRow } from '@/queries/financialSummary.ts';
import { formatCurrency } from '@/lib/currency.ts';

// Category charts get unreadable past ~15 bars, so cap and roll the rest into one "Other" row.
const TOP_N = 15;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const currencyAxis = (v: number) => `$${Math.round(v / 1000)}k`;
const tooltipValue = (v: number | string) => formatCurrency(Number(v));

// 'Mon-YY' -> sortable month ordinal; NaN when the label isn't a period string.
const periodSortKey = (label: string): number => {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label.trim());
  if (!m) {return Number.NaN;}
  const month = MONTHS.indexOf(m[1].toLowerCase());
  return month < 0 ? Number.NaN : (2000 + Number(m[2])) * 12 + month;
};

// Truncate long category labels on the (horizontal) bar axis; full text stays in the tooltip.
function CategoryTick({
  payload,
  x,
  y,
}: {
  payload?: { value: string };
  x?: number;
  y?: number;
}) {
  const text = payload?.value ?? '';
  const shown = text.length > 26 ? `${text.slice(0, 25)}…` : text;
  return (
    <text
      dy={4}
      fill="currentColor"
      fontSize={12}
      textAnchor="end"
      x={x}
      y={y}
    >
      <title>{text}</title>
      {shown}
    </text>
  );
}

interface FinancialSummaryChartProps {
  dimensions: string[];
  rows: FinancialSummaryRow[];
}

/**
 * Chart for the financial summary. When grouped by a single time dimension
 * (Period / FiscalYear) it draws a chronological trend line; otherwise a
 * horizontal bar chart sorted by expense and capped to the top {@link TOP_N}
 * categories (remainder aggregated into "Other").
 */
export function FinancialSummaryChart({
  dimensions,
  rows,
}: FinancialSummaryChartProps) {
  const data = useMemo(
    () => buildChartData(rows, dimensions),
    [rows, dimensions]
  );

  // Trend only makes sense when time is the sole grouping; mixed groupings stay bars.
  const timeDimension =
    dimensions.length === 1 &&
    (dimensions[0] === 'Period' || dimensions[0] === 'FiscalYear')
      ? dimensions[0]
      : null;

  const lineData = useMemo(() => {
    if (!timeDimension) {return [];}
    const keyOf =
      timeDimension === 'FiscalYear'
        ? (d: ChartDatum) => Number(d.label)
        : (d: ChartDatum) => periodSortKey(d.label);
    return [...data].sort((a, b) => keyOf(a) - keyOf(b));
  }, [data, timeDimension]);

  const barData = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.expense - a.expense);
    if (sorted.length <= TOP_N) {return sorted;}
    const rest = sorted.slice(TOP_N);
    const other = rest.reduce<ChartDatum>(
      (acc, r) => ({
        expense: acc.expense + r.expense,
        income: acc.income + r.income,
        label: `Other (${rest.length})`,
        net: acc.net + r.net,
      }),
      { expense: 0, income: 0, label: '', net: 0 }
    );
    return [...sorted.slice(0, TOP_N), other];
  }, [data]);

  if (timeDimension) {
    return (
      <div className="h-80 mb-6">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={lineData}
            margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: 'currentColor', fontSize: 12 }} />
            <YAxis
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickFormatter={currencyAxis}
            />
            <Tooltip formatter={tooltipValue} />
            <Legend />
            <Line
              dataKey="income"
              dot={false}
              name="Income"
              stroke="var(--color-success)"
              strokeWidth={2}
            />
            <Line
              dataKey="expense"
              dot={false}
              name="Expense"
              stroke="var(--color-error)"
              strokeWidth={2}
            />
            <Line
              dataKey="net"
              dot={false}
              name="Net"
              stroke="var(--color-primary)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Height grows with the bar count so bars never squish; ResponsiveContainer handles width.
  const height = Math.max(320, barData.length * 44 + 48);

  return (
    <div className="mb-6" style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={barData}
          layout="vertical"
          margin={{ bottom: 8, left: 8, right: 24, top: 8 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            tick={{ fill: 'currentColor', fontSize: 12 }}
            tickFormatter={currencyAxis}
            type="number"
          />
          <YAxis
            dataKey="label"
            interval={0}
            tick={<CategoryTick />}
            type="category"
            width={200}
          />
          <Tooltip formatter={tooltipValue} />
          <Legend />
          <Bar dataKey="income" fill="var(--color-success)" name="Income" />
          <Bar dataKey="expense" fill="var(--color-error)" name="Expense" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
