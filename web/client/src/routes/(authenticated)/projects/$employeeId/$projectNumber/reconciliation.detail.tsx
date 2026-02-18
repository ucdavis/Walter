import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import {
  glPpmReconciliationQueryOptions,
  glTransactionsQueryOptions,
  projectsDetailQueryOptions,
  type GLPPMReconciliationRecord,
  type GLTransactionRecord,
} from '@/queries/project.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { Currency } from '@/shared/Currency.tsx';
import { DataTable } from '@/shared/DataTable.tsx';

interface SearchParams {
  activity: string;
  dept: string;
  fund: string;
  program: string;
}

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/reconciliation/detail'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    activity: (search.activity as string) ?? '',
    dept: (search.dept as string) ?? '',
    fund: (search.fund as string) ?? '',
    program: (search.program as string) ?? '',
  }),
});

const strip = (v: string | null | undefined): string =>
  (v ?? '').replaceAll(/^"|"$/g, '');

function matchesPPM(
  r: GLPPMReconciliationRecord,
  search: SearchParams
): boolean {
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

interface SummaryRow {
  actuals: number;
  source: string;
}

interface PpmTaskRow {
  activityCode: string | null;
  activityDesc: string;
  balance: number;
  budget: number;
  expenses: number;
  fundCode: string | null;
  fundDesc: string;
  programCode: string | null;
  programDesc: string;
  projectNumber: string;
  projectOwningOrg: string | null;
  taskName: string | null;
  taskNum: string;
}

const summaryColumnHelper = createColumnHelper<SummaryRow>();

const summaryColumns = [
  summaryColumnHelper.accessor('source', {
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    footer: () => <span className="font-medium">Difference</span>,
    header: 'Source',
  }),
  summaryColumnHelper.accessor('actuals', {
    cell: (info) => (
      <span className="flex justify-end">
        {formatCurrency(info.getValue())}
      </span>
    ),
    header: () => <span className="flex justify-end">Actuals</span>,
  }),
];

const ppmTaskColumnHelper = createColumnHelper<PpmTaskRow>();

const ppmTaskColumns = [
  ppmTaskColumnHelper.accessor('projectOwningOrg', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Dept',
  }),
  ppmTaskColumnHelper.accessor('projectNumber', {
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
    header: 'Project',
  }),
  ppmTaskColumnHelper.accessor('taskNum', {
    cell: (info) => (
      <div className="text-sm">
        <div>{info.getValue()}</div>
        {info.row.original.taskName && (
          <div className="text-xs text-base-content/80">
            {info.row.original.taskName}
          </div>
        )}
      </div>
    ),
    header: 'Task',
  }),
  ppmTaskColumnHelper.accessor('fundCode', {
    cell: (info) => (
      <div className="text-sm">
        <div>{info.getValue() ?? '-'}</div>
        {info.row.original.fundDesc && (
          <div className="text-xs text-base-content/80">
            {info.row.original.fundDesc}
          </div>
        )}
      </div>
    ),
    header: 'Fund',
  }),
  ppmTaskColumnHelper.accessor('programCode', {
    cell: (info) => (
      <div className="text-sm">
        <div>{info.getValue() ?? '-'}</div>
        {info.row.original.programDesc && (
          <div className="text-xs text-base-content/80">
            {info.row.original.programDesc}
          </div>
        )}
      </div>
    ),
    header: 'Program',
  }),
  ppmTaskColumnHelper.accessor('activityCode', {
    cell: (info) => (
      <div className="text-sm">
        <div>{info.getValue() ?? '-'}</div>
        {info.row.original.activityDesc && (
          <div className="text-xs text-base-content/80">
            {info.row.original.activityDesc}
          </div>
        )}
      </div>
    ),
    header: 'Activity',
  }),
  ppmTaskColumnHelper.accessor('budget', {
    cell: (info) => (
      <span className="flex justify-end text-sm">
        {formatCurrency(info.getValue())}
      </span>
    ),
    header: () => <span className="flex justify-end">Budget</span>,
  }),
  ppmTaskColumnHelper.accessor('expenses', {
    cell: (info) => (
      <span className="flex justify-end text-sm">
        {formatCurrency(info.getValue())}
      </span>
    ),
    header: () => <span className="flex justify-end">Expenses</span>,
  }),
  ppmTaskColumnHelper.accessor('balance', {
    cell: (info) => (
      <span className="flex justify-end text-sm">
        {formatCurrency(info.getValue())}
      </span>
    ),
    header: () => <span className="flex justify-end">Balance</span>,
  }),
];

const glColumnHelper = createColumnHelper<GLTransactionRecord>();

