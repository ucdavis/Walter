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
import {
  SourceOutlookHeader,
  SourceForecastCosts,
} from '@/components/projections/SourceOutlookSummary.tsx';
import type { SourceCategoryWorksheetHandle } from '@/components/projections/SourceCategoryWorksheet.tsx';
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
  focusCategoryBudgets: () => void;
  focusSelectedSource: () => void;
}

export function FundingOutlook({
  draft,
  onNavigate,
  onViewCategoryBalances,
  outlook,
  ref,
  results,
  selectedSourceId,
}: {
  draft: ProjectionDraft;
  onNavigate: (location: ProjectionNavigation) => void;
  onViewCategoryBalances?: (id: number) => void;
  outlook: ProjectionOutlook;
  ref?: Ref<FundingOutlookHandle>;
  results: ProjectionResults;
  selectedSourceId: number | null;
}) {
  const activeSourceId =
    selectedSourceId ??
    (outlook.sources.length === 1 ? outlook.sources[0].source.id : null);
  const selected = outlook.sources.find(
    ({ source }) => source.id === activeSourceId
  );
  const worksheetRef = useRef<SourceCategoryWorksheetHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusSelectedSource = useCallback(() => {
    const heading = headingRef.current;
    if (heading) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'start' });
    }
  }, []);
  useImperativeHandle(ref, () => ({
    focusCategoryBudgets: () => {
      if (worksheetRef.current) {
        worksheetRef.current.focusBalances();
      } else {
        focusSelectedSource();
      }
    },
    focusSelectedSource,
  }));
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const selectSource = (id: number) =>
    onNavigate({ section: 'overview', source: id });
  const series = fundingOutlookSeries(
    outlook,
    false,
    activeSourceId,
    selectSource,
    (id) => setExpandedGroups((current) => new Set([...current, id]))
  );
  const hasUnverifiedCategories = outlook.sources.some(
    ({ endBalance, fundingBasis }) =>
      endBalance !== null && fundingBasis === 'unknown'
  );

  return (
    <section className="min-w-0">
      {outlook.sources.length === 0 ? (
        <p className="mt-6">
          No funding sources in this plan. Add funding sources to explore an
          outlook.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-main-border bg-base-100 text-base">
          <div className="flex flex-wrap items-start justify-between gap-5 p-5 xl:p-6">
            <div className="min-w-0 flex-1">
              {selected ? (
                <SourceOutlookHeader
                  headingRef={headingRef}
                  onNavigate={onNavigate}
                  onViewCategoryBalances={() =>
                    worksheetRef.current?.focusBalances()
                  }
                  outlook={selected}
                  planStartDate={draft.seededAt.slice(0, 10)}
                />
              ) : (
                <>
                  <h2 className="text-xl font-semibold">Project outlook</h2>
                  <p
                    className={`mt-1 text-sm ${outlook.categoryShortfallSources.length ? 'text-error' : 'text-base-content/80'}`}
                  >
                    {outlook.categoryShortfallSources.length
                      ? `${outlook.categoryShortfallSources.length} funding ${outlook.categoryShortfallSources.length === 1 ? 'source has' : 'sources have'} category budget shortfalls`
                      : outlook.shortfallSources.length
                        ? `${outlook.shortfallSources.length} of ${outlook.sources.length} funding sources ${outlook.shortfallSources.length === 1 ? 'runs' : 'run'} short`
                        : hasUnverifiedCategories
                          ? 'Overall balances stay within funding; category budgets unverified'
                          : 'Each funding source stays within funding'}
                  </p>
                  <p className="mt-1 text-sm text-base-content/80">
                    {outlook.categoryShortfallSources.length
                      ? 'An overall surplus does not cover a shortfall in a category budget. Select a warning to review category balances.'
                      : 'Balances stay separate. Select a funding source to explore its forecast.'}
                  </p>
                </>
              )}
            </div>
            <label className="grid w-full min-w-0 gap-1.5 text-sm font-medium sm:w-80 lg:w-96">
              Explore a funding source
              <select
                className="select w-full min-w-0 truncate pr-10"
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
                value={activeSourceId ?? ''}
              >
                {outlook.sources.length > 1 && (
                  <option value="">
                    All funding sources · separate balances
                  </option>
                )}
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
          {selected && <SourceForecastCosts outlook={selected} />}
          {selected && outlook.sources.length > 1 && (
            <button
              className="btn btn-ghost btn-sm mx-4 mt-4"
              onClick={() => onNavigate({ section: 'overview' })}
              type="button"
            >
              Back to all funding sources
            </button>
          )}
          {selected && (
            <Suspense
              fallback={
                <p className="flex h-72 items-center justify-center text-sm text-base-content/80 sm:h-80">
                  Loading balance chart…
                </p>
              }
            >
              <FundingOutlookChart
                firstShortfallMonth={selected?.firstShortfallMonth ?? null}
                focused={Boolean(selected)}
                forecastWindow={results.forecastWindow}
                hidden={hiddenSources}
                onHideAll={() =>
                  setHiddenSources(new Set(series.map(({ id }) => id)))
                }
                onShowAll={() => setHiddenSources(new Set())}
                onToggle={(id) =>
                  setHiddenSources((current) => toggleSet(current, id))
                }
                series={series}
              />
            </Suspense>
          )}
          {!selected && (
            <FundingOutlookTable
              expandedGroups={expandedGroups}
              groups={outlook.groups}
              onSelect={selectSource}
              onToggleGroup={(id) =>
                setExpandedGroups((current) => toggleSet(current, id))
              }
              onViewCategoryBalances={onViewCategoryBalances ?? selectSource}
              sources={outlook.sources}
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
          worksheetRef={worksheetRef}
        />
      )}
      <details className="mt-4 text-sm text-base-content/80">
        <summary className="cursor-pointer font-semibold">
          About this forecast
        </summary>
        <div className="mt-3 max-w-4xl space-y-2 leading-relaxed">
          <p>
            Net forecast costs are additional expected costs, including planned
            credits. Booked spending is already reflected in captured balances.
          </p>
          <p>
            Sources keep their own capture dates. Project groups combine
            displayed amounts, while shortfalls remain visible for each source.
          </p>
        </div>
      </details>
    </section>
  );
}
