import { useId, useRef, useState } from 'react';
import {
  BanknotesIcon,
  CheckCircleIcon,
  ListBulletIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  monthLabel,
  type FundingSource,
} from '@/components/projections/projection.ts';
import {
  EXPENDITURE_CATEGORIES,
  projectExpenditureCategoryColor,
} from '@/components/project/projectChartColors.ts';
import type { ProjectionExpense } from '@/queries/projections.ts';
import { useRevealItem } from '@/shared/hooks/useRevealItem.ts';
import FundingSourceDetailsModal from '@/components/guidedProjections/FundingSourceDetailsModal.tsx';
import ExpenseDetailsModal from '@/components/guidedProjections/ExpenseDetailsModal.tsx';
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
      <div className="flex items-center justify-between text-sm text-base-content/80">
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
      <p className="text-sm text-base-content/80">{detail}</p>
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
  selectable = false,
  update,
}: {
  plan: ProjectionPlan;
  selectable?: boolean;
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
          <p className="text-sm leading-relaxed text-base-content/80">
            {selectable
              ? 'Select the funding sources to include in your plan. Highlighted cards are included.'
              : 'Review your funding sources and add planned funding.'}
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plan.funding.map((fund) => (
          <article
            aria-label={fund.name || 'Untitled funding source'}
            className={`relative min-w-0 scroll-mt-24 overflow-hidden rounded-lg border ${selectable ? `transition-colors ${plan.selectedFunding.includes(fund.id) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-main-border bg-base-100'}` : 'border-main-border bg-base-100'}`}
            key={fund.id}
            ref={(element) => registerItem(fund.id, element)}
          >
            {selectable && (
              <button
                aria-label={`Include ${fund.name || 'Untitled funding source'} in plan`}
                aria-pressed={plan.selectedFunding.includes(fund.id)}
                className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary"
                onClick={() =>
                  update({
                    ...plan,
                    selectedFunding: plan.selectedFunding.includes(fund.id)
                      ? plan.selectedFunding.filter((id) => id !== fund.id)
                      : [...plan.selectedFunding, fund.id],
                  })
                }
                type="button"
              />
            )}
            <div
              className={`flex h-full flex-col px-4 py-3 sm:px-5 ${selectable ? 'pointer-events-none relative' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="line-clamp-2 h-[2lh] min-w-0 flex-1 text-lg font-semibold leading-snug break-words">
                  {fund.name || 'Untitled funding source'}
                </h3>
                <div className="flex shrink-0 items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: fund.color }}
                  />
                  {selectable && (
                    <CheckCircleIcon
                      aria-hidden="true"
                      className={`size-6 shrink-0 ${plan.selectedFunding.includes(fund.id) ? 'text-primary' : 'text-base-content/20'}`}
                    />
                  )}
                </div>
              </div>
              <div className="mt-auto mb-3 flex min-h-5 items-center justify-between gap-x-4 pt-2 text-sm text-base-content/80">
                {fund.description && (
                  <span className="min-w-0 truncate">{fund.description}</span>
                )}
                {!plan.serverProjection && (
                  <span>{fund.indirectRate}% indirect</span>
                )}
                <span className="ms-auto shrink-0">
                  Ends {monthLabel(fund.endDate.slice(0, 7))}
                </span>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-main-border pt-3">
                <dl className="min-w-0">
                  <dt className="text-sm text-base-content/80">
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
                  className="btn btn-ghost btn-sm gap-2 text-primary pointer-events-auto relative"
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
          {selectable
            ? 'Select at least one funding source to continue.'
            : 'Add a funding source to continue.'}
        </p>
      )}
      <p className="mt-5 leading-relaxed text-base-content/80 text-sm">
        Balances already account for recorded expenses and commitments. Your
        changes apply to this plan only.
      </p>
    </div>
  );
}

export function ExpenseEditor({
  plan,
  projectId,
  update,
}: {
  plan: ProjectionPlan;
  /** Project to show first, such as the one being viewed in the workspace. */
  projectId?: string | null;
  update: (plan: ProjectionPlan) => void;
}) {
  const projectSelectId = useId();
  const [editing, setEditing] = useState<{
    expense: PlanExpense;
    isNew: boolean;
  } | null>(null);
  const { registerItem, revealItem } = useRevealItem();
  const projects = plan.funding.filter((fund) =>
    plan.selectedFunding.includes(fund.id)
  );
  const [selectedId, setSelectedId] = useState(
    () => projectId ?? projects[0]?.id ?? ''
  );
  const fundingId = projects.some((fund) => fund.id === selectedId)
    ? selectedId
    : (projects[0]?.id ?? '');
  const months = planMonths(plan);
  const rows = plan.expenses.filter(
    (expense) => expense.fundingId === fundingId
  );
  const monthlyRows = [
    ...rows
      .filter(isProjected)
      .sort((a, b) => expenseCategory(a).localeCompare(expenseCategory(b))),
    ...rows.filter(
      (expense) => !isProjected(expense) && expense.frequency === 'monthly'
    ),
  ];
  const oneTimeRows = rows.filter(
    (expense) => !isProjected(expense) && expense.frequency === 'once'
  );
  const sumPlanTotals = (expenses: PlanExpense[]) =>
    expenses.reduce((sum, expense) => sum + planTotal(expense, months), 0);
  function add() {
    const expense: PlanExpense = {
      amount: 500,
      frequency: 'monthly',
      fundingId,
      id: crypto.randomUUID(),
      month: plan.startMonth,
      name: 'Monthly expense',
      serverExpense: {
        amount: 500,
        description: 'Monthly expense',
        endMonth: null,
        expenditureCategory: EXPENSE_CATEGORIES[0],
        kind: 'Monthly',
        startMonth: `${plan.startMonth}-01`,
      },
    };
    setEditing({ expense, isNew: true });
  }
  function saveExpense(expense: PlanExpense) {
    update({
      ...plan,
      expenses: editing?.isNew
        ? [...plan.expenses, expense]
        : plan.expenses.map((row) => (row.id === expense.id ? expense : row)),
    });
    revealItem(expense.id, { focus: false });
  }
  const renderRow = (expense: PlanExpense) => (
    <tr
      className="hover:bg-base-200/50 scroll-mt-24"
      key={expense.id}
      ref={(element) => registerItem(expense.id, element)}
      style={rowStyle(expense)}
    >
      <td className="min-w-56">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {isProjected(expense) ? expenseCategory(expense) : expense.name}
            </p>
            <p className="mt-0.5 text-sm text-base-content/80">
              {isProjected(expense)
                ? `${plan.historyMonths ?? 6}-month average`
                : expenseCategory(expense)}
            </p>
          </div>
          <button
            aria-label={`Edit ${expense.name}`}
            className="btn btn-ghost btn-sm shrink-0"
            onClick={() => setEditing({ expense, isNew: false })}
            type="button"
          >
            Edit
          </button>
        </div>
      </td>
      <td>
        <span
          className={`badge badge-soft badge-sm ${isProjected(expense) ? 'badge-neutral' : 'badge-primary'}`}
        >
          {isProjected(expense) ? 'Projected' : 'Planned'}
        </span>
      </td>
      <td className="text-sm whitespace-nowrap">
        <p>{expense.frequency === 'once' ? 'One time' : 'Monthly'}</p>
        <p className="mt-0.5 text-base-content/80">
          {monthLabel(expense.month)}
          {expense.frequency === 'monthly' && (
            <>
              {' '}
              –{' '}
              {expense.serverExpense?.endMonth
                ? monthLabel(expense.serverExpense.endMonth.slice(0, 7))
                : 'Plan end'}
            </>
          )}
        </p>
      </td>
      <td className="text-right whitespace-nowrap tabular-nums">
        {isProjected(expense) ? (
          <label className="input input-sm w-36 justify-end gap-1">
            <span className="text-base-content/80">$</span>
            <input
              aria-label="Amount"
              className="min-w-0 text-right tabular-nums"
              inputMode="decimal"
              onChange={(event) =>
                update({
                  ...plan,
                  expenses: plan.expenses.map((row) =>
                    row.id === expense.id
                      ? {
                          ...row,
                          amount: Math.max(
                            0,
                            readNumber(
                              event.target.value.replaceAll(/[$,]/g, '')
                            )
                          ),
                        }
                      : row
                  ),
                })
              }
              value={expense.amount}
            />
            <span className="text-xs text-base-content/80">/mo</span>
          </label>
        ) : (
          <>
            {money(expense.amount)}
            {expense.frequency === 'monthly' && (
              <span className="ml-1 text-xs text-base-content/80">/mo</span>
            )}
          </>
        )}
      </td>
      <td className="text-right font-semibold whitespace-nowrap tabular-nums">
        {money(planTotal(expense, months))}
      </td>
    </tr>
  );
  const renderGroup = (title: string, expenses: PlanExpense[]) =>
    expenses.length > 0 && (
      <tbody>
        <tr className="bg-base-200">
          <th className="text-sm font-semibold" colSpan={5} scope="rowgroup">
            {title}
          </th>
        </tr>
        {expenses.map(renderRow)}
      </tbody>
    );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ListBulletIcon aria-hidden="true" className="size-5 shrink-0" />
            Expenses
          </h2>
          <p className="mt-1 text-sm text-base-content/80">
            Review projected costs and add planned expenses.
          </p>
        </div>
        <button
          className="btn btn-outline"
          disabled={!fundingId}
          onClick={add}
          type="button"
        >
          <PlusIcon aria-hidden="true" className="size-5 shrink-0" />
          Add new expense
        </button>
      </div>
      <label
        className="mb-5 grid w-full min-w-0 gap-1.5 text-sm font-medium sm:max-w-3xl"
        htmlFor={projectSelectId}
      >
        Project
        <select
          className="select w-full min-w-0 truncate pr-10"
          id={projectSelectId}
          onChange={(event) => setSelectedId(event.target.value)}
          title={projects.find((fund) => fund.id === fundingId)?.name}
          value={fundingId}
        >
          {!projects.length && (
            <option value="">No funding sources available</option>
          )}
          {projects.map((fund) => (
            <option key={fund.id} value={fund.id}>
              {fund.name}
              {fund.serverProject?.taskNumber &&
                ` · Task ${fund.serverProject.taskNumber}`}
            </option>
          ))}
        </select>
      </label>
      <div className="overflow-hidden rounded-lg border border-main-border">
        <dl className="grid gap-4 border-b border-main-border bg-base-200 p-5 sm:grid-cols-3 sm:gap-6">
          <div>
            <dt className="text-sm text-base-content/80">Monthly expenses</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {money(
                monthlyRows.reduce((sum, expense) => sum + expense.amount, 0)
              )}
              <span className="ml-1 text-sm font-normal text-base-content/80">
                /mo
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-base-content/80">One-time expenses</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {money(sumPlanTotals(oneTimeRows))}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-base-content/80">Total over plan</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {money(sumPlanTotals(rows))}
            </dd>
          </div>
        </dl>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table walter-table text-sm">
              <thead>
                <tr>
                  <th scope="col">Expense</th>
                  <th scope="col">Source</th>
                  <th scope="col">Schedule</th>
                  <th className="text-right" scope="col">
                    Amount
                  </th>
                  <th className="text-right" scope="col">
                    Plan total
                  </th>
                </tr>
              </thead>
              {renderGroup('Monthly expenses', monthlyRows)}
              {renderGroup('One-time expenses', oneTimeRows)}
            </table>
          </div>
        ) : (
          <div className="p-6 text-center">
            <h3 className="font-semibold">No expenses yet</h3>
            <p className="mt-1 text-sm text-base-content/80">
              {fundingId
                ? 'Add an expense to plan costs beyond staffing for this project.'
                : 'Add a funding source before planning expenses.'}
            </p>
          </div>
        )}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-base-content/80">
        Projected expenses use the {plan.historyMonths ?? 6}-month historical
        average and can be adjusted in the table. Planned expenses are costs you
        add to this scenario.
      </p>
      {editing && (
        <ExpenseDetailsModal
          categories={EXPENSE_CATEGORIES}
          expense={{
            ...editing.expense,
            serverExpense: serverExpenseOf(editing.expense),
          }}
          isNew={editing.isNew}
          key={editing.expense.id}
          onApply={saveExpense}
          onClose={() => setEditing(null)}
          onRemove={() => {
            update({
              ...plan,
              expenses: plan.expenses.filter(
                (expense) => expense.id !== editing.expense.id
              ),
            });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

// Salary and fringe come from staffing, so expenses use the remaining categories.
const EXPENSE_CATEGORIES: string[] = EXPENDITURE_CATEGORIES.filter(
  (category) => !category.startsWith('01 ') && !category.startsWith('02 ')
);

function rowStyle(expense: PlanExpense) {
  return {
    borderLeft: `3px solid ${projectExpenditureCategoryColor(
      expenseCategory(expense)
    )}`,
  };
}

function isProjected(expense: PlanExpense) {
  return expense.serverExpense?.kind === 'Projected';
}

function expenseCategory(expense: PlanExpense) {
  return expense.serverExpense?.expenditureCategory ?? 'Other expenses';
}

function serverExpenseOf(expense: PlanExpense): ProjectionExpense {
  return (
    expense.serverExpense ?? {
      amount: expense.amount,
      description: expense.name,
      endMonth: null,
      expenditureCategory: 'Other expenses',
      kind: expense.frequency === 'once' ? 'OneTime' : 'Monthly',
      startMonth: `${expense.month}-01`,
    }
  );
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
