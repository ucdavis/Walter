import type { ComponentType, SVGProps } from 'react';
import {
  ArrowTrendingDownIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  FireIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
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
import { ColumnDef } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import {
  type AccrualDepartmentBreakdownRow,
  type AccrualOverviewResponse,
} from '@/queries/accrual.ts';
import { DataTable } from '@/shared/DataTable.tsx';

const asOfDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const axisCurrencyFormatter = (value: number) => {
  if (Math.abs(value) >= 1000) {
    return `$${Math.round(value / 1000)}k`;
  }

  return formatCurrency(value);
};

const percentFormatter = (value: number) => `${value.toFixed(1)}%`;

const hoursFormatter = (value: number) =>
  `${Math.round(value).toLocaleString('en-US')} hrs`;

const departmentCsvColumns = [
  { header: 'Department', key: 'department' as const },
  { header: 'Headcount', key: 'headcount' as const },
  { header: 'At Cap', key: 'atCapCount' as const },
  { header: 'Near Cap', key: 'approachingCapCount' as const },
  {
    format: 'currency' as const,
    header: 'Lost Cost/Mo',
    key: 'lostCostMonth' as const,
  },
  {
    format: 'currency' as const,
    header: 'Lost Cost YTD',
    key: 'lostCostYtd' as const,
  },
  { header: 'Avg Balance Hours', key: 'avgBalanceHours' as const },
];

type SummaryCardProps = {
  accentClassName: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
};

function SummaryCard({
  accentClassName,
  description,
  Icon,
  label,
  value,
}: SummaryCardProps) {
  return (
    <section className="card bg-base-100 border border-main-border shadow-sm">
      <div className="card-body gap-3 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase text-base-content/60">
          <Icon className={`h-4 w-4 ${accentClassName}`} />
          <span>{label}</span>
        </div>
        <div className={`text-4xl font-semibold ${accentClassName}`}>
          {value}
        </div>
        <p className="text-sm text-base-content/65">{description}</p>
      </div>
    </section>
  );
}

interface VacationAccrualOverviewProps {
  data: AccrualOverviewResponse;
}

export function VacationAccrualOverview({
  data,
}: VacationAccrualOverviewProps) {
  if (data.totalEmployees === 0) {
    return (
      <PageEmpty message="No vacation accrual balances are available for the overview yet." />
    );
  }

  const asOfDate = data.asOfDate ? new Date(data.asOfDate) : null;
  const departmentColumns: ColumnDef<AccrualDepartmentBreakdownRow>[] = [
    {
      accessorKey: 'department',
      footer: () => 'CAES Total',
      header: 'Department',
      minSize: 260,
      size: 320,
    },
    {
      accessorKey: 'headcount',
      cell: (info) => (
        <span className="flex justify-end w-full">
          {info.getValue<number>().toLocaleString('en-US')}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full font-semibold">
          {data.totalEmployees.toLocaleString('en-US')}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Headcount</span>,
      size: 120,
    },
    {
      accessorKey: 'atCapCount',
      cell: (info) => (
        <span className="flex justify-end w-full text-error font-semibold">
          {info.getValue<number>().toLocaleString('en-US')}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-error font-semibold">
          {data.atCapCount.toLocaleString('en-US')}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">At Cap</span>,
      size: 120,
    },
    {
      accessorKey: 'approachingCapCount',
      cell: (info) => (
        <span className="flex justify-end w-full text-warning font-semibold">
          {info.getValue<number>().toLocaleString('en-US')}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-warning font-semibold">
          {data.approachingCapCount.toLocaleString('en-US')}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Near Cap</span>,
      size: 120,
    },
    {
      accessorKey: 'lostCostMonth',
      cell: (info) => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(info.getValue<number>())}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(data.lostCostMonth)}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Lost Cost/Mo</span>,
      size: 160,
    },
    {
      accessorKey: 'lostCostYtd',
      cell: (info) => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(info.getValue<number>())}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-error font-semibold">
          {formatCurrency(data.lostCostYtd)}
        </span>
      ),
      header: () => <span className="flex justify-end w-full">Lost Cost YTD</span>,
      size: 170,
    },
    {
      accessorKey: 'avgBalanceHours',
      cell: (info) => (
        <span className="flex justify-end w-full">
          {hoursFormatter(info.getValue<number>())}
        </span>
      ),
      footer: () => (
        <span className="flex justify-end w-full text-base-content/55">-</span>
      ),
      header: () => <span className="flex justify-end w-full">Avg Balance</span>,
      size: 140,
    },
  ];

  return (
    <main className="mt-8">
      <div className="container">
        <div className="mx-auto max-w-7xl space-y-8">
          <section>
            <h1 className="h1">Vacation Accrual Overview</h1>
            <p className="mt-2 text-sm text-base-content/65">
              {data.totalEmployees.toLocaleString('en-US')} employees across{' '}
              {data.totalDepartments.toLocaleString('en-US')} departments
              {asOfDate ? (
                <> as of {asOfDateFormatter.format(asOfDate)}</>
              ) : null}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              accentClassName="text-error"
              description="Estimated unrecoverable accrual charges for the latest month-end snapshot."
              Icon={FireIcon}
              label="Lost Cost (Month)"
              value={formatCurrency(data.lostCostMonth)}
            />
            <SummaryCard
              accentClassName="text-error"
              description={`Estimated fiscal year-to-date using ${data.ytdMonthCount} month${data.ytdMonthCount === 1 ? '' : 's'} of exposure.`}
              Icon={ChartBarIcon}
              label="Lost Cost (YTD)"
              value={formatCurrency(data.lostCostYtd)}
            />
            <SummaryCard
              accentClassName="text-error"
              description={`of ${data.totalEmployees.toLocaleString('en-US')} employees`}
              Icon={NoSymbolIcon}
              label="At Cap"
              value={data.atCapCount.toLocaleString('en-US')}
            />
            <SummaryCard
              accentClassName="text-warning"
              description="80% to 99% of maximum balance"
              Icon={ExclamationTriangleIcon}
              label="Approaching Cap"
              value={data.approachingCapCount.toLocaleString('en-US')}
            />
            <SummaryCard
              accentClassName="text-secondary"
              description="Lost cost divided by estimated monthly accrual charges"
              Icon={ArrowTrendingDownIcon}
              label="Waste Rate"
              value={percentFormatter(data.wasteRate)}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="card bg-base-100 border border-main-border shadow-sm">
              <div className="card-body p-5">
                <h2 className="text-xl font-semibold text-base-content">
                  Monthly Lost Accrual Cost
                </h2>
                <div className="mt-4 h-80">
                  <ResponsiveContainer height="100%" width="100%">
                    <LineChart
                      data={data.monthlyLostCost}
                      margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
                    >
                      <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={axisCurrencyFormatter}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E9E3EE',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [
                          formatCurrency(value),
                          'Lost cost',
                        ]}
                        labelFormatter={(label: string) => `Month: ${label}`}
                      />
                      <Line
                        activeDot={{ r: 5 }}
                        dataKey="lostCost"
                        dot={{ fill: 'var(--color-error)', r: 3 }}
                        name="Lost Cost"
                        stroke="var(--color-error)"
                        strokeWidth={2.5}
                        type="monotone"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>

            <article className="card bg-base-100 border border-main-border shadow-sm">
              <div className="card-body p-5">
                <h2 className="text-xl font-semibold text-base-content">
                  Employee Accrual Status Over Time
                </h2>
                <div className="mt-4 h-80">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      data={data.employeeStatusOverTime}
                      margin={{ bottom: 8, left: 8, right: 16, top: 8 }}
                    >
                      <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E9E3EE',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="active"
                        fill="var(--color-success)"
                        name="Active"
                        stackId="status"
                      />
                      <Bar
                        dataKey="approaching"
                        fill="var(--color-warning)"
                        name="Approaching"
                        stackId="status"
                      />
                      <Bar
                        dataKey="atCap"
                        fill="var(--color-error)"
                        name="At Cap"
                        stackId="status"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>
          </section>

          <section className="card bg-base-100 border border-main-border shadow-sm">
            <div className="card-body gap-4 p-0">
              <div className="flex items-center justify-between px-5 pt-5">
                <div>
                  <h2 className="text-xl font-semibold text-base-content">
                    Department Breakdown
                  </h2>
                  <p className="mt-1 text-sm text-base-content/60">
                    Drilldown comes next. This page starts with the
                    college-level overview and live department rollup.
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5">
                <DataTable
                  columns={departmentColumns}
                  data={data.departmentBreakdown}
                  defaultColumnSize={160}
                  expandable={false}
                  filterPlaceholder="Search departments..."
                  footerRowClassName="totaltr bg-base-200/70"
                  initialState={{
                    pagination: { pageSize: 50 },
                    sorting: [{ desc: false, id: 'department' }],
                  }}
                  tableActions={
                    <ExportDataButton
                      columns={departmentCsvColumns}
                      data={data.departmentBreakdown}
                      filename="vacation-accrual-department-breakdown.csv"
                    />
                  }
                  tableClassName="table-zebra"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
