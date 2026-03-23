import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { type GLTransactionRecord, glTransactionsQueryOptions } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface SearchParams {
  activity?: string;
  dept?: string;
  fund?: string;
  program?: string;
}

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/transactions'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    activity: (search.activity as string) ?? undefined,
    dept: (search.dept as string) ?? undefined,
    fund: (search.fund as string) ?? undefined,
    program: (search.program as string) ?? undefined,
  }),
});

function matchesSearch(t: GLTransactionRecord, search: SearchParams): boolean {
  if (search.dept && (t.financialDepartment ?? '') !== search.dept) return false;
  if (search.fund && (t.fund ?? '') !== search.fund) return false;
  if (search.program && (t.program ?? '') !== search.program) return false;
  if (search.activity && (t.activity ?? '') !== search.activity) return false;
  return true;
}

function buildChartString(t: GLTransactionRecord): string {
  return [t.entity, t.fund, t.financialDepartment, t.account, t.purpose, t.program, t.project, t.activity]
    .filter(Boolean)
    .join('-');
}

const columnHelper = createColumnHelper<GLTransactionRecord>();

const columns = [
  columnHelper.accessor('journalAcctDate', {
    cell: (info) => (
      <span className="text-sm whitespace-nowrap">
        {info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '-'}
      </span>
    ),
    header: 'Date',
  }),
  columnHelper.accessor('fund', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Fund',
  }),
  columnHelper.accessor('financialDepartment', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Dept',
  }),
  columnHelper.accessor('account', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Account',
  }),
  columnHelper.accessor('program', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Program',
  }),
  columnHelper.accessor('activity', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Activity',
  }),
  columnHelper.accessor('journalName', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Journal',
  }),
  columnHelper.accessor('journalCategory', {
    cell: (info) => <span className="text-sm">{info.getValue() ?? '-'}</span>,
    header: 'Category',
  }),
  columnHelper.accessor('journalLineDescription', {
    cell: (info) => (
      <span className="text-sm max-w-xs truncate block">{info.getValue() ?? '-'}</span>
    ),
    header: 'Description',
  }),
  columnHelper.accessor('actualAmount', {
    cell: (info) => (
      <span className="flex justify-end text-sm">{formatCurrency(info.getValue())}</span>
    ),
    header: () => <span className="flex justify-end">Amount</span>,
  }),
];

const csvColumns = [
  { header: 'Entity', key: 'entity' as const },
  { header: 'Entity Description', key: 'entityDescription' as const },
  { header: 'Fund', key: 'fund' as const },
  { header: 'Fund Description', key: 'fundDescription' as const },
  { header: 'Financial Dept', key: 'financialDepartment' as const },
  { header: 'Financial Dept Description', key: 'financialDepartmentDescription' as const },
  { header: 'Account', key: 'account' as const },
  { header: 'Account Description', key: 'accountDescription' as const },
  { header: 'Purpose', key: 'purpose' as const },
  { header: 'Purpose Description', key: 'purposeDescription' as const },
  { header: 'Program', key: 'program' as const },
  { header: 'Program Description', key: 'programDescription' as const },
  { header: 'Project', key: 'project' as const },
  { header: 'Project Description', key: 'projectDescription' as const },
  { header: 'Activity', key: 'activity' as const },
  { header: 'Activity Description', key: 'activityDescription' as const },
  { header: 'Document Type', key: 'documentType' as const },
  { header: 'Document Number', key: 'accountingSequenceNumber' as const },
  { header: 'Tracking Number', key: 'trackingNo' as const },
  { header: 'Reference', key: 'reference' as const },
  { header: 'JE Source', key: 'journalSource' as const },
  { header: 'JE Category', key: 'journalCategory' as const },
  { header: 'JE Batch Name', key: 'journalBatchName' as const },
  { header: 'JE Name', key: 'journalName' as const },
  { header: 'JE Accounting Period', key: 'periodName' as const },
  { format: 'date' as const, header: 'JE Accounting Date', key: 'journalAcctDate' as const },
  { format: 'currency' as const, header: 'Amount', key: 'actualAmount' as const },
  { header: 'JE Line Description', key: 'journalLineDescription' as const },
];

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();
  const search = Route.useSearch();

  const { data: transactions, isPending, isError } = useQuery(
    glTransactionsQueryOptions([projectNumber])
  );

  const filtered = (transactions ?? [])
    .filter((t) => matchesSearch(t, search))
    .sort((a, b) => {
      if (!a.journalAcctDate && !b.journalAcctDate) return 0;
      if (!a.journalAcctDate) return 1;
      if (!b.journalAcctDate) return -1;
      return new Date(b.journalAcctDate).getTime() - new Date(a.journalAcctDate).getTime();
    });

  const keyLabel = [search.dept, search.fund, search.program, search.activity]
    .filter(Boolean)
    .join(' / ');

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-6">
        <Link
          className="btn btn-sm mb-4"
          params={{ employeeId, projectNumber }}
          to="/projects/$employeeId/$projectNumber/"
        >
          Back to Project
        </Link>
        <h1 className="h1">Transaction Listing Report (Data source: GL)</h1>
        {keyLabel && <p className="subtitle">{keyLabel}</p>}
      </section>

      {isPending ? (
        <p className="text-base-content/70 mt-4">Loading transactions...</p>
      ) : isError ? (
        <p className="text-error mt-4">Error loading transactions.</p>
      ) : filtered.length === 0 ? (
        <p className="text-base-content/70 mt-4">No GL transactions found.</p>
      ) : (
        <section className="mb-8">
          <DataTable
            columns={columns}
            data={filtered}
            expandable={true}
            pagination="auto"
            tableActions={
              <ExportDataButton
                columns={csvColumns}
                data={filtered.map((t) => ({ ...t, chartString: buildChartString(t) }))}
                filename={`gl-transactions-${projectNumber}.csv`}
              />
            }
          />
        </section>
      )}
    </main>
  );
}