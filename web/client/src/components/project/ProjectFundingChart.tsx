import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';

type FundingKey = 'sponsored' | 'spfabrication' | 'spcapital' | 'internal';

const COLORS: Record<FundingKey, string> = {
  internal: '#f08a00',
  spcapital: '#6ec1d6',
  spfabrication: '#16a2c5',
  sponsored: '#1f4db8',
};

const LABELS: Record<FundingKey, string> = {
  internal: 'Internal',
  spcapital: 'Sponsored Capital',
  spfabrication: 'Sponsored Fabrication',
  sponsored: 'Sponsored',
};

const raw: Record<FundingKey, number> = {
  internal: 20_440,
  spcapital: 20_440,
  spfabrication: 100_440,
  sponsored: 100_440,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

export function ProjectFundingChart() {
  const keys = Object.keys(raw) as FundingKey[];
  const total = keys.reduce((t, k) => t + raw[k], 0);

  const percents = keys.map((k) => (raw[k] / total) * 100);

  const data = [
    keys.reduce(
      (acc, k) => {
        acc[k] = (raw[k] / total) * 100;
        return acc;
      },
      { name: 'Funding' } as { name: string } & Record<FundingKey, number>
    ),
  ];

  return (
    <div className="w-full">
      <p className="text-lg mb-4">
        Available balance broken down by funding source.
      </p>
      <div className="mb-10 flex flex-wrap gap-x-10 gap-y-3">
        {keys.map((key) => (
          <div className="flex items-center gap-2" key={key}>
            <span
              className="inline-block h-5 w-5 rounded-md"
              style={{ backgroundColor: COLORS[key] }}
            />
            <span>{LABELS[key]}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="border border-main-border rounded-lg p-1">
          <div className="w-full h-12">
            <ResponsiveContainer>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ bottom: 0, left: 0, right: 0, top: 0 }}
              >
                <XAxis domain={[0, 100]} hide type="number" />
                <YAxis dataKey="name" hide type="category" />

                <Tooltip
                  cursor={false}
                  formatter={(value: number, key: FundingKey) => [
                    `${formatCurrency(raw[key])} (${value.toFixed(0)}%)`,
                    LABELS[key],
                  ]}
                />

                {keys.map((key, index) => (
                  <Bar
                    barSize={44}
                    dataKey={key}
                    fill={COLORS[key]}
                    isAnimationActive
                    key={key}
                    stackId="a"
                  >
                    <Cell
                      radius={
                        index === 0
                          ? [6, 0, 0, 6] // left rounded
                          : index === keys.length - 1
                            ? [0, 6, 6, 0] // right rounded
                            : 0
                      }
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="mt-3 grid text-sm"
          style={{
            gridTemplateColumns: percents.map((p) => `${p}%`).join(' '),
          }}
        >
          {keys.map((key) => {
            const pct = Math.round((raw[key] / total) * 100);
            return (
              <div className="min-w-0" key={key}>
                <div
                  className="truncate ps-1"
                  title={`${formatCurrency(raw[key])} (${pct}%)`}
                >
                  {formatCurrency(raw[key])} ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