const glColumns = [
  glColumnHelper.accessor('journalAcctDate', {
    cell: (info) => (
      <span className="text-sm whitespace-nowrap">
        {info.getValue()
          ? new Date(info.getValue()!).toLocaleDateString()
          : '-'}
      </span>
    ),
    header: 'Date',
  }),
  glColumnHelper.display({
    cell: (info) => (
      <span className="text-sm break-all">
        {buildChartString(info.row.original)}
      </span>
    ),
    header: 'Chart String',
    id: 'chartString',
  }),
  glColumnHelper.accessor('journalName', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Journal',
  }),
  glColumnHelper.accessor('journalBatchName', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Batch',
  }),
  glColumnHelper.accessor('journalCategory', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Category',
  }),
  glColumnHelper.accessor('journalLineDescription', {
    cell: (info) => (
      <span className="text-sm max-w-xs truncate block">
        {info.getValue() ?? '-'}
      </span>
    ),
    header: 'Description',
  }),
  glColumnHelper.accessor('actualAmount', {
    cell: (info) => (
      <span className="flex justify-end text-sm">
        {formatCurrency(info.getValue())}
      </span>
    ),
    header: () => <span className="flex justify-end">Amount</span>,
  }),
];

const ppmTaskCsvColumns = [
  { header: 'Dept', key: 'projectOwningOrg' as const },
  { header: 'Project', key: 'projectNumber' as const },
  { header: 'Task', key: 'taskNum' as const },
  { header: 'Task Name', key: 'taskName' as const },
  { header: 'Fund', key: 'fundCode' as const },
  { header: 'Program', key: 'programCode' as const },
  { header: 'Activity', key: 'activityCode' as const },
  { header: 'Budget', key: 'budget' as const },
  { header: 'Expenses', key: 'expenses' as const },
  { header: 'Balance', key: 'balance' as const },
];

const glCsvColumns = [
  { header: 'Date', key: 'journalAcctDate' as const },
  { header: 'Chart String', key: 'chartString' as const },
  { header: 'Journal', key: 'journalName' as const },
  { header: 'Batch', key: 'journalBatchName' as const },
  { header: 'Category', key: 'journalCategory' as const },
  { header: 'Description', key: 'journalLineDescription' as const },
  { header: 'Amount', key: 'actualAmount' as const },
];

