import { createContext, useContext } from 'react';
import { fetchJson } from '@/lib/api.ts';

/** A shared short name for a project, or for one of its tasks when taskNumber is set. */
export interface ProjectNicknameDto {
  nickname: string;
  projectNumber: string;
  /** Empty string means the nickname is for the project itself. */
  taskNumber: string;
}

export interface NicknameLookup {
  /** False when the feature is off; both lookups then return undefined. */
  enabled: boolean;
  project: (projectNumber: string | null | undefined) => string | undefined;
  task: (
    projectNumber: string | null | undefined,
    taskNumber: string | null | undefined
  ) => string | undefined;
}

export const projectNicknamesQueryKey = ['project-nicknames'] as const;

export const projectNicknamesQueryOptions = (enabled: boolean) => ({
  enabled,
  queryFn: () => fetchJson<ProjectNicknameDto[]>('/api/project/nicknames'),
  queryKey: projectNicknamesQueryKey,
  staleTime: 60_000,
});

const normalize = (value: string | null | undefined) =>
  (value ?? '').trim().toUpperCase();

const keyOf = (projectNumber: string, taskNumber: string) =>
  `${projectNumber}|${taskNumber}`;

export function buildNicknameLookup(
  rows: ProjectNicknameDto[],
  enabled: boolean
): NicknameLookup {
  const byKey = new Map<string, string>();
  if (enabled) {
    for (const row of rows) {
      byKey.set(
        keyOf(normalize(row.projectNumber), normalize(row.taskNumber)),
        row.nickname
      );
    }
  }

  return {
    enabled,
    project: (projectNumber) => byKey.get(keyOf(normalize(projectNumber), '')),
    task: (projectNumber, taskNumber) => {
      const task = normalize(taskNumber);
      return task
        ? byKey.get(keyOf(normalize(projectNumber), task))
        : undefined;
    },
  };
}

/**
 * Names to show for a live project/task pair. officialText holds the official names a
 * nickname replaced, so search can still match them.
 */
export function nicknamedSource(
  lookup: NicknameLookup,
  source: {
    projectName: string | null;
    projectNumber: string | null;
    taskName: string | null;
    taskNumber: string | null;
  }
) {
  const projectNickname = lookup.project(source.projectNumber);
  const taskNickname = lookup.task(source.projectNumber, source.taskNumber);
  return {
    officialText: [
      projectNickname && source.projectName,
      taskNickname && source.taskName,
    ]
      .filter(Boolean)
      .join(' '),
    projectName: projectNickname ?? source.projectName,
    taskName: taskNickname ?? source.taskName,
  };
}

const disabledLookup = buildNicknameLookup([], false);

export const NicknamesContext = createContext<NicknameLookup>(disabledLookup);

/** Nicknames for the current session; a disabled lookup outside NicknamesProvider. */
export const useProjectNicknames = () => useContext(NicknamesContext);

/** A non-empty nickname sets it; an empty one reverts to the official name. */
export const upsertProjectNickname = (input: {
  iamId: string;
  nickname: string;
  projectNumber: string;
  taskNumber?: string;
}) =>
  fetchJson<ProjectNicknameDto | undefined>('/api/project/nicknames', {
    body: JSON.stringify(input),
    method: 'PUT',
  });
