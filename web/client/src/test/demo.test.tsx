import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createDemoData, DEMO_IAM_ID, DEMO_PROJECT } from '@/demo/data.ts';
import { createDemoHandlers } from '@/demo/handlers.ts';
import {
  summarizeAllProjects,
  summarizeProjectByNumber,
} from '@/lib/projectSummary.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const cents = (value: number) => Math.round(value * 100);
const data = createDemoData(42, '2026-09');

describe('synthetic portfolio accounting', () => {
  it('is reproducible, with different but similarly sized amounts for a new seed', () => {
    expect(createDemoData(42, '2026-09')).toEqual(data);
    expect(createDemoData(43, '2026-09').projects).not.toEqual(data.projects);
  });

  it('uses the displayed salary and benefit amounts for personnel forecasts', () => {
    for (const projectNumber of [DEMO_PROJECT, 'DEMOINT001']) {
      const appointments = data.personnel.filter(
        (p) => p.projectId === projectNumber
      );
      const salary = appointments.reduce(
        (sum, p) =>
          sum + cents((p.monthlyRate * p.fte * p.distributionPercent) / 100),
        0
      );
      const benefits = appointments.reduce(
        (sum, p) =>
          sum +
          cents(
            ((p.monthlyRate * p.fte * p.distributionPercent) / 100) *
              p.compositeBenefitRate
          ),
        0
      );
      for (const period of data.projections[projectNumber].periods.filter(
        (p) => p.kind === 'projected' && p.isPersonnel === 1
      )) {
        expect(cents(period.projectedAmount)).toBe(
          period.expenditureCategory.startsWith('01') ? salary : benefits
        );
      }
    }
  });

  it('reconciles every row, task, project, transaction and projection across 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const sample = createDemoData(seed, '2026-09');
      for (const row of sample.projects) {
        expect(row.ppmBudBal).toBe(row.balance);
        expect(cents(row.budget)).toBe(
          cents(row.expenses) + cents(row.commitments) + cents(row.balance)
        );
        const transactions = sample.transactions.filter(
          (t) =>
            t.projectNumber === row.projectNumber &&
            t.taskNumber === row.taskNum &&
            t.expenditureCategory === row.expenditureCategoryName
        );
        expect(
          transactions.reduce(
            (sum, t) => sum + cents(t.rawCostInReceiverLedgerCurrency),
            0
          )
        ).toBe(cents(row.expenses));
      }
      for (const projectNumber of new Set(
        sample.projects.map((p) => p.projectNumber)
      )) {
        const summary = summarizeProjectByNumber(
          sample.projects,
          projectNumber
        )!;
        expect(cents(summary.totals.budget)).toBe(
          cents(summary.totals.expense) +
            cents(summary.totals.encumbrance) +
            cents(summary.totals.balance)
        );
        const projection = sample.projections[projectNumber];
        for (const category of projection.categories) {
          const rows = sample.projects.filter(
            (p) =>
              p.projectNumber === projectNumber &&
              p.expenditureCategoryName === category.expenditureCategory
          );
          const periods = projection.periods.filter(
            (p) => p.expenditureCategory === category.expenditureCategory
          );
          expect(cents(category.budget)).toBe(
            rows.reduce((sum, row) => sum + cents(row.budget), 0)
          );
          expect(cents(category.spentToDate)).toBe(
            periods.reduce((sum, p) => sum + cents(p.actualAmount), 0)
          );
          expect(cents(category.remainingNow)).toBe(
            cents(category.budget) -
              cents(category.spentToDate) -
              cents(category.committed)
          );
          const transition = periods.filter((p) => p.kind === 'blended');
          if (transition.length) {
            expect(
              transition.reduce((sum, p) => sum + cents(p.remaining), 0)
            ).toBe(cents(category.remainingNow));
          }
          const lastMonth = periods
            .map((p) => p.month)
            .sort()
            .at(-1);
          const endBalance = periods
            .filter((p) => p.month === lastMonth)
            .reduce((sum, p) => sum + cents(p.remaining), 0);
          expect(endBalance).toBe(
            cents(category.remainingNow) -
              periods.reduce((sum, p) => sum + cents(p.projectedAmount), 0)
          );
        }
      }
      const sponsored = summarizeProjectByNumber(
        sample.projects,
        DEMO_PROJECT
      )!;
      const internal = summarizeProjectByNumber(sample.projects, 'DEMOINT001')!;
      expect(sponsored.totals.budget).toBeGreaterThan(500_000);
      expect(sponsored.totals.budget).toBeLessThan(600_000);
      expect(internal.totals.balance).toBeGreaterThan(60_000);
      expect(internal.totals.balance).toBeLessThan(115_000);
      expect(
        summarizeProjectByNumber(sample.projects, 'DEMOCLO001')!.totals.balance
      ).toBeGreaterThan(0);
      expect(
        summarizeProjectByNumber(sample.projects, 'DEMOCLO002')!.totals.balance
      ).toBeLessThan(0);
      expect(
        sample.personnel.every((p) =>
          sample.projects.some(
            (row) => row.projectNumber === p.projectId && row.taskNum === p.task
          )
        )
      ).toBe(true);
    }
  });
});

