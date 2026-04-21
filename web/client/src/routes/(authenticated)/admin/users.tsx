import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessAdminUsers } from '@/shared/auth/roleAccess.ts';
import {
  assignRole,
  AssignableRole,
  removeRole,
  useAdminUserSearchQuery,
  useUserRolesQuery,
  UserRolesResponse,
} from '@/queries/adminUsers.ts';
import { useDebouncedValue } from '@/lib/useDebouncedValue.ts';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { HttpError } from '@/lib/api.ts';
import {
  ArrowLeftIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export const Route = createFileRoute('/(authenticated)/admin/users')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!canAccessAdminUsers(user.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<AssignableRole>('AccrualViewer');

  const searchEnabled = debouncedQuery.trim().length >= 3;
  const searchQuery = useAdminUserSearchQuery({
    enabled: searchEnabled,
    query: debouncedQuery,
  });

  const searchResults = useMemo(() => searchQuery.data ?? [], [searchQuery.data]);
  const selectedUser = useMemo(
    () => searchResults.find((u) => u.id === selectedUserId) ?? null,
    [searchResults, selectedUserId]
  );

  const queryClient = useQueryClient();

  const userRolesQuery = useUserRolesQuery(selectedUserId);

  const assignRoleMutation = useMutation({
    mutationFn: assignRole,
    onSuccess: (data) => {
      if (selectedUserId) {
        queryClient.setQueryData(
          ['admin', 'users', selectedUserId, 'roles'],
          (old: UserRolesResponse | undefined) => ({
            ...old,
            name: data.user.name,
            email: data.user.email,
            employeeId: data.user.employeeId,
            kerberos: data.user.kerberos,
            iamId: data.user.iamId,
            roles: data.user.roles,
          })
        );
      }
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: removeRole,
    onSuccess: (data) => {
      if (selectedUserId) {
        queryClient.setQueryData(
          ['admin', 'users', selectedUserId, 'roles'],
          (old: UserRolesResponse | undefined) => ({
            ...old,
            roles: data.roles,
          })
        );
      }
    },
  });

  const assignError = assignRoleMutation.error;
  const assignSuccess = assignRoleMutation.data;
  const removeError = removeRoleMutation.error;
  const currentRoles = userRolesQuery.data?.roles ?? [];

  const searchError = searchQuery.error;
  const showQueryHint = query.trim().length > 0 && query.trim().length < 3;
  const showNoResults =
    query.trim().length >= 3 &&
    searchQuery.isSuccess &&
    searchResults.length === 0;
  const showSearching = query.trim().length >= 3 && searchQuery.isFetching;

  const addRoleDisabled = !selectedUser || assignRoleMutation.isPending;

  return (
    <main className="mt-8">
      <div className="container">
        <Link className="btn btn-sm mb-4" to="/admin">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Admin Dashboard
        </Link>
        <UsersIcon className="w-6 h-6" />
        <h1 className="h1">User Management</h1>
        <p className="subtitle">Search for users and manage roles.</p>
        <hr className="border-main-border my-4" />

        <div className="grid gap-8 divide-main-border md:grid-cols-[2fr_3fr]">
          <div className="flex flex-col gap-2">
            <h2 className="card-title">Find a user</h2>

            <div>
              <label className="label mb-2" htmlFor="admin-user-search">
                <span className="label-text">Search by name or email</span>
              </label>
              <input
                autoComplete="off"
                className="input input-bordered w-full"
                id="admin-user-search"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedUserId(null);
                  assignRoleMutation.reset();
                  removeRoleMutation.reset();
                }}
                placeholder="Type at least 3 characters…"
                type="text"
                value={query}
              />
              <p className="label">Returns up to 25 results.</p>
            </div>

            {showQueryHint ? (
              <div className="alert alert-soft alert-primary">
                <span>Type at least 3 characters to search.</span>
              </div>
            ) : null}

            {showSearching ? (
              <div className="flex items-center gap-3 text-sm text-base-content/70">
                <div className="loading loading-spinner loading-sm" />
                <span>Searching…</span>
              </div>
            ) : null}

            {searchError ? (
              <div className="alert alert-error">
                <span>
                  Failed to search users{' '}
                  {searchError instanceof HttpError
                    ? `(HTTP ${searchError.status})`
                    : ''}
                  .
                </span>
              </div>
            ) : null}

            {showNoResults ? (
              <div className="alert alert-soft">
                <span>No users found.</span>
              </div>
            ) : null}

            {query.trim().length >= 3 && searchResults.length ? (
              <div className="max-h-96 overflow-auto rounded-box border border-base-300">
                <ul className="menu menu-sm">
                  {searchResults.map((u) => {
                    const label =
                      u.displayName?.trim() || u.email?.trim() || u.id;
                    const secondary = u.email?.trim() || '';
                    const isSelected = u.id === selectedUserId;

                    return (
                      <li key={u.id}>
                        <button
                          className={isSelected ? 'active' : undefined}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            assignRoleMutation.reset();
                            removeRoleMutation.reset();
                          }}
                          type="button"
                        >
                          <div className="min-w-0">
                            <div className="truncate">{label}</div>
                            {secondary ? (
                              <div className="truncate text-xs text-base-content/60">
                                {secondary}
                              </div>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          {selectedUser ? (
            <div className="flex flex-col gap-4">
              <h2 className="card-title">Manage roles</h2>

              <div className="rounded-box bg-primary/10 p-4">
                <div className="text-sm font-semibold">Selected user</div>
                <div className="mt-1 truncate">
                  {userRolesQuery.data?.name ||
                    selectedUser.displayName ||
                    selectedUser.email ||
                    selectedUser.id}
                </div>
                {(userRolesQuery.data?.email ?? selectedUser.email) ? (
                  <div className="truncate text-sm text-base-content/80">
                    {userRolesQuery.data?.email ?? selectedUser.email}
                  </div>
                ) : null}

                {userRolesQuery.data?.employeeId ? (
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <div>
                      <div className="font-semibold">Employee ID</div>
                      <div className="truncate">
                        {userRolesQuery.data.employeeId}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold">Kerberos</div>
                      <div className="truncate">
                        {userRolesQuery.data.kerberos}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold">IAMID</div>
                      <div className="truncate">
                        {userRolesQuery.data.iamId}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="label">
                  <span className="label-text">Current roles</span>
                </div>
                {userRolesQuery.isLoading ? (
                  <div className="flex items-center gap-3 text-sm text-base-content/70">
                    <div className="loading loading-spinner loading-sm" />
                    <span>Loading roles…</span>
                  </div>
                ) : userRolesQuery.error ? (
                  <div className="alert alert-error">
                    <span>
                      Failed to load roles{' '}
                      {userRolesQuery.error instanceof HttpError
                        ? `(HTTP ${userRolesQuery.error.status})`
                        : ''}
                      .
                    </span>
                  </div>
                ) : currentRoles.length === 0 ? (
                  <div className="text-sm text-base-content/60">
                    No roles assigned.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {currentRoles.map((r) => {
                      const isRemoving =
                        removeRoleMutation.isPending &&
                        removeRoleMutation.variables?.roleName === r;
                      return (
                        <span
                          className="badge badge-neutral gap-1 pr-1"
                          key={r}
                        >
                          {r}
                          <button
                            aria-label={`Remove role ${r}`}
                            className="btn btn-circle btn-ghost btn-xs"
                            disabled={removeRoleMutation.isPending}
                            onClick={() => {
                              removeRoleMutation.reset();
                              removeRoleMutation.mutate({
                                entraUserId: selectedUser.id,
                                roleName: r,
                              });
                            }}
                            type="button"
                          >
                            {isRemoving ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <XMarkIcon className="w-3 h-3" />
                            )}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {removeError ? (
                  <div className="alert alert-error mt-2">
                    <span>
                      Failed to remove role{' '}
                      {removeError instanceof HttpError
                        ? `(HTTP ${removeError.status})`
                        : ''}
                      .
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="label" htmlFor="admin-user-role">
                  <span className="label-text">Role</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  id="admin-user-role"
                  onChange={(e) =>
                    setRoleName(e.target.value as AssignableRole)
                  }
                  value={roleName}
                >
                  <option value="AccrualViewer">AccrualViewer</option>
                  <option value="FinancialViewer">FinancialViewer</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>

              <button
                className="btn btn-primary"
                disabled={addRoleDisabled}
                onClick={() => {
                  assignRoleMutation.reset();
                  assignRoleMutation.mutate({
                    entraUserId: selectedUser.id,
                    roleName,
                  });
                }}
                type="button"
              >
                {assignRoleMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Adding…
                  </>
                ) : (
                  'Add Role'
                )}
              </button>

              {assignError ? (
                <div className="alert alert-error">
                  <span>
                    Failed to add role{' '}
                    {assignError instanceof HttpError
                      ? `(HTTP ${assignError.status})`
                      : ''}
                    .
                  </span>
                </div>
              ) : null}

              {assignSuccess ? (
                <div
                  className={`alert ${
                    assignSuccess.added ? 'alert-success' : 'alert-info'
                  }`}
                >
                  <span>
                    {assignSuccess.added
                      ? 'Role added.'
                      : 'User already has that role.'}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
