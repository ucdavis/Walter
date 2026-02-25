import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import type { PersonnelRecord } from '@/queries/personnel.ts';
import { DataTable } from '@/shared/DataTable.tsx';

function isEndingSoon(dateStr: string | null): boolean {
  if (!dateStr) {
    return false;
  }
  const endDate = new Date(dateStr);
  const now = new Date();
  const threeMonthsFromNow = new Date(
    now.getFullYear(),
    now.getMonth() + 3,
    now.getDate()
  );
  return endDate <= threeMonthsFromNow && endDate >= now;
}

function safeText(value: string | null | undefined): string {
  return value ?? '';
}

export interface AggregatedDistribution {
  fundingEndingSoon: boolean;
  monthlyFringe: number;
  monthlyRate: number;
  monthlyTotal: number;
  record: PersonnelRecord;
}

export interface AggregatedPosition {
  distributions: AggregatedDistribution[];
  employeeId: string;
  fte: number;
  jobEffectiveDate: string | null;
  jobEndDate: string | null;
  jobEndingSoon: boolean;
  key: string; // employeeId + positionNumber
  monthlyFringe: number;
  monthlyRate: number;
  monthlyTotal: number;
  name: string;
  positionDescription: string;
  positionNumber: string;
}

function aggregateDistribution(
  record: PersonnelRecord
): AggregatedDistribution {
  const monthlyRate = record.monthlyRate * (record.distributionPercent / 100);
  const monthlyFringe = monthlyRate * record.compositeBenefitRate;
  return {
    fundingEndingSoon: isEndingSoon(record.fundingEndDate),
    monthlyFringe,
    monthlyRate,
    monthlyTotal: monthlyRate + monthlyFringe,
    record,
  };
}

export function aggregateByPosition(
  data: PersonnelRecord[]
): AggregatedPosition[] {
  const positionMap = new Map<string, AggregatedPosition>();

  for (const record of data) {
    const key = `${record.employeeId}-${record.positionNumber}`;
    const existing = positionMap.get(key);

    if (existing) {
      existing.distributions.push(aggregateDistribution(record));
    } else {
      const monthlyRate = record.monthlyRate;
      const monthlyFringe = monthlyRate * record.compositeBenefitRate;
      positionMap.set(key, {
        distributions: [aggregateDistribution(record)],
        employeeId: record.employeeId,
        fte: record.fte,
        jobEffectiveDate: record.jobEffectiveDate,
        jobEndDate: record.jobEndDate,
        jobEndingSoon: isEndingSoon(record.jobEndDate),
        key,
        monthlyFringe,
        monthlyRate,
        monthlyTotal: monthlyRate + monthlyFringe,
        name: safeText(record.name),
        positionDescription: safeText(record.positionDescription),
        positionNumber: safeText(record.positionNumber),
      });
    }
  }

  return Array.from(positionMap.values());
}

const columnHelper = createColumnHelper<AggregatedPosition>();

function getPositionSearchText(position: AggregatedPosition): string {
  const projectDescriptions = position.distributions
    .map((dist) => dist.record.projectDescription)
    .join(' ');

  return [
    safeText(position.name),
    safeText(position.positionDescription),
    safeText(position.positionNumber),
    projectDescriptions,
  ].join(' ');
}

