import { useId, useState } from 'react';
import {
  BanknotesIcon,
  ChevronDownIcon,
  ListBulletIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  monthLabel,
  type FundingSource,
} from '@/components/projections/projection.ts';
import type { ProjectionLookups } from '@/queries/projections.ts';
import type { PlanExpense } from '@/components/guidedProjections/defaults.ts';
import {
  planMonths,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';

export function ReviewItem({
  detail,
  edit,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  edit: () => void;
  icon: typeof BanknotesIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-main-border p-4">
      <div className="flex items-center justify-between text-sm text-base-content/70">
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          {label}
        </span>
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          onClick={edit}
          type="button"
        >
          Edit
        </button>
      </div>
      <strong className="mt-4 mb-1 block text-xl">{value}</strong>
      <p className="text-sm text-base-content/70">{detail}</p>
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
    <svg
      aria-hidden="true"
      className="my-3 block h-14 w-full"
      preserveAspectRatio="none"
      viewBox="0 0 290 80"
    >
      <line
        stroke="color-mix(in oklab, var(--color-base-content) 45%, transparent)"
        strokeDasharray="5 3"
        strokeWidth="1.5"
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
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1 text-base">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <BanknotesIcon aria-hidden="true" className="size-5 shrink-0" />
            Your funding sources
          </h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Choose the projects this plan should include, or add planned
            funding.
          </p>
        </div>
        <button
          className="btn btn-outline"
          onClick={addFundingSource}
          type="button"
        >
          <PlusIcon className="size-5 shrink-0" /> Add funding source
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
                <label className="flex min-w-0 flex-col gap-2 font-medium shrink-0 text-xs text-base-content/70">
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
                {!plan.serverProjection && (
                  <span>{fund.indirectRate}% indirect</span>
                )}
                <span>Ends {monthLabel(fund.endDate.slice(0, 7))}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-main-border pt-5">
                <label className="flex min-w-0 flex-col gap-2 font-medium min-w-0 flex-1 text-sm">
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
                      onChange={(event) =>
                        patch(fund.id, {
                          startingBalance: readNumber(event.target.value),
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
                <label className="flex min-w-0 flex-col gap-2 font-medium min-w-0 text-sm sm:col-span-2">
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
                {!plan.serverProjection && (
                  <label className="flex min-w-0 flex-col gap-2 font-medium min-w-0 text-sm sm:col-span-2">
                    Description
                    <input
                      className="input w-full text-base"
                      onChange={(event) =>
                        patch(fund.id, { description: event.target.value })
                      }
                      value={fund.description ?? ''}
                    />
                  </label>
                )}
                {!plan.serverProjection && (
                  <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
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
                )}
                <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
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
                <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
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
        <p className="mt-3 text-error text-sm">
          Choose at least one funding source to continue.
        </p>
      )}
      <p className="mt-5 leading-relaxed text-base-content/70 text-sm">
        Balances already account for recorded expenses and commitments. Your
        changes apply to this plan only.
      </p>
    </div>
  );
}

export function ExpenseEditor({
  lookups,
  plan,
  update,
}: {
  lookups?: ProjectionLookups;
  plan: ProjectionPlan;
  update: (plan: ProjectionPlan) => void;
}) {
  const categoryListId = useId();
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
          ...(plan.serverProjection && {
            serverExpense: {
              amount,
              description: name,
              endMonth: null,
              expenditureCategory: 'Other expenses',
              kind:
                frequency === 'once'
                  ? ('OneTime' as const)
                  : ('Monthly' as const),
              startMonth: `${plan.startMonth}-01`,
            },
          }),
        },
      ],
    });
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1 text-base">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ListBulletIcon aria-hidden="true" className="size-5 shrink-0" />
            Beyond staffing
          </h2>
          <p className="text-sm leading-relaxed text-base-content/70">
            Plan for regular costs and one-time purchases.
          </p>
        </div>
        <button className="btn btn-outline" onClick={() => add()} type="button">
          <PlusIcon className="size-5 shrink-0" /> Add expense
        </button>
      </div>
      {plan.serverProjection && (
        <datalist id={categoryListId}>
          {[
            ...new Set([
              ...(lookups?.expenditureCategories ?? []),
              ...plan.expenses.map(
                (expense) =>
                  expense.serverExpense?.expenditureCategory ?? 'Other expenses'
              ),
            ]),
          ].map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      )}
      {plan.expenses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-main-border bg-base-200 px-5 py-9 text-center [&>h3]:mb-2 text-sm">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-base-200 text-base-content/70">
            <BanknotesIcon className="size-5 shrink-0" />
          </span>
          <h3 className="text-xl font-semibold">
            What else does your research need?
          </h3>
          <p className="text-sm leading-relaxed text-base-content/70">
            Start with a common expense, or continue with staffing only.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 [&>button]:flex [&>button]:items-center [&>button]:gap-1.5 [&>button]:rounded-md [&>button]:border [&>button]:border-main-border [&>button]:bg-base-200 [&>button]:px-3 [&>button]:py-2 [&>button]:text-base-content/70 text-sm">
            <button onClick={() => add('Lab supplies', 500)} type="button">
              <PlusIcon className="size-5 shrink-0" /> Lab supplies
            </button>
            <button
              onClick={() => add('Conference travel', 2500, 'once')}
              type="button"
            >
              <PlusIcon className="size-5 shrink-0" /> Travel
            </button>
            <button
              onClick={() => add('Equipment', 5000, 'once')}
              type="button"
            >
              <PlusIcon className="size-5 shrink-0" /> Equipment
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
              {expense.serverExpense?.kind === 'Projected' && (
                <p className="mb-4 text-sm text-base-content/70">
                  Based on the {plan.historyMonths}-month spending average.
                  Changing the history window replaces this estimate. Editing
                  its dates or frequency makes it a planned expense.
                </p>
              )}
              <div className="mb-5 flex items-end gap-4">
                <label className="flex min-w-0 flex-col gap-2 font-medium min-w-0 flex-1 text-sm">
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
                  <TrashIcon className="size-5 shrink-0" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
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
                <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
                  Frequency
                  <select
                    className="select w-full text-base"
                    onChange={(event) =>
                      patch(expense.id, {
                        frequency: event.target.value as 'monthly' | 'once',
                        ...(expense.serverExpense && {
                          serverExpense: {
                            ...expense.serverExpense,
                            kind:
                              event.target.value === 'once'
                                ? 'OneTime'
                                : 'Monthly',
                          },
                        }),
                      })
                    }
                    value={expense.frequency}
                  >
                    <option value="monthly">Every month</option>
                    <option value="once">One time</option>
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
                  {expense.frequency === 'monthly' ? 'Starting month' : 'Month'}
                  <input
                    className="input w-full text-base"
                    onChange={(event) =>
                      patch(expense.id, {
                        month: event.target.value || plan.startMonth,
                        ...(expense.serverExpense && {
                          serverExpense: {
                            ...expense.serverExpense,
                            kind:
                              expense.frequency === 'once'
                                ? 'OneTime'
                                : 'Monthly',
                          },
                        }),
                      })
                    }
                    type="month"
                    value={expense.month}
                  />
                </label>
                {expense.serverExpense && (
                  <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
                    Expenditure category
                    <input
                      className="input w-full text-base"
                      list={categoryListId}
                      onChange={(event) =>
                        patch(expense.id, {
                          serverExpense: {
                            ...expense.serverExpense!,
                            expenditureCategory: event.target.value,
                          },
                        })
                      }
                      value={expense.serverExpense.expenditureCategory}
                    />
                  </label>
                )}
                {expense.serverExpense && expense.frequency === 'monthly' && (
                  <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
                    Ending month
                    <input
                      aria-label="Ending month"
                      className="input w-full text-base"
                      min={expense.month}
                      onChange={(event) =>
                        patch(expense.id, {
                          serverExpense: {
                            ...expense.serverExpense!,
                            endMonth: event.target.value
                              ? `${event.target.value}-01`
                              : null,
                            kind: 'Monthly',
                          },
                        })
                      }
                      type="month"
                      value={expense.serverExpense.endMonth?.slice(0, 7) ?? ''}
                    />
                    <span className="font-normal text-base-content/70">
                      Leave blank to continue through the project end.
                    </span>
                  </label>
                )}
                <label className="flex min-w-0 flex-col gap-2 font-medium text-sm">
                  Funding project
                  <select
                    className="select w-full text-base"
                    onChange={(event) =>
                      patch(expense.id, { fundingId: event.target.value })
                    }
                    value={expense.fundingId}
                  >
                    {!plan.selectedFunding.includes(expense.fundingId) && (
                      <option value={expense.fundingId}>
                        {plan.funding.find(
                          (fund) => fund.id === expense.fundingId
                        )?.name ?? 'Project not included'}{' '}
                        · excluded
                      </option>
                    )}
                    {plan.funding
                      .filter((fund) => plan.selectedFunding.includes(fund.id))
                      .map((fund) => (
                        <option key={fund.id} value={fund.id}>
                          {fund.name}
                          {fund.serverProject?.taskNumber &&
                            ` · Task ${fund.serverProject.taskNumber}`}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-5 leading-relaxed text-base-content/70 text-sm">
        {plan.serverProjection
          ? 'Monthly costs repeat through the selected ending month or project end. Spending estimates use the saved snapshot and selected history window.'
          : 'In this demo, other expenses are direct costs only. Monthly costs repeat from the selected month until the plan or funding source ends.'}
      </p>
    </>
  );
}

function readNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}
