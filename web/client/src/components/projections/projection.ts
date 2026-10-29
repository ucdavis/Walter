export type FundingSource = {
  color: string;
  description?: string;
  endDate: string;
  id: string;
  indirectRate: number;
  name: string;
  startDate: string;
  startingBalance: number;
};

export type Person = {
  annualSalary: number;
  fringeRate: number;
  id: string;
  name: string;
};

export type MonthlyAllocation = {
  fundingSourceId: string;
  month: string;
  percent: number;
  personId: string;
};

export type AllocationRunInput = {
  endMonth: string;
  personId: string;
  splits: Array<{
    fundingSourceId: string;
    percent: number;
  }>;
  startMonth: string;
};

export type AllocationValidation = {
  month: string;
  overAllocated: boolean;
  personId: string;
  totalPercent: number;
  underAllocated: boolean;
};

export type InvalidAllocation = MonthlyAllocation & {
  reason:
    | 'funding-source-inactive'
    | 'missing-person'
    | 'missing-funding-source';
};

export type Drawdown = {
  directCost: number;
  fringeCost: number;
  fundingSourceId: string;
  indirectCost: number;
  month: string;
  percent: number;
  personId: string;
  salaryCost: number;
  totalCost: number;
};

export type FundingMonthProjection = {
  active: boolean;
  deficit: boolean;
  drawdown: number;
  month: string;
  remainingBalance: number | null;
  sourceId: string;
};

export type FundingSummary = {
  deficitMonths: string[];
  remainingBalance: number;
  sourceId: string;
  totalDrawdown: number;
};

export type ProjectionResult = {
  allocationValidations: AllocationValidation[];
  drawdowns: Drawdown[];
  fundingMonths: FundingMonthProjection[];
  fundingSummaries: FundingSummary[];
  invalidAllocations: InvalidAllocation[];
  months: string[];
};

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

export const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, value));

export function monthFromDate(date: string) {
  return date.slice(0, 7);
}

export function monthToIndex(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return year * 12 + monthNumber - 1;
}

