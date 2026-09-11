import '@/components/projections/projectionLab.css';
import { useProjectionDialog } from '@/components/projections/useProjectionDialog.ts';
import { Link } from '@tanstack/react-router';
import type { ProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  ArrowPathIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import {
  applyAllocationRun,
  clampPercent,
  deriveTimelineMonths,
  isFundingSourceActiveInMonth,
  monthLabel,
  monthToIndex,
  monthsBetweenInclusive,
  projectPlan,
  type AllocationRunInput,
  type FundingMonthProjection,
  type FundingSource,
  type MonthlyAllocation,
  type Person,
} from '@/components/projections/projection.ts';
import {
  buildFundingChartData,
  type FundingChartPoint,
} from '@/components/projections/fundingChart.ts';

const sourceColors = ['#2f7f79', '#5f7fd3', '#cc7a28', '#7a5bc7', '#7aa846'];

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 1,
  notation: 'compact',
  style: 'currency',
});

const formatCompactCurrency = (value: number) =>
  compactCurrencyFormatter.format(value);

type AllocationEditorState = AllocationRunInput & {
  anchorMonth: string;
  anchorRect: AllocationAnchorRect;
};

type AllocationAnchorRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type AddDialog = 'funding-source' | 'person' | null;

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

export default function ProjectionLab({
  iamId,
  initialPlan,
}: {
  iamId: string;
  initialPlan: ProjectionDemoPlan;
}) {
  const {
    allocations: initialAllocations,
    fundingSources: initialFundingSources,
    people: initialPeople,
  } = initialPlan;
  const [fundingSources, setFundingSources] = useState(initialFundingSources);
  const [people, setPeople] = useState(initialPeople);
  const [allocations, setAllocations] = useState(initialAllocations);
  const [sourceDraft, setSourceDraft] = useState({
    endDate: initialPlan.planningEndDate,
    indirectRate: 0,
    name: '',
    startDate: `${initialPlan.asOf}-01`,
    startingBalance: 75_000,
  });
  const [personDraft, setPersonDraft] = useState({
    annualSalary: 90_000,
    fringeRate: 25,
    name: '',
  });
  const [addDialog, setAddDialog] = useState<AddDialog>(null);
  const [allocationEditor, setAllocationEditor] =
    useState<AllocationEditorState | null>(null);

  const months = useMemo(
    () => deriveTimelineMonths(fundingSources, allocations),
    [allocations, fundingSources]
  );

  const projection = useMemo(
    () => projectPlan({ allocations, fundingSources, months, people }),
    [allocations, fundingSources, months, people]
  );

  const sourceById = useMemo(
    () => new Map(fundingSources.map((source) => [source.id, source])),
    [fundingSources]
  );
  const personById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people]
  );

  const totalBalance = projection.fundingSummaries.reduce(
    (total, summary) => total + summary.remainingBalance,
    0
  );
  const totalDrawdown = projection.drawdowns.reduce(
    (total, drawdown) => total + drawdown.totalCost,
    0
  );
  const deficitCount = projection.fundingSummaries.reduce(
    (total, summary) => total + summary.deficitMonths.length,
    0
  );
  const invalidCount = projection.invalidAllocations.length;

  function addFundingSource() {
    if (!sourceDraft.name.trim()) {
      return;
    }

    const nextSource: FundingSource = {
      color: sourceColors[fundingSources.length % sourceColors.length],
      endDate: sourceDraft.endDate,
      id: createId('source'),
      indirectRate: clampPercent(Number(sourceDraft.indirectRate)),
      name: sourceDraft.name.trim(),
      startDate: sourceDraft.startDate,
      startingBalance: Number(sourceDraft.startingBalance),
    };

    setFundingSources((current) => [...current, nextSource]);
    setAddDialog(null);
    setSourceDraft({
      endDate: initialPlan.planningEndDate,
      indirectRate: 0,
      name: '',
      startDate: `${initialPlan.asOf}-01`,
      startingBalance: 75_000,
    });
  }

  function addPerson() {
    if (!personDraft.name.trim()) {
      return;
    }

    const nextPerson: Person = {
      annualSalary: Number(personDraft.annualSalary),
      fringeRate: clampPercent(Number(personDraft.fringeRate)),
      id: createId('person'),
      name: personDraft.name.trim(),
    };

    setPeople((current) => [...current, nextPerson]);
    setAddDialog(null);
    setPersonDraft({ annualSalary: 90_000, fringeRate: 25, name: '' });
  }

  function updateFundingSource(id: string, patch: Partial<FundingSource>) {
    setFundingSources((current) =>
      current.map((source) =>
        source.id === id ? { ...source, ...patch } : source
      )
    );
  }

  function updatePerson(id: string, patch: Partial<Person>) {
    setPeople((current) =>
      current.map((person) =>
        person.id === id ? { ...person, ...patch } : person
      )
    );
  }

  function deleteFundingSource(id: string) {
    setFundingSources((current) =>
      current.filter((source) => source.id !== id)
    );
    setAllocations((current) =>
      current.filter((allocation) => allocation.fundingSourceId !== id)
    );
    setAllocationEditor((current) =>
      current
        ? {
            ...current,
            splits: current.splits.filter(
              (split) => split.fundingSourceId !== id
            ),
          }
        : current
    );
  }

  function deletePerson(id: string) {
    setPeople((current) => current.filter((person) => person.id !== id));
    setAllocations((current) =>
      current.filter((allocation) => allocation.personId !== id)
    );
    setAllocationEditor((current) =>
      current?.personId === id ? null : current
    );
  }

  function openAllocationEditor(
    personId: string,
    month: string,
    anchorRect: AllocationAnchorRect
  ) {
    const splits = allocations
      .filter(
        (allocation) =>
          allocation.personId === personId && allocation.month === month
      )
      .map((allocation) => ({
        fundingSourceId: allocation.fundingSourceId,
        percent: allocation.percent,
      }));

    setAllocationEditor({
      anchorMonth: month,
      anchorRect,
      endMonth: month,
      personId,
      splits,
      startMonth: month,
    });
  }

  function changeAllocationEditor(patch: Partial<AllocationEditorState>) {
    setAllocationEditor((current) =>
      current ? { ...current, ...patch } : current
    );
  }

  function addEditorSplit() {
    setAllocationEditor((current) => {
      if (!current) {
        return current;
      }

      const used = new Set(
        current.splits.map((split) => split.fundingSourceId)
      );
      const nextSource =
        fundingSources.find((source) => !used.has(source.id)) ??
        fundingSources[0];

      if (!nextSource) {
        return current;
      }

      if (current.splits.length === 0) {
        return {
          ...current,
          splits: [{ fundingSourceId: nextSource.id, percent: 100 }],
        };
      }

      if (current.splits.length === 1 && current.splits[0].percent === 100) {
        return {
          ...current,
          splits: [
            { ...current.splits[0], percent: 50 },
            { fundingSourceId: nextSource.id, percent: 50 },
          ],
        };
      }

      return {
        ...current,
        splits: [
          ...current.splits,
          { fundingSourceId: nextSource.id, percent: 0 },
        ],
      };
    });
  }

  function updateEditorSplit(
    index: number,
    patch: Partial<AllocationRunInput['splits'][number]>
  ) {
    setAllocationEditor((current) =>
      current
        ? {
            ...current,
            splits: current.splits.map((split, splitIndex) =>
              splitIndex === index ? { ...split, ...patch } : split
            ),
          }
        : current
    );
  }

  function removeEditorSplit(index: number) {
    setAllocationEditor((current) =>
      current
        ? {
            ...current,
            splits: current.splits.filter(
              (_, splitIndex) => splitIndex !== index
            ),
          }
        : current
    );
  }

  function saveAllocationEditor() {
    if (!allocationEditor) {
      return;
    }

    setAllocations((current) => applyAllocationRun(current, allocationEditor));
    setAllocationEditor(null);
  }

  function resetPlan() {
    setFundingSources(initialFundingSources);
    setPeople(initialPeople);
    setAllocations(initialAllocations);
    setAllocationEditor(null);
    setAddDialog(null);
  }

  return (
    <main className="projection-lab min-h-screen bg-[#f5f6f2] text-[#1f2a2e]">
      <header className="border-b border-[#d8ddd6] bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#2f7f79] text-white">
              <ChartBarIcon aria-hidden="true" className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">ProjectionLab</h1>
              <p className="text-sm text-[#667277]">
                {initialPlan.ownerName} · Monthly funding drawdown from people
                allocations
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              className="rounded-full border border-[#cbd5d1] px-3 py-1.5 text-[#39464b]"
              params={{ iamId }}
              to="/projects/$iamId"
            >
              Back to projects
            </Link>
            <Badge icon={<BanknotesIcon className="size-4" />} tone="green">
              {fundingSources.length} funding sources
            </Badge>
            <Badge icon={<UserGroupIcon className="size-4" />} tone="blue">
              {people.length} people
            </Badge>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-[#cbd5d1] bg-white px-3 py-1.5 font-medium text-[#39464b] hover:border-[#8ca6a0]"
              onClick={resetPlan}
              type="button"
            >
              <ArrowPathIcon aria-hidden="true" className="size-4" />
              Reset plan
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1760px] space-y-5 px-5 py-5 lg:px-8">
        <p className="text-sm text-[#667277]">
          Demo plan from {initialPlan.asOf}. Starting balances are after
          expenses and commitments. Only future salary, fringe, and indirect
          costs are projected. Changes last until you leave or reload this page.
        </p>
        <SummaryCard
          deficitCount={deficitCount}
          invalidCount={invalidCount}
          totalBalance={totalBalance}
          totalDrawdown={totalDrawdown}
        />

        <section className="min-w-0 space-y-5">
          {(projection.invalidAllocations.length > 0 ||
            projection.allocationValidations.some(
              (validation) => validation.overAllocated
            )) && (
            <ValidationPanel
              personById={personById}
              projection={projection}
              sourceById={sourceById}
            />
          )}

          <Timeline
            allocations={allocations}
            fundingSources={fundingSources}
            months={months}
            onAddFundingSource={() => setAddDialog('funding-source')}
            onAddPerson={() => setAddDialog('person')}
            onPersonChange={updatePerson}
            onPersonDelete={deletePerson}
            onPersonMonthClick={openAllocationEditor}
            onSourceChange={updateFundingSource}
            onSourceDelete={deleteFundingSource}
            people={people}
            projection={projection}
            sourceById={sourceById}
          />
        </section>
      </div>

      {addDialog && (
        <AddRowModal
          mode={addDialog}
          onAddFundingSource={addFundingSource}
          onAddPerson={addPerson}
          onCancel={() => setAddDialog(null)}
          onPersonDraftChange={setPersonDraft}
          onSourceDraftChange={setSourceDraft}
          personDraft={personDraft}
          sourceDraft={sourceDraft}
        />
      )}

      {allocationEditor && (
        <AllocationModal
          allocations={allocations}
          editor={allocationEditor}
          fundingSources={fundingSources}
          months={months}
          onAddSplit={addEditorSplit}
          onCancel={() => setAllocationEditor(null)}
          onChange={changeAllocationEditor}
          onRemoveSplit={removeEditorSplit}
          onSave={saveAllocationEditor}
          onUpdateSplit={updateEditorSplit}
          person={personById.get(allocationEditor.personId)}
        />
      )}
    </main>
  );
}

