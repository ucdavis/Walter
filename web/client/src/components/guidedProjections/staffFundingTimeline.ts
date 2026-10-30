import {
  OUTSIDE_FUNDING_ID,
  planMonths,
  splitActive,
  type PlanStaff,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';
import { isFundingSourceActiveInMonth } from '@/components/projections/projection.ts';

type MonthlyShare = {
  color: string;
  id: string;
  label: string;
  name: string;
  percent: number;
};

export function staffFundingMonths(person: PlanStaff, plan: ProjectionPlan) {
  const funds = new Map(
    plan.funding
      .filter((fund) => plan.selectedFunding.includes(fund.id))
      .map((fund) => [fund.id, fund])
  );
  const appointment = (person.serverJob?.fte ?? 1) * 100;

  return planMonths(plan).map((month) => {
    const job = person.serverJob;
    const active =
      appointment > 0 &&
      (!job?.startDate || month >= job.startDate.slice(0, 7)) &&
      (!job?.endDate || month <= job.endDate.slice(0, 7));
    const shares = new Map<string, MonthlyShare>();

    if (person.included && active) {
      for (const split of person.splits) {
        if (!splitActive(split, month) || !(split.percent > 0)) {
          continue;
        }
        const outside = split.fundingId === OUTSIDE_FUNDING_ID;
        const fund = funds.get(split.fundingId);
        // Expired or excluded projects cannot cover this month's appointment.
        if (!outside && (!fund || !isFundingSourceActiveInMonth(fund, month))) {
          continue;
        }
        const existing = shares.get(split.fundingId);
        shares.set(split.fundingId, {
          color: fund?.color ?? '#64748b',
          id: split.fundingId,
          label: outside
            ? 'Outside'
            : (fund!.serverProject?.projectNumber ?? fund!.name),
          name: outside ? 'Outside portfolio' : fund!.name,
          percent: (existing?.percent ?? 0) + split.percent,
        });
      }
    }

    const total = [...shares.values()].reduce(
      (sum, share) => sum + share.percent,
      0
    );
    return {
      active,
      appointment,
      month,
      open: person.included && active ? Math.max(0, appointment - total) : 0,
      over: Math.max(0, total - appointment),
      shares: [...shares.values()],
      total,
    };
  });
}