function buildChartString(t: GLTransactionRecord): string {
  return [
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
    .join('-');
}

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();
  const search = Route.useSearch();

  const { data: projects } = useQuery(projectsDetailQueryOptions(employeeId));
  const summary = projects
    ? summarizeProjectByNumber(projects, projectNumber)
    : null;

  const {
    data: reconciliation,
    isError: isReconciliationError,
    isPending: isReconciliationPending,
  } = useQuery(glPpmReconciliationQueryOptions([projectNumber]));

  const {
    data: transactions,
    isError: isTransactionsError,
    isPending: isTransactionsPending,
  } = useQuery(glTransactionsQueryOptions([projectNumber]));

  const isPending = isReconciliationPending || isTransactionsPending;
  const isError = isReconciliationError || isTransactionsError;

  // Find the specific reconciliation record
  const ppmRecord = reconciliation?.find((r) => matchesPPM(r, search));

  // Build summary table data with footer for difference
  const summaryData = useMemo((): SummaryRow[] => {
    if (!ppmRecord) {
      return [];
    }
    return [
      { actuals: ppmRecord.ppmItdExp, source: 'PPM' },
      { actuals: ppmRecord.glActualAmount, source: 'GL' },
    ];
  }, [ppmRecord]);

  const summaryColumnsWithFooter = useMemo(() => {
    if (!ppmRecord) {
      return summaryColumns;
    }
    return summaryColumns.map((col) => {
      if (
        col.id === 'actuals' ||
        (col as { accessorKey?: string }).accessorKey === 'actuals'
      ) {
        return {
          ...col,
          footer: () => (
            <span className="flex justify-end font-proxima-bold">
              {formatCurrency(ppmRecord.glActualAmount + ppmRecord.ppmItdExp)}
            </span>
          ),
        };
      }
      return col;
    });
  }, [ppmRecord]);

  // Aggregate PPM records at the task level, filtered by chart string
  const ppmTasks = Object.values(
    (projects ?? [])
      .filter(
        (p) =>
          p.projectNumber === projectNumber &&
          strip(p.fundCode) === strip(search.fund) &&
          strip(p.programCode) === strip(search.program) &&
          strip(p.activityCode) === strip(search.activity)
      )
      .reduce<Record<string, PpmTaskRow>>((acc, p) => {
        const key = p.taskNum ?? '';
        if (!acc[key]) {
          acc[key] = {
            activityCode: p.activityCode ?? null,
            activityDesc: p.activityDesc ?? '',
            balance: 0,
            budget: 0,
            expenses: 0,
            fundCode: p.fundCode ?? null,
            fundDesc: p.fundDesc ?? '',
            programCode: p.programCode ?? null,
            programDesc: p.programDesc ?? '',
            projectNumber: p.projectNumber,
            projectOwningOrg: p.projectOwningOrg ?? null,
            taskName: p.taskName ?? null,
            taskNum: p.taskNum ?? '',
          };
        }
        acc[key].budget += p.catBudget;
        acc[key].expenses += p.catItdExp;
        acc[key].balance += p.catBudBal;
        return acc;
      }, {})
  );

  const glTransactions = (transactions ?? [])
    .filter((t) => matchesGL(t, search))
    .sort((a, b) => {
      if (!a.journalAcctDate && !b.journalAcctDate) {
        return 0;
      }
      if (!a.journalAcctDate) {
        return 1;
      }
      if (!b.journalAcctDate) {
        return -1;
      }
      return (
        new Date(b.journalAcctDate).getTime() -
        new Date(a.journalAcctDate).getTime()
      );
    });

  const keyLabel = [search.dept, search.fund, search.program, search.activity]
    .filter(Boolean)
    .join(' / ');

  return (
    <main className="flex-1">
      <section className="mt-8 mb-10">
        {/* <nav className="text-sm breadcrumbs mb-4">
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
        </nav> */}
        <Link
          className="btn btn-sm mb-4"
          params={{ employeeId, projectNumber }}
          to="/projects/$employeeId/$projectNumber/reconciliation"
        >
          Back to Reconciliation
        </Link>
        <h1 className="h1">Reconciliation Detail</h1>
        <p className="subtitle">{keyLabel}</p>
      </section>

      {summary && (
        <section className="mb-8">
          <div className="fancy-data">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="flex flex-col">
                <dt className="font-proxima-bold text-lg">Start</dt>
                <dd className="text-xl">
                  {formatDate(summary.awardStartDate)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="font-proxima-bold text-lg">End</dt>
                <dd className="text-xl">{formatDate(summary.awardEndDate)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="font-proxima-bold text-lg">Budget</dt>
                <dd className="text-xl">
                  <Currency value={summary.totals.budget} />
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="font-proxima-bold text-lg">Balance</dt>
                <dd className="text-xl text-success font-proxima-bold">
                  <Currency value={summary.totals.balance} />
                </dd>
              </div>
            </dl>
            <hr className="border-main-border my-5" />
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div className="flex flex-col">
                <dt className="stat-label">Status</dt>
                <dd className="stat-value">
                  <div className="badge badge-soft badge-primary">
                    {summary.projectStatusCode ?? 'Not provided'}
                  </div>
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="stat-label">PM</dt>
                <dd className="stat-value">{summary.pm ?? 'Not provided'}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="stat-label">PI</dt>
                <dd className="stat-value">{summary.pi ?? 'Not provided'}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {isPending ? (
        <p className="text-base-content/70 mt-4">
          Loading reconciliation data…
        </p>
      ) : isError ? (
        <p className="text-error mt-4">Error loading reconciliation data.</p>
      ) : (
        <>
          {/* Summary Comparison */}
          <section className="mb-8">
            <h2 className="h2 mb-4">Summary</h2>
            {ppmRecord ? (
              <DataTable
                columns={summaryColumnsWithFooter}
                data={summaryData}
                expandable={false}
                globalFilter="none"
                pagination="off"
              />
            ) : (
              <p className="text-base-content/80">No record found.</p>
            )}
          </section>

          {/* PPM Task Breakdown */}
          <section className="mb-8">
            <h2 className="h2 mb-4">PPM Tasks ({ppmTasks.length})</h2>
            <DataTable
              columns={ppmTaskColumns}
              data={ppmTasks}
              expandable={true}
              pagination="auto"
              tableActions={
                <ExportDataButton
                  columns={ppmTaskCsvColumns}
                  data={ppmTasks}
                  filename="ppm-tasks.csv"
                />
              }
            />
          </section>

          {/* GL Transaction Listings */}
          <section className="mb-8">
            <h2 className="h2 mb-4">
              GL Transactions ({glTransactions.length})
            </h2>
            {glTransactions.length === 0 ? (
              <p className="text-base-content/80">No GL transactions found.</p>
            ) : (
              <DataTable
                columns={glColumns}
                data={glTransactions}
                expandable={true}
                pagination="auto"
                tableActions={
                  <ExportDataButton
                    columns={glCsvColumns}
                    data={glTransactions.map((t) => ({
                      ...t,
                      chartString: buildChartString(t),
                    }))}
                    filename="gl-transactions.csv"
                  />
                }
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}
