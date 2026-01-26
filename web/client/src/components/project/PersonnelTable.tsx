import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
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

export interface AggregatedPosition {
  key: string; // emplid + positionNumber
  emplid: string;
  name: string;
  positionNumber: string;
  positionDescription: string;
  fte: number;
  jobEffectiveDate: string | null;
  jobEndDate: string | null;
  monthlyRate: number;
  cbr: number;
  distributions: PersonnelRecord[];
  monthlyFringe: number;
}

function PositionRow({ position }: { position: AggregatedPosition }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { monthlyRate, monthlyFringe } = position;

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-base-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            {position.name} - {position.positionDescription}
          </div>
        </td>
        <td className="text-right">{position.fte}</td>
        <td></td>
        <td className="text-right">{formatDate(position.jobEffectiveDate, '')}</td>
        <td className="text-right">
          {isEndingSoon(position.jobEndDate) ? (
            <span className="text-amber-600 inline-flex items-center gap-1" title="Ending within 3 months">
              <ClockIcon className="w-4 h-4" />
              {formatDate(position.jobEndDate, '')}
            </span>
          ) : (
            formatDate(position.jobEndDate, '')
          )}
        </td>
        <td className="text-right">{formatCurrency(monthlyRate)}</td>
        <td className="text-right">{formatCurrency(monthlyFringe)}</td>
        <td className="text-right">
          {formatCurrency(monthlyRate + monthlyFringe)}
        </td>
      </tr>
      {isExpanded &&
        position.distributions.map((dist, idx) => {
          const distMonthlyRate = dist.monthlyRate * (dist.distributionPercent / 100);
          const distMonthlyFringe = distMonthlyRate * dist.cbr;
          return (
            <tr className="pivot-row" key={`${position.key}-${idx}`}>
              <td className="text-sm pl-8">{dist.projectName}</td>
              <td></td>
              <td className="text-right text-sm">{dist.distributionPercent}%</td>
              <td className="text-right text-sm">{formatDate(dist.fundingEffectiveDate, '')}</td>
              <td className="text-right text-sm">
                {isEndingSoon(dist.fundingEndDate) ? (
                  <span className="text-amber-600 inline-flex items-center gap-1" title="Ending within 3 months">
                    <ClockIcon className="w-3 h-3" />
                    {formatDate(dist.fundingEndDate, '')}
                  </span>
                ) : (
                  formatDate(dist.fundingEndDate, '')
                )}
              </td>
              <td className="text-right text-sm">{formatCurrency(distMonthlyRate)}</td>
              <td className="text-right text-sm">{formatCurrency(distMonthlyFringe)}</td>
              <td className="text-right text-sm">{formatCurrency(distMonthlyRate + distMonthlyFringe)}</td>
            </tr>
          );
        })}
    </>
  );
}

export function aggregateByPosition(data: PersonnelRecord[]): AggregatedPosition[] {
  const positionMap = new Map<string, AggregatedPosition>();

  for (const record of data) {
    const key = `${record.emplid}-${record.positionNumber}`;
    const existing = positionMap.get(key);

    if (existing) {
      existing.distributions.push(record);
    } else {
      positionMap.set(key, {
        key,
        emplid: record.emplid,
        name: record.name,
        positionNumber: record.positionNumber,
        positionDescription: record.positionDescription,
        fte: record.fte,
        jobEffectiveDate: record.jobEffectiveDate,
        jobEndDate: record.jobEndDate,
        monthlyRate: record.monthlyRate,
        cbr: record.cbr,
        distributions: [record],
        monthlyFringe: record.monthlyRate * record.cbr,
      });
    }
  }

  return Array.from(positionMap.values());
}

interface PersonnelTableProps {
  data: PersonnelRecord[];
  showTotals?: boolean;
}

export function PersonnelTable({ data, showTotals = true }: PersonnelTableProps) {
  const positions = aggregateByPosition(data).sort((a, b) => a.name.localeCompare(b.name));
  const totalMonthlyRate = positions.reduce((sum, p) => sum + p.monthlyRate, 0);
  const totalMonthlyFringe = positions.reduce((sum, p) => sum + p.monthlyFringe, 0);

  if (positions.length === 0) {
    return <p className="text-base-content/70 mt-4">No personnel found.</p>;
  }

  return (
    <div className="overflow-x-auto">
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
          <tr>
            <th>Position/Project</th>
            <th className="text-right">FTE</th>
            <th className="text-right">Dist Pct</th>
            <th className="text-right">Effective Date</th>
            <th className="text-right">Expected End Date</th>
            <th className="text-right">Monthly Rate</th>
            <th className="text-right">Monthly Fringe</th>
            <th className="text-right">Monthly Total</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <PositionRow position={position} key={position.key} />
          ))}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr className="totaltr">
              <td colSpan={5}>Totals</td>
              <td className="text-right">{formatCurrency(totalMonthlyRate)}</td>
              <td className="text-right">{formatCurrency(totalMonthlyFringe)}</td>
              <td className="text-right">
                {formatCurrency(totalMonthlyRate + totalMonthlyFringe)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}