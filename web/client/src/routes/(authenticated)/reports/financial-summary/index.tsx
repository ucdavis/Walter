import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useFinancialSummaryQuery,
  useFinancialSummaryOptions,
  type FinancialSummaryRow,
  type FinancialSummaryFilters,
} from '@/queries/financialSummary.ts';
import {
  DIMENSIONS,
  activeColumns,
  buildChartData,
  rowGroupLabel,
} from '@/lib/financialSummary.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';

export const Route = createFileRoute(
  '/(authenticated)/reports/financial-summary/'
)({
  component: RouteComponent,
});

const columnHelper = createColumnHelper<FinancialSummaryRow>();

// Dimension groups for the group-by picker optgroups
const DIMENSION_GROUPS = [
  {
    dims: DIMENSIONS.filter((d) => d.key.startsWith('FinancialDept')),
    label: 'Financial Department',
  },
  {
    dims: DIMENSIONS.filter(
      (d) => d.key === 'Fund' || d.key.startsWith('FundParent')
    ),
    label: 'Fund',
  },
  {
    dims: DIMENSIONS.filter((d) => d.key === 'Program'),
    label: 'Program',
  },
  {
    dims: DIMENSIONS.filter(
      (d) => d.key === 'Activity' || d.key.startsWith('ActivityParent')
    ),
    label: 'Activity',
  },
  {
    dims: DIMENSIONS.filter((d) => d.key === 'Project'),
    label: 'Project',
  },
  {
    dims: DIMENSIONS.filter(
      (d) =>
        d.key === 'NaturalAccount' || d.key.startsWith('NaturalAccountParent')
    ),
    label: 'Natural Account',
  },
];

function getSelectedValues(e: React.ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(e.target.selectedOptions, (opt) => opt.value);
}

