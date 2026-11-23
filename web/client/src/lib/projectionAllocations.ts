import type {
  ProjectionAppointment,
  ProjectionDraft,
  ProjectionFundingAllocation,
} from '@/queries/projections.ts';
import type { AppointmentOperationResult } from '@/lib/projectionAppointments.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';
import { isPlanningDate } from '@/lib/date.ts';
export interface AllocationRange {
  endDate: string | null;
  startDate: string | null;
}

export type AllocationShare = Pick<
  ProjectionFundingAllocation,
  'fundingSourceId' | 'percent'
>;

export const allocationPercentText = (value: number) =>
  String(Number((value * 100).toPrecision(12)));

const DAY_MS = 86_400_000;
const day = (value: string) => Date.parse(`${value}T00:00:00Z`) / DAY_MS;
const date = (value: number) =>
  new Date(value * DAY_MS).toISOString().slice(0, 10);
// DateOnly's representable endpoints also bound an unrestricted allocation.
const MIN_DAY = day('0001-01-01');
const MAX_DAY = day('9999-12-31');
const bounds = (range: AllocationRange) => ({
  end: range.endDate === null ? MAX_DAY : day(range.endDate),
  start: range.startDate === null ? MIN_DAY : day(range.startDate),
});

function validRange(range: AllocationRange) {
  return (
    (range.startDate === null || isPlanningDate(range.startDate)) &&
    (range.endDate === null || isPlanningDate(range.endDate)) &&
    !(range.startDate && range.endDate && range.startDate > range.endDate)
  );
}

function validateShares(plan: ProjectionDraft, shares: AllocationShare[]) {
  const sourceIds = new Set(plan.content.fundingSources.map(({ id }) => id));
  for (const share of shares) {
    if (
      share.fundingSourceId !== null &&
      !sourceIds.has(share.fundingSourceId)
    ) {
      return 'Choose a funding source in this plan or Outside this plan.';
    }
    if (
      !Number.isFinite(share.percent) ||
      share.percent < 0 ||
      share.percent > 1
    ) {
      return 'Enter each allocation from 0% to 100% of the appointment.';
    }
  }
  return null;
}

/** Each row must be valid; gaps, overlaps, outside funding, and repeated sources remain saveable. */
export function validateProjectionAllocations(
  plan: ProjectionDraft
): string | null {
  for (const appointment of plan.content.appointments) {
    const error =
      validateShares(plan, appointment.allocations) ??
      (appointment.allocations.some((allocation) => !validRange(allocation))
        ? 'Choose valid allocation dates with the end on or after the start.'
        : null);
    if (error) {
      return `${appointment.name || 'Appointment'}: ${error}`;
    }
  }
  return null;
}

export function validateFundingReplacement(
  plan: ProjectionDraft,
  appointmentId: number,
  range: AllocationRange,
  shares: AllocationShare[]
): string | null {
  if (!plan.content.appointments.some(({ id }) => id === appointmentId)) {
    return 'This appointment is no longer in the plan.';
  }
  if (!validRange(range)) {
    return 'Choose a valid replacement period with the end on or after the start.';
  }
  return validateShares(plan, shares);
}

function sharesOnDay(
  appointment: Pick<ProjectionAppointment, 'allocations'>,
  currentDay: number
): AllocationShare[] {
  return appointment.allocations.flatMap((allocation) => {
    const { end, start } = bounds(allocation);
    return start <= currentDay && end >= currentDay
      ? [
          {
            fundingSourceId: allocation.fundingSourceId,
            percent: allocation.percent,
          },
        ]
      : [];
  });
}

function shareKey(shares: AllocationShare[]) {
  // Compare multisets without combining duplicate entries or changing stored precision.
  return shares
    .map(({ fundingSourceId, percent }) =>
      JSON.stringify([fundingSourceId, percent])
    )
    .sort()
    .join('|');
}

function allocationBoundaries(
  appointment: Pick<ProjectionAppointment, 'allocations'>,
  range: AllocationRange
) {
  const { end, start } = bounds(range);
  const boundaries = new Set([start, end + 1]);
  for (const allocation of appointment.allocations) {
    const allocationRange = bounds(allocation);
    if (allocationRange.start > start && allocationRange.start <= end) {
      boundaries.add(allocationRange.start);
    }
    if (allocationRange.end >= start && allocationRange.end < end) {
      boundaries.add(allocationRange.end + 1);
    }
  }
  return [...boundaries].sort((a, b) => a - b);
}

export interface AllocationDifference {
  fundingSourceId: number | null;
  original: number | null;
  planned: number;
}

export interface AllocationChangePeriod extends AllocationRange {
  shares: AllocationDifference[];
}

function sharesBySource(
  allocations: ProjectionFundingAllocation[],
  currentDay: number
) {
  const totals = new Map<number | null, number>();
  for (const share of sharesOnDay({ allocations }, currentDay)) {
    totals.set(
      share.fundingSourceId,
      (totals.get(share.fundingSourceId) ?? 0) + share.percent
    );
  }
  return totals;
}

