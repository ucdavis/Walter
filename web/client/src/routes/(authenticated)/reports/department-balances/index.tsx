import { Fragment, useMemo, useState } from 'react';
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
import { TrashIcon, XMarkIcon } from '@heroicons/react/20/solid';
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
    mutationFn: (text: string) => upsertChartStringLabel({ ...segments, text }),
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
  // Dedupe by code, preferring the leaf row — AE's padded parent levels can surface
  // the same code at several "levels" (mirrors the options sproc's dedupe).
  const byCode = new Map<string, DepartmentBalanceOption>();
  for (const o of opts ?? []) {
    const existing = byCode.get(o.code);
    if (!existing || (existing.level !== 'Leaf' && o.level === 'Leaf')) {
      byCode.set(o.code, o);
    }
  }
  const mapped = [...byCode.values()].map((o) => ({
    group: hierarchy ? (o.level === 'Leaf' ? 'Values' : 'Rollups') : undefined,
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

  const {
    data: rows = [],
    isError,
    isFetching,
  } = useDepartmentBalancesQuery(query);
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
          label:
            labelsByKey.get(labelKeyOf(rowLabelSegments(r, dimensions)))
              ?.text ?? '',
        })
      ),
    [rows, labelsByKey, dimensions]
  );

  const deptOptions = useDepartmentBalanceOptions('Dept', {});
  const fundOptions = useDepartmentBalanceOptions(
    'Fund',
    query,
    department.length > 0
  );
  const accountOptions = useDepartmentBalanceOptions(
    'Account',
    query,
    department.length > 0
  );
  const purposeOptions = useDepartmentBalanceOptions(
    'Purpose',
    query,
    department.length > 0
  );
  const projectOptions = useDepartmentBalanceOptions(
    'Project',
    query,
    department.length > 0
  );
  const activityOptions = useDepartmentBalanceOptions(
    'Activity',
    query,
    department.length > 0
  );

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
        footer:
          i === 0
            ? () => <span className="font-semibold">Total</span>
            : undefined,
        header: d.label,
        id: d.key,
        size: 220,
      })
    );
    const measure = (m: MeasureDef) =>
      columnHelper.accessor(m.key, {
        cell: (info) => (
          <span className="block w-full text-right tabular-nums">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="block w-full text-right font-semibold tabular-nums">
            {formatCurrency(totals[m.key])}
          </span>
        ),
        header: () => <span className="block w-full text-right">{m.label}</span>,
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
      size: 260,
    });
    return [...dimCols, labelCol, ...MEASURES.map(measure)];
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

  // Applied-selections panel: every active filter value and group-by field as a
  // removable chip, consolidated to the right of the filter controls.
  const nameOf = (opts: DepartmentBalanceOption[] | undefined, code: string) =>
    opts?.find((o) => o.code === code)?.name;

  const segmentFilterDefs: {
    key: Exclude<keyof DepartmentBalancesFilters, 'financialDepartments'>;
    label: string;
    options: DepartmentBalanceOption[] | undefined;
  }[] = [
    { key: 'funds', label: 'Fund', options: fundOptions.data },
    { key: 'accounts', label: 'Account', options: accountOptions.data },
    { key: 'purposes', label: 'Purpose', options: purposeOptions.data },
    { key: 'projects', label: 'Project', options: projectOptions.data },
    { key: 'activities', label: 'Activity', options: activityOptions.data },
  ];

  const financialDepartmentRow = {
    key: 'financialDepartments',
    label: 'Financial Department',
    values: department.map((v) => ({
      code: v,
      name: nameOf(deptOptions.data, v),
      onRemove: () => handleDeptChange(department.filter((x) => x !== v)),
    })),
  };

  // One row per segment; values within a row are OR'd, rows combine with AND.
  const dataFilterRows = segmentFilterDefs
    .map((def) => ({
      key: def.key,
      label: def.label,
      values: (filters[def.key] ?? []).map((v) => ({
        code: v,
        name: nameOf(def.options, v),
        onRemove: () =>
          setFilter(
            def.key,
            (filters[def.key] ?? []).filter((x) => x !== v)
          ),
      })),
    }))
    .filter((row) => row.values.length > 0);

  const groupByChips = cols.map((d) => ({
    display: d.label,
    key: d.key,
    onRemove: () => setDimensions(dimensions.filter((k) => k !== d.key)),
  }));

  const hasSelections =
    financialDepartmentRow.values.length > 0 ||
    dataFilterRows.length > 0 ||
    groupByChips.length > 0;

  return (
    <main className="container">
      <section className="mt-8 mb-6">
        <h1 className="h1">Department Balances</h1>
        <p className="text-lg max-w-3xl">
          To create a department balance report, select a financial department,
          apply data filters and choose table columns to display
        </p>
      </section>

      {/* Filter controls + applied-selections panel */}
      <div className="mb-6 flex flex-col gap-12 lg:flex-row">
        <div className="flex flex-1 flex-col gap-6">
          <section>
            <h2 className="text-xl font-proxima-bold">Financial Department</h2>
            <p className="mb-4">search and choose financial department(s)</p>
            <div className="grid items-start gap-4 md:grid-cols-2">
              {/* Department — hierarchy-aware multi-select, always enabled; gates the other facets */}
              <div className="flex flex-col gap-2">
                <label className="sr-only">Financial Department</label>
                <MultiSelectFilter
                  loading={deptOptions.isPending}
                  onChange={handleDeptChange}
                  options={toFilterOptions(deptOptions.data, true)}
                  placeholder="Pick financial departments…"
                  searchPlaceholder="Search financial departments…"
                  selected={department}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mt-4 text-xl font-proxima-bold">Data Filters</h2>
            <p className="mb-4">
              Choose from Chartstring segment what you want your report to
              contain, Leave blank to exclude
            </p>
            <div className="grid items-start gap-4 md:grid-cols-2">
              {/* Fund — hierarchy-aware multi-select, disabled until department chosen */}
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Fund
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
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Account
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
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Purpose
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
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Project
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
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Activity
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
            </div>
          </section>

          {/* Field selections — which child-level segments the results are grouped/displayed by */}
          <section>
            <h2 className="mt-4 text-xl font-proxima-bold">Table Fields</h2>
            <p className="mb-4">
              Choose which table fields you want to display on the report
            </p>
            <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-2">
                <MultiSelectFilter
                  disabled={department.length === 0}
                  onChange={setDimensions}
                  options={GROUP_BY_OPTIONS}
                  placeholder="Choose fields…"
                  searchPlaceholder="Search fields…"
                  selected={dimensions}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Applied selections, Shopify-style: consolidated removable chips */}
        <aside className="border-main-border shrink-0 self-start overflow-hidden rounded-sm border bg-white lg:w-2/5">
          <div className="bg-light-bg-200 border-main-border border-b px-4 py-2">
            <div className="flex items-center justify-between">
              <h2 className="text-primary-font text-sm uppercase">
                Active selections
              </h2>
              {hasSelections ? (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleDeptChange([])}
                  type="button"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-4 p-4">
            <div>
              <h3 className="text-sm uppercase font-proxima-bold">
                Financial Dept
              </h3>
              {financialDepartmentRow.values.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {financialDepartmentRow.values.map((v, j) => (
                    <Fragment key={v.code}>
                      {j > 0 ? (
                        <span className="text-base-content/50 text-xs italic">
                          or
                        </span>
                      ) : null}
                      <span
                        className="badge badge-info badge-soft max-w-full gap-1"
                        title={v.name}
                      >
                        <span className="truncate">{v.code}</span>
                        <button
                          aria-label={`Remove ${financialDepartmentRow.label} ${v.code}`}
                          className="text-base-content/50 hover:text-base-content shrink-0"
                          onClick={v.onRemove}
                          type="button"
                        >
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <p className="text-base-content/50 mt-2 text-sm">
                  No financial department selected.
                </p>
              )}
            </div>
            <div className="border-main-border border-t pt-4">
              <h3 className="text-sm uppercase font-proxima-bold">
                Data Filters
              </h3>
              {dataFilterRows.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  {dataFilterRows.map((row, i) => (
                    <Fragment key={row.key}>
                      {i > 0 ? (
                        <div className="text-base-content/40 pl-1 text-xs font-semibold">
                          AND
                        </div>
                      ) : null}
                      <div className="border-base-300 bg-base-200/50 flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm">
                        <span className="font-medium">{row.label}:</span>
                        {row.values.map((v, j) => (
                          <Fragment key={v.code}>
                            {j > 0 ? (
                              <span className="text-base-content/50 text-xs italic">
                                or
                              </span>
                            ) : null}
                            <span
                              className="badge badge-info badge-soft max-w-full gap-1"
                              title={v.name}
                            >
                              <span className="truncate">{v.code}</span>
                              <button
                                aria-label={`Remove ${row.label} ${v.code}`}
                                className="text-base-content/50 hover:text-base-content shrink-0"
                                onClick={v.onRemove}
                                type="button"
                              >
                                <XMarkIcon className="h-3 w-3" />
                              </button>
                            </span>
                          </Fragment>
                        ))}
                      </div>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <p className="text-base-content/50 mt-2 text-sm">
                  No data filters applied.
                </p>
              )}
            </div>
            <div className="border-main-border border-t pt-4">
              <h3 className="text-sm uppercase font-proxima-bold">
                Table Fields
              </h3>
              {groupByChips.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {groupByChips.map((c) => (
                    <span
                      className="badge badge-info badge-soft max-w-full gap-1"
                      key={c.key}
                    >
                      <span className="truncate">{c.display}</span>
                      <button
                        aria-label={`Remove ${c.display}`}
                        className="text-primary/60 hover:text-primary shrink-0"
                        onClick={c.onRemove}
                        type="button"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-base-content/50 mt-2 text-sm">
                  No table fields chosen.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Results area */}
      <h2 className="h2 mt-16 border-t border-main-border pt-8">
        Report results
      </h2>
      {department.length === 0 ? (
        <p className="mt-2">No data to show.</p>
      ) : dimensions.length === 0 ? (
        <p className="mt-2">
          Choose one or more group-by segments to see results.
        </p>
      ) : isFetching ? (
        <p className="mt-2">Loading department balances…</p>
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
