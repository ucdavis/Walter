import {
  Transaction,
  useTransactionsForProjectQuery,
} from '@/queries/transaction.ts';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type ChartPoint = { date: string; value: number };

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function parseYearMonth(input: string): { month: number; year: number } {
  const trimmed = input.trim();
  const [datePart] = trimmed.split('T'); // handle ISO strings with time
  const parts = datePart.split('-'); // "YYYY-MM" or "YYYY-MM-DD"

  if (parts.length >= 2) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    if (
      !Number.isNaN(year) &&
      !Number.isNaN(month) &&
      month >= 1 &&
      month <= 12
    ) {
      return { month, year };
    }
  }

  // Fallback to Date parsing if format is different
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }

  throw new Error(`Unable to parse year/month from date: "${input}"`);
}

function toMonthId(year: number, month: number): number {
  // month is 1–12; stored as 0-based internally
  return year * 12 + (month - 1);
}

function monthIdToIsoDateString(monthId: number): string {
  const year = Math.floor(monthId / 12);
  const month = (monthId % 12) + 1;
  // First of the month, ISO format
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function formatDataForChart(
  data: Transaction[],
  startingBalance: number,
  startingDate: string
): ChartPoint[] {
  // Month we start tracking from
  const { month: startMonth, year: startYear } = parseYearMonth(startingDate);
  const startMonthId = toMonthId(startYear, startMonth);

  // Aggregate monthly net change (credits/spends) starting from start month
  const monthChanges = new Map<number, number>();

  for (const transaction of data) {
    const { month, year } = parseYearMonth(transaction.expenditureItemDate);
    const monthId = toMonthId(year, month);

    // Ignore transactions before the starting month
    if (monthId < startMonthId) {
      continue;
    }

    const signedAmount = transaction.burdenedCostInReceiverLedgerCurrency;

    // Positive = spend (subtract from balance), negative = credit (add to balance)
    const change = -signedAmount;

    monthChanges.set(monthId, (monthChanges.get(monthId) ?? 0) + change);
  }

  // Decide how far to run the chart: at least the starting month,
  // up through the last month that has any transactions
  let lastMonthId = startMonthId;
  for (const monthId of monthChanges.keys()) {
    if (monthId > lastMonthId) {
      lastMonthId = monthId;
    }
  }

  const chartData: ChartPoint[] = [];
  let runningBalance = startingBalance;

  for (let monthId = startMonthId; monthId <= lastMonthId; monthId++) {
    const monthChange = monthChanges.get(monthId) ?? 0;
    runningBalance += monthChange;

    chartData.push({
      date: monthIdToIsoDateString(monthId),
      value: runningBalance,
    });
  }

  // If there were no transactions >= starting month, still return a single point
  if (chartData.length === 0) {
    chartData.push({
      date: monthIdToIsoDateString(startMonthId),
      value: startingBalance,
    });
  }

  return chartData;
}

export interface ProjectChartProps {
  projects: string[];
  startingBalance: number;
  startingDate: string | null;
}

export function ProjectChart({
  projects,
  startingBalance,
  startingDate,
}: ProjectChartProps) {
  const { data: transactions } = useTransactionsForProjectQuery([...projects]);

  // if starting date not provided, get the earliest date from transactions
  if (!startingDate) {
    let earliestDate: string | null = null;
    if (transactions) {
      for (const transaction of transactions) {
        const transactionDate = transaction.expenditureItemDate;
        if (
          !earliestDate ||
          new Date(transactionDate) < new Date(earliestDate)
        ) {
          earliestDate = transactionDate;
        }
      }
    }
    startingDate = earliestDate || new Date().toISOString();
  }
  const data = transactions
    ? formatDataForChart(transactions, startingBalance, startingDate)
    : [];

  const startBalance = data[0]?.value ?? 0;
  const currentPoint = data.at(-2);
  const projectedEnd = data.at(-1)?.value ?? 0;

  return (
    <div>
      <ResponsiveContainer height={468} width="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #E9E3EE',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value: number) => [formatCurrency(value), 'Balance']}
          />
          <Line
            activeDot={{ r: 6 }}
            dataKey="value"
            dot={{ fill: '#0047BA', r: 4 }}
            stroke="#0047BA"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-between px-6 mt-4 mb-8 border rounded-md bg-light-bg-200 border-main-border py-4">
        <div>
          <p className="h5">Starting</p>
          <p className="h4">{formatCurrency(startBalance)}</p>
        </div>
        <div className="text-center">
          <p className="h5">Current ({currentPoint?.date ?? 'N/A'})</p>
          <p className="text-primary-color text-lg">
            {formatCurrency(currentPoint?.value ?? 0)}
          </p>
        </div>
        <div className="text-right">
          <p className="h5">Projected</p>
          <p className="h4">{formatCurrency(projectedEnd)}</p>
        </div>
      </div>
    </div>
  );
}
