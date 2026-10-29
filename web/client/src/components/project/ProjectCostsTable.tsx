import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { TableExportActions } from '@/components/TableExportActions.tsx';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { CsvColumn } from '@/lib/csv.ts';
import { formatDate } from '@/lib/date.ts';
import {
  type ProjectCostRecord,
  projectCostsQueryOptions,
} from '@/queries/projectCosts.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';

const columnHelper = createColumnHelper<ProjectCostRecord>();
// Export carries every report column, not just the ones shown on the page.
const projectCostCsvColumns: CsvColumn<ProjectCostRecord>[] = [
  { header: 'Transaction Number', key: 'transactionNumber' },
  { header: 'Award Number', key: 'awardNumber' },
  { header: 'Award Name', key: 'awardName' },
  { header: 'Award Type', key: 'awardType' },
  { header: 'Award Status', key: 'awardStatus' },
  { format: 'date', header: 'Award Start Date', key: 'awardStartDate' },
  { format: 'date', header: 'Award End Date', key: 'awardEndDate' },
  { header: 'Project Number', key: 'projectNumber' },
  { header: 'Project Name', key: 'projectName' },
  { header: 'Project Business Unit', key: 'projectBusinessUnit' },
  { header: 'Project Owning Organization Code', key: 'projectOwningOrgCode' },
  { header: 'Project Owning Organization Name', key: 'projectOwningOrgName' },
  { header: 'Project Type', key: 'projectType' },
  { header: 'Project Status', key: 'projectStatus' },
  { format: 'date', header: 'Project Start Date', key: 'projectStartDate' },
  { format: 'date', header: 'Project End Date', key: 'projectEndDate' },
  { header: 'Task Number', key: 'taskNumber' },
  { header: 'Task Name', key: 'taskName' },
  { header: 'Task Status', key: 'taskStatus' },
  { header: 'Task Fund Code', key: 'taskFundCode' },
  { header: 'Task Fund Name', key: 'taskFundName' },
  { header: 'Task Purpose Code', key: 'taskPurposeCode' },
  { header: 'Task Purpose Name', key: 'taskPurposeName' },
  { header: 'Task Program Code', key: 'taskProgramCode' },
  { header: 'Task Program Name', key: 'taskProgramName' },
  { header: 'Task Activity Code', key: 'taskActivityCode' },
  { header: 'Task Activity Name', key: 'taskActivityName' },
  { header: 'Expenditure Business Unit', key: 'expenditureBusinessUnit' },
  { header: 'Expenditure Organization Code', key: 'expenditureOrgCode' },
  { header: 'Expenditure Organization Name', key: 'expenditureOrgName' },
  { header: 'Expenditure Category', key: 'expenditureCategory' },
  { header: 'Expenditure Type', key: 'expenditureType' },
  { header: 'Expenditure Batch', key: 'expenditureBatch' },
  {
    format: 'date',
    header: 'Expenditure Item Date',
    key: 'expenditureItemDate',
  },
  { header: 'Accounting Period', key: 'accountingPeriod' },
  { format: 'date', header: 'Accounting Date', key: 'accountingDate' },
  { header: 'Document', key: 'document' },
  { header: 'Document Entry', key: 'documentEntry' },
  { header: 'Source Transaction Number', key: 'sourceTransactionNumber' },
  {
    header: 'Transferred From Transaction Number',
    key: 'transferredFromTransactionNumber',
  },
  { header: 'Adjusting Item', key: 'adjustingItem' },
  { header: 'Comment', key: 'comment' },
  { header: 'Billable', key: 'billable' },
  { header: 'Invoiced Status', key: 'invoicedStatus' },
  { header: 'Revenue Status', key: 'revenueStatus' },
  { format: 'currency', header: 'Raw Cost', key: 'rawCost' },
  { format: 'currency', header: 'Burdened Cost', key: 'burdenedCost' },
];

