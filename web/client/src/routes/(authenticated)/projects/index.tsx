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
    <main className="flex-1">
      {/* Alerts */}
      {/* <AlertSection /> */}

      {/* Chart Section */}
      <section className="mt-8 section-margin">
        <div className="mb-2">
          <span className="inline-block bg-primary-color text-white px-3 py-1 text-xs rounded font-proxima-bold">
            DATA AS OF {formatAsOfDate(new Date().toDateString())}
          </span>
        </div>
        <h1 className="h1">{summary.projectName}</h1>
        <p className="h4 mb-4">{summary.projectNumber}</p>
        <ProjectChart />
      </section>

      {/* Financial Details */}
      <FinancialDetails summary={summary} />

      {/* Personnel */}
      {/* <PersonnelSection /> */}
    </main>
  );
}
