import { useMemo } from 'react';
import { ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';
import { monthLabel } from '@/components/projections/projection.ts';
import {
  projectionMoney,
  projectionExactMoney,
} from '@/components/projections/projectionFormatting.ts';
import {
  compareScenario,
  evaluatePreview,
  type ProjectionPlan,
  type Scenario,
  type ScenarioOperation,
} from '@/components/projections/scenarios.ts';

type ReviewProps = {
  asOf: string;
  onApply: (draft: ProjectionPlan) => void;
  onChange: (scenario: Scenario) => void;
  plan: ProjectionPlan;
  scenario: Scenario;
  stale: boolean;
};

export function ScenarioPreview({
  asOf,
  onApply,
  onChange,
  onDismiss,
  onExpand,
  plan,
  scenario,
  stale,
}: ReviewProps & {
  onDismiss: () => void;
  onExpand: () => void;
}) {
  const result = useMemo(
    () => evaluatePreview(plan, scenario, asOf),
    [plan, scenario, asOf]
  );
  return (
    <section aria-label="Proposed scenario" className="projection-proposal">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="projection-eyebrow">Proposed change</p>
          <h3 className="mt-1 font-semibold">{scenario.title}</h3>
        </div>
        <button
          aria-label="Dismiss proposal"
          className="projection-icon-button"
          onClick={onDismiss}
          type="button"
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-xs text-[#667277]">
        Preview only. Your working plan has not changed.
      </p>
      {result.comparison && (
        <div aria-live="polite" className="my-3 space-y-3">
          {result.comparison.sources.map((source) => (
            <div className="border-t border-[#d8e3de] pt-2" key={source.id}>
              <p className="text-xs text-[#586861]">{source.name}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-2 tabular-nums">
                <span className="text-sm text-[#667277]">
                  {projectionMoney(source.original.remainingBalance)}
                </span>
                <span aria-label="becomes">→</span>
                <strong
                  className={
                    source.proposed.remainingBalance < 0
                      ? 'text-[#ac3e36]'
                      : 'text-[#215d57]'
                  }
                >
                  {projectionMoney(source.proposed.remainingBalance)}
                </strong>
              </p>
              <p className="mt-1 text-xs text-[#667277]">
                {Math.abs(source.costChange) < 0.01
                  ? 'Personnel costs unchanged'
                  : `${projectionMoney(Math.abs(source.costChange))} ${source.costChange > 0 ? 'more' : 'less'} in personnel costs`}
              </p>
            </div>
          ))}
        </div>
      )}
      <details className="my-3">
        <summary className="cursor-pointer text-sm font-medium text-[#215d57]">
          Adjust assumptions
        </summary>
        <div className="mt-3">
          <ScenarioEditor onChange={onChange} plan={plan} scenario={scenario} />
        </div>
      </details>
      <ReviewError error={result.error} stale={stale} />
      <div className="grid gap-2">
        <button
          className="projection-secondary-button"
          disabled={stale}
          onClick={onExpand}
          type="button"
        >
          <ArrowsPointingOutIcon className="size-4" />
          Explore scenario
        </button>
        <button
          className="projection-primary-button"
          disabled={!result.draft || stale}
          onClick={() => result.draft && onApply(result.draft)}
          type="button"
        >
          Apply to plan
        </button>
      </div>
    </section>
  );
}

export function ScenarioComparison({
  asOf,
  onApply,
  onChange,
  onClose,
  plan,
  scenario,
  stale,
}: ReviewProps & { onClose: () => void }) {
  const ref = useProjectionDialog();
  const result = useMemo(
    () => evaluatePreview(plan, scenario, asOf),
    [plan, scenario, asOf]
  );
  return (
    <dialog
      aria-labelledby="projection-comparison-title"
      className="projection-comparison-dialog"
      onCancel={onClose}
      ref={ref}
    >
      <div className="border-b border-[#d8ddd6] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="projection-eyebrow">Explore scenario</p>
            <h2
              className="mt-1 text-2xl font-semibold"
              id="projection-comparison-title"
            >
              {scenario.title}
            </h2>
            <p className="mt-2 text-sm text-[#667277]">
              Adjust the proposal and compare it with your current plan.
            </p>
          </div>
          <button
            aria-label="Close comparison"
            className="projection-icon-button"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <ScenarioEditor
          expanded
          onChange={onChange}
          plan={plan}
          scenario={scenario}
        />
        <ReviewError error={result.error} stale={stale} />
        {result.comparison && (
          <div aria-live="polite" className="mt-6 grid gap-5 md:grid-cols-2">
            {(['original', 'proposed'] as const).map((side) => (
              <section
                className={`rounded-lg border p-4 ${side === 'proposed' ? 'border-[#8eb8af] bg-[#f3f9f6]' : 'border-[#d8ddd6] bg-white'}`}
                key={side}
              >
                <h3 className="text-lg font-semibold">
                  {side === 'original' ? 'Current plan' : 'Proposed plan'}
                </h3>
                <p className="mb-5 mt-1 text-xs text-[#667277]">
                  {side === 'original'
                    ? 'Kept as it is until you apply'
                    : 'Calculated with the assumptions above'}
                </p>
                {result.comparison!.sources.map((source) => (
                  <ComparisonFund
                    comparison={result.comparison!}
                    key={source.id}
                    side={side}
                    sourceId={source.id}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#d8ddd6] bg-[#f8faf7] p-5 sm:p-6">
        <p className="max-w-xl text-xs text-[#667277]">
          Salary, fringe, and indirect costs are included. Funding availability
          alone does not establish eligibility. Changes stay in this demo.
        </p>
        <div className="flex gap-2">
          <button
            className="projection-secondary-button"
            onClick={onClose}
            type="button"
          >
            Back to copilot
          </button>
          <button
            className="projection-primary-button"
            disabled={!result.draft || stale}
            onClick={() => result.draft && onApply(result.draft)}
            type="button"
          >
            Apply to plan
          </button>
        </div>
      </footer>
    </dialog>
  );
}

function ComparisonFund({
  comparison,
  side,
  sourceId,
}: {
  comparison: ReturnType<typeof compareScenario>;
  side: 'original' | 'proposed';
  sourceId: string;
}) {
  const source = comparison.sources.find((row) => row.id === sourceId)!;
  const before = comparison.before.fundingMonths.filter(
    (row) => row.sourceId === sourceId
  );
  const after = comparison.after.fundingMonths.filter(
    (row) => row.sourceId === sourceId
  );
  const values = [...before, ...after].flatMap((row) =>
    row.remainingBalance === null ? [] : [row.remainingBalance]
  );
  const low = Math.min(0, ...values),
    high = Math.max(0, ...values);
  const padding = Math.max(1, (high - low) * 0.1);
  const rows = (side === 'original' ? before : after).map((row) => ({
    balance: row.remainingBalance,
    month: monthLabel(row.month),
  }));
  const summary = source[side];
  return (
    <div className="mt-4 border-t border-[#d8ddd6] pt-4">
      <p className="text-xs text-[#667277]">{source.id}</p>
      <h4 className="mt-1 text-sm font-medium">{source.name}</h4>
      <p className="mt-3 text-xs text-[#667277]">Ending balance</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${summary.remainingBalance < 0 ? 'text-[#ac3e36]' : 'text-[#215d57]'}`}
      >
        {projectionExactMoney(summary.remainingBalance)}
      </p>
      <p className="mt-1 text-xs text-[#667277]">
        {summary.deficitMonths.length
          ? `First deficit: ${monthLabel(summary.deficitMonths[0])}`
          : 'No projected deficit'}
      </p>
      <div
        aria-label={`${source.name}, ${side} monthly remaining balance. Ending ${projectionExactMoney(summary.remainingBalance)}.`}
        className="my-3 h-40"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={rows}
            margin={{ bottom: 4, left: 0, right: 10, top: 8 }}
          >
            <CartesianGrid stroke="#dfe5df" vertical={false} />
            <XAxis dataKey="month" minTickGap={35} tick={{ fontSize: 11 }} />
            <YAxis
              domain={[low - padding, high + padding]}
              tick={{ fontSize: 11 }}
              tickFormatter={(value: number) =>
                `${value < 0 ? '−' : ''}$${Math.abs(value / 1000).toFixed(0)}k`
              }
              width={68}
            />
            <ReferenceLine stroke="#a45750" strokeDasharray="4 3" y={0} />
            <Tooltip
              formatter={(value) =>
                typeof value === 'number' ? projectionExactMoney(value) : '—'
              }
            />
            <Line
              dataKey="balance"
              dot={false}
              isAnimationActive={false}
              name="Remaining"
              stroke={side === 'original' ? '#788b83' : '#2f7f79'}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[#667277]">
        Personnel drawdown: {projectionExactMoney(summary.totalDrawdown)}
      </p>
    </div>
  );
}

function ReviewError({
  error,
  stale,
}: {
  error: string | null;
  stale: boolean;
}) {
  return error || stale ? (
    <p
      className="my-3 rounded-md border border-[#e5b7ac] bg-[#fff1ec] p-3 text-sm text-[#9a392a]"
      role="alert"
    >
      {stale
        ? 'Your plan changed after this proposal. Ask the copilot to refresh it before applying.'
        : error}
    </p>
  ) : null;
}

function ScenarioEditor({
  expanded = false,
  onChange,
  plan,
  scenario,
}: {
  expanded?: boolean;
  onChange: (scenario: Scenario) => void;
  plan: ProjectionPlan;
  scenario: Scenario;
}) {
  function change(index: number, operation: ScenarioOperation) {
    const operations = scenario.operations.map((current, position) =>
      position === index ? operation : current
    );
    const first = operations[0];
    const title =
      operations.length === 1 && first.type === 'hire'
        ? `Hire ${first.name || 'a new person'}`
        : 'Adjusted scenario';
    onChange({
      ...scenario,
      assumptions: [
        'Adjusted in the scenario editor. The fields shown are the current assumptions.',
      ],
      operations,
      title,
    });
  }
  return (
    <div className="space-y-4">
      {scenario.operations.map((operation, index) => (
        <OperationEditor
          expanded={expanded}
          key={`${index}-${operation.type}`}
          onChange={(value) => change(index, value)}
          operation={operation}
          plan={plan}
        />
      ))}
      {scenario.assumptions.length > 0 && (
        <div className="text-xs text-[#667277]">
          <p className="mb-1 font-medium">Assumptions</p>
          <ul className="list-disc space-y-1 pl-4">
            {scenario.assumptions.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OperationEditor({
  expanded,
  onChange,
  operation,
  plan,
}: {
  expanded: boolean;
  onChange: (operation: ScenarioOperation) => void;
  operation: ScenarioOperation;
  plan: ProjectionPlan;
}) {
  const fields = `grid gap-3 ${expanded ? 'sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`;
  const person =
    'personId' in operation
      ? plan.people.find((row) => row.id === operation.personId)
      : null;
  const source =
    operation.type === 'funding'
      ? plan.fundingSources.find((row) => row.id === operation.fundingSourceId)
      : null;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-semibold">
        {operation.type === 'hire'
          ? 'New person'
          : operation.type === 'funding'
            ? source?.name
            : person?.name}
      </legend>
      <div className={fields}>
        {operation.type === 'hire' && (
          <label className="projection-field col-span-2">
            Name
            <input
              onChange={(e) => onChange({ ...operation, name: e.target.value })}
              value={operation.name}
            />
          </label>
        )}
        {(operation.type === 'hire' || operation.type === 'person') && (
          <>
            <NumberField
              label="Annual salary at 100%"
              onChange={(annualSalary) =>
                onChange({ ...operation, annualSalary })
              }
              value={operation.annualSalary}
            />
            <NumberField
              label="Fringe %"
              max={100}
              onChange={(fringeRate) => onChange({ ...operation, fringeRate })}
              value={operation.fringeRate}
            />
          </>
        )}
        {operation.type === 'hire' && (
          <>
            <NumberField
              label="Appointment %"
              max={100}
              onChange={(percent) => onChange({ ...operation, percent })}
              value={operation.percent}
            />
            <label className="projection-field">
              Funding project
              <select
                onChange={(e) =>
                  onChange({ ...operation, fundingSourceId: e.target.value })
                }
                value={operation.fundingSourceId}
              >
                {plan.fundingSources.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {(operation.type === 'hire' || operation.type === 'allocate') && (
          <>
            <label className="projection-field">
              Start month
              <input
                onChange={(e) =>
                  onChange({ ...operation, startMonth: e.target.value })
                }
                type="month"
                value={operation.startMonth}
              />
            </label>
            <label className="projection-field">
              End month
              <input
                onChange={(e) =>
                  onChange({ ...operation, endMonth: e.target.value })
                }
                type="month"
                value={operation.endMonth}
              />
            </label>
          </>
        )}
        {operation.type === 'allocate' && (
          <div className="col-span-2 space-y-2">
            {operation.splits.map((split, index) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_75px_auto] items-end gap-2"
                key={index}
              >
                <label className="projection-field">
                  Funding project
                  <select
                    onChange={(e) =>
                      onChange({
                        ...operation,
                        splits: operation.splits.map((row, i) =>
                          i === index
                            ? { ...row, fundingSourceId: e.target.value }
                            : row
                        ),
                      })
                    }
                    value={split.fundingSourceId}
                  >
                    {plan.fundingSources.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label="Percent"
                  max={100}
                  onChange={(percent) =>
                    onChange({
                      ...operation,
                      splits: operation.splits.map((row, i) =>
                        i === index ? { ...row, percent } : row
                      ),
                    })
                  }
                  value={split.percent}
                />
                <button
                  aria-label={`Remove split ${index + 1}`}
                  className="projection-icon-button"
                  onClick={() =>
                    onChange({
                      ...operation,
                      splits: operation.splits.filter((_, i) => i !== index),
                    })
                  }
                  type="button"
                >
                  <XMarkIcon className="size-4" />
                </button>
              </div>
            ))}
            <button
              className="projection-text-button"
              disabled={operation.splits.length >= plan.fundingSources.length}
              onClick={() => {
                const fund = plan.fundingSources.find(
                  (row) =>
                    !operation.splits.some(
                      (split) => split.fundingSourceId === row.id
                    )
                );
                if (fund) {
                  onChange({
                    ...operation,
                    splits: [
                      ...operation.splits,
                      { fundingSourceId: fund.id, percent: 0 },
                    ],
                  });
                }
              }}
              type="button"
            >
              Add funding split
            </button>
            {!operation.splits.length && (
              <p className="text-xs text-[#667277]">
                Clears funding allocations for these months.
              </p>
            )}
          </div>
        )}
        {operation.type === 'person' && (
          <p className="col-span-2 text-xs text-[#667277]">
            Applies to this person&apos;s entire modeled appointment.
          </p>
        )}
        {operation.type === 'funding' && (
          <>
            <NumberField
              label="Starting balance"
              min={-1_000_000_000}
              onChange={(startingBalance) =>
                onChange({ ...operation, startingBalance })
              }
              value={operation.startingBalance}
            />
            <NumberField
              label="Indirect %"
              max={100}
              onChange={(indirectRate) =>
                onChange({ ...operation, indirectRate })
              }
              value={operation.indirectRate}
            />
            <label className="projection-field">
              Funding start
              <input
                onChange={(e) =>
                  onChange({ ...operation, startDate: e.target.value })
                }
                type="date"
                value={operation.startDate}
              />
            </label>
            <label className="projection-field">
              Funding end
              <input
                onChange={(e) =>
                  onChange({ ...operation, endDate: e.target.value })
                }
                type="date"
                value={operation.endDate}
              />
            </label>
            <p className="col-span-2 text-xs text-[#667277]">
              Balance changes take effect at the start of the fund.
            </p>
          </>
        )}
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  max,
  min = 0,
  onChange,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="projection-field">
      {label}
      <input
        max={max}
        min={min}
        onChange={(e) =>
          onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))
        }
        step="any"
        type="number"
        value={Number.isFinite(value) ? value : ''}
      />
    </label>
  );
}
