import { DuplicateProjectionButton } from '@/components/projections/DuplicateProjectionButton.tsx';
import type { Projection } from '@/queries/projections.ts';
import { FundingOutlookNotice } from '@/components/projections/FundingOutlookSummary.tsx';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import {
  BanknotesIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ListBulletIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import {
  PlanDetailsEditor,
  type PlanDetailsEditorHandle,
} from '@/components/projections/PlanDetailsEditor.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import {
  FundingOutlook,
  type FundingOutlookHandle,
} from '@/components/projections/FundingOutlook.tsx';
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
import type { SourceOperation } from '@/lib/projectionSources.ts';
import {
  isProjectionDirty,
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
  onDeleted,
  onDuplicated,
  onNavigate: navigate,
  planPath,
  ref,
  search,
}: {
  iamId?: string;
  onDeleted?: () => Promise<void>;
  onDuplicated?: (saved: Projection) => Promise<void>;
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
    conflict,
    error,
    persistenceStatus,
    reloading,
    reloadVersion,
    results,
    saving,
    session,
  } = useProjectionSession();
  const [duplicating, setDuplicating] = useState(false);
  const deletionConfirmed = useRef(false);
  const duplicateDisabled =
    saving ||
    reloading ||
    Boolean(error || conflict) ||
    isProjectionDirty(session);
  const { draft } = session;
  const outlook = buildProjectionOutlook(draft, results);
  const location = readProjectionLocation(search, draft);
  const [editingDetails, setEditingDetails] = useState(false);
  const detailsEditorRef = useRef<PlanDetailsEditorHandle>(null);
  const editorRef = useRef<StaffingEditorHandle>(null);
  const expenseEditorRef = useRef<ExpensesEditorHandle>(null);
  const sourceEditorRef = useRef<FundingSourcesEditorHandle>(null);
  const outlookRef = useRef<FundingOutlookHandle>(null);
  const categoryFocus = useRef(false);
  const pendingSourceFocus = useRef<number | null>(null);
  useEffect(() => {
    // Only an explicit source action moves the view; history restores its own scroll position.
    if (
      pendingSourceFocus.current !== null &&
      location.section === 'overview' &&
      location.fundingSourceId === pendingSourceFocus.current
    ) {
      if (categoryFocus.current) {
        outlookRef.current?.focusCategoryBudgets();
      } else {
        outlookRef.current?.focusSelectedSource();
      }
    }
    pendingSourceFocus.current = null;
  }, [location.section, location.fundingSourceId, location.issues.length]);
  function onNavigate(
    target: ProjectionNavigation,
    replace = false,
    categories = false
  ) {
    categoryFocus.current = categories;
    pendingSourceFocus.current = null;
    if (target.section === 'overview' && target.source !== undefined) {
      if (
        location.section === 'overview' &&
        target.source === location.fundingSourceId &&
        outlookRef.current
      ) {
        if (categoryFocus.current) {
          outlookRef.current?.focusCategoryBudgets();
        } else {
          outlookRef.current?.focusSelectedSource();
        }
      } else {
        pendingSourceFocus.current = target.source;
      }
    }
    navigate(target, replace);
  }
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
    <div className="mx-auto w-full max-w-[96rem] p-4 sm:p-8">
      <FundingOutlookNotice onNavigate={onNavigate} outlook={outlook} />
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl font-bold leading-tight break-words sm:text-3xl">
            {draft.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium tracking-wide text-base-content/60 uppercase">
            <p title="Each source keeps its own capture date.">
              Plan started {draft.seededAt.slice(0, 10)}
            </p>
            <p>
              {draft.content.forecastMonths}-month forecast,{' '}
              {fundingMonthLabel(results.forecastWindow.startMonth)} through{' '}
              {fundingMonthLabel(results.forecastWindow.endMonth)}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            aria-label="Edit plan details"
            className="btn btn-outline btn-sm"
            onClick={() => setEditingDetails(true)}
            type="button"
          >
            <Cog6ToothIcon aria-hidden="true" className="size-4" />
            Plan details
          </button>
          {iamId && onDuplicated && (
            <DuplicateProjectionButton
              canDuplicate={() =>
                ![
                  detailsEditorRef.current?.read(),
                  editorRef.current?.read(),
                  sourceEditorRef.current?.read(),
                  expenseEditorRef.current?.read(),
                ].some((editor) => editor?.hasChanges)
              }
              disabled={duplicateDisabled}
              iamId={iamId}
              onBusyChange={setDuplicating}
              onCreated={onDuplicated}
              projection={session.baseline}
            />
          )}
          <ProjectionSaveControls />
        </div>
      </header>
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
          deleteDisabled={saving || reloading || duplicating}
          iamId={iamId}
          key={reloadVersion}
          onApply={(inputs) =>
            applyDetailsOperation((current) => editPlanDetails(current, inputs))
          }
          onClose={() => setEditingDetails(false)}
          onDeleted={
            onDeleted
              ? async () => {
                  deletionConfirmed.current = true;
                  await onDeleted();
                }
              : undefined
          }
          plan={draft}
          ref={detailsEditorRef}
        />
      )}

      <ProjectionSaveFeedback onNavigate={onNavigate} search={search} />

      <nav
        aria-label="Plan sections"
        className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-base-300 bg-base-300 sm:grid-cols-4"
      >
        {(
          [
            {
              Icon: ChartBarIcon,
              label: 'Funding outlook',
              section: 'overview',
            },
            {
              Icon: BanknotesIcon,
              label: 'Funding sources',
              section: 'funding',
            },
            { Icon: UsersIcon, label: 'Staffing', section: 'staffing' },
            {
              Icon: ListBulletIcon,
              label: 'Other expenses',
              section: 'expenses',
            },
          ] as const
        ).map(({ Icon, label, section }) => (
          <button
            aria-current={location.section === section ? 'page' : undefined}
            className={`btn h-auto min-h-12 w-full rounded-none border-0 px-2 py-3 text-sm shadow-none ${location.section === section ? 'bg-primary text-primary-content hover:bg-primary/90' : 'bg-base-100 text-base-content/70 hover:bg-base-200'}`}
            key={section}
            onClick={() =>
              onNavigate(
                section === 'funding'
                  ? { section }
                  : { ...sourceSearch, section }
              )
            }
            type="button"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
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
        <FundingOutlook
          draft={draft}
          onNavigate={onNavigate}
          outlook={outlook}
          ref={outlookRef}
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
            onViewSource={(id) =>
              onNavigate({ section: 'overview', source: id }, false, true)
            }
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
          allowDeparture={() => deletionConfirmed.current}
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
