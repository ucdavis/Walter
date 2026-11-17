import { useQuery } from '@tanstack/react-query';
import {
  formatProjectionCurrency as formatCurrency,
  compactProjectionCurrency,
} from '@/components/projections/projectionFormatting.ts';
import { projectionSeriesColor as chartSeriesColor } from '@/components/projections/projectionFormatting.ts';
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
      className="mb-6 rounded-box border border-main-border bg-base-200"
    >
      <h2 className="sr-only">Current project balances</h2>
      {balances.isError ? (
        <div className="px-5 py-4 text-sm">
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
        <p className="px-5 py-4 text-sm" role="status">
          Loading balances...
        </p>
      ) : !data.groups.length ? (
        <p className="px-5 py-4 text-sm">
          No eligible project balances are available.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 py-4">
            <div>
              <strong
                className={`block text-2xl font-semibold tabular-nums ${data.total < 0 ? 'text-error' : ''}`}
              >
                {formatCurrency(data.total)}
              </strong>
              <span className="mt-0.5 block text-base font-semibold">
                Available across active projects
              </span>
            </div>
            <p className="ms-auto text-right text-sm text-base-content/80">
              {data.groups.length} projects · From your Walter snapshot
            </p>
          </div>
          <details className="border-t border-main-border">
            <summary className="cursor-pointer px-5 py-2.5 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
              Project balances ({data.groups.length})
            </summary>
            <ul
              aria-label="Project balances"
              className="grid max-h-60 grid-cols-1 gap-x-6 overflow-y-auto overscroll-contain px-5 pb-3 @2xl:grid-cols-2"
              tabIndex={0}
            >
              {data.groups.map((group, index) => (
                <li
                  className="min-w-0 border-t border-main-border py-2 text-sm"
                  key={group.projectNumber}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 block size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: chartSeriesColor(index) }}
                      />
                      <span
                        className="min-w-0 truncate"
                        title={`${group.name} · ${group.projectNumber}`}
                      >
                        {group.name}
                      </span>
                    </span>
                    <strong
                      className={`shrink-0 font-semibold tabular-nums ${group.balance < 0 ? 'text-error' : ''}`}
                      title={formatCurrency(group.balance)}
                    >
                      {compactProjectionCurrency(group.balance)}
                    </strong>
                  </div>
                  {group.sources.length > 1 && (
                    <ul
                      aria-label={`${group.name} tasks`}
                      className="mt-2 space-y-2 border-l border-main-border pl-4 text-sm"
                    >
                      {group.sources.map((source) => (
                        <li
                          className="flex min-w-0 justify-between gap-3"
                          key={source.taskNumber ?? ''}
                        >
                          <span className="min-w-0 truncate">
                            {source.taskName || 'Task'} {source.taskNumber}
                          </span>
                          <span
                            className={`shrink-0 tabular-nums ${source.availableBalance < 0 ? 'text-error' : ''}`}
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
            <p className="px-5 pb-3 text-xs text-base-content/80">
              Retrieved {new Date(data.capturedAt!).toLocaleString()}. Saved
              plans retain their captured balances.
            </p>
          </details>
          {balances.isFetching && (
            <p className="px-5 pb-3 text-xs text-base-content/80" role="status">
              Updating balances...
            </p>
          )}
        </>
      )}
    </section>
  );
}
