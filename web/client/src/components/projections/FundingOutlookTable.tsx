import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { projectionSeriesColor } from '@/components/projections/projectionFormatting.ts';
import { Fragment } from 'react';
import { SourceCategoryShortfallWarning } from '@/components/projections/SourceCategoryShortfallWarning.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import type { OutlookGroup, SourceOutlook } from '@/lib/projectionOutlook.ts';

function SourceRow({
  colorIndex,
  nested = false,
  onSelect,
  onViewCategoryBalances,
  outlook,
}: {
  colorIndex: number;
  nested?: boolean;
  onSelect: (id: number) => void;
  onViewCategoryBalances: (id: number) => void;
  outlook: SourceOutlook;
}) {
  return (
    <tr className="hover:bg-base-200/50">
      <th
        className={
          nested
            ? 'max-w-72 pl-8 font-normal'
            : 'max-w-72 pl-5 font-normal xl:pl-6'
        }
        scope="row"
      >
        <button
          aria-label={`View ${outlook.label}`}
          className="flex w-full min-w-0 items-center gap-2 text-left text-base-content hover:underline"
          onClick={() => onSelect(outlook.source.id)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: projectionSeriesColor(colorIndex) }}
          />
          <span className="truncate font-semibold" title={outlook.label}>
            {outlook.label}
          </span>
          <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
        </button>
        {outlook.source.sourceKind === 'Planned' && (
          <span className="mt-1 block text-xs text-base-content/70">
            Planned funding
          </span>
        )}
      </th>
      <td>
        {outlook.outside ? (
          <span>Outside forecast period</span>
        ) : outlook.endBalance === null ? (
          <span>No forecast data in this period</span>
        ) : outlook.firstShortfallMonth ? (
          <span className="inline-flex items-center gap-1.5 text-error">
            <ExclamationTriangleIcon
              aria-hidden="true"
              className="size-4 shrink-0"
            />
            Shortfall · {fundingMonthLabel(outlook.firstShortfallMonth)}
            {outlook.endBalance >= 0 && (
              <span className="block text-xs">Recovers by plan end</span>
            )}
          </span>
        ) : outlook.categoryShortfalls.length === 0 ? (
          outlook.fundingBasis === 'unknown' ? (
            <span>
              Overall within funding
              <span className="block text-xs">Category budgets unverified</span>
            </span>
          ) : (
            'Within funding'
          )
        ) : null}
        {outlook.categoryShortfalls.length > 0 && (
          <div className="mt-1">
            <SourceCategoryShortfallWarning
              onView={onViewCategoryBalances}
              outlook={outlook}
            />
          </div>
        )}
      </td>
      <td className="text-right tabular-nums">
        {formatCurrency(outlook.forecast)}
      </td>
      <td
        className={`text-right font-semibold tabular-nums ${outlook.endBalance !== null && outlook.endBalance < 0 ? 'text-error' : ''}`}
      >
        {outlook.endBalance === null ? '—' : formatCurrency(outlook.endBalance)}
      </td>
    </tr>
  );
}

