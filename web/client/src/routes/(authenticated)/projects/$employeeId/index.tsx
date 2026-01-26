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

// TODO: Remove this fallback when using real data
const FAKE_PROJECT_ID = 'GLAANS4995'; // Climate Adaptation Field Studies

function PersonnelSection({ projectNumbers }: { projectNumbers: string[] }) {
  const personnelQuery = usePersonnelQuery();

  // Filter personnel by project IDs
  // TODO: Remove fake data fallback when backend returns real data
  const filteredPersonnel = personnelQuery.data?.filter((p) =>
    projectNumbers.includes(p.projectId)
  );
  const personnelData =
    filteredPersonnel && filteredPersonnel.length > 0
      ? filteredPersonnel
      : personnelQuery.data?.filter((p) => p.projectId === FAKE_PROJECT_ID) ??
        [];

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
        <PersonnelTable data={personnelData} />
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
    ...new Set(projects.map((project) => project.project_number)),
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
