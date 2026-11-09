import type {
  ProjectionDraft,
  ProjectionAppointment,
  ProjectionFundingSource,
} from '@/queries/projections.ts';
import type { AllocationShare } from '@/lib/projectionAllocations.ts';

export interface PiProjectionRow {
  actualAmount: number;
  expenditureCategory: string;
  fundingSourceId: number;
  kind: 'blended' | 'projected';
  month: string; // 'YYYY-MM'
  projectedAmount: number;
  remaining: number;
}

export interface AppointmentFundingMonth {
  appointmentId: number;
  /** Average funding share over active appointment days; gaps and overlaps can offset. */
  fundedPercent: number;
  /** At least one active day is below 100%, independent of the monthly average. */
  hasGap: boolean;
  /** At least one active day exceeds 100%, independent of the monthly average. */
  hasOverlap: boolean;
  month: string;
  /** Average appointment share by source, including explicit outside funding. */
  shares: AllocationShare[];
}

export interface ProjectionForecastWindow {
  endMonth: string;
  startMonth: string;
}

export const SALARY_CATEGORY = '01 - Salaries and Wages';
export const FRINGE_CATEGORY = '02 - Fringe Benefits';
export const FEE_REMISSION_CATEGORY = '08 - Fellowship & Scholarships';
const PERSONNEL = new Set([SALARY_CATEGORY, FRINGE_CATEGORY]);
export const BALANCE_ADJUSTMENT_CATEGORY = 'Planning balance adjustment';

/** Months since year 0, so month arithmetic is integer math. Accepts 'YYYY-MM' or longer ISO strings. */
const toIndex = (value: string) =>
  Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;

const toMonth = (index: number) =>
  `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;

const firstSourceForecast = (source: ProjectionFundingSource) =>
  source.sourceKind === 'Planned' && source.startDate
    ? Math.max(toIndex(source.capturedAt), toIndex(source.startDate))
    : toIndex(source.capturedAt);

/** Funding checks use the same bounded forecast period shown by the plan. */
export function getProjectionForecastWindow(
  projection: ProjectionDraft
): ProjectionForecastWindow {
  const start = toIndex(projection.seededAt);
  const end = Math.max(
    start,
    ...projection.fundingSources.flatMap((source) => {
      const first = firstSourceForecast(source);
      return [first, source.endDate ? toIndex(source.endDate) : first + 12];
    })
  );
  return { endMonth: toMonth(end), startMonth: toMonth(start) };
}

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

const monthDays = (m: number): DayRange => {
  const start = new Date(`${toMonth(m)}-01T00:00:00Z`);
  const end = new Date(start);
  // Date.UTC treats years below 100 as 1900–1999; date-only strings retain the supplied year.
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { end: end.getTime() / DAY_MS, start: start.getTime() / DAY_MS };
};

/** Counts the inclusive intersection; a missing endpoint imposes no bound. */
function overlapRange(range: DayRange, ...bounds: DateBounds[]): DayRange {
  let { end, start } = range;
  for (const bound of bounds) {
    if (bound.startDate !== null) {
      start = Math.max(start, toDay(bound.startDate));
    }
    if (bound.endDate !== null) {
      end = Math.min(end, toDay(bound.endDate));
    }
  }
  return { end, start };
}

function overlapDays(range: DayRange, ...bounds: DateBounds[]) {
  const { end, start } = overlapRange(range, ...bounds);
  return Math.max(0, end - start + 1);
}

function fundingCoverage(events: Map<number, number>, active: DayRange) {
  const boundaries = [
    ...new Set([active.start, active.end + 1, ...events.keys()]),
  ].sort((a, b) => a - b);
  let share = 0;
  let hasGap = false;
  let hasOverlap = false;
  // Check constant intervals rather than averaging away a gap and an overlap in the same month.
  for (const [index, boundary] of boundaries.entries()) {
    share += events.get(boundary) ?? 0;
    if (index + 1 < boundaries.length && boundary <= active.end) {
      hasGap ||= share < 1 - 1e-9;
      hasOverlap ||= share > 1 + 1e-9;
    }
  }
  return { hasGap, hasOverlap };
}

/**
 * Each funding source forecasts from its captured inputs. Employee salary bases
 * remain tied to the original plan snapshot, including when later sources are added.
 */
export function computePiProjection(projection: ProjectionDraft): {
  appointmentFunding: AppointmentFundingMonth[];
  forecastWindow: ProjectionForecastWindow;
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
          firstForecast: firstSourceForecast(source),
          index,
        },
      ];
    })
  );
  const capture = (source: ProjectionFundingSource) => captures.get(source.id)!;

  const sourceEnd = (p: ProjectionFundingSource) =>
    p.endDate ? toIndex(p.endDate) : capture(p).firstForecast + 12;
  const forecastWindow = getProjectionForecastWindow(projection);
  const horizonEnd = toIndex(forecastWindow.endMonth);
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
      const fundingEvents = new Map<number, number>();
      const fundingShares = new Map<number | null, number>();
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
        const eligible = source
          ? overlapRange(days, appointment, f, source)
          : overlapRange(days, appointment, f);
        const eligibleDays = Math.max(0, eligible.end - eligible.start + 1);
        const averageShare = f.percent * (eligibleDays / activeAppointmentDays);
        fundedPercent += averageShare;
        if (eligibleDays > 0) {
          fundingShares.set(
            f.fundingSourceId,
            (fundingShares.get(f.fundingSourceId) ?? 0) + averageShare
          );
          fundingEvents.set(
            eligible.start,
            (fundingEvents.get(eligible.start) ?? 0) + f.percent
          );
          fundingEvents.set(
            eligible.end + 1,
            (fundingEvents.get(eligible.end + 1) ?? 0) - f.percent
          );
        }
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
          ...fundingCoverage(fundingEvents, overlapRange(days, appointment)),
          month: toMonth(m),
          shares: [...fundingShares].map(([fundingSourceId, percent]) => ({
            fundingSourceId,
            percent,
          })),
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

      let remaining = startRemaining;
      for (let m = firstForecast; m <= last; m++) {
        // The snapshot balance already includes its booked actuals.
        const additionalActual = m === sourceIndex ? 0 : actual(m);
        remaining -= additionalActual + planned(m);
        rows.push({
          actualAmount: actual(m),
          expenditureCategory: category,
          fundingSourceId: source.id,
          kind: m === sourceIndex ? 'blended' : 'projected',
          month: toMonth(m),
          projectedAmount: planned(m),
          remaining,
        });
      }
    }
  }

  return { appointmentFunding, forecastWindow, rows };
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
