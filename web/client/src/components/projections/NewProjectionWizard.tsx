import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
import { AppointmentFundingStatus } from '@/components/projections/AppointmentFundingStatus.tsx';
import {
  selectInitialSources,
  sourceLabel,
  sourcePlanningBalance,
  type SourceOperation,
} from '@/lib/projectionSources.ts';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { SalaryEditor } from '@/components/projections/SalaryEditor.tsx';
import { HttpError } from '@/lib/api.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  createProjectionSession,
  getFundingSourceOutlook,
  setAppointmentMonthlySalary,
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

const steps = ['Funding sources', 'Staffing', 'Review'];

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
    defaultValues: { historyMonths: 3, name: '' },
    onSubmit: async () => {
      await continueSetup();
    },
  });
  const { historyMonths, name } = useStore(form.store, (state) => state.values);
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [rosterSelected, setRosterSelected] = useState(false);
  const [roster, setRoster] = useState<ProjectionRosterEntry[]>([]);
  const currentSession = useRef<ProjectionSession<ProjectionDraft> | null>(
    null
  );
  const sourceEditorRef = useRef<FundingSourcesEditorHandle>(null);
  const [step, setStep] = useState(0);
  const [session, setSession] =
    useState<ProjectionSession<ProjectionDraft> | null>(null);
  const [appointmentId, setAppointmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] =
    useState<CreateProjectionDraftRequest | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const mounted = useRef(true);
  const requestPending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const create = useCreateProjectionDraft(iamId);
  const draft = session?.draft;
  const selectedAppointment = draft?.appointments.find(
    (appointment) => appointment.id === appointmentId
  );
  const hasWork = () =>
    Boolean(
      name ||
        historyMonths !== 3 ||
        session ||
        loading ||
        submitted ||
        sourceEditorRef.current?.read()?.hasChanges
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
        const fundingSources = result.session.draft.fundingSources;
        setSelectedSourceIds((ids) => [
          ...ids.filter((id) =>
            fundingSources.some((source) => source.id === id)
          ),
          ...fundingSources
            .filter(
              (source) =>
                !previous.draft.fundingSources.some(
                  ({ id }) => id === source.id
                )
            )
            .map(({ id }) => id),
        ]);
      }
    }
    return result;
  }

  async function continueSetup() {
    if (requestPending.current || !name.trim()) {
      return;
    }
    setError(null);
    if (session) {
      if (!rosterSelected) {
        const selected = selectInitialSources(
          session,
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
      setStep(1);
      return;
    }
    requestPending.current = true;
    setLoading(true);
    try {
      const seed = await fetchProjectionSeed(iamId, historyMonths);
      if (!mounted.current) {
        return;
      }
      updateSession(
        createProjectionSession({ ...seed.draft, name: name.trim() })
      );
      setRoster(seed.roster);
      setSelectedSourceIds(seed.draft.fundingSources.map(({ id }) => id));
    } catch {
      if (mounted.current) {
        setError(
          'Could not load current portfolio data. Your setup choices are still here. Try Continue again.'
        );
      }
    } finally {
      requestPending.current = false;
      if (mounted.current) {
        setLoading(false);
      }
    }
  }

  async function finish() {
    if (!draft || requestPending.current) {
      return;
    }
    // An uncertain response locks this payload and key until the same creation is acknowledged.
    const request =
      submitted ??
      structuredClone({
        creationKey: crypto.randomUUID(),
        draft: {
          appointments: draft.appointments,
          fundingSources: draft.fundingSources,
          historyMonths,
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
    <section aria-label="New plan setup" className="mx-auto max-w-5xl py-8">
      <h1 className="text-3xl font-bold">New plan</h1>
      <ol aria-label="Plan setup progress" className="mt-6 flex gap-6">
        {steps.map((label, index) => (
          <li
            aria-current={index === step ? 'step' : undefined}
            className={index === step ? 'font-bold text-primary' : ''}
            key={label}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <h2 className="mt-8 text-2xl font-bold" ref={heading} tabIndex={-1}>
        {steps[step]}
      </h2>

      <div inert={loading || create.isPending}>
        {step === 0 && (
          <PlanStep
            historyMonths={historyMonths}
            name={name}
            onContinue={() => form.handleSubmit()}
            onHistoryMonthsChange={(value) =>
              form.setFieldValue('historyMonths', value)
            }
            onNameChange={(value) => form.setFieldValue('name', value)}
            seeded={Boolean(session)}
          />
        )}
        {step === 0 && session && (
          <FundingSourcesEditor
            iamId={iamId}
            initialSelection={
              rosterSelected
                ? undefined
                : { ids: selectedSourceIds, onChange: setSelectedSourceIds }
            }
            onOperation={applySourceOperation}
            ref={sourceEditorRef}
            session={session}
          />
        )}
        {step === 1 && draft && (
          <StaffingStep draft={draft} onEdit={setAppointmentId} />
        )}
        {step === 2 && draft && (
          <ReviewStep draft={draft} historyMonths={historyMonths} name={name} />
        )}
      </div>

      {error && (
        <p className="mt-5 text-error" role="alert">
          {error}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-5">
        <button
          className="btn btn-ghost"
          onClick={() => (hasWork() ? setCancelRequested(true) : leave())}
          type="button"
        >
          Cancel setup
        </button>
        <div className="flex gap-3">
          {step > 0 && (
            <button
              className="btn btn-ghost"
              disabled={Boolean(submitted)}
              onClick={() => {
                setError(null);
                setStep(step - 1);
              }}
              type="button"
            >
              Back
            </button>
          )}
          {step === 0 ? (
            <button
              className="btn btn-primary"
              disabled={loading || !name.trim()}
              form="projection-setup-plan"
              type="submit"
            >
              {loading
                ? 'Loading snapshot...'
                : session
                  ? 'Continue'
                  : 'Load funding sources'}
            </button>
          ) : step === 1 ? (
            <button
              className="btn btn-primary"
              onClick={() => setStep(2)}
              type="button"
            >
              Continue
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={create.isPending}
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

      {selectedAppointment && session && (
        <SalaryEditor
          appointment={selectedAppointment}
          key={selectedAppointment.id}
          onApply={(change) => {
            const updated = setAppointmentMonthlySalary(session, change);
            if (updated.ok) {
              updateSession(updated.session);
            } else {
              setError(updated.error);
            }
          }}
          onClose={() => setAppointmentId(null)}
          snapshotMonth={session.draft.seededAt.slice(0, 7)}
        />
      )}
      {(cancelRequested || blocker.status === 'blocked') && (
        <ProjectionDialog
          onClose={stay}
          title={submitted ? 'Leave while creating?' : 'Leave setup?'}
        >
          <p className="mt-4">
            {submitted
              ? 'Creation may still finish or may already have succeeded. Leaving discards this setup.'
              : 'Your setup choices and salary edits will be discarded.'}
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
  historyMonths,
  name,
  onContinue,
  onHistoryMonthsChange,
  onNameChange,
  seeded,
}: {
  historyMonths: number;
  name: string;
  onContinue: () => Promise<void>;
  onHistoryMonthsChange: (value: number) => void;
  onNameChange: (value: string) => void;
  seeded: boolean;
}) {
  return (
    <form
      className="mt-5 space-y-5"
      id="projection-setup-plan"
      onSubmit={(event) => {
        event.preventDefault();
        void onContinue();
      }}
    >
      <label className="flex max-w-xl flex-col gap-2">
        Plan name
        <input
          className="input input-bordered w-full"
          maxLength={200}
          onChange={(event) => onNameChange(event.target.value)}
          required
          value={name}
        />
      </label>
      <label className="flex max-w-xs flex-col gap-2">
        Averaging window
        <select
          className="select select-bordered"
          disabled={seeded}
          onChange={(event) =>
            onHistoryMonthsChange(Number(event.target.value))
          }
          value={historyMonths}
        >
          <option value={3}>3 months</option>
          <option value={6}>6 months</option>
          <option value={12}>12 months</option>
        </select>
      </label>
      {seeded && (
        <p className="text-sm">
          Cancel setup to choose another averaging window.
        </p>
      )}
    </form>
  );
}

function StaffingStep({
  draft,
  onEdit,
}: {
  draft: ProjectionDraft;
  onEdit: (appointmentId: number) => void;
}) {
  const funding = useMemo(
    () => computePiProjection(draft).appointmentFunding,
    [draft]
  );
  return (
    <div className="mt-5 space-y-4">
      <p>Review full-time salary rates before creating the plan.</p>
      {draft.appointments.length === 0 && (
        <p>No appointments in this snapshot.</p>
      )}
      {draft.appointments.map((appointment) => (
        <article
          className="rounded-box border border-base-300 p-5"
          key={appointment.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">{appointment.name}</h3>
              <p className="text-sm">
                {appointment.title} · {appointment.fte * 100}% appointment FTE
              </p>
              <p className="mt-3">
                {appointment.monthlySalary === null
                  ? 'Salary needs input'
                  : `${formatCurrency(appointment.monthlySalary * 12)} per year at full time`}
              </p>
              <AppointmentFundingStatus
                appointment={appointment}
                months={funding}
                snapshotMonth={draft.seededAt.slice(0, 7)}
              />
            </div>
            <button
              className="btn btn-outline"
              id={`salary-appointment-${appointment.id}`}
              onClick={() => onEdit(appointment.id)}
              type="button"
            >
              Edit salary for {appointment.name}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReviewStep({
  draft,
  historyMonths,
  name,
}: {
  draft: ProjectionDraft;
  historyMonths: number;
  name: string;
}) {
  const results = useMemo(() => computePiProjection(draft), [draft]);
  return (
    <div className="mt-5">
      <h3 className="text-xl font-bold">{name.trim()}</h3>
      <p className="mt-2">
        Plan started {draft.seededAt.slice(0, 10)}. Source capture dates are
        shown below.
      </p>
      <p className="mt-1 text-sm">{historyMonths}-month spending history.</p>
      <h3 className="mt-6 text-xl font-bold">Funding outlook</h3>
      {draft.fundingSources.length === 0 && (
        <p className="mt-3">No eligible funding sources in this snapshot.</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {draft.fundingSources.map((source) => {
          const months = getFundingSourceOutlook(results.rows, source.id);
          const snapshotBalance = sourcePlanningBalance(source);
          const endBalance = months.at(-1)?.remaining ?? snapshotBalance;
          return (
            <article
              className="rounded-box border border-base-300 p-5"
              key={source.id}
            >
              <h4 className="text-lg font-bold">{sourceLabel(source)}</h4>
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
                  <dt>Planning balance</dt>
                  <dd>{formatCurrency(snapshotBalance)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Remaining forecast</dt>
                  <dd>
                    {formatCurrency(
                      months.reduce((sum, month) => sum + month.forecast, 0)
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 font-bold">
                  <dt>Projected end balance</dt>
                  <dd className={endBalance < 0 ? 'text-error' : ''}>
                    {formatCurrency(endBalance)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
