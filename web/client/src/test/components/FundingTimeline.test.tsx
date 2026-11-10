import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { FundingTimeline } from '@/components/projections/FundingTimeline.tsx';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

afterEach(cleanup);

it('marks only the short source share and month, preserves gap warnings, and edits the selected month', async () => {
  const plan = createSalaryExample();
  const appointment = plan.content.appointments[0];
  const onEdit = vi.fn();
  render(
    <FundingTimeline
      appointment={appointment}
      forecastWindow={{ endMonth: '2026-03', startMonth: '2026-01' }}
      months={['2026-01', '2026-02', '2026-03'].map((month) => ({
        appointmentId: appointment.id,
        fundedPercent: 0.75,
        hasGap: true,
        hasOverlap: false,
        month,
        shares: [
          { fundingSourceId: 1, percent: 0.25 },
          { fundingSourceId: 2, percent: 0.25 },
          { fundingSourceId: null, percent: 0.25 },
        ],
      }))}
      onEdit={onEdit}
      sourceBalances={
        new Map([
          [
            1,
            {
              basis: 'general',
              categories: [],
              months: new Map([
                [
                  '2026-02',
                  {
                    fringeRemaining: 0,
                    personnelDeficits: [],
                    remaining: -100,
                    salaryRemaining: 0,
                  },
                ],
                [
                  '2026-03',
                  {
                    fringeRemaining: 0,
                    personnelDeficits: [],
                    remaining: 0,
                    salaryRemaining: 0,
                  },
                ],
              ]),
            },
          ],
          [
            2,
            {
              basis: 'general',
              categories: [],
              months: new Map([
                [
                  '2026-02',
                  {
                    fringeRemaining: 0,
                    personnelDeficits: [],
                    remaining: 5000,
                    salaryRemaining: 0,
                  },
                ],
              ]),
            },
          ],
        ])
      }
      sources={plan.content.fundingSources}
    />
  );
  const february = screen.getByRole('button', {
    name: /Alex Example, Feb 2026: Funding gaps. Projected funding shortfall. Project A: projected total remaining at the end of Feb 2026 is -\$100/,
  });
  const shortShare = within(february).getByText('Project A').parentElement!;
  expect(shortShare.style.backgroundImage).toContain(
    'repeating-linear-gradient'
  );
  expect(
    within(february).getByText('Project B').parentElement!.style.backgroundImage
  ).toBe('');
  expect(
    within(february).getByText('Outside this plan').parentElement!.style
      .backgroundImage
  ).toBe('');
  expect(shortShare).not.toHaveAttribute('title');
  const user = userEvent.setup();
  await user.hover(shortShare);
  const card = await screen.findByRole('tooltip');
  expect(
    within(card).getByText('Source overall planning balance')
  ).toBeInTheDocument();
  expect(within(card).getByText('$20,000.00')).toBeInTheDocument();
  expect(within(card).getByText('-$100.00')).toBeInTheDocument();
  expect(within(card).getByText('SYNTHETIC-1')).toBeInTheDocument();
  expect(
    within(card).getByText(/Average appointment share/)
  ).toBeInTheDocument();
  expect(within(card).queryByText(/Indirect/)).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.unhover(shortShare);
  fireEvent.focus(february);
  const keyboardCard = await screen.findByRole('tooltip');
  expect(within(keyboardCard).getByText('$5,000.00')).toBeInTheDocument();
  expect(
    within(keyboardCard).getByText(/explicitly funded outside this plan/)
  ).toBeInTheDocument();
  expect(within(february).getByText('Funding gap')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Alex Example, Mar 2026:/ })
  ).not.toHaveAccessibleName(/shortfall/);
  await user.hover(shortShare);
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(
    within(screen.getByRole('tooltip')).queryByText('$5,000.00')
  ).not.toBeInTheDocument();
  const march = screen.getByRole('button', { name: /Alex Example, Mar 2026:/ });
  await user.hover(within(march).getByText('Project A'));
  await screen.findByText('$0.00');
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(
    within(screen.getByRole('tooltip')).queryByText(/below zero/)
  ).not.toBeInTheDocument();
  await user.hover(shortShare);
  await screen.findByText('-$100.00');
  fireEvent.click(february);
  expect(onEdit).toHaveBeenCalledWith('2026-02');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Bars show average appointment shares/)
  ).not.toBeInTheDocument();
});

it('marks only the sponsored share for a fringe deficit while its overall balance stays positive', async () => {
  const plan = createSalaryExample();
  plan.content.fundingSources[0].projectType = 'Sponsored';
  const appointment = plan.content.appointments[0];
  render(
    <FundingTimeline
      appointment={appointment}
      forecastWindow={{ endMonth: '2026-02', startMonth: '2026-02' }}
      months={[
        {
          appointmentId: appointment.id,
          fundedPercent: 1,
          hasGap: false,
          hasOverlap: false,
          month: '2026-02',
          shares: [
            { fundingSourceId: 1, percent: 0.5 },
            { fundingSourceId: 2, percent: 0.5 },
          ],
        },
      ]}
      onEdit={vi.fn()}
      sourceBalances={
        new Map([
          [
            1,
            {
              basis: 'sponsored',
              categories: [],
              months: new Map([
                [
                  '2026-02',
                  {
                    fringeRemaining: -1200,
                    personnelDeficits: [
                      {
                        category: 'fringe',
                        expenditureCategory: '02 - Fringe Benefits',
                        missingBudget: true,
                        remaining: -1200,
                      },
                    ],
                    remaining: 150_000,
                    salaryRemaining: 65_000,
                  },
                ],
              ]),
            },
          ],
        ])
      }
      sources={plan.content.fundingSources}
    />
  );
  const month = screen.getByRole('button', {
    name: /Alex Example, Feb 2026:.*Fringe budget shortfall/,
  });
  const bad = within(month).getByText('Project A').parentElement!;
  expect(bad.style.backgroundImage).toContain('repeating-linear-gradient');
  expect(
    within(month).getByText('Project B').parentElement!.style.backgroundImage
  ).toBe('');
  await userEvent.hover(bad);
  const tooltip = await screen.findByRole('tooltip');
  expect(within(tooltip).getByText('$150,000.00')).toBeInTheDocument();
  expect(
    within(tooltip)
      .getAllByRole('term')
      .slice(0, 5)
      .map((term) => term.textContent)
  ).toEqual([
    'Average appointment share',
    'Source overall planning balance',
    'Source overall month-end balance',
    'Salary month-end balance',
    'Fringe month-end balance',
  ]);
  expect(
    within(tooltip).getByText('Fringe month-end balance')
  ).toBeInTheDocument();
  expect(
    within(tooltip).getByText('-$1,200.00 · No fringe budget recorded')
  ).toBeInTheDocument();
});
