import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { formatCurrency } from '@/lib/currency.ts';
import {
  getProjectOutlook,
  readProjectionLocation,
  readProjectionWorkspace,
  type ProjectionNavigation,
  type ProjectionWorkspaceSnapshot,
} from '@/lib/projectionWorkspace.ts';
import { useProjectionSession } from '@/components/projections/ProjectionSession.tsx';
import { ProjectionNavigationGuard } from '@/components/projections/ProjectionNavigationGuard.tsx';
import {
  ProjectionSaveControls,
  ProjectionSaveFeedback,
} from '@/components/projections/ProjectionSaveControls.tsx';
import {
  SalaryEditor,
  type SalaryEditorHandle,
} from '@/components/projections/SalaryEditor.tsx';

export interface ProjectionWorkspaceHandle {
  read: () => ProjectionWorkspaceSnapshot;
}

export function ProjectionWorkspace({
  onNavigate,
  planPath,
  ref,
  search,
}: {
  onNavigate: (location: ProjectionNavigation, replace?: boolean) => void;
  planPath?: string;
  ref?: Ref<ProjectionWorkspaceHandle>;
  search: Record<string, unknown>;
}) {
  const { applySalary, persistenceStatus, reloadVersion, results, session } =
    useProjectionSession();
  const { draft } = session;
  const location = readProjectionLocation(search, draft);
  const editorRef = useRef<SalaryEditorHandle>(null);
  const projectHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedProject = draft.projects.find(
    (project) => project.id === location.projectId
  );
  const selectedJob =
    location.issues.length === 0 && location.section === 'staffing'
      ? draft.jobs.find((job) => job.id === location.jobId)
      : undefined;
  const projectSearch =
    location.projectId === null ? {} : { project: location.projectId };

  useImperativeHandle(ref, () => ({
    read: () =>
      readProjectionWorkspace(
        session,
        location,
        results,
        editorRef.current?.read() ?? null,
        persistenceStatus
      ),
  }));

  useEffect(() => {
    if (location.section === 'overview' && location.projectId !== null) {
      projectHeadingRef.current?.focus();
    }
  }, [location.projectId, location.section]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-base-content/70">Projection plan</p>
          <h1 className="text-3xl font-bold">{draft.name}</h1>
          <p className="mt-2 text-sm">
            Fixed snapshot {draft.seededAt.slice(0, 10)}. Salary assumptions
            apply from this snapshot.
          </p>
        </div>
        <ProjectionSaveControls />
      </header>

      <ProjectionSaveFeedback onNavigate={onNavigate} search={search} />

      <nav
        aria-label="Plan sections"
        className="mt-6 flex gap-2 border-b border-base-300 pb-3"
      >
        {(['overview', 'staffing'] as const).map((section) => (
          <button
            aria-current={location.section === section ? 'page' : undefined}
            className={`btn ${location.section === section ? 'btn-primary' : 'btn-ghost'}`}
            key={section}
            onClick={() => onNavigate({ ...projectSearch, section })}
            type="button"
          >
            {section === 'overview' ? 'Project outlook' : 'Staffing'}
          </button>
        ))}
      </nav>

      {location.issues.length > 0 ? (
        <section
          className="mt-6 rounded-box border border-warning p-5"
          role="alert"
        >
          <h2 className="text-xl font-bold">
            This plan location cannot be opened
          </h2>
          {location.issues.map((issue) => (
            <p className="mt-2" key={issue}>
              {issue}
            </p>
          ))}
          <button
            className="btn btn-outline mt-4"
            onClick={() => onNavigate({ section: 'overview' }, true)}
            type="button"
          >
            Open plan overview
          </button>
        </section>
      ) : location.section === 'overview' ? (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Project outlook</h2>
          <p className="mt-2 text-sm">
            Each project keeps its own balance. A surplus on one project does
            not cover another project&apos;s shortfall.
          </p>
          {selectedProject && (
            <button
              className="btn btn-ghost btn-sm mt-3"
              onClick={() => onNavigate({ section: 'overview' })}
              type="button"
            >
              Clear project selection
            </button>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {draft.projects.map((project) => {
              const months = getProjectOutlook(results.rows, project.id);
              const endBalance = months.at(-1)?.remaining ?? 0;
              const forecast = months.reduce(
                (sum, month) => sum + month.forecast,
                0
              );
              const snapshotBalance = project.budgets.reduce(
                (sum, budget) =>
                  sum + budget.budget - budget.spentToDate - budget.committed,
                0
              );
              return (
                <article
                  className={`rounded-box border p-5 ${location.projectId === project.id ? 'border-primary' : 'border-base-300'}`}
                  key={project.id}
                >
                  <h3 className="text-lg font-bold">{project.projectName}</h3>
                  <p className="mt-1 text-sm">
                    Through {project.endDate ?? 'the forecast horizon'}
                  </p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt>Snapshot balance</dt>
                      <dd>{formatCurrency(snapshotBalance)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Remaining forecast</dt>
                      <dd>{formatCurrency(forecast)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 font-bold">
                      <dt>Projected end balance</dt>
                      <dd className={endBalance < 0 ? 'text-error' : ''}>
                        {formatCurrency(endBalance)}
                      </dd>
                    </div>
                  </dl>
                  {endBalance < 0 && (
                    <p className="mt-3 font-semibold text-error">
                      Projected shortfall
                    </p>
                  )}
                  <button
                    aria-pressed={location.projectId === project.id}
                    className="btn btn-outline btn-sm mt-4"
                    onClick={() =>
                      onNavigate({ project: project.id, section: 'overview' })
                    }
                    type="button"
                  >
                    View {project.projectName}
                  </button>
                </article>
              );
            })}
          </div>
          {selectedProject && (
            <section aria-labelledby="project-months-title" className="mt-8">
              <h2
                className="text-xl font-bold"
                id="project-months-title"
                ref={projectHeadingRef}
                tabIndex={-1}
              >
                {selectedProject.projectName} by month
              </h2>
              <p className="mt-2 text-sm">
                Snapshot-month actuals are already included in the snapshot
                balance. Forecast shows additional expected spending.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="table w-full whitespace-nowrap">
                  <caption className="sr-only">
                    Monthly actuals, forecast, and remaining balance for{' '}
                    {selectedProject.projectName}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Actuals</th>
                      <th scope="col">Forecast</th>
                      <th scope="col">End balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getProjectOutlook(results.rows, selectedProject.id).map(
                      (month) => (
                        <tr key={month.month}>
                          <th scope="row">{month.month}</th>
                          <td>{formatCurrency(month.actual)}</td>
                          <td>{formatCurrency(month.forecast)}</td>
                          <td
                            className={
                              month.remaining < 0
                                ? 'text-error font-semibold'
                                : ''
                            }
                          >
                            {formatCurrency(month.remaining)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      ) : (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Staffing</h2>
          <p className="mt-2 text-sm">
            Salary is the full-time rate. Project shares below are percentages
            of full-time salary.
          </p>
          <div className="mt-4 space-y-4">
            {draft.jobs.map((job) => (
              <article
                className="rounded-box border border-base-300 p-5"
                key={job.id}
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold">{job.name}</h3>
                    <p className="text-sm">
                      {job.title} · {job.fte * 100}% appointment FTE
                    </p>
                  </div>
                  <button
                    className="btn btn-outline"
                    id={`salary-job-${job.id}`}
                    onClick={() =>
                      onNavigate({
                        ...projectSearch,
                        job: job.id,
                        section: 'staffing',
                      })
                    }
                    type="button"
                  >
                    Edit salary for {job.name}
                  </button>
                </div>
                <p className="mt-4">
                  {job.monthlySalary === null
                    ? 'Salary needs input'
                    : `${formatCurrency(job.monthlySalary * 12)} per year at full time`}
                </p>
                <p className="mt-1 text-sm">
                  {formatCurrency(job.monthlySalary)} per month at full time
                </p>
                <ul className="mt-4 space-y-1 text-sm">
                  {job.fundingEntries.map((funding, index) => (
                    <li key={index}>
                      {draft.projects.find(
                        (project) => project.id === funding.projectId
                      )?.projectName ?? 'Outside this portfolio'}
                      : {funding.percent * job.fte * 100}% of full-time salary
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
      {selectedJob && (
        <SalaryEditor
          job={selectedJob}
          key={`${selectedJob.id}:${reloadVersion}`}
          onApply={applySalary}
          onClose={() =>
            onNavigate({ ...projectSearch, section: 'staffing' }, true)
          }
          ref={editorRef}
          snapshotMonth={draft.seededAt.slice(0, 7)}
        />
      )}
      {planPath && (
        <ProjectionNavigationGuard
          pendingEditor={() => editorRef.current?.read() ?? null}
          planPath={planPath}
        />
      )}
    </div>
  );
}
