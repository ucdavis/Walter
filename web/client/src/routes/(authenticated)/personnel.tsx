import { createFileRoute } from '@tanstack/react-router';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)/personnel')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  const personnelQuery = usePersonnelQuery();

  if (personnelQuery.isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (personnelQuery.isError) {
    return (
      <div className="alert alert-error">
        <span>Unable to load personnel: {personnelQuery.error?.message}</span>
      </div>
    );
  }

  const data = personnelQuery.data ?? [];

  // Calculate summary stats
  const uniqueEmployees = new Set(data.map((r) => r.emplid)).size;
  const uniqueProjects = new Set(data.map((r) => r.projectId)).size;
  const totalSalary = data.reduce((sum, r) => sum + r.monthlyRt * 12, 0);
  const totalFringe = data.reduce(
    (sum, r) => sum + r.monthlyRt * 12 * r.cbr,
    0
  );

  return (
    <div className="container">
      <h1 className="h1 mt-8">{user.name}'s Personnel</h1>
      <p className="mb-4 h3">
        {uniqueEmployees} employees across {uniqueProjects} projects
      </p>

      {/* Summary Cards */}
      <div className="fancy-data">
        <dl className="grid items-stretch gap-6 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-main-border grid-cols-1 md:grid-cols-4">
          <div>
            <dt className="stat-label"># of Employees</dt>
            <dd className="stat-value">{uniqueEmployees}</dd>
          </div>
          <div>
            <dt className="stat-label"># of Projects</dt>
            <dd className="stat-value">{uniqueProjects}</dd>
          </div>
          <div>
            <dt className="stat-label">Total Salary</dt>
            <dd className="stat-value">{formatCurrency(totalSalary)}</dd>
          </div>
          <div>
            <dt className="stat-label">Total Fringe</dt>
            <dd className="stat-value text-success font-proxima-bold">
              {formatCurrency(totalFringe)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Personnel Table */}
      <PersonnelTable data={data} />
    </div>
  );
}
