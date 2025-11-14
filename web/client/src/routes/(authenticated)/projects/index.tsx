import { ProjectChart } from '@/components/project/chart.tsx';
import { FinancialDetails } from '@/components/project/financialDetails.tsx';
import { summarizeAllProjects } from '@/lib/projectSummary.ts';
import { allProjectsQueryOptions } from '@/queries/project.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects/')({
  component: RouteComponent,
});

const formatAsOfDate = (value: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  return `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear()}`;
};

function RouteComponent() {
  const { data: projects } = useSuspenseQuery(allProjectsQueryOptions());
  const summary = summarizeAllProjects(projects);

  return (
    <main className="flex-1 max-w-4xl">
      {/* Alerts */}
      {/* <AlertSection /> */}

      {/* Chart Section */}
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

      {/* Financial Details */}
      <FinancialDetails summary={summary} />

      {/* Personnel */}
      {/* <PersonnelSection /> */}
    </main>
  );
}
