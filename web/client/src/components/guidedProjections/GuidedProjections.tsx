import { useRef, useState } from 'react';
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
import '@/components/guidedProjections/planEditors.css';
import '@/components/guidedProjections/guidedProjections.css';

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

export default function GuidedProjections({
  initialPlan,
}: {
  initialPlan: ProjectionDemoPlan;
}) {
  // Keep the prototype key so existing saved plans remain available.
  const storageKey = `walter-hybrid-v1-${initialPlan.asOf}-${initialPlan.fundingSources.map((fund) => fund.startingBalance).join('-')}`;
  const [plans, setPlans] = useState(() => {
    const saved = readSavedPlans(initialPlan, storageKey);
    if (saved.some((plan) => plan.id === defaultPlanId)) {
      return saved;
    }
    return [
      {
        ...createProjectionPlan(initialPlan, 'Default plan'),
        id: defaultPlanId,
      },
      ...saved,
    ];
  });
  const [draft, setDraft] = useState(() => createProjectionPlan(initialPlan));
  const [screen, setScreen] = useState<'home' | 'setup' | 'workspace'>('home');
  const [section, setSection] = useState<Section>('Overview');
  const [projectId, setProjectId] = useState<string | null>(null);
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
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }

  function update(next: ProjectionPlan) {
    setDraft(next);
    if (screen === 'workspace') {
      persist(plans.map((plan) => (plan.id === next.id ? next : plan)));
    }
  }

  function scrollToHeading() {
    requestAnimationFrame(() => {
      layout.current?.scrollIntoView({ block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
  }

  function open(plan: ProjectionPlan) {
    setDraft(structuredClone(plan));
    setSection('Overview');
    setProjectId(null);
    setScreen('workspace');
    scrollToHeading();
  }

  function start() {
    setDraft(createProjectionPlan(initialPlan, 'My next plan'));
    setStep(0);
    setVisited(0);
    setScreen('setup');
    scrollToHeading();
  }

  function goToSection(next: Section) {
    setSection(next);
    if (next === 'Overview') {
      setProjectId(null);
    }
    scrollToHeading();
  }

  function viewProject(id: string) {
    setProjectId(id);
    setSection('Overview');
    scrollToHeading();
  }

  function duplicate() {
    const copy = {
      ...structuredClone(draft),
      id: crypto.randomUUID(),
      name: `${draft.name} copy`,
    };
    persist([...plans, copy]);
    open(copy);
  }

  function nextStep() {
    if (step === 3) {
      persist([...plans, draft]);
      open(draft);
    } else {
      setStep(step + 1);
      setVisited(Math.max(visited, step + 1));
      scrollToHeading();
    }
  }

  const storageText = storageAvailable
    ? 'Saved in this browser'
    : 'Browser storage unavailable. Changes last for this session.';

  if (screen === 'setup') {
    return (
      <div
        className="container gp-root hp-root hp-setup scroll-mt-24"
        ref={layout}
      >
        <div className="hp-setup-top">
          <h2 className="h3">Guided projections</h2>
          <span>New plan · {monthLabel(initialPlan.asOf)} snapshot</span>
        </div>
        <div className="hp-setup-content">
          <button
            className="gp-back"
            onClick={() => setScreen('home')}
            type="button"
          >
            <ArrowLeftIcon /> All plans
          </button>
          <header className="hp-setup-heading">
            <h1 ref={heading} tabIndex={-1}>
              {
                [
                  'Choose your starting point.',
                  'Review your team.',
                  'Plan for everything else.',
                  'Ready to explore your plan.',
                ][step]
              }
            </h1>
            <p>
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
          <ol aria-label="Plan setup progress" className="gp-steps hp-steps">
            {steps.map((label, index) => (
              <li
                className={
                  index === step
                    ? 'gp-step-active'
                    : index < step
                      ? 'gp-step-done'
                      : ''
                }
                key={label}
              >
                <button
                  aria-current={index === step ? 'step' : undefined}
                  disabled={index > visited}
                  onClick={() => {
                    setStep(index);
                    scrollToHeading();
                  }}
                  type="button"
                >
                  <span>{index < step ? <CheckIcon /> : index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <section
            aria-label={steps[step]}
            className="card gp-wizard-card hp-setup-card"
          >
            {step === 0 && (
              <>
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
            {step === 1 && <SplitStaffEditor plan={draft} update={update} />}
            {step === 2 && (
              <ExpenseEditor
                plan={draft}
                update={(next) => update({ ...draft, expenses: next.expenses })}
              />
            )}
            {step === 3 && (
              <>
                <div className="hp-review-heading">
                  <span className="gp-tag gp-tag-blue">
                    {draft.months}-month plan
                  </span>
                  <h2>{draft.name}</h2>
                  <p>
                    {draft.note ||
                      `Starting from the ${monthLabel(draft.startMonth)} Walter snapshot.`}
                  </p>
                </div>
                <div className="gp-review-grid">
                  <ReviewItem
                    detail={`${money(result.starting)} available`}
                    edit={() => setStep(0)}
                    label="Funding"
                    value={`${draft.selectedFunding.length} projects`}
                  />
                  <ReviewItem
                    detail={`${money(result.personnel)} projected cost`}
                    edit={() => setStep(1)}
                    label="Staffing"
                    value={`${draft.staff.filter((person) => person.included).length} people`}
                  />
                  <ReviewItem
                    detail={`${money(result.other)} direct costs`}
                    edit={() => setStep(2)}
                    label="Other expenses"
                    value={`${draft.expenses.length} ${draft.expenses.length === 1 ? 'expense' : 'expenses'}`}
                  />
                </div>
                <ShortfallSummary onReview={() => setStep(1)} result={result} />
                <div className="hp-review-ending">
                  <span>Combined ending balance</span>
                  <strong className={result.ending < 0 ? 'hp-negative' : ''}>
                    {money(result.ending)}
                  </strong>
                </div>
              </>
            )}
          </section>
          <footer className="gp-wizard-footer hp-setup-footer">
            <button
              className="btn btn-outline gp-secondary"
              onClick={() => {
                if (step === 0) {
                  setScreen('home');
                } else {
                  setStep(step - 1);
                  scrollToHeading();
                }
              }}
              type="button"
            >
              {step === 0 ? 'Cancel setup' : 'Back'}
            </button>
            <span>
              {error || 'You can revisit every assumption in your workspace.'}
            </span>
            <button
              className="btn btn-primary gp-primary"
              disabled={Boolean(error)}
              onClick={nextStep}
              type="button"
            >
              {step === 3 ? 'Create plan & open workspace' : 'Continue'}
              <ArrowRightIcon />
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`container gp-root hp-root hp-layout scroll-mt-24 ${screen === 'home' ? 'hp-home text-base' : ''}`}
      ref={layout}
    >
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <PlansSidebar
          currentPlanId={screen === 'workspace' ? draft.id : null}
          defaultPlan={plans.find((plan) => plan.id === defaultPlanId)!}
          onCreate={start}
          onHome={() => {
            setScreen('home');
            scrollToHeading();
          }}
          onOpen={open}
          plans={plans.filter((plan) => plan.id !== defaultPlanId)}
        />
        <div className="hp-main flex-1">
          <div className="hp-content">
            {screen === 'home' ? (
              <>
                <header className="hp-page-heading">
                  <div>
                    <h1 className="h1" ref={heading} tabIndex={-1}>
                      {initialPlan.ownerName}&apos;s Projections
                    </h1>
                  </div>
                  <button
                    className="btn btn-primary gp-primary"
                    onClick={start}
                    type="button"
                  >
                    <PlusIcon /> New plan
                  </button>
                </header>
                <div className="card hp-portfolio">
                  <div>
                    <span className="stat-label text-base">
                      Available across active projects
                    </span>
                    <strong className="text-3xl font-bold">
                      {money(
                        initialPlan.fundingSources.reduce(
                          (total, fund) => total + fund.startingBalance,
                          0
                        )
                      )}
                    </strong>
                    <small className="text-sm">From your Walter snapshot</small>
                  </div>
                  <div className="hp-portfolio-funds text-base">
                    {initialPlan.fundingSources.map((fund) => (
                      <div key={fund.id}>
                        <span>
                          <i style={{ background: fund.color }} />
                          {fund.name}
                        </span>
                        <strong>{shortMoney(fund.startingBalance)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="hp-library-title">
                  <h2 className="h2">
                    Your plans{' '}
                    <span className="text-sm font-medium">{plans.length}</span>
                  </h2>
                  <span className="text-sm">
                    Separate assumptions for each plan
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
                  {plans.map((plan) => {
                    const projection = projectGuidedPlan(plan);
                    return (
                      <button
                        className="hp-plan-card"
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
                        <div className="hp-card-total">
                          <span className="text-sm">Ending balance</span>
                          <strong
                            className={`text-xl font-medium ${projection.ending < 0 ? 'hp-negative' : ''}`}
                          >
                            {money(projection.ending)}
                          </strong>
                        </div>
                        <div className="hp-card-footer text-sm">
                          <span>
                            {plan.months} months ·{' '}
                            {
                              plan.staff.filter((person) => person.included)
                                .length
                            }{' '}
                            people
                          </span>
                          <span>
                            Open plan <ArrowRightIcon />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  <button
                    className="hp-plan-card hp-new-plan"
                    onClick={start}
                    type="button"
                  >
                    <PlusIcon />
                    <h3 className="text-xl font-semibold">
                      Explore another possibility
                    </h3>
                    <p className="text-base">
                      Four short steps, with your funding and staffing already
                      filled in.
                    </p>
                    <span className="text-sm">
                      Create a plan <ArrowRightIcon />
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <ShortfallSummary
                  onProject={viewProject}
                  onReview={() => goToSection('Staffing')}
                  result={result}
                />
                <header className="hp-page-heading hp-workspace-heading">
                  <div>
                    <h1 ref={heading} tabIndex={-1}>
                      {draft.name || 'Untitled plan'}
                    </h1>
                    <p className="subtitle">
                      {monthLabel(draft.startMonth)} onward · {draft.months}{' '}
                      months{' '}
                      <span className="hp-save-status">{storageText}</span>
                    </p>
                  </div>
                  <button
                    className="btn btn-outline gp-secondary"
                    onClick={duplicate}
                    type="button"
                  >
                    <DocumentDuplicateIcon /> Duplicate plan
                  </button>
                </header>
                <nav
                  aria-label="Plan sections"
                  className="tabs tabs-border hp-sections"
                >
                  {sections.map(({ icon: Icon, name }) => (
                    <button
                      aria-current={section === name ? 'page' : undefined}
                      className={`tab gap-2 text-base ${section === name ? 'tab-active text-primary' : ''}`}
                      key={name}
                      onClick={() => goToSection(name)}
                      type="button"
                    >
                      <Icon aria-hidden="true" />
                      {name}
                    </button>
                  ))}
                </nav>
                <div className="hp-workspace-grid">
                  <section
                    aria-label={`${section} editor`}
                    className="hp-editor-panel text-base"
                  >
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
                        <div className="gp-editor-heading">
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
                      <SplitStaffEditor plan={draft} update={update} />
                    )}
                    {section === 'Expenses' && (
                      <ExpenseEditor
                        plan={draft}
                        update={(next) =>
                          update({ ...draft, expenses: next.expenses })
                        }
                      />
                    )}
                    {error && (
                      <p className="hp-validation text-sm" role="status">
                        {error}
                      </p>
                    )}
                  </section>
                  <div className="hp-outlook-column min-w-0">
                    <LiveResults
                      onProject={setProjectId}
                      projectId={projectId}
                      result={result}
                    />
                    <p className="hp-model-note">
                      Salary, fringe, and indirect costs are included. Other
                      expenses use direct costs only in this demo.
                    </p>
                    <p className="hp-model-note">
                      Demo plans are saved in this browser and do not update
                      Walter project records.
                    </p>
                  </div>
                </div>
              </>
            )}
            {screen === 'home' && (
              <p className="hp-model-note text-sm">
                Demo plans are saved in this browser and do not update Walter
                project records.
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
    <div className="hp-plan-details">
      <div className="gp-basics">
        <label className="text-sm">
          Plan name
          <input
            className="input w-full text-base"
            maxLength={80}
            onChange={(event) => update({ ...plan, name: event.target.value })}
            value={plan.name}
          />
        </label>
        <label className="text-sm">
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
      <label className="gp-note-field text-sm">
        <span className="flex flex-wrap items-baseline gap-2">
          What are you exploring?{' '}
          <span className="text-sm font-normal text-base-content/70">
            Optional
          </span>
        </span>
        <input
          className="input w-full text-base"
          onChange={(event) => update({ ...plan, note: event.target.value })}
          placeholder="For example, supplies for next field season"
          value={plan.note}
        />
      </label>
    </div>
  );
}

function ShortfallSummary({
  onProject,
  onReview,
  result,
}: {
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
      className={`alert alert-soft mb-6 ${first ? 'alert-error' : 'alert-success'}`}
      role="status"
    >
      {first ? (
        <ExclamationTriangleIcon aria-hidden="true" />
      ) : (
        <CheckIcon aria-hidden="true" />
      )}
      <div className="min-w-0">
        <span className="block font-semibold">
          {first
            ? `First project shortfall: ${monthLabel(first.firstDeficit!)}`
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
          {onProject ? 'Explore project' : 'Review staffing'} <ArrowRightIcon />
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
      <div className="gp-editor-heading text-base">
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
      <h3 className="hp-fund-heading text-base">Project balances</h3>
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
      <div className="hp-overview-actions text-sm">
        <button onClick={() => onSection('Staffing')} type="button">
          Adjust staffing <ArrowRightIcon />
        </button>
        <button onClick={() => onSection('Funding')} type="button">
          Adjust funding <ArrowRightIcon />
        </button>
        <button onClick={() => onSection('Expenses')} type="button">
          Review expenses <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}
