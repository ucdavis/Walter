import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { ProjectName, TaskName } from '@/components/project/NicknamedName.tsx';
import {
  buildNicknameLookup,
  NicknamesContext,
} from '@/queries/projectNicknames.ts';

afterEach(cleanup);

const rows = [
  {
    nickname: 'Smith startup',
    projectNumber: 'SP001',
    taskNumber: '',
  },
  {
    nickname: 'Equipment',
    projectNumber: 'SP001',
    taskNumber: 'TASK01',
  },
];

const withNicknames = (children: ReactNode, enabled = true) =>
  render(
    <NicknamesContext.Provider value={buildNicknameLookup(rows, enabled)}>
      {children}
    </NicknamesContext.Provider>
  );

it('ProjectName shows the nickname with the official name beneath', () => {
  withNicknames(
    <ProjectName name="Official Project Name" projectNumber="SP001" />
  );
  expect(screen.getByText('Smith startup')).toBeInTheDocument();
  expect(screen.getByText('Official Project Name')).toBeInTheDocument();
});

it('ProjectName renders only the official name when there is no nickname', () => {
  const { container } = withNicknames(
    <ProjectName name="Official Project Name" projectNumber="SP999" />
  );
  expect(container).toHaveTextContent(/^Official Project Name$/);
});

it('TaskName shows the nickname with the official name beneath', () => {
  withNicknames(
    <TaskName name="Official Task" projectNumber="SP001" taskNumber="TASK01" />
  );
  expect(screen.getByText('Equipment')).toBeInTheDocument();
  expect(screen.getByText('Official Task')).toBeInTheDocument();
});

it('TaskName renders nothing when there is no name and no nickname', () => {
  const { container } = withNicknames(
    <TaskName name={null} projectNumber="SP001" taskNumber="TASK02" />
  );
  expect(container).toBeEmptyDOMElement();
});

it('ProjectName with a tooltip exposes the official name on hover', async () => {
  withNicknames(
    <ProjectName
      name="Official Project Name"
      projectNumber="SP001"
      secondary="tooltip"
    />
  );
  expect(screen.queryByText('Official Project Name')).not.toBeInTheDocument();
  await userEvent.setup().hover(screen.getByText('Smith startup'));
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Official Project Name'
  );
});

it('renders official names when the flag is off', () => {
  const { container } = withNicknames(
    <ProjectName name="Official Project Name" projectNumber="SP001" />,
    false
  );
  expect(container).toHaveTextContent(/^Official Project Name$/);
});
