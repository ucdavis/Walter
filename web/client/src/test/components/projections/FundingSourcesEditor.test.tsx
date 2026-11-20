import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { projectionLookupsQueryOptions } from '@/queries/projections.ts';
import { useState, type Ref } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
import {
  createSalaryExample,
  createAppointmentLookupsExample,
} from '@/test/fixtures/projections.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import { chooseInitialProjects } from '@/test/helpers/projectionSourceSelection.ts';

afterEach(cleanup);

function createLookupClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    projectionLookupsQueryOptions().queryKey,
    createAppointmentLookupsExample()
  );
  return client;
}

function Harness({
  editorRef,
  initial = true,
}: {
  editorRef?: Ref<FundingSourcesEditorHandle>;
  initial?: boolean;
}) {
  const [session, setSession] = useState(() => {
    const draft = createSalaryExample();
    const source = draft.content.fundingSources[0];
    draft.content.fundingSources = [
      {
        ...source,
        id: 1,
        name: 'Renamed fieldwork',
        projectName: 'Coastal research',
        projectNumber: 'P100',
        taskName: 'Fieldwork',
        taskNumber: '01',
      },
      {
        ...structuredClone(source),
        id: 2,
        name: 'Analysis',
        projectName: 'Coastal research',
        projectNumber: 'P100',
        taskName: 'Analysis',
        taskNumber: '02',
      },
      {
        ...structuredClone(source),
        id: 3,
        name: 'Equipment',
        projectName: 'Equipment grant',
        projectNumber: 'P200',
        taskName: 'Equipment',
        taskNumber: '01',
      },
    ];
    return createProjectionSession(draft);
  });
  const [queryClient] = useState(createLookupClient);
  const [ids, setIds] = useState<number[]>([]);
  return (
    <QueryClientProvider client={queryClient}>
      <FundingSourcesEditor
        iamId="IAM-TEST"
        initialSelection={initial ? { ids, onChange: setIds } : undefined}
        onOperation={(operation) => {
          const result = operation(session);
          if (result.ok) {
            if (initial) {
              const added = result.session.draft.content.fundingSources.filter(
                ({ id }) =>
                  !session.draft.content.fundingSources.some(
                    (source) => source.id === id
                  )
              );
              setIds((current) => [...current, ...added.map(({ id }) => id)]);
            }
            setSession(result.session);
          }
          return result;
        }}
        ref={editorRef}
        session={session}
      />
      <output data-testid="selected-source-ids">{ids.join(',')}</output>
    </QueryClientProvider>
  );
}

function expectSelection(ids: number[]) {
  const value = screen.getByTestId('selected-source-ids').textContent;
  expect(value ? value.split(',').map(Number).sort() : []).toEqual(ids);
}

describe('funding source selection and grouping', () => {
  it('shows searchable project rows and nested tasks with no sources initially selected', () => {
    render(<Harness />);
    expectSelection([]);
    expect(screen.getAllByText('$20,000')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(3);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Search funding sources' })
    ).toHaveValue('');
    expect(
      screen.getByRole('checkbox', {
        name: 'Include all sources for Coastal research',
      })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Include Renamed fieldwork/ })
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', {
        name: 'Add New Funding Source',
      })
    ).toBeVisible();
  });
  it.each(['Coastal', 'p100', 'Fieldwork'])(
    'finds a project by %s and selects every sibling task',
    async (query) => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.type(screen.getByRole('searchbox'), query);
      await user.click(
        screen.getByRole('checkbox', {
          name: 'Include all sources for Coastal research',
        })
      );
      expectSelection([1, 2]);
      expect(
        screen.getByRole('region', { name: 'Coastal research funding sources' })
      ).toHaveTextContent('2 of 2 tasks');
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
    }
  );
  it.each(['Fieldwork', '02'])(
    'selects just the matching task for %s',
    async (query) => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.type(screen.getByRole('searchbox'), query);
      await user.click(
        screen.getByRole('checkbox', { name: /^Include (?!all sources)/ })
      );
      expectSelection(query === '02' ? [2] : [1]);
      expect(
        screen.getByRole('checkbox', {
          name: 'Include all sources for Coastal research',
        })
      ).toBePartiallyChecked();
    }
  );
  it('updates task selection inline while preserving other projects', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseInitialProjects(user, ['Coastal research', 'Equipment grant']);
    await user.click(
      screen.getByRole('checkbox', { name: /Include Analysis/ })
    );
    expectSelection([1, 3]);
    const group = screen.getByRole('region', {
      name: 'Coastal research funding sources',
    });
    await user.click(
      within(group).getByRole('button', { name: 'Select all 2' })
    );
    expectSelection([1, 2, 3]);
    await user.click(within(group).getByRole('button', { name: 'Clear' }));
    expectSelection([3]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps edited balances and captured project identity when deselecting and selecting again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseInitialProjects(user, ['Coastal research']);
    await user.click(
      screen.getByRole('button', {
        name: 'Edit Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    await user.clear(
      screen.getByLabelText('Planning balance', { selector: 'input' })
    );
    await user.type(
      screen.getByLabelText('Planning balance', { selector: 'input' }),
      '12345'
    );
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const project = screen.getByRole('checkbox', {
      name: 'Include all sources for Coastal research',
    });
    await user.click(project);
    expectSelection([]);
    await user.click(project);
    expectSelection([1, 2]);
    expect(
      screen.getByRole('region', { name: 'Coastal research funding sources' })
    ).toHaveTextContent('$12,345');
  });
  it('adds planned funding as a selected row with an editable balance', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole('button', {
        name: 'Add New Funding Source',
      })
    );
    await user.type(screen.getByLabelText('Source name'), 'Project renewal');
    await user.type(screen.getByLabelText('Planning balance'), '42000');
    await user.type(screen.getByLabelText('Start date'), '2026-07-01');
    await user.type(screen.getByLabelText('End date'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expectSelection([4]);
    const row = screen.getByRole('region', {
      name: 'Project renewal funding sources',
    });
    expect(within(row).getByRole('checkbox')).toBeChecked();
    expect(row).toHaveTextContent('$42,000');
    expect(
      within(row).getByRole('button', { name: 'Edit Project renewal' })
    ).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('keeps saved source removal behind confirmation and does not reset saved funding', async () => {
    const user = userEvent.setup();
    render(<Harness initial={false} />);
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(3);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Select all$/ })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Edit Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    await user.click(
      screen.getByRole('button', { name: 'Remove funding source' })
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('those funding shares become unallocated');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(3);
    await user.click(
      screen.getByRole('button', {
        name: 'Remove funding source',
      })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /^Remove$/,
      })
    );
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(2);
    expect(
      screen.getByRole('region', {
        name: 'Coastal research funding sources',
      })
    ).toHaveTextContent('P100');
  });
});
