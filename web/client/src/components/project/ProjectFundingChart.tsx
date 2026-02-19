import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';

const FUNDING_COLORS: Record<string, string> = {
  internal: '#f08a00',
  sponsored: '#1f4db8',
  'sponsored capital': '#6ec1d6',
  'sponsored fabrication': '#16a2c5',
};

const FALLBACK_COLORS = [
  '#3b82f6',
  '#14b8a6',
  '#ef4444',
  '#84cc16',
  '#f97316',
  '#8b5cf6',
  '#0ea5e9',
  '#eab308',
];

function getFundingColor(key: string, index: number) {
  return (
    FUNDING_COLORS[key.toLowerCase()] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

interface ProjectFundingChartProps {
  projects: ProjectRecord[];
}

export function ProjectFundingChart({ projects }: ProjectFundingChartProps) {
  const totalsByType = projects.reduce<Record<string, number>>(
    (acc, project) => {
      const key = project.projectType || 'Unknown';
      acc[key] = (acc[key] ?? 0) + project.catBudBal;
      return acc;
    },
    {}
  );

  const keys = Object.keys(totalsByType);
  const total = keys.reduce((sum, key) => sum + totalsByType[key], 0);
  const safeTotal = total === 0 ? 1 : total;

  const percents = keys.map((key) => (totalsByType[key] / safeTotal) * 100);

  const data = [
    keys.reduce(
      (acc, key) => {
        acc[key] = (totalsByType[key] / safeTotal) * 100;
        return acc;
      },
      { name: 'Funding' } as { name: string } & Record<string, number>
    ),
  ];

  return (
    <div className="w-full">
      <p className="text-lg mb-4">
        Available balance broken down by funding source.
      </p>
      <div className="mb-10 flex flex-wrap gap-x-10 gap-y-3">
        {keys.map((key, index) => (
          <div className="flex items-center gap-2" key={key}>
            <span
              className="inline-block h-5 w-5 rounded-md"
              style={{ backgroundColor: getFundingColor(key, index) }}
            />
            <span>{key}</span>
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
                  formatter={(value: number, key: string) => [
                    `${formatCurrency(totalsByType[key])} (${value.toFixed(0)}%)`,
                    key,
                  ]}
                />

                {keys.map((key, index) => (
                  <Bar
                    barSize={44}
                    dataKey={key}
                    fill={getFundingColor(key, index)}
                    isAnimationActive
                    key={key}
                    radius={getBarRadius(index, keys.length)}
                    stackId="a"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="mt-3 grid text-sm"
          style={{
            gridTemplateColumns:
              total === 0
                ? keys.map(() => `${100 / keys.length}%`).join(' ')
                : percents.map((p) => `${p}%`).join(' '),
          }}
        >
          {keys.map((key) => {
            const pct = Math.round((totalsByType[key] / safeTotal) * 100);
            return (
              <div className="min-w-0" key={key}>
                <div
                  className="truncate ps-1"
                  title={`${formatCurrency(totalsByType[key])} (${pct}%)`}
                >
                  {formatCurrency(totalsByType[key])} ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Round the corners of the first and last bars
function getBarRadius(
  index: number,
  count: number
): 0 | [number, number, number, number] {
  if (index === 0) {
    return [6, 0, 0, 6];
  }

  if (index === count - 1) {
    return [0, 6, 6, 0];
  }

  return 0;
}
