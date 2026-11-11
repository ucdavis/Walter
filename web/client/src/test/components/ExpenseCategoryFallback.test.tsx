import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, expect, it, vi } from 'vitest';
import { ExpensesEditor } from '@/components/projections/ExpensesEditor.tsx';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import type { ExpenseOperation } from '@/lib/projectionExpenses.ts';
import {
  EQUIPMENT_CATEGORY,
  SALARY_CATEGORY,
  FRINGE_CATEGORY,
} from '@/lib/piProjection.ts';
import { projectionLookupsQueryOptions } from '@/queries/projections.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);
it('uses saved scenario categories when the cold financial lookup fails, while still excluding personnel expenses', async () => {
  server.use(
    http.get(
      '/api/projections/lookups',
      () => new HttpResponse(null, { status: 500 })
    )
  );
  const plan = createSalaryExample();
  const source = plan.content.fundingSources[0];
  source.projectType = 'Sponsored';
  source.categoryAdjustments = [
    { amount: 1000, expenditureCategory: EQUIPMENT_CATEGORY },
    { amount: 0, expenditureCategory: FRINGE_CATEGORY },
  ];
  expect(
    source.budgets.some((row) => row.expenditureCategory === EQUIPMENT_CATEGORY)
  ).toBe(false);
  const session = createProjectionSession(plan);
  const onOperation = vi.fn((operation: ExpenseOperation) =>
    operation(session)
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ExpensesEditor onOperation={onOperation} session={session} />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(projectionLookupsQueryOptions().queryKey)
        ?.status
    ).toBe('error')
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add expense' }));
  expect(
    screen.getByRole('option', { name: EQUIPMENT_CATEGORY })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: SALARY_CATEGORY })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: FRINGE_CATEGORY })
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Expense name'), 'Equipment test');
  await user.selectOptions(
    screen.getByLabelText('Category'),
    EQUIPMENT_CATEGORY
  );
  await user.type(screen.getByLabelText('Monthly amount'), '100');
  await user.click(screen.getByRole('button', { name: 'Apply expense' }));
  const result = onOperation.mock.results[0].value;
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(
      result.session.draft.content.fundingSources[0].expenses[0]
    ).toMatchObject({ amount: 100, expenditureCategory: EQUIPMENT_CATEGORY });
  }
  queryClient.clear();
});
