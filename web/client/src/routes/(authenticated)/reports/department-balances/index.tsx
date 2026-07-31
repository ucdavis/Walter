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
import {
  ChevronDownIcon,
  ChevronUpIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';
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

const optionLabel = (o: DepartmentBalanceOption): string =>
  o.name && o.name !== o.code ? `${o.code} — ${o.name}` : o.code;

// Map filter-option rows to FilterOptions, alphabetical by name (code as fallback) so
// the list scans by description rather than code. Hierarchy facets split into two
// groups — "Parent" (picking one selects its whole subtree) and "Child". AE's
// parent-level numbers are positional padding over ragged trees, so the level itself
// is never shown.
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
  const byName = (a: DepartmentBalanceOption, b: DepartmentBalanceOption) =>
    (a.name || a.code).localeCompare(b.name || b.code, undefined, {
      sensitivity: 'base',
    });
  const mapped = [...byCode.values()].sort(byName).map((o) => ({
    group: hierarchy ? (o.level === 'Leaf' ? 'Child' : 'Parent') : undefined,
    label: optionLabel(o),
    value: o.code,
  }));
  if (!hierarchy) {
    return mapped;
  }
  return [
    ...mapped.filter((o) => o.group === 'Parent'),
    ...mapped.filter((o) => o.group === 'Child'),
  ];
};

function RouteComponent() {
  const [department, setDepartment] = useState<string[]>([]);
  const [filters, setFilters] = useState<DepartmentBalancesFilters>({});
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [criteriaOpen, setCriteriaOpen] = useState(true);

  const periodOptions = useDepartmentBalanceOptions('Period', {});
  // Server orders periods newest first; the first option is the current close.
  const effectivePeriod = period || periodOptions.data?.[0]?.code;

  const query = useMemo(
    () => ({
      dimensions,
      ...filters,
      financialDepartments: department.length > 0 ? department : undefined,
      periodName: effectivePeriod,
    }),
    [dimensions, filters, department, effectivePeriod]
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

  const deptOptions = useDepartmentBalanceOptions(
    'Dept',
    { periodName: effectivePeriod },
    Boolean(effectivePeriod)
  );
  const entityOptions = useDepartmentBalanceOptions(
    'Entity',
    query,
    department.length > 0
  );
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
  const programOptions = useDepartmentBalanceOptions(
    'Program',
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
    // A negative ending balance is an overdraft (measures arrive natural-sign), shown in red.
    const overdraft = (m: MeasureDef, value: number) =>
      m.key === 'endingBalance' && value < 0 ? ' text-error' : '';
    const measure = (m: MeasureDef) =>
      columnHelper.accessor(m.key, {
        cell: (info) => (
          <span
            className={`block w-full text-right tabular-nums${overdraft(m, info.getValue())}`}
          >
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span
            className={`block w-full text-right font-semibold tabular-nums${overdraft(m, totals[m.key])}`}
          >
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

  const setFilter = <
    K extends Exclude<keyof DepartmentBalancesFilters, 'periodName'>,
  >(
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
        <h1 className="h1">GL Balance Review</h1>
        <h3 className="subtitle">Data source: GL Summary Balances</h3>
      </section>

      {/* Report criteria: collapsible so the results table can take the full viewport */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xl font-proxima-bold">Report Criteria</h2>
        <button
          aria-expanded={criteriaOpen}
          className="btn btn-ghost btn-sm"
          onClick={() => setCriteriaOpen((open) => !open)}
          type="button"
        >
          {criteriaOpen ? (
            <>
              <ChevronUpIcon className="h-4 w-4" />
              Hide
            </>
          ) : (
            <>
              <ChevronDownIcon className="h-4 w-4" />
              Show
            </>
          )}
        </button>
      </div>

      {/* Filter controls */}
      <div className={`mb-6 ${criteriaOpen ? '' : 'hidden'}`}>
        <div className="flex flex-col gap-6">
          <section>
            <div className="grid items-start gap-4 md:grid-cols-2">
              {/* Accounting period: required single choice, newest first, defaults to current close */}
              <div className="flex flex-col gap-2">
                <label
                  className="text-sm uppercase font-proxima-bold"
                  htmlFor="period-select"
                >
                  Period{' '}
                  <span aria-hidden="true" className="text-error">
                    *
                  </span>
                </label>
                <select
                  className="select w-full"
                  disabled={periodOptions.isPending}
                  id="period-select"
                  onChange={(e) => setPeriod(e.target.value)}
                  value={effectivePeriod ?? ''}
                >
                  {(periodOptions.data ?? []).map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department — hierarchy-aware multi-select, always enabled; gates the other facets */}
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Financial Department{' '}
                  <span aria-hidden="true" className="text-error">
                    *
                  </span>
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
            </div>
          </section>

          <section>
            <h2 className="mt-4 mb-4 text-xl font-proxima-bold">
              Data Filters
            </h2>
            <div className="grid items-start gap-4 md:grid-cols-2">
              {/* Entity — multi-select, disabled until department chosen */}
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Entity
                </label>
                <MultiSelectFilter
                  disabled={department.length === 0}
                  loading={entityOptions.isFetching}
                  onChange={(vals) => setFilter('entities', vals)}
                  options={toFilterOptions(entityOptions.data)}
                  placeholder="Any entity"
                  searchPlaceholder="Search entities…"
                  selected={filters.entities ?? []}
                />
              </div>

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

              {/* Program — multi-select, disabled until department chosen */}
              <div className="flex flex-col gap-2">
                <label className="text-sm uppercase font-proxima-bold">
                  Program
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
            <div className="mt-4 mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-proxima-bold">Display Fields</h2>
              <button
                className="btn btn-ghost btn-sm"
                disabled={department.length === 0}
                onClick={() => setDimensions(DIMENSIONS.map((d) => d.key))}
                type="button"
              >
                Select all
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={department.length === 0 && dimensions.length === 0}
                onClick={() => handleDeptChange([])}
                type="button"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Clear all criteria
              </button>
            </div>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
              {DIMENSIONS.map((d) => (
                <label
                  className="label cursor-pointer justify-start gap-3"
                  key={d.key}
                >
                  <input
                    checked={dimensions.includes(d.key)}
                    className="checkbox checkbox-primary checkbox-sm"
                    disabled={department.length === 0}
                    onChange={(e) =>
                      setDimensions(
                        e.target.checked
                          ? [...dimensions, d.key]
                          : dimensions.filter((k) => k !== d.key)
                      )
                    }
                    type="checkbox"
                  />
                  <span className="label-text">{d.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

      </div>

      {/* Results area */}
      <h2 className="h2 mt-16 border-t border-main-border pt-8">
        Report results{effectivePeriod ? ` as of ${effectivePeriod}` : ''}
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
              filename={`department-balances-${effectivePeriod ?? 'current'}.csv`}
            />
          }
        />
      )}
    </main>
  );
}
