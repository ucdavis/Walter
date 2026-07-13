import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useDepartmentBalancesQuery,
  useDepartmentBalanceOptions,
  type DepartmentBalanceOption,
  type DepartmentBalanceRow,
  type DepartmentBalancesFilters,
} from '@/queries/departmentBalances.ts';
import {
  chartStringLabelsQueryKey,
  upsertChartStringLabel,
  useChartStringLabels,
  type LabelSegments,
} from '@/queries/chartStringLabels.ts';
import {
  DIMENSIONS,
  MEASURES,
  activeColumns,
  labelKeyOf,
  rowGroupLabel,
  rowLabelSegments,
  type MeasureDef,
} from '@/lib/departmentBalances.ts';
import {
  MultiSelectFilter,
  type FilterOption,
} from '@/shared/MultiSelectFilter.tsx';
import { DataTable } from '@/shared/DataTable.tsx';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { canAccessDepartmentBalances } from '@/shared/auth/roleAccess.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { RouterContext } from '@/main.tsx';
import { redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/reports/department-balances/'
)({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!canAccessDepartmentBalances(user.roles)) {
      throw redirect({ to: '/' });
    }
  },
  component: RouteComponent,
});

// Report row enriched with its shared label (matched by exact segment-combination key).
type LabeledRow = DepartmentBalanceRow & { label: string };

const columnHelper = createColumnHelper<LabeledRow>();

// Inline-editable cell for the shared Label column: save on blur/Enter, empty text deletes.
// Uncontrolled input remounted (via key on the call site) when the saved label changes.
// Hovering a saved label shows who wrote it and when.
function LabelCell({
  label,
  provenance,
  segments,
}: {
  label: string;
  provenance?: string;
  segments: LabelSegments;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (text: string) =>
      upsertChartStringLabel({ ...segments, text }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: chartStringLabelsQueryKey }),
  });

  return (
    <input
      className={`input input-sm input-ghost w-full min-w-40 ${
        mutation.isError ? 'input-error' : ''
      }`}
      defaultValue={label}
      maxLength={500}
      onBlur={(e) => {
        const text = e.target.value.trim();
        if (text !== label) {
          mutation.mutate(text);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      placeholder="Add label…"
      title={mutation.isError ? 'Failed to save label' : provenance}
      type="text"
    />
  );
}

const GROUP_BY_OPTIONS: FilterOption[] = DIMENSIONS.map((d) => ({
  label: d.label,
  value: d.key,
}));

const optionLabel = (o: DepartmentBalanceOption): string =>
  o.name && o.name !== o.code ? `${o.code} — ${o.name}` : o.code;

// Map filter-option rows to FilterOptions. Hierarchy facets split into two groups —
// "Rollups" (picking one selects its whole subtree) and "Values" — alphabetical within
// each. AE's parent-level numbers are positional padding over ragged trees, so the
// level itself is never shown.
const toFilterOptions = (
  opts: DepartmentBalanceOption[] | undefined,
  hierarchy = false
): FilterOption[] => {
  const mapped = (opts ?? []).map((o) => ({
    group: hierarchy
      ? o.level === 'Leaf'
        ? 'Values'
        : 'Rollups'
      : undefined,
    label: optionLabel(o),
    value: o.code,
  }));
  if (!hierarchy) {
    return mapped;
  }
  const byLabel = (a: FilterOption, b: FilterOption) =>
    a.label.localeCompare(b.label);
  return [
    ...mapped.filter((o) => o.group === 'Rollups').sort(byLabel),
    ...mapped.filter((o) => o.group === 'Values').sort(byLabel),
  ];
};

function RouteComponent() {
  const [department, setDepartment] = useState<string[]>([]);
  const [filters, setFilters] = useState<DepartmentBalancesFilters>({});
  const [dimensions, setDimensions] = useState<string[]>([]);

  const query = useMemo(
    () => ({
      dimensions,
      ...filters,
      financialDepartments: department.length > 0 ? department : undefined,
    }),
    [dimensions, filters, department]
  );

  const { data: rows = [], isError, isFetching } = useDepartmentBalancesQuery(query);
  const { data: labels = [] } = useChartStringLabels();

  // Match shared labels to rows by exact segment-combination key.
  const labelsByKey = useMemo(
    () => new Map(labels.map((l) => [labelKeyOf(l), l])),
    [labels]
  );
  const labeledRows = useMemo(
    () =>
      rows.map(
        (r): LabeledRow => ({
          ...r,
          label: labelsByKey.get(labelKeyOf(rowLabelSegments(r, dimensions)))?.text ?? '',
        })
      ),
    [rows, labelsByKey, dimensions]
  );

  const deptOptions = useDepartmentBalanceOptions('Dept', {});
  const fundOptions = useDepartmentBalanceOptions('Fund', query, department.length > 0);
  const accountOptions = useDepartmentBalanceOptions('Account', query, department.length > 0);
  const purposeOptions = useDepartmentBalanceOptions('Purpose', query, department.length > 0);
  const projectOptions = useDepartmentBalanceOptions('Project', query, department.length > 0);
  const activityOptions = useDepartmentBalanceOptions('Activity', query, department.length > 0);
  // Single current-period snapshot; drives the "balances as of" header.
  const periodOptions = useDepartmentBalanceOptions('Period', {});
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
    const labelCol = columnHelper.accessor('label', {
      cell: (info) => {
        const segments = rowLabelSegments(info.row.original, dimensions);
        const saved = labelsByKey.get(labelKeyOf(segments));
        return (
          <LabelCell
            key={`${labelKeyOf(segments)}:${info.getValue()}`}
            label={info.getValue()}
            provenance={
              saved
                ? `Added by ${saved.updatedBy ?? 'unknown'} on ${formatDate(saved.updatedAt)}`
                : undefined
            }
            segments={segments}
          />
        );
      },
      header: 'Label',
    });
    return [...dimCols, ...MEASURES.map(measure), labelCol];
  }, [cols, totals, dimensions, labelsByKey]);

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
      { header: 'Label', key: 'label' as const },
    ],
    [cols]
  );

  const setFilter = <K extends keyof DepartmentBalancesFilters>(
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
        <h1 className="h1">Department Balances</h1>
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
            <span className="label-text font-medium">Financial Department</span>
          </label>
          <MultiSelectFilter
            loading={deptOptions.isPending}
            onChange={handleDeptChange}
            options={toFilterOptions(deptOptions.data, true)}
            placeholder="Pick financial departments…"
            searchPlaceholder="Search financial departments…"
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
          Pick one or more financial departments to get started.
        </p>
      ) : dimensions.length === 0 ? (
        <p className="text-base-content/70 mt-4">
          Choose one or more group-by segments to see results.
        </p>
      ) : isFetching ? (
        <p className="text-base-content/80 mt-4">Loading department balances…</p>
      ) : isError ? (
        <p className="text-error mt-4">Error loading department balances.</p>
      ) : (
        <DataTable
          columns={columns}
          data={labeledRows}
          globalFilter="none"
          pagination="off"
          tableActions={
            <ExportDataButton
              columns={csvColumns}
              data={labeledRows}
              filename="department-balances.csv"
            />
          }
        />
      )}
    </main>
  );
}
