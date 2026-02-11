import { useMemo } from 'react';
import { PersonnelSection } from './PersonnelSection.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { employeeId } = Route.useParams();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );

  const projectNumbers = useMemo(
    () => [...new Set(projects?.map((p) => p.projectNumber) ?? [])],
    [projects]
  );

  if (!projects?.length) {
    return (
      <div>
        <section className="mt-8 mb-10">
          <h1 className="h1">Projects</h1>
        </section>

        <PageEmpty message="Looks like you don't have any projects for Walter to fetch..." />
      </div>
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
