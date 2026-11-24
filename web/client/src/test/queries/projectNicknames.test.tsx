import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NicknamesProvider } from '@/components/project/NicknamesProvider.tsx';
import {
  buildNicknameLookup,
  nicknamedSource,
  type ProjectNicknameDto,
  useProjectNicknames,
} from '@/queries/projectNicknames.ts';
import { server } from '@/test/mswUtils.ts';

vi.mock('@/shared/auth/UserContext.tsx', () => ({
  useUser: () => ({ id: 'user-1' }),
}));

afterEach(cleanup);

const row = (
  projectNumber: string,
  taskNumber: string,
  nickname: string
): ProjectNicknameDto => ({
  nickname,
  projectNumber,
  taskNumber,
  updatedAt: '2026-11-24T00:00:00Z',
  updatedBy: null,
});

const features = (nicknamesEnabled: boolean) => ({
  burndownEnabled: true,
  expenditureProgressEnabled: true,
  nicknamesEnabled,
  projectCostsEnabled: true,
  projectionsEnabled: true,
});

function Probe() {
  const nicknames = useProjectNicknames();
  return (
    <div>
      <span data-testid="enabled">{String(nicknames.enabled)}</span>
      <span data-testid="project">{nicknames.project('SP001') ?? 'none'}</span>
    </div>
  );
}

const renderProbe = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NicknamesProvider>
        <Probe />
      </NicknamesProvider>
    </QueryClientProvider>
  );

describe('buildNicknameLookup', () => {
  it('matches numbers case-insensitively', () => {
    const lookup = buildNicknameLookup(
      [row('SP001', '', 'Smith startup')],
      true
    );
    expect(lookup.project('sp001')).toBe('Smith startup');
    expect(lookup.project(' SP001 ')).toBe('Smith startup');
  });

  it('scopes a task nickname to its project', () => {
    const lookup = buildNicknameLookup([row('P1', 'TASK01', 'A')], true);
    expect(lookup.task('P1', 'TASK01')).toBe('A');
    expect(lookup.task('P2', 'TASK01')).toBeUndefined();
  });

  it('does not return the project nickname as a task nickname', () => {
    const lookup = buildNicknameLookup([row('P1', '', 'Proj')], true);
    expect(lookup.task('P1', '')).toBeUndefined();
    expect(lookup.task('P1', null)).toBeUndefined();
    expect(lookup.task('P1', 'TASK01')).toBeUndefined();
  });

  it('returns nothing when disabled', () => {
    const lookup = buildNicknameLookup(
      [row('SP001', '', 'Smith startup')],
      false
    );
    expect(lookup.enabled).toBe(false);
    expect(lookup.project('SP001')).toBeUndefined();
  });
});

describe('nicknamedSource', () => {
  const source = {
    projectName: 'Official Project',
    projectNumber: 'P1',
    taskName: 'Official Task',
    taskNumber: 'T1',
  };

  it('swaps in nicknames and keeps official names searchable', () => {
    const lookup = buildNicknameLookup(
      [row('P1', '', 'Smith startup'), row('P1', 'T1', 'Boots')],
      true
    );
    expect(nicknamedSource(lookup, source)).toEqual({
      officialText: 'Official Project Official Task',
      projectName: 'Smith startup',
      taskName: 'Boots',
    });
  });

  it('returns official names when there are no nicknames', () => {
    expect(nicknamedSource(buildNicknameLookup([], true), source)).toEqual({
      officialText: '',
      projectName: 'Official Project',
      taskName: 'Official Task',
    });
  });
});

describe('useProjectNicknames', () => {
  it('is disabled outside the provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('project')).toHaveTextContent('none');
  });

  it('does not call the API when the flag is off', async () => {
    let calls = 0;
    let featuresLoaded = false;
    server.use(
      http.get('/api/system/features', () => {
        featuresLoaded = true;
        return HttpResponse.json(features(false));
      }),
      http.get('/api/project/nicknames', () => {
        calls += 1;
        return HttpResponse.json([row('SP001', '', 'Smith startup')]);
      })
    );
    renderProbe();
    await waitFor(() => expect(featuresLoaded).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(0);
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('project')).toHaveTextContent('none');
  });

  it('returns nicknames when the flag is on', async () => {
    server.use(
      http.get('/api/system/features', () => HttpResponse.json(features(true))),
      http.get('/api/project/nicknames', () =>
        HttpResponse.json([row('SP001', '', 'Smith startup')])
      )
    );
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId('project')).toHaveTextContent('Smith startup')
    );
    expect(screen.getByTestId('enabled')).toHaveTextContent('true');
  });
});