function RouteComponent() {
  const [department, setDepartment] = useState<string | null>(null);
  const [filters, setFilters] = useState<FinancialSummaryFilters>({});
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [timeMode, setTimeMode] = useState<'year' | 'period'>('year');

  const query = useMemo(
    () => ({
      dimensions,
      ...filters,
      financialDepartments: department ? [department] : undefined,
    }),
    [dimensions, filters, department]
  );

  const { data: rows = [], isError, isFetching } = useFinancialSummaryQuery(query);
  const chartData = useMemo(
    () => buildChartData(rows, dimensions),
    [rows, dimensions]
  );

  const deptOptions = useFinancialSummaryOptions('FinancialDept', {});
  const fundOptions = useFinancialSummaryOptions('Fund', query, !!department);
  const programOptions = useFinancialSummaryOptions('Program', query, !!department);
  const activityOptions = useFinancialSummaryOptions('Activity', query, !!department);
  const projectOptions = useFinancialSummaryOptions('Project', query, !!department);
  const naturalAccountOptions = useFinancialSummaryOptions(
    'NaturalAccount',
    query,
    !!department
  );
  const fiscalYearOptions = useFinancialSummaryOptions('FiscalYear', query);
  const periodOptions = useFinancialSummaryOptions('Period', query);

  const sortedPeriodOptions = useMemo(() => {
    const opts = periodOptions.data ?? [];
    return [...opts].sort((a, b) =>
      (a.sortKey ?? '').localeCompare(b.sortKey ?? '')
    );
  }, [periodOptions.data]);

  const cols = useMemo(() => activeColumns(dimensions), [dimensions]);

  const columns = useMemo(() => {
    const dimCols = cols.map((d) =>
      columnHelper.display({
        cell: (info) => (
          <span>{rowGroupLabel(info.row.original, [d.key])}</span>
        ),
        header: d.label,
        id: d.key,
      })
    );
    const measure = (id: 'income' | 'expense' | 'net', header: string) =>
      columnHelper.accessor(id, {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">{header}</span>,
      });
    return [
      ...dimCols,
      measure('income', 'Income'),
      measure('expense', 'Expense'),
      measure('net', 'Net'),
    ];
  }, [cols]);

  const csvColumns = useMemo(
    () => [
      ...cols.flatMap((d) => [
        { header: `${d.label} Code`, key: d.codeField },
        { header: `${d.label} Name`, key: d.nameField },
      ]),
      {
        format: 'currency' as const,
        header: 'Income',
        key: 'income' as const,
      },
      {
        format: 'currency' as const,
        header: 'Expense',
        key: 'expense' as const,
      },
      { format: 'currency' as const, header: 'Net', key: 'net' as const },
    ],
    [cols]
  );

  const setFilter = <K extends keyof FinancialSummaryFilters>(
    key: K,
    values: string[]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: values.length > 0 ? values : undefined,
    }));
  };

  const handleDeptChange = (code: string | null) => {
    setDepartment(code);
    setFilters({});
  };

  const handleTimeModeChange = (mode: 'year' | 'period') => {
    setTimeMode(mode);
    if (mode === 'year') {
      setFilters((prev) => ({ ...prev, periods: undefined }));
    } else {
      setFilters((prev) => ({ ...prev, fiscalYears: undefined }));
    }
  };

  return (
    <main className="container">
      <section className="mt-8 mb-6">
        <h1 className="h1">College / Department Financial Summary</h1>
        <p className="text-base-content/70">
          Income, expense, and net by chart-string segment.
        </p>
      </section>

      {/* Filter controls */}
      <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Department — single select, always enabled */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Department</span>
          </label>
          <select
            className="select select-bordered w-full"
            onChange={(e) => handleDeptChange(e.target.value || null)}
            value={department ?? ''}
          >
            <option value="">Pick a department…</option>
            {(deptOptions.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code} — {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Fund — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Fund</span>
          </label>
          <select
            className="select select-bordered w-full"
            disabled={!department}
            multiple
            onChange={(e) => setFilter('funds', getSelectedValues(e))}
            size={4}
            value={filters.funds ?? []}
          >
            {(fundOptions.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code}
                {opt.level && opt.level !== 'Leaf'
                  ? ` (L${opt.level} rollup)`
                  : ''}{' '}
                — {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Program — multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Program</span>
          </label>
          <select
            className="select select-bordered w-full"
            disabled={!department}
            multiple
            onChange={(e) => setFilter('programs', getSelectedValues(e))}
            size={4}
            value={filters.programs ?? []}
          >
            {(programOptions.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code} — {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Activity — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Activity</span>
          </label>
          <select
            className="select select-bordered w-full"
            disabled={!department}
            multiple
            onChange={(e) => setFilter('activities', getSelectedValues(e))}
            size={4}
            value={filters.activities ?? []}
          >
            {(activityOptions.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code}
                {opt.level && opt.level !== 'Leaf'
                  ? ` (L${opt.level} rollup)`
                  : ''}{' '}
                — {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Project — multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Project</span>
          </label>
          <select
            className="select select-bordered w-full"
            disabled={!department}
            multiple
            onChange={(e) => setFilter('projects', getSelectedValues(e))}
            size={4}
            value={filters.projects ?? []}
          >
            {(projectOptions.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code} — {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Natural Account — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Natural Account</span>
          </label>
          <select
            className="select select-bordered w-full"
            disabled={!department}
            multiple
            onChange={(e) => setFilter('naturalAccounts', getSelectedValues(e))}
            size={4}
            value={filters.naturalAccounts ?? []}
          >
            {(naturalAccountOptions.data ?? []).map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code}
                {opt.level && opt.level !== 'Leaf'
                  ? ` (L${opt.level} rollup)`
                  : ''}{' '}
                — {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Group-by — multi-select over all 27 DIMENSIONS, grouped by segment */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Group by</span>
          </label>
          <select
            className="select select-bordered w-full"
            multiple
            onChange={(e) => setDimensions(getSelectedValues(e))}
            size={6}
            value={dimensions}
          >
            {DIMENSION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.dims.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Time — year/period toggle with multi-select */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Time</span>
          </label>
          <div className="join mb-2">
            <button
              className={`join-item btn btn-sm ${
                timeMode === 'year' ? 'btn-primary' : 'btn-outline'
              }`}
              onClick={() => handleTimeModeChange('year')}
              type="button"
            >
              Fiscal Year
            </button>
            <button
              className={`join-item btn btn-sm ${
                timeMode === 'period' ? 'btn-primary' : 'btn-outline'
              }`}
              onClick={() => handleTimeModeChange('period')}
              type="button"
            >
              Period
            </button>
          </div>
          {timeMode === 'year' ? (
            <select
              className="select select-bordered w-full"
              multiple
              onChange={(e) => setFilter('fiscalYears', getSelectedValues(e))}
              size={4}
              value={filters.fiscalYears ?? []}
            >
              {(fiscalYearOptions.data ?? []).map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name || opt.code}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="select select-bordered w-full"
              multiple
              onChange={(e) => setFilter('periods', getSelectedValues(e))}
              size={4}
              value={filters.periods ?? []}
            >
              {sortedPeriodOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name || opt.code}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* Results area */}
      {dimensions.length === 0 ? (
        <p className="text-base-content/70 mt-4">
          Choose one or more group-by segments to see results.
        </p>
      ) : isFetching ? (
        <p className="text-base-content/80 mt-4">Loading financial summary…</p>
      ) : isError ? (
        <p className="text-error mt-4">Error loading financial summary.</p>
      ) : (
        <>
          {/* Chart */}
          <div className="h-80 mb-6">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={chartData}
                margin={{ bottom: 8, left: 8, right: 24, top: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  tickFormatter={(v: number) =>
                    `$${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="income"
                  fill="var(--color-success)"
                  name="Income"
                />
                <Bar
                  dataKey="expense"
                  fill="var(--color-error)"
                  name="Expense"
                />
                <Bar dataKey="net" fill="var(--color-primary)" name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <DataTable
            columns={columns}
            data={rows}
            globalFilter="none"
            pagination="off"
            tableActions={
              <ExportDataButton
                columns={csvColumns}
                data={rows}
                filename="financial-summary.csv"
              />
            }
          />
        </>
      )}
    </main>
  );
}
