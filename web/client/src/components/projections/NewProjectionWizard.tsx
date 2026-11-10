import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import {
  PlanDurationField,
  PlanNotesField,
} from '@/components/projections/PlanDetailsFields.tsx';
import { ProjectionReviewStep } from '@/components/projections/ProjectionReviewStep.tsx';
import {
  DEFAULT_FORECAST_MONTHS,
  MAX_PLAN_NAME_LENGTH,
  editPlanDetails,
  validatePlanDetails,
} from '@/lib/projectionDetails.ts';
import {
  ExpensesEditor,
  type ExpensesEditorHandle,
} from '@/components/projections/ExpensesEditor.tsx';
import {
  validateProjectionExpenses,
  type ExpenseOperation,
} from '@/lib/projectionExpenses.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
import {
  selectInitialSources,
  type SourceOperation,
} from '@/lib/projectionSources.ts';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import {
  StaffingEditor,
  type StaffingEditorHandle,
} from '@/components/projections/StaffingEditor.tsx';
import {
  validateProjectionAppointments,
  type AppointmentOperation,
} from '@/lib/projectionAppointments.ts';
import { HttpError } from '@/lib/api.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  createProjectionSession,
  type ProjectionSession,
} from '@/lib/projectionWorkspace.ts';
import {
  fetchProjectionSeed,
  useCreateProjectionDraft,
  type CreateProjectionDraftRequest,
  type Projection,
  type ProjectionDraft,
  type ProjectionRosterEntry,
} from '@/queries/projections.ts';

const steps = ['Funding sources', 'Staffing', 'Other expenses', 'Review'];

