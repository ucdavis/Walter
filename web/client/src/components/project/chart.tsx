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
