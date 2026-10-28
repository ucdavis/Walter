import { useState } from 'react';
import {
  BanknotesIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  monthLabel,
  type FundingSource,
} from '@/components/projections/projection.ts';
import type { PlanExpense } from '@/components/guidedProjections/defaults.ts';
import {
  planMonths,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';

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
        stroke="var(--color-main-border)"
        strokeDasharray="3 4"
        x1="0"
        x2="290"
        y1={70 - ((0 - low) / (high - low)) * 62}
        y2={70 - ((0 - low) / (high - low)) * 62}
      />
      <polyline
        fill="none"
        points={points}
        stroke="var(--color-primary)"
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
  const [expanded, setExpanded] = useState<string | null>(null);
  function patch(id: string, changes: Partial<FundingSource>) {
    update({
      ...plan,
      funding: plan.funding.map((fund) =>
        fund.id === id ? { ...fund, ...changes } : fund
      ),
    });
  }
  function addFundingSource() {
    const id = crypto.randomUUID();
    const [year, month] = planMonths(plan).at(-1)!.split('-').map(Number);
    update({
      ...plan,
      funding: [
        ...plan.funding,
        {
          color: 'var(--color-primary)',
          description: 'Planned funding',
          endDate: new Date(Date.UTC(year, month, 0))
            .toISOString()
            .slice(0, 10),
          id,
          indirectRate: 0,
          name: 'Planned funding source',
          startDate: `${plan.startMonth}-01`,
          startingBalance: 0,
        },
      ],
      selectedFunding: [...plan.selectedFunding, id],
    });
    setExpanded(id);
  }
  return (
    <div>
      <div className="gp-editor-heading text-base">
        <div>
          <h2 className="text-xl font-semibold">Your funding sources</h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Choose the projects this plan should include, or add planned
            funding.
          </p>
        </div>
        <button
          className="btn btn-outline gp-secondary"
          onClick={addFundingSource}
          type="button"
        >
          <PlusIcon /> Add funding source
        </button>
      </div>
      <div className="grid gap-5">
        {plan.funding.map((fund) => (
          <article
            aria-label={fund.name || 'Untitled funding source'}
            className="overflow-hidden border-s-4 bg-base-100"
            key={fund.id}
            style={{ borderInlineStartColor: fund.color }}
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-snug break-words">
                    {fund.name || 'Untitled funding source'}
                  </h3>
                  {fund.description && (
                    <p className="mt-1 text-sm text-base-content/70">
                      {fund.description}
                    </p>
                  )}
                </div>
                <label className="shrink-0 text-xs text-base-content/70">
                  <input
                    aria-label={`Include ${fund.name}`}
                    checked={plan.selectedFunding.includes(fund.id)}
                    className="checkbox checkbox-primary checkbox-sm self-center"
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
                  {plan.selectedFunding.includes(fund.id)
                    ? 'Included'
                    : 'Excluded'}
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-content/70">
                <span>{fund.indirectRate}% indirect</span>
                <span>Ends {monthLabel(fund.endDate.slice(0, 7))}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-main-border pt-5">
                <label className="min-w-0 flex-1 text-sm">
                  Available balance
                  <span className="relative block max-w-52">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 start-3 z-10 flex items-center text-base text-base-content/60"
                    >
                      $
                    </span>
                    <input
                      aria-label={`${fund.name} starting balance`}
                      className="input w-full ps-7 text-base font-medium tabular-nums"
                      min={0}
                      onChange={(event) =>
                        patch(fund.id, {
                          startingBalance: Math.max(
                            0,
                            readNumber(event.target.value)
                          ),
                        })
                      }
                      step={100}
                      type="number"
                      value={fund.startingBalance}
                    />
                  </span>
                </label>
                <button
                  aria-controls={`source-details-${fund.id}`}
                  aria-expanded={expanded === fund.id}
                  className="btn btn-ghost btn-sm gap-2 text-primary"
                  onClick={() =>
                    setExpanded(expanded === fund.id ? null : fund.id)
                  }
                  type="button"
                >
                  {expanded === fund.id ? 'Close details' : 'Edit details'}
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`transition-transform ${expanded === fund.id ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            </div>
            {expanded === fund.id && (
              <div
                className="grid grid-cols-1 gap-5 border-t border-main-border bg-base-200 p-5 sm:grid-cols-2 sm:p-6"
                id={`source-details-${fund.id}`}
              >
                <label className="min-w-0 text-sm sm:col-span-2">
                  Funding source name
                  <input
                    autoFocus
                    className="input w-full text-base"
                    onChange={(event) =>
                      patch(fund.id, { name: event.target.value })
                    }
                    value={fund.name}
                  />
                </label>
                <label className="min-w-0 text-sm sm:col-span-2">
                  Description
                  <input
                    className="input w-full text-base"
                    onChange={(event) =>
                      patch(fund.id, { description: event.target.value })
                    }
                    value={fund.description ?? ''}
                  />
                </label>
                <label className="text-sm">
                  Indirect rate %
                  <input
                    className="input w-full text-base"
                    min={0}
                    onChange={(event) =>
                      patch(fund.id, {
                        indirectRate: Math.max(
                          0,
                          readNumber(event.target.value)
                        ),
                      })
                    }
                    step="any"
                    type="number"
                    value={fund.indirectRate}
                  />
                </label>
                <label className="text-sm">
                  Start date
                  <input
                    className="input w-full text-base"
                    max={fund.endDate}
                    onChange={(event) => {
                      if (
                        event.target.value &&
                        event.target.value <= fund.endDate
                      ) {
                        patch(fund.id, { startDate: event.target.value });
                      }
                    }}
                    type="date"
                    value={fund.startDate}
                  />
                </label>
                <label className="text-sm">
                  End date
                  <input
                    className="input w-full text-base"
                    min={fund.startDate}
                    onChange={(event) => {
                      if (
                        event.target.value &&
                        event.target.value >= fund.startDate
                      ) {
                        patch(fund.id, { endDate: event.target.value });
                      }
                    }}
                    type="date"
                    value={fund.endDate}
                  />
                </label>
              </div>
            )}
          </article>
        ))}
      </div>
      {plan.selectedFunding.length === 0 && (
        <p className="gp-validation text-sm">
          Choose at least one funding source to continue.
        </p>
      )}
      <p className="gp-model-note text-sm">
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
      <div className="gp-editor-heading text-base">
        <div>
          <h2 className="text-xl font-semibold">Beyond staffing</h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Plan for regular costs and one-time purchases.
          </p>
        </div>
        <button
          className="btn btn-outline gp-secondary"
          onClick={() => add()}
          type="button"
        >
          <PlusIcon /> Add expense
        </button>
      </div>
      {plan.expenses.length === 0 ? (
        <div className="gp-expense-empty text-sm">
          <span className="gp-empty-icon">
            <BanknotesIcon />
          </span>
          <h3 className="text-xl font-semibold">
            What else does your research need?
          </h3>
          <p className="text-sm leading-relaxed text-base-content/70">
            Start with a common expense, or continue with staffing only.
          </p>
          <div className="gp-expense-presets text-sm">
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
        <div className="grid gap-5">
          {plan.expenses.map((expense) => (
            <div
              className="rounded-lg border border-main-border bg-base-200 p-5 sm:p-6"
              key={expense.id}
            >
              <div className="mb-5 flex items-end gap-4">
                <label className="min-w-0 flex-1 text-sm">
                  Expense name
                  <input
                    className="input w-full text-base"
                    onChange={(event) =>
                      patch(expense.id, { name: event.target.value })
                    }
                    value={expense.name}
                  />
                </label>
                <button
                  aria-label={`Remove ${expense.name}`}
                  className="btn btn-ghost btn-square shrink-0 text-base-content/70 hover:bg-error/10 hover:text-error"
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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <label className="text-sm">
                  Amount
                  <input
                    className="input w-full text-base"
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
                <label className="text-sm">
                  Frequency
                  <select
                    className="select w-full text-base"
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
                <label className="text-sm">
                  {expense.frequency === 'monthly' ? 'Starting month' : 'Month'}
                  <input
                    className="input w-full text-base"
                    onChange={(event) =>
                      patch(expense.id, {
                        month: event.target.value || plan.startMonth,
                      })
                    }
                    type="month"
                    value={expense.month}
                  />
                </label>
                <label className="text-sm">
                  Funding project
                  <select
                    className="select w-full text-base"
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
      <p className="gp-model-note text-sm">
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
