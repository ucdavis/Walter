import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessAdminUsers } from '@/shared/auth/roleAccess.ts';
import { assignRole, AssignableRole, useAdminUserSearchQuery } from '@/queries/adminUsers.ts';
import { useDebouncedValue } from '@/lib/useDebouncedValue.ts';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { HttpError } from '@/lib/api.ts';

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

  const searchResults = searchQuery.data ?? [];
  const selectedUser = useMemo(
    () => searchResults.find((u) => u.id === selectedUserId) ?? null,
    [searchResults, selectedUserId]
  );

  const assignRoleMutation = useMutation({
    mutationFn: assignRole,
  });

  const assignError = assignRoleMutation.error;
  const assignSuccess = assignRoleMutation.data;

  const searchError = searchQuery.error;
  const showQueryHint = query.trim().length > 0 && query.trim().length < 3;
  const showNoResults =
    query.trim().length >= 3 &&
    !searchQuery.isPending &&
    !searchQuery.isError &&
    searchResults.length === 0;

  const addRoleDisabled = !selectedUser || assignRoleMutation.isPending;

  return (
    <div className="container mt-8">
      <h1 className="h1">Admin Users</h1>
      <p className="subtitle">
        Search Entra directory users and assign roles.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card bg-base-100 shadow-md">
          <div className="card-body gap-4">
            <h2 className="card-title">Find a user</h2>

            <div>
              <label className="label" htmlFor="admin-user-search">
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
                }}
                placeholder="Type at least 3 characters…"
                type="text"
                value={query}
              />
              <p className="label">
                Searches Microsoft Graph (prefix match) and returns up to 25 users.
              </p>
            </div>

            {showQueryHint ? (
              <div className="alert alert-soft alert-info">
                <span>Type at least 3 characters to search.</span>
              </div>
            ) : null}

            {searchQuery.isPending ? (
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

            {searchResults.length ? (
              <div className="max-h-96 overflow-auto rounded-box border border-base-300">
                <ul className="menu menu-sm">
                  {searchResults.map((u) => {
                    const label = u.displayName?.trim() || u.email?.trim() || u.id;
                    const secondary = u.email?.trim() || '';
                    const isSelected = u.id === selectedUserId;

                    return (
                      <li key={u.id}>
                        <button
                          className={isSelected ? 'active' : undefined}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            assignRoleMutation.reset();
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
        </div>

        <div className="card bg-base-100 shadow-md">
          <div className="card-body gap-4">
            <h2 className="card-title">Assign a role</h2>

            {selectedUser ? (
              <div className="rounded-box bg-base-200 p-4">
                <div className="text-sm font-semibold">Selected user</div>
                <div className="mt-1 truncate">
                  {selectedUser.displayName || selectedUser.email || selectedUser.id}
                </div>
                {selectedUser.email ? (
                  <div className="truncate text-sm text-base-content/60">
                    {selectedUser.email}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="alert alert-soft">
                <span>Select a user from search results.</span>
              </div>
            )}

            <div>
              <label className="label" htmlFor="admin-user-role">
                <span className="label-text">Role</span>
              </label>
              <select
                className="select select-bordered w-full"
                id="admin-user-role"
                onChange={(e) => setRoleName(e.target.value as AssignableRole)}
                value={roleName}
              >
                <option value="AccrualViewer">AccrualViewer</option>
                <option value="Manager">Manager</option>
              </select>
            </div>

            <button
              className="btn btn-primary"
              disabled={addRoleDisabled}
              onClick={() => {
                if (!selectedUser) return;
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
              <>
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

                <div className="rounded-box bg-base-200 p-4">
                  <div className="text-sm font-semibold">User</div>
                  <div className="mt-1">{assignSuccess.user.name}</div>
                  <div className="text-sm text-base-content/70">
                    {assignSuccess.user.email}
                  </div>

                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                    <div>
                      <div className="font-semibold">Employee ID</div>
                      <div className="truncate">{assignSuccess.user.employeeId}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Kerberos</div>
                      <div className="truncate">{assignSuccess.user.kerberos}</div>
                    </div>
                    <div>
                      <div className="font-semibold">IAMID</div>
                      <div className="truncate">{assignSuccess.user.iamId}</div>
                    </div>
                    <div>
                      <div className="font-semibold">Roles</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {assignSuccess.user.roles.length ? (
                          assignSuccess.user.roles.map((r) => (
                            <span className="badge badge-neutral" key={r}>
                              {r}
                            </span>
                          ))
                        ) : (
                          <span className="text-base-content/60">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Link className="btn btn-outline" to="/admin">
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
