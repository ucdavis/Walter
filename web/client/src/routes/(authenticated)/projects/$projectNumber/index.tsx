import { ProjectChart } from '@/components/project/chart.tsx';
import { ProjectDetails } from '@/components/project/details.tsx';
import { FinancialDetails } from '@/components/project/financialDetails.tsx';
import {
  summarizeProjectByNumber,
  type ProjectSummary,
} from '@/lib/projectSummary.ts';
import { allProjectsQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/projects/$projectNumber/'
)({
  component: RouteComponent,
});

const formatAsOfDate = (value: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  return `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear()}`;
};

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
    <main className="flex-1 max-w-4xl">
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="mb-4">
          <span className="inline-block bg-blue-600 text-white px-3 py-1 text-xs rounded">
            DATA AS OF {formatAsOfDate(summary.awardEndDate)}
          </span>
        </div>
        <h1 className="mb-1">{summary.projectName}</h1>
        <p className="text-gray-500 text-sm mb-6">{summary.projectNumber}</p>
        <ProjectChart />
      </section>

      <ProjectDetails summary={summary} />
      <FinancialDetails summary={summary} />
    </main>
  );
}

function RouteComponent() {
  const { projectNumber } = Route.useParams();
  const { data: projects } = useSuspenseQuery(allProjectsQueryOptions());
  const summary = summarizeProjectByNumber(projects, projectNumber);

  if (!summary) {
    return <ProjectNotFound projectNumber={projectNumber} />;
  }

  return <ProjectContent summary={summary} />;
}
