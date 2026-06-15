import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessAdminGLInclusions } from '@/shared/auth/roleAccess.ts';
import {
  useGLInclusionsQuery,
  useAddGLInclusion,
  useRemoveGLInclusion,
} from '@/queries/adminGLInclusions.ts';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { HttpError } from '@/lib/api.ts';
import {
  ArrowLeftIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';

export const Route = createFileRoute('/(authenticated)/admin/gl-inclusions')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!canAccessAdminGLInclusions(user.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const [asn, setAsn] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const inclusionsQuery = useGLInclusionsQuery();
  const addMutation = useAddGLInclusion();
  const removeMutation = useRemoveGLInclusion();

  const inclusions = inclusionsQuery.data ?? [];

  function handleAdd() {
    const trimmedAsn = asn.trim();
    if (!trimmedAsn) {
      setValidationError('ASN is required.');
      return;
    }
    if (!/^\d+$/.test(trimmedAsn)) {
      setValidationError('ASN must contain digits only.');
      return;
    }
    setValidationError(null);
    addMutation.reset();
    addMutation.mutate(
      { accountingSequenceNumber: trimmedAsn, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setAsn('');
          setNote('');
        },
      }
    );
  }

  return (
    <main className="mt-8">
      <div className="container">
        <Link className="btn btn-sm mb-4" to="/admin">
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Admin Dashboard
        </Link>
        <TableCellsIcon className="w-6 h-6" />
        <h1 className="h1">GL Reconciliation Inclusions</h1>
        <p className="subtitle">
          Manage accounting sequence numbers included in GL reconciliation.
        </p>
        <hr className="border-main-border my-4" />

        {inclusionsQuery.isLoading ? (
          <div className="flex items-center gap-3 text-sm text-base-content/70">
            <div className="loading loading-spinner loading-sm" />
            <span>Loading…</span>
          </div>
        ) : inclusionsQuery.error ? (
          <div className="alert alert-error">
            <span>
              Failed to load inclusions
              {inclusionsQuery.error instanceof HttpError
                ? ` (HTTP ${inclusionsQuery.error.status})`
                : ''}
              .
            </span>
          </div>
        ) : inclusions.length === 0 ? (
          <div className="alert alert-soft">
            <span>No inclusions configured.</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ASN</th>
                  <th>Note</th>
                  <th>Added By</th>
                  <th>Added On</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inclusions.map((inc) => {
                  const isRemoving =
                    removeMutation.isPending &&
                    removeMutation.variables === inc.accountingSequenceNumber;
                  return (
                    <tr key={inc.accountingSequenceNumber}>
                      <td className="font-mono">{inc.accountingSequenceNumber}</td>
                      <td>{inc.note ?? '—'}</td>
                      <td>{inc.createdBy}</td>
                      <td>
                        {new Date(inc.createdOnUtc).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          aria-label={`Remove ASN ${inc.accountingSequenceNumber}`}
                          className="btn btn-sm btn-error btn-outline"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            removeMutation.reset();
                            removeMutation.mutate(
                              inc.accountingSequenceNumber
                            );
                          }}
                          type="button"
                        >
                          {isRemoving ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            'Remove'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {removeMutation.error ? (
          <div className="alert alert-error mt-2">
            <span>
              Failed to remove inclusion
              {removeMutation.error instanceof HttpError
                ? ` (HTTP ${removeMutation.error.status})`
                : ''}
              .
            </span>
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="card-title mb-4">Add Inclusion</h2>

          <div className="flex flex-col gap-4 max-w-md">
            <div>
              <label className="label mb-2" htmlFor="gl-asn">
                <span className="label-text">Accounting Sequence Number (ASN)</span>
              </label>
              <input
                className="input input-bordered w-full"
                id="gl-asn"
                onChange={(e) => {
                  setAsn(e.target.value);
                  setValidationError(null);
                }}
                placeholder="e.g. 3000001"
                type="text"
                value={asn}
              />
            </div>

            <div>
              <label className="label mb-2" htmlFor="gl-note">
                <span className="label-text">Note (optional)</span>
              </label>
              <input
                className="input input-bordered w-full"
                id="gl-note"
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for inclusion"
                type="text"
                value={note}
              />
            </div>

            {validationError ? (
              <div className="alert alert-error">
                <span>{validationError}</span>
              </div>
            ) : null}

            {addMutation.error ? (
              <div className="alert alert-error">
                <span>
                  {addMutation.error instanceof Error
                    ? addMutation.error.message
                    : 'Failed to add inclusion.'}
                </span>
              </div>
            ) : null}

            <button
              className="btn btn-primary"
              disabled={addMutation.isPending}
              onClick={handleAdd}
              type="button"
            >
              {addMutation.isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Adding…
                </>
              ) : (
                'Add'
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
