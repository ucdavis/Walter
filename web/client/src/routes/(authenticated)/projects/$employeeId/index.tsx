import { FinancialDetails } from '@/components/project/financialDetails.tsx';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { summarizeAllProjects } from '@/lib/projectSummary.ts';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId/')({
  component: RouteComponent,
});

function PersonnelSection({ projectNumbers }: { projectNumbers: string[] }) {
  const personnelQuery = usePersonnelQuery(projectNumbers);

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
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );

  if (!projects?.length) {
    return (
      <main className="flex-1">
        <section className="mt-8 section-margin">
          <div className="alert">
            <span>We didn&apos;t find any projects for you.</span>
          </div>
        </section>
      </main>
    );
  }

  const summary = summarizeAllProjects(projects);

  const projectNumbers = [
    ...new Set(projects.map((project) => project.projectNumber)),
  ];

  return (
    <main className="flex-1">
      <section className="mt-8 section-margin">
        <h1 className="h1">{summary.projectName}</h1>
        <p className="h4">{summary.projectNumber}</p>
      </section>

      <FinancialDetails summary={summary} />

      <PersonnelSection projectNumbers={projectNumbers} />
    </main>
  );
}