function Badge({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: 'green' | 'blue';
}) {
  const classes =
    tone === 'green'
      ? 'bg-[#e7f3f1] text-[#2f7f79]'
      : 'bg-[#eef2ff] text-[#526fbf]';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium ${classes}`}
    >
      {icon}
      {children}
    </span>
  );
}

function SummaryCard({
  deficitCount,
  invalidCount,
  totalBalance,
  totalDrawdown,
}: {
  deficitCount: number;
  invalidCount: number;
  totalBalance: number;
  totalDrawdown: number;
}) {
  return (
    <section className="rounded-lg border border-[#d8ddd6] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-2xl font-semibold">Plan health</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Remaining" value={formatCompactCurrency(totalBalance)} />
        <Metric label="Drawdown" value={formatCompactCurrency(totalDrawdown)} />
        <Metric
          label="Deficit months"
          value={String(deficitCount)}
          warning={deficitCount > 0}
        />
        <Metric
          label="Invalid allocations"
          positive={invalidCount === 0}
          value={String(invalidCount)}
          warning={invalidCount > 0}
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  positive = false,
  value,
  warning = false,
}: {
  label: string;
  positive?: boolean;
  value: string;
  warning?: boolean;
}) {
  const valueClass = warning
    ? 'text-[#b42318]'
    : positive
      ? 'text-[#0f766e]'
      : 'text-[#1f2a2e]';

  return (
    <div
      className={`rounded-md border p-3 ${warning ? 'border-[#d4574f] bg-[#fff1ef]' : 'border-[#e2e6df] bg-[#f8faf7]'}`}
    >
      <p className="text-xs font-semibold uppercase text-[#667277]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function LabeledNumber({
  label,
  max,
  min = 0,
  onChange,
  testId,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  testId?: string;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#667277]">
      {label}
      <input
        className="rounded-md border border-[#cdd5d1] px-3 py-2 text-sm font-normal text-[#1f2a2e]"
        data-testid={testId}
        inputMode="decimal"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        type="text"
        value={value}
      />
    </label>
  );
}

function LabeledDate({
  label,
  onChange,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  testId?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#667277]">
      {label}
      <input
        className="rounded-md border border-[#cdd5d1] px-3 py-2 text-sm font-normal text-[#1f2a2e]"
        data-testid={testId}
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        placeholder="YYYY-MM-DD"
        type="date"
        value={value}
      />
    </label>
  );
}

function AddRowModal({
  mode,
  onAddFundingSource,
  onAddPerson,
  onCancel,
  onPersonDraftChange,
  onSourceDraftChange,
  personDraft,
  sourceDraft,
}: {
  mode: Exclude<AddDialog, null>;
  onAddFundingSource: () => void;
  onAddPerson: () => void;
  onCancel: () => void;
  onPersonDraftChange: Dispatch<
    SetStateAction<{
      annualSalary: number;
      fringeRate: number;
      name: string;
    }>
  >;
  onSourceDraftChange: Dispatch<
    SetStateAction<{
      endDate: string;
      indirectRate: number;
      name: string;
      startDate: string;
      startingBalance: number;
    }>
  >;
  personDraft: {
    annualSalary: number;
    fringeRate: number;
    name: string;
  };
  sourceDraft: {
    endDate: string;
    indirectRate: number;
    name: string;
    startDate: string;
    startingBalance: number;
  };
}) {
  const dialogRef = useProjectionDialog();
  const isSource = mode === 'funding-source';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <dialog
        aria-label={isSource ? 'Add funding source' : 'Add person'}
        aria-modal="true"
        className="m-auto w-full max-w-2xl rounded-lg bg-white shadow-2xl"
        data-testid="add-row-modal"
        onCancel={onCancel}
        ref={dialogRef}
      >
        <div className="border-b border-[#d8ddd6] p-5">
          <h2 className="text-xl font-semibold">
            Add {isSource ? 'funding source' : 'person'}
          </h2>
          <p className="text-sm text-[#667277]">
            This creates a new timeline row. You can continue editing it inline
            after it is added.
          </p>
        </div>

        <div className="grid gap-3 p-5">
          {isSource ? (
            <>
              <input
                aria-label="Funding source name"
                className="rounded-md border border-[#cdd5d1] px-3 py-2"
                data-testid="new-source-name"
                onChange={(event) =>
                  onSourceDraftChange((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Name"
                value={sourceDraft.name}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledNumber
                  label="Starting balance"
                  onChange={(value) =>
                    onSourceDraftChange((current) => ({
                      ...current,
                      startingBalance: value,
                    }))
                  }
                  testId="new-source-balance"
                  value={sourceDraft.startingBalance}
                />
                <LabeledNumber
                  label="Indirect %"
                  max={100}
                  onChange={(value) =>
                    onSourceDraftChange((current) => ({
                      ...current,
                      indirectRate: clampPercent(value),
                    }))
                  }
                  testId="new-source-indirect"
                  value={sourceDraft.indirectRate}
                />
                <LabeledDate
                  label="Start"
                  onChange={(value) =>
                    onSourceDraftChange((current) => ({
                      ...current,
                      startDate: value,
                    }))
                  }
                  testId="new-source-start"
                  value={sourceDraft.startDate}
                />
                <LabeledDate
                  label="End"
                  onChange={(value) =>
                    onSourceDraftChange((current) => ({
                      ...current,
                      endDate: value,
                    }))
                  }
                  testId="new-source-end"
                  value={sourceDraft.endDate}
                />
              </div>
            </>
          ) : (
            <>
              <input
                aria-label="Person name"
                className="rounded-md border border-[#cdd5d1] px-3 py-2"
                data-testid="new-person-name"
                onChange={(event) =>
                  onPersonDraftChange((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Name"
                value={personDraft.name}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledNumber
                  label="Annual salary"
                  onChange={(value) =>
                    onPersonDraftChange((current) => ({
                      ...current,
                      annualSalary: value,
                    }))
                  }
                  testId="new-person-salary"
                  value={personDraft.annualSalary}
                />
                <LabeledNumber
                  label="Fringe %"
                  max={100}
                  onChange={(value) =>
                    onPersonDraftChange((current) => ({
                      ...current,
                      fringeRate: clampPercent(value),
                    }))
                  }
                  testId="new-person-fringe"
                  value={personDraft.fringeRate}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#d8ddd6] p-5">
          <button
            className="rounded-md border border-[#cbd5d1] px-4 py-2 font-semibold text-[#39464b] hover:border-[#8ca6a0]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-[#2f7f79] px-4 py-2 font-semibold text-white hover:bg-[#286d68]"
            data-testid={isSource ? 'add-funding-source' : 'add-person'}
            onClick={isSource ? onAddFundingSource : onAddPerson}
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            Add {isSource ? 'funding source' : 'person'}
          </button>
        </div>
      </dialog>
    </div>
  );
}

function allocationsMatch(
  allocations: MonthlyAllocation[],
  splits: AllocationRunInput['splits']
) {
  if (
    allocations.length !== splits.filter((split) => split.percent > 0).length
  ) {
    return false;
  }

  const allocationSignature = allocations
    .filter((allocation) => allocation.percent > 0)
    .map(
      (allocation) =>
        `${allocation.fundingSourceId}:${Number(allocation.percent).toFixed(2)}`
    )
    .sort()
    .join('|');
  const splitSignature = splits
    .filter((split) => split.percent > 0)
    .map(
      (split) => `${split.fundingSourceId}:${Number(split.percent).toFixed(2)}`
    )
    .sort()
    .join('|');

  return allocationSignature === splitSignature;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function allocationPopoverStyle(anchorRect: AllocationAnchorRect) {
  const margin = 16;
  const viewportWidth = globalThis.innerWidth || 1024;
  const viewportHeight = globalThis.innerHeight || 768;
  const panelWidth = Math.min(760, viewportWidth - margin * 2);
  const panelHeight = Math.min(640, viewportHeight - margin * 2);
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;

  return {
    left: clampNumber(
      anchorCenterX - panelWidth / 2,
      margin,
      viewportWidth - panelWidth - margin
    ),
    maxHeight: panelHeight,
    top: clampNumber(
      anchorCenterY - panelHeight / 2,
      margin,
      viewportHeight - panelHeight - margin
    ),
    width: panelWidth,
  };
}

function AllocationModal({
  allocations,
  editor,
  fundingSources,
  months,
  onAddSplit,
  onCancel,
  onChange,
  onRemoveSplit,
  onSave,
  onUpdateSplit,
  person,
}: {
  allocations: MonthlyAllocation[];
  editor: AllocationEditorState;
  fundingSources: FundingSource[];
  months: string[];
  onAddSplit: () => void;
  onCancel: () => void;
  onChange: (patch: Partial<AllocationEditorState>) => void;
  onRemoveSplit: (index: number) => void;
  onSave: () => void;
  onUpdateSplit: (
    index: number,
    patch: Partial<AllocationRunInput['splits'][number]>
  ) => void;
  person: Person | undefined;
}) {
  const dialogRef = useProjectionDialog();
  const rangeStripRef = useRef<HTMLDivElement>(null);
  const popoverStyle = allocationPopoverStyle(editor.anchorRect);
  const runTotal = editor.splits.reduce(
    (total, split) => total + split.percent,
    0
  );
  const selectedMonths = monthsBetweenInclusive(
    editor.startMonth,
    editor.endMonth
  );
  const selectedMonthSet = new Set(selectedMonths);
  const hasInactiveSource = selectedMonths.some((month) =>
    editor.splits.some((split) => {
      const source = fundingSources.find(
        (fundingSource) => fundingSource.id === split.fundingSourceId
      );
      return source ? !isFundingSourceActiveInMonth(source, month) : true;
    })
  );
  const canSave =
    editor.splits.every((split) => split.fundingSourceId !== '') &&
    runTotal <= 100 &&
    !hasInactiveSource;

  function chooseRangeMonth(month: string) {
    const anchorIndex = monthToIndex(editor.anchorMonth);
    const selectedIndex = monthToIndex(month);

    onChange({
      endMonth: anchorIndex <= selectedIndex ? month : editor.anchorMonth,
      startMonth: anchorIndex <= selectedIndex ? editor.anchorMonth : month,
    });
  }

  useEffect(() => {
    const rangeStrip = rangeStripRef.current;
    const anchorButton = rangeStrip?.querySelector<HTMLElement>(
      `[data-range-month="${editor.anchorMonth}"]`
    );

    if (!rangeStrip || !anchorButton) {
      return;
    }

    requestAnimationFrame(() => {
      const targetLeft =
        anchorButton.offsetLeft -
        rangeStrip.clientWidth / 2 +
        anchorButton.clientWidth / 2;
      rangeStrip.scrollLeft = Math.max(0, targetLeft);
    });
  }, [editor.anchorMonth]);

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed rounded-md ring-4 ring-[#0f766e] ring-offset-2 ring-offset-white"
        style={{
          height: editor.anchorRect.height,
          left: editor.anchorRect.left,
          top: editor.anchorRect.top,
          width: editor.anchorRect.width,
        }}
      />
      <dialog
        aria-label={`${person?.name ?? 'Person'} allocation`}
        aria-modal="true"
        className="fixed m-0 overflow-y-auto rounded-lg border-4 border-[#0f766e] bg-white shadow-2xl"
        data-testid="allocation-modal"
        onCancel={onCancel}
        ref={dialogRef}
        style={popoverStyle}
      >
        <div className="border-b border-[#d8ddd6] bg-[#edf7f5] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {person?.name ?? 'Person'} allocation
              </h2>
              <p className="text-sm text-[#667277]">
                Editing {monthLabel(editor.anchorMonth)}. Expand the range to
                replace nearby months with this same setup.
              </p>
            </div>
            <Badge
              icon={<CalendarDaysIcon className="size-4" />}
              tone={runTotal > 100 ? 'green' : 'blue'}
            >
              {runTotal}% allocated
            </Badge>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase text-[#667277]">
                Apply range
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-semibold text-[#667277]">
                  Start
                  <input
                    className="rounded-md border border-[#cdd5d1] px-3 py-2 text-sm font-normal text-[#1f2a2e]"
                    data-testid="allocation-start-month"
                    onChange={(event) =>
                      event.target.value &&
                      onChange({ startMonth: event.target.value })
                    }
                    type="month"
                    value={editor.startMonth}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-[#667277]">
                  End
                  <input
                    className="rounded-md border border-[#cdd5d1] px-3 py-2 text-sm font-normal text-[#1f2a2e]"
                    data-testid="allocation-end-month"
                    onChange={(event) =>
                      event.target.value &&
                      onChange({ endMonth: event.target.value })
                    }
                    type="month"
                    value={editor.endMonth}
                  />
                </label>
              </div>
            </div>

            <div
              className="flex gap-2 overflow-x-auto scroll-smooth rounded-md border border-[#d8ddd6] bg-[#f8faf7] p-2"
              ref={rangeStripRef}
            >
              {months.map((month) => {
                const monthAllocations = allocations.filter(
                  (allocation) =>
                    allocation.personId === editor.personId &&
                    allocation.month === month
                );
                const selected = selectedMonthSet.has(month);
                const sameSplit = allocationsMatch(
                  monthAllocations,
                  editor.splits
                );
                const willReplace =
                  selected && monthAllocations.length > 0 && !sameSplit;
                const invalid =
                  selected &&
                  editor.splits.some((split) => {
                    const source = fundingSources.find(
                      (fundingSource) =>
                        fundingSource.id === split.fundingSourceId
                    );
                    return source
                      ? !isFundingSourceActiveInMonth(source, month)
                      : true;
                  });

                return (
                  <button
                    className={`min-w-[112px] rounded-md border px-3 py-2 text-left text-xs transition ${
                      invalid
                        ? 'border-[#d4574f] bg-[#fff1ef] text-[#9f271e]'
                        : willReplace
                          ? 'border-[#d89035] bg-[#fff7e8] text-[#8a4f00]'
                          : selected
                            ? 'border-2 border-[#0f766e] bg-[#dff3ef] text-[#0f5f59] shadow-[0_0_0_2px_rgba(15,118,110,0.16)]'
                            : monthAllocations.length > 0
                              ? 'border-[#c7d3ce] bg-[#f1f3ef] text-[#39464b]'
                              : 'border-[#e2e6df] bg-white text-[#667277]'
                    }`}
                    data-range-month={month}
                    data-testid={`range-month-${month}`}
                    key={month}
                    onClick={() => chooseRangeMonth(month)}
                    type="button"
                  >
                    <span className="block font-semibold">
                      {monthLabel(month)}
                    </span>
                    <span className="mt-1 block">
                      {invalid
                        ? 'Invalid'
                        : willReplace
                          ? 'Will replace'
                          : monthAllocations.length > 0
                            ? sameSplit
                              ? 'Same'
                              : 'Allocated'
                            : 'Empty'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase text-[#667277]">
                Funding split
              </h3>
              <button
                className="inline-flex items-center gap-2 rounded-md border border-[#cbd5d1] px-3 py-2 text-sm font-semibold text-[#39464b] hover:border-[#8ca6a0]"
                data-testid="modal-add-split"
                disabled={editor.splits.length >= fundingSources.length}
                onClick={onAddSplit}
                type="button"
              >
                <PlusIcon aria-hidden="true" className="size-4" />
                Add funding source
              </button>
            </div>

            {editor.splits.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#cbd5d1] p-4 text-sm text-[#667277]">
                No funding source assigned for this month. Add one to default to
                100%.
              </div>
            ) : (
              <div className="grid gap-2">
                {editor.splits.map((split, index) => (
                  <div
                    className="grid gap-2 md:grid-cols-[1fr_120px_40px]"
                    key={split.fundingSourceId}
                  >
                    <select
                      aria-label={`Funding source ${index + 1}`}
                      className="rounded-md border border-[#cdd5d1] px-3 py-2"
                      data-testid={`modal-source-${index}`}
                      onChange={(event) =>
                        onUpdateSplit(index, {
                          fundingSourceId: event.target.value,
                        })
                      }
                      value={split.fundingSourceId}
                    >
                      {fundingSources.map((source) => (
                        <option
                          disabled={editor.splits.some(
                            (other) =>
                              other !== split &&
                              other.fundingSourceId === source.id
                          )}
                          key={source.id}
                          value={source.id}
                        >
                          {source.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Percent ${index + 1}`}
                      className="rounded-md border border-[#cdd5d1] px-3 py-2"
                      data-testid={`modal-percent-${index}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        onUpdateSplit(index, {
                          percent: clampPercent(
                            Number(event.target.value) || 0
                          ),
                        })
                      }
                      type="text"
                      value={split.percent}
                    />
                    <button
                      aria-label={`Remove funding source ${index + 1}`}
                      className="rounded-md border border-[#cdd5d1] p-2 text-[#8a3a33] hover:bg-[#fff1ef]"
                      onClick={() => onRemoveSplit(index)}
                      type="button"
                    >
                      <TrashIcon aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(runTotal > 100 || hasInactiveSource) && (
            <div className="rounded-md bg-[#fff1ef] px-3 py-2 text-sm font-semibold text-[#b42318]">
              {runTotal > 100 && <p>Allocation total cannot exceed 100%.</p>}
              {hasInactiveSource && (
                <p>
                  One or more selected months use a funding source outside its
                  active date range.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#d8ddd6] p-5">
          <button
            className="rounded-md border border-[#cbd5d1] px-4 py-2 font-semibold text-[#39464b] hover:border-[#8ca6a0]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-[#2f7f79] px-4 py-2 font-semibold text-white hover:bg-[#286d68] disabled:cursor-not-allowed disabled:bg-[#a8b7b3]"
            data-testid="modal-save-allocation"
            disabled={!canSave}
            onClick={onSave}
            type="button"
          >
            <CheckCircleIcon aria-hidden="true" className="size-4" />
            Replace {selectedMonths.length}{' '}
            {selectedMonths.length === 1 ? 'month' : 'months'}
          </button>
        </div>
      </dialog>
    </div>
  );
}

function ValidationPanel({
  personById,
  projection,
  sourceById,
}: {
  personById: Map<string, Person>;
  projection: ReturnType<typeof projectPlan>;
  sourceById: Map<string, FundingSource>;
}) {
  const overAllocated = projection.allocationValidations.filter(
    (validation) => validation.overAllocated
  );

  return (
    <section className="rounded-lg border border-[#f0b0a8] bg-[#fff8f6] p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[#9f271e]">
        <ExclamationTriangleIcon aria-hidden="true" className="size-5" />
        Validation warnings
      </h2>
      <div className="mt-3 grid gap-2 text-sm">
        {projection.invalidAllocations.map((allocation) => (
          <p
            key={`${allocation.personId}-${allocation.fundingSourceId}-${allocation.month}`}
          >
            {personById.get(allocation.personId)?.name ?? 'Unknown person'} is
            allocated to{' '}
            {sourceById.get(allocation.fundingSourceId)?.name ??
              'Unknown source'}{' '}
            in {monthLabel(allocation.month)}, but that funding source is
            inactive.
          </p>
        ))}
        {overAllocated.map((validation) => (
          <p key={`${validation.personId}-${validation.month}`}>
            {personById.get(validation.personId)?.name ?? 'Unknown person'} is
            allocated {validation.totalPercent}% in{' '}
            {monthLabel(validation.month)}.
          </p>
        ))}
      </div>
    </section>
  );
}

function InlineNumber({
  label,
  max,
  onChange,
  testId,
  value,
}: {
  label: string;
  max?: number;
  onChange: (value: number) => void;
  testId: string;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold uppercase text-[#667277]">
      {label}
      <input
        className="rounded-md border border-[#cdd5d1] bg-white px-2 py-1 text-sm font-normal normal-case text-[#1f2a2e]"
        data-testid={testId}
        inputMode="decimal"
        onChange={(event) => {
          const next = Number(event.target.value) || 0;
          onChange(max === undefined ? next : Math.min(max, next));
        }}
        type="text"
        value={value}
      />
    </label>
  );
}

function InlineText({
  label,
  onChange,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold uppercase text-[#667277]">
      {label}
      <input
        className="rounded-md border border-[#cdd5d1] bg-white px-2 py-1 text-sm font-normal normal-case text-[#1f2a2e]"
        data-testid={testId}
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        type="date"
        value={value}
      />
    </label>
  );
}

type TimelineWindowMode = 'all' | 'year' | 'six-months' | 'three-months';

const timelineWindowModes: Array<{
  id: TimelineWindowMode;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'year', label: '1 year' },
  { id: 'six-months', label: '6 months' },
  { id: 'three-months', label: '3 months' },
];

function timelineWindowSize(mode: TimelineWindowMode, totalMonths: number) {
  if (mode === 'all') {
    return totalMonths;
  }

  if (mode === 'year') {
    return Math.min(12, totalMonths);
  }

  if (mode === 'six-months') {
    return Math.min(6, totalMonths);
  }

  return Math.min(3, totalMonths);
}

function clampWindowStart(
  start: number,
  windowSize: number,
  totalMonths: number
) {
  return Math.max(0, Math.min(start, Math.max(0, totalMonths - windowSize)));
}

function formatMonthRange(months: string[]) {
  if (months.length === 0) {
    return 'No months';
  }

  const first = months[0];
  const last = months.at(-1)!;

  return first === last
    ? monthLabel(first)
    : `${monthLabel(first)}-${monthLabel(last)}`;
}

function timelineRangeLabel(mode: TimelineWindowMode, visibleMonths: string[]) {
  const modeLabel =
    timelineWindowModes.find((timelineMode) => timelineMode.id === mode)
      ?.label ?? 'All';

  return `${modeLabel} · ${formatMonthRange(visibleMonths)} · ${visibleMonths.length} ${
    visibleMonths.length === 1 ? 'month' : 'months'
  }`;
}

function centerWindowOnMonth(
  monthIndex: number,
  mode: TimelineWindowMode,
  totalMonths: number
) {
  const size = timelineWindowSize(mode, totalMonths);
  return clampWindowStart(
    monthIndex - Math.floor((size - 1) / 2),
    size,
    totalMonths
  );
}

const genericSourceWords = new Set([
  'award',
  'contract',
  'foundation',
  'fund',
  'funds',
  'grant',
  'program',
  'project',
  'source',
]);

function sourceCodeBase(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replaceAll(/[^\da-z]/gi, ''))
    .filter(Boolean);

  const acronym = words.find((word) => /^[\dA-Z]{2,}$/.test(word));
  if (acronym) {
    return acronym.slice(0, 4);
  }

  const meaningfulWords = words.filter(
    (word) => !genericSourceWords.has(word.toLowerCase())
  );
  const codeWords = meaningfulWords.length > 0 ? meaningfulWords : words;

  if (codeWords.length === 0) {
    return '?';
  }

  if (codeWords.length === 1) {
    return codeWords[0].slice(0, 3).toUpperCase();
  }

  return codeWords
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

function sourceCode(source: FundingSource, fundingSources: FundingSource[]) {
  const sourceBases = fundingSources.map((fundingSource) => ({
    base: sourceCodeBase(fundingSource.name),
    id: fundingSource.id,
  }));
  const base =
    sourceBases.find((sourceBase) => sourceBase.id === source.id)?.base ?? '?';
  const matchingBases = sourceBases.filter(
    (sourceBase) => sourceBase.base === base
  );

  if (matchingBases.length <= 1) {
    return base;
  }

  const sourceIndex = matchingBases.findIndex(
    (sourceBase) => sourceBase.id === source.id
  );
  return `${base}${sourceIndex + 1}`;
}

function fundingChartDomain(data: FundingChartPoint[]): [number, number] {
  const values = data.flatMap((point) => [
    point.remainingBalance ?? 0,
    point.drawdownExpense,
  ]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const spread = max - min;
  const padding = spread === 0 ? 1000 : spread * 0.08;

  return [Math.floor(min - padding), Math.ceil(max + padding)];
}

function compactChartMonthLabel(label: string) {
  return label.replace(/\s\d{4}$/, '');
}

function FundingChartTooltip({
  active,
  label,
  payload,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload as FundingChartPoint | undefined;
  if (!point) {
    return null;
  }

  return (
    <div className="rounded-md border border-[#cbd5d1] bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-[#1f2a2e]">{label}</p>
      {point.active ? (
        <div className="space-y-1">
          <p
            className={
              point.deficit ? 'font-semibold text-[#b42318]' : 'text-[#39464b]'
            }
          >
            Remaining: {formatCompactCurrency(point.remainingBalance ?? 0)}
          </p>
          <p className="text-[#667277]">
            Drawdown: {formatCompactCurrency(point.drawdown)}
          </p>
          {point.deficit && (
            <p className="font-semibold text-[#b42318]">Below $0</p>
          )}
        </div>
      ) : (
        <p className="text-[#8a9692]">Inactive</p>
      )}
    </div>
  );
}

function FundingSourceChart({
  fundingMonths,
  source,
  visibleMonths,
}: {
  fundingMonths: FundingMonthProjection[];
  source: FundingSource;
  visibleMonths: string[];
}) {
  const data = buildFundingChartData(source, visibleMonths, fundingMonths);
  const chartData = data.map((point) => ({
    ...point,
    deficitBalance: point.deficit ? point.remainingBalance : null,
  }));
  const [domainMin, domainMax] = fundingChartDomain(data);
  const tickInterval = Math.max(0, Math.ceil(data.length / 8) - 1);
  const hasVisibleDeficit = data.some((point) => point.deficit);

  return (
    <div className="min-w-0" data-testid={`funding-chart-${source.id}`}>
      <ResponsiveContainer height={150} minWidth={0} width="100%">
        <ComposedChart
          data={chartData}
          margin={{ bottom: 6, left: 0, right: 18, top: 12 }}
        >
          <CartesianGrid stroke="#edf0ec" vertical={false} />
          <XAxis
            axisLine={{ stroke: '#d8ddd6' }}
            dataKey="monthLabel"
            interval={tickInterval}
            tick={{ fill: '#667277', fontSize: 11 }}
            tickFormatter={compactChartMonthLabel}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            domain={[domainMin, domainMax]}
            tick={{ fill: '#667277', fontSize: 11 }}
            tickFormatter={(value) => formatCompactCurrency(Number(value))}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={<FundingChartTooltip />}
            cursor={{ fill: '#f2f4f0' }}
          />
          {hasVisibleDeficit && (
            <ReferenceArea
              fill="#d4574f"
              fillOpacity={0.08}
              ifOverflow="extendDomain"
              y1={domainMin}
              y2={0}
            />
          )}
          <ReferenceLine
            ifOverflow="extendDomain"
            stroke={hasVisibleDeficit ? '#b42318' : '#39464b'}
            strokeDasharray="4 4"
            strokeWidth={hasVisibleDeficit ? 2 : 1}
            y={0}
          />
          <Bar
            barSize={14}
            dataKey="drawdownExpense"
            fill="#9aa8a4"
            isAnimationActive={false}
            name="Drawdown"
            opacity={0.62}
          />
          <Line
            activeDot={{ r: 4, stroke: '#ffffff', strokeWidth: 2 }}
            connectNulls={false}
            dataKey="remainingBalance"
            dot={false}
            isAnimationActive={false}
            name="Remaining"
            stroke={source.color}
            strokeWidth={2.4}
            type="monotone"
          />
          {hasVisibleDeficit && (
            <Line
              activeDot={{
                fill: '#b42318',
                r: 5,
                stroke: '#ffffff',
                strokeWidth: 2,
              }}
              connectNulls={false}
              dataKey="deficitBalance"
              dot={{ fill: '#d4574f', r: 4, stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
              name="Deficit"
              stroke="#d4574f"
              strokeWidth={2.8}
              type="monotone"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Timeline({
  allocations,
  fundingSources,
  months,
  onAddFundingSource,
  onAddPerson,
  onPersonChange,
  onPersonDelete,
  onPersonMonthClick,
  onSourceChange,
  onSourceDelete,
  people,
  projection,
  sourceById,
}: {
  allocations: MonthlyAllocation[];
  fundingSources: FundingSource[];
  months: string[];
  onAddFundingSource: () => void;
  onAddPerson: () => void;
  onPersonChange: (id: string, patch: Partial<Person>) => void;
  onPersonDelete: (id: string) => void;
  onPersonMonthClick: (
    personId: string,
    month: string,
    anchorRect: AllocationAnchorRect
  ) => void;
  onSourceChange: (id: string, patch: Partial<FundingSource>) => void;
  onSourceDelete: (id: string) => void;
  people: Person[];
  projection: ReturnType<typeof projectPlan>;
  sourceById: Map<string, FundingSource>;
}) {
  const [windowMode, setWindowMode] = useState<TimelineWindowMode>('year');
  const [windowStart, setWindowStart] = useState(0);
  const totalMonths = months.length;
  const windowSize = timelineWindowSize(windowMode, totalMonths);
  const safeWindowStart =
    windowMode === 'all'
      ? 0
      : clampWindowStart(windowStart, windowSize, totalMonths);
  const visibleMonths =
    windowMode === 'all'
      ? months
      : months.slice(safeWindowStart, safeWindowStart + windowSize);
  const visibleStart = windowMode === 'all' ? 0 : safeWindowStart;
  const visibleEnd =
    windowMode === 'all'
      ? totalMonths - 1
      : safeWindowStart + visibleMonths.length - 1;
  const isAllMode = windowMode === 'all';
  const isCompactMode = windowMode === 'all' || windowMode === 'year';
  const canShiftBackward = windowMode !== 'all' && safeWindowStart > 0;
  const canShiftForward =
    windowMode !== 'all' && safeWindowStart + windowSize < totalMonths;
  const monthGridStyle = {
    gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(0, 1fr))`,
  };
  const rowGridStyle = {
    gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
  };
  const miniStripStyle = {
    gridTemplateColumns: `repeat(${Math.max(totalMonths, 1)}, minmax(0, 1fr))`,
  };
  const allocationByPersonMonth = new Map<string, MonthlyAllocation[]>();
  for (const allocation of allocations) {
    const key = `${allocation.personId}:${allocation.month}`;
    allocationByPersonMonth.set(key, [
      ...(allocationByPersonMonth.get(key) ?? []),
      allocation,
    ]);
  }
  const validationByPersonMonth = new Map(
    projection.allocationValidations.map((validation) => [
      `${validation.personId}:${validation.month}`,
      validation,
    ])
  );

  function changeWindowMode(nextMode: TimelineWindowMode) {
    const currentCenter =
      windowMode === 'all'
        ? Math.floor(totalMonths / 2)
        : safeWindowStart + Math.floor((visibleMonths.length - 1) / 2);

    setWindowMode(nextMode);
    setWindowStart(centerWindowOnMonth(currentCenter, nextMode, totalMonths));
  }

  function jumpToMiniStripMonth(monthIndex: number) {
    if (windowMode === 'all') {
      return;
    }

    setWindowStart(centerWindowOnMonth(monthIndex, windowMode, totalMonths));
  }

  return (
    <section className="rounded-lg border border-[#d8ddd6] bg-white shadow-sm">
      <div className="space-y-4 border-b border-[#d8ddd6] p-4">
        <div>
          <h2 className="text-lg font-semibold">Timeline</h2>
          <p className="text-sm text-[#667277]">
            Funding rows show remaining balances. Click a person’s month to edit
            or extend their allocations.
          </p>
        </div>

        <div className="grid gap-3 rounded-lg border border-[#d8ddd6] bg-[#f8faf7] p-3 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div
            className="inline-grid grid-cols-4 rounded-md border border-[#cbd5d1] bg-white p-1 text-sm font-semibold"
            data-testid="timeline-window-control"
          >
            {timelineWindowModes.map((mode) => (
              <button
                className={`rounded px-3 py-1.5 transition ${
                  windowMode === mode.id
                    ? 'bg-[#2f7f79] text-white shadow-sm'
                    : 'text-[#39464b] hover:bg-[#edf5f3]'
                }`}
                data-testid={`timeline-mode-${mode.id}`}
                key={mode.id}
                onClick={() => changeWindowMode(mode.id)}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p
                className="text-sm font-semibold text-[#39464b]"
                data-testid="timeline-range-label"
              >
                {timelineRangeLabel(windowMode, visibleMonths)}
              </p>
              <p className="text-xs text-[#667277]">
                {windowMode === 'all'
                  ? 'Full frame'
                  : 'Click the strip to jump the window'}
              </p>
            </div>
            <div
              className="grid h-7 overflow-hidden rounded-md border border-[#cbd5d1] bg-white"
              data-testid="timeline-mini-strip"
              style={miniStripStyle}
            >
              {months.map((month, index) => {
                const selected = index >= visibleStart && index <= visibleEnd;
                const edge = index === visibleStart || index === visibleEnd;

                return (
                  <button
                    aria-label={`Jump to ${monthLabel(month)}`}
                    className={`border-r border-[#edf0ec] transition last:border-r-0 ${
                      selected
                        ? edge
                          ? 'bg-[#2f7f79]'
                          : 'bg-[#75aaa3]'
                        : 'bg-[#eef1ed] hover:bg-[#dfe8e5]'
                    }`}
                    key={month}
                    onClick={() => jumpToMiniStripMonth(index)}
                    title={monthLabel(month)}
                    type="button"
                  />
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Previous month window"
              className="inline-flex size-9 items-center justify-center rounded-md border border-[#cbd5d1] bg-white text-[#39464b] hover:border-[#8ca6a0] disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="timeline-window-prev"
              disabled={!canShiftBackward}
              onClick={() =>
                setWindowStart((current) =>
                  clampWindowStart(current - 1, windowSize, totalMonths)
                )
              }
              type="button"
            >
              <ChevronLeftIcon aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Next month window"
              className="inline-flex size-9 items-center justify-center rounded-md border border-[#cbd5d1] bg-white text-[#39464b] hover:border-[#8ca6a0] disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="timeline-window-next"
              disabled={!canShiftForward}
              onClick={() =>
                setWindowStart((current) =>
                  clampWindowStart(current + 1, windowSize, totalMonths)
                )
              }
              type="button"
            >
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          <div
            className="grid border-b border-[#d8ddd6] bg-[#f2f4f0]"
            style={rowGridStyle}
          >
            <div className="px-4 py-3 text-xs font-semibold uppercase text-[#667277]">
              Row
            </div>
            <div className="grid" style={monthGridStyle}>
              {visibleMonths.map((month) => (
                <div
                  className="min-w-0 border-l border-[#d8ddd6] px-1 py-3 text-center text-xs font-semibold text-[#667277]"
                  key={month}
                >
                  <span className={isAllMode ? 'block truncate' : ''}>
                    {monthLabel(month)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="grid bg-[#f8faf7] text-sm font-semibold text-[#39464b]"
            style={rowGridStyle}
          >
            <div className="flex items-center justify-between border-r border-[#d8ddd6] px-4 py-2">
              <span>Funding sources</span>
              <button
                aria-label="Add funding source"
                className="inline-flex items-center gap-1 rounded-md border border-[#cbd5d1] bg-white px-2 py-1 text-xs font-semibold text-[#2f7f79] hover:border-[#8ca6a0]"
                data-testid="open-add-funding-source"
                onClick={onAddFundingSource}
                type="button"
              >
                <PlusIcon aria-hidden="true" className="size-4" />
                Add
              </button>
            </div>
            <div />
          </div>
          {fundingSources.map((source) => (
            <div
              className="grid border-t border-[#e2e6df]"
              data-testid={`timeline-source-${source.id}`}
              key={source.id}
              style={rowGridStyle}
            >
              <div className="border-r border-[#d8ddd6] px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: source.color }}
                  />
                  <input
                    aria-label={`${source.name} name`}
                    className="min-w-0 flex-1 rounded-md border border-[#cdd5d1] px-2 py-1 font-semibold"
                    data-testid={`source-name-${source.id}`}
                    onChange={(event) =>
                      onSourceChange(source.id, { name: event.target.value })
                    }
                    value={source.name}
                  />
                  <button
                    aria-label={`Delete ${source.name}`}
                    className="rounded-md p-1 text-[#8a3a33] hover:bg-[#fff1ef]"
                    onClick={() => onSourceDelete(source.id)}
                    type="button"
                  >
                    <TrashIcon aria-hidden="true" className="size-4" />
                  </button>
                </div>
                {source.description && (
                  <p className="mb-2 text-xs text-[#667277]">
                    {source.description}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <InlineNumber
                    label="Balance"
                    onChange={(value) =>
                      onSourceChange(source.id, { startingBalance: value })
                    }
                    testId={`source-balance-${source.id}`}
                    value={source.startingBalance}
                  />
                  <InlineNumber
                    label="Indirect %"
                    max={100}
                    onChange={(value) =>
                      onSourceChange(source.id, {
                        indirectRate: clampPercent(value),
                      })
                    }
                    testId={`source-indirect-${source.id}`}
                    value={source.indirectRate}
                  />
                  <InlineText
                    label="Start"
                    onChange={(value) =>
                      onSourceChange(source.id, { startDate: value })
                    }
                    testId={`source-start-${source.id}`}
                    value={source.startDate}
                  />
                  <InlineText
                    label="End"
                    onChange={(value) =>
                      onSourceChange(source.id, { endDate: value })
                    }
                    testId={`source-end-${source.id}`}
                    value={source.endDate}
                  />
                </div>
              </div>
              <div className="min-w-0 border-l border-[#e2e6df] bg-white p-3">
                <FundingSourceChart
                  fundingMonths={projection.fundingMonths}
                  source={source}
                  visibleMonths={visibleMonths}
                />
              </div>
            </div>
          ))}

          <div
            className="grid bg-[#f8faf7] text-sm font-semibold text-[#39464b]"
            style={rowGridStyle}
          >
            <div className="flex items-center justify-between border-r border-[#d8ddd6] px-4 py-2">
              <span>People</span>
              <button
                aria-label="Add person"
                className="inline-flex items-center gap-1 rounded-md border border-[#cbd5d1] bg-white px-2 py-1 text-xs font-semibold text-[#526fbf] hover:border-[#8ca6a0]"
                data-testid="open-add-person"
                onClick={onAddPerson}
                type="button"
              >
                <PlusIcon aria-hidden="true" className="size-4" />
                Add
              </button>
            </div>
            <div />
          </div>
          {people.map((person) => (
            <div
              className="grid border-t border-[#e2e6df]"
              data-testid={`timeline-person-${person.id}`}
              key={person.id}
              style={rowGridStyle}
            >
              <div className="border-r border-[#d8ddd6] px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    aria-label={`${person.name} name`}
                    className="min-w-0 flex-1 rounded-md border border-[#cdd5d1] px-2 py-1 font-semibold"
                    data-testid={`person-name-${person.id}`}
                    onChange={(event) =>
                      onPersonChange(person.id, { name: event.target.value })
                    }
                    value={person.name}
                  />
                  <button
                    aria-label={`Delete ${person.name}`}
                    className="rounded-md p-1 text-[#8a3a33] hover:bg-[#fff1ef]"
                    onClick={() => onPersonDelete(person.id)}
                    type="button"
                  >
                    <TrashIcon aria-hidden="true" className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InlineNumber
                    label="Annual salary"
                    onChange={(value) =>
                      onPersonChange(person.id, { annualSalary: value })
                    }
                    testId={`person-salary-${person.id}`}
                    value={person.annualSalary}
                  />
                  <InlineNumber
                    label="Fringe %"
                    max={100}
                    onChange={(value) =>
                      onPersonChange(person.id, {
                        fringeRate: clampPercent(value),
                      })
                    }
                    testId={`person-fringe-${person.id}`}
                    value={person.fringeRate}
                  />
                </div>
              </div>
              <div
                className={`grid ${isAllMode ? 'min-h-[72px]' : 'min-h-[92px]'}`}
                style={monthGridStyle}
              >
                {visibleMonths.map((month) => {
                  const monthAllocations =
                    allocationByPersonMonth.get(`${person.id}:${month}`) ?? [];
                  const validation = validationByPersonMonth.get(
                    `${person.id}:${month}`
                  );
                  const invalidInMonth = projection.invalidAllocations.some(
                    (allocation) =>
                      allocation.personId === person.id &&
                      allocation.month === month
                  );
                  const unassignedPercent = Math.max(
                    0,
                    100 - (validation?.totalPercent ?? 0)
                  );

                  return (
                    <button
                      className={`min-w-0 border-l border-[#e2e6df] p-1 text-left transition hover:bg-[#edf5f3] ${
                        validation?.overAllocated || invalidInMonth
                          ? 'bg-[#fff1ef]'
                          : 'bg-white'
                      }`}
                      data-testid={`person-cell-${person.id}-${month}`}
                      key={month}
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        onPersonMonthClick(person.id, month, {
                          height: rect.height,
                          left: rect.left,
                          top: rect.top,
                          width: rect.width,
                        });
                      }}
                      title={`${person.name} ${monthLabel(month)}: ${
                        monthAllocations.length > 0
                          ? monthAllocations
                              .map((allocation) => {
                                const source = sourceById.get(
                                  allocation.fundingSourceId
                                );
                                return `${allocation.percent}% ${source?.name ?? 'Unknown'}`;
                              })
                              .join(', ')
                          : 'unassigned'
                      }`}
                      type="button"
                    >
                      <div
                        className={`flex flex-col overflow-hidden rounded-md border border-[#d8ddd6] bg-[#f8faf7] ${
                          isAllMode ? 'h-14' : 'h-20'
                        }`}
                      >
                        {monthAllocations.map((allocation) => {
                          const source = sourceById.get(
                            allocation.fundingSourceId
                          );
                          const active = source
                            ? isFundingSourceActiveInMonth(
                                source,
                                allocation.month
                              )
                            : false;
                          const allocationText = isAllMode
                            ? ''
                            : isCompactMode
                              ? `${allocation.percent}% ${
                                  source
                                    ? sourceCode(source, fundingSources)
                                    : '?'
                                }`
                              : `${allocation.percent}% ${source?.name ?? 'Unknown'}`;

                          return (
                            <div
                              className={`flex-none truncate px-1 text-[11px] font-semibold leading-5 text-white ${
                                active ? '' : 'line-through opacity-70'
                              }`}
                              key={`${allocation.fundingSourceId}-${allocation.month}`}
                              style={{
                                backgroundColor: source?.color ?? '#a5ada9',
                                flexBasis: `${allocation.percent}%`,
                              }}
                              title={`${source?.name ?? 'Unknown'} ${allocation.percent}%`}
                            >
                              {allocationText}
                            </div>
                          );
                        })}
                        {unassignedPercent > 0 && (
                          <div
                            className="flex-none truncate px-1 text-[11px] leading-5 text-[#8a9692]"
                            style={{ flexBasis: `${unassignedPercent}%` }}
                          >
                            {isAllMode ? '' : `${unassignedPercent}% open`}
                          </div>
                        )}
                      </div>
                      {(validation?.overAllocated || invalidInMonth) && (
                        <p className="mt-1 text-[11px] font-semibold text-[#b42318]">
                          {validation?.overAllocated
                            ? `${validation.totalPercent}%`
                            : 'Invalid'}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
