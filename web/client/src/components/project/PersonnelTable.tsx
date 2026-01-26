import { Fragment, useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type ExpandedState,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { ExportCsvButton } from '@/components/ExportCsvButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { PersonnelRecord } from '@/queries/personnel.ts';

function isEndingSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const endDate = new Date(dateStr);
  const now = new Date();
  const threeMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
  return endDate <= threeMonthsFromNow && endDate >= now;
}

export interface AggregatedDistribution {
  record: PersonnelRecord;
  monthlyRate: number;
  monthlyFringe: number;
  monthlyTotal: number;
  fundingEndingSoon: boolean;
}

export interface AggregatedPosition {
  key: string; // emplid + positionNumber
  emplid: string;
  name: string;
  positionNumber: string;
  positionDescription: string;
  fte: number;
  jobEffectiveDate: string | null;
  jobEndDate: string | null;
  jobEndingSoon: boolean;
  monthlyRate: number;
  monthlyFringe: number;
  monthlyTotal: number;
  distributions: AggregatedDistribution[];
}

function aggregateDistribution(record: PersonnelRecord): AggregatedDistribution {
  const monthlyRate = record.monthlyRate * (record.distributionPercent / 100);
  const monthlyFringe = monthlyRate * record.cbr;
  return {
    record,
    monthlyRate,
    monthlyFringe,
    monthlyTotal: monthlyRate + monthlyFringe,
    fundingEndingSoon: isEndingSoon(record.fundingEndDate),
  };
}

export function aggregateByPosition(data: PersonnelRecord[]): AggregatedPosition[] {
  const positionMap = new Map<string, AggregatedPosition>();

  for (const record of data) {
    const key = `${record.emplid}-${record.positionNumber}`;
    const existing = positionMap.get(key);

    if (existing) {
      existing.distributions.push(aggregateDistribution(record));
    } else {
      const monthlyRate = record.monthlyRate;
      const monthlyFringe = monthlyRate * record.cbr;
      positionMap.set(key, {
        key,
        emplid: record.emplid,
        name: record.name,
        positionNumber: record.positionNumber,
        positionDescription: record.positionDescription,
        fte: record.fte,
        jobEffectiveDate: record.jobEffectiveDate,
        jobEndDate: record.jobEndDate,
        jobEndingSoon: isEndingSoon(record.jobEndDate),
        monthlyRate,
        monthlyFringe,
        monthlyTotal: monthlyRate + monthlyFringe,
        distributions: [aggregateDistribution(record)],
      });
    }
  }

  return Array.from(positionMap.values());
}

const columnHelper = createColumnHelper<AggregatedPosition>();

