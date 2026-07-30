import { ProjectAlerts } from "@/components/alerts/ProjectAlerts.tsx";
import { ExpenditureCategoryBreakdown } from "@/components/project/ExpenditureCategoryBreakdown.tsx";
import { FinjectorLink } from "@/components/project/FinjectorLink.tsx";
import { TaskBreakdown } from "@/components/project/TaskBreakdown.tsx";
import { ProjectDetails } from "@/components/project/ProjectDetails.tsx";
import { PersonnelTable } from "@/components/project/PersonnelTable.tsx";
import { usePersonnelQuery } from "@/queries/personnel.ts";
import { useFeatureFlagsQuery } from "@/queries/featureFlags.ts";
import {
  summarizeProjectByNumber,
  type ProjectSummary,
} from "@/lib/projectSummary.ts";
import {
  type ProjectRecord,
  projectsDetailQueryOptions,
  useProjectDiscrepancyState,
} from "@/queries/project.ts";

import { canViewProjectDiscrepancy } from "@/shared/auth/roleAccess.ts";
import { useUser } from "@/shared/auth/UserContext.tsx";
import { TooltipLabel } from "@/shared/TooltipLabel.tsx";
import { tooltipDefinitions } from "@/shared/tooltips.ts";
import { buildFinjectorUrl } from "@/lib/finjector.ts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChartBarIcon,
  PresentationChartLineIcon,
} from "@heroicons/react/24/outline";
import ProjectAdditionalInfo from "@/components/project/ProjectAdditionalInfo.tsx";

export const Route = createFileRoute(
  "/(authenticated)/projects/$iamId/$projectNumber/",
)({
  component: RouteComponent,
});

const ProjectNotFound = ({ projectNumber }: { projectNumber: string }) => (
  <main className="flex-1">
    <section className="card p-4 mt-8 max-w-prose">
      <h1 className="text-2xl font-semibold mb-3">Project not found</h1>
      <p className=" mb-6">
        We couldn&apos;t find any data for project{" "}
        <span className="font-mono">{projectNumber}</span>.<br /> It may have
        been archived or you might not have access.
      </p>
    </section>
  </main>
);

const formatStatusLabel = (status: string | null) =>
  status
    ? status
        .replaceAll(/[_-]+/g, " ")
        .toLowerCase()
        .replaceAll(/\b\w/g, (letter) => letter.toUpperCase())
    : "Not provided";

const normalizeStatusCode = (status: string | null) =>
  status?.trim().toUpperCase() ?? "";

const projectStatusDotClassByCode: Record<string, string> = {
  ACTIVE: "bg-success",
  CLOSED: "bg-base-content/30",
  EXPIRED: "bg-warning",
  INACTIVE: "bg-base-content/30",
};

const getProjectStatusDotClassName = (status: string | null) =>
  projectStatusDotClassByCode[normalizeStatusCode(status)] ??
  "bg-base-content/30";

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
    user.employeeId,
  );
  const reconciliationState = useProjectDiscrepancyState(
    summary.isInternal && canSeeDiscrepancy ? [summary.projectNumber] : [],
  );
  const reconciliationStatus = reconciliationState.hasData
    ? reconciliationState.discrepancies.has(summary.projectNumber)
      ? "discrepancy"
      : "balanced"
    : undefined;
  const finjectorUrl = buildFinjectorUrl(
    summary.projectNumber,
    summary.taskNum,
    summary.projectOwningOrgCode,
  );

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-2">
        <h1 className="h1 max-w-4xl">{summary.displayName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-base-content/80">
          <span className="font-proxima-bold text-base-content">
            {summary.projectNumber}
          </span>
          {!summary.isInternal && finjectorUrl && (
            <FinjectorLink
              org={summary.projectOwningOrgCode}
              project={summary.projectNumber}
              task={summary.taskNum}
            >
              Open in Finjector
            </FinjectorLink>
          )}
          <span aria-hidden="true" className="text-base-content/40">
            |
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${getProjectStatusDotClassName(summary.projectStatusCode)}`}
            />
            {formatStatusLabel(summary.projectStatusCode)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`badge font-proxima-bold badge-sm ${summary.isInternal ? "badge-accent" : "badge-info"}`}
          >
            {summary.isInternal ? "Internal Project" : "Sponsored Project"}
          </span>
          <span className="text-sm text-base-content/70">
            - Source: Faculty Department Portfolio Report (PPM)
          </span>
        </div>
        {summary.isInternal && (
          <div
            className="alert alert-soft alert-accent mt-4 max-w-3xl"
            role="alert"
          >
            Totals for internal projects do not reflect transactions that have
            occurred since the latest data refresh or manual updates that are
            needed. Contact your fiscal officer with any questions.
          </div>
        )}
        <div className="mt-6">
          <ProjectAlerts
            iamId={iamId}
            reconciliationStatus={reconciliationStatus}
            summary={summary}
          />
        </div>
      </section>

      <ProjectDetails
        actions={
          !summary.isInternal &&
          (featureFlags?.expenditureProgressEnabled ||
            featureFlags?.burndownEnabled) ? (
            <>
              {featureFlags?.expenditureProgressEnabled && (
                <Link
                  className="btn btn-lg"
                  params={{ iamId, projectNumber: summary.projectNumber }}
                  to="/expenditureprogress/$iamId/$projectNumber"
                >
                  <ChartBarIcon className="h-4 w-4" />
                  Expenditure Progress
                </Link>
              )}
              {featureFlags?.burndownEnabled && (
                <Link
                  className="btn btn-lg"
                  params={{ iamId, projectNumber: summary.projectNumber }}
                  to="/projectburndown/$iamId/$projectNumber"
                >
                  <PresentationChartLineIcon className="h-4 w-4" />
                  Project Burndown
                </Link>
              )}
            </>
          ) : null
        }
        summary={summary}
      />
      <FinancialDetails summary={summary} />

      <section className="section-margin">
        {summary.isInternal ? (
          <>
            <h2 className="h2">
              <TooltipLabel
                label="Task Breakdown"
                tooltip={tooltipDefinitions.taskBreakdown}
              />
            </h2>
            <div className="mt-4">
              <TaskBreakdown
                isInternal={summary.isInternal}
                projectNumber={summary.projectNumber}
                records={projectRecords}
              />
            </div>
          </>
        ) : (
          <>
            <h2 className="h2">Expenditure Category Breakdown</h2>
            <div className="mt-4">
              <ExpenditureCategoryBreakdown
                projectNumber={summary.projectNumber}
                records={projectRecords}
              />
            </div>
          </>
        )}
      </section>

      <ProjectAdditionalInfo summary={summary} />

      <section className="section-margin">
        <h2 className="h2 mb-2">Personnel</h2>
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
    projectsDetailQueryOptions(iamId),
  );
  const summary = summarizeProjectByNumber(projects, projectNumber);

  if (!summary) {
    return <ProjectNotFound projectNumber={projectNumber} />;
  }

  const projectRecords = projects.filter(
    (p) => p.projectNumber === projectNumber,
  );

  return (
    <ProjectContent
      iamId={iamId}
      projectRecords={projectRecords}
      summary={summary}
    />
  );
}
