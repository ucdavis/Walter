import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DuplicateProjectionButton } from '@/components/projections/DuplicateProjectionButton.tsx';
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
  onCreated,
  summary,
}: {
  iamId: string;
  onCreated: (saved: Projection) => Promise<void>;
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
      className="flex min-w-0 flex-col rounded-box border border-base-300 bg-base-100 p-5"
    >
      <h3 className="text-xl font-semibold break-words">
        <Link
          className="link link-hover"
          params={{ iamId, projectionId: String(summary.id) }}
          to="/projections/$iamId/$projectionId"
        >
          {plan.name}
        </Link>
      </h3>
      {data ? (
        <>
          {data.plan.content.notes && (
            <p className="mt-2 line-clamp-2 text-sm text-base-content/70 break-words">
              {data.plan.content.notes}
            </p>
          )}
          <p className="mt-3 text-sm text-base-content/70">
            {fundingMonthLabel(data.window.startMonth)} through{' '}
            {fundingMonthLabel(data.window.endMonth)} ·{' '}
            {data.plan.content.appointments.length}{' '}
            {data.plan.content.appointments.length === 1
              ? 'appointment'
              : 'appointments'}
          </p>
          <dl className="mt-4">
            <dt className="text-sm">Projected ending balance</dt>
            <dd
              className={`mt-1 text-2xl font-semibold ${data.outlook.endBalance !== null && data.outlook.endBalance < 0 ? 'text-error' : ''}`}
            >
              {data.outlook.endBalance === null
                ? 'No forecast data'
                : formatCurrency(data.outlook.endBalance)}
            </dd>
          </dl>
          <ProjectionBalanceSparkline
            months={data.outlook.months}
            window={data.window}
          />
          {data.outlook.firstShortfallMonth && (
            <p className="mt-2 text-sm text-error">
              {data.outlook.shortfallSources.length === 1
                ? 'A funding source falls'
                : `${data.outlook.shortfallSources.length} funding sources fall`}{' '}
              below zero. First in{' '}
              {fundingMonthLabel(data.outlook.firstShortfallMonth)}.
            </p>
          )}
        </>
      ) : preview.isError ? (
        <div className="my-5 text-sm">
          <p>Preview unavailable.</p>
          <button
            className="btn btn-ghost btn-sm mt-2"
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
      <div className="mt-auto pt-5">
        <p className="mb-3 text-xs text-base-content/70">
          Saved {new Date(plan.updatedAt).toLocaleString()}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            aria-label={`Open plan ${plan.name}`}
            className="btn btn-primary btn-sm"
            params={{ iamId, projectionId: String(summary.id) }}
            to="/projections/$iamId/$projectionId"
          >
            Open plan
          </Link>
          <DuplicateProjectionButton
            iamId={iamId}
            onCreated={onCreated}
            projection={plan}
          />
        </div>
      </div>
    </article>
  );
}