describe('demo API and real screens', () => {
  it('does not expose ProjectionLab outside demo mode', async () => {
    server.use(...createDemoHandlers(data));
    const { cleanup } = renderRoute({
      initialPath: `/projections/${DEMO_IAM_ID}`,
    });
    try {
      expect(
        await screen.findByText(
          'ProjectionLab is available in the local demo portfolio.'
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'ProjectionLab' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Projections' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('filters project requests and rejects unimplemented API reads and writes', async () => {
    server.use(...createDemoHandlers(data));
    const response = await fetch(
      '/api/project/byNumber?projectCodes=DEMOCLO002'
    );
    const rows = await response.json();
    expect(rows.length).toBe(8);
    expect(
      rows.every(
        (p: { projectNumber: string }) => p.projectNumber === 'DEMOCLO002'
      )
    ).toBe(true);
    expect(
      await fetch('/api/project/by-iam/someone-else').then((r) => r.json())
    ).toEqual([]);
    expect((await fetch('/api/admin/users')).status).toBe(404);
    expect((await fetch('/api/notification', { method: 'POST' })).status).toBe(
      404
    );
  });

  it.each([DEMO_PROJECT, 'DEMOINT001', 'DEMOCLO001', 'DEMOCLO002'])(
    'renders %s with the ledger totals and category or task breakdown',
    async (projectNumber) => {
      server.use(...createDemoHandlers(data));
      const summary = summarizeProjectByNumber(data.projects, projectNumber)!;
      const { cleanup } = renderRoute({
        initialPath: `/projects/${DEMO_IAM_ID}/${projectNumber}`,
      });
      try {
        await screen.findByRole('heading', {
          level: 1,
          name: summary.displayName,
        });
        const main = screen
          .getAllByRole('main')
          .find((element) => element.tagName === 'MAIN')!;
        expect(
          within(main).getAllByText(formatCurrency(summary.totals.balance))
            .length
        ).toBeGreaterThan(0);
        expect(
          within(main).getByRole('heading', {
            name: summary.isInternal
              ? 'Task Breakdown'
              : 'Expenditure Category Breakdown',
          })
        ).toBeInTheDocument();
        if (projectNumber === DEMO_PROJECT) {
          await userEvent.click(
            within(main).getByRole('button', { name: 'Graph View' })
          );
          expect(
            await within(main).findByRole('button', { name: 'Table View' })
          ).toBeInTheDocument();
          await within(main).findByText(/Jordan Chen/);
        }
      } finally {
        cleanup();
      }
    }
  );

  it('renders the combined portfolio with all four projects and six people', async () => {
    server.use(...createDemoHandlers(data));
    const { cleanup } = renderRoute({
      initialPath: `/projects/${DEMO_IAM_ID}`,
    });
    try {
      await screen.findByRole('heading', {
        level: 1,
        name: "Morgan Reed's Dashboard",
      });
      const summary = summarizeAllProjects(data.projects);
      const main = screen
        .getAllByRole('main')
        .find((element) => element.tagName === 'MAIN')!;
      expect(
        within(main).getByText(formatCurrency(summary.totals.budget))
      ).toBeInTheDocument();
      await within(main).findByText('6');
      expect(within(main).getByText('4')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
