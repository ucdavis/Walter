import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
  SourceEditor,
  type SourceEditorHandle,
} from '@/components/projections/SourceEditor.tsx';
import {
  addPlannedSource,
  editProjectionSource,
  sourcePlanningBalance,
} from '@/lib/projectionSources.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import {
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
  FEE_REMISSION_CATEGORY,
} from '@/lib/piProjection.ts';
import { projectionLookupsQueryOptions } from '@/queries/projections.ts';
import {
  createSalaryExample,
  createAppointmentLookupsExample,
} from '@/test/fixtures/projections.ts';

afterEach(cleanup);
function open(planned = false, existingPool = false) {
  const plan = createSalaryExample();
  const source = plan.content.fundingSources[0];
  source.projectType = 'Sponsored';
  source.budgets.push({
    budget: 2000,
    committed: 0,
    expenditureCategory: SUPPLIES_CATEGORY,
    spentToDate: 0,
  });
  source.categoryAdjustments = [
    { amount: 500, expenditureCategory: SALARY_CATEGORY },
  ];
  if (existingPool) {
    source.sourceKind = 'Planned';
    source.plannedBudgetMode = 'GeneralPool';
    source.initialPlannedBalance = 750;
    source.balanceAdjustment = 250;
    source.budgets = [];
    source.categoryAdjustments = [];
  }
  const session = createProjectionSession(plan);
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  query.setQueryData(
    projectionLookupsQueryOptions().queryKey,
    createAppointmentLookupsExample()
  );
  const onClose = vi.fn();
  const onApply = vi.fn((inputs, categories) =>
    planned
      ? addPlannedSource(session, inputs, categories)
      : editProjectionSource(session, source.id, inputs, categories)
  );
  const ref = createRef<SourceEditorHandle>();
  render(
    <QueryClientProvider client={query}>
      <SourceEditor
        onApply={onApply}
        onClose={onClose}
        ref={ref}
        session={session}
        source={planned ? undefined : source}
      />
    </QueryClientProvider>
  );
  return { onApply, onClose, ref, session, source, user: userEvent.setup() };
}
it('buffers a balanced move, preserves dates when resetting budgets, and applies atomically', async () => {
  const { onApply, ref, source, user } = open();
  expect(screen.queryByLabelText('Planning balance')).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('End date'));
  await user.type(screen.getByLabelText('End date'), '2026-05-31');
  await user.click(screen.getByRole('button', { name: 'Move budget' }));
  await user.selectOptions(
    screen.getByLabelText('From category'),
    SUPPLIES_CATEGORY
  );
  await user.selectOptions(
    screen.getByLabelText('To category'),
    SALARY_CATEGORY
  );
  await user.type(screen.getByLabelText('Amount'), '3000');
  expect(ref.current?.read().hasChanges).toBe(true);
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(
    screen.getByText(/leaves the donor category negative/)
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Move amount' }));
  expect(source.categoryAdjustments).toEqual([
    { amount: 500, expenditureCategory: SALARY_CATEGORY },
  ]);
  expect(screen.getByLabelText('Net budget changes')).toHaveTextContent(
    '$3,500.00'
  );
  await user.click(
    screen.getByRole('button', { name: 'Reset budget changes' })
  );
  expect(screen.getByLabelText('End date')).toHaveValue('2026-05-31');
  expect(screen.queryByLabelText('Net budget changes')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  const result = onApply.mock.results[0].value;
  expect(result.ok).toBe(true);
  expect(result.session.draft.content.fundingSources[0]).toMatchObject({
    categoryAdjustments: [],
    endDate: '2026-05-31',
  });
  expect(source.categoryAdjustments).toHaveLength(1);
});
it('defines missing category zero and discards every buffered change on outer Cancel', async () => {
  const { onApply, onClose, source, user } = open();
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.selectOptions(screen.getByLabelText('Category'), FRINGE_CATEGORY);
  await user.type(screen.getByLabelText('Amount'), '0');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onApply).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  expect(source.categoryAdjustments).toEqual([
    { amount: 500, expenditureCategory: SALARY_CATEGORY },
  ]);
});
it('creates planned category initial funding as the reset baseline', async () => {
  const { onApply, user } = open(true);
  await user.type(screen.getByLabelText('Source name'), 'Planned award');
  await user.type(screen.getByLabelText('Start date'), '2026-01-01');
  await user.selectOptions(screen.getByLabelText('Source type'), 'Categories');
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.selectOptions(screen.getByLabelText('Category'), SALARY_CATEGORY);
  await user.type(screen.getByLabelText('Amount'), '9000');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  expect(
    screen.getByRole('columnheader', { name: 'Initial planned funding' })
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  const result = onApply.mock.results[0].value;
  expect(result.ok).toBe(true);
  const created = result.session.draft.content.fundingSources.at(-1);
  expect(created.plannedBudgetMode).toBe('Categories');
  expect(created.budgets).toEqual([
    {
      budget: 9000,
      committed: 0,
      expenditureCategory: SALARY_CATEGORY,
      spentToDate: 0,
    },
  ]);
  expect(created.categoryAdjustments).toEqual([]);
  expect(sourcePlanningBalance(created)).toBe(9000);
});

it('restores the original planned pool without resetting edited dates', async () => {
  const { onApply, user } = open(false, true);
  expect(
    screen.getByText(/Initial planned funding: \$750.00/)
  ).toBeInTheDocument();
  await user.clear(screen.getByLabelText('End date'));
  await user.type(screen.getByLabelText('End date'), '2026-05-31');
  await user.click(
    screen.getByRole('button', { name: 'Reset budget changes' })
  );
  expect(screen.getByLabelText('Planning balance')).toHaveValue('750');
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  const result = onApply.mock.results[0].value;
  expect(result.ok).toBe(true);
  expect(result.session.draft.content.fundingSources[0]).toMatchObject({
    balanceAdjustment: 0,
    endDate: '2026-05-31',
    initialPlannedBalance: 750,
  });
});
it('can switch a new category draft to a general pool without submitting hidden category amounts', async () => {
  const { onApply, user } = open(true);
  await user.type(screen.getByLabelText('Source name'), 'Planned pool');
  await user.type(screen.getByLabelText('Start date'), '2026-01-01');
  await user.selectOptions(screen.getByLabelText('Source type'), 'Categories');
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.selectOptions(screen.getByLabelText('Category'), SALARY_CATEGORY);
  await user.type(screen.getByLabelText('Amount'), '9000');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  await user.selectOptions(screen.getByLabelText('Source type'), 'GeneralPool');
  await user.type(screen.getByLabelText('Planning balance'), '5000');
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  const result = onApply.mock.results[0].value;
  expect(result.ok).toBe(true);
  expect(result.session.draft.content.fundingSources.at(-1)).toMatchObject({
    budgets: [],
    categoryAdjustments: [],
    initialPlannedBalance: 5000,
    plannedBudgetMode: 'GeneralPool',
  });
});

it('retains an in-progress native date edit across budget reset and action panel rerenders', async () => {
  const { onApply, user } = open();
  await user.click(screen.getByRole('button', { name: 'Move budget' }));
  await user.selectOptions(
    screen.getByLabelText('From category'),
    SUPPLIES_CATEGORY
  );
  await user.selectOptions(
    screen.getByLabelText('To category'),
    SALARY_CATEGORY
  );
  await user.type(screen.getByLabelText('Amount'), '1000');
  await user.click(screen.getByRole('button', { name: 'Move amount' }));
  const start = screen.getByLabelText('Start date');
  fireEvent.input(start, { target: { value: '2025-12-02' } });
  expect(start).toHaveValue('2025-12-02');
  await user.click(
    screen.getByRole('button', { name: 'Reset budget changes' })
  );
  expect(start).toHaveValue('2025-12-02');
  await user.clear(screen.getByLabelText('Source name'));
  await user.type(screen.getByLabelText('Source name'), 'Edited source');
  fireEvent.input(screen.getByLabelText('End date'), {
    target: { value: '2026-05-31' },
  });
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  expect(start).toHaveValue('2025-12-02');
  expect(screen.getByLabelText('End date')).toHaveValue('2026-05-31');
  expect(screen.getByLabelText('Source name')).toHaveValue('Edited source');
  await user.click(screen.getByRole('button', { name: 'Cancel adjustment' }));
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply.mock.calls[0][0]).toMatchObject({
    categoryAdjustments: [],
    endDate: '2026-05-31',
    name: 'Edited source',
    startDate: '2025-12-02',
  });
});

