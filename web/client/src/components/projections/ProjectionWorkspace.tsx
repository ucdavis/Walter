import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
import { AppointmentFundingStatus } from '@/components/projections/AppointmentFundingStatus.tsx';
import {
  sourceCapturedBalance,
  sourceLabel,
  sourcePlanningBalance,
  type SourceOperation,
} from '@/lib/projectionSources.ts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  getFundingSourceOutlook,
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
  iamId,
  onNavigate,
  planPath,
  ref,
  search,
}: {
  iamId?: string;
  onNavigate: (location: ProjectionNavigation, replace?: boolean) => void;
  planPath?: string;
  ref?: Ref<ProjectionWorkspaceHandle>;
  search: Record<string, unknown>;
}) {
  const {
    applySalary,
    applySourceOperation,
    persistenceStatus,
    reloadVersion,
    results,
    session,
  } = useProjectionSession();
  const { draft } = session;
  const location = readProjectionLocation(search, draft);
  const editorRef = useRef<SalaryEditorHandle>(null);
  const sourceEditorRef = useRef<FundingSourcesEditorHandle>(null);
  const sourceHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedSource = draft.fundingSources.find(
    (source) => source.id === location.fundingSourceId
  );
  const selectedAppointment =
    location.issues.length === 0 && location.section === 'staffing'
      ? draft.appointments.find(
          (appointment) => appointment.id === location.appointmentId
        )
      : undefined;
  const sourceSearch =
    location.fundingSourceId === null
      ? {}
      : { source: location.fundingSourceId };

  function applySources(operation: SourceOperation) {
    const result = applySourceOperation(operation);
    if (
      result.ok &&
      location.fundingSourceId !== null &&
      !result.session.draft.fundingSources.some(
        ({ id }) => id === location.fundingSourceId
      )
    ) {
      onNavigate({ section: 'funding' }, true);
    }
    return result;
  }

  useImperativeHandle(ref, () => ({
    read: () =>
      readProjectionWorkspace(
        session,
        location,
        results,
        editorRef.current?.read() ?? sourceEditorRef.current?.read() ?? null,
        persistenceStatus
      ),
  }));

  useEffect(() => {
    if (location.section === 'overview' && location.fundingSourceId !== null) {
      sourceHeadingRef.current?.focus();
    }
  }, [location.fundingSourceId, location.section]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-base-content/70">Projection plan</p>
          <h1 className="text-3xl font-bold">{draft.name}</h1>
          <p className="mt-2 text-sm">
            Plan started {draft.seededAt.slice(0, 10)}. Each source keeps its
            own capture date.
          </p>
        </div>
        <ProjectionSaveControls />
      </header>

      <ProjectionSaveFeedback onNavigate={onNavigate} search={search} />

      <nav
        aria-label="Plan sections"
        className="mt-6 flex gap-2 border-b border-base-300 pb-3"
      >
        {(['overview', 'funding', 'staffing'] as const).map((section) => (
          <button
            aria-current={location.section === section ? 'page' : undefined}
            className={`btn ${location.section === section ? 'btn-primary' : 'btn-ghost'}`}
            key={section}
            onClick={() => onNavigate({ ...sourceSearch, section })}
            type="button"
          >
            {section === 'overview'
              ? 'Funding outlook'
              : section === 'funding'
                ? 'Funding sources'
                : 'Staffing'}
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
          <h2 className="text-xl font-bold">Funding outlook</h2>
          <p className="mt-2 text-sm">
            Each funding source keeps its own balance. A surplus on one task
            does not cover another task&apos;s shortfall.
          </p>
          {selectedSource && (
            <button
              className="btn btn-ghost btn-sm mt-3"
              onClick={() => onNavigate({ section: 'overview' })}
              type="button"
            >
              Clear source selection
            </button>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {draft.fundingSources.map((source) => {
              const months = getFundingSourceOutlook(results.rows, source.id);
              const endBalance =
                months.at(-1)?.remaining ?? sourcePlanningBalance(source);
              const forecast = months.reduce(
                (sum, month) => sum + month.forecast,
                0
              );
              const snapshotBalance = sourceCapturedBalance(source);
              return (
                <article
                  className={`rounded-box border p-5 ${location.fundingSourceId === source.id ? 'border-primary' : 'border-base-300'}`}
                  key={source.id}
                >
                  <h3 className="text-lg font-bold">{sourceLabel(source)}</h3>
                  <p className="mt-1 text-sm">
                    {source.sourceKind === 'Planned'
                      ? 'Planned funding'
                      : `Captured ${source.capturedAt.slice(0, 10)}`}
                  </p>
                  <p className="mt-1 text-sm">
                    Through {source.endDate ?? 'the forecast horizon'}
                  </p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt>Captured balance</dt>
                      <dd>{formatCurrency(snapshotBalance)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Planning balance</dt>
                      <dd>{formatCurrency(sourcePlanningBalance(source))}</dd>
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
                    aria-pressed={location.fundingSourceId === source.id}
                    className="btn btn-outline btn-sm mt-4"
                    onClick={() =>
                      onNavigate({ section: 'overview', source: source.id })
                    }
                    type="button"
                  >
                    View {sourceLabel(source)}
                  </button>
                </article>
              );
            })}
          </div>
          {selectedSource && (
            <section aria-labelledby="source-months-title" className="mt-8">
              <h2
                className="text-xl font-bold"
                id="source-months-title"
                ref={sourceHeadingRef}
                tabIndex={-1}
              >
                {sourceLabel(selectedSource)} by month
              </h2>
              <p className="mt-2 text-sm">
                Snapshot-month actuals are already included in the snapshot
                balance. Forecast shows additional expected spending.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="table w-full whitespace-nowrap">
                  <caption className="sr-only">
                    Monthly actuals, forecast, and remaining balance for{' '}
                    {sourceLabel(selectedSource)}
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
                    {getFundingSourceOutlook(
                      results.rows,
                      selectedSource.id
                    ).map((month) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      ) : location.section === 'funding' ? (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Funding sources</h2>
          <FundingSourcesEditor
            iamId={iamId}
            key={`${reloadVersion}:${location.fundingSourceId ?? 'list'}`}
            onOperation={applySources}
            ref={sourceEditorRef}
            session={session}
            sourceTarget={{
              id: location.fundingSourceId,
              onChange: (id) =>
                onNavigate(
                  id === null
                    ? { section: 'funding' }
                    : { section: 'funding', source: id },
                  id === null
                ),
            }}
          />
        </section>
      ) : (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Staffing</h2>
          <p className="mt-2 text-sm">
            Salary is the full-time rate. Allocation shares below are
            percentages of full-time salary.
          </p>
          <div className="mt-4 space-y-4">
            {draft.appointments.map((appointment) => (
              <article
                className="rounded-box border border-base-300 p-5"
                key={appointment.id}
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold">{appointment.name}</h3>
                    <p className="text-sm">
                      {appointment.title} · {appointment.fte * 100}% appointment
                      FTE
                    </p>
                  </div>
                  <button
                    className="btn btn-outline"
                    id={`salary-appointment-${appointment.id}`}
                    onClick={() =>
                      onNavigate({
                        ...sourceSearch,
                        appointment: appointment.id,
                        section: 'staffing',
                      })
                    }
                    type="button"
                  >
                    Edit salary for {appointment.name}
                  </button>
                </div>
                <p className="mt-4">
                  {appointment.monthlySalary === null
                    ? 'Salary needs input'
                    : `${formatCurrency(appointment.monthlySalary * 12)} per year at full time`}
                </p>
                <p className="mt-1 text-sm">
                  {formatCurrency(appointment.monthlySalary)} per month at full
                  time
                </p>
                <AppointmentFundingStatus
                  appointment={appointment}
                  months={results.appointmentFunding}
                  snapshotMonth={draft.seededAt.slice(0, 7)}
                />
                <ul className="mt-4 space-y-1 text-sm">
                  {appointment.allocations.map((allocation, index) => (
                    <li key={index}>
                      {allocation.fundingSourceId === null
                        ? 'Outside this portfolio'
                        : (() => {
                            const source = draft.fundingSources.find(
                              (source) =>
                                source.id === allocation.fundingSourceId
                            );
                            return source
                              ? sourceLabel(source)
                              : 'Unallocated funding';
                          })()}
                      : {allocation.percent * appointment.fte * 100}% of
                      full-time salary
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
      {selectedAppointment && (
        <SalaryEditor
          appointment={selectedAppointment}
          key={`${selectedAppointment.id}:${reloadVersion}`}
          onApply={applySalary}
          onClose={() =>
            onNavigate({ ...sourceSearch, section: 'staffing' }, true)
          }
          ref={editorRef}
          snapshotMonth={draft.seededAt.slice(0, 7)}
        />
      )}
      {planPath && (
        <ProjectionNavigationGuard
          pendingEditor={() =>
            editorRef.current?.read() ?? sourceEditorRef.current?.read() ?? null
          }
          planPath={planPath}
        />
      )}
    </div>
  );
}
