import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const data = [
  { date: '05.23.2012', value: 212_889.95 },
  { date: '07.15.2013', value: 195_000 },
  { date: '02.28.2015', value: 165_000 },
  { date: '08.12.2016', value: 145_000 },
  { date: '03.05.2018', value: 125_000 },
  { date: '11.18.2020', value: 98_000 },
  { date: '05.30.2022', value: 75_000 },
  { date: '01.15.2024', value: 55_000 },
  { date: '11.9.2025', value: 30_719.77 },
  { date: '08.23.2029', value: 0 },
];

export function ProjectChart() {
  return (
    <div className="h-64">
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
            formatter={(value: number) => [
              `$${value.toLocaleString()}`,
              'Balance',
            ]}
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
          <div className="text-gray-900">$212,889.95</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">Current (11.9.2025)</div>
          <div className="text-blue-600">$30,719.77</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Projected End</div>
          <div className="text-gray-900">$0.00</div>
        </div>
      </div>
    </div>
  );
}
