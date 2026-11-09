import {
  PlanDetailsEditor,
  type PlanDetailsEditorHandle,
} from '@/components/projections/PlanDetailsEditor.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { getSourceForecastWindow } from '@/lib/piProjection.ts';
import { editPlanDetails } from '@/lib/projectionDetails.ts';
import {
  ExpensesEditor,
  type ExpensesEditorHandle,
} from '@/components/projections/ExpensesEditor.tsx';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
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
  StaffingEditor,
  type StaffingEditorHandle,
} from '@/components/projections/StaffingEditor.tsx';

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
    applyAppointmentOperation,
    applyDetailsOperation,
    applyExpenseOperation,
    applySourceOperation,
    persistenceStatus,
    reloadVersion,
    results,
    session,
  } = useProjectionSession();
  const { draft } = session;
  const location = readProjectionLocation(search, draft);
  const [editingDetails, setEditingDetails] = useState(false);
  const detailsEditorRef = useRef<PlanDetailsEditorHandle>(null);
  const editorRef = useRef<StaffingEditorHandle>(null);
  const expenseEditorRef = useRef<ExpensesEditorHandle>(null);
  const sourceEditorRef = useRef<FundingSourcesEditorHandle>(null);
  const sourceHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedSource = draft.content.fundingSources.find(
    (source) => source.id === location.fundingSourceId
  );
  const sourceSearch =
    location.fundingSourceId === null
      ? {}
      : { source: location.fundingSourceId };

  function applySources(operation: SourceOperation) {
    const result = applySourceOperation(operation);
    if (
      result.ok &&
      location.fundingSourceId !== null &&
      !result.session.draft.content.fundingSources.some(
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
        detailsEditorRef.current?.read() ??
          editorRef.current?.read() ??
          sourceEditorRef.current?.read() ??
          expenseEditorRef.current?.read() ??
          null,
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn btn-outline"
            onClick={() => setEditingDetails(true)}
            type="button"
          >
            Edit plan details
          </button>
          <ProjectionSaveControls />
        </div>
      </header>
      <p className="mt-3 text-sm">
        {draft.content.forecastMonths}-month forecast,{' '}
        {fundingMonthLabel(results.forecastWindow.startMonth)} through{' '}
        {fundingMonthLabel(results.forecastWindow.endMonth)}.
      </p>
      {draft.content.notes && (
        <section
          aria-label="Plan notes"
          className="mt-4 rounded-box bg-base-200 p-4"
        >
          <h2 className="font-semibold">Plan notes</h2>
          <p className="mt-2 whitespace-pre-wrap break-words">
            {draft.content.notes}
          </p>
        </section>
      )}
      {editingDetails && (
        <PlanDetailsEditor
          key={reloadVersion}
          onApply={(inputs) =>
            applyDetailsOperation((current) => editPlanDetails(current, inputs))
          }
          onClose={() => setEditingDetails(false)}
          plan={draft}
          ref={detailsEditorRef}
        />
      )}

      <ProjectionSaveFeedback onNavigate={onNavigate} search={search} />

      <nav
        aria-label="Plan sections"
        className="mt-6 flex flex-wrap gap-2 border-b border-base-300 pb-3"
      >
        {(['overview', 'funding', 'staffing', 'expenses'] as const).map(
          (section) => (
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
                  : section === 'staffing'
                    ? 'Staffing'
                    : 'Other expenses'}
            </button>
          )
        )}
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
            {draft.content.fundingSources.map((source) => {
              const months = getFundingSourceOutlook(results.rows, source.id);
              const endBalance = months.at(-1)?.remaining ?? 0;
              const forecast = months.reduce(
                (sum, month) => sum + month.forecast,
                0
              );
              const snapshotBalance = sourceCapturedBalance(source);
              const outside = getSourceForecastWindow(
                source,
                results.forecastWindow
              ).isBeyondForecast;
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
                  {outside && (
                    <p className="mt-2 text-sm">
                      This source starts after the forecast period and
                      contributes no forecast costs or balance in this period.
                    </p>
                  )}
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
                      <dt>
                        Projected balance at{' '}
                        {fundingMonthLabel(results.forecastWindow.endMonth)}
                      </dt>
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
      ) : location.section === 'staffing' ? (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Staffing</h2>
          <StaffingEditor
            appointmentFunding={results.appointmentFunding}
            forecastWindow={results.forecastWindow}
            key={`${reloadVersion}:${location.appointmentId ?? 'list'}:${location.fundingMonth ?? 'details'}`}
            onOperation={applyAppointmentOperation}
            ref={editorRef}
            session={session}
            target={{
              fundingMonth: location.fundingMonth,
              id: location.appointmentId,
              onChange: (id, month) =>
                onNavigate(
                  id === null
                    ? { ...sourceSearch, section: 'staffing' }
                    : {
                        ...sourceSearch,
                        appointment: id,
                        ...(month ? { fundingMonth: month } : {}),
                        section: 'staffing',
                      },
                  id === null
                ),
            }}
          />
        </section>
      ) : (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Other expenses</h2>
          <ExpensesEditor
            key={`${reloadVersion}:${location.fundingSourceId ?? 'first'}`}
            onOperation={applyExpenseOperation}
            ref={expenseEditorRef}
            session={session}
            sourceTarget={{
              id: location.fundingSourceId,
              onChange: (id) => onNavigate({ section: 'expenses', source: id }),
            }}
          />
        </section>
      )}
      {planPath && (
        <ProjectionNavigationGuard
          pendingEditor={() =>
            detailsEditorRef.current?.read() ??
            editorRef.current?.read() ??
            sourceEditorRef.current?.read() ??
            expenseEditorRef.current?.read() ??
            null
          }
          planPath={planPath}
        />
      )}
    </div>
  );
}
