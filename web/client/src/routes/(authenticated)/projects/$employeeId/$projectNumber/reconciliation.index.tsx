import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  glPpmReconciliationQueryOptions,
  projectsDetailQueryOptions,
  type GLPPMReconciliationRecord,
} from '@/queries/project.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';

import { formatCurrency } from '@/lib/currency.ts';

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/reconciliation/'
)({
  component: RouteComponent,
});

function getRecordKey(r: GLPPMReconciliationRecord): string {
  return [
    r.financialDepartment ?? '',
    r.project,
    r.fundCode ?? '',
    r.programCode ?? '',
    r.activityCode ?? '',
  ].join('|');
}

function hasDiscrepancy(r: GLPPMReconciliationRecord): boolean {
  return Math.abs(r.glActualAmount + (r.ppmBudget - r.ppmItdExp)) > 1;
}

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
  const sorted = [...(records ?? [])].sort((a, b) => {
    const aDisc = hasDiscrepancy(a);
    const bDisc = hasDiscrepancy(b);
    if (aDisc !== bDisc) {
      return aDisc ? -1 : 1;
    }
    const aDiff = Math.abs(a.glActualAmount + (a.ppmBudget - a.ppmItdExp));
    const bDiff = Math.abs(b.glActualAmount + (b.ppmBudget - b.ppmItdExp));
    return bDiff - aDiff;
  });

  const discrepancies = sorted.filter(hasDiscrepancy);

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
        <p className="text-base-content/70 mt-4">Loading reconciliation data…</p>
      ) : isReconciliationError ? (
        <p className="text-error mt-4">Error loading reconciliation data.</p>
      ) : (
        <>
          {discrepancies.length === 0 && (
            <section className="bg-success/10 border border-success/30 rounded-lg p-6 mb-6">
              <p className="text-success font-medium">
                No discrepancies found. GL and PPM totals are in sync.
              </p>
            </section>
          )}

          <section className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>Dept</th>
                  <th>Project</th>
                  <th>Fund</th>
                  <th>PPM Fund</th>
                  <th>Program</th>
                  <th>Activity</th>
                  <th className="text-right">GL Actuals</th>
                  <th className="text-right">PPM Net Budget</th>
                  <th className="text-right">Difference</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const key = getRecordKey(row);
                  const ppmNetBudget = row.ppmBudget - row.ppmItdExp;
                  const diff = row.glActualAmount + ppmNetBudget;
                  const isDiscrepancy = hasDiscrepancy(row);

                  return (
                    <tr
                      key={key}
                      className={isDiscrepancy ? 'bg-warning/10' : ''}
                    >
                      <td className="font-mono text-sm">
                        {row.financialDepartment ?? '-'}
                      </td>
                      <td>
                        <div className="font-mono text-sm">
                          {row.project}
                        </div>
                        {row.projectDescription && (
                          <div className="text-xs text-base-content/60">
                            {row.projectDescription}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="font-mono text-sm">
                          {row.fundCode ?? '-'}
                        </div>
                        {row.fundDescription && (
                          <div className="text-xs text-base-content/60">
                            {row.fundDescription}
                          </div>
                        )}
                      </td>
                      <td className="font-mono text-sm">
                        {row.ppmFundCode}
                      </td>
                      <td>
                        <div className="font-mono text-sm">
                          {row.programCode ?? '-'}
                        </div>
                        {row.programDescription && (
                          <div className="text-xs text-base-content/60">
                            {row.programDescription}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="font-mono text-sm">
                          {row.activityCode ?? '-'}
                        </div>
                        {row.activityDescription && (
                          <div className="text-xs text-base-content/60">
                            {row.activityDescription}
                          </div>
                        )}
                      </td>
                      <td className="text-right font-mono">
                        {formatCurrency(row.glActualAmount)}
                      </td>
                      <td className="text-right font-mono">
                        {formatCurrency(ppmNetBudget)}
                      </td>
                      <td
                        className={`text-right font-mono ${
                          isDiscrepancy
                            ? diff < 0
                              ? 'text-error'
                              : 'text-warning'
                            : ''
                        }`}
                      >
                        {formatCurrency(diff)}
                      </td>
                      <td>
                        {isDiscrepancy && (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
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