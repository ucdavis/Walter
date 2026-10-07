import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { TableExportActions } from '@/components/TableExportActions.tsx';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { CsvColumn } from '@/lib/csv.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface ProjectCostRecord {
  accountingPeriod: string;
  burdenedCost: number;
  documentEntry: string;
  expenditureCategory: string;
  expenditureType: string;
}

// Temporary sample data keeps the preview useful until project-cost transactions are available.
const projectCostRecords: ProjectCostRecord[] = [
  {
    accountingPeriod: 'Oct-25',
    burdenedCost: 1125.8,
    documentEntry: 'Prior Period Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
  },
  {
    accountingPeriod: 'Nov-25',
    burdenedCost: 2340.2,
    documentEntry: 'Service Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522860 - Technical Services',
  },
  {
    accountingPeriod: 'Dec-25',
    burdenedCost: 975.45,
    documentEntry: 'Equipment Rental',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522840 - Equipment Rental',
  },
  {
    accountingPeriod: 'Jan-26',
    burdenedCost: 1740.26,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
  },
  {
    accountingPeriod: 'Feb-26',
    burdenedCost: 725.1,
    documentEntry: 'Travel Reimbursement',
    expenditureCategory: '07 - Travel',
    expenditureType: '523220 - Field Research Travel',
  },
  {
    accountingPeriod: 'Mar-26',
    burdenedCost: 1280.4,
    documentEntry: 'Purchase Order Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522810 - Research Materials',
  },
  {
    accountingPeriod: 'Apr-26',
    burdenedCost: 12_785.42,
    documentEntry: 'Payroll Distribution',
    expenditureCategory: '01 - Salaries and Wages',
    expenditureType: '501010 - Research Personnel Salary',
  },
  {
    accountingPeriod: 'Apr-26',
    burdenedCost: 4116.25,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
  },
  {
    accountingPeriod: 'Apr-26',
    burdenedCost: 986.7,
    documentEntry: 'Supplier Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522810 - Research Materials',
  },
  {
    accountingPeriod: 'Apr-26',
    burdenedCost: 2975.34,
    documentEntry: 'Indirect Cost Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
  },
  {
    accountingPeriod: 'May-26',
    burdenedCost: 13_124.18,
    documentEntry: 'Payroll Distribution',
    expenditureCategory: '01 - Salaries and Wages',
    expenditureType: '501010 - Research Personnel Salary',
  },
  {
    accountingPeriod: 'May-26',
    burdenedCost: 4235.71,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
  },
  {
    accountingPeriod: 'May-26',
    burdenedCost: 684.9,
    documentEntry: 'Travel Reimbursement',
    expenditureCategory: '07 - Travel',
    expenditureType: '523210 - Domestic Conference Travel',
  },
  {
    accountingPeriod: 'May-26',
    burdenedCost: 1148.32,
    documentEntry: 'Purchase Order Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522830 - Specialized Equipment',
  },
  {
    accountingPeriod: 'May-26',
    burdenedCost: 3144.76,
    documentEntry: 'Indirect Cost Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
  },
  {
    accountingPeriod: 'Jun-26',
    burdenedCost: 12_934.66,
    documentEntry: 'Payroll Distribution',
    expenditureCategory: '01 - Salaries and Wages',
    expenditureType: '501010 - Research Personnel Salary',
  },
  {
    accountingPeriod: 'Jun-26',
    burdenedCost: 4188.09,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
  },
  {
    accountingPeriod: 'Jun-26',
    burdenedCost: -320,
    documentEntry: 'Cost Transfer',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522810 - Research Materials',
  },
  {
    accountingPeriod: 'Jun-26',
    burdenedCost: 1567.44,
    documentEntry: 'Supplier Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522850 - Laboratory Support Services',
  },
  {
    accountingPeriod: 'Jun-26',
    burdenedCost: 3108.52,
    documentEntry: 'Indirect Cost Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
  },
];

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
const projectCostCategories = [
  ...new Set(projectCostRecords.map((record) => record.expenditureCategory)),
];
const projectCostTimelineOptions = [
  { label: 'Entire project', value: 'entire-project' },
  { label: '3mo', value: '3-months' },
  { label: '6mo', value: '6-months' },
  { label: '9mo', value: '9-months' },
] as const;
const projectCostCsvColumns: CsvColumn<ProjectCostRecord>[] = [
  { header: 'Expenditure Category', key: 'expenditureCategory' },
  { header: 'Accounting Period', key: 'accountingPeriod' },
  { header: 'Document Entry', key: 'documentEntry' },
  { header: 'Expenditure Type', key: 'expenditureType' },
  { format: 'currency', header: 'Burdened Cost', key: 'burdenedCost' },
];

type ProjectCostTimeline = (typeof projectCostTimelineOptions)[number]['value'];

function getAccountingPeriodMonthIndex(accountingPeriod: string) {
  const [monthName, shortYear] = accountingPeriod.split('-');
  const monthIndex = accountingPeriodMonthIndexes[monthName] ?? 0;

  return (2000 + Number(shortYear)) * 12 + monthIndex;
}

const latestAccountingPeriodMonthIndex = Math.max(
  ...projectCostRecords.map((record) =>
    getAccountingPeriodMonthIndex(record.accountingPeriod)
  )
);

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

export function ProjectCostsTable() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
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
  }, [selectedCategories, selectedTimeline]);
  const hasSelectedCategories = selectedCategories.length > 0;

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
          <button
            className="btn btn-sm"
            disabled={!hasSelectedCategories}
            onClick={() => setSelectedCategories([])}
            type="button"
          >
            Clear
          </button>
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
        pagination="off"
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
