import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectExpenditureProgress } from '@/components/project/ProjectExpenditureProgress.tsx';
import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

afterEach(cleanup);

const category = (
  overrides: Partial<ProjectProjectionCategory>
): ProjectProjectionCategory => ({
  budget: 0,
  committed: 0,
  expenditureCategory: '01 - Salaries and Wages',
  isPersonnel: 1,
  remainingNow: 0,
  spentToDate: 0,
  ...overrides,
});

describe('ProjectExpenditureProgress', () => {
  it('nets detail balances in the aggregate expense summary', () => {
    render(
      <ProjectExpenditureProgress
        awardEndDate={null}
        awardStartDate={null}
        categories={[
          category({
            budget: 45_830,
            expenditureCategory: '01 - Salaries and Wages',
            remainingNow: -2841.36,
            spentToDate: 48_671.36,
          }),
          category({
            budget: 26_437,
            expenditureCategory: '02 - Fringe Benefits',
            remainingNow: 9872.77,
            spentToDate: 16_564.23,
          }),
          category({
            budget: 0,
            expenditureCategory: '03 - Supplies / Services / Other Expenses',
            isPersonnel: 0,
            remainingNow: -5411.86,
            spentToDate: 5411.86,
          }),
          category({
            budget: 0,
            expenditureCategory: '04 - Travel',
            isPersonnel: 0,
            remainingNow: -44.22,
            spentToDate: 44.22,
          }),
          category({
            budget: 0,
            expenditureCategory: '05 - Fellowship & Scholarships',
            isPersonnel: 0,
            remainingNow: 2067.91,
            spentToDate: 0,
          }),
          category({
            budget: 26_667,
            expenditureCategory: '06 - Indirect Costs',
            isPersonnel: 0,
            remainingNow: -2753.19,
            spentToDate: 29_420.19,
          }),
        ]}
      />
    );

    expect(
      screen.getByText('$100,111.86 (99%) spent')
    ).toBeInTheDocument();
    expect(
      screen.getByText('$0.00 (0%) committed')
    ).toBeInTheDocument();
    expect(screen.getByText('$890.05 (1%)')).not.toHaveClass('text-error');
    expect(
      screen.getByRole('img', {
        name: /All Expenses: \$100,111\.86 \(99%\) spent, \$0\.00 \(0%\) committed, \$890\.05 \(1%\), \$98,934\.00 budget/,
      })
    ).toBeInTheDocument();
  });

  it('omits the overage percent for zero-budget categories', () => {
    render(
      <ProjectExpenditureProgress
        awardEndDate={null}
        awardStartDate={null}
        categories={[
          category({
            budget: 0,
            expenditureCategory: '05 - Travel',
            isPersonnel: 0,
            remainingNow: -250,
            spentToDate: 250,
          }),
        ]}
      />
    );

    for (const overage of screen.getAllByText('$250.00 over')) {
      expect(overage).toHaveClass('font-proxima-bold');
    }
    expect(screen.queryByText('$250.00 (100%) over')).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /Travel: \$250\.00 \(100%\) spent, \$0\.00 committed, \$250\.00 over, \$0\.00 budget/,
      })
    ).toBeInTheDocument();
  });

  it('collapses and expands the category details', async () => {
    const user = userEvent.setup();

    render(
      <ProjectExpenditureProgress
        awardEndDate={null}
        awardStartDate={null}
        categories={[
          category({
            budget: 100,
            committed: 10,
            expenditureCategory: '04 - Supplies',
            isPersonnel: 0,
            remainingNow: 70,
            spentToDate: 20,
          }),
        ]}
      />
    );

    const hideDetailsButton = screen.getByRole('button', {
      name: /hide details/i,
    });
    expect(hideDetailsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Supplies')).toBeInTheDocument();

    await user.click(hideDetailsButton);

    const showDetailsButton = screen.getByRole('button', {
      name: /show details/i,
    });
    expect(showDetailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Supplies')).not.toBeInTheDocument();

    await user.click(showDetailsButton);

    expect(
      screen.getByRole('button', { name: /hide details/i })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Supplies')).toBeInTheDocument();
  });
});
