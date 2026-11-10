import {
  lazy,
  Suspense,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { fundingOutlookSeries } from '@/components/projections/fundingOutlookSeries.ts';
import { FundingOutlookTotals } from '@/components/projections/FundingOutlookSummary.tsx';
import { FundingOutlookTable } from '@/components/projections/FundingOutlookTable.tsx';
import { SourceOutlookDetails } from '@/components/projections/SourceOutlookDetails.tsx';
import type { ProjectionOutlook } from '@/lib/projectionOutlook.ts';
import type {
  ProjectionNavigation,
  ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

const FundingOutlookChart = lazy(() =>
  import('@/components/projections/FundingOutlookChart.tsx').then(
    ({ FundingOutlookChart }) => ({ default: FundingOutlookChart })
  )
);

function toggleSet(current: ReadonlySet<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export interface FundingOutlookHandle {
  focusSelectedSource: () => void;
}

export function FundingOutlook({
  draft,
  onNavigate,
  outlook,
  ref,
  results,
  selectedSourceId,
}: {
  draft: ProjectionDraft;
  onNavigate: (location: ProjectionNavigation) => void;
  outlook: ProjectionOutlook;
  ref?: Ref<FundingOutlookHandle>;
  results: ProjectionResults;
  selectedSourceId: number | null;
}) {
  const selected = outlook.sources.find(
    ({ source }) => source.id === selectedSourceId
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusSelectedSource = useCallback(() => {
    const heading = headingRef.current;
    if (heading) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'start' });
    }
  }, []);
  useImperativeHandle(ref, () => ({ focusSelectedSource }));
  const [grouped, setGrouped] = useState(false);
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const selectSource = (id: number) =>
    onNavigate({ section: 'overview', source: id });
  const series = fundingOutlookSeries(
    outlook,
    grouped,
    selectedSourceId,
    selectSource,
    (id) => setExpandedGroups((current) => new Set([...current, id]))
  );
  const hidden = selected
    ? new Set<string>()
    : grouped
      ? hiddenGroups
      : hiddenSources;
  const setHidden = grouped ? setHiddenGroups : setHiddenSources;

  return (
    <section className="mt-6 min-w-0">
      <h2 className="text-xl font-bold">Funding outlook</h2>
      <p className="mt-2 text-sm">
        Each funding source keeps its own balance. A surplus on one task does
        not cover another task&apos;s shortfall.
      </p>
      {outlook.sources.length === 0 ? (
        <p className="mt-6">
          No funding sources in this plan. Add funding sources to explore an
          outlook.
        </p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-box border border-base-300">
          <div className="flex flex-wrap items-end justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <h3
                className="scroll-mt-24 text-lg font-semibold break-words"
                ref={headingRef}
                tabIndex={-1}
              >
                {selected ? selected.label : 'All funding sources'}
              </h3>
              <p className="mt-1 text-sm text-base-content/70">
                {selected
                  ? 'Explore the inputs behind this source’s forecast.'
                  : 'Select a source to explore its forecast.'}
              </p>
            </div>
            <label className="w-full text-sm sm:w-auto sm:max-w-sm">
              Explore a funding source
              <select
                className="select mt-1 w-full"
                onChange={(event) =>
                  onNavigate(
                    event.target.value
                      ? {
                          section: 'overview',
                          source: Number(event.target.value),
                        }
                      : { section: 'overview' }
                  )
                }
                value={selectedSourceId ?? ''}
              >
                <option value="">All funding sources</option>
                {outlook.sources.map((source) => (
                  <option key={source.source.id} value={source.source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <FundingOutlookTotals
            endMonth={results.forecastWindow.endMonth}
            outlook={outlook}
            selected={selected}
          />
          {selected ? (
            <button
              className="btn btn-ghost btn-sm mx-4 mt-4"
              onClick={() => onNavigate({ section: 'overview' })}
              type="button"
            >
              Back to all funding sources
            </button>
          ) : (
            <label className="mx-4 mt-4 inline-flex items-center gap-2 text-sm sm:mx-5">
              <input
                checked={grouped}
                className="checkbox checkbox-sm"
                onChange={(event) => setGrouped(event.target.checked)}
                type="checkbox"
              />
              Group by project
            </label>
          )}
          <Suspense
            fallback={
              <p className="flex h-80 items-center justify-center text-sm text-base-content/70 sm:h-96">
                Loading balance chart…
              </p>
            }
          >
            <FundingOutlookChart
              firstShortfallMonth={selected?.firstShortfallMonth ?? null}
              focused={Boolean(selected)}
              forecastWindow={results.forecastWindow}
              hidden={hidden}
              onHideAll={() => setHidden(new Set(series.map(({ id }) => id)))}
              onShowAll={() => setHidden(new Set())}
              onToggle={(id) => setHidden((current) => toggleSet(current, id))}
              series={series}
            />
          </Suspense>
          {!selected && (
            <FundingOutlookTable
              expandedGroups={expandedGroups}
              groups={outlook.groups}
              onSelect={selectSource}
              onToggleGroup={(id) =>
                setExpandedGroups((current) => toggleSet(current, id))
              }
            />
          )}
        </div>
      )}
      {selected && (
        <SourceOutlookDetails
          draft={draft}
          key={selected.source.id}
          onNavigate={onNavigate}
          outlook={selected}
          results={results}
        />
      )}
      <details className="mt-5 rounded-box border border-base-300 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">
          About this forecast
        </summary>
        <p className="mt-3">
          Net forecast costs are additional expected costs, including planned
          credits. Booked spending is already reflected in captured balances.
        </p>
        <p className="mt-2">
          Sources keep their own capture dates. Project groups combine displayed
          amounts, while shortfalls remain visible for each source. Changing
          chart lines changes only this view.
        </p>
      </details>
    </section>
  );
}
