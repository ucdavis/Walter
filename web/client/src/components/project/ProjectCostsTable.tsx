import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
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
const projectCostCategories = [
  ...new Set(projectCostRecords.map((record) => record.expenditureCategory)),
];

function sumBurdenedCost(rows: { original: ProjectCostRecord }[]) {
  return rows.reduce((total, row) => total + row.original.burdenedCost, 0);
}

export function ProjectCostsTable() {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
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
  const filteredRecords = useMemo(
    () =>
      selectedCategories.length === 0
        ? projectCostRecords
        : projectCostRecords.filter((record) =>
            selectedCategories.includes(record.expenditureCategory)
          ),
    [selectedCategories]
  );
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
                    backgroundColor: projectExpenditureCategoryColor(category),
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
      />
    </div>
  );
}
