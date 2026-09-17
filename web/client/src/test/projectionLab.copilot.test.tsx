import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectionLab from '@/components/projections/ProjectionLab.tsx';
import { createDemoData } from '@/demo/data.ts';
import { createProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import type { Scenario } from '@/components/projections/scenarios.ts';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/projects">{children}</a>
  ),
}));
vi.mock('recharts', () => ({
  Bar: () => null,
  CartesianGrid: () => null,
  ComposedChart: () => null,
  Line: () => null,
  LineChart: () => null,
  ReferenceArea: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scenario: Scenario = {
  assumptions: ['Eligible grant work'],
  operations: [
    {
      annualSalary: 98_400,
      endMonth: '2027-06',
      fringeRate: 2,
      fundingSourceId: 'DEMOSPN001',
      name: 'Casey',
      percent: 50,
      personId: 'grad-casey',
      startMonth: '2027-01',
      type: 'hire',
    },
  ],
  title: 'Hire Casey',
};

function setup() {
  const fetchMock = vi
    .fn()
    .mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === 'POST'
              ? {
                  message: 'Here is a preview of Casey joining the plan.',
                  scenario,
                }
              : { configured: true, model: 'gpt-5.6-luna' }
          ),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        )
      )
    );
  vi.stubGlobal('fetch', fetchMock);
  const plan = createProjectionDemoPlan(createDemoData(42, '2026-09'));
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ProjectionLab iamId="9000000001" initialPlan={plan} />
    </QueryClientProvider>
  );
  return { fetchMock, user: userEvent.setup() };
}

async function requestPreview(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByRole('textbox', {
    name: 'Question about the projection',
  });
  await waitFor(() => expect(input).toBeEnabled());
  await user.type(input, 'Preview a grad student');
  await user.click(screen.getByRole('button', { name: /^Ask$/ }));
  return await screen.findByRole('button', { name: 'Explore scenario' });
}

describe('projection copilot flow', () => {
  it('rejects an AI reply if the plan changed while the request was in flight', async () => {
    const { fetchMock, user } = setup();
    const input = screen.getByRole('textbox', {
      name: 'Question about the projection',
    });
    await waitFor(() => expect(input).toBeEnabled());
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    await user.type(input, 'Preview Casey');
    await user.click(screen.getByRole('button', { name: /^Ask$/ }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Jordan Chen name' }),
      { target: { value: 'Jordan Updated' } }
    );
    await act(async () => {
      finish(
        new Response(JSON.stringify({ message: 'Preview ready.', scenario }), {
          status: 200,
        })
      );
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your plan changed while I was answering'
    );
    expect(
      screen.queryByRole('button', { name: 'Apply to plan' })
    ).not.toBeInTheDocument();
  });
  it('opens comparison, edits a proposal, applies it to the timeline, and undoes it', async () => {
    const { user } = setup();
    await user.click(await requestPreview(user));
    const dialog = screen.getByRole('dialog', { name: 'Hire Casey' });
    expect(within(dialog).getByText('$12,213.33')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('End month'), {
      target: { value: '2027-03' },
    });
    expect(within(dialog).getByText('$32,286.93')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to plan' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete Casey' })
    ).toBeInTheDocument();
    expect(screen.getByText('7 people')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo change' }));
    expect(
      screen.queryByRole('button', { name: 'Delete Casey' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('6 people')).toBeInTheDocument();
  });

  it('blocks a stale proposal after a manual edit and clears the chat on reset', async () => {
    const { user } = setup();
    await requestPreview(user);
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Jordan Chen name' }),
      { target: { value: 'Jordan Updated' } }
    );
    expect(
      screen.getByRole('button', { name: 'Apply to plan' })
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Your plan changed');
    await user.click(screen.getByRole('button', { name: 'Reset plan' }));
    expect(
      screen.queryByRole('button', { name: 'Apply to plan' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Preview a grad student')
    ).not.toBeInTheDocument();
  });

  it('keeps subsequent manual edits from being lost through Undo', async () => {
    const { user } = setup();
    await requestPreview(user);
    await user.click(screen.getByRole('button', { name: 'Apply to plan' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Jordan Chen name' }),
      { target: { value: 'Jordan Updated' } }
    );
    expect(
      screen.queryByRole('button', { name: 'Undo change' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Jordan Updated name' })
    ).toHaveValue('Jordan Updated');
    expect(
      screen.getByRole('button', { name: 'Delete Casey' })
    ).toBeInTheDocument();
  });
});