const columns = [
  columnHelper.display({
    id: 'positionProject',
    header: 'Position/Project',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.getIsExpanded() ? (
          <ChevronUpIcon className="w-4 h-4" />
        ) : (
          <ChevronDownIcon className="w-4 h-4" />
        )}
        {row.original.name} - {row.original.positionDescription}
      </div>
    ),
  }),
  columnHelper.accessor('fte', {
    header: () => <span className="flex justify-end w-full">FTE</span>,
    cell: (info) => <span className="flex justify-end">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: 'distPct',
    header: () => <span className="flex justify-end w-full">Dist Pct</span>,
    cell: () => null,
  }),
  columnHelper.accessor('jobEffectiveDate', {
    header: () => <span className="flex justify-end w-full">Effective Date</span>,
    cell: (info) => (
      <span className="flex justify-end">{formatDate(info.getValue(), '')}</span>
    ),
  }),
  columnHelper.accessor('jobEndDate', {
    header: () => <span className="flex justify-end w-full">Expected End Date</span>,
    cell: ({ row }) => {
      const { jobEndDate, jobEndingSoon } = row.original;
      return (
        <span className="flex justify-end">
          {jobEndingSoon ? (
            <span className="text-amber-600 inline-flex items-center gap-1" title="Ending within 3 months">
              <ClockIcon className="w-4 h-4" />
              {formatDate(jobEndDate, '')}
            </span>
          ) : (
            formatDate(jobEndDate, '')
          )}
        </span>
      );
    },
  }),
  columnHelper.accessor('monthlyRate', {
    header: () => <span className="flex justify-end w-full">Monthly Rate</span>,
    cell: (info) => (
      <span className="flex justify-end">{formatCurrency(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor((row) => row.monthlyFringe, {
    id: 'monthlyFringe',
    header: () => <span className="flex justify-end w-full">Monthly Fringe</span>,
    cell: (info) => (
      <span className="flex justify-end">{formatCurrency(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor('monthlyTotal', {
    header: () => <span className="flex justify-end w-full">Monthly Total</span>,
    cell: (info) => (
      <span className="flex justify-end">{formatCurrency(info.getValue())}</span>
    ),
  }),
];

function getExportData(positions: AggregatedPosition[]) {
  return positions.flatMap((pos) =>
    pos.distributions.map((dist) => ({
      name: pos.name,
      positionNumber: pos.positionNumber,
      positionDescription: pos.positionDescription,
      fte: pos.fte,
      projectName: dist.record.projectName,
      distributionPercent: dist.record.distributionPercent,
      fundingEffectiveDate: dist.record.fundingEffectiveDate ?? '',
      fundingEndDate: dist.record.fundingEndDate ?? '',
      monthlyRate: dist.monthlyRate,
      monthlyFringe: dist.monthlyFringe,
      monthlyTotal: dist.monthlyTotal,
    }))
  );
}

const personnelCsvColumns = [
  { key: 'name' as const, header: 'Name' },
  { key: 'positionNumber' as const, header: 'Position Number' },
  { key: 'positionDescription' as const, header: 'Position' },
  { key: 'fte' as const, header: 'FTE' },
  { key: 'projectName' as const, header: 'Project' },
  { key: 'distributionPercent' as const, header: 'Dist %' },
  { key: 'fundingEffectiveDate' as const, header: 'Effective Date' },
  { key: 'fundingEndDate' as const, header: 'End Date' },
  { key: 'monthlyRate' as const, header: 'Monthly Rate' },
  { key: 'monthlyFringe' as const, header: 'Monthly Fringe' },
  { key: 'monthlyTotal' as const, header: 'Monthly Total' },
];

interface PersonnelTableProps {
  data: PersonnelRecord[];
  showTotals?: boolean;
}

export function PersonnelTable({ data, showTotals = true }: PersonnelTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'positionProject', desc: false },
  ]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const positions = useMemo(() => aggregateByPosition(data), [data]);

  const table = useReactTable({
    data: positions,
    columns,
    state: {
      sorting,
      expanded,
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  const totalMonthlyRate = positions.reduce((sum, p) => sum + p.monthlyRate, 0);
  const totalMonthlyFringe = positions.reduce((sum, p) => sum + p.monthlyFringe, 0);
  const totalMonthlyTotal = totalMonthlyRate + totalMonthlyFringe;

  if (positions.length === 0) {
    return <p className="text-base-content/70 mt-4">No personnel found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex justify-end mb-2">
        <ExportCsvButton
          data={getExportData(positions)}
          columns={personnelCsvColumns}
          filename="personnel.csv"
        />
      </div>
      <table className="table walter-table">
        <colgroup>
          <col className="w-1/3" />
          <col className="w-14" />
          <col className="w-12" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <tr
                className="cursor-pointer hover:bg-base-200"
                onClick={() => row.toggleExpanded()}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() &&
                row.original.distributions.map((dist, idx) => (
                  <tr className="pivot-row" key={`${row.id}-dist-${idx}`}>
                    <td className="text-sm pl-8">{dist.record.projectName}</td>
                    <td></td>
                    <td className="text-right text-sm">{dist.record.distributionPercent}%</td>
                    <td className="text-right text-sm">{formatDate(dist.record.fundingEffectiveDate, '')}</td>
                    <td className="text-right text-sm">
                      {dist.fundingEndingSoon ? (
                        <span className="text-amber-600 inline-flex items-center gap-1" title="Ending within 3 months">
                          <ClockIcon className="w-3 h-3" />
                          {formatDate(dist.record.fundingEndDate, '')}
                        </span>
                      ) : (
                        formatDate(dist.record.fundingEndDate, '')
                      )}
                    </td>
                    <td className="text-right text-sm">{formatCurrency(dist.monthlyRate)}</td>
                    <td className="text-right text-sm">{formatCurrency(dist.monthlyFringe)}</td>
                    <td className="text-right text-sm">{formatCurrency(dist.monthlyTotal)}</td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr className="totaltr">
              <td colSpan={5}>Totals</td>
              <td className="text-right">{formatCurrency(totalMonthlyRate)}</td>
              <td className="text-right">{formatCurrency(totalMonthlyFringe)}</td>
              <td className="text-right">{formatCurrency(totalMonthlyTotal)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}