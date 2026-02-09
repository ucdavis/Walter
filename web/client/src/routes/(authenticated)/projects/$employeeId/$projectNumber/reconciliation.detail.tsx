import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  glPpmReconciliationQueryOptions,
  glTransactionsQueryOptions,
  projectsDetailQueryOptions,
  type GLPPMReconciliationRecord,
  type GLTransactionRecord,
} from '@/queries/project.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { formatCurrency } from '@/lib/currency.ts';

interface SearchParams {
  dept: string;
  fund: string;
  program: string;
  activity: string;
}

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/reconciliation/detail'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    dept: (search.dept as string) ?? '',
    fund: (search.fund as string) ?? '',
    program: (search.program as string) ?? '',
    activity: (search.activity as string) ?? '',
  }),
});

function matchesPPM(r: GLPPMReconciliationRecord, search: SearchParams): boolean {
  return (
    (r.financialDepartment ?? '') === search.dept &&
    (r.fundCode ?? '') === search.fund &&
    (r.programCode ?? '') === search.program &&
    (r.activityCode ?? '') === search.activity
  );
}

function matchesGL(t: GLTransactionRecord, search: SearchParams): boolean {
  return (
    (t.financialDepartment ?? '') === search.dept &&
    (t.fund ?? '') === search.fund &&
    (t.program ?? '') === search.program &&
    (t.activity ?? '') === search.activity
  );
}

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();
  const search = Route.useSearch();
  const user = useUser();

  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId, user.employeeId)
  );
  const summary = summarizeProjectByNumber(projects, projectNumber);

  const { data: reconciliation } = useSuspenseQuery(
    glPpmReconciliationQueryOptions([projectNumber])
  );

  const { data: transactions } = useSuspenseQuery(
    glTransactionsQueryOptions([projectNumber])
  );

  // Find the specific reconciliation record
  const ppmRecord = reconciliation.find((r) => matchesPPM(r, search));

  // Filter GL transactions to matching params, most recent first
  const glTransactions = transactions
    .filter((t) => matchesGL(t, search))
    .sort((a, b) => {
      if (!a.journalAcctDate && !b.journalAcctDate) return 0;
      if (!a.journalAcctDate) return 1;
      if (!b.journalAcctDate) return -1;
      return new Date(b.journalAcctDate).getTime() - new Date(a.journalAcctDate).getTime();
    });

  // Aggregate PPM records at the task level
  const ppmTasks = Object.values(
    projects
      .filter((p) => p.projectNumber === projectNumber)
      .reduce<
        Record<
          string,
          {
            taskNum: string;
            taskName: string | null;
            projectNumber: string;
            projectOwningOrg: string | null;
            fundCode: string | null;
            fundDesc: string;
            programCode: string | null;
            programDesc: string;
            activityCode: string | null;
            activityDesc: string;
            budget: number;
            expenses: number;
            commitments: number;
            balance: number;
          }
        >
      >((acc, p) => {
        const key = p.taskNum ?? '';
        if (!acc[key]) {
          acc[key] = {
            taskNum: p.taskNum ?? '',
            taskName: p.taskName ?? null,
            projectNumber: p.projectNumber,
            projectOwningOrg: p.projectOwningOrg ?? null,
            fundCode: p.fundCode ?? null,
            fundDesc: p.fundDesc ?? '',
            programCode: p.programCode ?? null,
            programDesc: p.programDesc ?? '',
            activityCode: p.activityCode ?? null,
            activityDesc: p.activityDesc ?? '',
            budget: 0,
            expenses: 0,
            commitments: 0,
            balance: 0,
          };
        }
        acc[key].budget += p.catBudget;
        acc[key].expenses += p.catItdExp;
        acc[key].commitments += p.catCommitments;
        acc[key].balance += p.catBudBal;
        return acc;
      }, {})
  );

  const keyLabel = [search.dept, search.fund, search.program, search.activity]
    .filter(Boolean)
    .join(' / ');

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
            <li>
              <Link
                params={{ employeeId, projectNumber }}
                to="/projects/$employeeId/$projectNumber/reconciliation"
              >
                Reconciliation
              </Link>
            </li>
            <li>Detail</li>
          </ul>
        </nav>
        <h1 className="h1">Reconciliation Detail</h1>
        <p className="text-base-content/70 mt-2 font-mono">{keyLabel}</p>
      </section>

      {/* Summary Comparison */}
      <section className="mb-8">
        <h2 className="h2 mb-4">Summary</h2>
        {ppmRecord ? (
          <>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="text-right">Budget</th>
                    <th className="text-right">Expenses</th>
                    <th className="text-right">Net Budget</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-medium">PPM</td>
                    <td className="text-right font-mono">
                      {formatCurrency(ppmRecord.ppmBudget)}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(ppmRecord.ppmItdExp)}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(ppmRecord.ppmBudget - ppmRecord.ppmItdExp)}
                    </td>
                  </tr>
                  <tr>
                    <td className="font-medium">GL</td>
                    <td className="text-right font-mono">-</td>
                    <td className="text-right font-mono">
                      {formatCurrency(ppmRecord.glActualAmount)}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(ppmRecord.glActualAmount)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-warning/10">
                    <td className="font-medium">Difference</td>
                    <td className="text-right font-mono">-</td>
                    <td className="text-right font-mono">
                      {formatCurrency(ppmRecord.ppmItdExp + ppmRecord.glActualAmount)}
                    </td>
                    <td className="text-right font-mono font-bold">
                      {formatCurrency(ppmRecord.glActualAmount + (ppmRecord.ppmBudget - ppmRecord.ppmItdExp))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <p className="text-base-content/60">No record found.</p>
        )}
      </section>

      {/* PPM Task Breakdown */}
      <section className="mb-8">
        <h2 className="h2 mb-4">PPM Tasks ({ppmTasks.length})</h2>
        {ppmTasks.length === 0 ? (
          <p className="text-base-content/60">No PPM tasks found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra table-sm w-full">
              <thead>
                <tr>
                  <th>Dept</th>
                  <th>Project</th>
                  <th>Task</th>
                  <th>Fund</th>
                  <th>Program</th>
                  <th>Activity</th>
                  <th className="text-right">Budget</th>
                  <th className="text-right">Expenses</th>
                  <th className="text-right">Commitments</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ppmTasks.map((t) => (
                  <tr key={t.taskNum}>
                    <td className="font-mono text-sm">
                      {t.projectOwningOrg ?? '-'}
                    </td>
                    <td className="font-mono text-sm">
                      {t.projectNumber}
                    </td>
                    <td className="text-sm">
                      <div>{t.taskNum}</div>
                      {t.taskName && (
                        <div className="text-xs text-base-content/60">
                          {t.taskName}
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      <div className="font-mono">{t.fundCode ?? '-'}</div>
                      {t.fundDesc && (
                        <div className="text-xs text-base-content/60">
                          {t.fundDesc}
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      <div className="font-mono">{t.programCode ?? '-'}</div>
                      {t.programDesc && (
                        <div className="text-xs text-base-content/60">
                          {t.programDesc}
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      <div className="font-mono">{t.activityCode ?? '-'}</div>
                      {t.activityDesc && (
                        <div className="text-xs text-base-content/60">
                          {t.activityDesc}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(t.budget)}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(t.expenses)}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(t.commitments)}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(t.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* GL Transaction Listings */}
      <section className="mb-8">
        <h2 className="h2 mb-4">GL Transactions ({glTransactions.length})</h2>
        {glTransactions.length === 0 ? (
          <p className="text-base-content/60">No GL transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra table-sm w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Chart String</th>
                  <th>Journal</th>
                  <th>Batch</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {glTransactions.map((t, i) => (
                  <tr key={`${t.accountingSequenceNumber}-${i}`}>
                    <td className="whitespace-nowrap">
                      {t.journalAcctDate
                        ? new Date(t.journalAcctDate).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="font-mono text-xs">
                      {[
                        t.entity,
                        t.fund,
                        t.financialDepartment,
                        t.account,
                        t.purpose,
                        t.program,
                        t.project,
                        t.activity,
                      ]
                        .filter(Boolean)
                        .join('-')}
                    </td>
                    <td className="font-mono text-sm">{t.journalName ?? '-'}</td>
                    <td className="text-sm">{t.journalBatchName ?? '-'}</td>
                    <td className="text-sm max-w-xs truncate">
                      {t.journalLineDescription ?? '-'}
                    </td>
                    <td className="text-right font-mono">
                      {formatCurrency(t.actualAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <Link
          className="btn btn-outline"
          params={{ employeeId, projectNumber }}
          to="/projects/$employeeId/$projectNumber/reconciliation"
        >
          Back to Reconciliation
        </Link>
      </section>
    </main>
  );
}