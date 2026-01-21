import { ProjectChart } from '@/components/project/chart.tsx';
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

function PersonnelSection() {
  const personnelQuery = usePersonnelQuery();

  // TODO: Filter by user's projects when using real data
  const personnelData = personnelQuery.data ?? [];

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

  const earliestStartDate = summary.awardStartDate;
  const startingBalanceAllProjects = summary.totals.balance;

  return (
    <main className="flex-1">
      {/* Alerts */}
      {/* <AlertSection /> */}

      {/* Chart Section */}
      <section className="mt-8 section-margin">
        <h1 className="h1">{summary.projectName}</h1>
        <p className="h4 mb-4">{summary.projectNumber}</p>
        <ProjectChart
          projects={projectNumbers}
          startingBalance={startingBalanceAllProjects}
          startingDate={
            earliestStartDate ||
            new Date(
              new Date().setFullYear(new Date().getFullYear() - 1)
            ).toISOString()
          }
        />
      </section>

      {/* Financial Details */}
      <FinancialDetails summary={summary} />

      {/* Personnel */}
      <PersonnelSection projectNumbers={projectNumbers} />
    </main>
  );
}
