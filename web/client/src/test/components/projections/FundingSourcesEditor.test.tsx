import { createRef, useState, type Ref } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FundingSourcesEditor,
  type FundingSourcesEditorHandle,
} from '@/components/projections/FundingSourcesEditor.tsx';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import { chooseInitialProjects } from '@/test/helpers/projectionSourceSelection.ts';

afterEach(cleanup);

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
  const [ids, setIds] = useState<number[]>([]);
  return (
    <>
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
    </>
  );
}

function expectSelection(ids: number[]) {
  const value = screen.getByTestId('selected-source-ids').textContent;
  expect(value ? value.split(',').map(Number).sort() : []).toEqual(ids);
}

describe('funding source selection and grouping', () => {
  it('starts without selected funding or an expanded catalog while keeping planned funding available', () => {
    render(<Harness />);
    expectSelection([]);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /search results$/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Search funding sources' })
    ).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Add planned source' })
    ).toBeInTheDocument();
  });

  it.each(['Coastal', 'p100'])(
    'finds a project by %s and adds every task in one action',
    async (query) => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.type(
        screen.getByRole('searchbox', { name: 'Search funding sources' }),
        query
      );
      const results = screen.getByRole('region', {
        name: 'Coastal research search results',
      });
      expect(results).toHaveTextContent('P100');
      await user.click(
        within(results).getByRole('button', { name: 'Add all 2 tasks' })
      );
      expectSelection([1, 2]);
      expect(
        screen.getByRole('region', {
          name: 'Coastal research selected funding',
        })
      ).toHaveTextContent('All 2 tasks');
      const search = screen.getByRole('searchbox', {
        name: 'Search funding sources',
      });
      expect(search).toHaveValue('');
      await user.type(search, query);
      expect(
        within(
          screen.getByRole('region', {
            name: 'Coastal research search results',
          })
        ).getByRole('button', { name: 'Already included' })
      ).toBeDisabled();
      expectSelection([1, 2]);
    }
  );

  it('adds all project tasks even when search matches only one sibling', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(
      screen.getByRole('searchbox', { name: 'Search funding sources' }),
      'Fieldwork'
    );
    const results = screen.getByRole('region', {
      name: 'Coastal research search results',
    });
    expect(
      within(results).getAllByRole('button', { name: 'Add this task' })
    ).toHaveLength(1);
    await user.click(
      within(results).getByRole('button', { name: 'Add all 2 tasks' })
    );
    expectSelection([1, 2]);
  });

  it.each(['Fieldwork', '02'])(
    'adds only the matching task for %s with its parent visible',
    async (query) => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.type(
        screen.getByRole('searchbox', { name: 'Search funding sources' }),
        query
      );
      const results = screen.getByRole('region', {
        name: 'Coastal research search results',
      });
      expect(results).toHaveTextContent('P100');
      await user.click(
        within(results).getByRole('button', { name: 'Add this task' })
      );
      expectSelection(query === '02' ? [2] : [1]);
      expect(
        screen.getByRole('region', {
          name: 'Coastal research selected funding',
        })
      ).toHaveTextContent('1 of 2 tasks');
    }
  );

  it('stages task changes until Apply, preserves other projects, and removes a group when no tasks remain', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseInitialProjects(user, ['Coastal research', 'Equipment grant']);
    const coastal = screen.getByRole('region', {
      name: 'Coastal research selected funding',
    });
    await user.click(
      within(coastal).getByRole('button', { name: 'Change tasks' })
    );
    let dialog = screen.getByRole('dialog', {
      name: 'Change tasks for Coastal research',
    });
    await user.click(
      within(dialog).getByRole('checkbox', { name: /Include Analysis/ })
    );
    expectSelection([1, 2, 3]);
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectSelection([1, 3]);
    expect(coastal).toHaveTextContent('1 of 2 tasks');
    expect(within(coastal).getAllByRole('article')).toHaveLength(1);
    await user.click(
      within(coastal).getByRole('button', { name: 'Change tasks' })
    );
    dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Select all tasks' })
    );
    expectSelection([1, 3]);
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expectSelection([1, 2, 3]);
    await user.click(
      within(coastal).getByRole('button', { name: 'Change tasks' })
    );
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expectSelection([1, 2, 3]);
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .every((input) => !(input as HTMLInputElement).checked)
    ).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expectSelection([3]);
    expect(
      screen.queryByRole('region', {
        name: 'Coastal research selected funding',
      })
    ).not.toBeInTheDocument();
    await chooseInitialProjects(user, ['Coastal research']);
    expectSelection([1, 2, 3]);
  });

  it.each(['Cancel', 'Escape'])(
    'discards staged task changes with %s',
    async (dismiss) => {
      const user = userEvent.setup();
      const editorRef = createRef<FundingSourcesEditorHandle>();
      render(<Harness editorRef={editorRef} />);
      await chooseInitialProjects(user, ['Coastal research']);
      await user.click(screen.getByRole('button', { name: 'Change tasks' }));
      const dialog = screen.getByRole('dialog', {
        name: 'Change tasks for Coastal research',
      });
      await user.click(
        within(dialog).getByRole('button', { name: 'Clear all' })
      );
      expectSelection([1, 2]);
      expect(editorRef.current?.read()).toMatchObject({
        hasChanges: true,
        kind: 'source',
      });
      if (dismiss === 'Escape') {
        // jsdom does not perform Escape's native dialog cancellation.
        const cancel = new Event('cancel', {
          bubbles: false,
          cancelable: true,
        });
        fireEvent(dialog, cancel);
        expect(cancel.defaultPrevented).toBe(true);
      } else {
        await user.click(
          within(dialog).getByRole('button', { name: 'Cancel' })
        );
      }
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expectSelection([1, 2]);
      expect(editorRef.current?.read()).toBeNull();
      expect(screen.getAllByRole('article')).toHaveLength(2);
      await user.click(screen.getByRole('button', { name: 'Change tasks' }));
      const reopened = screen.getByRole('dialog');
      expect(
        within(reopened).getByRole('checkbox', { name: /Include Analysis/ })
      ).toBeChecked();
      expect(
        within(reopened).getByRole('checkbox', {
          name: /Include Renamed fieldwork/,
        })
      ).toBeChecked();
    }
  );

  it('adds a single-task project from its task code without an unnecessary task chooser', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(
      screen.getByRole('searchbox', { name: 'Search funding sources' }),
      '01'
    );
    const results = screen.getByRole('region', {
      name: 'Equipment grant search results',
    });
    expect(results).toHaveTextContent('P200');
    await user.click(
      within(results).getByRole('button', { name: 'Add this task' })
    );
    expectSelection([3]);
    const selected = screen.getByRole('article', {
      name: 'Equipment · Task 01 · Equipment funding source',
    });
    expect(selected).toHaveTextContent('P200');
    expect(selected).toHaveTextContent('$20,000.00');
    expect(
      within(selected).getByRole('button', {
        name: 'Edit Equipment · Task 01 · Equipment',
      })
    ).toBeVisible();
    expect(
      within(selected).getByRole('button', {
        name: 'Remove Equipment · Task 01 · Equipment',
      })
    ).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByText('Funding details')).not.toBeInTheDocument();
    expect(
      within(selected).queryByText('Change tasks')
    ).not.toBeInTheDocument();
  });

  it('keeps captured project identity and source edits when a selection is removed and added again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await chooseInitialProjects(user, ['Coastal research']);
    const coastal = screen.getByRole('region', {
      name: 'Coastal research selected funding',
    });
    expect(within(coastal).getByText(/Project P100/)).toBeInTheDocument();
    expect(within(coastal).getAllByRole('article')).toHaveLength(2);
    expect(
      screen.getAllByRole('heading', { name: 'Coastal research' })
    ).toHaveLength(1);
    for (const card of within(coastal).getAllByRole('article')) {
      expect(
        within(card).queryByText('Coastal research')
      ).not.toBeInTheDocument();
      expect(within(card).getByText('$20,000.00')).toBeVisible();
    }
    expect(screen.queryByText('Funding details')).not.toBeInTheDocument();
    await user.click(
      within(coastal).getByRole('button', {
        name: 'Edit Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    await user.clear(screen.getByRole('textbox', { name: 'Planning balance' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Planning balance' }),
      '12345'
    );
    await user.click(screen.getByRole('button', { name: /^Apply$/ }));
    const selected = screen.getByRole('region', {
      name: 'Coastal research selected funding',
    });
    await user.click(
      within(selected).getByRole('button', { name: 'Change tasks' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clear all',
      })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply' })
    );
    expectSelection([]);
    await chooseInitialProjects(user, ['Coastal research']);
    expectSelection([1, 2]);
    const restored = screen.getByRole('region', {
      name: 'Coastal research selected funding',
    });
    expect(within(restored).getAllByRole('article')).toHaveLength(2);
    expect(
      within(restored).getByRole('heading', { name: 'Renamed fieldwork' })
    ).toBeInTheDocument();
    expect(restored).toHaveTextContent('$12,345.00');
  });

  it('shows newly added planned funding directly with one name and editable balance', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole('button', { name: 'Add planned source' })
    );
    await user.type(screen.getByLabelText('Source name'), 'Project renewal');
    await user.type(screen.getByLabelText('Planning balance'), '42000');
    await user.type(screen.getByLabelText('Start date'), '2026-07-01');
    await user.type(screen.getByLabelText('End date'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expectSelection([4]);
    const card = screen.getByRole('article', {
      name: 'Project renewal funding source',
    });
    expect(
      within(card).getByRole('heading', { name: 'Project renewal' })
    ).toBeVisible();
    expect(screen.getAllByText('Project renewal')).toHaveLength(1);
    expect(within(card).getByText('$42,000.00')).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Edit Project renewal' })
    ).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Remove Project renewal' })
    ).toBeVisible();
    expect(screen.queryByText('Funding details')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Change tasks' })
    ).not.toBeInTheDocument();
  });

  it('keeps saved source removal behind confirmation and does not reset saved funding', async () => {
    const user = userEvent.setup();
    render(<Harness initial={false} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    await user.click(
      screen.getByRole('button', {
        name: 'Remove Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('those funding shares become unallocated');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    await user.click(
      screen.getByRole('button', {
        name: 'Remove Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /^Remove$/,
      })
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(
      screen.getByRole('article', {
        name: 'Analysis · Task 02 · Analysis funding source',
      })
    ).toHaveTextContent('P100');
  });
});
