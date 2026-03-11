import { useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface ChartStringRow {
  activityCode: string;
  activityDesc: string;
  balance: number;
  budget: number;
  commitments: number;
  expenses: number;
  financialDepartment: string;
  fundCode: string;
  fundDesc: string;
  programCode: string;
  programDesc: string;
}

const columnHelper = createColumnHelper<ChartStringRow>();

type DataSource = 'GL' | 'PPM';

function buildRows(records: ProjectRecord[], dataSource: DataSource): ChartStringRow[] {
  const map = new Map<string, ChartStringRow>();

  for (const r of records) {
    const fund = r.fundCode ?? '';
    const program = r.programCode ?? '';
    const activity = r.activityCode ?? '';
    const key = `${fund}|${program}|${activity}`;

    let budget: number;
    let exp: number;
    let balance: number;
    // We always use PPM commitments due to a bug in commitments in the datamart transaction listings report
    const commit = r.ppmCommitments;

    if (dataSource === 'GL') {
      const begBal = r.glBeginningBalance ?? 0;
      const rev = r.glRevenue ?? 0;
      exp = r.glExpenses ?? 0;
      budget = begBal + rev;
      balance = begBal + rev - exp - commit;
    } else {
      budget = r.ppmBudget;
      exp = r.ppmExpenses;
      balance = r.ppmBudBal;
    }

    const existing = map.get(key);
    if (existing) {
      existing.budget += budget;
      existing.expenses += exp;
      existing.commitments += commit;
      existing.balance += balance;
    } else {
      map.set(key, {
        activityCode: activity,
        activityDesc: r.activityDesc,
        balance,
        budget,
        commitments: commit,
        expenses: exp,
        financialDepartment: r.projectOwningOrg,
        fundCode: fund,
        fundDesc: r.fundDesc,
        programCode: program,
        programDesc: r.programDesc,
      });
    }
  }

  return Array.from(map.values());
}

interface ChartStringBreakdownProps {
  dataSource: DataSource;
  records: ProjectRecord[];
}

export function ChartStringBreakdown({ dataSource, records }: ChartStringBreakdownProps) {
  const rows = useMemo(() => buildRows(records, dataSource), [records, dataSource]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          balance: acc.balance + r.balance,
          budget: acc.budget + r.budget,
          commitments: acc.commitments + r.commitments,
          expenses: acc.expenses + r.expenses,
        }),
        { balance: 0, budget: 0, commitments: 0, expenses: 0 }
      ),
    [rows]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('financialDepartment', {
        cell: (info) => info.getValue(),
        footer: () => 'Totals',
        header: 'Financial Dept',
        minSize: 180,
      }),
      columnHelper.accessor('fundCode', {
        cell: (info) => (
          <span title={info.row.original.fundDesc}>{info.getValue()}</span>
        ),
        header: 'Fund',
      }),
      columnHelper.accessor('programCode', {
        cell: (info) => (
          <span title={info.row.original.programDesc}>{info.getValue()}</span>
        ),
        header: 'Program',
      }),
      columnHelper.accessor('activityCode', {
        cell: (info) => (
          <span title={info.row.original.activityDesc}>{info.getValue()}</span>
        ),
        header: 'Activity',
      }),
      columnHelper.accessor('budget', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.budget)}
          </span>
        ),
        header: () => <span className="flex justify-end">Budget</span>,
      }),
      columnHelper.accessor('expenses', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.expenses)}
          </span>
        ),
        header: () => <span className="flex justify-end">Expenses</span>,
      }),
      columnHelper.accessor('commitments', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.commitments)}
          </span>
        ),
        header: () => <span className="flex justify-end">Commitments</span>,
      }),
      columnHelper.accessor('balance', {
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className={`flex justify-end ${value < 0 ? 'text-error' : ''}`}>
              {formatCurrency(value)}
            </span>
          );
        },
        footer: () => (
          <span className={`flex justify-end ${totals.balance < 0 ? 'text-error' : ''}`}>
            {formatCurrency(totals.balance)}
          </span>
        ),
        header: () => <span className="flex justify-end">Balance</span>,
      }),
    ],
    [totals.balance, totals.budget, totals.commitments, totals.expenses]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      footerRowClassName="totaltr"
    />
  );
}