export function FundingOutlookTable({
  expandedGroups,
  groups,
  onSelect,
  onToggleGroup,
  onViewCategoryBalances,
  sources,
}: {
  expandedGroups: ReadonlySet<string>;
  groups: OutlookGroup[];
  onSelect: (id: number) => void;
  onToggleGroup: (id: string) => void;
  onViewCategoryBalances: (id: number) => void;
  sources?: SourceOutlook[];
}) {
  return (
    <div
      aria-label="Funding source outlook"
      className="overflow-x-auto border-t border-main-border"
      role="region"
      tabIndex={0}
    >
      <table className="table w-full text-sm">
        <caption className="px-5 pt-5 pb-3 text-left text-lg font-semibold text-base-content xl:px-6">
          Funding sources
        </caption>
        <thead className="text-base-content/85">
          <tr>
            <th className="pl-5 xl:pl-6" scope="col">
              Project/Task
            </th>
            <th scope="col">Funding outlook</th>
            <th className="text-right" scope="col">
              Planned spending
            </th>
            <th className="text-right" scope="col">
              Ending balance
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) =>
            group.sources.length === 1 ? (
              <SourceRow
                colorIndex={(
                  sources ?? groups.flatMap((entry) => entry.sources)
                ).findIndex(
                  (entry) => entry.source.id === group.sources[0].source.id
                )}
                key={group.id}
                onSelect={onSelect}
                onViewCategoryBalances={onViewCategoryBalances}
                outlook={group.sources[0]}
              />
            ) : (
              <Fragment key={group.id}>
                <tr className="bg-base-200/40">
                  <th scope="row">
                    <button
                      aria-expanded={expandedGroups.has(group.id)}
                      className="w-full min-w-0 text-left text-base-content hover:underline"
                      onClick={() => onToggleGroup(group.id)}
                      type="button"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        {expandedGroups.has(group.id) ? (
                          <ChevronDownIcon
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        ) : (
                          <ChevronRightIcon
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        )}
                        <span className="truncate">{group.label}</span>
                      </span>
                      <span className="mt-1 block text-xs font-normal">
                        {group.sources.length} task sources
                      </span>
                    </button>
                  </th>
                  <td>
                    {group.shortfallSources.length > 0 ? (
                      <span className="text-error">
                        {group.shortfallSources.length} task{' '}
                        {group.shortfallSources.length === 1
                          ? 'shortfall'
                          : 'shortfalls'}
                        <span className="block text-xs">
                          First {fundingMonthLabel(group.firstShortfallMonth!)}
                        </span>
                      </span>
                    ) : group.endBalance === null ? (
                      group.sources.every(({ outside }) => outside) ? (
                        'Outside forecast period'
                      ) : (
                        'No forecast data in this period'
                      )
                    ) : group.categoryShortfallSources.length === 0 ? (
                      group.sources.some(
                        ({ endBalance, fundingBasis }) =>
                          endBalance !== null && fundingBasis === 'unknown'
                      ) ? (
                        <span>
                          Overall within funding
                          <span className="block text-xs">
                            Category budgets unverified
                          </span>
                        </span>
                      ) : (
                        'Within funding'
                      )
                    ) : null}
                    {group.categoryShortfallSources.length > 0 && (
                      <span className="mt-1 flex items-start gap-1.5 text-error">
                        <ExclamationTriangleIcon
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0"
                        />
                        <span>
                          {group.categoryShortfallSources.length}{' '}
                          {group.categoryShortfallSources.length === 1
                            ? 'task has'
                            : 'tasks have'}{' '}
                          category shortfalls
                          <span className="block text-xs">
                            First{' '}
                            {fundingMonthLabel(
                              group.firstCategoryShortfallMonth!
                            )}
                            {group.categoryShortfallSources.every((source) =>
                              source.categoryShortfalls.every(
                                ({ recoveredMonth }) => recoveredMonth !== null
                              )
                            ) && ' · Recover by plan end'}
                          </span>
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatCurrency(group.forecast)}
                  </td>
                  <td
                    className={`text-right font-semibold tabular-nums ${group.endBalance !== null && group.endBalance < 0 ? 'text-error' : ''}`}
                  >
                    {group.endBalance === null
                      ? '—'
                      : formatCurrency(group.endBalance)}
                  </td>
                </tr>
                {expandedGroups.has(group.id) &&
                  group.sources.map((source) => (
                    <SourceRow
                      colorIndex={(
                        sources ?? groups.flatMap((entry) => entry.sources)
                      ).findIndex(
                        (entry) => entry.source.id === source.source.id
                      )}
                      key={source.source.id}
                      nested
                      onSelect={onSelect}
                      onViewCategoryBalances={onViewCategoryBalances}
                      outlook={source}
                    />
                  ))}
              </Fragment>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
