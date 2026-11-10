import {
  PlanDetailsEditor,
  type PlanDetailsEditorHandle,
} from '@/components/projections/PlanDetailsEditor.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { FundingOutlook } from '@/components/projections/FundingOutlook.tsx';
import { editPlanDetails } from '@/lib/projectionDetails.ts';
import {
  ExpensesEditor,
  type ExpensesEditorHandle,
} from '@/components/projections/ExpensesEditor.tsx';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
import type { SourceOperation } from '@/lib/projectionSources.ts';
import {
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
        <FundingOutlook
          draft={draft}
          onNavigate={onNavigate}
          results={results}
          selectedSourceId={location.fundingSourceId}
        />
      ) : location.section === 'funding' ? (
        <section className="mt-6">
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
          <StaffingEditor
            appointmentFunding={results.appointmentFunding}
            forecastWindow={results.forecastWindow}
            key={`${reloadVersion}:${location.appointmentId ?? 'list'}:${location.fundingMonth ?? 'details'}`}
            onOperation={applyAppointmentOperation}
            ref={editorRef}
            results={results}
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
