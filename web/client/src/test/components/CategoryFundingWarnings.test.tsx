import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AppointmentBudgetWarnings } from '@/components/projections/AppointmentBudgetWarnings.tsx';
import { SourceCategoryBudgets } from '@/components/projections/SourceCategoryBudgets.tsx';
import { FRINGE_CATEGORY, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import type { SourceFundingBalance } from '@/lib/projectionFundingBalances.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

afterEach(cleanup);
const sources = createSalaryExample().content.fundingSources;
const balance: SourceFundingBalance = {
  basis: 'categories',
  categories: [],
  months: new Map([
    [
      '2026-02',
      {
        fringeRemaining: -1200,
        personnelDeficits: [
          {
            category: 'fringe',
            expenditureCategory: FRINGE_CATEGORY,
            missingBudget: false,
            remaining: -1200,
          },
        ],
        remaining: 150_000,
        salaryRemaining: 65_000,
      },
    ],
  ]),
};
const months = [
  {
    appointmentId: 1,
    fundedPercent: 1,
    hasGap: false,
    hasOverlap: false,
    month: '2026-02',
    shares: [{ fundingSourceId: 1, percent: 1 }],
  },
];

it('opens category-specific details by keyboard despite positive overall balance and offers saved outlook navigation', async () => {
  const user = userEvent.setup();
  const onViewSource = vi.fn();
  render(
    <AppointmentBudgetWarnings
      months={months}
      onViewSource={onViewSource}
      sourceBalances={new Map([[1, balance]])}
      sources={sources}
    />
  );
  const badge = screen.getByRole('button', { name: 'Fringe budget shortfall' });
  badge.focus();
  await user.keyboard('{Enter}');
  const dialog = screen.getByRole('dialog', {
    name: 'Fringe budget shortfall',
  });
  expect(within(dialog).getByText('Shortfall $1,200.00')).toBeInTheDocument();
  expect(within(dialog).getByText('Fringe · Feb 2026')).toBeInTheDocument();
  const link = within(dialog).getByRole('button', {
    name: 'View category balances',
  });
  link.focus();
  await user.keyboard('{Enter}');
  expect(onViewSource).toHaveBeenCalledWith(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(badge);
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { bubbles: true, cancelable: true })
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(badge).toHaveFocus();
});

it('omits unavailable wizard navigation and explains missing budgets without presenting zero as available', async () => {
  const missing: SourceFundingBalance = {
    ...balance,
    months: new Map([
      [
        '2026-02',
        {
          ...balance.months.get('2026-02')!,
          fringeRemaining: 0,
          personnelDeficits: [
            {
              category: 'fringe',
              expenditureCategory: FRINGE_CATEGORY,
              missingBudget: true,
              remaining: 0,
            },
          ],
        },
      ],
    ]),
  };
  render(
    <AppointmentBudgetWarnings
      months={months}
      sourceBalances={new Map([[1, missing]])}
      sources={sources}
    />
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Fringe budget shortfall' })
  );
  const dialog = screen.getByRole('dialog');
  expect(
    within(dialog).getByText('No fringe budget recorded')
  ).toBeInTheDocument();
  expect(within(dialog).queryByText(/\$0/)).not.toBeInTheDocument();
  expect(
    within(dialog).queryByRole('button', { name: /View/ })
  ).not.toBeInTheDocument();
});

it('keeps unknown funding neutral and excludes outside shares', () => {
  render(
    <AppointmentBudgetWarnings
      months={[
        ...months,
        { ...months[0], shares: [{ fundingSourceId: null, percent: 1 }] },
      ]}
      sourceBalances={new Map([[1, { ...balance, basis: 'unknown' }]])}
      sources={sources}
    />
  );
  expect(
    screen.getByRole('button', { name: 'Funding basis unknown' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /shortfall/ })
  ).not.toBeInTheDocument();
});

it('shows captured category inputs, forecast, negative remainder, and adjustment separately; no internal category warning table', () => {
  const row = {
    adjustment: 0,
    budgetRecorded: true,
    capturedAvailable: 100,
    endRemaining: -20,
    firstDeficitMonth: '2026-02',
    forecast: 120,
    hasBudget: true,
    hasCharges: true,
    isBalanceAdjustment: false,
    revisedAvailable: 100,
  };
  const { rerender } = render(
    <SourceCategoryBudgets
      balance={{
        ...balance,
        categories: [
          { ...row, expenditureCategory: SALARY_CATEGORY },
          {
            ...row,
            budgetRecorded: false,
            capturedAvailable: 0,
            endRemaining: 0,
            expenditureCategory: FRINGE_CATEGORY,
            forecast: 0,
            hasBudget: false,
          },
          {
            ...row,
            capturedAvailable: 500,
            endRemaining: 500,
            expenditureCategory: 'Adjustment',
            forecast: 0,
            isBalanceAdjustment: true,
          },
        ],
      }}
    />
  );
  expect(
    screen.getByRole('columnheader', { name: 'Captured available' })
  ).toBeInTheDocument();
  expect(screen.getByText('No fringe budget recorded')).toBeInTheDocument();
  expect(screen.getByText('-$20.00')).toHaveClass('text-error');
  expect(
    screen.getByRole('rowheader', { name: 'Planning balance adjustment' })
  ).toBeInTheDocument();
  rerender(
    <SourceCategoryBudgets balance={{ ...balance, basis: 'general' }} />
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  rerender(
    <SourceCategoryBudgets balance={{ ...balance, basis: 'unknown' }} />
  );
  expect(screen.getByText(/Funding basis unknown/)).toBeInTheDocument();
});
