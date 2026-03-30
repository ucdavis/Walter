import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface ChartStringRow {
  activityCode: string;
  activityDesc: string;
  balance: number;
  budget: number;
  commitments: number;
  expenditureCategoryName: string;
  expenses: number;
  financialDepartment: string;
  financialDepartmentCode: string;
  fundCode: string;
  fundDesc: string;
  programCode: string;
  programDesc: string;
  taskName: string;
  taskNum: string;
}

const columnHelper = createColumnHelper<ChartStringRow>();

function buildRows(records: ProjectRecord[]): ChartStringRow[] {
  const map = new Map<string, ChartStringRow>();

  for (const r of records) {
    const fund = r.fundCode ?? '';
    const program = r.programCode ?? '';
    const activity = r.activityCode ?? '';
    const task = r.taskNum ?? '';
    const expenditureCategory = r.expenditureCategoryName ?? '';
    const key = `${task}|${fund}|${program}|${activity}|${expenditureCategory}`;

    const existing = map.get(key);
    if (existing) {
      existing.budget += r.budget;
      existing.expenses += r.expenses;
      existing.commitments += r.commitments;
      existing.balance += r.balance;
    } else {
      map.set(key, {
        activityCode: activity,
        activityDesc: r.activityDesc,
        balance: r.balance,
        budget: r.budget,
        commitments: r.commitments,
        expenditureCategoryName: expenditureCategory,
        expenses: r.expenses,
        financialDepartment: r.projectOwningOrg,
        financialDepartmentCode: r.projectOwningOrgCode,
        fundCode: fund,
        fundDesc: r.fundDesc,
        programCode: program,
        programDesc: r.programDesc,
        taskName: r.taskName ?? '',
        taskNum: task,
      });
    }
  }

  return Array.from(map.values());
}

interface ChartStringBreakdownProps {
  employeeId: string;
  projectNumber: string;
  records: ProjectRecord[];
}

export function ChartStringBreakdown({ employeeId, projectNumber, records }: ChartStringBreakdownProps) {
  const rows = useMemo(() => buildRows(records), [records]);

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
        cell: (info) => (
          <div>
            <div className="text-xs text-base-content/70">
              {info.row.original.financialDepartmentCode}
            </div>
            <div>{info.getValue()}</div>
          </div>
        ),
        footer: () => 'Totals',
        header: 'Financial Dept',
        minSize: 180,
      }),
      columnHelper.accessor('taskNum', {
        cell: (info) => (
          <span title={info.row.original.taskName}>{info.getValue()}</span>
        ),
        header: 'Task',
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
      columnHelper.accessor('expenditureCategoryName', {
        cell: (info) => <span>{info.getValue() || '-'}</span>,
        header: 'Expenditure Category',
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
        header: () => (
          <span className="flex justify-end w-full">
            <TooltipLabel
              label="Commitments"
              placement="bottom"
              tooltip={tooltipDefinitions.commitment}
            />
          </span>
        ),
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
        header: () => (
          <span className="flex justify-end w-full">
            <TooltipLabel
              label="Balance"
              placement="bottom"
              tooltip={tooltipDefinitions.balance}
            />
          </span>
        ),
      }),
      columnHelper.display({
        cell: (info) => {
          const row = info.row.original;
          return (
            <Link
              className="link font-semibold text-sm whitespace-nowrap"
              params={{ employeeId, projectNumber }}
              search={{
                activity: row.activityCode,
                dept: row.financialDepartmentCode,
                fund: row.fundCode,
                program: row.programCode,
              }}
              to="/projects/$employeeId/$projectNumber/transactions"
            >
              GL Details
            </Link>
          );
        },
        header: '',
        id: 'glLink',
      }),
    ],
    [employeeId, projectNumber, totals.balance, totals.budget, totals.commitments, totals.expenses]
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