export function indexToMonth(index: number) {
  const year = Math.floor(index / 12);
  const monthNumber = index % 12;
  return `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string) {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
}

export function monthsBetweenInclusive(startMonth: string, endMonth: string) {
  const start = monthToIndex(startMonth);
  const end = monthToIndex(endMonth);
  const low = Math.min(start, end);
  const high = Math.max(start, end);

  return Array.from({ length: high - low + 1 }, (_, offset) =>
    indexToMonth(low + offset)
  );
}

export function isFundingSourceActiveInMonth(
  source: FundingSource,
  month: string
) {
  const monthIndex = monthToIndex(month);
  return (
    monthIndex >= monthToIndex(monthFromDate(source.startDate)) &&
    monthIndex <= monthToIndex(monthFromDate(source.endDate))
  );
}

export function deriveTimelineMonths(
  fundingSources: FundingSource[],
  allocations: MonthlyAllocation[],
  bufferMonths = 1
) {
  const indexes = [
    ...fundingSources.flatMap((source) => [
      monthToIndex(monthFromDate(source.startDate)),
      monthToIndex(monthFromDate(source.endDate)),
    ]),
    ...allocations.map((allocation) => monthToIndex(allocation.month)),
  ];

  if (indexes.length === 0) {
    return monthsBetweenInclusive('2026-01', '2026-12');
  }

  const min = Math.min(...indexes) - bufferMonths;
  const max = Math.max(...indexes) + bufferMonths;

  return Array.from({ length: max - min + 1 }, (_, offset) =>
    indexToMonth(min + offset)
  );
}

export function applyAllocationRun(
  allocations: MonthlyAllocation[],
  run: AllocationRunInput
) {
  const totalPercent = run.splits.reduce(
    (total, split) => total + split.percent,
    0
  );

  if (totalPercent > 100) {
    throw new Error('Allocation run total cannot exceed 100%');
  }

  const runMonths = monthsBetweenInclusive(run.startMonth, run.endMonth);
  const runMonthSet = new Set(runMonths);
  const remaining = allocations.filter(
    (allocation) =>
      allocation.personId !== run.personId || !runMonthSet.has(allocation.month)
  );
  const next = runMonths.flatMap((month) =>
    run.splits
      .filter((split) => split.percent > 0)
      .map((split) => ({
        fundingSourceId: split.fundingSourceId,
        month,
        percent: split.percent,
        personId: run.personId,
      }))
  );

  return [...remaining, ...next];
}

export function projectPlan({
  allocations,
  fundingSources,
  months = deriveTimelineMonths(fundingSources, allocations),
  people,
}: {
  allocations: MonthlyAllocation[];
  fundingSources: FundingSource[];
  months?: string[];
  people: Person[];
}): ProjectionResult {
  const sourceById = new Map(
    fundingSources.map((source) => [source.id, source])
  );
  const personById = new Map(people.map((person) => [person.id, person]));
  const invalidAllocations: InvalidAllocation[] = [];
  const drawdowns: Drawdown[] = [];

  for (const allocation of allocations) {
    const person = personById.get(allocation.personId);
    const source = sourceById.get(allocation.fundingSourceId);

    if (!person) {
      invalidAllocations.push({ ...allocation, reason: 'missing-person' });
      continue;
    }

    if (!source) {
      invalidAllocations.push({
        ...allocation,
        reason: 'missing-funding-source',
      });
      continue;
    }

    if (!isFundingSourceActiveInMonth(source, allocation.month)) {
      invalidAllocations.push({
        ...allocation,
        reason: 'funding-source-inactive',
      });
      continue;
    }

    const salaryCost = (person.annualSalary / 12) * (allocation.percent / 100);
    const fringeCost = salaryCost * (person.fringeRate / 100);
    const directCost = salaryCost + fringeCost;
    const indirectCost = directCost * (source.indirectRate / 100);

    drawdowns.push({
      ...allocation,
      directCost,
      fringeCost,
      indirectCost,
      salaryCost,
      totalCost: directCost + indirectCost,
    });
  }

  const personMonthTotals = new Map<string, number>();
  for (const allocation of allocations) {
    const key = `${allocation.personId}:${allocation.month}`;
    personMonthTotals.set(
      key,
      (personMonthTotals.get(key) ?? 0) + allocation.percent
    );
  }

  const allocationValidations = Array.from(personMonthTotals.entries()).map(
    ([key, totalPercent]) => {
      const [personId, month] = key.split(':');
      return {
        month,
        overAllocated: totalPercent > 100,
        personId,
        totalPercent,
        underAllocated: totalPercent < 100,
      };
    }
  );

  const drawdownsBySourceMonth = new Map<string, number>();
  for (const drawdown of drawdowns) {
    const key = `${drawdown.fundingSourceId}:${drawdown.month}`;
    drawdownsBySourceMonth.set(
      key,
      (drawdownsBySourceMonth.get(key) ?? 0) + drawdown.totalCost
    );
  }

  const fundingMonths: FundingMonthProjection[] = [];
  const fundingSummaries: FundingSummary[] = [];

  for (const source of fundingSources) {
    let runningBalance = source.startingBalance;
    let totalDrawdown = 0;
    const deficitMonths: string[] = [];

    for (const month of months) {
      const active = isFundingSourceActiveInMonth(source, month);
      const monthDrawdown = active
        ? (drawdownsBySourceMonth.get(`${source.id}:${month}`) ?? 0)
        : 0;

      if (active) {
        runningBalance -= monthDrawdown;
        totalDrawdown += monthDrawdown;
      }

      const deficit = active && runningBalance < 0;
      if (deficit) {
        deficitMonths.push(month);
      }

      fundingMonths.push({
        active,
        deficit,
        drawdown: monthDrawdown,
        month,
        remainingBalance: active ? runningBalance : null,
        sourceId: source.id,
      });
    }

    fundingSummaries.push({
      deficitMonths,
      remainingBalance: runningBalance,
      sourceId: source.id,
      totalDrawdown,
    });
  }

  return {
    allocationValidations,
    drawdowns,
    fundingMonths,
    fundingSummaries,
    invalidAllocations,
    months,
  };
}
