import { fetchJson, postJson } from '@/lib/api.ts';
import { useQuery } from '@tanstack/react-query';

export type AssignableRole =
  | 'Manager'
  | 'AccrualViewer'
  | 'FinancialViewer'
  | 'DepartmentViewer';

export type AdminUserSearchResult = {
  email?: string | null;
  employeeId: string;
  iamId: string;
  name: string;
};

export type AdminManagedUser = {
  email?: string | null;
  employeeId: string;
  iamId: string;
  id: string;
  kerberos: string;
  name: string;
  roles: string[];
};

export type AssignRoleResponse = {
  added: boolean;
  user: AdminManagedUser;
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
  iamId,
  roleName,
  signal,
}: {
  iamId: string;
  roleName: AssignableRole;
  signal?: AbortSignal;
}): Promise<AssignRoleResponse> {
  return await postJson<AssignRoleResponse>(
    `/api/admin/users/by-iam/${encodeURIComponent(iamId)}/roles`,
    { roleName },
    signal
  );
}

export type UserRolesResponse = {
  email?: string | null;
  employeeId?: string | null;
  iamId?: string | null;
  kerberos?: string | null;
  name?: string | null;
  roles: string[];
};

export type RemoveRoleResponse = {
  removed: boolean;
  roles: string[];
};

export const userRolesQueryOptions = (iamId: string | null) => ({
  enabled: !!iamId,
  gcTime: 0,
  queryFn: async ({
    signal,
  }: {
    signal: AbortSignal;
  }): Promise<UserRolesResponse> => {
    return await fetchJson<UserRolesResponse>(
      `/api/admin/users/by-iam/${encodeURIComponent(iamId!)}/roles`,
      {},
      signal
    );
  },
  queryKey: ['admin', 'users', iamId, 'roles'] as const,
  staleTime: 0,
});

export const useUserRolesQuery = (iamId: string | null) => {
  return useQuery(userRolesQueryOptions(iamId));
};

export async function removeRole({
  iamId,
  roleName,
  signal,
}: {
  iamId: string;
  roleName: string;
  signal?: AbortSignal;
}): Promise<RemoveRoleResponse> {
  return await fetchJson<RemoveRoleResponse>(
    `/api/admin/users/by-iam/${encodeURIComponent(iamId)}/roles`,
    {
      body: JSON.stringify({ roleName }),
      method: 'DELETE',
    },
    signal
  );
}
