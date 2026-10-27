import {
  BanknotesIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { monthLabel } from '@/components/projections/projection.ts';
import type { PlanExpense } from '@/components/guidedProjections/defaults.ts';
import type { ProjectionPlan } from '@/components/guidedProjections/planModel.ts';

export function ReviewItem({
  detail,
  edit,
  label,
  value,
}: {
  detail: string;
  edit: () => void;
  label: string;
  value: string;
}) {
  return (
    <div className="gp-review-item">
      <div>
        <span>{label}</span>
        <button className="gp-text-button" onClick={edit} type="button">
          Edit
        </button>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function MiniChart({ values }: { values: number[] }) {
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const points = values
    .map(
      (value, index) =>
        `${(index * 290) / Math.max(1, values.length - 1)},${70 - ((value - low) / (high - low)) * 62}`
    )
    .join(' ');
  return (
    <svg aria-hidden="true" className="gp-mini-chart" viewBox="0 0 290 80">
      <line
        stroke="#d9e0eb"
        strokeDasharray="3 4"
        x1="0"
        x2="290"
        y1={70 - ((0 - low) / (high - low)) * 62}
        y2={70 - ((0 - low) / (high - low)) * 62}
      />
      <polyline
        fill="none"
        points={points}
        stroke="#3666b0"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export function FundingEditor({
  plan,
  update,
}: {
  plan: ProjectionPlan;
  update: (plan: ProjectionPlan) => void;
}) {
  return (
    <div className="gp-funding-editor">
      <div className="gp-editor-heading">
        <div>
          <h2>Your funding sources</h2>
          <p>Choose the projects this plan should include.</p>
        </div>
        <span className="gp-tag gp-tag-blue">From Walter</span>
      </div>
      {plan.funding.map((fund) => (
        <div
          className={`gp-funding-choice ${plan.selectedFunding.includes(fund.id) ? 'gp-funding-selected' : ''}`}
          key={fund.id}
        >
          <label className="gp-funding-check">
            <input
              checked={plan.selectedFunding.includes(fund.id)}
              onChange={(event) =>
                update({
                  ...plan,
                  selectedFunding: event.target.checked
                    ? [...plan.selectedFunding, fund.id]
                    : plan.selectedFunding.filter((id) => id !== fund.id),
                })
              }
              type="checkbox"
            />
            <span>
              <strong>{fund.name}</strong>
              <small>
                {fund.description} · {fund.indirectRate}% indirect · Ends{' '}
                {monthLabel(fund.endDate.slice(0, 7))}
              </small>
            </span>
          </label>
          <label className="gp-balance-input">
            Available balance
            <input
              aria-label={`${fund.name} starting balance`}
              min={0}
              onChange={(event) =>
                update({
                  ...plan,
                  funding: plan.funding.map((source) =>
                    source.id === fund.id
                      ? {
                          ...source,
                          startingBalance: Math.max(
                            0,
                            readNumber(event.target.value)
                          ),
                        }
                      : source
                  ),
                })
              }
              step={100}
              type="number"
              value={fund.startingBalance}
            />
          </label>
        </div>
      ))}
      {plan.selectedFunding.length === 0 && (
        <p className="gp-validation">
          Choose at least one funding source to continue.
        </p>
      )}
      <p className="gp-model-note">
        Balances already account for recorded expenses and commitments. Your
        changes apply to this plan only.
      </p>
    </div>
  );
}

export function ExpenseEditor({
  plan,
  update,
}: {
  plan: ProjectionPlan;
  update: (plan: ProjectionPlan) => void;
}) {
  const patch = (id: string, changes: Partial<PlanExpense>) =>
    update({
      ...plan,
      expenses: plan.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...changes } : expense
      ),
    });
  function add(
    name = 'Other expense',
    amount = 500,
    frequency: 'monthly' | 'once' = 'monthly'
  ) {
    update({
      ...plan,
      expenses: [
        ...plan.expenses,
        {
          amount,
          frequency,
          fundingId: plan.selectedFunding[0] ?? '',
          id: crypto.randomUUID(),
          month: plan.startMonth,
          name,
        },
      ],
    });
  }
  return (
    <>
      <div className="gp-editor-heading">
        <div>
          <h2>Beyond staffing</h2>
          <p>Plan for regular costs and one-time purchases.</p>
        </div>
        <button className="gp-secondary" onClick={() => add()} type="button">
          <PlusIcon /> Add expense
        </button>
      </div>
      {plan.expenses.length === 0 ? (
        <div className="gp-expense-empty">
          <span className="gp-empty-icon">
            <BanknotesIcon />
          </span>
          <h3>What else does your research need?</h3>
          <p>Start with a common expense, or continue with staffing only.</p>
          <div className="gp-expense-presets">
            <button onClick={() => add('Lab supplies', 500)} type="button">
              <PlusIcon /> Lab supplies
            </button>
            <button
              onClick={() => add('Conference travel', 2500, 'once')}
              type="button"
            >
              <PlusIcon /> Travel
            </button>
            <button
              onClick={() => add('Equipment', 5000, 'once')}
              type="button"
            >
              <PlusIcon /> Equipment
            </button>
          </div>
        </div>
      ) : (
        <div className="gp-expense-list">
          {plan.expenses.map((expense) => (
            <div className="gp-expense-row" key={expense.id}>
              <div className="gp-expense-row-top">
                <label>
                  Expense name
                  <input
                    onChange={(event) =>
                      patch(expense.id, { name: event.target.value })
                    }
                    value={expense.name}
                  />
                </label>
                <button
                  aria-label={`Remove ${expense.name}`}
                  className="gp-icon-button"
                  onClick={() =>
                    update({
                      ...plan,
                      expenses: plan.expenses.filter(
                        (item) => item.id !== expense.id
                      ),
                    })
                  }
                  type="button"
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="gp-expense-fields">
                <label>
                  Amount
                  <input
                    min={0}
                    onChange={(event) =>
                      patch(expense.id, {
                        amount: Math.max(0, readNumber(event.target.value)),
                      })
                    }
                    step={100}
                    type="number"
                    value={expense.amount}
                  />
                </label>
                <label>
                  Frequency
                  <select
                    onChange={(event) =>
                      patch(expense.id, {
                        frequency: event.target.value as 'monthly' | 'once',
                      })
                    }
                    value={expense.frequency}
                  >
                    <option value="monthly">Every month</option>
                    <option value="once">One time</option>
                  </select>
                </label>
                <label>
                  {expense.frequency === 'monthly' ? 'Starting month' : 'Month'}
                  <input
                    onChange={(event) =>
                      patch(expense.id, {
                        month: event.target.value || plan.startMonth,
                      })
                    }
                    type="month"
                    value={expense.month}
                  />
                </label>
                <label>
                  Funding project
                  <select
                    onChange={(event) =>
                      patch(expense.id, { fundingId: event.target.value })
                    }
                    value={expense.fundingId}
                  >
                    {plan.funding
                      .filter((fund) => plan.selectedFunding.includes(fund.id))
                      .map((fund) => (
                        <option key={fund.id} value={fund.id}>
                          {fund.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="gp-model-note">
        In this demo, other expenses are direct costs only. Monthly costs repeat
        from the selected month until the plan or funding source ends.
      </p>
    </>
  );
}

function readNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}
