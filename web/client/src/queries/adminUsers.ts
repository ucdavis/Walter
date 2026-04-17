import { fetchJson } from '@/lib/api.ts';
import { useQuery } from '@tanstack/react-query';

export type AssignableRole = 'Manager' | 'AccrualViewer' | 'FinancialViewer';

export type AdminUserSearchResult = {
  id: string;
  displayName?: string | null;
  email?: string | null;
};

export type AdminManagedUser = {
  id: string;
  name: string;
  email?: string | null;
  employeeId: string;
  kerberos: string;
  iamId: string;
  roles: string[];
};

export type AssignRoleResponse = {
  user: AdminManagedUser;
  added: boolean;
};

export const adminUserSearchQueryOptions = (query: string) => {
  const q = query.trim();

  return {
    enabled: q.length >= 3,
    gcTime: 0,
    queryFn: async ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<AdminUserSearchResult[]> => {
      if (q.length < 3) {
        return [];
      }

      return await fetchJson<AdminUserSearchResult[]>(
        `/api/admin/users/search?query=${encodeURIComponent(q)}`,
        {},
        signal
      );
    },
    queryKey: ['admin', 'users', 'search', q] as const,
    staleTime: 0,
  };
};

export const useAdminUserSearchQuery = ({
  enabled,
  query,
}: {
  enabled: boolean;
  query: string;
}) => {
  return useQuery({
    ...adminUserSearchQueryOptions(query),
    enabled,
  });
};

export async function assignRole({
  entraUserId,
  roleName,
  signal,
}: {
  entraUserId: string;
  roleName: AssignableRole;
  signal?: AbortSignal;
}): Promise<AssignRoleResponse> {
  return await fetchJson<AssignRoleResponse>(
    `/api/admin/users/${encodeURIComponent(entraUserId)}/roles`,
    {
      method: 'POST',
      body: JSON.stringify({ roleName }),
    },
    signal
  );
}

export type UserRolesResponse = {
  roles: string[];
};

export type RemoveRoleResponse = {
  roles: string[];
  removed: boolean;
};

export const userRolesQueryOptions = (entraUserId: string | null) => ({
  enabled: !!entraUserId,
  gcTime: 0,
  queryFn: async ({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<UserRolesResponse> => {
    return await fetchJson<UserRolesResponse>(
      `/api/admin/users/${encodeURIComponent(entraUserId!)}/roles`,
      {},
      signal
    );
  },
  queryKey: ['admin', 'users', entraUserId, 'roles'] as const,
  staleTime: 0,
});

export const useUserRolesQuery = (entraUserId: string | null) => {
  return useQuery(userRolesQueryOptions(entraUserId));
};

export async function removeRole({
  entraUserId,
  roleName,
  signal,
}: {
  entraUserId: string;
  roleName: string;
  signal?: AbortSignal;
}): Promise<RemoveRoleResponse> {
  return await fetchJson<RemoveRoleResponse>(
    `/api/admin/users/${encodeURIComponent(entraUserId)}/roles`,
    {
      method: 'DELETE',
      body: JSON.stringify({ roleName }),
    },
    signal
  );
}
