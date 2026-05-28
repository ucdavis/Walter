import { useMemo } from 'react';
import { InternalProjectsTable } from '@/components/project/InternalProjectsTable.tsx';
import { PersonnelSection } from '@/components/project/PersonnelSection.tsx';
import { SponsoredProjectsTable } from '@/components/project/SponsoredProjectsTable.tsx';
import {
  projectsDetailQueryOptions,
  useProjectDiscrepancies,
} from '@/queries/project.ts';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { summarizeAllProjects } from '@/lib/projectSummary.ts';
import { canViewProjectDiscrepancy } from '@/shared/auth/roleAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import {
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { ProjectFundingChart } from '@/components/project/ProjectFundingChart.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { employeeId } = Route.useParams();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );

  const projectNumbers = useMemo(
    () => [...new Set(projects?.map((p) => p.projectNumber) ?? [])],
    [projects]
  );

  const internalProjectNumbers = useMemo(
    () => [
      ...new Set(
        (projects ?? [])
          .filter((p) => p.projectType === 'Internal')
          .map((p) => p.projectNumber)
      ),
    ],
    [projects]
  );

  const internalProjects = useMemo(
    () => (projects ?? []).filter((p) => p.projectType === 'Internal'),
    [projects]
  );

  const sponsoredProjects = useMemo(
    () => (projects ?? []).filter((p) => p.projectType !== 'Internal'),
    [projects]
  );

  const user = useUser();
  const discrepancies = useProjectDiscrepancies(internalProjectNumbers);
  const visibleDiscrepancies = useMemo(() => {
    const visible = new Set<string>();
    for (const p of internalProjects) {
      if (
        discrepancies.has(p.projectNumber) &&
        canViewProjectDiscrepancy(user.roles, p.pmEmployeeId, user.employeeId)
      ) {
        visible.add(p.projectNumber);
      }
    }
    return visible;
  }, [discrepancies, internalProjects, user.employeeId, user.roles]);

  const summary = useMemo(
    () => (projects?.length ? summarizeAllProjects(projects) : null),
    [projects]
  );

  const personnelQuery = usePersonnelQuery(employeeId, projectNumbers);
  const personnelCount = useMemo(() => {
    if (!personnelQuery.data) {
      return null;
    }
    return new Set(
      personnelQuery.data.filter((p) => p.name).map((p) => p.employeeId)
    ).size;
  }, [personnelQuery.data]);

  if (!projects?.length) {
    return (
      <div className="mx-auto">
        <PageEmpty message="Looks like you don't have any projects for Walter to fetch..." />
      </div>
    );
  }

  // PPM gives the owner name as "Last, First"; show it as "First Last".
  const ownerName = projects[0].ownerName;
  const ownerDisplayName = ownerName?.includes(',')
    ? `${ownerName.slice(ownerName.indexOf(',') + 1).trim()} ${ownerName
        .slice(0, ownerName.indexOf(','))
        .trim()}`
    : ownerName;

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-2">
        <h1 className="h1">
          {ownerDisplayName ? `${ownerDisplayName}'s Dashboard` : 'Dashboard'}
        </h1>
      </section>
      <section className="section-margin">
        <div className="fancy-data">
          <dl className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <ClipboardDocumentListIcon className="w-4 h-4" />
              <dt className="stat-label-lg">Projects</dt>
              <dd className="stat-value-lg">{projectNumbers.length}</dd>
            </div>
            <div className="flex flex-col">
              <UsersIcon className="w-4 h-4" />
              <dt className="stat-label-lg">Personnel</dt>
              <dd className="stat-value-lg">{personnelCount ?? '...'}</dd>
            </div>
            <div className="flex flex-col">
              <ClipboardDocumentCheckIcon className="w-4 h-4" />
              <dt className="stat-label-lg">
                <TooltipLabel
                  label="Total Budget"
                  tooltip={tooltipDefinitions.totalBudget}
                />
              </dt>
              <dd className="stat-value-lg">
                {summary ? <Currency value={summary.totals.budget} /> : '...'}
              </dd>
            </div>
            <div className="flex flex-col">
              <BanknotesIcon className="w-4 h-4" />
              <dt className="stat-label-lg">
                <TooltipLabel
                  label="Balance"
                  tooltip={tooltipDefinitions.totalBalance}
                />
              </dt>
              <dd className="stat-value-lg">
                {summary ? <Currency value={summary.totals.balance} /> : '...'}
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="section-margin">
        <h2 className="h2">Funding Breakdown</h2>
        <ProjectFundingChart projects={projects} />
      </section>

      {sponsoredProjects.length > 0 && (
        <section className="section-margin">
          <h2 className="h2">Sponsored Projects</h2>
          <SponsoredProjectsTable
            employeeId={employeeId}
            records={sponsoredProjects}
          />
        </section>
      )}

      {internalProjects.length > 0 && (
        <section className="section-margin">
          <h2 className="h2">Internal Projects</h2>
          <p className="max-w-prose mb-4 text-sm text-base-content/70">
            Totals for internal projects do not reflect transactions that have
            occurred since the latest data refresh or manual updates that are
            needed. Contact your fiscal officer with any questions.
          </p>
          <InternalProjectsTable
            discrepancies={visibleDiscrepancies}
            employeeId={employeeId}
            records={internalProjects}
          />
        </section>
      )}

      <PersonnelSection
        employeeId={employeeId}
        projectNumbers={projectNumbers}
      />
    </main>
  );
}
