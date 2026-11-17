import { describe, expect, it } from 'vitest';
import {
  computePiProjection,
  type AppointmentFundingMonth,
} from '@/lib/piProjection.ts';
import {
  fundingWarningLabel,
  getAppointmentFundingWarnings,
} from '@/lib/projectionFundingWarnings.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

const month = (
  value: string,
  fundedPercent = 0,
  hasGap = true,
  hasOverlap = false
): AppointmentFundingMonth => ({
  appointmentId: 101,
  fundedPercent,
  hasGap,
  hasOverlap,
  month: value,
  shares: [],
});

describe('appointment funding warning ranges', () => {
  it('groups contiguous matching statuses and formats full month names across years', () => {
    const { gaps } = getAppointmentFundingWarnings([
      month('2027-07', 0.5),
      month('2027-08'),
      month('2027-09'),
      month('2027-10'),
      month('2027-11', 1, false),
      month('2027-12'),
      month('2028-01'),
    ]);
    expect(gaps.map(fundingWarningLabel)).toEqual([
      'Partially allocated July 2027',
      'Unallocated August–October 2027',
      'Unallocated December 2027–January 2028',
    ]);
  });
  it('does not bridge missing inactive months, healthy months, or different gap statuses', () => {
    const { gaps } = getAppointmentFundingWarnings([
      month('2026-01'),
      month('2026-03'),
      month('2026-04', 1, false),
      month('2026-05'),
      month('2026-06', 0.5),
      month('2026-07'),
    ]);
    expect(gaps.map(fundingWarningLabel)).toEqual([
      'Unallocated January 2026',
      'Unallocated March 2026',
      'Unallocated May 2026',
      'Partially allocated June 2026',
      'Unallocated July 2026',
    ]);
  });
  it('retains simultaneous daily gaps and overlaps when their monthly average is 100% or more', () => {
    const warnings = getAppointmentFundingWarnings([
      month('2026-04', 1, true, true),
      month('2026-05', 1.2, true, true),
    ]);
    expect(warnings.gaps.map(fundingWarningLabel)).toEqual([
      'Partially allocated April–May 2026',
    ]);
    expect(warnings.overlaps.map(fundingWarningLabel)).toEqual([
      'Overallocated April–May 2026',
    ]);
  });
  it('uses active-day coverage for a partial appointment month and includes outside funding', () => {
    const plan = createSalaryExample();
    const appointment = plan.content.appointments[0];
    appointment.startDate = '2026-02-15';
    appointment.endDate = '2026-03-10';
    appointment.allocations = [
      {
        endDate: '2026-03-10',
        fundingSourceId: null,
        percent: 1,
        startDate: '2026-02-15',
      },
    ];
    const { appointmentFunding } = computePiProjection(plan);
    expect(appointmentFunding.map(({ month }) => month)).toEqual([
      '2026-02',
      '2026-03',
    ]);
    expect(getAppointmentFundingWarnings(appointmentFunding)).toEqual({
      gaps: [],
      overlaps: [],
    });
    appointment.allocations = [];
    expect(
      getAppointmentFundingWarnings(
        computePiProjection(plan).appointmentFunding
      ).gaps.map(fundingWarningLabel)
    ).toEqual(['Unallocated February–March 2026']);
  });
});
