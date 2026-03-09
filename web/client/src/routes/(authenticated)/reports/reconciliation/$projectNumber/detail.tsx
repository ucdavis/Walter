import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import {
  glPpmReconciliationQueryOptions,
  glTransactionsQueryOptions,
  projectsByNumberQueryOptions,
  type GLPPMReconciliationRecord,
  type GLTransactionRecord,
} from '@/queries/project.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface SearchParams {
  activity: string;
  dept: string;
  fund: string;
  program: string;
}

export const Route = createFileRoute(
  '/(authenticated)/reports/reconciliation/$projectNumber/detail'
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
  { format: 'currency' as const, header: 'Budget', key: 'budget' as const },
  { format: 'currency' as const, header: 'Expenses', key: 'expenses' as const },
  { format: 'currency' as const, header: 'Balance', key: 'balance' as const },
];

const glCsvColumns = [
  { format: 'date' as const, header: 'Date', key: 'journalAcctDate' as const },
  { header: 'Chart String', key: 'chartString' as const },
  { header: 'Journal', key: 'journalName' as const },
  { header: 'Batch', key: 'journalBatchName' as const },
  { header: 'Category', key: 'journalCategory' as const },
  { header: 'Description', key: 'journalLineDescription' as const },
  {
    format: 'currency' as const,
    header: 'Amount',
    key: 'actualAmount' as const,
  },
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
  const { projectNumber } = Route.useParams();
  const search = Route.useSearch();

  const { data: projects } = useQuery(
    projectsByNumberQueryOptions([projectNumber])
  );
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
    <main className="container">
      <section className="mt-8 mb-10">
        <Link
          className="btn btn-sm mb-4"
          params={{ projectNumber }}
          to="/reports/reconciliation/$projectNumber/"
        >
          Back to Reconciliation
        </Link>
        <h1 className="h1">Reconciliation Detail</h1>
        <p className="subtitle">{keyLabel}</p>
      </section>

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
              <div className="stats shadow stats-vertical bg-base-200 lg:stats-horizontal w-full">
                <div className="stat">
                  <div className="uppercase font-proxima-bold text-primary">
                    PPM
                  </div>
                  <div className="text-2xl">
                    {formatCurrency(ppmRecord.ppmBudBal)}
                  </div>
                </div>
                <div className="stat">
                  <div className="uppercase font-proxima-bold text-accent">
                    GL
                  </div>
                  <div className="text-2xl">
                    {formatCurrency(ppmRecord.glActualAmount)}
                  </div>
                </div>
                <div
                  className={`stat${Math.abs(ppmRecord.glActualAmount + ppmRecord.ppmBudBal) > 0.005 ? ' bg-error/10' : ''}`}
                >
                  <div className="uppercase font-proxima-bold text-dark-font/70">
                    Difference
                  </div>
                  <div className="text-2xl font-proxima-bold">
                    {formatCurrency(
                      ppmRecord.glActualAmount + ppmRecord.ppmBudBal
                    )}
                  </div>
                </div>
              </div>
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
