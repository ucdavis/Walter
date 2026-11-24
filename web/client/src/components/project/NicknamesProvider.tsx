import { type ReactNode, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';
import {
  buildNicknameLookup,
  NicknamesContext,
  projectNicknamesQueryOptions,
} from '@/queries/projectNicknames.ts';

/** Loads the shared nicknames once, and only when the nicknames feature is on. */
export function NicknamesProvider({ children }: { children: ReactNode }) {
  const enabled = useFeatureFlagsQuery().data?.nicknamesEnabled ?? false;
  const { data } = useQuery(projectNicknamesQueryOptions(enabled));
  const lookup = useMemo(
    () => buildNicknameLookup(data ?? [], enabled),
    [data, enabled]
  );

  return (
    <NicknamesContext.Provider value={lookup}>
      {children}
    </NicknamesContext.Provider>
  );
}
