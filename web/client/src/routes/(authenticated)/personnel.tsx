import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { useProjectsDetailQuery } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';

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
  const personnelQuery = usePersonnelQuery(user.employeeId, projectCodes);

  const isLoading =
    userProjectsQuery.isPending ||
    (projectCodes.length > 0 && personnelQuery.isPending);

  if (isLoading) {
    return <PageLoading message="Fetching personnel information..." />;
  }

  if (userProjectsQuery.isError) {
    const presentation = getErrorPresentation(userProjectsQuery.error);
    return (
      <PageError
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title="Unable to load projects"
      />
    );
  }

  if (personnelQuery.isError) {
    const presentation = getErrorPresentation(personnelQuery.error);
    return (
      <PageError
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title="Unable to load personnel"
      />
    );
  }

  // Show empty state when user has no projects
  if (projectCodes.length === 0) {
    return (
      <PageEmpty message="Looks like you don't have any personnel for Walter to fetch..." />
    );
  }

  const data = personnelQuery.data ?? [];
  const filledData = data.filter((r) => r.name);

  // Calculate summary stats (exclude unfilled positions)
  const uniqueEmployees = new Set(filledData.map((r) => r.employeeId)).size;
  const uniqueProjects = new Set(filledData.map((r) => r.projectId)).size;

  return (
    <div className="container">
      <h1 className="h1 mt-8">{user.name}&apos;s Personnel</h1>
      <h3 className="subtitle">
        {uniqueEmployees} employees across {uniqueProjects} projects
      </h3>

      {/* Personnel Table */}
      <PersonnelTable data={data} />
    </div>
  );
}