export function NewProjectionWizard({
  iamId,
  onCancel,
  onCreated,
}: {
  iamId: string;
  onCancel: () => void;
  onCreated: (saved: Projection) => Promise<void>;
}) {
  const form = useAppForm({
    defaultValues: {
      forecastMonths: DEFAULT_FORECAST_MONTHS,
      name: '',
      notes: '',
    },
    onSubmit: async () => {
      await continueSetup();
    },
  });
  const { forecastMonths, name, notes } = useStore(
    form.store,
    (state) => state.values
  );
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [returningToReview, setReturningToReview] = useState(false);
  const seedStarted = useRef(false);
  const [rosterSelected, setRosterSelected] = useState(false);
  const [roster, setRoster] = useState<ProjectionRosterEntry[]>([]);
  const currentSession = useRef<ProjectionSession<ProjectionDraft> | null>(
    null
  );
  const sourceEditorRef = useRef<FundingSourcesEditorHandle>(null);
  const expenseEditorRef = useRef<ExpensesEditorHandle>(null);
  const staffingEditorRef = useRef<StaffingEditorHandle>(null);
  const [step, setStep] = useState(0);
  const [visitedStep, setVisitedStep] = useState(0);
  const [session, setSession] =
    useState<ProjectionSession<ProjectionDraft> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] =
    useState<CreateProjectionDraftRequest | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const mounted = useRef(true);
  const requestPending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const create = useCreateProjectionDraft(iamId);
  const draft = session?.draft;
  const results = useMemo(
    () => (draft ? computePiProjection(draft) : null),
    [draft]
  );
  const details = { forecastMonths, name, notes: notes || null };
  const detailsValidationMessage = validatePlanDetails(
    details,
    draft?.seededAt
  );
  const validationMessage =
    detailsValidationMessage ??
    (draft
      ? (validateProjectionAppointments(draft) ??
        validateProjectionExpenses(draft))
      : null);
  const hasWork = () =>
    Boolean(
      name ||
        notes ||
        forecastMonths !== DEFAULT_FORECAST_MONTHS ||
        selectionTouched ||
        (session?.revision ?? 0) > 0 ||
        submitted ||
        sourceEditorRef.current?.read()?.hasChanges ||
        staffingEditorRef.current?.read()?.hasChanges ||
        expenseEditorRef.current?.read()?.hasChanges
    );
  const blocker = useBlocker({
    enableBeforeUnload: hasWork,
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname && hasWork(),
    withResolver: true,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function updateSession(next: ProjectionSession<ProjectionDraft>) {
    currentSession.current = next;
    setSession(next);
  }

  function applySourceOperation(operation: SourceOperation) {
    const previous = currentSession.current!;
    const result = operation(previous);
    if (result.ok) {
      updateSession(result.session);
      if (!rosterSelected) {
        const fundingSources = result.session.draft.content.fundingSources;
        setSelectedSourceIds((ids) => [
          ...ids.filter((id) =>
            fundingSources.some((source) => source.id === id)
          ),
          ...fundingSources
            .filter(
              (source) =>
                !previous.draft.content.fundingSources.some(
                  ({ id }) => id === source.id
                )
            )
            .map(({ id }) => id),
        ]);
      }
    }
    return result;
  }

  function applyOperation<
    Result extends
      | { ok: false }
      | { ok: true; session: ProjectionSession<ProjectionDraft> },
  >(
    operation: (session: ProjectionSession<ProjectionDraft>) => Result
  ): Result {
    const result = operation(currentSession.current!);
    if (result.ok) {
      updateSession(result.session);
    }
    return result;
  }

  const applyAppointmentOperation = (operation: AppointmentOperation) =>
    applyOperation(operation);
  const applyExpenseOperation = (operation: ExpenseOperation) =>
    applyOperation(operation);

  async function continueSetup() {
    if (requestPending.current || detailsValidationMessage || pendingEdits()) {
      return;
    }
    setError(null);
    if (session) {
      const updated = editPlanDetails(session, details);
      if (!updated.ok) {
        setError(updated.error);
        return;
      }
      updateSession(updated.session);
      if (!rosterSelected) {
        const selected = selectInitialSources(
          updated.session,
          selectedSourceIds,
          roster
        );
        if (!selected.ok) {
          setError(selected.error);
          return;
        }
        updateSession(selected.session);
        setRosterSelected(true);
        setRoster([]);
      }
      setVisitedStep((visited) => Math.max(visited, 1));
      setStep(1);
      return;
    }
  }

  const captureFunding = useCallback(async () => {
    if (requestPending.current || !mounted.current) {
      return;
    }
    requestPending.current = true;
    setLoading(true);
    setError(null);
    try {
      const seed = await fetchProjectionSeed(iamId, 3);
      if (!mounted.current) {
        return;
      }
      // Financial capture must not replace details typed while the request was pending.
      const captured = createProjectionSession(seed.draft);
      currentSession.current = captured;
      setSession(captured);
      setRoster(seed.roster);
      setSelectedSourceIds([]);
    } catch {
      if (mounted.current) {
        setError(
          'Could not load funding sources. Your setup choices are still here. Retry funding to try again.'
        );
      }
    } finally {
      requestPending.current = false;
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [iamId]);

  useEffect(() => {
    // StrictMode replays effects. Capture once for this setup, then retry only on request.
    if (!seedStarted.current) {
      seedStarted.current = true;
      void captureFunding();
    }
  }, [captureFunding]);

  function pendingEdits() {
    return (
      sourceEditorRef.current?.read()?.hasChanges ||
      staffingEditorRef.current?.read()?.hasChanges ||
      expenseEditorRef.current?.read()?.hasChanges
    );
  }

  function navigateStep(target: number) {
    if (submitted || requestPending.current) {
      return;
    }
    if (pendingEdits()) {
      setError('Apply or cancel your open editor before changing steps.');
      return;
    }
    if (step === 0 && target !== 0 && session) {
      const updated = editPlanDetails(session, details);
      if (!updated.ok) {
        setError(updated.error);
        return;
      }
      updateSession(updated.session);
    }
    setError(null);
    setVisitedStep((visited) => Math.max(visited, target));
    setStep(target);
  }

  function returnToReview() {
    if (detailsValidationMessage || !session || pendingEdits()) {
      setError(
        detailsValidationMessage ??
          'Apply or cancel your open editor before returning to review.'
      );
      return;
    }
    const updated = editPlanDetails(session, details);
    if (!updated.ok) {
      setError(updated.error);
      return;
    }
    updateSession(updated.session);
    navigateStep(3);
  }

  async function finish() {
    if (
      !draft ||
      requestPending.current ||
      detailsValidationMessage ||
      validateProjectionAppointments(draft) ||
      validateProjectionExpenses(draft)
    ) {
      return;
    }
    // An uncertain response locks this payload and key until the same creation is acknowledged.
    const request =
      submitted ??
      structuredClone({
        creationKey: crypto.randomUUID(),
        draft: {
          content: {
            ...draft.content,
            forecastMonths,
            notes: notes.trim() ? notes : null,
          },
          name: name.trim(),
          seededAt: draft.seededAt,
        },
      });
    setSubmitted(request);
    setError(null);
    requestPending.current = true;
    try {
      const saved = await create.mutateAsync(request);
      if (mounted.current) {
        await onCreated(saved);
      }
    } catch (error_) {
      if (!mounted.current) {
        return;
      }
      if (error_ instanceof HttpError && error_.status === 400) {
        setSubmitted(null);
        setError('The plan was not created. Check your entries and try again.');
      } else {
        setError(
          'Creation was not confirmed. This setup is held unchanged. Retry creation to recover the same plan, or leave setup.'
        );
      }
    } finally {
      requestPending.current = false;
    }
  }

  function stay() {
    setCancelRequested(false);
    if (blocker.status === 'blocked') {
      blocker.reset();
    }
  }

  function leave() {
    // Stop late seed/create responses from opening a plan after the user has left setup.
    mounted.current = false;
    if (blocker.status === 'blocked') {
      blocker.proceed();
    } else {
      onCancel();
    }
  }

  return (
    <section
      aria-label="New plan setup"
      className="w-full pt-6 pb-12 text-base leading-normal text-base-content"
    >
      <button
        className="btn mb-6"
        onClick={() => (hasWork() ? setCancelRequested(true) : leave())}
        type="button"
      >
        <ArrowTrendingUpIcon aria-hidden="true" className="size-5" />
        Projections dashboard
      </button>
      <header className="mb-8">
        <h1 className="h1 outline-none" ref={heading} tabIndex={-1}>
          {
            [
              'Choose your starting point.',
              'Review your team.',
              'Plan for everything else.',
              'Ready to explore your plan.',
            ][step]
          }
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-base-content/80">
          {
            [
              'Search and add the funding sources to include in your plan.',
              'Keep current appointments or adjust them for this plan.',
              'Plan for supplies, travel, or a one-time purchase. Start with your historical spending estimates.',
              'Check your assumptions, then create a plan you can explore and adjust.',
            ][step]
          }
        </p>
      </header>
      <ol
        aria-label="Plan setup progress"
        className="mb-10 flex w-full list-none p-0"
      >
        {steps.map((label, index) => (
          <li
            aria-current={index === step ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-3 px-1 text-center text-xs not-last:after:absolute not-last:after:top-4 not-last:after:right-[calc(-50%+1.75rem)] not-last:after:left-[calc(50%+1.75rem)] not-last:after:h-px not-last:after:bg-base-300 sm:text-sm"
            key={label}
          >
            <button
              aria-current={index === step ? 'step' : undefined}
              className="relative z-10 flex flex-col items-center gap-3 disabled:cursor-not-allowed"
              disabled={
                index > visitedStep || Boolean(submitted) || create.isPending
              }
              onClick={() => navigateStep(index)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`relative z-10 grid size-8 place-items-center rounded-full border font-semibold ${index === step ? 'border-primary bg-primary text-primary-content ring-4 ring-base-200' : index < step ? 'border-base-200 bg-base-200 text-primary' : 'border-main-border bg-base-200 text-base-content/60'}`}
              >
                {index < step ? <CheckIcon className="size-4" /> : index + 1}
              </span>
              <span
                className={
                  index <= step
                    ? 'font-medium text-primary'
                    : 'text-base-content/60'
                }
              >
                {label}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div inert={create.isPending}>
        {step === 0 && (
          <PlanStep
            forecastMonths={forecastMonths}
            name={name}
            notes={notes}
            onContinue={() => form.handleSubmit()}
            onForecastMonthsChange={(value) =>
              form.setFieldValue('forecastMonths', value)
            }
            onNameChange={(value) => form.setFieldValue('name', value)}
            onNotesChange={(value) => form.setFieldValue('notes', value)}
          />
        )}
        {step === 0 && session && (
          <FundingSourcesEditor
            iamId={iamId}
            initialSelection={
              rosterSelected
                ? undefined
                : {
                    ids: selectedSourceIds,
                    onChange: (ids) => {
                      setSelectionTouched(true);
                      setSelectedSourceIds(ids);
                    },
                  }
            }
            onOperation={applySourceOperation}
            ref={sourceEditorRef}
            session={session}
          />
        )}
        {step === 1 && session && results && (
          <StaffingEditor
            appointmentFunding={results.appointmentFunding}
            forecastWindow={results.forecastWindow}
            onOperation={applyAppointmentOperation}
            ref={staffingEditorRef}
            results={results}
            session={session}
          />
        )}
        {step === 2 && session && (
          <ExpensesEditor
            onOperation={applyExpenseOperation}
            ref={expenseEditorRef}
            session={session}
          />
        )}
        {step === 3 && draft && results && (
          <ProjectionReviewStep
            disabled={Boolean(submitted)}
            draft={draft}
            name={name}
            notes={notes}
            onEditStep={(target) => {
              if (!submitted && !requestPending.current) {
                setReturningToReview(true);
                navigateStep(target);
              }
            }}
            onNotesChange={(value) => form.setFieldValue('notes', value)}
            results={results}
          />
        )}
      </div>

      {step === 0 && loading && (
        <p className="mt-5" role="status">
          Loading funding sources...
        </p>
      )}
      {step === 0 && !loading && !session && (
        <button
          className="btn btn-secondary mt-5"
          onClick={() => void captureFunding()}
          type="button"
        >
          Retry funding
        </button>
      )}

      {step > 0 && validationMessage && (
        <p className="mt-5 text-error" role="alert">
          {validationMessage}
        </p>
      )}
      {error && (
        <p className="mt-5 text-error" role="alert">
          {error}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-main-border pt-6">
        <button
          className="btn btn-ghost"
          onClick={() => (hasWork() ? setCancelRequested(true) : leave())}
          type="button"
        >
          Cancel setup
        </button>
        <p className="hidden text-sm text-base-content/60 lg:block">
          You can revisit every assumption in your workspace.
        </p>
        <div className="flex flex-wrap gap-3">
          {step > 0 && (
            <button
              className="btn btn-ghost"
              disabled={Boolean(submitted)}
              onClick={() => {
                if (step === 3) {
                  setReturningToReview(true);
                }
                navigateStep(step - 1);
              }}
              type="button"
            >
              <ArrowLeftIcon aria-hidden="true" className="size-4" />
              Back
            </button>
          )}
          {returningToReview && step < 3 && (
            <button
              className="btn btn-outline"
              disabled={
                Boolean(detailsValidationMessage) ||
                loading ||
                Boolean(submitted)
              }
              onClick={returnToReview}
              type="button"
            >
              Return to review
            </button>
          )}
          {step === 0 ? (
            <button
              className="btn btn-primary"
              disabled={
                loading || !session || Boolean(detailsValidationMessage)
              }
              form="projection-setup-plan"
              type="submit"
            >
              Continue
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </button>
          ) : step < 3 ? (
            <button
              className="btn btn-primary"
              onClick={() => navigateStep(step + 1)}
              type="button"
            >
              Continue
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={create.isPending || Boolean(validationMessage)}
              onClick={() => void finish()}
              type="button"
            >
              {create.isPending
                ? 'Creating...'
                : submitted
                  ? 'Retry creation'
                  : 'Create plan & open workspace'}
            </button>
          )}
        </div>
      </div>

      {(cancelRequested || blocker.status === 'blocked') && (
        <ProjectionDialog
          onClose={stay}
          title={submitted ? 'Leave while creating?' : 'Leave setup?'}
        >
          <p className="mt-4">
            {submitted
              ? 'Creation may still finish or may already have succeeded. Leaving discards this setup.'
              : 'Your setup choices and edits will be discarded.'}
          </p>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={stay} type="button">
              Stay
            </button>
            <button className="btn btn-primary" onClick={leave} type="button">
              {submitted ? 'Leave anyway' : 'Discard'}
            </button>
          </div>
        </ProjectionDialog>
      )}
    </section>
  );
}

function PlanStep({
  forecastMonths,
  name,
  notes,
  onContinue,
  onForecastMonthsChange,
  onNameChange,
  onNotesChange,
}: {
  forecastMonths: number;
  name: string;
  notes: string;
  onContinue: () => Promise<void>;
  onForecastMonthsChange: (months: number) => void;
  onNameChange: (value: string) => void;
  onNotesChange: (notes: string) => void;
}) {
  return (
    <form
      className="space-y-5"
      id="projection-setup-plan"
      onSubmit={(event) => {
        event.preventDefault();
        void onContinue();
      }}
    >
      <h2 className="text-xl font-semibold">Plan details</h2>
      <div className="grid items-start gap-5 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
          Plan name
          <input
            className="input w-full text-base"
            maxLength={MAX_PLAN_NAME_LENGTH}
            onChange={(event) => onNameChange(event.target.value)}
            required
            value={name}
          />
        </label>
        <PlanDurationField
          onChange={onForecastMonthsChange}
          value={forecastMonths}
        />
      </div>
      <PlanNotesField
        label="What are you exploring? (optional)"
        onChange={onNotesChange}
        rows={1}
        value={notes}
      />
    </form>
  );
}
