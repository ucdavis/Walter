import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import {
  useFinancialSummaryQuery,
  useFinancialSummaryOptions,
  type FinancialSummaryOption,
  type FinancialSummaryRow,
  type FinancialSummaryFilters,
} from '@/queries/financialSummary.ts';
import {
  DIMENSIONS,
  MEASURES,
  activeColumns,
  rowGroupLabel,
  type MeasureDef,
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

const GROUP_BY_OPTIONS: FilterOption[] = DIMENSIONS.map((d) => ({
  label: d.label,
  value: d.key,
}));

const optionLabel = (o: FinancialSummaryOption): string =>
  o.name && o.name !== o.code ? `${o.code} — ${o.name}` : o.code;

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

  const query = useMemo(
    () => ({
      dimensions,
      ...filters,
      financialDepartments: department.length > 0 ? department : undefined,
    }),
    [dimensions, filters, department]
  );

  const { data: rows = [], isError, isFetching } = useFinancialSummaryQuery(query);

  const deptOptions = useFinancialSummaryOptions('Dept', {});
  const fundOptions = useFinancialSummaryOptions('Fund', query, department.length > 0);
  const accountOptions = useFinancialSummaryOptions('Account', query, department.length > 0);
  const purposeOptions = useFinancialSummaryOptions('Purpose', query, department.length > 0);
  const projectOptions = useFinancialSummaryOptions('Project', query, department.length > 0);
  const activityOptions = useFinancialSummaryOptions('Activity', query, department.length > 0);
  // Single current-period snapshot; drives the "balances as of" header.
  const periodOptions = useFinancialSummaryOptions('Period', {});
  const asOfPeriod = periodOptions.data?.[0]?.code;

  const cols = useMemo(() => activeColumns(dimensions), [dimensions]);

  const totals = useMemo(() => {
    const sums = Object.fromEntries(MEASURES.map((m) => [m.key, 0])) as Record<
      MeasureDef['key'],
      number
    >;
    for (const r of rows) {
      for (const m of MEASURES) {
        sums[m.key] += r[m.key];
      }
    }
    return sums;
  }, [rows]);

  const columns = useMemo(() => {
    const dimCols = cols.map((d, i) =>
      columnHelper.accessor((row) => rowGroupLabel(row, [d.key]), {
        cell: (info) => <span>{info.getValue()}</span>,
        footer: i === 0 ? () => <span className="font-semibold">Total</span> : undefined,
        header: d.label,
        id: d.key,
      })
    );
    const measure = (m: MeasureDef) =>
      columnHelper.accessor(m.key, {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end font-semibold">
            {formatCurrency(totals[m.key])}
          </span>
        ),
        header: () => <span className="flex justify-end">{m.label}</span>,
      });
    return [...dimCols, ...MEASURES.map(measure)];
  }, [cols, totals]);

  const csvColumns = useMemo(
    () => [
      ...cols.flatMap((d) => [
        { header: `${d.label} Code`, key: d.codeField },
        { header: `${d.label} Description`, key: d.descField },
      ]),
      ...MEASURES.map((m) => ({
        format: 'currency' as const,
        header: m.label,
        key: m.key,
      })),
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
  // clears the dependent filters to avoid keeping now-out-of-scope values. Clearing
  // it entirely also resets the group-by, since results are always department-scoped.
  const handleDeptChange = (codes: string[]) => {
    setDepartment(codes);
    setFilters({});
    if (codes.length === 0) {
      setDimensions([]);
    }
  };

  return (
    <main className="container">
      <section className="mt-8 mb-6">
        <h1 className="h1">College / Department Financial Summary</h1>
        <p className="text-base-content/70">
          Current balances by chart-string segment
          {asOfPeriod ? ` — as of ${asOfPeriod}` : ''}.
        </p>
      </section>

      {/* Filter controls */}
      <section className="mb-6 grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Department — hierarchy-aware multi-select, always enabled; gates the other facets */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Department</span>
          </label>
          <MultiSelectFilter
            loading={deptOptions.isPending}
            onChange={handleDeptChange}
            options={toFilterOptions(deptOptions.data, true)}
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

        {/* Account — hierarchy-aware multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Account</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={accountOptions.isFetching}
            onChange={(vals) => setFilter('accounts', vals)}
            options={toFilterOptions(accountOptions.data, true)}
            placeholder="Any account"
            searchPlaceholder="Search accounts…"
            selected={filters.accounts ?? []}
          />
        </div>

        {/* Purpose — multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Purpose</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={purposeOptions.isFetching}
            onChange={(vals) => setFilter('purposes', vals)}
            options={toFilterOptions(purposeOptions.data)}
            placeholder="Any purpose"
            searchPlaceholder="Search purposes…"
            selected={filters.purposes ?? []}
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

        {/* Activity — multi-select, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Activity</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            loading={activityOptions.isFetching}
            onChange={(vals) => setFilter('activities', vals)}
            options={toFilterOptions(activityOptions.data)}
            placeholder="Any activity"
            searchPlaceholder="Search activities…"
            selected={filters.activities ?? []}
          />
        </div>

        {/* Group-by — multi-select over the child-level segments, disabled until department chosen */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Group by</span>
          </label>
          <MultiSelectFilter
            disabled={department.length === 0}
            onChange={setDimensions}
            options={GROUP_BY_OPTIONS}
            placeholder="Choose segments…"
            searchPlaceholder="Search segments…"
            selected={dimensions}
          />
        </div>
      </section>

      {/* Results area */}
      {department.length === 0 ? (
        <p className="text-base-content/70 mt-4">
          Pick one or more departments to get started.
        </p>
      ) : dimensions.length === 0 ? (
        <p className="text-base-content/70 mt-4">
          Choose one or more group-by segments to see results.
        </p>
      ) : isFetching ? (
        <p className="text-base-content/80 mt-4">Loading financial summary…</p>
      ) : isError ? (
        <p className="text-error mt-4">Error loading financial summary.</p>
      ) : (
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
      )}
    </main>
  );
}