/** Compare inclusive schedule intervals by total share per source, keeping outside funding distinct from a gap. */
export function compareAllocationSchedules(
  original: ProjectionFundingAllocation[] | null,
  planned: ProjectionFundingAllocation[]
) {
  const points = allocationBoundaries(
    { allocations: [...(original ?? []), ...planned] },
    { endDate: null, startDate: null }
  );
  const periods: AllocationChangePeriod[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1] - 1;
    const before = sharesBySource(original ?? [], start);
    const after = sharesBySource(planned, start);
    const ids = [...new Set([...before.keys(), ...after.keys()])].sort(
      (a, b) => (a ?? Infinity) - (b ?? Infinity)
    );
    const shares: AllocationDifference[] = [];
    for (const fundingSourceId of ids) {
      const from =
        original === null
          ? null
          : allocationPercentText(before.get(fundingSourceId) ?? 0);
      const to = allocationPercentText(after.get(fundingSourceId) ?? 0);
      if (from !== to) {
        shares.push({
          fundingSourceId,
          original: from === null ? null : Number(from) / 100,
          planned: Number(to) / 100,
        });
      }
    }
    if (!shares.length) {
      continue;
    }
    const previous = periods.at(-1);
    const endDate = end === MAX_DAY ? null : date(end);
    if (
      previous?.endDate &&
      day(previous.endDate) + 1 === start &&
      JSON.stringify(previous.shares) === JSON.stringify(shares)
    ) {
      previous.endDate = endDate;
    } else {
      periods.push({
        endDate,
        shares,
        startDate: start === MIN_DAY ? null : date(start),
      });
    }
  }
  return periods;
}

/** Inspect every constant interval so an unchanged Apply does not fragment a longer schedule. */
export function allocationRangeMatches(
  appointment: ProjectionAppointment,
  range: AllocationRange,
  shares: AllocationShare[]
) {
  const expected = shareKey(shares);
  return allocationBoundaries(appointment, range)
    .slice(0, -1)
    .every(
      (boundary) => shareKey(sharesOnDay(appointment, boundary)) === expected
    );
}

export function getAllocationEditorSeed(
  appointment: ProjectionAppointment,
  month: string,
  anchorDate?: string | null
): {
  mixed: boolean;
  range: AllocationRange;
  shares: AllocationShare[];
} {
  const start = `${month}-01`;
  if (!isPlanningDate(start)) {
    throw new Error('Choose a valid funding month.');
  }
  const last = new Date(day(start) * DAY_MS);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const monthRange = {
    endDate: date(last.getTime() / DAY_MS),
    startDate: start,
  };
  const clipped = {
    endDate:
      appointment.endDate && appointment.endDate < monthRange.endDate
        ? appointment.endDate
        : monthRange.endDate,
    startDate:
      appointment.startDate && appointment.startDate > monthRange.startDate
        ? appointment.startDate
        : monthRange.startDate,
  };
  if (clipped.startDate > clipped.endDate) {
    return { mixed: false, range: monthRange, shares: [] };
  }
  const boundaries = allocationBoundaries(appointment, clipped);
  const anchor =
    anchorDate &&
    isPlanningDate(anchorDate) &&
    anchorDate >= clipped.startDate &&
    anchorDate <= clipped.endDate
      ? day(anchorDate)
      : boundaries[0];
  const shares = sharesOnDay(appointment, anchor);
  const expected = shareKey(shares);
  const mixed = !allocationRangeMatches(appointment, clipped, shares);
  // Source shortcuts select their matching segment; timeline clicks still start at the first segment.
  // Expanding either segment remains an explicit replacement of the surrounding schedule.
  const previousChange = boundaries
    .slice(0, -1)
    .findLastIndex(
      (boundary) =>
        boundary < anchor &&
        shareKey(sharesOnDay(appointment, boundary)) !== expected
    );
  const segmentStart = boundaries[previousChange + 1];
  const nextChange = mixed
    ? boundaries
        .filter((boundary) => boundary > anchor)
        .find(
          (boundary) =>
            shareKey(sharesOnDay(appointment, boundary)) !== expected
        )
    : undefined;
  return {
    mixed,
    range: mixed
      ? {
          endDate:
            nextChange === undefined ? clipped.endDate : date(nextChange - 1),
          startDate: date(segmentStart),
        }
      : clipped,
    shares,
  };
}

/** Replace only the selected inclusive period; preserve all original funding before and after it. */
export function replaceAppointmentFunding<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  appointmentId: number,
  range: AllocationRange,
  shares: AllocationShare[]
): AppointmentOperationResult<T> {
  const error = validateFundingReplacement(
    session.draft,
    appointmentId,
    range,
    shares
  );
  if (error) {
    return { error, ok: false };
  }
  const appointment = session.draft.content.appointments.find(
    ({ id }) => id === appointmentId
  )!;
  const unchanged = allocationRangeMatches(appointment, range, shares);
  if (unchanged && !appointment.hasUnmatchedFunding) {
    return { ok: true, session };
  }
  const selected = bounds(range);
  const allocations = unchanged
    ? appointment.allocations
    : [
        ...appointment.allocations.flatMap((allocation) => {
          const existing = bounds(allocation);
          if (existing.end < selected.start || existing.start > selected.end) {
            return [allocation];
          }
          const retained: ProjectionFundingAllocation[] = [];
          if (existing.start < selected.start) {
            retained.push({ ...allocation, endDate: date(selected.start - 1) });
          }
          if (existing.end > selected.end) {
            retained.push({ ...allocation, startDate: date(selected.end + 1) });
          }
          return retained;
        }),
        ...shares.map(({ fundingSourceId, percent }) => ({
          ...range,
          fundingSourceId,
          percent,
        })),
      ];
  return {
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        content: {
          ...session.draft.content,
          appointments: session.draft.content.appointments.map((candidate) =>
            candidate.id === appointmentId
              ? { ...candidate, allocations, hasUnmatchedFunding: false }
              : candidate
          ),
        },
      },
      revision: session.revision + 1,
    },
  };
}
