import { DuplicateProjectionButton } from '@/components/projections/DuplicateProjectionButton.tsx';
import type { Projection } from '@/queries/projections.ts';
import { useFundingSummaryMotion } from '@/components/projections/useFundingSummaryMotion.ts';
import { FundingOutlookNotice } from '@/components/projections/FundingOutlookSummary.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import {
  BanknotesIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  UserGroupIcon,
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
  useId,
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
  const summaryId = useId();
  const deletionConfirmed = useRef(false);
  const duplicateDisabled =
    saving ||
    reloading ||
    Boolean(error || conflict) ||
    isProjectionDirty(session);
  const { draft } = session;
  const outlook = buildProjectionOutlook(draft, results);
  const hasShortfall =
    outlook.shortfallSources.length > 0 ||
    outlook.categoryShortfallSources.length > 0;
  const hasFundingWarnings =
    hasShortfall ||
    outlook.gapAppointmentIds.length > 0 ||
    outlook.overlapAppointmentIds.length > 0;
  const {
    animating: summaryAnimating,
    containerRef,
    contentRef,
    minimized: summaryMinimized,
    minimizeRef: minimizeSummaryRef,
    noticeRef,
    restoreRef: restoreSummaryRef,
    toggle: toggleSummary,
  } = useFundingSummaryMotion(hasFundingWarnings);
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
    <div className="relative min-w-0" ref={containerRef}>
      <div hidden={summaryMinimized} id={summaryId}>
        <FundingOutlookNotice
          minimizeRef={minimizeSummaryRef}
          minimizeTooltipEnabled={!summaryMinimized && !summaryAnimating}
          onMinimize={toggleSummary}
          onNavigate={onNavigate}
          onViewCategoryBalances={(id) =>
            onNavigate({ section: 'overview', source: id }, false, true)
          }
          outlook={outlook}
          ref={noticeRef}
          summaryId={summaryId}
        />
      </div>
      <div ref={contentRef}>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 md:items-center">
          <div className="min-w-0 flex-1 basis-80">
            <div className="flex items-start gap-2">
              <h1 className="h1 min-w-0 break-words">{draft.name}</h1>
              {summaryMinimized && hasFundingWarnings && (
                <TooltipLabel
                  asChild
                  focusEnabled={!summaryAnimating}
                  hoverEnabled={!summaryAnimating}
                  label={
                    <button
                      aria-controls={summaryId}
                      aria-expanded="false"
                      aria-label="Show funding summary"
                      className={`btn btn-ghost btn-sm btn-square shrink-0 ${hasShortfall ? 'border-error/30 bg-error/5 text-error' : 'border-warning/50 bg-warning/5 text-warning'}`}
                      onClick={toggleSummary}
                      ref={restoreSummaryRef}
                      type="button"
                    >
                      <ExclamationTriangleIcon
                        aria-hidden="true"
                        className="size-5"
                      />
                    </button>
                  }
                  open={summaryAnimating ? false : undefined}
                  tooltip={tooltipDefinitions.showFundingSummary}
                />
              )}
            </div>
            <p className="subtitle">
              {fundingMonthLabel(results.forecastWindow.startMonth)} onward ·{' '}
              {draft.content.forecastMonths} months
              <span
                className="mt-1 block text-base-content/80 xl:ms-4 xl:mt-0 xl:inline"
                role="status"
              >
                {saving
                  ? 'Saving…'
                  : isProjectionDirty(session)
                    ? 'Unsaved changes'
                    : 'Saved in Walter'}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-label="Edit plan details"
              className="btn btn-outline"
              onClick={() => setEditingDetails(true)}
              type="button"
            >
              <Cog6ToothIcon aria-hidden="true" className="size-5 shrink-0" />
              Plan details
            </button>
            <ProjectionSaveControls />
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
          </div>
        </header>
        {editingDetails && (
          <PlanDetailsEditor
            deleteDisabled={saving || reloading || duplicating}
            iamId={iamId}
            key={reloadVersion}
            onApply={(inputs) =>
              applyDetailsOperation((current) =>
                editPlanDetails(current, inputs)
              )
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

        <nav aria-label="Plan sections" className="mb-6 overflow-x-auto">
          <div className="join flex w-full">
            {(
              [
                {
                  Icon: ChartBarIcon,
                  label: 'Overview',
                  section: 'overview',
                },
                {
                  Icon: BanknotesIcon,
                  label: 'Funding',
                  section: 'funding',
                },
                { Icon: UserGroupIcon, label: 'Staffing', section: 'staffing' },
                {
                  Icon: ListBulletIcon,
                  label: 'Expenses',
                  section: 'expenses',
                },
              ] as const
            ).map(({ Icon, label, section }) => (
              <button
                aria-current={location.section === section ? 'page' : undefined}
                className={`btn join-item flex-1 gap-2 px-3 text-base whitespace-nowrap ${location.section === section ? 'btn-primary' : 'btn-outline border-main-border'}`}
                key={section}
                onClick={() =>
                  onNavigate(
                    section === 'funding' || section === 'expenses'
                      ? { section }
                      : { ...sourceSearch, section }
                  )
                }
                type="button"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
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
            onViewCategoryBalances={(id) =>
              onNavigate({ section: 'overview', source: id }, false, true)
            }
            outlook={outlook}
            ref={outlookRef}
            results={results}
            selectedSourceId={location.fundingSourceId}
          />
        ) : location.section === 'funding' ? (
          <section>
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
          <section>
            <StaffingEditor
              appointmentFunding={results.appointmentFunding}
              forecastWindow={results.forecastWindow}
              key={`${reloadVersion}:${location.appointmentId ?? 'list'}:${location.fundingMonth ?? 'details'}:${location.fundingDate ?? ''}`}
              onOperation={applyAppointmentOperation}
              onViewSource={(id) =>
                onNavigate({ section: 'overview', source: id }, false, true)
              }
              ref={editorRef}
              results={results}
              session={session}
              target={{
                fundingDate: location.fundingDate,
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
          <section>
            <ExpensesEditor
              key={`${reloadVersion}:${location.fundingSourceId ?? 'all'}`}
              onOperation={applyExpenseOperation}
              ref={expenseEditorRef}
              session={session}
              sourceTarget={{
                id: location.fundingSourceId,
                onChange: (id) =>
                  onNavigate(
                    id === null
                      ? { section: 'expenses' }
                      : { section: 'expenses', source: id }
                  ),
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
    </div>
  );
}
