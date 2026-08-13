import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectExpenditureProgressCategories } from '@/components/project/ProjectExpenditureProgress.tsx';
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

describe('ProjectExpenditureProgressCategories', () => {
  it('keeps Today labels inset when no award time has elapsed', () => {
    const categories = [
      category({
        budget: 100,
        committed: 10,
        remainingNow: 70,
        spentToDate: 20,
      }),
    ];

    render(
      <ProjectExpenditureProgressCategories
        awardEndDate="2100-12-31"
        awardStartDate="2100-01-01"
        categories={categories}
      />
    );

    expect(screen.getByText('Today')).toHaveStyle({ left: 'max(2.5rem, 0%)' });
    expect(screen.getByText('Today')).toHaveClass('top-0');
    expect(
      screen.getByTestId('budget-vs-time-current-month-marker')
    ).toHaveStyle({ left: '0%' });
    expect(
      screen.getByTestId('budget-vs-time-current-month-marker')
    ).toHaveClass('top-5');
    expect(screen.getByTestId('budget-vs-time-axis')).not.toHaveTextContent(
      'Time'
    );
  });

  it('omits the overage percent for zero-budget categories', () => {
    render(
      <ProjectExpenditureProgressCategories
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
});
