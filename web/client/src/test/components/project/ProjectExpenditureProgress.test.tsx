import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  it('shows aggregate overruns as spent budget and a full summary bar', () => {
    render(
      <ProjectExpenditureProgress
        awardEndDate={null}
        awardStartDate={null}
        categories={[
          category({
            budget: 60_000,
            expenditureCategory: '01 - Salaries and Wages',
            remainingNow: 20_000,
            spentToDate: 40_000,
          }),
          category({
            budget: 3100,
            expenditureCategory: '04 - Supplies',
            isPersonnel: 0,
            remainingNow: -16_648.39,
            spentToDate: 18_128.21,
          }),
        ]}
      />
    );

    expect(
      screen.getByText('$79,748.39 (126%) spent')
    ).toBeInTheDocument();
    expect(
      screen.getByText('$0.00 (0%) committed')
    ).toBeInTheDocument();
    expect(screen.getByText('$16,648.39 (26%) over')).toHaveClass(
      'font-proxima-bold'
    );
    expect(screen.getByText('$16,648.39 (537%) over')).toHaveClass(
      'font-proxima-bold'
    );
    expect(
      screen.getByRole('img', {
        name: /All Expenses: \$79,748\.39 \(126%\) spent, \$0\.00 \(0%\) committed, \$16,648\.39 \(26%\) over/,
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
});
