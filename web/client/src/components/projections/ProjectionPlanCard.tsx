import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { ProjectionBalanceSparkline } from '@/components/projections/ProjectionBalanceSparkline.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatCurrency } from '@/lib/currency.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import {
  orderedTimestamp,
  projectionQueryOptions,
  type Projection,
  type ProjectionSummary,
} from '@/queries/projections.ts';

function savedPreview(plan: Projection) {
  const results = computePiProjection(plan);
  return {
    outlook: buildProjectionOutlook(plan, results),
    plan,
    window: results.forecastWindow,
  };
}

export function ProjectionPlanCard({
  iamId,
  summary,
}: {
  iamId: string;
  summary: ProjectionSummary;
}) {
  const queryClient = useQueryClient();
  // Each saved document loads independently. A current-data outage cannot block its preview.
  const preview = useQuery({
    ...projectionQueryOptions(summary.id),
    retry: false,
    select: savedPreview,
  });
  const previewVersion = preview.data?.plan.updatedAt;
  useEffect(() => {
    const { queryKey } = projectionQueryOptions(summary.id);
    // The list can discover another writer's saved version while this card stays mounted.
    // Recheck a completed read too: it may have started before the list's newer version.
    if (
      previewVersion &&
      orderedTimestamp(previewVersion) < orderedTimestamp(summary.updatedAt)
    ) {
      void queryClient.invalidateQueries({ exact: true, queryKey });
    }
  }, [previewVersion, queryClient, summary.id, summary.updatedAt]);
  const data = preview.isError ? undefined : preview.data;
  const plan = data?.plan ?? summary;
  return (
    <article
      aria-label={plan.name}
      className="relative flex min-w-0 flex-col rounded-box border border-base-300 bg-base-100 p-4 transition-shadow hover:shadow-md"
    >
      <h3 className="line-clamp-2 text-lg font-semibold break-words">
        <Link
          aria-label={`Open plan ${plan.name}`}
          className="after:absolute after:inset-0 after:rounded-box focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
          params={{ iamId, projectionId: String(summary.id) }}
          to="/projections/$iamId/$projectionId"
        >
          {plan.name}
        </Link>
      </h3>
      {data ? (
        <>
          <div className="mt-1 min-h-10">
            {data.plan.content.notes && (
              <p className="line-clamp-2 text-sm text-base-content/65 break-words">
                {data.plan.content.notes}
              </p>
            )}
          </div>
          <div className="mt-3">
            <ProjectionBalanceSparkline
              months={data.outlook.months}
              window={data.window}
            />
          </div>
          <dl className="mt-3 mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <dt className="text-xs text-base-content/65">Ending balance</dt>
            <dd
              className={`ml-auto min-w-0 max-w-full text-right text-2xl font-semibold break-words tabular-nums ${data.outlook.endBalance !== null && data.outlook.endBalance < 0 ? 'text-error' : ''}`}
            >
              {data.outlook.endBalance === null
                ? 'No forecast data'
                : formatCurrency(data.outlook.endBalance)}
            </dd>
          </dl>
        </>
      ) : preview.isError ? (
        <div className="my-5 text-sm">
          <p>Preview unavailable.</p>
          <button
            className="btn btn-ghost btn-sm relative z-10 mt-2"
            disabled={preview.isFetching}
            onClick={() => void preview.refetch()}
            type="button"
          >
            Retry preview
          </button>
        </div>
      ) : (
        <p className="my-5 text-sm text-base-content/70" role="status">
          Loading preview...
        </p>
      )}
      <footer className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-base-200 pt-3">
        {data && (
          <p
            className="text-xs text-base-content/65"
            title={`Starts ${fundingMonthLabel(data.window.startMonth)}`}
          >
            {data.plan.content.forecastMonths} months ·{' '}
            {data.plan.content.appointments.length}{' '}
            {data.plan.content.appointments.length === 1
              ? 'appointment'
              : 'appointments'}
          </p>
        )}
        <span
          aria-hidden="true"
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          Open plan
          <ArrowRightIcon className="size-4" />
        </span>
      </footer>
    </article>
  );
}
