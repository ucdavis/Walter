import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface TaskBreakdownRow {
  activityCode: string;
  activityDesc: string;
  balance: number;
  budget: number;
  commitments: number;
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

const columnHelper = createColumnHelper<TaskBreakdownRow>();

function buildRows(records: ProjectRecord[]): TaskBreakdownRow[] {
  const map = new Map<string, TaskBreakdownRow>();

  for (const r of records) {
    const fund = r.fundCode ?? '';
    const program = r.programCode ?? '';
    const activity = r.activityCode ?? '';
    const task = r.taskNum ?? '';
    const key = `${task}|${fund}|${program}|${activity}`;

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

const csvColumns = [
  { header: 'Financial Dept Code', key: 'financialDepartmentCode' as const },
  { header: 'Financial Dept', key: 'financialDepartment' as const },
  { header: 'Task', key: 'taskNum' as const },
  { header: 'Task Name', key: 'taskName' as const },
  { header: 'Fund', key: 'fundCode' as const },
  { header: 'Fund Description', key: 'fundDesc' as const },
  { header: 'Program', key: 'programCode' as const },
  { header: 'Program Description', key: 'programDesc' as const },
  { header: 'Activity', key: 'activityCode' as const },
  { header: 'Activity Description', key: 'activityDesc' as const },
  { format: 'currency' as const, header: 'Budget', key: 'budget' as const },
  { format: 'currency' as const, header: 'Expenses', key: 'expenses' as const },
  { format: 'currency' as const, header: 'Commitments', key: 'commitments' as const },
  { format: 'currency' as const, header: 'Balance', key: 'balance' as const },
];

interface TaskBreakdownProps {
  employeeId: string;
  projectNumber: string;
  records: ProjectRecord[];
}

export function TaskBreakdown({ employeeId, projectNumber, records }: TaskBreakdownProps) {
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
      columnHelper.accessor('taskNum', {
        cell: (info) => (
          <div>
            <div>{info.getValue()}</div>
            {info.row.original.taskName && (
              <div className="text-xs text-base-content/80">
                {info.row.original.taskName}
              </div>
            )}
          </div>
        ),
        footer: () => 'Totals',
        header: 'Task',
        minSize: 200,
      }),
      columnHelper.accessor('financialDepartmentCode', {
        cell: (info) => <span>{info.getValue()}</span>,
        header: 'Dept',
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
                task: row.taskNum,
              }}
              to="/projects/$employeeId/$projectNumber/expenditure-categories"
            >
              Details
            </Link>
          );
        },
        header: '',
        id: 'detailsLink',
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
      tableActions={
        <ExportDataButton
          columns={csvColumns}
          data={rows}
          filename={`task-breakdown-${projectNumber}.csv`}
        />
      }
    />
  );
}
