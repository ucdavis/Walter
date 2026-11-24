import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, expect, it } from 'vitest';
import { NicknameEditor } from '@/components/project/NicknameEditor.tsx';
import {
  buildNicknameLookup,
  NicknamesContext,
  type ProjectNicknameDto,
} from '@/queries/projectNicknames.ts';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);

const existing: ProjectNicknameDto = {
  nickname: 'Smith startup',
  projectNumber: 'SP001',
  taskNumber: '',
  updatedAt: '',
  updatedBy: null,
};

function renderEditor({
  enabled = true,
  rows = [] as ProjectNicknameDto[],
  taskNumber = undefined as string | undefined,
} = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NicknamesContext.Provider value={buildNicknameLookup(rows, enabled)}>
        <NicknameEditor
          iamId="IAM-PI"
          officialName="Official Project Name"
          projectNumber="SP001"
          taskNumber={taskNumber}
        />
      </NicknamesContext.Provider>
    </QueryClientProvider>
  );
}

/** Captures PUT bodies and answers with the given status. */
function capturePuts(status = 200) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.put('/api/project/nicknames', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return status === 200
        ? HttpResponse.json(existing)
        : new HttpResponse(null, { status });
    })
  );
  return bodies;
}

const openEditor = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    screen.getByRole('button', {
      name: 'Edit nickname for Official Project Name',
    })
  );

it('renders nothing when the flag is off', () => {
  const { container } = renderEditor({ enabled: false });
  expect(container).toBeEmptyDOMElement();
});

it('saves a nickname', async () => {
  const user = userEvent.setup();
  const bodies = capturePuts();
  renderEditor();
  await openEditor(user);
  await user.type(screen.getByLabelText('Nickname'), 'Smith startup');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument()
  );
  expect(bodies).toEqual([
    { iamId: 'IAM-PI', nickname: 'Smith startup', projectNumber: 'SP001' },
  ]);
});

it('sends the task number for a task nickname', async () => {
  const user = userEvent.setup();
  const bodies = capturePuts();
  renderEditor({ taskNumber: 'TASK01' });
  await openEditor(user);
  await user.type(screen.getByLabelText('Nickname'), 'Equipment{Enter}');
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0].taskNumber).toBe('TASK01');
});

it('prefills the current nickname and clears it with Use official name', async () => {
  const user = userEvent.setup();
  const bodies = capturePuts();
  renderEditor({ rows: [existing] });
  await openEditor(user);
  expect(screen.getByLabelText('Nickname')).toHaveValue('Smith startup');
  await user.click(screen.getByRole('button', { name: 'Use official name' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0].nickname).toBe('');
});

it('hides Use official name when no nickname is set', async () => {
  const user = userEvent.setup();
  renderEditor();
  await openEditor(user);
  expect(
    screen.queryByRole('button', { name: 'Use official name' })
  ).not.toBeInTheDocument();
});

it('limits input to 40 characters', async () => {
  const user = userEvent.setup();
  renderEditor();
  await openEditor(user);
  expect(screen.getByLabelText('Nickname')).toHaveAttribute('maxlength', '40');
});

it('cancels without saving', async () => {
  const user = userEvent.setup();
  const bodies = capturePuts();
  renderEditor();
  await openEditor(user);
  await user.type(screen.getByLabelText('Nickname'), 'Draft{Escape}');
  expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
  expect(bodies).toHaveLength(0);
});

it('keeps the editor open and shows an error when the save fails', async () => {
  const user = userEvent.setup();
  capturePuts(403);
  renderEditor();
  await openEditor(user);
  await user.type(screen.getByLabelText('Nickname'), 'Smith startup');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not save nickname.'
  );
  expect(screen.getByLabelText('Nickname')).toHaveValue('Smith startup');
});
