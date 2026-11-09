import type {
  ProjectionAppointment,
  ProjectionDraft,
  ProjectionFundingAllocation,
} from '@/queries/projections.ts';
import type { AppointmentOperationResult } from '@/lib/projectionAppointments.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';
export interface AllocationRange {
  endDate: string | null;
  startDate: string | null;
}

export type AllocationShare = Pick<
  ProjectionFundingAllocation,
  'fundingSourceId' | 'percent'
>;

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

function validDate(value: string | null) {
  return (
    value === null ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !value.startsWith('0000') &&
      Number.isFinite(day(value)) &&
      date(day(value)) === value)
  );
}

function validRange(range: AllocationRange) {
  return (
    validDate(range.startDate) &&
    validDate(range.endDate) &&
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
  appointment: ProjectionAppointment,
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
  appointment: ProjectionAppointment,
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
  month: string
): {
  mixed: boolean;
  range: AllocationRange;
  shares: AllocationShare[];
} {
  const start = `${month}-01`;
  if (!validDate(start)) {
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
  const shares = sharesOnDay(appointment, boundaries[0]);
  const mixed = !allocationRangeMatches(appointment, clipped, shares);
  // A mixed month starts with just its first constant segment; expanding it is an explicit replacement.
  const nextChange = mixed
    ? boundaries
        .slice(1)
        .find(
          (boundary) =>
            shareKey(sharesOnDay(appointment, boundary)) !== shareKey(shares)
        )
    : undefined;
  return {
    mixed,
    range:
      nextChange === undefined
        ? clipped
        : { ...clipped, endDate: date(nextChange - 1) },
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
