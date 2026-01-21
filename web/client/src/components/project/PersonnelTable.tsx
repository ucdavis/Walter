import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { PersonnelRecord } from '@/queries/personnel.ts';

interface AggregatedEmployee {
  emplid: string;
  name: string;
  positions: PersonnelRecord[];
  projectCount: number;
  totalAnnualSalary: number;
  totalFringeAmount: number;
  // Primary position (highest distribution %)
  primaryPosition: PersonnelRecord;
}

const formatName = (name: string) => {
  const [last, first] = name.split(',');
  return `${first?.trim() ?? ''} ${last?.trim() ?? ''}`.trim();
};

function EmployeeRow({ employee }: { employee: AggregatedEmployee }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const uniqueJobTitles = new Set(employee.positions.map((p) => p.positionDescr));
  const additionalTitles = uniqueJobTitles.size - 1;

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
            {formatName(employee.name)}
          </div>
        </td>
        <td>
          {employee.primaryPosition.positionDescr}
          {additionalTitles > 0 && (
            <span className="text-base-content/50 text-sm ml-1">
              (+{additionalTitles})
            </span>
          )}
        </td>
        <td>{formatDate(employee.primaryPosition.fundingEndDt)}</td>
        <td className="text-right">{employee.projectCount}</td>
        <td className="text-right">
          {formatCurrency(employee.totalAnnualSalary)}
        </td>
        <td className="text-right">
          {formatCurrency(employee.totalFringeAmount)}
        </td>
        <td className="text-right">
          {formatCurrency(
            employee.totalAnnualSalary + employee.totalFringeAmount
          )}
        </td>
      </tr>
      {/* Sort positions by job title, then by distribution % descending */}
      {isExpanded &&
        [...employee.positions]
          .sort((a, b) => {
            const titleCompare = a.positionDescr.localeCompare(b.positionDescr);
            if (titleCompare !== 0) return titleCompare;
            return b.distPct - a.distPct;
          })
          .map((position, idx) => {
          const annualSalary = position.monthlyRt * 12;
          const fringeAmount = annualSalary * position.cbr;
          return (
            <tr className="pivot-row" key={`${employee.emplid}-${idx}`}>
              <td className="text-sm">{position.projectName}</td>
              <td className="text-sm">{position.positionDescr}</td>
              <td className="text-sm">{formatDate(position.fundingEndDt)}</td>
              <td className="text-right text-sm">{position.distPct}%</td>
              <td className="text-right text-sm">
                {formatCurrency(annualSalary)}
              </td>
              <td className="text-right text-sm">
                {formatCurrency(fringeAmount)}
              </td>
              <td className="text-right text-sm">
                {formatCurrency(annualSalary + fringeAmount)}
              </td>
            </tr>
          );
        })}
    </>
  );
}

function aggregateByEmployee(data: PersonnelRecord[]): AggregatedEmployee[] {
  const employeeMap = new Map<string, AggregatedEmployee>();

  for (const record of data) {
    const existing = employeeMap.get(record.emplid);
    const annualSalary = record.monthlyRt * 12;
    const fringeAmount = annualSalary * record.cbr;

    if (existing) {
      existing.positions.push(record);
      existing.totalAnnualSalary += annualSalary;
      existing.totalFringeAmount += fringeAmount;
      const projectIds = new Set(existing.positions.map((p) => p.projectId));
      existing.projectCount = projectIds.size;
    } else {
      employeeMap.set(record.emplid, {
        emplid: record.emplid,
        name: record.name,
        positions: [record],
        projectCount: 1,
        totalAnnualSalary: annualSalary,
        totalFringeAmount: fringeAmount,
        primaryPosition: record,
      });
    }
  }

  return Array.from(employeeMap.values());
}

interface PersonnelTableProps {
  data: PersonnelRecord[];
  showTotals?: boolean;
}

export function PersonnelTable({ data, showTotals = true }: PersonnelTableProps) {
  const employees = aggregateByEmployee(data);
  const totalSalary = employees.reduce((sum, e) => sum + e.totalAnnualSalary, 0);
  const totalFringe = employees.reduce((sum, e) => sum + e.totalFringeAmount, 0);

  if (employees.length === 0) {
    return <p className="text-base-content/70 mt-4">No personnel found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table walter-table">
        <colgroup>
          <col className="w-1/4" />
          <col className="w-1/6" />
          <col className="w-1/12" />
          <col className="w-1/12" />
          <col className="w-1/12" />
          <col className="w-1/12" />
          <col className="w-1/12" />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th>Job Title</th>
            <th>End Date</th>
            <th className="text-right"># Proj</th>
            <th className="text-right">Salary (year)</th>
            <th className="text-right">Fringe (year)</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <EmployeeRow employee={employee} key={employee.emplid} />
          ))}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr className="totaltr">
              <td colSpan={4}>Totals</td>
              <td className="text-right">{formatCurrency(totalSalary)}</td>
              <td className="text-right">{formatCurrency(totalFringe)}</td>
              <td className="text-right">
                {formatCurrency(totalSalary + totalFringe)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
