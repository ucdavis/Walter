import { useMemo } from 'react';
import { PersonnelSection } from '@/components/project/PersonnelSection.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import {
  projectsDetailQueryOptions,
  useProjectDiscrepancies,
} from '@/queries/project.ts';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import { summarizeAllProjects } from '@/lib/projectSummary.ts';
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

  const discrepancies = useProjectDiscrepancies(internalProjectNumbers);

  const summary = useMemo(
    () => (projects?.length ? summarizeAllProjects(projects) : null),
    [projects]
  );

  const personnelQuery = usePersonnelQuery(projectNumbers);
  const personnelCount = useMemo(() => {
    if (!personnelQuery.data) {
      return null;
    }
    return new Set(personnelQuery.data.map((p) => p.employeeId)).size;
  }, [personnelQuery.data]);

  if (!projects?.length) {
    return (
      <div className="mx-auto">
        <PageEmpty message="Looks like you don't have any projects for Walter to fetch..." />
      </div>
    );
  }

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-2">
        <h1 className="h1">
          {projects[0].pi ? `${projects[0].pi}'s Dashboard` : 'Dashboard'}
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
              <dt className="stat-label-lg">Total Budget</dt>
              <dd className="stat-value-lg">
                {summary ? <Currency value={summary.totals.budget} /> : '...'}
              </dd>
            </div>
            <div className="flex flex-col">
              <BanknotesIcon className="w-4 h-4" />
              <dt className="stat-label-lg">Balance</dt>
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

      <section className="section-margin">
        <h2 className="h2">Projects</h2>
        <ProjectsTable
          discrepancies={discrepancies}
          employeeId={employeeId}
          records={projects}
        />
      </section>

      <PersonnelSection projectNumbers={projectNumbers} />
    </main>
  );
}
