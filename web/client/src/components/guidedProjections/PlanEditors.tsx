import { useId, useRef, useState } from 'react';
import {
  BanknotesIcon,
  CheckCircleIcon,
  ListBulletIcon,
  PlusIcon,
  TrashIcon,
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
              : 'Review your projects and add planned funding.'}
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
  const [editingEndId, setEditingEndId] = useState<string | null>(null);
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
  const projectedRows = rows
    .filter(isProjected)
    .sort((a, b) => expenseCategory(a).localeCompare(expenseCategory(b)));
  const plannedRows = rows.filter((expense) => !isProjected(expense));
  const monthlyRows = [
    ...projectedRows,
    ...plannedRows.filter((expense) => expense.frequency === 'monthly'),
  ];
  const oneTimeRows = plannedRows.filter(
    (expense) => expense.frequency === 'once'
  );
  const defaultCategory = EXPENSE_CATEGORIES[0];
  const patch = (id: string, changes: Partial<PlanExpense>) =>
    update({
      ...plan,
      expenses: plan.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...changes } : expense
      ),
    });
  const patchServer = (
    expense: PlanExpense,
    changes: Partial<ProjectionExpense>
  ) =>
    patch(expense.id, {
      serverExpense: { ...serverExpenseOf(expense), ...changes },
    });
  const remove = (id: string) =>
    update({
      ...plan,
      expenses: plan.expenses.filter((expense) => expense.id !== id),
    });
  function add(frequency: 'monthly' | 'once') {
    const id = crypto.randomUUID();
    const amount = frequency === 'once' ? 2500 : 500;
    const name = frequency === 'once' ? 'One-time expense' : 'Monthly expense';
    update({
      ...plan,
      expenses: [
        ...plan.expenses,
        {
          amount,
          frequency,
          fundingId,
          id,
          month: plan.startMonth,
          name,
          serverExpense: {
            amount,
            description: name,
            endMonth: null,
            expenditureCategory: defaultCategory,
            kind: frequency === 'once' ? 'OneTime' : 'Monthly',
            startMonth: `${plan.startMonth}-01`,
          },
        },
      ],
    });
    revealItem(id);
  }
  const amountCell = (expense: PlanExpense) => (
    <td className="text-right">
      <label className="input input-ghost input-sm w-full justify-end gap-1 px-1">
        <span className="text-base-content/50">$</span>
        <input
          aria-label="Amount"
          className="w-16 text-right"
          inputMode="numeric"
          onChange={(event) =>
            patch(expense.id, {
              amount: Math.max(
                0,
                readNumber(event.target.value.replaceAll(/[$,]/g, ''))
              ),
            })
          }
          value={expense.amount}
        />
        {expense.frequency === 'monthly' && (
          <span className="text-xs text-base-content/50">/mo</span>
        )}
      </label>
    </td>
  );
  const totalAndRemove = (expense: PlanExpense) => (
    <>
      <td className="text-right whitespace-nowrap">
        {money(planTotal(expense, months))}
      </td>
      <td className="text-right">
        <button
          aria-label={`Remove ${expense.name}`}
          className="btn btn-ghost btn-square btn-xs text-base-content/50 hover:bg-error/10 hover:text-error"
          onClick={() => remove(expense.id)}
          type="button"
        >
          <TrashIcon className="size-4 shrink-0" />
        </button>
      </td>
    </>
  );
  const ghostInput = 'input input-ghost input-sm w-full px-1';
  const sumPlanTotals = (expenses: PlanExpense[]) =>
    expenses.reduce((sum, expense) => sum + planTotal(expense, months), 0);
  const sectionHeader = (title: string) => (
    <tr className="bg-base-200/60">
      <th className="text-sm font-semibold" colSpan={8}>
        {title}
      </th>
    </tr>
  );
  const emptyRow = (message: string) => (
    <tr>
      <td className="text-base-content/80" colSpan={8}>
        {message}
      </td>
    </tr>
  );
  const subtotalRow = (
    label: string,
    expenses: PlanExpense[],
    perMonth: boolean
  ) =>
    expenses.length > 0 && (
      <tr className="font-semibold">
        <td colSpan={5}>{label}</td>
        <td className="text-right whitespace-nowrap">
          {money(expenses.reduce((sum, expense) => sum + expense.amount, 0))}
          {perMonth && (
            <span className="text-xs font-normal text-base-content/50">
              /mo
            </span>
          )}
        </td>
        <td className="text-right whitespace-nowrap">
          {money(sumPlanTotals(expenses))}
        </td>
        <td />
      </tr>
    );
  const plannedRow = (expense: PlanExpense) => (
    <tr
      className="hover:bg-base-200/50"
      key={expense.id}
      style={rowStyle(expense)}
    >
      <td>
        <select
          aria-label="Expenditure category"
          className="select select-ghost select-sm w-full px-1 [&::picker(select)]:bg-base-100"
          onChange={(event) =>
            patchServer(expense, {
              expenditureCategory: event.target.value,
            })
          }
          value={expenseCategory(expense)}
        >
          {[
            ...EXPENSE_CATEGORIES,
            ...(isStandardCategory(expenseCategory(expense))
              ? []
              : [expenseCategory(expense)]),
          ].map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </td>
      <td
        className="scroll-mt-24"
        ref={(element) => registerItem(expense.id, element)}
      >
        <input
          aria-label="Expense name"
          className={ghostInput}
          onChange={(event) => patch(expense.id, { name: event.target.value })}
          value={expense.name}
        />
      </td>
      <td>
        <select
          aria-label="Frequency"
          className="select select-ghost select-sm w-full px-1 [&::picker(select)]:bg-base-100"
          onChange={(event) => {
            const frequency =
              event.target.value === 'once' ? 'once' : 'monthly';
            patch(expense.id, {
              frequency,
              serverExpense: {
                ...serverExpenseOf(expense),
                kind: frequency === 'once' ? 'OneTime' : 'Monthly',
              },
            });
          }}
          value={expense.frequency}
        >
          <option value="monthly">Monthly</option>
          <option value="once">One time</option>
        </select>
      </td>
      <td>
        <input
          aria-label={
            expense.frequency === 'monthly' ? 'Starting month' : 'Month'
          }
          className={ghostInput}
          onChange={(event) =>
            patch(expense.id, {
              month: event.target.value || plan.startMonth,
            })
          }
          type="month"
          value={expense.month}
        />
      </td>
      <td>
        {expense.frequency === 'monthly' &&
          (expense.serverExpense?.endMonth || editingEndId === expense.id ? (
            <input
              aria-label="Ending month"
              autoFocus={!expense.serverExpense?.endMonth}
              className={ghostInput}
              min={expense.month}
              onBlur={() => setEditingEndId(null)}
              onChange={(event) =>
                patchServer(expense, {
                  endMonth: event.target.value
                    ? `${event.target.value}-01`
                    : null,
                })
              }
              title="Clear to run through the plan end."
              type="month"
              value={expense.serverExpense?.endMonth?.slice(0, 7) ?? ''}
            />
          ) : (
            <button
              aria-label="Ending month: Plan end"
              className="btn btn-ghost btn-sm w-full justify-start px-1 font-normal"
              onClick={() => setEditingEndId(expense.id)}
              type="button"
            >
              Plan end
            </button>
          ))}
      </td>
      {amountCell(expense)}
      {totalAndRemove(expense)}
    </tr>
  );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 [&_p]:mt-1 text-base">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ListBulletIcon aria-hidden="true" className="size-5 shrink-0" />
            Beyond staffing
          </h2>
          <p className="text-sm leading-relaxed text-base-content/80">
            Projected spending by category, plus any costs you plan to add.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            <label htmlFor={projectSelectId}>Project</label>
            <select
              className="select select-sm w-80 max-w-full"
              id={projectSelectId}
              onChange={(event) => setSelectedId(event.target.value)}
              value={fundingId}
            >
              {projects.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                  {fund.serverProject?.taskNumber &&
                    ` · Task ${fund.serverProject.taskNumber}`}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-outline"
            disabled={!fundingId}
            onClick={() => add('monthly')}
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-5 shrink-0" /> Add new
            expense
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table walter-table table-sm">
          <colgroup>
            <col className="w-80" />
            <col />
            <col className="w-28" />
            <col className="w-36" />
            <col className="w-36" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th>Expenditure Category</th>
              <th>Description</th>
              <th>Type</th>
              <th>Start</th>
              <th>End</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Plan Total</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sectionHeader('Monthly expenses')}
            {monthlyRows.length === 0 && emptyRow('No monthly expenses.')}
            {monthlyRows.map((expense) =>
              isProjected(expense) ? (
                <tr
                  className="hover:bg-base-200/50"
                  key={expense.id}
                  style={rowStyle(expense)}
                >
                  <td>{expenseCategory(expense)}</td>
                  <td className="text-base-content/80">
                    {plan.historyMonths ?? 6}-month average
                  </td>
                  <td>
                    <span className="badge badge-ghost badge-sm">
                      Projected
                    </span>
                  </td>
                  <td>{monthLabel(expense.month)}</td>
                  <td className="text-base-content/80">Plan end</td>
                  {amountCell(expense)}
                  {totalAndRemove(expense)}
                </tr>
              ) : (
                plannedRow(expense)
              )
            )}
            {subtotalRow('Monthly total', monthlyRows, true)}
            {sectionHeader('One-time expenses')}
            {oneTimeRows.length === 0 && emptyRow('No one-time expenses.')}
            {oneTimeRows.map(plannedRow)}
            {subtotalRow('One-time total', oneTimeRows, false)}
          </tbody>
          <tfoot>
            <tr className="totaltr">
              <td colSpan={6}>Total over plan</td>
              <td className="text-right whitespace-nowrap">
                {money(sumPlanTotals(rows))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-5 leading-relaxed text-base-content/80 text-sm">
        {plan.serverProjection
          ? 'Projected amounts use the saved snapshot and selected history window. Monthly costs repeat through the ending month or project end.'
          : 'In this demo, other expenses are direct costs only. Monthly costs repeat from the start month until the ending month, plan end, or funding end.'}
      </p>
    </>
  );
}

// Salary and fringe come from staffing, so expenses use the remaining categories.
const EXPENSE_CATEGORIES: string[] = EXPENDITURE_CATEGORIES.filter(
  (category) => !category.startsWith('01 ') && !category.startsWith('02 ')
);

function isStandardCategory(category: string) {
  return EXPENSE_CATEGORIES.includes(category);
}

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