it('explains Internal and Sponsored source types without changing their stored budget modes', async () => {
  const { user } = open(true);
  const select = screen.getByRole('combobox', { name: 'Source type' });
  expect(screen.getByRole('option', { name: 'Internal' })).toHaveValue(
    'GeneralPool'
  );
  expect(screen.getByRole('option', { name: 'Sponsored' })).toHaveValue(
    'Categories'
  );
  await user.hover(screen.getByRole('button', { name: 'About source types' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Internal uses one shared balance for all spending. Sponsored uses separate category budgets, including salary and fringe.'
  );
  await user.keyboard('{Escape}');
  await user.selectOptions(select, 'Categories');
  expect(
    screen.getByRole('region', { name: 'Edit category budget' })
  ).toBeInTheDocument();
});
it('shows the fixed planned source type without offering to change imported finance types', () => {
  const { source } = open(false, true);
  expect(source.plannedBudgetMode).toBe('GeneralPool');
  expect(screen.getByText('Internal')).toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Source type' })
  ).not.toBeInTheDocument();
  cleanup();
  open();
  expect(screen.queryByText('Source type')).not.toBeInTheDocument();
});

it('offers categories saved only in expenses or overrides when the cold lookup fails', async () => {
  server.use(
    http.get(
      '/api/projections/lookups',
      () => new HttpResponse(null, { status: 500 })
    )
  );
  const plan = createSalaryExample();
  const source = plan.content.fundingSources[0];
  source.projectType = 'Sponsored';
  source.expenses = [
    {
      amount: 20,
      description: 'Saved expense',
      endMonth: null,
      expenditureCategory: SUPPLIES_CATEGORY,
      id: 1,
      kind: 'Monthly',
      startMonth: '2026-01-01',
    },
  ];
  source.historicalExpenseOverrides = [
    { amount: 0, expenditureCategory: FEE_REMISSION_CATEGORY },
  ];
  const session = createProjectionSession(plan);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onApply = vi.fn((inputs, categories) =>
    editProjectionSource(session, source.id, inputs, categories)
  );
  render(
    <QueryClientProvider client={queryClient}>
      <SourceEditor
        onApply={onApply}
        onClose={vi.fn()}
        session={session}
        source={source}
      />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(projectionLookupsQueryOptions().queryKey)
        ?.status
    ).toBe('error')
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  expect(
    screen.getByRole('option', { name: SUPPLIES_CATEGORY })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: FEE_REMISSION_CATEGORY })
  ).toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText('Category'),
    FEE_REMISSION_CATEGORY
  );
  await user.type(screen.getByLabelText('Amount'), '100');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  const result = onApply.mock.results[0].value;
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(
      result.session.draft.content.fundingSources[0].categoryAdjustments
    ).toEqual([{ amount: 100, expenditureCategory: FEE_REMISSION_CATEGORY }]);
  }
  queryClient.clear();
});
