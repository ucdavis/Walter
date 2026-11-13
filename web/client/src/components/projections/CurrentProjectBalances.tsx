import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/currency.ts';
import {
  projectionSourceCatalogQueryOptions,
  type ProjectionSourceSummary,
} from '@/queries/projections.ts';

function summarizeBalances(sources: ProjectionSourceSummary[]) {
  const groups = new Map<
    string,
    {
      balance: number;
      name: string;
      projectNumber: string;
      sources: ProjectionSourceSummary[];
    }
  >();
  for (const source of sources) {
    const group = groups.get(source.projectNumber) ?? {
      balance: 0,
      name: source.projectName || source.projectNumber,
      projectNumber: source.projectNumber,
      sources: [],
    };
    group.balance += source.availableBalance;
    group.sources.push(source);
    groups.set(source.projectNumber, group);
  }
  return {
    capturedAt: sources[0]?.capturedAt,
    groups: [...groups.values()],
    total: sources.reduce((sum, source) => sum + source.availableBalance, 0),
  };
}

export function CurrentProjectBalances({ iamId }: { iamId: string }) {
  const balances = useQuery({
    ...projectionSourceCatalogQueryOptions(iamId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
    select: summarizeBalances,
  });
  const data = balances.isError ? undefined : balances.data;
  return (
    <section
      aria-label="Current project balances"
      className="mt-6 rounded-box border border-base-300 bg-base-200/40 p-5"
    >
      <h2 className="text-lg font-semibold">Current project balances</h2>
      {balances.isError ? (
        <div className="mt-3 text-sm">
          <p>Current balances are unavailable.</p>
          <button
            className="btn btn-ghost btn-sm mt-2"
            disabled={balances.isFetching}
            onClick={() => void balances.refetch()}
            type="button"
          >
            Retry balances
          </button>
        </div>
      ) : !data ? (
        <p className="mt-3 text-sm" role="status">
          Loading balances...
        </p>
      ) : !data.groups.length ? (
        <p className="mt-3 text-sm">
          No eligible project balances are available.
        </p>
      ) : (
        <>
          <p
            className={`mt-2 text-3xl font-semibold ${data.total < 0 ? 'text-error' : ''}`}
          >
            {formatCurrency(data.total)}
          </p>
          <p className="mt-1 text-sm text-base-content/70">
            After spending and commitments.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">
              Project balances ({data.groups.length})
            </summary>
            <ul className="mt-3 divide-y divide-base-300">
              {data.groups.map((group) => (
                <li className="py-3" key={group.projectNumber}>
                  <div className="flex flex-wrap justify-between gap-x-5 gap-y-1 text-sm">
                    <div className="min-w-0 break-words">
                      <span className="font-medium">{group.name}</span>{' '}
                      <span className="text-base-content/70">
                        {group.projectNumber}
                      </span>
                    </div>
                    <span
                      className={`font-semibold ${group.balance < 0 ? 'text-error' : ''}`}
                    >
                      {formatCurrency(group.balance)}
                    </span>
                  </div>
                  {group.sources.length > 1 && (
                    <ul
                      aria-label={`${group.name} tasks`}
                      className="mt-2 space-y-2 border-l border-base-300 pl-4 text-sm"
                    >
                      {group.sources.map((source) => (
                        <li
                          className="flex flex-wrap justify-between gap-x-5 gap-y-1"
                          key={source.taskNumber ?? ''}
                        >
                          <span className="min-w-0 break-words">
                            {source.taskName || 'Task'} {source.taskNumber}
                          </span>
                          <span
                            className={
                              source.availableBalance < 0 ? 'text-error' : ''
                            }
                          >
                            {formatCurrency(source.availableBalance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-base-content/70">
              Retrieved {new Date(data.capturedAt!).toLocaleString()}. Saved
              plans retain their captured balances.
            </p>
          </details>
          {balances.isFetching && (
            <p className="mt-2 text-xs text-base-content/70" role="status">
              Updating balances...
            </p>
          )}
        </>
      )}
    </section>
  );
}
