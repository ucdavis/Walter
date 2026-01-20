import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { PersonnelRecord, useProjectPersonnelQuery } from '@/queries/personnel.ts';
import { useProjectsDetailQuery } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';

interface AggregatedEmployee {
  emplid: string;
  name: string;
  projectCount: number;
  positions: PersonnelRecord[];
  totalAnnualSalary: number;
  totalFringeAmount: number;
}

const formatName = (name: string) => {
  const [last, first] = name.split(',');
  return `${first?.trim() ?? ''} ${last?.trim() ?? ''}`.trim();
};

function EmployeeRow({ employee }: { employee: AggregatedEmployee }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-base-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td>
          <div className="flex items-center gap-2">
            {isExpanded
              ? <ChevronUpIcon className="w-4 h-4" />
              : <ChevronDownIcon className="w-4 h-4" />
            }
            {formatName(employee.name)}
          </div>
        </td>
        <td />
        <td />
        <td className="text-right">{employee.projectCount}</td>
        <td className="text-right">{formatCurrency(employee.totalAnnualSalary)}</td>
        <td className="text-right">{formatCurrency(employee.totalFringeAmount)}</td>
        <td className="text-right">{formatCurrency(employee.totalAnnualSalary + employee.totalFringeAmount)}</td>
      </tr>
      {isExpanded && employee.positions.map((position, idx) => {
        const annualSalary = position.monthlyRt * 12;
        const fringeAmount = annualSalary * position.cbr;
        return (
          <tr key={`${employee.emplid}-${idx}`} className="bg-base-200/50">
            <td className="pl-10 text-sm text-base-content/70">
              {position.projectName}
            </td>
            <td className="text-sm">{position.positionDescr}</td>
            <td className="text-sm">{formatDate(position.fundingEndDt)}</td>
            <td className="text-right text-sm">{position.distPct}%</td>
            <td className="text-right text-sm">{formatCurrency(annualSalary)}</td>
            <td className="text-right text-sm">{formatCurrency(fringeAmount)}</td>
            <td className="text-right text-sm">{formatCurrency(annualSalary + fringeAmount)}</td>
          </tr>
        );
      })}
    </>
  );
}

export const Route = createFileRoute('/(authenticated)/personnel')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  const projectsQuery = useProjectsDetailQuery(user.employeeId);

  const projectCodes = projectsQuery.data
    ? [...new Set(projectsQuery.data.map((p) => p.project_number))]
    : [];

  const personnelQuery = useProjectPersonnelQuery(projectCodes);

  if (projectsQuery.isPending || personnelQuery.isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (projectsQuery.isError || personnelQuery.isError) {
    return (
      <div className="alert alert-error">
        <span>Unable to load data: {projectsQuery.error?.message ?? personnelQuery.error?.message}</span>
      </div>
    );
  }

  const data = personnelQuery.data;

  // Aggregate by employee
  const employeeMap = new Map<string, AggregatedEmployee>();
  for (const record of data ?? []) {
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
        projectCount: 1,
        positions: [record],
        totalAnnualSalary: annualSalary,
        totalFringeAmount: fringeAmount,
      });
    }
  }

  const employees = Array.from(employeeMap.values());
  const totalEmployees = employees.length;
  const totalProjects = new Set((data ?? []).map((r) => r.projectId)).size;
  const totalSalary = employees.reduce((sum, e) => sum + e.totalAnnualSalary, 0);
  const totalFringe = employees.reduce((sum, e) => sum + e.totalFringeAmount, 0);

  return (
    <div className="container">
      <div className="py-10 mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <h1 className="text-2xl font-proxima-bold">{user.name}'s Personnel</h1>
        <p className="text-base-content/70">
          {totalEmployees} employees across {totalProjects} projects
        </p>
      </div>

      {/* Summary Cards */}
      <div className="mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border border-base-300 rounded-lg">
          <div>
            <div className="text-xs uppercase text-base-content/60"># of Employees</div>
            <div className="text-xl font-semibold">{totalEmployees}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-base-content/60"># of Projects</div>
            <div className="text-xl font-semibold">{totalProjects}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-base-content/60">Total Salary</div>
            <div className="text-xl font-semibold">{formatCurrency(totalSalary)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-base-content/60">Total Fringe</div>
            <div className="text-xl font-semibold text-success">{formatCurrency(totalFringe)}</div>
          </div>
        </div>
      </div>

      {/* Personnel Table */}
      <div className="mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%] mt-8">
        <table className="table walter-table">
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
              <EmployeeRow key={employee.emplid} employee={employee} />
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={4}>Totals</td>
              <td className="text-right">{formatCurrency(totalSalary)}</td>
              <td className="text-right">{formatCurrency(totalFringe)}</td>
              <td className="text-right">{formatCurrency(totalSalary + totalFringe)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
