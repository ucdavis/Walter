import {
  monthLabel,
  type FundingMonthProjection,
  type FundingSource,
} from '@/components/projections/projection.ts';

export type FundingChartPoint = {
  active: boolean;
  deficit: boolean;
  drawdown: number;
  drawdownExpense: number;
  month: string;
  monthLabel: string;
  remainingBalance: number | null;
};

export function buildFundingChartData(
  source: FundingSource,
  visibleMonths: string[],
  fundingMonths: FundingMonthProjection[]
): FundingChartPoint[] {
  const fundingMonthByMonth = new Map(
    fundingMonths
      .filter((fundingMonth) => fundingMonth.sourceId === source.id)
      .map((fundingMonth) => [fundingMonth.month, fundingMonth])
  );

  return visibleMonths.map((month) => {
    const fundingMonth = fundingMonthByMonth.get(month);
    const active = fundingMonth?.active ?? false;
    const drawdown = active ? (fundingMonth?.drawdown ?? 0) : 0;

    return {
      active,
      deficit: active ? (fundingMonth?.deficit ?? false) : false,
      drawdown,
      drawdownExpense: drawdown === 0 ? 0 : -drawdown,
      month,
      monthLabel: monthLabel(month),
      remainingBalance: active ? (fundingMonth?.remainingBalance ?? 0) : null,
    };
  });
}
