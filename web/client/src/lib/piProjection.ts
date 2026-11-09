import type {
  Projection,
  ProjectionAppointment,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

export interface PiProjectionRow {
  actualAmount: number;
  expenditureCategory: string;
  fundingSourceId: number;
  kind: 'actual' | 'blended' | 'projected';
  month: string; // 'YYYY-MM'
  projectedAmount: number;
  remaining: number;
}

export interface AppointmentFundingMonth {
  appointmentId: number;
  /** Average funding share over active appointment days; gaps and overlaps can offset. */
  fundedPercent: number;
  month: string;
}

export const SALARY_CATEGORY = '01 - Salaries and Wages';
export const FRINGE_CATEGORY = '02 - Fringe Benefits';
export const FEE_REMISSION_CATEGORY = '08 - Fellowship & Scholarships';
/** Placeholder monthly GSR fee remission the appointment modal pre-fills; confirm before relying on it. */
export const GSR_FEE_REMISSION_DEFAULT = 1500;

const PERSONNEL = new Set([SALARY_CATEGORY, FRINGE_CATEGORY]);
export const BALANCE_ADJUSTMENT_CATEGORY = 'Planning balance adjustment';

/** Months since year 0, so month arithmetic is integer math. Accepts 'YYYY-MM' or longer ISO strings. */
const toIndex = (value: string) =>
  Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;

const toMonth = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/** Imported pay is snapshot-dated; a planned future hire's input is its starting rate. */
export function getAppointmentSalaryBaseMonth(
  appointment: ProjectionAppointment,
  snapshotMonth: string
) {
  const startMonth = appointment.startDate?.slice(0, 7);
  return !appointment.isSeeded && startMonth && startMonth > snapshotMonth
    ? startMonth
    : snapshotMonth;
}

const within = (m: number, start: string | null, end: string | null) =>
  (start === null || toIndex(start) <= m) &&
  (end === null || toIndex(end) >= m);

const DAY_MS = 86_400_000;
type DayRange = { end: number; start: number };
type DateBounds = { endDate: string | null; startDate: string | null };

// Date-only planning windows use UTC days so daylight saving cannot change their length.
const toDay = (value: string) =>
  Date.parse(`${value.slice(0, 10)}T00:00:00Z`) / DAY_MS;

const monthDays = (m: number): DayRange => ({
  end: Date.UTC(Math.floor(m / 12), (m % 12) + 1, 0) / DAY_MS,
  start: Date.UTC(Math.floor(m / 12), m % 12, 1) / DAY_MS,
});

/** Counts the inclusive intersection; a missing endpoint imposes no bound. */
function overlapDays(range: DayRange, ...bounds: DateBounds[]) {
  let { end, start } = range;
  for (const bound of bounds) {
    if (bound.startDate !== null) {
      start = Math.max(start, toDay(bound.startDate));
    }
    if (bound.endDate !== null) {
      end = Math.min(end, toDay(bound.endDate));
    }
  }
  return Math.max(0, end - start + 1);
}

/**
 * Each funding source forecasts from its captured inputs. Employee salary bases
 * remain tied to the original plan snapshot, including when later sources are added.
 */
export function computePiProjection(projection: Projection): {
  appointmentFunding: AppointmentFundingMonth[];
  rows: PiProjectionRow[];
} {
  const seed = new Date(projection.seededAt);
  const seedIndex = seed.getUTCFullYear() * 12 + seed.getUTCMonth();
  const captures = new Map(
    projection.fundingSources.map((source) => {
      const capturedAt = source.capturedAt;
      const index = toIndex(capturedAt);
      return [
        source.id,
        {
          day: toDay(capturedAt),
          firstForecast:
            source.sourceKind === 'Planned' && source.startDate
              ? Math.max(index, toIndex(source.startDate))
              : index,
          index,
        },
      ];
    })
  );
  const capture = (source: ProjectionFundingSource) => captures.get(source.id)!;

  const sourceEnd = (p: ProjectionFundingSource) =>
    p.endDate ? toIndex(p.endDate) : capture(p).firstForecast + 12;
  const horizonEnd = Math.max(
    seedIndex,
    ...projection.fundingSources.map((source) => capture(source).firstForecast),
    ...projection.fundingSources.map(sourceEnd)
  );
  const firstIndex = Math.min(
    seedIndex,
    ...projection.fundingSources.map((source) => capture(source).index),
    ...projection.fundingSources.flatMap((p) =>
      p.actuals.map((a) => toIndex(a.month))
    )
  );

  // fundingSourceId -> category -> month index -> amount
  const charges = new Map<number, Map<string, Map<number, number>>>();
  const charge = (
    source: ProjectionFundingSource,
    category: string,
    m: number,
    amount: number
  ) => {
    if (m < capture(source).firstForecast || m > sourceEnd(source)) {
      return;
    }
    const byCategory =
      charges.get(source.id) ?? new Map<string, Map<number, number>>();
    const byMonth = byCategory.get(category) ?? new Map<number, number>();
    byMonth.set(m, (byMonth.get(m) ?? 0) + amount);
    byCategory.set(category, byMonth);
    charges.set(source.id, byCategory);
  };

  const fundingSourcesById = new Map(
    projection.fundingSources.map((p) => [p.id, p])
  );
  const appointmentFunding: AppointmentFundingMonth[] = [];
  for (const appointment of projection.appointments) {
    for (let m = seedIndex; m <= horizonEnd; m++) {
      if (!within(m, appointment.startDate, appointment.endDate)) {
        continue;
      }
      const days = monthDays(m);
      const activeAppointmentDays = overlapDays(days, appointment);
      const salary =
        (appointment.monthlySalary ?? 0) *
        appointment.fte *
        colaFactor(appointment, seedIndex, m);
      const costs: [string, number][] = [
        [SALARY_CATEGORY, salary],
        [
          FRINGE_CATEGORY,
          salary * (appointment.cbrRate + appointment.vacationAccrualRate),
        ],
        // Fees are an appointment total, independent of salary, FTE, and COLA.
        [FEE_REMISSION_CATEGORY, appointment.feeRemissionMonthly ?? 0],
      ];
      let fundedPercent = 0;
      for (const f of appointment.allocations) {
        if (!within(m, f.startDate, f.endDate)) {
          continue;
        }
        const source =
          f.fundingSourceId === null
            ? undefined
            : fundingSourcesById.get(f.fundingSourceId);

        if (
          activeAppointmentDays === 0 ||
          (f.fundingSourceId !== null && !source) ||
          (source && m > sourceEnd(source))
        ) {
          continue;
        }
        const eligibleDays = source
          ? overlapDays(days, appointment, f, source)
          : overlapDays(days, appointment, f);
        fundedPercent += f.percent * (eligibleDays / activeAppointmentDays);
        if (!source || eligibleDays === 0) {
          continue;
        }

        // Use the whole month's eligible days, including days before the snapshot.
        const fraction = eligibleDays / overlapDays(days);
        for (const [category, cost] of costs) {
          if (cost) {
            charge(source, category, m, cost * f.percent * fraction);
          }
        }
      }
      if (activeAppointmentDays > 0) {
        appointmentFunding.push({
          appointmentId: appointment.id,
          fundedPercent,
          month: toMonth(m),
        });
      }
    }
  }

  // Net salary and fringe targets only; category 08 actuals cannot identify employee fees.
  // Booked salary and fringe stay fixed even when the new estimate is lower.
  for (const source of projection.fundingSources) {
    const sourceIndex = capture(source).index;
    for (const category of PERSONNEL) {
      const target =
        charges.get(source.id)?.get(category)?.get(sourceIndex) ?? 0;
      const booked = source.actuals
        .filter(
          (actual) =>
            actual.expenditureCategory === category &&
            toIndex(actual.month) === sourceIndex
        )
        .reduce((total, actual) => total + actual.amount, 0);
      const remaining = Math.max(target - booked, 0);
      if (remaining !== target) {
        // Net booked credits even after source end; charge's date guard only bounds forecasts.
        const byCategory =
          charges.get(source.id) ?? new Map<string, Map<number, number>>();
        const byMonth = byCategory.get(category) ?? new Map<number, number>();
        byMonth.set(sourceIndex, remaining);
        byCategory.set(category, byMonth);
        charges.set(source.id, byCategory);
      }
    }
  }

  for (const source of projection.fundingSources) {
    const {
      day: sourceDay,
      firstForecast,
      index: sourceIndex,
    } = capture(source);
    for (const e of source.expenses) {
      if (e.kind === 'OneTime') {
        if (e.startMonth) {
          const m = toIndex(e.startMonth);
          // A one-time expense specifies a month, so an eligible month keeps its full amount.
          if (overlapDays(monthDays(m), source) > 0) {
            charge(source, e.expenditureCategory, m, e.amount);
          }
        }
        continue;
      }
      const start = e.startMonth ? toIndex(e.startMonth) : firstForecast;
      const end = Math.min(
        e.endMonth ? toIndex(e.endMonth) : sourceEnd(source),
        sourceEnd(source)
      );
      for (let m = Math.max(start, firstForecast); m <= end; m++) {
        const days = monthDays(m);
        const eligibleDays = overlapDays(
          { ...days, start: m === sourceIndex ? sourceDay + 1 : days.start },
          source
        );
        if (eligibleDays === 0) {
          continue;
        }
        charge(
          source,
          e.expenditureCategory,
          m,
          e.amount * (eligibleDays / overlapDays(days))
        );
      }
    }
  }

  const rows: PiProjectionRow[] = [];
  for (const source of projection.fundingSources) {
    const { firstForecast, index: sourceIndex } = capture(source);
    const sourceCharges =
      charges.get(source.id) ?? new Map<string, Map<number, number>>();
    const actuals = new Map<string, Map<number, number>>();
    for (const a of source.actuals) {
      const m = toIndex(a.month);
      const byMonth =
        actuals.get(a.expenditureCategory) ?? new Map<number, number>();
      byMonth.set(m, (byMonth.get(m) ?? 0) + a.amount);
      actuals.set(a.expenditureCategory, byMonth);
    }
    const categories = new Set([
      ...source.budgets.map((b) => b.expenditureCategory),
      ...actuals.keys(),
      ...sourceCharges.keys(),
      ...(source.sourceKind === 'Planned' || source.balanceAdjustment
        ? [BALANCE_ADJUSTMENT_CATEGORY]
        : []),
    ]);
    const last = Math.max(sourceEnd(source), firstForecast);

    for (const category of [...categories].sort()) {
      const budget = source.budgets.find(
        (b) => b.expenditureCategory === category
      );
      const capturedRemaining = budget
        ? budget.budget - budget.spentToDate - budget.committed
        : 0;
      const startRemaining =
        capturedRemaining +
        (category === BALANCE_ADJUSTMENT_CATEGORY
          ? source.balanceAdjustment
          : 0);
      const actual = (m: number) => actuals.get(category)?.get(m) ?? 0;
      const planned = (m: number) => sourceCharges.get(category)?.get(m) ?? 0;

      // Remaining at the end of each month: history integrates backward from the seed boundary.
      const remaining = new Map<number, number>([
        [firstForecast - 1, startRemaining],
      ]);
      for (let m = firstForecast - 1; m > firstIndex; m--) {
        remaining.set(m - 1, remaining.get(m)! + actual(m));
      }
      for (let m = firstForecast; m <= last; m++) {
        // The snapshot balance already includes its booked actuals.
        const additionalActual = m === sourceIndex ? 0 : actual(m);
        remaining.set(m, remaining.get(m - 1)! - additionalActual - planned(m));
      }

      for (let m = firstIndex; m <= last; m++) {
        rows.push({
          actualAmount: actual(m),
          expenditureCategory: category,
          fundingSourceId: source.id,
          kind:
            m < firstForecast
              ? 'actual'
              : m === sourceIndex
                ? 'blended'
                : 'projected',
          month: toMonth(m),
          projectedAmount: planned(m),
          remaining:
            source.sourceKind === 'Planned' && m < firstForecast
              ? 0
              : remaining.get(m)!,
        });
      }
    }
  }

  return { appointmentFunding, rows };
}

/** Compounds COLA after the salary's base month, never within that month. */
function colaFactor(
  appointment: ProjectionAppointment,
  seedIndex: number,
  m: number
) {
  const salaryMonth = toIndex(
    getAppointmentSalaryBaseMonth(appointment, toMonth(seedIndex))
  );
  let n = 0;
  for (let k = salaryMonth + 1; k <= m; k++) {
    if ((k % 12) + 1 === appointment.colaMonth) {
      n++;
    }
  }
  return (1 + appointment.colaRate) ** n;
}
