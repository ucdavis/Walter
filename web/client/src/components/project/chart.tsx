import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const dates = [
  '05.23.2012',
  '07.15.2013',
  '02.28.2015',
  '08.12.2016',
  '03.05.2018',
  '11.18.2020',
  '05.30.2022',
  '01.15.2024',
  '11.9.2025',
  '08.23.2029',
];

function generateChartData() {
  return dates.map((date) => ({
    date,
    value: Number((25_000 + Math.random() * 225_000).toFixed(2)),
  }));
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function ProjectChart() {
  const data = generateChartData();
  const startBalance = data[0]?.value ?? 0;
  const currentPoint = data.at(-2);
  const projectedEnd = data.at(-1)?.value ?? 0;

  return (
    <div className="h-64 mb-6 pb-4">
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
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
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            formatter={(value: number) => [formatCurrency(value), 'Balance']}
          />
          <Line
            activeDot={{ r: 6 }}
            dataKey="value"
            dot={{ fill: '#2563eb', r: 4 }}
            stroke="#2563eb"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-4 px-2">
        <div>
          <div className="text-xs text-gray-500">Start Balance</div>
          <div className="text-gray-900">{formatCurrency(startBalance)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">
            Current ({currentPoint?.date ?? 'N/A'})
          </div>
          <div className="text-blue-600">
            {formatCurrency(currentPoint?.value ?? 0)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Projected End</div>
          <div className="text-gray-900">{formatCurrency(projectedEnd)}</div>
        </div>
      </div>
    </div>
  );
}
