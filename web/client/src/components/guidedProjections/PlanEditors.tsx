import { useId, useRef, useState } from 'react';
import {
  BanknotesIcon,
  ListBulletIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  monthLabel,
  type FundingSource,
} from '@/components/projections/projection.ts';
import { projectExpenditureCategoryColor } from '@/components/project/projectChartColors.ts';
import type { ProjectionLookups } from '@/queries/projections.ts';
import { useRevealItem } from '@/shared/hooks/useRevealItem.ts';
import FundingSourceDetailsModal from '@/components/guidedProjections/FundingSourceDetailsModal.tsx';
import {
  money,
  type PlanExpense,
} from '@/components/guidedProjections/defaults.ts';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const addedItemId = useRef<string | null>(null);
  const { registerItem, revealItem } = useRevealItem();
  const editingFund = plan.funding.find((fund) => fund.id === editingId);
  function patch(id: string, changes: Partial<FundingSource>) {
    update({
      ...plan,
      funding: plan.funding.map((fund) =>
        fund.id === id ? { ...fund, ...changes } : fund
      ),
    });
  }
  function removeFundingSource(id: string) {
    update({
      ...plan,
      expenses: plan.expenses.filter((expense) => expense.fundingId !== id),
      funding: plan.funding.filter((fund) => fund.id !== id),
      selectedFunding: plan.selectedFunding.filter((fundId) => fundId !== id),
      staff: plan.staff.map((person) => ({
        ...person,
        fundingId: person.fundingId === id ? '' : person.fundingId,
        splits: person.splits.filter((split) => split.fundingId !== id),
      })),
    });
    setEditingId(null);
  }
  function addFundingSource() {
    const id = crypto.randomUUID();
    addedItemId.current = id;
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
    setEditingId(id);
    revealItem(id, { focus: false });
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
            Review your projects and add planned funding.
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
      <div className="grid gap-3">
        {plan.funding.map((fund) => (
          <article
            aria-label={fund.name || 'Untitled funding source'}
            className="scroll-mt-24 overflow-hidden border-s-4 bg-base-100"
            key={fund.id}
            ref={(element) => registerItem(fund.id, element)}
            style={{ borderInlineStartColor: fund.color }}
          >
            <div className="px-4 py-3 sm:px-5">
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
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-content/70">
                {!plan.serverProjection && (
                  <span>{fund.indirectRate}% indirect</span>
                )}
                <span>Ends {monthLabel(fund.endDate.slice(0, 7))}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-main-border pt-3">
                <dl className="min-w-0">
                  <dt className="text-sm text-base-content/70">
                    Available balance
                  </dt>
                  <dd
                    aria-label={`${fund.name} available balance`}
                    className={`mt-0.5 text-xl font-semibold tabular-nums ${fund.startingBalance < 0 ? 'text-error' : ''}`}
                  >
                    {money(fund.startingBalance)}
                  </dd>
                </dl>
                <button
                  aria-haspopup="dialog"
                  className="btn btn-ghost btn-sm gap-2 text-primary"
                  onClick={() => setEditingId(fund.id)}
                  type="button"
                >
                  Edit details
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {editingFund && (
        <FundingSourceDetailsModal
          fund={editingFund}
          isServerPlan={Boolean(plan.serverProjection)}
          key={editingFund.id}
          onApply={(fund) => patch(fund.id, fund)}
          onClose={() => {
            setEditingId(null);
            if (addedItemId.current === editingFund.id) {
              addedItemId.current = null;
              revealItem(editingFund.id);
            }
          }}
          onRemove={() => removeFundingSource(editingFund.id)}
        />
      )}
      {plan.selectedFunding.length === 0 && (
        <p className="mt-3 text-error text-sm">
          Add a funding source to continue.
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
  const { registerItem, revealItem } = useRevealItem();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const showCategories = Boolean(plan.serverProjection);
  const months = planMonths(plan);
  const categories = [...new Set(plan.expenses.map(expenseCategory))].sort();
  const activeCategories = selectedCategories.filter((category) =>
    categories.includes(category)
  );
  const visibleExpenses =
    activeCategories.length === 0
      ? plan.expenses
      : plan.expenses.filter((expense) =>
          activeCategories.includes(expenseCategory(expense))
        );
  const patch = (id: string, changes: Partial<PlanExpense>) =>
    update({
      ...plan,
      expenses: plan.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...changes } : expense
      ),
    });
  function add(name: string, amount: number, frequency: 'monthly' | 'once') {
    const id = crypto.randomUUID();
    update({
      ...plan,
      expenses: [
        ...plan.expenses,
        {
          amount,
          frequency,
          fundingId: plan.selectedFunding[0] ?? '',
          id,
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
    setSelectedCategories([]);
    revealItem(id);
  }
  const toggleCategory = (category: string) =>
    setSelectedCategories(
      activeCategories.includes(category)
        ? activeCategories.filter((selected) => selected !== category)
        : [...activeCategories, category]
    );
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
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => add('Monthly expense', 500, 'monthly')}
            type="button"
          >
            <PlusIcon className="size-4 shrink-0" /> Add monthly
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => add('One-time expense', 2500, 'once')}
            type="button"
          >
            <PlusIcon className="size-4 shrink-0" /> Add one-time
          </button>
        </div>
      </div>
      {plan.serverProjection && (
        <datalist id={categoryListId}>
          {[
            ...new Set([
              ...(lookups?.expenditureCategories ?? []),
              ...categories,
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
            <button
              onClick={() => add('Lab supplies', 500, 'monthly')}
              type="button"
            >
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
        <>
          {showCategories && (
            <div
              aria-label="Filter by expenditure category"
              className="tabs tabs-box tabs-sm mb-4 flex w-fit flex-wrap"
              role="group"
            >
              <button
                aria-pressed={activeCategories.length === 0}
                className={`tab ${activeCategories.length === 0 ? 'tab-active' : ''}`}
                onClick={() => setSelectedCategories([])}
                type="button"
              >
                All Categories
              </button>
              {categories.map((category) => {
                const isSelected = activeCategories.includes(category);
                return (
                  <button
                    aria-pressed={isSelected}
                    className={`tab ${isSelected ? 'tab-active' : ''}`}
                    key={category}
                    onClick={() => toggleCategory(category)}
                    type="button"
                  >
                    <span
                      className="mr-2 inline-block size-3 rounded-sm"
                      style={{
                        backgroundColor:
                          projectExpenditureCategoryColor(category),
                      }}
                    />
                    {category}
                  </button>
                );
              })}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="table walter-table table-sm">
              <colgroup>
                {showCategories && <col className="w-44" />}
                <col className="w-48" />
                <col className="w-32" />
                <col className="w-36" />
                <col className="w-36" />
                <col className="w-44" />
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-12" />
              </colgroup>
              <thead>
                <tr>
                  {showCategories && <th>Expenditure Category</th>}
                  <th>Description</th>
                  <th>Type</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Funding Project</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Plan Total</th>
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleExpenses.map((expense) => {
                  const projected = expense.serverExpense?.kind === 'Projected';
                  return (
                    <tr
                      className="hover:bg-base-200/50"
                      key={expense.id}
                      style={{
                        borderLeft: `3px solid ${projectExpenditureCategoryColor(
                          expenseCategory(expense)
                        )}`,
                      }}
                    >
                      {showCategories && (
                        <td>
                          <input
                            aria-label="Expenditure category"
                            className="input input-sm w-full"
                            list={categoryListId}
                            onChange={(event) =>
                              patch(expense.id, {
                                serverExpense: {
                                  ...expense.serverExpense!,
                                  expenditureCategory: event.target.value,
                                },
                              })
                            }
                            value={expense.serverExpense?.expenditureCategory}
                          />
                        </td>
                      )}
                      <td
                        className="scroll-mt-24"
                        ref={(element) => registerItem(expense.id, element)}
                      >
                        <input
                          aria-label="Expense name"
                          className="input input-sm w-full"
                          onChange={(event) =>
                            patch(expense.id, { name: event.target.value })
                          }
                          value={expense.name}
                        />
                        {projected && (
                          <p className="mt-1 text-xs text-base-content/70">
                            Based on the {plan.historyMonths}-month spending
                            average
                          </p>
                        )}
                      </td>
                      <td>
                        <select
                          aria-label="Frequency"
                          className="select select-sm w-full"
                          onChange={(event) => {
                            const frequency = event.target.value;
                            if (
                              frequency !== 'monthly' &&
                              frequency !== 'once'
                            ) {
                              return;
                            }
                            patch(expense.id, {
                              frequency,
                              ...(expense.serverExpense && {
                                serverExpense: {
                                  ...expense.serverExpense,
                                  kind:
                                    frequency === 'once'
                                      ? 'OneTime'
                                      : 'Monthly',
                                },
                              }),
                            });
                          }}
                          value={projected ? 'projected' : expense.frequency}
                        >
                          {projected && (
                            <option value="projected">Projected</option>
                          )}
                          <option value="monthly">Monthly</option>
                          <option value="once">One time</option>
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={
                            expense.frequency === 'monthly'
                              ? 'Starting month'
                              : 'Month'
                          }
                          className="input input-sm w-full"
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
                      </td>
                      <td>
                        {expense.serverExpense &&
                        expense.frequency === 'monthly' ? (
                          <input
                            aria-label="Ending month"
                            className="input input-sm w-full"
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
                            title="Leave blank to continue through the project end."
                            type="month"
                            value={
                              expense.serverExpense.endMonth?.slice(0, 7) ?? ''
                            }
                          />
                        ) : null}
                      </td>
                      <td>
                        <select
                          aria-label="Funding project"
                          className="select select-sm w-full"
                          onChange={(event) =>
                            patch(expense.id, { fundingId: event.target.value })
                          }
                          value={expense.fundingId}
                        >
                          {!plan.selectedFunding.includes(
                            expense.fundingId
                          ) && (
                            <option value={expense.fundingId}>
                              {plan.funding.find(
                                (fund) => fund.id === expense.fundingId
                              )?.name ?? 'Project not included'}{' '}
                              · excluded
                            </option>
                          )}
                          {plan.funding
                            .filter((fund) =>
                              plan.selectedFunding.includes(fund.id)
                            )
                            .map((fund) => (
                              <option key={fund.id} value={fund.id}>
                                {fund.name}
                                {fund.serverProject?.taskNumber &&
                                  ` · Task ${fund.serverProject.taskNumber}`}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <label className="input input-sm w-full">
                          <span className="text-base-content/50">$</span>
                          <input
                            aria-label="Amount"
                            className="text-right"
                            min={0}
                            onChange={(event) =>
                              patch(expense.id, {
                                amount: Math.max(
                                  0,
                                  readNumber(event.target.value)
                                ),
                              })
                            }
                            step={100}
                            type="number"
                            value={expense.amount}
                          />
                          {expense.frequency === 'monthly' && (
                            <span className="text-xs text-base-content/50">
                              /mo
                            </span>
                          )}
                        </label>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {money(planTotal(expense, months))}
                      </td>
                      <td>
                        <button
                          aria-label={`Remove ${expense.name}`}
                          className="btn btn-ghost btn-square btn-sm text-base-content/70 hover:bg-error/10 hover:text-error"
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
                          <TrashIcon className="size-4 shrink-0" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="totaltr">
                  <td colSpan={showCategories ? 7 : 6}>Total over plan</td>
                  <td className="text-right whitespace-nowrap">
                    {money(
                      visibleExpenses.reduce(
                        (sum, expense) => sum + planTotal(expense, months),
                        0
                      )
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      <p className="mt-5 leading-relaxed text-base-content/70 text-sm">
        {plan.serverProjection
          ? 'Monthly costs repeat through the selected ending month or project end. Spending estimates use the saved snapshot and selected history window. Editing a projected estimate’s dates or type makes it a planned expense.'
          : 'In this demo, other expenses are direct costs only. Monthly costs repeat from the selected month until the plan or funding source ends.'}
      </p>
    </>
  );
}

function expenseCategory(expense: PlanExpense) {
  return expense.serverExpense?.expenditureCategory ?? 'Other expenses';
}

function planTotal(expense: PlanExpense, months: string[]) {
  const endMonth = expense.serverExpense?.endMonth?.slice(0, 7);
  const activeMonths = months.filter((month) =>
    expense.frequency === 'once'
      ? month === expense.month
      : month >= expense.month && (!endMonth || month <= endMonth)
  ).length;
  return activeMonths * expense.amount;
}

function readNumber(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}
