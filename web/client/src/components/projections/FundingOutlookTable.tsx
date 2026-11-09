import { Fragment } from 'react';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { OutlookGroup, SourceOutlook } from '@/lib/projectionOutlook.ts';

function SourceRow({
  nested = false,
  onSelect,
  outlook,
}: {
  nested?: boolean;
  onSelect: (id: number) => void;
  outlook: SourceOutlook;
}) {
  return (
    <tr>
      <th className={nested ? 'pl-8 font-normal' : 'font-normal'} scope="row">
        <button
          aria-label={`View ${outlook.label}`}
          className="link text-left whitespace-normal"
          onClick={() => onSelect(outlook.source.id)}
          type="button"
        >
          {outlook.label}
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
          <span className="text-error">
            Shortfall · {fundingMonthLabel(outlook.firstShortfallMonth)}
            {outlook.endBalance >= 0 && (
              <span className="block text-xs">Recovers by plan end</span>
            )}
          </span>
        ) : (
          'Within funding'
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
}: {
  expandedGroups: ReadonlySet<string>;
  groups: OutlookGroup[];
  onSelect: (id: number) => void;
  onToggleGroup: (id: string) => void;
}) {
  return (
    <div
      aria-label="Funding source outlook"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="table w-full">
        <caption className="p-5 text-left text-lg font-semibold">
          Funding sources
        </caption>
        <thead>
          <tr>
            <th scope="col">Project / funding source</th>
            <th scope="col">Funding outlook</th>
            <th className="text-right" scope="col">
              Net forecast costs
            </th>
            <th className="text-right" scope="col">
              Projected end balance
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) =>
            group.sources.length === 1 ? (
              <SourceRow
                key={group.id}
                onSelect={onSelect}
                outlook={group.sources[0]}
              />
            ) : (
              <Fragment key={group.id}>
                <tr className="bg-base-200/40">
                  <th scope="row">
                    <button
                      aria-expanded={expandedGroups.has(group.id)}
                      className="link text-left whitespace-normal"
                      onClick={() => onToggleGroup(group.id)}
                      type="button"
                    >
                      {expandedGroups.has(group.id) ? '▾' : '▸'} {group.label}
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
                    ) : (
                      'Within funding'
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
                      key={source.source.id}
                      nested
                      onSelect={onSelect}
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
