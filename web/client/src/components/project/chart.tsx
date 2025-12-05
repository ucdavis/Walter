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

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDataForChart(data: Transaction[]) {
  // Transform transaction data into chart-friendly format
  // we'll use journal_acct_date for x-axis and actual_amount for y-axis
  const chartData: { date: string; value: number }[] = [];
  const dateMap: Record<string, number> = {};

  data.forEach((transaction) => {
    const date = new Date(transaction.journal_acct_date);
    const formattedDate = `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear()}`;

    if (!dateMap[formattedDate]) {
      dateMap[formattedDate] = 0;
    }
    dateMap[formattedDate] += transaction.actual_amount;
  });

  for (const date of Object.keys(dateMap).sort((a, b) => {
    const [aMonth, aDay, aYear] = a.split('.').map(Number);
    const [bMonth, bDay, bYear] = b.split('.').map(Number);
    return (
      new Date(aYear, aMonth - 1, aDay).getTime() -
      new Date(bYear, bMonth - 1, bDay).getTime()
    );
  })) {
    chartData.push({ date, value: dateMap[date] });
  }

  return chartData;
}

export function ProjectChart() {
  const { data: transactions } = useTransactionsForProjectQuery(['K30ESS6F22']);

  const data = transactions ? formatDataForChart(transactions) : [];

  const startBalance = data[0]?.value ?? 0;
  const currentPoint = data.at(-2);
  const projectedEnd = data.at(-1)?.value ?? 0;

  return (
    <div>
      <div className="h-80">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const parts = value.split('.');
                return `${parts[0]}.${parts[2]}`;
              }}
            />
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
      </div>
      <div className="flex justify-between px-4 mt-4 border-t border-b bg-light-bg-200 border-main-border py-2">
        <div>
          <p className="text-sm uppercase">Starting</p>
          <p className="h5">{formatCurrency(startBalance)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm uppercase">
            Current ({currentPoint?.date ?? 'N/A'})
          </p>
          <p className="text-primary-color font-proxima-bold">
            {formatCurrency(currentPoint?.value ?? 0)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm uppercase">Projected</p>
          <p className="h5">{formatCurrency(projectedEnd)}</p>
        </div>
      </div>
    </div>
  );
}
