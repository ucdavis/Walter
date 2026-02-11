import { useMemo } from 'react';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/pageEmpty.tsx';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId/')({
  component: RouteComponent,
});

function PersonnelSection({ projectNumbers }: { projectNumbers: string[] }) {
  const personnelQuery = usePersonnelQuery(projectNumbers);

  if (projectNumbers.length === 0) {
    return null;
  }

  return (
    <section className="section-margin">
      <h2 className="h2">Personnel</h2>
      {personnelQuery.isPending && (
        <p className="text-base-content/70 mt-4">Loading personnel...</p>
      )}
      {personnelQuery.isError && (
        <p className="text-error mt-4">Error loading personnel.</p>
      )}
      {personnelQuery.isSuccess && (
        <PersonnelTable data={personnelQuery.data ?? []} />
      )}
    </section>
  );
}

function RouteComponent() {
  const { employeeId } = Route.useParams();
  const user = useUser();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId, user.employeeId)
  );

  const projectNumbers = useMemo(
    () => [...new Set(projects?.map((p) => p.projectNumber) ?? [])],
    [projects]
  );

  if (!projects?.length) {
    return (
      <PageEmpty message="Walter could not fetch any projects for you..." />
    );
  }

  return (
    <main className="flex-1">
      <section className="mt-8">
        <h1 className="h1">
          {projects[0].pi
            ? `All Projects for ${projects[0].pi}`
            : 'All Projects'}
        </h1>
      </section>

      <section className="section-margin">
        <ProjectsTable employeeId={employeeId} records={projects} />
      </section>

      <PersonnelSection projectNumbers={projectNumbers} />
    </main>
  );
}
