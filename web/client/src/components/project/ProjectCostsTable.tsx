import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { TableExportActions } from '@/components/TableExportActions.tsx';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { CsvColumn } from '@/lib/csv.ts';
import {
  type ProjectCostRecord,
  projectCostsQueryOptions,
} from '@/queries/projectCosts.ts';
import { DataTable } from '@/shared/DataTable.tsx';

const columnHelper = createColumnHelper<ProjectCostRecord>();
const accountingPeriodMonthIndexes: Record<string, number> = {
  Apr: 3,
  Aug: 7,
  Dec: 11,
  Feb: 1,
  Jan: 0,
  Jul: 6,
  Jun: 5,
  Mar: 2,
  May: 4,
  Nov: 10,
  Oct: 9,
  Sep: 8,
};
const projectCostTimelineOptions = [
  { label: 'Entire project', value: 'entire-project' },
  { label: '3mo', value: '3-months' },
  { label: '6mo', value: '6-months' },
  { label: '9mo', value: '9-months' },
] as const;
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
  { header: 'Project Owning Organization', key: 'projectOwningOrg' },
  { header: 'Project Type', key: 'projectType' },
  { header: 'Project Status', key: 'projectStatus' },
  { format: 'date', header: 'Project Start Date', key: 'projectStartDate' },
  { format: 'date', header: 'Project End Date', key: 'projectEndDate' },
  { header: 'Task Number', key: 'taskNumber' },
  { header: 'Task Name', key: 'taskName' },
  { header: 'Task Status', key: 'taskStatus' },
  { header: 'Task Fund', key: 'taskFund' },
  { header: 'Task Purpose', key: 'taskPurpose' },
  { header: 'Task Program', key: 'taskProgram' },
  { header: 'Task Activity', key: 'taskActivity' },
  { header: 'Expenditure Business Unit', key: 'expenditureBusinessUnit' },
  { header: 'Expenditure Organization', key: 'expenditureOrg' },
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

type ProjectCostTimeline = (typeof projectCostTimelineOptions)[number]['value'];

function getAccountingPeriodMonthIndex(accountingPeriod: string) {
  const [monthName, shortYear] = accountingPeriod.split('-');
  const monthIndex = accountingPeriodMonthIndexes[monthName] ?? 0;

  return (2000 + Number(shortYear)) * 12 + monthIndex;
}

function getTimelineMonthCount(timeline: ProjectCostTimeline) {
  switch (timeline) {
    case '3-months':
      return 3;
    case '6-months':
      return 6;
    case '9-months':
      return 9;
    default:
      return null;
  }
}

function sumBurdenedCost(rows: { original: ProjectCostRecord }[]) {
  return rows.reduce((total, row) => total + row.original.burdenedCost, 0);
}

export function ProjectCostsTable({
  category,
  projectNumber,
}: {
  category?: string;
  projectNumber: string;
}) {
  const { data: projectCostRecords } = useSuspenseQuery(
    projectCostsQueryOptions(projectNumber)
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    category ? [category] : []
  );
  const [selectedTimeline, setSelectedTimeline] =
    useState<ProjectCostTimeline>('entire-project');
  const columns = useMemo(
    () => [
      columnHelper.accessor('expenditureCategory', {
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
        footer: () => <span className="font-proxima-bold">Total costs</span>,
        header: 'Expenditure Category',
        minSize: 220,
        size: 260,
      }),
      columnHelper.accessor('accountingPeriod', {
        cell: (info) => (
          <span className="text-sm whitespace-nowrap">{info.getValue()}</span>
        ),
        footer: () => null,
        header: 'Accounting Period',
        minSize: 130,
        size: 140,
      }),
      columnHelper.accessor('documentEntry', {
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
        footer: () => null,
        header: 'Document Entry',
        minSize: 180,
        size: 190,
      }),
      columnHelper.accessor('expenditureType', {
        cell: (info) => <span className="text-sm">{info.getValue()}</span>,
        footer: () => null,
        header: 'Expenditure Type',
        minSize: 260,
        size: 300,
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
    []
  );
  const latestAccountingPeriodMonthIndex = useMemo(
    () =>
      projectCostRecords.reduce(
        (latest, record) =>
          Math.max(
            latest,
            getAccountingPeriodMonthIndex(record.accountingPeriod)
          ),
        Number.NEGATIVE_INFINITY
      ),
    [projectCostRecords]
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
  const filteredRecords = useMemo(() => {
    const timelineMonthCount = getTimelineMonthCount(selectedTimeline);
    const earliestTimelineMonthIndex =
      timelineMonthCount === null
        ? null
        : latestAccountingPeriodMonthIndex - timelineMonthCount + 1;

    return projectCostRecords.filter((record) => {
      const isWithinTimeline =
        earliestTimelineMonthIndex === null ||
        getAccountingPeriodMonthIndex(record.accountingPeriod) >=
          earliestTimelineMonthIndex;
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(record.expenditureCategory);

      return isWithinTimeline && matchesCategory;
    });
  }, [
    latestAccountingPeriodMonthIndex,
    projectCostRecords,
    selectedCategories,
    selectedTimeline,
  ]);
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
        <div className="mb-4">
          <span className="stat-label mb-1 block">Timeline</span>
          <div aria-label="Timeline" className="join" role="group">
            {projectCostTimelineOptions.map((option) => {
              const isSelected = selectedTimeline === option.value;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`btn btn-sm join-item ${
                    isSelected ? 'btn-active' : ''
                  }`}
                  key={option.value}
                  onClick={() => setSelectedTimeline(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
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
