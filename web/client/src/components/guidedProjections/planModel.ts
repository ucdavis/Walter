import type { ProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import {
  createPlanDefaults,
  type LegacyPlan,
  type LegacyStaff,
} from '@/components/guidedProjections/defaults.ts';
import {
  indexToMonth,
  isFundingSourceActiveInMonth,
  monthLabel,
  monthToIndex,
  projectPlan,
} from '@/components/projections/projection.ts';

export type FundingSplit = {
  endMonth: string;
  fundingId: string;
  id: string;
  percent: number;
  startMonth: string;
};
export type PlanStaff = LegacyStaff & { splits: FundingSplit[] };
export type ProjectionPlan = Omit<LegacyPlan, 'staff'> & { staff: PlanStaff[] };

export function migrateSavedPlan(
  plan: LegacyPlan | ProjectionPlan
): ProjectionPlan {
  return {
    ...plan,
    staff: plan.staff.map((person) => ({
      ...person,
      splits:
        'splits' in person
          ? person.splits
          : [
              {
                endMonth: person.endMonth,
                fundingId: person.fundingId,
                id: crypto.randomUUID(),
                percent: person.percent,
                startMonth: person.startMonth,
              },
            ],
    })),
  };
}

export function createProjectionPlan(
  data: ProjectionDemoPlan,
  name?: string
): ProjectionPlan {
  const plan = migrateSavedPlan(createPlanDefaults(data, name));
  return {
    ...plan,
    staff: plan.staff.map((person) => {
      const splits: FundingSplit[] = [];
      // Preserve every source and change in effort from the monthly snapshot.
      const rows = data.allocations
        .filter((row) => row.personId === person.id)
        .sort((a, b) => a.month.localeCompare(b.month));
      for (const row of rows) {
        const run = splits.find(
          (split) =>
            split.fundingId === row.fundingSourceId &&
            split.percent === row.percent &&
            monthToIndex(split.endMonth) + 1 === monthToIndex(row.month)
        );
        if (run) {
          run.endMonth = row.month;
        } else {
          splits.push({
            endMonth: row.month,
            fundingId: row.fundingSourceId,
            id: crypto.randomUUID(),
            percent: row.percent,
            startMonth: row.month,
          });
        }
      }
      return { ...person, splits: rows.length ? splits : person.splits };
    }),
  };
}

export function planMonths(plan: ProjectionPlan) {
  return Array.from({ length: plan.months }, (_, index) =>
    indexToMonth(monthToIndex(plan.startMonth) + index)
  );
}

export function splitActive(split: FundingSplit, month: string) {
  return month >= split.startMonth && month <= split.endMonth;
}

export function staffValidation(person: PlanStaff, plan: ProjectionPlan) {
  if (!person.name.trim()) {
    return 'Give each planned person a name.';
  }
  for (const split of person.splits) {
    if (
      !split.startMonth ||
      !split.endMonth ||
      split.startMonth > split.endMonth
    ) {
      return `Check the funding dates for ${person.name}.`;
    }
    if (
      !Number.isFinite(split.percent) ||
      split.percent < 0 ||
      split.percent > 100
    ) {
      return 'Each project share must be between 0% and 100%.';
    }
  }
  for (const month of planMonths(plan)) {
    const total = person.splits
      .filter(
        (split) =>
          plan.selectedFunding.includes(split.fundingId) &&
          splitActive(split, month)
      )
      .reduce((sum, split) => sum + split.percent, 0);
    if (total > 100.000_01) {
      return `${person.name} totals ${Number(total.toFixed(1))}% in ${monthLabel(month)}. Reduce the shares to 100% or less.`;
    }
  }
  return null;
}

export function projectGuidedPlan(plan: ProjectionPlan) {
  const months = planMonths(plan);
  const sources = plan.funding.filter((fund) =>
    plan.selectedFunding.includes(fund.id)
  );
  const people = plan.staff.filter((person) => person.included);
  const allocations = people.flatMap((person) =>
    person.splits.flatMap((split) => {
      const source = sources.find((fund) => fund.id === split.fundingId);
      return source
        ? months
            .filter(
              (month) =>
                splitActive(split, month) &&
                isFundingSourceActiveInMonth(source, month)
            )
            .map((month) => ({
              fundingSourceId: source.id,
              month,
              percent: split.percent,
              personId: person.id,
            }))
        : [];
    })
  );
  const projection = projectPlan({
    allocations,
    fundingSources: sources,
    months,
    people,
  });
  const funds = sources.map((source) => {
    const drawdowns = projection.drawdowns.filter(
      (row) => row.fundingSourceId === source.id
    );
    let balance = source.startingBalance;
    const chart = months.map((month) => {
      const rows = drawdowns.filter((row) => row.month === month);
      const salary = rows.reduce((sum, row) => sum + row.salaryCost, 0);
      const fringe = rows.reduce((sum, row) => sum + row.fringeCost, 0);
      const indirect = rows.reduce((sum, row) => sum + row.indirectCost, 0);
      const personnel = salary + fringe + indirect;
      const other = plan.expenses
        .filter(
          (expense) =>
            expense.fundingId === source.id &&
            isFundingSourceActiveInMonth(source, month) &&
            (expense.frequency === 'monthly'
              ? month >= expense.month
              : month === expense.month)
        )
        .reduce((sum, expense) => sum + expense.amount, 0);
      const opening = balance;
      balance -= personnel + other;
      return {
        balance,
        fringe,
        indirect,
        month,
        opening,
        other,
        personnel,
        salary,
      };
    });
    const sum = (
      key: 'salary' | 'fringe' | 'indirect' | 'personnel' | 'other'
    ) => chart.reduce((total, point) => total + point[key], 0);
    return {
      ...source,
      chart,
      ending: balance,
      firstDeficit: chart.find((row) => row.balance < 0)?.month,
      fringe: sum('fringe'),
      indirect: sum('indirect'),
      other: sum('other'),
      personnel: sum('personnel'),
      salary: sum('salary'),
      spending: source.startingBalance - balance,
      staff: people.flatMap((person) => {
        const rows = drawdowns.filter(
          (row) => row.personId === person.id && row.percent > 0
        );
        return rows.length
          ? [
              {
                cost: rows.reduce((total, row) => total + row.totalCost, 0),
                id: person.id,
                name: person.name,
                splits: person.splits.filter(
                  (split) =>
                    split.fundingId === source.id &&
                    split.percent > 0 &&
                    months.some(
                      (month) =>
                        splitActive(split, month) &&
                        isFundingSourceActiveInMonth(source, month)
                    )
                ),
              },
            ]
          : [];
      }),
    };
  });
  const chart = months.map((month, index) => ({
    balance: funds.reduce(
      (total, fund) => total + fund.chart[index].balance,
      0
    ),
    month,
    other: funds.reduce((total, fund) => total + fund.chart[index].other, 0),
    personnel: funds.reduce(
      (total, fund) => total + fund.chart[index].personnel,
      0
    ),
  }));
  return {
    chart,
    ending: funds.reduce((total, fund) => total + fund.ending, 0),
    firstDeficit: chart.find((point) => point.balance < 0)?.month,
    funds,
    other: funds.reduce((total, fund) => total + fund.other, 0),
    personnel: funds.reduce((total, fund) => total + fund.personnel, 0),
    starting: sources.reduce(
      (total, source) => total + source.startingBalance,
      0
    ),
  };
}

export type PlanResult = ReturnType<typeof projectGuidedPlan>;
export type ProjectResult = PlanResult['funds'][number];
