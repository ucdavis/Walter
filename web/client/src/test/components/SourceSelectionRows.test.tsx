import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceSelectionRows } from '@/components/projections/SourceSelectionRows.tsx';

const choices = [
  {
    key: 'a',
    label: 'Project A Task One',
    projectName: 'Project A',
    projectNumber: 'PA',
    taskName: 'Task One',
    taskNumber: 'T1',
  },
  {
    key: 'b',
    label: 'Project A Task Two',
    projectName: 'Project A',
    projectNumber: 'PA',
    taskName: 'Task Two',
    taskNumber: 'T2',
  },
  {
    disabled: true,
    key: 'c',
    label: 'Project A Existing',
    projectName: 'Project A',
    projectNumber: 'PA',
    taskName: 'Existing',
    taskNumber: 'T3',
  },
  {
    key: 'd',
    label: 'Project B',
    projectName: 'Project B',
    projectNumber: 'PB',
  },
];
function Picker() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <SourceSelectionRows
      choices={choices}
      onChange={setSelected}
      selected={selected}
    />
  );
}

describe('funding source rows', () => {
  afterEach(cleanup);
  it.each([
    {
      detail: 'PA · Task One · 1 task',
      taskName: 'Task One',
      taskNumber: null,
    },
    {
      detail: 'PA · Task One · T1 · 1 task',
      taskName: 'Task One',
      taskNumber: 'T1',
    },
    {
      detail: 'PA · 1 task',
      taskName: 'Project A',
      taskNumber: null,
    },
    {
      detail: 'PA · Project A · T1 · 1 task',
      taskName: 'Project A',
      taskNumber: 'T1',
    },
    {
      detail: 'PA · Task · T1 · 1 task',
      taskName: null,
      taskNumber: 'T1',
    },
    {
      detail: 'PA · 1 task',
      taskName: null,
      taskNumber: null,
    },
  ])('shows singleton details as "$detail"', ({ detail, ...task }) => {
    render(
      <SourceSelectionRows
        choices={[{ ...choices[0], ...task }]}
        onChange={() => {}}
        selected={[]}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Project A' })
    ).toBeInTheDocument();
    const project = screen.getByRole('region', {
      name: 'Project A funding sources',
    });
    expect(within(project).getByRole('paragraph')).toHaveTextContent(detail);
  });

  it('keeps standalone source keys separate from project numbers while grouping project tasks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SourceSelectionRows
        choices={[
          ...choices.slice(0, 2),
          {
            key: 'PA',
            label: 'Planned funding',
            projectName: null,
            projectNumber: null,
          },
        ]}
        onChange={onChange}
        selected={['a', 'PA']}
      />
    );
    const project = screen.getByRole('region', {
      name: 'Project A funding sources',
    });
    const standalone = screen.getByRole('region', {
      name: 'Planned funding funding sources',
    });
    expect(
      within(project).getByRole('button', {
        name: 'Collapse tasks for Project A',
      })
    ).toHaveTextContent('1 of 2 tasks');
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 sources across 2 projects'
    );
    await user.click(
      within(project).getByRole('checkbox', {
        name: 'Include all sources for Project A',
      })
    );
    expect(onChange).toHaveBeenLastCalledWith(['a', 'PA', 'b']);
    await user.click(
      within(standalone).getByRole('checkbox', {
        name: 'Include all sources for Planned funding',
      })
    );
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });

  it('counts each person once per project across tasks and keeps the total while searching', async () => {
    const user = userEvent.setup();
    render(
      <SourceSelectionRows
        choices={choices.map((choice) => ({
          ...choice,
          personnelIds:
            choice.key === 'a'
              ? ['100', '200', '100']
              : choice.key === 'b'
                ? ['200', '300']
                : [],
        }))}
        onChange={() => {}}
        selected={[]}
      />
    );
    expect(
      screen.getByLabelText('3 people tied to Project A')
    ).toHaveTextContent('3');
    expect(
      screen.getByLabelText('0 people tied to Project B')
    ).toHaveTextContent('0');
    await user.type(screen.getByRole('searchbox'), 'T2');
    expect(
      screen.getByLabelText('3 people tied to Project A')
    ).toHaveTextContent('3');
  });

  it('selects individual tasks, shows mixed project selection, and excludes existing sources from bulk actions', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const project = screen.getByRole('checkbox', {
      name: 'Include all sources for Project A',
    });
    await user.click(
      screen.getByRole('checkbox', { name: 'Include Project A Task One' })
    );
    expect(project).toBePartiallyChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 source across 1 project'
    );
    await user.click(project);
    expect(project).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 sources across 1 project'
    );
    expect(
      screen.getByRole('checkbox', { name: 'Include Project A Existing' })
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(project).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include Project A Existing' })
    ).toBeChecked();
  });

  it('searches task codes while keeping project bulk selection independent of the search', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.type(screen.getByRole('searchbox'), 'T2');
    expect(
      screen.queryByRole('checkbox', { name: 'Include Project A Task One' })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Include all sources for Project A',
      })
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 sources across 1 project'
    );
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Selected · 2' }));
    expect(
      screen.queryByRole('region', { name: 'Project B funding sources' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Existing')).not.toBeInTheDocument();
    const group = screen.getByRole('region', {
      name: 'Project A funding sources',
    });
    expect(
      within(group).getByRole('checkbox', {
        name: 'Include Project A Task One',
      })
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Browse all' }));
    expect(
      screen.getByRole('region', { name: 'Project B funding sources' })
    ).toBeInTheDocument();
  });

  it('collapses nested tasks and selects a single-source project directly', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.click(
      screen.getByRole('button', { name: 'Collapse tasks for Project A' })
    );
    expect(
      screen.queryByRole('checkbox', { name: 'Include Project A Task One' })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Expand tasks for Project A' })
    );
    expect(
      screen.getByRole('checkbox', { name: 'Include Project A Task One' })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Include all sources for Project B',
      })
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 source across 1 project'
    );
  });

  it('selects all available sources across projects even during search and skips already included sources', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.type(screen.getByRole('searchbox'), 'T2');
    await user.click(screen.getByRole('button', { name: /^Select all$/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      '3 sources across 2 projects'
    );
    expect(screen.getByRole('button', { name: /^Select all$/ })).toBeDisabled();
    await user.clear(screen.getByRole('searchbox'));
    expect(
      screen.getByRole('checkbox', {
        name: 'Include all sources for Project B',
      })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include Project A Existing' })
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      '0 sources across 0 projects'
    );
  });
});
