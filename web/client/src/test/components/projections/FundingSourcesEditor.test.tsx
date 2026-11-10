import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FundingSourcesEditor } from '@/components/projections/FundingSourcesEditor.tsx';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';

afterEach(cleanup);

function Harness({ initial = true }: { initial?: boolean }) {
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
  const [ids, setIds] = useState([1, 2, 3]);
  return (
    <FundingSourcesEditor
      iamId="IAM-TEST"
      initialSelection={initial ? { ids, onChange: setIds } : undefined}
      onOperation={(operation) => {
        const result = operation(session);
        if (result.ok) {
          setSession(result.session);
        }
        return result;
      }}
      session={session}
    />
  );
}

describe('funding source selection and grouping', () => {
  it('keeps captured project identity beside renamed tasks without duplicate cards', () => {
    render(<Harness />);
    const coastal = screen.getByRole('region', {
      name: 'Coastal research funding sources',
    });
    expect(
      within(coastal).getByText('Project P100 · 2 tasks')
    ).toBeInTheDocument();
    expect(within(coastal).getAllByRole('article')).toHaveLength(2);
    expect(
      within(coastal).getByRole('heading', {
        name: 'Renamed fieldwork',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Equipment grant funding sources' })
    ).toHaveTextContent('Project P200 · 1 task');
    expect(
      screen.queryByRole('button', { name: /^Add funding source$/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add planned source' })
    ).toBeInTheDocument();
  });

  it('searches unchecked tasks and reselects the captured source without losing edits', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Include Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Search funding sources' }),
      'Fieldwork'
    );
    const checkbox = screen.getByRole('checkbox', {
      name: 'Include Renamed fieldwork · Task 01 · Fieldwork',
    });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
    await user.click(
      screen.getByRole('button', {
        name: 'Edit Renamed fieldwork · Task 01 · Fieldwork',
      })
    );
    await user.clear(screen.getByRole('textbox', { name: 'Planning balance' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Planning balance' }),
      '12345'
    );
    await user.click(screen.getByRole('button', { name: /^Apply$/ }));
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByRole('article')).toHaveTextContent('$12,345.00');
  });

  it('applies project selection to hidden sibling tasks and preserves other projects', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const search = screen.getByRole('searchbox', {
      name: 'Search funding sources',
    });
    await user.type(search, 'Fieldwork');
    await user.click(
      screen.getByRole('checkbox', { name: 'Include project Coastal research' })
    );
    await user.clear(search);
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Analysis · Task 02 · Analysis',
      })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Equipment · Task 01 · Equipment',
      })
    ).toBeChecked();
    await user.type(search, 'P100');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    await user.click(
      screen.getByRole('checkbox', { name: 'Include project Coastal research' })
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Analysis · Task 02 · Analysis',
      })
    ).toBeChecked();
  });

  it('toggles selection by clicking project and task heading text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      screen
        .getByRole('heading', { name: /^Coastal research$/ })
        .querySelector('label')!
    );
    expect(
      screen.getByRole('checkbox', { name: 'Include project Coastal research' })
    ).not.toBeChecked();
    await user.click(
      screen
        .getByRole('heading', {
          name: 'Renamed fieldwork',
        })
        .querySelector('label')!
    );
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Renamed fieldwork · Task 01 · Fieldwork',
      })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'Include Analysis · Task 02 · Analysis',
      })
    ).not.toBeChecked();
  });

  it('keeps saved source removal behind confirmation', async () => {
    const user = userEvent.setup();
    render(<Harness initial={false} />);
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
      screen.getByRole('region', { name: 'Coastal research funding sources' })
    ).toHaveTextContent('Project P100 · 1 task');
  });
});
