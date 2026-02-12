import { useMemo } from 'react';
import { PersonnelSection } from '@/components/project/PersonnelSection.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import {
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

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
      <div className="mx-auto">
        <PageEmpty message="Looks like you don't have any projects for Walter to fetch..." />
      </div>
    );
  }

  return (
    <main className="flex-1">
      <section className="mt-8 mb-5">
        <h1 className="h1">
          {projects[0].pi ? `${projects[0].pi}'s Dashboard` : 'Dashboard'}
        </h1>
      </section>
      <section className="section-margin">
        <div className="fancy-data">
          <dl className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <ClipboardDocumentListIcon className="w-4 h-4" />
              <dt className="font-proxima-bold text-lg">Projects</dt>
              <dd className="text-xl">2</dd>
            </div>
            <div className="flex flex-col">
              <UsersIcon className="w-4 h-4" />
              <dt className="font-proxima-bold text-lg">Personnel</dt>
              <dd className="text-xl">8</dd>
            </div>
            <div className="flex flex-col">
              <ClipboardDocumentCheckIcon className="w-4 h-4" />
              <dt className="font-proxima-bold text-lg">Total Budget</dt>
              <dd className="text-xl">$</dd>
            </div>
            <div className="flex flex-col">
              <BanknotesIcon className="w-4 h-4" />
              <dt className="font-proxima-bold text-lg">Balance</dt>
              <dd className="text-xl text-success font-proxima-bold">$</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section-margin">
        <ProjectsTable employeeId={employeeId} records={projects} />
      </section>

      <PersonnelSection projectNumbers={projectNumbers} />
    </main>
  );
}
