import { useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BanknotesIcon,
  ChartBarIcon,
  CheckIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  PlusIcon,
  Squares2X2Icon,
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
  { icon: FolderIcon, name: 'Plan details' },
  { icon: BanknotesIcon, name: 'Funding' },
  { icon: UserGroupIcon, name: 'Staffing' },
  { icon: Squares2X2Icon, name: 'Expenses' },
];
const steps = ['Plan & funding', 'Staffing', 'Other expenses', 'Review'];

export default function GuidedProjections({
  initialPlan,
}: {
  initialPlan: ProjectionDemoPlan;
}) {
  // Keep the prototype key so existing saved plans remain available.
  const storageKey = `walter-hybrid-v1-${initialPlan.asOf}-${initialPlan.fundingSources.map((fund) => fund.startingBalance).join('-')}`;
  const [plans, setPlans] = useState(() =>
    readSavedPlans(initialPlan, storageKey)
  );
  const [draft, setDraft] = useState(() => createProjectionPlan(initialPlan));
  const [screen, setScreen] = useState<'home' | 'setup' | 'workspace'>('home');
  const [section, setSection] = useState<Section>('Overview');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
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
      heading.current?.scrollIntoView({ block: 'start' });
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
      <div className="gp-root hp-root hp-setup">
        <div className="hp-setup-top">
          <Brand />
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
            <span className="gp-eyebrow">NEW PLAN · STEP {step + 1} OF 4</span>
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
            className="gp-wizard-card hp-setup-card"
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
              className="gp-secondary"
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
              className="gp-primary"
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
    <div className="gp-root hp-root hp-layout">
      <aside className="hp-rail">
        <Brand />
        <div className="hp-owner">
          <span>
            {initialPlan.ownerName
              .split(' ')
              .map((part) => part[0])
              .join('')}
          </span>
          <div>
            {initialPlan.ownerName}
            <small>Research portfolio</small>
          </div>
        </div>
        <button
          className={
            screen === 'home' ? 'hp-rail-link hp-selected' : 'hp-rail-link'
          }
          onClick={() => setScreen('home')}
          type="button"
        >
          <Squares2X2Icon /> All plans
        </button>
        {screen === 'workspace' && (
          <nav aria-label="Plan workspace sections">
            <p className="hp-rail-label">IN THIS PLAN</p>
            {sections.map(({ icon: Icon, name }) => (
              <button
                aria-current={section === name ? 'page' : undefined}
                className={
                  section === name ? 'hp-rail-link hp-selected' : 'hp-rail-link'
                }
                key={name}
                onClick={() => goToSection(name)}
                type="button"
              >
                <Icon />
                {name}
              </button>
            ))}
          </nav>
        )}
        <p className="hp-rail-foot">
          Demo portfolio
          <small>
            {monthLabel(initialPlan.asOf)} snapshot
            <br />
            Plans stay separate from Walter records.
          </small>
        </p>
      </aside>
      <div className="hp-main">
        <div className="hp-topbar">
          <span>
            <button
              aria-label="Back to all plans"
              onClick={() => setScreen('home')}
              type="button"
            >
              Plans
            </button>{' '}
            <span>/</span> {screen === 'home' ? 'Your plans' : draft.name}
          </span>
          <span className="hp-version-label">Guided projections</span>
        </div>
        <div className="hp-content">
          {screen === 'home' ? (
            <>
              <header className="hp-page-heading">
                <div>
                  <span className="gp-eyebrow">YOUR RESEARCH PLANS</span>
                  <h1 ref={heading} tabIndex={-1}>
                    Plan what comes next.
                  </h1>
                  <p>
                    Start with your current projects. Explore a different
                    staffing or spending plan.
                  </p>
                </div>
                <button className="gp-primary" onClick={start} type="button">
                  <PlusIcon /> New plan
                </button>
              </header>
              <div className="hp-portfolio">
                <div>
                  <span>Available across active projects</span>
                  <strong>
                    {money(
                      initialPlan.fundingSources.reduce(
                        (total, fund) => total + fund.startingBalance,
                        0
                      )
                    )}
                  </strong>
                  <small>From your Walter snapshot</small>
                </div>
                <div className="hp-portfolio-funds">
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
                <h2>
                  Your plans <span>{plans.length}</span>
                </h2>
                <span>Separate assumptions for each plan</span>
              </div>
              <div className="hp-plan-grid">
                {plans.map((plan) => {
                  const projection = projectGuidedPlan(plan);
                  return (
                    <button
                      className="hp-plan-card"
                      key={plan.id}
                      onClick={() => open(plan)}
                      type="button"
                    >
                      <span className="hp-plan-icon">
                        <FolderIcon />
                      </span>
                      <h3>{plan.name}</h3>
                      <p>
                        {plan.note ||
                          'A plan based on your current Walter snapshot.'}
                      </p>
                      <MiniChart
                        values={projection.chart.map((point) => point.balance)}
                      />
                      <div className="hp-card-total">
                        <span>Ending balance</span>
                        <strong
                          className={projection.ending < 0 ? 'hp-negative' : ''}
                        >
                          {money(projection.ending)}
                        </strong>
                      </div>
                      <div className="hp-card-footer">
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
                  <h3>Explore another possibility</h3>
                  <p>
                    Four short steps, with your funding and staffing already
                    filled in.
                  </p>
                  <span>
                    Create a plan <ArrowRightIcon />
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <header className="hp-page-heading hp-workspace-heading">
                <div>
                  <span className="gp-eyebrow">PLAN WORKSPACE</span>
                  <h1 ref={heading} tabIndex={-1}>
                    {draft.name || 'Untitled plan'}
                  </h1>
                  <p>
                    {monthLabel(draft.startMonth)} onward · {draft.months}{' '}
                    months <span className="hp-save-status">{storageText}</span>
                  </p>
                </div>
                <button
                  className="gp-secondary"
                  onClick={duplicate}
                  type="button"
                >
                  <DocumentDuplicateIcon /> Duplicate plan
                </button>
              </header>
              <nav aria-label="Plan sections" className="hp-mobile-sections">
                {sections.map(({ name }) => (
                  <button
                    aria-current={section === name ? 'page' : undefined}
                    key={name}
                    onClick={() => goToSection(name)}
                    type="button"
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <ShortfallSummary
                onProject={viewProject}
                onReview={() => goToSection('Staffing')}
                result={result}
              />
              <div className="hp-workspace-grid">
                <section
                  aria-label={`${section} editor`}
                  className="hp-editor-panel"
                >
                  {section === 'Overview' &&
                    (selectedProject ? (
                      <ProjectDetail
                        fund={selectedProject}
                        onBack={() => setProjectId(null)}
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
                          <h2>Plan details</h2>
                          <p>
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
                    <p className="hp-validation" role="status">
                      {error}
                    </p>
                  )}
                </section>
                <LiveResults
                  onProject={setProjectId}
                  projectId={projectId}
                  result={result}
                />
              </div>
              <p className="hp-model-note">
                Salary, fringe, and indirect costs are included. Other expenses
                use direct costs only in this demo.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="hp-brand">
      <span className="hp-brand-mark">
        <i />
        <i />
        <i />
      </span>
      <span>
        Spend Lab<small>GUIDED PROJECTIONS</small>
      </span>
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
        <label>
          Plan name
          <input
            maxLength={80}
            onChange={(event) => update({ ...plan, name: event.target.value })}
            value={plan.name}
          />
        </label>
        <label>
          Planning period
          <select
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
      <label className="gp-note-field">
        What are you exploring? <span>Optional</span>
        <input
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
    <aside
      aria-label="Funding summary"
      className={`hp-shortfall ${first ? '' : 'hp-shortfall-clear'}`}
    >
      <span className="hp-shortfall-icon">
        {first ? <ExclamationTriangleIcon /> : <CheckIcon />}
      </span>
      <div>
        <h2>
          {first
            ? `First project shortfall: ${monthLabel(first.firstDeficit!)}`
            : 'Your plan stays within the selected funding.'}
        </h2>
        <p>
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
        </p>
      </div>
      {first && (
        <button
          onClick={() => (onProject ? onProject(first.id) : onReview())}
          type="button"
        >
          {onProject ? 'Explore project' : 'Review staffing'} <ArrowRightIcon />
        </button>
      )}
    </aside>
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
      <div className="gp-editor-heading">
        <div>
          <h2>Your plan at a glance</h2>
          <p>Review the assumptions behind this outlook.</p>
        </div>
      </div>
      <div className="hp-overview-counts">
        <div>
          <span>People included</span>
          <strong>
            {plan.staff.filter((person) => person.included).length}
          </strong>
        </div>
        <div>
          <span>Funding sources</span>
          <strong>{plan.selectedFunding.length}</strong>
        </div>
        <div>
          <span>Other expenses</span>
          <strong>{plan.expenses.length}</strong>
        </div>
      </div>
      <h3 className="hp-fund-heading">Project balances</h3>
      {result.funds.map((fund) => (
        <button
          className="hp-fund-result hp-fund-link"
          key={fund.id}
          onClick={() => onProject(fund.id)}
          type="button"
        >
          <div>
            <strong>
              <i style={{ background: fund.color }} />
              {fund.name}
            </strong>
            <span>
              {fund.firstDeficit
                ? `Runs short in ${monthLabel(fund.firstDeficit)}`
                : 'Within available funding'}
            </span>
          </div>
          <strong className={fund.ending < 0 ? 'hp-negative' : ''}>
            {shortMoney(fund.ending)} <ArrowRightIcon />
          </strong>
        </button>
      ))}
      <div className="hp-overview-actions">
        <button onClick={() => onSection('Staffing')} type="button">
          Adjust staffing <ArrowRightIcon />
        </button>
        <button onClick={() => onSection('Expenses')} type="button">
          Review expenses <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}
