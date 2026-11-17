import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SourceCategoryWorksheet } from '@/components/projections/SourceCategoryWorksheet.tsx';
import {
  computePiProjection,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import { createBookedSalaryExample } from '@/test/fixtures/projections.ts';
import { formatProjectionCurrency as money } from '@/components/projections/projectionFormatting.ts';

afterEach(cleanup);
function open(plan = createBookedSalaryExample()) {
  const results = computePiProjection(plan);
  const outlook = buildProjectionOutlook(plan, results).sources[0];
  render(<SourceCategoryWorksheet outlook={outlook} results={results} />);
  return { outlook, results, user: userEvent.setup() };
}
function row(category: string) {
  return screen.getByRole('row', { name: new RegExp(category) });
}

describe('source category worksheet', () => {
  it('uses calculator costs and balances without subtracting captured booked costs again, retaining view on expansion', async () => {
    const plan = createBookedSalaryExample();
    plan.content.fundingSources[0].projectType = 'Sponsored';
    plan.content.fundingSources[0].balanceAdjustment = 500;
    const { outlook, results, user } = open(plan);
    expect(screen.getByText('Each category has its own budget.')).toBeVisible();
    await user.hover(
      screen.getByRole('button', { name: 'About category budgets' })
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Salary and fringe have separate budgets.'
    );
    await user.unhover(
      screen.getByRole('button', { name: 'About category budgets' })
    );
    const salary = results.rows.find(
      (r) =>
        r.fundingSourceId === 1 && r.expenditureCategory === SALARY_CATEGORY
    )!;
    expect(row(SALARY_CATEGORY).children[2]).toHaveTextContent(
      money(salary.projectedAmount)
    );
    await user.click(
      screen.getByRole('button', { name: 'Month-end balances' })
    );
    expect(row(SALARY_CATEGORY).children[2]).toHaveTextContent(
      money(salary.remaining)
    );
    expect(row('Source overall')).toHaveTextContent(money(outlook.endBalance));
    expect(row('Planning balance adjustment').children[2]).toHaveTextContent(
      '$500'
    );
    await user.click(screen.getByRole('button', { name: 'Expand table' }));
    const overlayIdentity = screen.getByText(outlook.label, {
      selector: 'span',
    });
    expect(overlayIdentity).toBeVisible();
    expect(overlayIdentity.closest('.fixed')).toContainElement(
      screen.getByRole('button', { name: 'Collapse table' })
    );
    expect(
      screen.getByRole('button', { name: 'Month-end balances' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(row(SALARY_CATEGORY).children[2]).toHaveTextContent(
      money(salary.remaining)
    );
    await user.keyboard('{Escape}');
    expect(
      screen.queryByText(outlook.label, { selector: 'span' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand table' })).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Net forecast costs' })
    );
    expect(row(SALARY_CATEGORY).children[2]).toHaveTextContent(
      money(salary.projectedAmount)
    );
  });

  it.each(['Internal', null])(
    'shows signed costs and overall balance without category deficits for %s funding',
    (projectType) => {
      const plan = createBookedSalaryExample();
      const source = plan.content.fundingSources[0];
      source.projectType = projectType;
      source.expenses = [
        {
          amount: -50,
          description: 'Credit',
          endMonth: null,
          expenditureCategory: SUPPLIES_CATEGORY,
          id: 1,
          kind: 'OneTime',
          startMonth: '2026-02-01',
        },
      ];
      const { outlook } = open(plan);
      expect(
        screen.queryByRole('button', { name: 'About category budgets' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Each category has its own budget.')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Month-end balances' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('columnheader', { name: 'Starting available' })
      ).not.toBeInTheDocument();
      const credit = within(row(SUPPLIES_CATEGORY)).getAllByText('-$50');
      expect(credit).toHaveLength(2);
      for (const cell of credit) {
        expect(cell).not.toHaveClass('text-error');
      }
      expect(
        screen.getByText(/Source overall starting available/)
      ).toHaveTextContent(money(outlook.endBalance));
    }
  );

  it('distinguishes absent and zero budgets and aligns later captures to all 18 plan months', async () => {
    const plan = createBookedSalaryExample();
    plan.content.forecastMonths = 18;
    const source = plan.content.fundingSources[0];
    source.projectType = 'Sponsored';
    source.capturedAt = '2026-03-01T00:00:00Z';
    source.budgets = [
      {
        budget: 0,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: 0,
      },
    ];
    source.actuals = [];
    const { user } = open(plan);
    expect(screen.getAllByRole('columnheader')).toHaveLength(22);
    expect(row(SALARY_CATEGORY).children[1]).toHaveTextContent('$0');
    expect(row(FRINGE_CATEGORY)).toHaveTextContent('No budget recorded');
    expect(row(FRINGE_CATEGORY).children[1]).toHaveTextContent('—');
    expect(row(SALARY_CATEGORY).children[2]).toHaveTextContent('—');
    expect(row(SALARY_CATEGORY).children[3]).toHaveTextContent('—');
    await user.click(
      screen.getByRole('button', { name: 'Month-end balances' })
    );
    expect(row(SALARY_CATEGORY).children[2]).toHaveTextContent('—');
    expect(row(SALARY_CATEGORY).children[4]).not.toHaveTextContent('—');
  });

  it('explains a source beyond the forecast instead of creating zero months', () => {
    const plan = createBookedSalaryExample();
    plan.content.fundingSources[0].capturedAt = '2030-01-01T00:00:00Z';
    open(plan);
    expect(
      screen.getByText(/No category costs or monthly balances/)
    ).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
