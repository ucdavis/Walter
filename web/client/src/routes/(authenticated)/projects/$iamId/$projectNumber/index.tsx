import { ProjectAlerts } from '@/components/alerts/ProjectAlerts.tsx';
import { TaskBreakdown } from '@/components/project/TaskBreakdown.tsx';
import { ProjectDetails } from '@/components/project/ProjectDetails.tsx';
import { FinancialDetails } from '@/components/project/FinancialDetails.tsx';
import { ProjectBurndownSection } from '@/components/project/ProjectBurndownChart.tsx';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';
import {
  summarizeProjectByNumber,
  type ProjectSummary,
} from '@/lib/projectSummary.ts';
import {
  type ProjectRecord,
  projectsDetailQueryOptions,
  useProjectDiscrepancyState,
} from '@/queries/project.ts';

import { canViewProjectDiscrepancy } from '@/shared/auth/roleAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import ProjectAdditionalInfo from '@/components/project/ProjectAdditionalInfo.tsx';

export const Route = createFileRoute(
  '/(authenticated)/projects/$iamId/$projectNumber/'
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
  iamId,
  projectRecords,
  summary,
}: {
  iamId: string;
  projectRecords: ProjectRecord[];
  summary: ProjectSummary;
}) {
  const personnelQuery = usePersonnelQuery(iamId, [summary.projectNumber]);
  const { data: featureFlags } = useFeatureFlagsQuery();
  const user = useUser();
  const canSeeDiscrepancy = canViewProjectDiscrepancy(
    user.roles,
    summary.pmEmployeeId,
    user.employeeId
  );
  const reconciliationState = useProjectDiscrepancyState(
    canSeeDiscrepancy ? [summary.projectNumber] : []
  );
  const reconciliationStatus = reconciliationState.hasData
    ? reconciliationState.discrepancies.has(summary.projectNumber)
      ? 'discrepancy'
      : 'balanced'
    : undefined;

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-2">
        <div className="mb-1">
          <span
            className={`badge font-proxima-bold badge-sm ${summary.isInternal ? 'badge-accent' : 'badge-info'}`}
          >
            {summary.isInternal ? 'Internal' : 'Sponsored'}
          </span>
        </div>
        <h1 className="h1">{summary.displayName}</h1>
        <h3 className="subtitle">
          Data source: Faculty Department Portfolio Report (PPM)
        </h3>
        {summary.isInternal && (
          <p className="max-w-prose mb-4 text-sm text-base-content/70">
            Totals for internal projects do not reflect transactions that have
            occurred since the latest data refresh or manual updates that are
            needed. Contact your fiscal officer with any questions.
          </p>
        )}
        <div className="mt-6">
          <ProjectAlerts
            iamId={iamId}
            reconciliationStatus={reconciliationStatus}
            summary={summary}
          />
        </div>
      </section>

      <ProjectDetails summary={summary} />
      <FinancialDetails summary={summary} />
      {!summary.isInternal && featureFlags?.projectionsEnabled && (
        <ProjectBurndownSection projectNumber={summary.projectNumber} />
      )}
      <ProjectAdditionalInfo summary={summary} />

      <section className="section-margin">
        <h2 className="h2">
          <TooltipLabel
            label="Task Breakdown"
            tooltip={tooltipDefinitions.taskBreakdown}
          />
        </h2>
        <div className="mt-4">
          <TaskBreakdown
            iamId={iamId}
            projectNumber={summary.projectNumber}
            records={projectRecords}
          />
        </div>
      </section>

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
  const { iamId, projectNumber } = Route.useParams();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );
  const summary = summarizeProjectByNumber(projects, projectNumber);

  if (!summary) {
    return <ProjectNotFound projectNumber={projectNumber} />;
  }

  const projectRecords = projects.filter(
    (p) => p.projectNumber === projectNumber
  );

  return (
    <ProjectContent
      iamId={iamId}
      projectRecords={projectRecords}
      summary={summary}
    />
  );
}
