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
  const totalFringe = data.reduce((sum, r) => sum + r.monthlyRt * 12 * r.cbr, 0);

  return (
    <div className="container">
      <h1 className="h1 mt-8">{user.name}'s Personnel</h1>
      <p className="mb-4 h3">
        {uniqueEmployees} employees across {uniqueProjects} projects
      </p>

      {/* Summary Cards */}
      <div className="my-8 flex justify-between px-6 mt-4 mb-8 border rounded-md bg-light-bg-200 border-main-border py-4">
        <div>
          <p className="h5"># of Employees</p>
          <p className="h4">{uniqueEmployees}</p>
        </div>
        <div>
          <p className="h5"># of Projects</p>
          <p className="h4">{uniqueProjects}</p>
        </div>
        <div>
          <p className="h5">Total Salary</p>
          <p className="h4">{formatCurrency(totalSalary)}</p>
        </div>
        <div className="text-right">
          <p className="h5">Total Fringe</p>
          <p className="h4 text-success font-proxima-bold">
            {formatCurrency(totalFringe)}
          </p>
        </div>
      </div>

      {/* Personnel Table */}
      <PersonnelTable data={data} />
    </div>
  );
}
