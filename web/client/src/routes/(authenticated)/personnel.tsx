import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  aggregateByPosition,
  PersonnelTable,
} from '@/components/project/PersonnelTable.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { useProjectsDetailQuery } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageError } from '@/components/states/PageError.tsx';

export const Route = createFileRoute('/(authenticated)/personnel')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  const userProjectsQuery = useProjectsDetailQuery(user.employeeId);
  const projectCodes = useMemo(() => {
    const projects = userProjectsQuery.data ?? [];
    return [...new Set(projects.map((p) => p.projectNumber))];
  }, [userProjectsQuery.data]);
  const personnelQuery = usePersonnelQuery(projectCodes);

  const isLoading =
    userProjectsQuery.isPending ||
    (projectCodes.length > 0 && personnelQuery.isPending);

  if (isLoading) {
    return <PageLoading message="Fetching personnel information..." />;
  }

  if (userProjectsQuery.isError) {
    return (
      <PageError>
        <div className="alert alert-error">
          <span>
            Unable to load projects: {userProjectsQuery.error?.message}
          </span>
        </div>
      </PageError>
    );
  }

  if (personnelQuery.isError) {
    return (
      <PageError>
        <div className="alert alert-error">
          <span>Unable to load personnel: {personnelQuery.error?.message}</span>
        </div>
      </PageError>
    );
  }

  // Show empty state when user has no projects
  if (projectCodes.length === 0) {
    return (
      <PageEmpty message="Walter could not fetch any personnel for you..." />
    );
  }

  const data = personnelQuery.data ?? [];

  // Calculate summary stats
  const uniqueEmployees = new Set(data.map((r) => r.employeeId)).size;
  const uniqueProjects = new Set(data.map((r) => r.projectId)).size;
  const positions = aggregateByPosition(data);
  const totalMonthlyRate = positions.reduce((sum, p) => sum + p.monthlyRate, 0);
  const totalMonthlyFringe = positions.reduce(
    (sum, p) => sum + p.monthlyFringe,
    0
  );
  const totalMonthlyTotal = totalMonthlyRate + totalMonthlyFringe;

  return (
    <div className="container">
      <h1 className="h1 mt-8">{user.name}'s Personnel</h1>
      <p className="mb-4 h3">
        {uniqueEmployees} employees across {uniqueProjects} projects
      </p>

      {/* Summary Cards */}
      <div className="fancy-data">
        <dl className="grid items-stretch gap-6 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-main-border grid-cols-1 md:grid-cols-5">
          <div>
            <dt className="stat-label"># of Employees</dt>
            <dd className="stat-value">{uniqueEmployees}</dd>
          </div>
          <div>
            <dt className="stat-label"># of Projects</dt>
            <dd className="stat-value">{uniqueProjects}</dd>
          </div>
          <div>
            <dt className="stat-label">Monthly Rate</dt>
            <dd className="stat-value">{formatCurrency(totalMonthlyRate)}</dd>
          </div>
          <div>
            <dt className="stat-label">Monthly Fringe</dt>
            <dd className="stat-value">{formatCurrency(totalMonthlyFringe)}</dd>
          </div>
          <div>
            <dt className="stat-label">Monthly Total</dt>
            <dd className="stat-value text-success font-proxima-bold">
              {formatCurrency(totalMonthlyTotal)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Personnel Table */}
      <PersonnelTable data={data} />
    </div>
  );
}