function TruncatedText({
  maxWidthClassName,
  value,
}: {
  maxWidthClassName: string;
  value: string;
}) {
  return (
    <span className="text-sm">
      <TooltipLabel
        className={`block min-w-0 ${maxWidthClassName}`}
        focusable={false}
        label={value}
        labelClassName="block truncate"
        tooltip={value}
      />
    </span>
  );
}

function sumBurdenedCost(rows: { original: ProjectCostRecord }[]) {
  return rows.reduce((total, row) => total + row.original.burdenedCost, 0);
}

export function ProjectCostsTable({
  category,
  isInternal = false,
  projectNumber,
  task,
}: {
  category?: string;
  /** Internal projects show a task column and task filter; sponsored projects have a single task. */
  isInternal?: boolean;
  projectNumber: string;
  task?: string;
}) {
  const { data: projectCostRecords } = useSuspenseQuery(
    projectCostsQueryOptions(projectNumber)
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    category ? [category] : []
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedTask, setSelectedTask] = useState(task ?? '');
  const columns = useMemo(
    () => [
      columnHelper.accessor('expenditureCategory', {
        cell: (info) => (
          <TruncatedText maxWidthClassName="max-w-40" value={info.getValue()} />
        ),
        footer: () => <span className="font-proxima-bold">Total costs</span>,
        header: 'Expenditure Category',
        minSize: 160,
        size: 180,
      }),
      ...(isInternal
        ? [
            columnHelper.accessor(
              (row) => [row.taskNumber, row.taskName].join(' '),
              {
                cell: (info) => (
                  <span className="text-sm whitespace-nowrap">
                    <TooltipLabel
                      focusable={false}
                      label={info.row.original.taskNumber}
                      tooltip={info.row.original.taskName}
                    />
                  </span>
                ),
                footer: () => null,
                header: 'Task',
                id: 'task',
                minSize: 90,
                size: 100,
              }
            ),
          ]
        : []),
      columnHelper.accessor('accountingPeriod', {
        cell: (info) => (
          <span className="text-sm whitespace-nowrap">{info.getValue()}</span>
        ),
        footer: () => null,
        header: 'Accounting Period',
        minSize: 130,
        size: 140,
      }),
      columnHelper.accessor('expenditureItemDate', {
        cell: (info) => (
          <span className="text-sm whitespace-nowrap">
            {formatDate(info.getValue())}
          </span>
        ),
        footer: () => null,
        header: 'Expenditure Item Date',
        minSize: 150,
        size: 160,
      }),
      columnHelper.accessor('documentEntry', {
        cell: (info) => (
          <TruncatedText maxWidthClassName="max-w-32" value={info.getValue()} />
        ),
        footer: () => null,
        header: 'Document Entry',
        minSize: 130,
        size: 150,
      }),
      columnHelper.accessor('expenditureType', {
        cell: (info) => (
          <TruncatedText maxWidthClassName="max-w-48" value={info.getValue()} />
        ),
        footer: () => null,
        header: 'Expenditure Type',
        minSize: 180,
        size: 220,
      }),
      columnHelper.accessor('burdenedCost', {
        cell: (info) => (
          <span className="flex justify-end text-sm whitespace-nowrap">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: ({ table }) => (
          <span className="flex justify-end font-proxima-bold whitespace-nowrap">
            {formatCurrency(sumBurdenedCost(table.getFilteredRowModel().rows))}
          </span>
        ),
        header: () => (
          <span className="flex justify-end w-full">Burdened Cost</span>
        ),
        minSize: 150,
        size: 160,
      }),
    ],
    [isInternal]
  );
  // Keep a URL-selected category visible even when the project has no costs in it.
  const projectCostCategories = useMemo(
    () =>
      [
        ...new Set([
          ...projectCostRecords.map((record) => record.expenditureCategory),
          ...(category ? [category] : []),
        ]),
      ].sort(),
    [category, projectCostRecords]
  );
  // Keep a URL-selected task visible even when the project has no costs on it.
  const projectCostTasks = useMemo(() => {
    const taskNames = new Map<string, string>(task ? [[task, '']] : []);

    for (const record of projectCostRecords) {
      taskNames.set(record.taskNumber, record.taskName);
    }

    return [...taskNames]
      .map(([taskNumber, taskName]) => ({ taskName, taskNumber }))
      .sort((a, b) => a.taskNumber.localeCompare(b.taskNumber));
  }, [projectCostRecords, task]);
  const filteredRecords = useMemo(() => {
    return projectCostRecords.filter((record) => {
      // Dates are 'YYYY-MM-DD' strings, so string comparison orders them.
      const itemDate = record.expenditureItemDate.slice(0, 10);
      const isWithinDates =
        (!fromDate || itemDate >= fromDate) && (!toDate || itemDate <= toDate);
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(record.expenditureCategory);
      const matchesTask = !selectedTask || record.taskNumber === selectedTask;

      return isWithinDates && matchesCategory && matchesTask;
    });
  }, [fromDate, projectCostRecords, selectedCategories, selectedTask, toDate]);
  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((selectedCategory) => selectedCategory !== category)
        : [...current, category]
    );
  };

  return (
    <div data-testid="project-costs-table">
      <div className="mb-4">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label
              className="stat-label mb-1 block"
              htmlFor="project-costs-from-date"
            >
              From
            </label>
            <input
              className="input input-sm"
              id="project-costs-from-date"
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
              type="date"
              value={fromDate}
            />
          </div>
          <div>
            <label
              className="stat-label mb-1 block"
              htmlFor="project-costs-to-date"
            >
              To
            </label>
            <input
              className="input input-sm"
              id="project-costs-to-date"
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              type="date"
              value={toDate}
            />
          </div>
          {fromDate || toDate ? (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              type="button"
            >
              Clear dates
            </button>
          ) : null}

          {isInternal ? (
            <div>
              <label
                className="stat-label mb-1 block"
                htmlFor="project-costs-task"
              >
                Task
              </label>
              <select
                className="select select-sm w-full max-w-full sm:w-auto"
                id="project-costs-task"
                onChange={(event) => setSelectedTask(event.target.value)}
                value={selectedTask}
              >
                <option value="">All Tasks</option>
                {projectCostTasks.map((task) => (
                  <option key={task.taskNumber} value={task.taskNumber}>
                    {task.taskName
                      ? `${task.taskNumber} - ${task.taskName}`
                      : task.taskNumber}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            aria-label="Filter by expenditure category"
            className="tabs tabs-box flex w-fit flex-wrap"
            role="group"
          >
            <button
              aria-pressed={selectedCategories.length === 0}
              className={`tab ${
                selectedCategories.length === 0 ? 'tab-active' : ''
              }`}
              onClick={() => setSelectedCategories([])}
              type="button"
            >
              All Categories
            </button>
            {projectCostCategories.map((category) => {
              const isSelected = selectedCategories.includes(category);

              return (
                <button
                  aria-pressed={isSelected}
                  className={`tab ${isSelected ? 'tab-active' : ''}`}
                  key={category}
                  onClick={() => toggleCategory(category)}
                  type="button"
                >
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-sm"
                    style={{
                      backgroundColor:
                        projectExpenditureCategoryColor(category),
                    }}
                  />
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={filteredRecords}
        footerRowClassName="totaltr"
        getRowProps={(row) => ({
          className: 'hover:bg-base-200/50',
          style: {
            borderLeft: `3px solid ${projectExpenditureCategoryColor(
              row.original.expenditureCategory
            )}`,
          },
        })}
        globalFilter="left"
        initialState={{ pagination: { pageSize: 100 } }}
        tableActions={(table) => (
          <TableExportActions
            baseFilename="project-costs"
            columns={projectCostCsvColumns}
            data={filteredRecords}
            table={table}
            toRows={(rows) => rows}
          />
        )}
      />
    </div>
  );
}
