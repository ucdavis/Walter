import { ProjectChart } from '@/components/project/chart.tsx';
import { FinancialDetails } from '@/components/project/financialDetails.tsx';
import { ProjectPersonnel } from '@/components/project/projectPersonnel.tsx';
import { summarizeAllProjects } from '@/lib/projectSummary.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { employeeId } = Route.useParams();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );
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
      <ProjectPersonnel projects={projectNumbers} />
    </main>
  );
}
