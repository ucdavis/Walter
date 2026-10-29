import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BanknotesIcon,
  ChartBarIcon,
  CheckIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import type { ProjectionLookups } from '@/queries/projections.ts';
import {
  planSections,
  type PlanSection,
  type PlanView,
} from '@/components/guidedProjections/navigation.ts';
import { withHistoryMonths } from '@/components/guidedProjections/serverPlan.ts';
import type { ProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import { monthLabel } from '@/components/projections/projection.ts';
import {
  ExpenseEditor,
  FundingEditor,
  MiniChart,
  ReviewItem,
} from '@/components/guidedProjections/PlanEditors.tsx';
import { money, shortMoney } from '@/components/guidedProjections/defaults.ts';
import {
  planValidation,
  readSavedPlans,
} from '@/components/guidedProjections/savedPlans.ts';
import {
  createProjectionPlan,
  projectGuidedPlan,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';
import PlansSidebar from '@/components/guidedProjections/PlansSidebar.tsx';
import SplitStaffEditor from '@/components/guidedProjections/SplitStaffEditor.tsx';
import {
  LiveResults,
  ProjectDetail,
} from '@/components/guidedProjections/ProjectOutlook.tsx';

type Section =
  | 'Overview'
  | 'Plan details'
  | 'Funding'
  | 'Staffing'
  | 'Expenses';
type Result = ReturnType<typeof projectGuidedPlan>;
const sections: { icon: typeof ChartBarIcon; name: Section }[] = [
  { icon: ChartBarIcon, name: 'Overview' },
  { icon: Cog6ToothIcon, name: 'Plan details' },
  { icon: BanknotesIcon, name: 'Funding' },
  { icon: UserGroupIcon, name: 'Staffing' },
  { icon: ListBulletIcon, name: 'Expenses' },
];
const defaultPlanId = 'walter-default-plan';
const steps = ['Plan & funding', 'Staffing', 'Other expenses', 'Review'];

export type RemotePlans = {
  baseline?: ProjectionPlan;
  initialPlanId?: string;
  lookups?: ProjectionLookups;
  onDirtyChange: (dirty: boolean, inWorkspace: boolean) => void;
  onNavigate: (planId?: string) => void;
  onViewChange?: (view: PlanView) => void;
  plans: ProjectionPlan[];
  save: (plan: ProjectionPlan, isNew: boolean) => Promise<ProjectionPlan>;
  view?: PlanView;
};

export default function GuidedProjections({
  initialPlan,
  remote,
}: {
  initialPlan?: ProjectionDemoPlan;
  remote?: RemotePlans;
}) {
  // Browser storage is exclusively for the synthetic demo, never real personnel data.
  const storageKey = initialPlan
    ? `walter-hybrid-v1-${initialPlan.asOf}-${initialPlan.fundingSources.map((fund) => fund.startingBalance).join('-')}`
    : '';
  const baseline = remote
    ? (remote.baseline ?? remote.plans[0])
    : createProjectionPlan(initialPlan!, 'Default plan');
  const [plans, setPlans] = useState(() => {
    if (remote) {
      return [
        ...(remote.baseline ? [{ ...remote.baseline, id: defaultPlanId }] : []),
        ...remote.plans,
      ];
    }
    const saved = readSavedPlans(initialPlan!, storageKey);
    return saved.some((plan) => plan.id === defaultPlanId)
      ? saved
      : [{ ...baseline, id: defaultPlanId }, ...saved];
  });
  const initialSavedPlan = plans.find(
    (plan) => plan.id === remote?.initialPlanId
  );
  const [draft, setDraft] = useState(() =>
    structuredClone(initialSavedPlan ?? baseline)
  );
  const [screen, setScreen] = useState<'home' | 'setup' | 'workspace'>(
    initialSavedPlan ? 'workspace' : 'home'
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const onDirtyChange = remote?.onDirtyChange;
  useEffect(() => {
    onDirtyChange?.(dirty || saving, screen === 'workspace');
  }, [dirty, saving, onDirtyChange, screen]);
  const [localView, setLocalView] = useState<PlanView>({});
  const view = remote?.view ?? localView;
  const section: Section = planSections[view.section ?? 'overview'];
  const projectId = view.project ?? null;
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const result = projectGuidedPlan(draft);
  const error = planValidation(draft);
  const selectedProject = result.funds.find((fund) => fund.id === projectId);

  function persist(next: ProjectionPlan[]) {
    setPlans(next);
    if (remote) {
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }

  function update(next: ProjectionPlan) {
    setDraft(next);
    if (remote) {
      setDirty(true);
      setSaveError(null);
    } else if (screen === 'workspace') {
      persist(plans.map((plan) => (plan.id === next.id ? next : plan)));
    }
  }

  function scrollToHeading() {
    requestAnimationFrame(() => {
      layout.current?.scrollIntoView({ block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
  }

  function canLeave() {
    return (
      !saving &&
      (!remote ||
        !dirty ||
        window.confirm('Discard your unsaved plan changes?'))
    );
  }

  function home() {
    if (!canLeave()) {
      return;
    }
    setDirty(false);
    setSaveError(null);
    setScreen('home');
    remote?.onNavigate();
    scrollToHeading();
  }

  function open(plan: ProjectionPlan) {
    if (screen === 'workspace' && draft.id === plan.id) {
      goToSection('Overview');
      return;
    }
    if (!canLeave()) {
      return;
    }
    showPlan(plan);
  }

  function showPlan(plan: ProjectionPlan) {
    setDirty(false);
    setSaveError(null);
    setDraft(structuredClone(plan));
    setLocalView({});
    setScreen('workspace');
    remote?.onNavigate(plan.id);
    scrollToHeading();
  }

  function start() {
    if (!canLeave() || (remote && !remote.baseline)) {
      return;
    }
    setDirty(false);
    setSaveError(null);
    setDraft(
      remote
        ? {
            ...structuredClone(remote.baseline!),
            id: crypto.randomUUID(),
            name: 'My next plan',
          }
        : createProjectionPlan(initialPlan!, 'My next plan')
    );
    setStep(0);
    setVisited(0);
    setScreen('setup');
    scrollToHeading();
  }

  function goToSection(next: Section) {
    changeView({
      project: next === 'Overview' ? undefined : view.project,
      section:
        next === 'Overview'
          ? undefined
          : (Object.keys(planSections) as PlanSection[]).find(
              (key) => planSections[key] === next
            ),
    });
    scrollToHeading();
  }

  function changeView(next: PlanView) {
    setLocalView(next);
    remote?.onViewChange?.(next);
  }

  function viewProject(id: string | null) {
    changeView({ project: id ?? undefined });
    scrollToHeading();
  }

  async function save(plan = draft, isNew = false) {
    if (!remote || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await remote.save(
        plan,
        isNew ||
          !plans.some((row) => row.id === plan.id) ||
          plan.id === defaultPlanId
      );
      setPlans((current) =>
        current.some((row) => row.id === saved.id)
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved]
      );
      if (saved.id === draft.id && screen === 'workspace') {
        setDraft(structuredClone(saved));
        setDirty(false);
      } else {
        showPlan(saved);
      }
    } catch {
      setSaveError(
        'Could not save this plan. Your changes are still here. Try saving again.'
      );
    } finally {
      setSaving(false);
    }
  }

  function duplicate() {
    const copy = {
      ...structuredClone(draft),
      id: crypto.randomUUID(),
      name: `${draft.name} copy`,
    };
    if (remote) {
      void save(copy, true);
    } else {
      persist([...plans, copy]);
      open(copy);
    }
  }

  function nextStep() {
    if (step === 3) {
      if (remote) {
        void save(draft, true);
      } else {
        persist([...plans, draft]);
        open(draft);
      }
    } else {
      setStep(step + 1);
      setVisited(Math.max(visited, step + 1));
      scrollToHeading();
    }
  }

  const storageText = remote
    ? saving
      ? 'Saving...'
      : dirty
        ? 'Unsaved changes'
        : draft.id === defaultPlanId
          ? 'Current snapshot. Save to keep this plan.'
          : 'Saved in Walter'
    : storageAvailable
      ? 'Saved in this browser'
      : 'Browser storage unavailable. Changes last for this session.';

  if (screen === 'setup') {
    return (
      <div
        className="container scroll-mt-24 [&_button:enabled]:cursor-pointer"
        ref={layout}
      >
        <div className="bg-base-100 pt-6 pb-12 text-base leading-normal text-base-content">
          <div className="mx-auto max-w-4xl">
            <button
              className="inline-flex items-center gap-2 py-2 text-sm text-base-content/70 transition-colors hover:text-primary"
              onClick={home}
              type="button"
            >
              <ArrowLeftIcon className="size-5 shrink-0" /> All plans
            </button>
            <header className="mt-6 mb-8">
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
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-base-content/70">
                {
                  [
                    'Your current funding and people are already filled in.',
                    'Keep current appointments or adjust them for this plan.',
                    'Add supplies, travel, or a one-time purchase. You can also skip this step.',
                    'Check your assumptions, then open a workspace where results update as you edit.',
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
                  className="relative flex-1 not-last:after:absolute not-last:after:top-4 not-last:after:right-[calc(-50%+1.75rem)] not-last:after:left-[calc(50%+1.75rem)] not-last:after:h-px not-last:after:bg-main-border"
                  key={label}
                >
                  <button
                    aria-current={index === step ? 'step' : undefined}
                    className={`relative z-10 mx-auto flex cursor-pointer flex-col items-center gap-3 px-1 text-xs text-balance disabled:cursor-not-allowed sm:text-sm ${index <= step ? 'font-medium text-primary' : 'text-base-content/60'}`}
                    disabled={index > visited}
                    onClick={() => {
                      setStep(index);
                      scrollToHeading();
                    }}
                    type="button"
                  >
                    <span
                      className={`grid size-8 place-items-center rounded-full border text-sm font-semibold ${index === step ? 'border-primary bg-primary text-primary-content ring-4 ring-base-200' : index < step ? 'border-base-200 bg-base-200 text-primary' : 'border-main-border bg-base-200'}`}
                    >
                      {index < step ? (
                        <CheckIcon className="size-4 shrink-0" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
            <section aria-label={steps[step]} inert={saving}>
              {step === 0 && (
                <>
                  <h2 className="mb-5 text-xl font-semibold">Plan details</h2>
                  <PlanDetails plan={draft} update={update} />
                  <FundingEditor
                    plan={draft}
                    update={(next) =>
                      update({
                        ...draft,
                        funding: next.funding,
                        selectedFunding: next.selectedFunding,
                      })
                    }
                  />
                </>
              )}
              {step === 1 && (
                <SplitStaffEditor
                  lookups={remote?.lookups}
                  plan={draft}
                  update={update}
                />
              )}
              {step === 2 && (
                <ExpenseEditor
                  lookups={remote?.lookups}
                  plan={draft}
                  update={(next) =>
                    update({ ...draft, expenses: next.expenses })
                  }
                />
              )}
              {step === 3 && (
                <>
                  <div className="mb-6 text-center [&>h2]:my-2 [&>h2]:text-2xl [&>h2]:font-bold [&>p]:text-sm [&>p]:text-base-content/70">
                    <span className="inline-flex items-center rounded px-2 py-1 text-sm font-semibold bg-base-200 text-primary">
                      {draft.months}-month plan
                    </span>
                    <h2>{draft.name}</h2>
                    <p>
                      {draft.note ||
                        `Starting from the ${monthLabel(draft.startMonth)} Walter snapshot.`}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <ReviewItem
                      detail={`${money(result.starting)} available`}
                      edit={() => setStep(0)}
                      icon={BanknotesIcon}
                      label="Funding"
                      value={`${draft.selectedFunding.length} projects`}
                    />
                    <ReviewItem
                      detail={`${money(result.personnel)} projected cost`}
                      edit={() => setStep(1)}
                      icon={UserGroupIcon}
                      label="Staffing"
                      value={`${draft.staff.filter((person) => person.included).length} people`}
                    />
                    <ReviewItem
                      detail={`${money(result.other)} direct costs`}
                      edit={() => setStep(2)}
                      icon={ListBulletIcon}
                      label="Other expenses"
                      value={`${draft.expenses.length} ${draft.expenses.length === 1 ? 'expense' : 'expenses'}`}
                    />
                  </div>
                  <div className="pt-6">
                    <ShortfallSummary
                      incomplete={hasMissingInputs(draft)}
                      onReview={() => setStep(1)}
                      result={result}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-main-border pt-5 [&>span]:text-sm [&>span]:text-base-content/70 [&>strong]:text-3xl">
                    <span>Combined ending balance</span>
                    <strong className={result.ending < 0 ? 'text-error' : ''}>
                      {money(result.ending)}
                    </strong>
                  </div>
                </>
              )}
            </section>
            {saveError && (
              <p className="mt-4 text-error" role="alert">
                {saveError}
              </p>
            )}
            <footer className="mt-8 grid grid-cols-2 items-center gap-4 border-t border-main-border pt-6 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <button
                className="btn btn-ghost justify-self-start text-base-content/70"
                onClick={() => {
                  if (step === 0) {
                    home();
                  } else {
                    setStep(step - 1);
                    scrollToHeading();
                  }
                }}
                type="button"
              >
                {step === 0 ? 'Cancel setup' : 'Back'}
              </button>
              <span
                className={`order-3 col-span-2 text-center text-sm leading-relaxed sm:order-none sm:col-span-1 ${error ? 'text-error' : 'text-base-content/60'}`}
              >
                {error || 'You can revisit every assumption in your workspace.'}
              </span>
              <button
                className="btn btn-primary h-auto min-h-12 justify-self-end py-3 text-center whitespace-normal"
                disabled={Boolean(error) || saving}
                onClick={nextStep}
                type="button"
              >
                {saving
                  ? 'Saving...'
                  : step === 3
                    ? 'Create plan & open workspace'
                    : 'Continue'}
                <ArrowRightIcon className="size-5 shrink-0" />
              </button>
            </footer>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container scroll-mt-24 bg-base-100 text-base leading-normal text-base-content [&_button:enabled]:cursor-pointer"
      ref={layout}
    >
      <div className="flex flex-col gap-6 pt-6 pb-12 md:flex-row md:gap-8">
        <PlansSidebar
          canCreate={!remote || Boolean(remote.baseline)}
          currentPlanId={screen === 'workspace' ? draft.id : null}
          defaultPlan={plans.find((plan) => plan.id === defaultPlanId)}
          onCreate={start}
          onHome={home}
          onOpen={open}
          plans={plans.filter((plan) => plan.id !== defaultPlanId)}
        />
        <div className="@container min-w-0 flex-1">
          <div className="py-6">
            {remote && !remote.baseline && (
              <p className="alert mb-4" role="alert">
                Current portfolio data could not be loaded. You can edit saved
                plans. Reload the page to try creating a plan from current data.
              </p>
            )}
            {remote && !remote.lookups && (
              <p className="alert mb-4" role="status">
                Job-code and expense-category lookups are unavailable. You can
                still edit the values in this plan.
              </p>
            )}
            {screen === 'home' ? (
              <>
                <header className="mb-6 flex flex-wrap items-start justify-between gap-4 md:items-center">
                  <div>
                    <h1 className="h1 outline-none" ref={heading} tabIndex={-1}>
                      {initialPlan
                        ? `${initialPlan.ownerName}'s Projections`
                        : 'Portfolio projections'}
                    </h1>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={Boolean(remote && !remote.baseline)}
                    onClick={start}
                    type="button"
                  >
                    <PlusIcon className="size-5 shrink-0" /> New plan
                  </button>
                </header>
                {(!remote || remote.baseline) && (
                  <div className="card mb-8 grid grid-cols-1 gap-6 border border-main-border bg-base-200 p-6 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="flex flex-col gap-1 border-b border-main-border pb-4 @3xl:border-e @3xl:border-b-0 @3xl:pb-0">
                      <span className="stat-label text-base">
                        Available across active projects
                      </span>
                      <strong className="text-3xl font-bold">
                        {money(
                          baseline.funding.reduce(
                            (total, fund) => total + fund.startingBalance,
                            0
                          )
                        )}
                      </strong>
                      <small className="text-sm text-base-content/70">
                        From your Walter snapshot
                      </small>
                    </div>
                    <div className="flex flex-col justify-center gap-5 text-base">
                      {baseline.funding.map((fund) => (
                        <div
                          className="flex items-center justify-between gap-4"
                          key={fund.id}
                        >
                          <span className="flex items-center gap-2">
                            <i
                              className="block size-1.5 shrink-0 rounded-full"
                              style={{ background: fund.color }}
                            />
                            {fund.name}
                          </span>
                          <strong>{shortMoney(fund.startingBalance)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="h2">
                    Your plans{' '}
                    <span className="ms-2 rounded bg-base-200 px-2 py-0.5 text-sm font-medium">
                      {plans.length}
                    </span>
                  </h2>
                  <span className="hidden text-sm text-base-content/70 sm:block">
                    Separate assumptions for each plan
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
                  {plans.map((plan) => {
                    const projection = projectGuidedPlan(plan);
                    return (
                      <button
                        className="min-w-0 rounded-box border border-main-border p-6 text-left transition-[border-color,box-shadow] hover:border-base-content/70 hover:shadow-sm motion-reduce:transition-none [&>p]:mt-2 [&>p]:min-h-10"
                        key={plan.id}
                        onClick={() => open(plan)}
                        type="button"
                      >
                        <h3 className="text-xl font-semibold">{plan.name}</h3>
                        <p className="text-base">
                          {plan.note ||
                            'A plan based on your current Walter snapshot.'}
                        </p>
                        <MiniChart
                          values={projection.chart.map(
                            (point) => point.balance
                          )}
                        />
                        <div className="flex items-baseline justify-between gap-3 [&>span]:text-base-content/70">
                          <span className="text-sm">Ending balance</span>
                          <strong
                            className={`text-xl font-medium ${projection.ending < 0 ? 'text-error' : ''}`}
                          >
                            {money(projection.ending)}
                          </strong>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-main-border pt-3.5 text-base-content/70 [&>span:last-child]:flex [&>span:last-child]:items-center [&>span:last-child]:gap-1.5 [&>span:last-child]:text-primary text-sm">
                          <span>
                            {plan.months} months ·{' '}
                            {
                              plan.staff.filter((person) => person.included)
                                .length
                            }{' '}
                            people
                          </span>
                          <span>
                            Open plan{' '}
                            <ArrowRightIcon className="size-5 shrink-0" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  <button
                    className="min-w-0 rounded-box border border-main-border p-6 text-left transition-[border-color,box-shadow] hover:border-base-content/70 hover:shadow-sm motion-reduce:transition-none [&>p]:mt-2 [&>p]:min-h-10 flex min-h-60 flex-col items-start justify-center border-dashed [&>svg]:mb-4 [&>svg]:size-6 [&>svg]:text-primary [&>span]:mt-4 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span]:text-primary"
                    disabled={Boolean(remote && !remote.baseline)}
                    onClick={start}
                    type="button"
                  >
                    <PlusIcon className="size-5 shrink-0" />
                    <h3 className="text-xl font-semibold">
                      Explore another possibility
                    </h3>
                    <p className="text-base">
                      Four short steps, with your funding and staffing already
                      filled in.
                    </p>
                    <span className="text-sm">
                      Create a plan{' '}
                      <ArrowRightIcon className="size-5 shrink-0" />
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  className="mb-4 inline-flex items-center gap-2 text-sm text-primary"
                  onClick={home}
                  type="button"
                >
                  <ArrowLeftIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  All plans
                </button>
                <ShortfallSummary
                  incomplete={hasMissingInputs(draft)}
                  onProject={viewProject}
                  onReview={() => goToSection('Staffing')}
                  result={result}
                />
                <header className="mb-6 flex flex-wrap items-start justify-between gap-4 md:items-center">
                  <div>
                    <h1 className="h1 outline-none" ref={heading} tabIndex={-1}>
                      {draft.name || 'Untitled plan'}
                    </h1>
                    <p className="subtitle">
                      {monthLabel(draft.startMonth)} onward · {draft.months}{' '}
                      months{' '}
                      <span className="mt-1 block text-base-content/70 xl:ms-4 xl:mt-0 xl:inline">
                        {storageText}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {remote && (
                      <button
                        className="btn btn-primary"
                        disabled={Boolean(error) || saving}
                        onClick={() => void save()}
                        type="button"
                      >
                        {saving ? 'Saving...' : 'Save plan'}
                      </button>
                    )}
                    <button
                      className="btn btn-outline"
                      disabled={saving || (Boolean(remote) && Boolean(error))}
                      onClick={duplicate}
                      type="button"
                    >
                      <DocumentDuplicateIcon className="size-5 shrink-0" />{' '}
                      Duplicate plan
                    </button>
                  </div>
                </header>
                {saveError && (
                  <p className="mb-4 text-error" role="alert">
                    {saveError}
                  </p>
                )}
                <nav
                  aria-label="Plan sections"
                  className="mb-6 overflow-x-auto"
                >
                  <div className="join flex w-full">
                    {sections.map(({ icon: Icon, name }) => (
                      <button
                        aria-current={section === name ? 'page' : undefined}
                        className={`btn join-item flex-1 gap-2 px-3 text-base whitespace-nowrap ${section === name ? 'btn-primary' : 'btn-outline border-main-border'}`}
                        key={name}
                        onClick={() => goToSection(name)}
                        type="button"
                      >
                        <Icon aria-hidden="true" className="size-5 shrink-0" />
                        {name}
                      </button>
                    ))}
                  </div>
                </nav>
                <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <section
                    aria-label={`${section} editor`}
                    className="min-w-0 text-base"
                    inert={saving}
                  >
                    {(selectedProject || section !== 'Overview') && (
                      <button
                        className="mb-4 inline-flex items-center gap-2 text-sm text-primary"
                        onClick={() => goToSection('Overview')}
                        type="button"
                      >
                        <ArrowLeftIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        Back to all projects
                      </button>
                    )}
                    {section === 'Overview' &&
                      (selectedProject ? (
                        <ProjectDetail
                          fund={selectedProject}
                          onStaffing={() => goToSection('Staffing')}
                        />
                      ) : (
                        <Overview
                          onProject={viewProject}
                          onSection={goToSection}
                          plan={draft}
                          result={result}
                        />
                      ))}
                    {section === 'Plan details' && (
                      <>
                        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1">
                          <div>
                            <h2 className="text-xl font-semibold">
                              Plan details
                            </h2>
                            <p className="text-sm leading-relaxed text-base-content/70">
                              Change the name, horizon, or purpose of this plan.
                            </p>
                          </div>
                        </div>
                        <PlanDetails plan={draft} update={update} />
                      </>
                    )}
                    {section === 'Funding' && (
                      <FundingEditor
                        plan={draft}
                        update={(next) =>
                          update({
                            ...draft,
                            funding: next.funding,
                            selectedFunding: next.selectedFunding,
                          })
                        }
                      />
                    )}
                    {section === 'Staffing' && (
                      <SplitStaffEditor
                        lookups={remote?.lookups}
                        plan={draft}
                        update={update}
                      />
                    )}
                    {section === 'Expenses' && (
                      <ExpenseEditor
                        lookups={remote?.lookups}
                        plan={draft}
                        update={(next) =>
                          update({ ...draft, expenses: next.expenses })
                        }
                      />
                    )}
                    {error && (
                      <p
                        className="mt-4 rounded-md bg-error/10 p-3 text-error text-sm"
                        role="status"
                      >
                        {error}
                      </p>
                    )}
                  </section>
                  <div className="@4xl:sticky @4xl:top-24 min-w-0">
                    <LiveResults
                      incomplete={hasMissingInputs(draft)}
                      onProject={viewProject}
                      projectId={projectId}
                      result={result}
                    />
                    <p className="mt-4 text-sm leading-relaxed text-base-content/70">
                      {remote
                        ? 'Uses PPM project/task budgets and costs, UCPath staffing, and historical spending averages. Salary, benefits, vacation accrual, COLA, and fee remission follow each job’s assumptions.'
                        : 'Salary, fringe, and indirect costs are included. Other expenses use direct costs only in this demo.'}
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-base-content/70">
                      {remote
                        ? 'Save plan stores this scenario in Walter. Project accounting records are unchanged.'
                        : 'Demo plans are saved in this browser and do not update Walter project records.'}
                    </p>
                  </div>
                </div>
              </>
            )}
            {screen === 'home' && (
              <p className="mt-4 text-sm leading-relaxed text-base-content/70 text-sm">
                {remote
                  ? 'Plans are shared with people who can access this PI’s portfolio. Use Save plan to keep your changes.'
                  : 'Demo plans are saved in this browser and do not update Walter project records.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanDetails({
  plan,
  update,
}: {
  plan: ProjectionPlan;
  update: (plan: ProjectionPlan) => void;
}) {
  return (
    <div className="@container mb-8">
      {plan.serverProjection && (
        <label className="mb-5 flex flex-col gap-2 text-sm font-medium">
          Spending average
          <select
            className="select w-full"
            onChange={(event) =>
              update(withHistoryMonths(plan, Number(event.target.value)))
            }
            value={plan.historyMonths}
          >
            <option value={3}>Previous 3 months</option>
            <option value={6}>Previous 6 months</option>
            <option value={12}>Previous 12 months</option>
          </select>
          <span className="font-normal text-base-content/70">
            Changing the window replaces expenses based on historical spending.
            Monthly and one-time expenses stay as entered.
          </span>
        </label>
      )}
      <div className="mb-5 grid grid-cols-1 gap-5 @xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
          Plan name
          <input
            className="input w-full text-base"
            maxLength={200}
            onChange={(event) => update({ ...plan, name: event.target.value })}
            value={plan.name}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
          Planning period
          <select
            className="select w-full text-base"
            onChange={(event) =>
              update({ ...plan, months: Number(event.target.value) })
            }
            value={plan.months}
          >
            <option value={6}>Next 6 months</option>
            <option value={12}>Next 12 months</option>
            <option value={18}>Next 18 months</option>
          </select>
        </label>
      </div>
      <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
        <span className="flex flex-wrap items-baseline gap-2">
          What are you exploring?{' '}
          <span className="text-sm font-normal text-base-content/70">
            Optional
          </span>
        </span>
        <input
          className="input w-full text-base"
          maxLength={2000}
          onChange={(event) => update({ ...plan, note: event.target.value })}
          placeholder="For example, supplies for next field season"
          value={plan.note}
        />
      </label>
    </div>
  );
}

function hasMissingInputs(plan: ProjectionPlan) {
  return plan.staff.some(
    (person) =>
      person.included &&
      person.serverJob &&
      (person.salaryMissing || person.serverJob.cbrRate === null)
  );
}

function ShortfallSummary({
  incomplete = false,
  onProject,
  onReview,
  result,
}: {
  incomplete?: boolean;
  onProject?: (id: string) => void;
  onReview: () => void;
  result: Result;
}) {
  const gaps = result.funds
    .filter((fund) => fund.firstDeficit)
    .sort((a, b) => a.firstDeficit!.localeCompare(b.firstDeficit!));
  const first = gaps[0];
  return (
    <div
      aria-label="Funding summary"
      className={`alert alert-soft mb-6 ${first ? 'alert-error' : incomplete ? 'alert-warning' : 'alert-success'}`}
      role="status"
    >
      {first ? (
        <ExclamationTriangleIcon
          aria-hidden="true"
          className="size-5 shrink-0"
        />
      ) : (
        <CheckIcon aria-hidden="true" className="size-5 shrink-0" />
      )}
      <div className="min-w-0">
        <span className="block font-semibold">
          {first
            ? `First project shortfall: ${monthLabel(first.firstDeficit!)}`
            : incomplete
              ? 'Staffing costs are incomplete.'
              : 'Your plan stays within the selected funding.'}
        </span>
        <span className="block text-sm">
          {first ? (
            <>
              <strong>{first.name}</strong> ends {money(Math.abs(first.ending))}{' '}
              below zero.{' '}
              {gaps.length > 1
                ? `${gaps.length} projects need attention.`
                : 'Other project balances do not automatically cover this gap.'}
            </>
          ) : incomplete ? (
            'Review missing salary and benefit rates before relying on these balances.'
          ) : (
            'Each included project covers its planned costs over this horizon.'
          )}
        </span>
      </div>
      {first && (
        <button
          className="btn btn-outline btn-sm"
          onClick={() => (onProject ? onProject(first.id) : onReview())}
          type="button"
        >
          {onProject ? 'Explore project' : 'Review staffing'}{' '}
          <ArrowRightIcon className="size-5 shrink-0" />
        </button>
      )}
    </div>
  );
}

function Overview({
  onProject,
  onSection,
  plan,
  result,
}: {
  onProject: (id: string) => void;
  onSection: (section: Section) => void;
  plan: ProjectionPlan;
  result: Result;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1 text-base">
        <div>
          <h2 className="text-xl font-semibold">Your plan at a glance</h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Review the assumptions behind this outlook.
          </p>
        </div>
      </div>
      <div className="fancy-data">
        <dl className="grid grid-cols-3 gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="stat-label text-sm">People included</dt>
            <dd className="stat-value">
              {plan.staff.filter((person) => person.included).length}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="stat-label text-sm">Funding sources</dt>
            <dd className="stat-value">{plan.selectedFunding.length}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="stat-label text-sm">Other expenses</dt>
            <dd className="stat-value">{plan.expenses.length}</dd>
          </div>
        </dl>
      </div>
      <h3 className="mt-7 font-semibold text-base">Project balances</h3>
      {result.funds.map((fund) => (
        <button
          className="my-3 flex w-full items-center justify-between gap-4 rounded-e border-s-4 px-4 py-3 text-left text-base hover:bg-base-200"
          key={fund.id}
          onClick={() => onProject(fund.id)}
          style={{ borderInlineStartColor: fund.color }}
          type="button"
        >
          <div>
            <strong className="font-semibold">{fund.name}</strong>
            <span className="mt-1 block text-sm text-base-content/70">
              {fund.firstDeficit
                ? `Runs short in ${monthLabel(fund.firstDeficit)}`
                : 'Within available funding'}
            </span>
          </div>
          <strong
            className={`flex items-center gap-2 whitespace-nowrap font-semibold ${fund.ending < 0 ? 'text-error' : ''}`}
          >
            {shortMoney(fund.ending)}{' '}
            <ArrowRightIcon className="size-4 shrink-0" />
          </strong>
        </button>
      ))}
      <div className="mt-6 flex flex-wrap gap-3 [&>button]:flex [&>button]:items-center [&>button]:gap-1.5 [&>button]:text-primary text-sm">
        <button onClick={() => onSection('Staffing')} type="button">
          Adjust staffing <ArrowRightIcon className="size-5 shrink-0" />
        </button>
        <button onClick={() => onSection('Funding')} type="button">
          Adjust funding <ArrowRightIcon className="size-5 shrink-0" />
        </button>
        <button onClick={() => onSection('Expenses')} type="button">
          Review expenses <ArrowRightIcon className="size-5 shrink-0" />
        </button>
      </div>
    </>
  );
}
