import { ProjectAlerts } from '@/components/alerts/ProjectAlerts.tsx';
import { ProjectDetails } from '@/components/project/ProjectDetails.tsx';
import { FinancialDetails } from '@/components/project/FinancialDetails.tsx';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import {
  summarizeProjectByNumber,
  type ProjectSummary,
} from '@/lib/projectSummary.ts';
import {
  projectsDetailQueryOptions,
  useProjectDiscrepancies,
} from '@/queries/project.ts';

import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/'
)({
  component: RouteComponent,
});

const ProjectNotFound = ({ projectNumber }: { projectNumber: string }) => (
  <main className="flex-1">
    <section className="card p-4 mt-8 max-w-prose">
      <h1 className="text-2xl font-semibold mb-3">Project not found</h1>
      <p className=" mb-6">
        We couldn&apos;t find any data for project{' '}
        <span className="font-mono">{projectNumber}</span>.<br /> It may have
        been archived or you might not have access.
      </p>
    </section>
  </main>
);

function ProjectContent({
  employeeId,
  summary,
}: {
  employeeId: string;
  summary: ProjectSummary;
}) {
  const personnelQuery = usePersonnelQuery([summary.projectNumber]);
  const discrepancies = useProjectDiscrepancies(
    summary.isInternal ? [summary.projectNumber] : []
  );

  return (
    <main className="flex-1">
      <section className="mt-8 mb-2">
        <h1 className="h1">{summary.displayName}</h1>
        <h3 className="subtitle">Faculty Department Portfolio Report</h3>
        <div className="mt-6">
          <ProjectAlerts
            employeeId={employeeId}
            hasReconciliationDiscrepancy={discrepancies.has(
              summary.projectNumber
            )}
            summary={summary}
          />
        </div>
      </section>

      <ProjectDetails summary={summary} />
      <FinancialDetails summary={summary} />

      <section className="section-margin">
        <h2 className="h2">Personnel</h2>
        {personnelQuery.isPending && (
          <p className="text-base-content/70 mt-4">Loading personnel...</p>
        )}
        {personnelQuery.isError && (
          <p className="text-error mt-4">Error loading personnel.</p>
        )}
        {personnelQuery.isSuccess && (
          <PersonnelTable data={personnelQuery.data ?? []} showTotals={false} />
        )}
      </section>
    </main>
  );
}

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );
  const summary = summarizeProjectByNumber(projects, projectNumber);

  if (!summary) {
    return <ProjectNotFound projectNumber={projectNumber} />;
  }

  return <ProjectContent employeeId={employeeId} summary={summary} />;
}
