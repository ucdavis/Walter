import { ProjectChart } from '@/components/project/chart.tsx';
import { ProjectDetails } from '@/components/project/details.tsx';
import { FinancialDetails } from '@/components/project/financialDetails.tsx';
import {
  summarizeProjectByNumber,
  type ProjectSummary,
} from '@/lib/projectSummary.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/'
)({
  component: RouteComponent,
});

const ProjectNotFound = ({ projectNumber }: { projectNumber: string }) => (
  <main className="flex-1 max-w-4xl">
    <section className="bg-white rounded-lg border border-gray-200 p-8">
      <h1 className="text-2xl font-semibold mb-3">Project not found</h1>
      <p className="text-gray-600 mb-6">
        We couldn&apos;t find any data for project{' '}
        <span className="font-mono">{projectNumber}</span>. It may have been
        archived or you might not have access.
      </p>
      <Link className="btn btn-primary" to="/projects">
        Back to Projects
      </Link>
    </section>
  </main>
);

function ProjectContent({ summary }: { summary: ProjectSummary }) {
  return (
    <main className="flex-1">
      <section className="mt-8 section-margin">
        <h1 className="h1">{summary.projectName}</h1>
        <p className="mb-4 h4">{summary.projectNumber}</p>
        <ProjectChart
          projects={[summary.projectNumber]}
          startingBalance={summary.totals.balance}
          startingDate={summary.awardStartDate}
        />
      </section>

      <ProjectDetails summary={summary} />
      <FinancialDetails summary={summary} />
    </main>
  );
}

function RouteComponent() {
  const { projectNumber } = Route.useParams();
  const { data: projects } = useSuspenseQuery(projectsDetailQueryOptions());
  const summary = summarizeProjectByNumber(projects, projectNumber);

  if (!summary) {
    return <ProjectNotFound projectNumber={projectNumber} />;
  }

  return <ProjectContent summary={summary} />;
}
