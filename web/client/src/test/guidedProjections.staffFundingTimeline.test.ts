import { describe, expect, it } from 'vitest';
import {
  OUTSIDE_FUNDING_ID,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';
import { createProjectionPlan } from '@/components/guidedProjections/planModel.ts';
import { staffFundingMonths } from '@/components/guidedProjections/staffFundingTimeline.ts';
import { createDemoData } from '@/demo/data.ts';
import { createProjectionDemoPlan } from '@/demo/projectionPlan.ts';

function fixture(): ProjectionPlan {
  const plan = createProjectionPlan(
    createProjectionDemoPlan(createDemoData(17, '2026-01'))
  );
  plan.startMonth = '2026-01';
  plan.months = 3;
  plan.funding = plan.funding.slice(0, 2).map((fund, index) => ({
    ...fund,
    endDate: index === 0 ? '2026-02-28' : '2026-12-31',
    startDate: '2026-01-01',
  }));
  plan.selectedFunding = plan.funding.map((fund) => fund.id);
  plan.staff = [
    {
      ...plan.staff[0],
      included: true,
      splits: [
        {
          endMonth: '2026-03',
          fundingId: plan.funding[0].id,
          id: 'first',
          percent: 40,
          startMonth: '2026-01',
        },
        {
          endMonth: '2026-03',
          fundingId: plan.funding[1].id,
          id: 'second',
          percent: 30,
          startMonth: '2026-02',
        },
      ],
    },
  ];
  return plan;
}

describe('Staff monthly funding timeline', () => {
  it('shows funding changes and opens a gap when a project ends', () => {
    const plan = fixture();
    expect(
      staffFundingMonths(plan.staff[0], plan).map(({ month, open, total }) => ({
        month,
        open,
        total,
      }))
    ).toEqual([
      { month: '2026-01', open: 60, total: 40 },
      { month: '2026-02', open: 30, total: 70 },
      { month: '2026-03', open: 70, total: 30 },
    ]);
    plan.selectedFunding = [plan.funding[1].id];
    expect(staffFundingMonths(plan.staff[0], plan)[0]).toMatchObject({
      open: 100,
      shares: [],
      total: 0,
    });
  });

  it('measures open funding against appointment FTE and includes outside funding', () => {
    const plan = fixture();
    const person = plan.staff[0];
    person.serverJob = {
      cbrRate: 0.25,
      colaMonth: 7,
      colaRate: 0,
      employeeId: null,
      endDate: '2026-02-15',
      feeRemissionMonthly: null,
      fte: 0.5,
      fundingEntries: [],
      id: 1,
      isSeeded: false,
      jobCode: null,
      monthlySalary: 5000,
      name: person.name,
      positionNumber: null,
      rateSet: 'DVCMP',
      startDate: '2026-02-15',
      title: null,
      vacationAccrualRate: 0,
    };
    person.splits = [
      { ...person.splits[0], fundingId: OUTSIDE_FUNDING_ID, percent: 20 },
    ];
    const months = staffFundingMonths(person, plan);
    expect(months[0]).toMatchObject({ active: false, open: 0, shares: [] });
    expect(months[1]).toMatchObject({
      active: true,
      appointment: 50,
      open: 30,
      shares: [
        { id: OUTSIDE_FUNDING_ID, name: 'Outside portfolio', percent: 20 },
      ],
    });
    expect(months[2]).toMatchObject({ active: false, open: 0, shares: [] });
  });

  it('flags excess funding and clears the timeline for an excluded person', () => {
    const plan = fixture();
    const person = plan.staff[0];
    person.splits[0].percent = 90;
    expect(staffFundingMonths(person, plan)[1]).toMatchObject({
      open: 0,
      over: 20,
      total: 120,
    });
    person.included = false;
    expect(staffFundingMonths(person, plan)[1]).toMatchObject({
      open: 0,
      over: 0,
      shares: [],
      total: 0,
    });
  });
});
