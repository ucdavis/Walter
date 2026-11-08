import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { SalaryEditor } from '@/components/projections/SalaryEditor.tsx';
import { HttpError } from '@/lib/api.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  createProjectionSession,
  getProjectOutlook,
  setJobMonthlySalary,
  type ProjectionSession,
} from '@/lib/projectionWorkspace.ts';
import {
  fetchProjectionSeed,
  useCreateProjectionDraft,
  type CreateProjectionDraftRequest,
  type Projection,
} from '@/queries/projections.ts';

const steps = ['Plan', 'Staffing', 'Review'];

export function NewProjectionWizard({
  iamId,
  onCancel,
  onCreated,
}: {
  iamId: string;
  onCancel: () => void;
  onCreated: (saved: Projection) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [historyMonths, setHistoryMonths] = useState(3);
  const [step, setStep] = useState(0);
  const [session, setSession] = useState<ProjectionSession | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
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
  const selectedJob = draft?.jobs.find((job) => job.id === jobId);
  const hasWork = () =>
    Boolean(name || historyMonths !== 3 || session || loading || submitted);
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

  async function continueSetup() {
    if (requestPending.current || !name.trim()) {
      return;
    }
    setError(null);
    if (session) {
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
      setSession(createProjectionSession({ ...seed, name: name.trim() }));
      setStep(1);
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
          jobs: draft.jobs,
          projects: draft.projects,
          seededAt: draft.seededAt,
        },
        historyMonths,
        name: name.trim(),
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
            onContinue={continueSetup}
            onHistoryMonthsChange={setHistoryMonths}
            onNameChange={setName}
            seeded={Boolean(session)}
          />
        )}
        {step === 1 && draft && (
          <StaffingStep draft={draft} onEdit={setJobId} />
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
              {loading ? 'Loading snapshot...' : 'Continue'}
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

      {selectedJob && session && (
        <SalaryEditor
          job={selectedJob}
          key={selectedJob.id}
          onApply={(change) => {
            const updated = setJobMonthlySalary(session, change);
            if (updated.ok) {
              setSession(updated.session);
            } else {
              setError(updated.error);
            }
          }}
          onClose={() => setJobId(null)}
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
  draft: Projection;
  onEdit: (jobId: number) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <p>Review full-time salary rates before creating the plan.</p>
      {draft.jobs.length === 0 && <p>No appointments in this snapshot.</p>}
      {draft.jobs.map((job) => (
        <article
          className="rounded-box border border-base-300 p-5"
          key={job.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">{job.name}</h3>
              <p className="text-sm">
                {job.title} · {job.fte * 100}% appointment FTE
              </p>
              <p className="mt-3">
                {job.monthlySalary === null
                  ? 'Salary needs input'
                  : `${formatCurrency(job.monthlySalary * 12)} per year at full time`}
              </p>
            </div>
            <button
              className="btn btn-outline"
              id={`salary-job-${job.id}`}
              onClick={() => onEdit(job.id)}
              type="button"
            >
              Edit salary for {job.name}
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
  draft: Projection;
  historyMonths: number;
  name: string;
}) {
  const results = useMemo(() => computePiProjection(draft), [draft]);
  return (
    <div className="mt-5">
      <h3 className="text-xl font-bold">{name.trim()}</h3>
      <p className="mt-2">Fixed snapshot {draft.seededAt.slice(0, 10)}.</p>
      <p className="mt-1 text-sm">{historyMonths}-month spending history.</p>
      <h3 className="mt-6 text-xl font-bold">Project outlook</h3>
      {draft.projects.length === 0 && (
        <p className="mt-3">No eligible projects in this snapshot.</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {draft.projects.map((project) => {
          const months = getProjectOutlook(results.rows, project.id);
          const snapshotBalance = project.budgets.reduce(
            (sum, budget) =>
              sum + budget.budget - budget.spentToDate - budget.committed,
            0
          );
          const endBalance = months.at(-1)?.remaining ?? snapshotBalance;
          return (
            <article
              className="rounded-box border border-base-300 p-5"
              key={project.id}
            >
              <h4 className="text-lg font-bold">{project.projectName}</h4>
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
