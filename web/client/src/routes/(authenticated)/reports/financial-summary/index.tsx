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
  type FinancialSummaryOption,
  type FinancialSummaryRow,
  type FinancialSummaryFilters,
} from '@/queries/financialSummary.ts';
import {
  DIMENSIONS,
  activeColumns,
  buildChartData,
  rowGroupLabel,
} from '@/lib/financialSummary.ts';
import {
  MultiSelectFilter,
  type FilterOption,
} from '@/shared/MultiSelectFilter.tsx';
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

// Group-by picker options, flattened from DIMENSION_GROUPS into grouped FilterOptions.
const GROUP_BY_OPTIONS: FilterOption[] = DIMENSION_GROUPS.flatMap((g) =>
  g.dims.map((d) => ({ group: g.label, label: d.label, value: d.key }))
);

const optionLabel = (o: FinancialSummaryOption): string =>
  o.name ? `${o.code} — ${o.name}` : o.code;

// Map filter-option rows to FilterOptions; hierarchy facets surface the rollup level as a hint.
const toFilterOptions = (
  opts: FinancialSummaryOption[] | undefined,
  hierarchy = false
): FilterOption[] =>
  (opts ?? []).map((o) => ({
    hint:
      hierarchy && o.level && o.level !== 'Leaf'
        ? `L${o.level} rollup`
        : undefined,
    label: optionLabel(o),
    value: o.code,
  }));

function RouteComponent() {
  const [department, setDepartment] = useState<string[]>([]);
  const [filters, setFilters] = useState<FinancialSummaryFilters>({});
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [timeMode, setTimeMode] = useState<'year' | 'period'>('year');

  const query = useMemo(
    () => ({
      dimensions,
      ...filters,
      financialDepartments: department.length > 0 ? department : undefined,
    }),
    [dimensions, filters, department]
  );

  const { data: rows = [], isError, isFetching } = useFinancialSummaryQuery(query);
  const chartData = useMemo(
    () => buildChartData(rows, dimensions),
    [rows, dimensions]
  );

  const deptOptions = useFinancialSummaryOptions('FinancialDept', {});
  const fundOptions = useFinancialSummaryOptions('Fund', query, department.length > 0);
  const programOptions = useFinancialSummaryOptions('Program', query, department.length > 0);
  const activityOptions = useFinancialSummaryOptions('Activity', query, department.length > 0);
  const projectOptions = useFinancialSummaryOptions('Project', query, department.length > 0);
  const naturalAccountOptions = useFinancialSummaryOptions(
    'NaturalAccount',
    query,
    department.length > 0
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

  // Department drives the scope of every other facet, so changing the selection
  // clears the dependent filters to avoid keeping now-out-of-scope values.
  const handleDeptChange = (codes: string[]) => {
    setDepartment(codes);
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
      <section className="mb-6 grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Department — multi-select, always enabled; gates the other facets */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Department</span>
          </label>
          <MultiSelectFilter
            loading={deptOptions.isPending}
            onChange={handleDeptChange}
            options={toFilterOptions(deptOptions.data)}
            placeholder="Pick departments…"
            searchPlaceholder="Search departments…"
            selected={department}
          />
        </div>

        {/* Fund — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Fund</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={fundOptions.isFetching}
            onChange={(vals) => setFilter('funds', vals)}
            options={toFilterOptions(fundOptions.data, true)}
            placeholder="Any fund"
            searchPlaceholder="Search funds…"
            selected={filters.funds ?? []}
          />
        </div>

        {/* Program — multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Program</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={programOptions.isFetching}
            onChange={(vals) => setFilter('programs', vals)}
            options={toFilterOptions(programOptions.data)}
            placeholder="Any program"
            searchPlaceholder="Search programs…"
            selected={filters.programs ?? []}
          />
        </div>

        {/* Activity — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Activity</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={activityOptions.isFetching}
            onChange={(vals) => setFilter('activities', vals)}
            options={toFilterOptions(activityOptions.data, true)}
            placeholder="Any activity"
            searchPlaceholder="Search activities…"
            selected={filters.activities ?? []}
          />
        </div>

        {/* Project — multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Project</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={projectOptions.isFetching}
            onChange={(vals) => setFilter('projects', vals)}
            options={toFilterOptions(projectOptions.data)}
            placeholder="Any project"
            searchPlaceholder="Search projects…"
            selected={filters.projects ?? []}
          />
        </div>

        {/* Natural Account — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Natural Account</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={naturalAccountOptions.isFetching}
            onChange={(vals) => setFilter('naturalAccounts', vals)}
            options={toFilterOptions(naturalAccountOptions.data, true)}
            placeholder="Any natural account"
            searchPlaceholder="Search natural accounts…"
            selected={filters.naturalAccounts ?? []}
          />
        </div>

        {/* Group-by — multi-select over all 27 DIMENSIONS, grouped by segment */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Group by</span>
          </label>
          <MultiSelectFilter
            onChange={setDimensions}
            options={GROUP_BY_OPTIONS}
            placeholder="Choose segments…"
            searchPlaceholder="Search segments…"
            selected={dimensions}
          />
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
            <MultiSelectFilter
              loading={fiscalYearOptions.isFetching}
              onChange={(vals) => setFilter('fiscalYears', vals)}
              options={toFilterOptions(fiscalYearOptions.data)}
              placeholder="All fiscal years"
              searchPlaceholder="Search fiscal years…"
              selected={filters.fiscalYears ?? []}
            />
          ) : (
            <MultiSelectFilter
              loading={periodOptions.isFetching}
              onChange={(vals) => setFilter('periods', vals)}
              options={toFilterOptions(sortedPeriodOptions)}
              placeholder="All periods"
              searchPlaceholder="Search periods…"
              selected={filters.periods ?? []}
            />
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
