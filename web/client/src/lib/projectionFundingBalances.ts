import type {
  AppointmentFundingMonth,
  PiProjectionRow,
} from '@/lib/piProjection.ts';
import { getFundingSourceOutlook } from '@/lib/projectionWorkspace.ts';

export type SourceFundingBalances = ReadonlyMap<
  number,
  ReadonlyMap<string, number>
>;

/** Monthly source totals shared with the funding outlook, including zero and positive balances. */
export function buildSourceFundingBalances(
  rows: PiProjectionRow[]
): SourceFundingBalances {
  const sourceIds = new Set(rows.map(({ fundingSourceId }) => fundingSourceId));
  return new Map(
    [...sourceIds].map((id) => [
      id,
      new Map(
        getFundingSourceOutlook(rows, id).map(({ month, remaining }) => [
          month,
          remaining,
        ])
      ),
    ])
  );
}

/** Reports only positive assigned shares in short months, without changing their funding. */
export function getAppointmentFundingShortfalls(
  months: AppointmentFundingMonth[],
  sourceBalances: SourceFundingBalances
) {
  return months.flatMap(({ month, shares }) =>
    shares.flatMap(({ fundingSourceId, percent }) => {
      const remaining =
        fundingSourceId === null
          ? undefined
          : sourceBalances.get(fundingSourceId)?.get(month);
      return fundingSourceId !== null &&
        percent > 0 &&
        remaining !== undefined &&
        remaining < 0
        ? [{ fundingSourceId, month, remaining }]
        : [];
    })
  );
}
