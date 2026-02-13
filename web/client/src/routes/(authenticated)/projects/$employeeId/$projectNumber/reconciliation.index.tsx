import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  glPpmReconciliationQueryOptions,
  projectsDetailQueryOptions,
  type GLPPMReconciliationRecord,
} from '@/queries/project.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { DataTable } from '@/shared/DataTable.tsx';

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/reconciliation/'
)({
  component: RouteComponent,
});

function hasDiscrepancy(r: GLPPMReconciliationRecord): boolean {
  return Math.abs(r.glActualAmount + r.ppmItdExp) > 0.005;
}

const columnHelper = createColumnHelper<GLPPMReconciliationRecord>();

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();

  const { data: projects } = useQuery(projectsDetailQueryOptions(employeeId));
  const summary = projects
    ? summarizeProjectByNumber(projects, projectNumber)
    : null;

  const {
    data: records,
    isError: isReconciliationError,
    isPending: isReconciliationPending,
  } = useQuery(glPpmReconciliationQueryOptions([projectNumber]));

  // Sort by discrepancy first (discrepancies at top), then by absolute difference
  const sorted = useMemo(
    () =>
      [...(records ?? [])].sort((a, b) => {
        const aDisc = hasDiscrepancy(a);
        const bDisc = hasDiscrepancy(b);
        if (aDisc !== bDisc) {
          return aDisc ? -1 : 1;
        }
        const aDiff = Math.abs(a.glActualAmount + a.ppmItdExp);
        const bDiff = Math.abs(b.glActualAmount + b.ppmItdExp);
        return bDiff - aDiff;
      }),
    [records]
  );

  const discrepancyCount = useMemo(
    () => sorted.filter(hasDiscrepancy).length,
    [sorted]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('financialDepartment', {
        cell: (info) => (
          <span className="font-mono text-sm">
            {info.getValue() ?? '-'}
          </span>
        ),
        header: 'Dept',
      }),
      columnHelper.accessor('project', {
        cell: (info) => (
          <div>
            <div className="font-mono text-sm">{info.getValue()}</div>
            {info.row.original.projectDescription && (
              <div className="text-xs text-base-content/60">
                {info.row.original.projectDescription}
              </div>
            )}
          </div>
        ),
        header: 'Project',
      }),
      columnHelper.accessor('fundCode', {
        cell: (info) => (
          <div>
            <div className="font-mono text-sm">{info.getValue() ?? '-'}</div>
            {info.row.original.fundDescription && (
              <div className="text-xs text-base-content/60">
                {info.row.original.fundDescription}
              </div>
            )}
          </div>
        ),
        header: 'Fund',
      }),
      columnHelper.accessor('ppmFundCode', {
        cell: (info) => (
          <span className="font-mono text-sm">{info.getValue()}</span>
        ),
        header: 'PPM Fund',
      }),
      columnHelper.accessor('programCode', {
        cell: (info) => (
          <div>
            <div className="font-mono text-sm">{info.getValue() ?? '-'}</div>
            {info.row.original.programDescription && (
              <div className="text-xs text-base-content/60">
                {info.row.original.programDescription}
              </div>
            )}
          </div>
        ),
        header: 'Program',
      }),
      columnHelper.accessor('activityCode', {
        cell: (info) => (
          <div>
            <div className="font-mono text-sm">{info.getValue() ?? '-'}</div>
            {info.row.original.activityDescription && (
              <div className="text-xs text-base-content/60">
                {info.row.original.activityDescription}
              </div>
            )}
          </div>
        ),
        header: 'Activity',
      }),
      columnHelper.accessor('glActualAmount', {
        cell: (info) => (
          <span className="flex justify-end font-mono">
            {formatCurrency(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">GL Actuals</span>,
      }),
      columnHelper.accessor('ppmItdExp', {
        cell: (info) => (
          <span className="flex justify-end font-mono">
            {formatCurrency(info.getValue())}
          </span>
        ),
        header: () => (
          <span className="flex justify-end">PPM Actuals</span>
        ),
      }),
      columnHelper.display({
        id: 'difference',
        cell: (info) => {
          const row = info.row.original;
          const diff = row.glActualAmount + row.ppmItdExp;
          const isDisc = hasDiscrepancy(row);
          return (
            <span
              className={`flex justify-end font-mono ${
                isDisc ? (diff < 0 ? 'text-error' : 'text-warning') : ''
              }`}
            >
              {formatCurrency(diff)}
            </span>
          );
        },
        header: () => <span className="flex justify-end">Difference</span>,
      }),
      columnHelper.display({
        id: 'actions',
        cell: (info) => {
          const row = info.row.original;
          return (
            <Link
              className="btn btn-xs btn-ghost"
              to="/projects/$employeeId/$projectNumber/reconciliation/detail"
              params={{ employeeId, projectNumber }}
              search={{
                dept: row.financialDepartment ?? '',
                fund: row.fundCode ?? '',
                program: row.programCode ?? '',
                activity: row.activityCode ?? '',
              }}
            >
              Details
            </Link>
          );
        },
        header: '',
        enableSorting: false,
      }),
    ],
    [employeeId, projectNumber]
  );

  return (
    <main className="flex-1">
      <section className="mt-8 mb-10">
        <nav className="text-sm breadcrumbs mb-4">
          <ul>
            <li>
              <Link to="/projects">Projects</Link>
            </li>
            <li>
              <Link
                params={{ employeeId, projectNumber }}
                to="/projects/$employeeId/$projectNumber/"
              >
                {summary?.displayName ?? projectNumber}
              </Link>
            </li>
            <li>GL/PPM Reconciliation</li>
          </ul>
        </nav>
        <h1 className="h1">GL/PPM Reconciliation</h1>
        <p className="text-base-content/70 mt-2">
          Comparing General Ledger totals against PPM budget balances for{' '}
          <span className="font-semibold">{projectNumber}</span>
        </p>
      </section>

      {isReconciliationPending ? (
        <p className="text-base-content/70 mt-4">
          Loading reconciliation data…
        </p>
      ) : isReconciliationError ? (
        <p className="text-error mt-4">Error loading reconciliation data.</p>
      ) : (
        <>
          {discrepancyCount === 0 && (
            <section className="bg-success/10 border border-success/30 rounded-lg p-6 mb-6">
              <p className="text-success font-medium">
                No discrepancies found. GL and PPM totals are in sync.
              </p>
            </section>
          )}

          <DataTable
            columns={columns}
            data={sorted}
            expandable={false}
            globalFilter="none"
            pagination="off"
          />
        </>
      )}

      <section className="mt-8">
        <Link
          className="btn btn-outline"
          params={{ employeeId, projectNumber }}
          to="/projects/$employeeId/$projectNumber/"
        >
          Back to Project
        </Link>
      </section>
    </main>
  );
}