function DistributionSubtable({
  distributions,
}: {
  distributions: AggregatedDistribution[];
}) {
  return (
    <div className="pr-4">
      <table className="table walter-table walter-subtable">
        <thead>
          <tr>
            <th>Project</th>
            <th>
              <span className="flex justify-end w-full">Dist %</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Funding Effective</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Funding End</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Monthly Rate</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Monthly Fringe</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Monthly Total</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {distributions.map((dist, idx) => (
            <tr key={idx}>
              <td className="text-sm">{dist.record.projectDescription}</td>
              <td className="text-right text-sm">
                {dist.record.distributionPercent}%
              </td>
              <td className="text-right text-sm">
                {formatDate(dist.record.fundingEffectiveDate, '')}
              </td>
              <td className="text-right text-sm">
                {dist.fundingEndingSoon ? (
                  <span
                    className="text-error inline-flex items-center gap-1"
                    title="Ending within 3 months"
                  >
                    <ClockIcon className="w-3 h-3" />
                    {formatDate(dist.record.fundingEndDate, '')}
                  </span>
                ) : (
                  formatDate(dist.record.fundingEndDate, '')
                )}
              </td>
              <td className="text-right text-sm">
                {formatCurrency(dist.monthlyRate)}
              </td>
              <td className="text-right text-sm">
                {formatCurrency(dist.monthlyFringe)}
              </td>
              <td className="text-right text-sm">
                {formatCurrency(dist.monthlyTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getExportData(positions: AggregatedPosition[]) {
  return positions.flatMap((pos) =>
    pos.distributions.map((dist) => ({
      distributionPercent: dist.record.distributionPercent,
      fte: pos.fte,
      fundingEffectiveDate: dist.record.fundingEffectiveDate ?? '',
      fundingEndDate: dist.record.fundingEndDate ?? '',
      monthlyFringe: dist.monthlyFringe,
      monthlyRate: dist.monthlyRate,
      monthlyTotal: dist.monthlyTotal,
      name: pos.name,
      positionDescription: pos.positionDescription,
      positionNumber: pos.positionNumber,
      projectDescription: dist.record.projectDescription,
    }))
  );
}

const personnelCsvColumns = [
  { header: 'Name', key: 'name' as const },
  { header: 'Position Number', key: 'positionNumber' as const },
  { header: 'Position', key: 'positionDescription' as const },
  { header: 'FTE', key: 'fte' as const },
  { header: 'Project', key: 'projectDescription' as const },
  { header: 'Dist %', key: 'distributionPercent' as const },
  { format: 'date' as const, header: 'Effective Date', key: 'fundingEffectiveDate' as const },
  { format: 'date' as const, header: 'End Date', key: 'fundingEndDate' as const },
  { format: 'currency' as const, header: 'Monthly Rate', key: 'monthlyRate' as const },
  { format: 'currency' as const, header: 'Monthly Fringe', key: 'monthlyFringe' as const },
  { format: 'currency' as const, header: 'Monthly Total', key: 'monthlyTotal' as const },
];

interface PersonnelTableProps {
  data: PersonnelRecord[];
  showTotals?: boolean;
}

function isUnfilled(position: AggregatedPosition): boolean {
  return !position.name;
}

export function PersonnelTable({
  data,
  showTotals = true,
}: PersonnelTableProps) {
  const [showUnfilled, setShowUnfilled] = useState(false);
  const allPositions = useMemo(() => aggregateByPosition(data), [data]);
  const unfilledCount = useMemo(
    () => allPositions.filter(isUnfilled).length,
    [allPositions]
  );
  const positions = useMemo(
    () =>
      showUnfilled ? allPositions : allPositions.filter((p) => !isUnfilled(p)),
    [allPositions, showUnfilled]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor(getPositionSearchText, {
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.getCanExpand() ? (
              row.getIsExpanded() ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )
            ) : null}
            {safeText(row.original.name)} -{' '}
            {safeText(row.original.positionDescription)}
          </div>
        ),
        footer: showTotals ? () => 'Totals' : undefined,
        header: 'Position/Project',
        id: 'positionProject',
        minSize: 260,
        size: 320,
        sortingFn: (a, b) =>
          safeText(a.original.name).localeCompare(safeText(b.original.name)),
      }),
      columnHelper.accessor('fte', {
        cell: (info) => (
          <span className="flex justify-end">{info.getValue()}</span>
        ),
        header: () => <span className="flex justify-end w-full">FTE</span>,
      }),
      columnHelper.accessor('jobEffectiveDate', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatDate(info.getValue() as string | null, '')}
          </span>
        ),
        header: () => (
          <span className="flex justify-end w-full">Effective Date</span>
        ),
      }),
      columnHelper.accessor('jobEndDate', {
        cell: ({ row }) => {
          const { jobEndDate, jobEndingSoon } = row.original;
          return (
            <span className="flex justify-end">
              {jobEndingSoon ? (
                <span
                  className="text-error inline-flex items-center gap-1"
                  title="Ending within 3 months"
                >
                  <ClockIcon className="w-4 h-4" />
                  {formatDate(jobEndDate, '')}
                </span>
              ) : (
                formatDate(jobEndDate, '')
              )}
            </span>
          );
        },
        header: () => (
          <span className="flex justify-end w-full">Expected End Date</span>
        ),
      }),
      columnHelper.accessor('monthlyRate', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: showTotals
          ? ({ table }) => (
              <span className="flex justify-end w-full">
                {formatCurrency(
                  table
                    .getFilteredRowModel()
                    .rows.reduce(
                      (sum, row) => sum + row.original.monthlyRate,
                      0
                    )
                )}
              </span>
            )
          : undefined,
        header: () => (
          <span className="flex justify-end w-full">Monthly Rate</span>
        ),
      }),
      columnHelper.accessor('monthlyFringe', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: showTotals
          ? ({ table }) => (
              <span className="flex justify-end w-full">
                {formatCurrency(
                  table
                    .getFilteredRowModel()
                    .rows.reduce(
                      (sum, row) => sum + row.original.monthlyFringe,
                      0
                    )
                )}
              </span>
            )
          : undefined,
        header: () => (
          <span className="flex justify-end w-full">Monthly Fringe</span>
        ),
      }),
      columnHelper.accessor('monthlyTotal', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: showTotals
          ? ({ table }) => (
              <span className="flex justify-end w-full">
                {formatCurrency(
                  table
                    .getFilteredRowModel()
                    .rows.reduce(
                      (sum, row) => sum + row.original.monthlyTotal,
                      0
                    )
                )}
              </span>
            )
          : undefined,
        header: () => (
          <span className="flex justify-end w-full">Monthly Total</span>
        ),
      }),
    ],
    [showTotals]
  );

  if (positions.length === 0) {
    return <p className="text-base-content/70 mt-4">No personnel found.</p>;
  }

  const tableActions = (
    <>
      {unfilledCount > 0 && (
        <button
          className={`btn btn-sm ${showUnfilled ? 'btn-active' : 'btn-default'}`}
          onClick={() => setShowUnfilled(!showUnfilled)}
          type="button"
        >
          {showUnfilled ? 'Hide' : 'Show'} unfilled ({unfilledCount})
        </button>
      )}
      <ExportDataButton
        columns={personnelCsvColumns}
        data={getExportData(positions)}
        filename="personnel.csv"
      />
    </>
  );

  return (
    <div>
      <DataTable
        columns={columns}
        data={positions}
        tableActions={tableActions}
        footerRowClassName="totaltr"
        getRowCanExpand={(row) => row.original.distributions.length > 0}
        getRowProps={(row) =>
          row.getCanExpand()
            ? {
                className: 'cursor-pointer hover:bg-base-200',
                onClick: () => row.toggleExpanded(),
              }
            : { className: 'hover:bg-base-200' }
        }
        globalFilter="left"
        initialState={{ sorting: [{ desc: false, id: 'positionProject' }] }}
        pagination="off"
        renderSubComponent={({ row }) => (
          <DistributionSubtable distributions={row.original.distributions} />
        )}
        subComponentRowClassName="pivot-row"
      />
    </div>
  );
}
