import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useId, useState } from 'react';
import { chartSeriesColor } from '@/shared/chartColors.ts';
import { formatCurrency } from '@/lib/currency.ts';
import {
  sourceCapturedBalance,
  sourceLabel,
  sourcePlanningBalance,
} from '@/lib/projectionSources.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

/** Keeps captured project identity visible when a plan's source names change. */
export function FundingSourceList({
  initialSelection,
  onEdit,
  onRemove,
  sources,
}: {
  initialSelection?: { ids: number[]; onChange: (ids: number[]) => void };
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
  sources: ProjectionFundingSource[];
}) {
  const selectionId = useId();
  const [search, setSearch] = useState('');
  const selected = new Set(initialSelection?.ids ?? []);
  const groups = new Map<string, ProjectionFundingSource[]>();
  for (const source of sources) {
    const key = source.projectNumber ?? `planned:${source.id}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  const matches = (source: ProjectionFundingSource) =>
    [
      source.projectName,
      source.projectNumber,
      source.name,
      source.taskNumber,
      source.taskName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  function toggle(ids: number[], checked: boolean) {
    if (!initialSelection) {
      return;
    }
    const next = new Set(initialSelection.ids);
    for (const id of ids) {
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    initialSelection.onChange([...next]);
  }
  const shown = [...groups.entries()]
    .map(([key, group]) => ({ group, key, visible: group.filter(matches) }))
    .filter(({ visible }) => visible.length > 0);
  return (
    <div className="mt-4">
      <label className="flex max-w-lg flex-col gap-2 text-sm">
        Search funding sources
        <input
          className="input input-bordered w-full"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Project, task, name, or number"
          type="search"
          value={search}
        />
      </label>
      {initialSelection && (
        <p className="mt-2 text-sm text-base-content/60">
          Select the tasks to include. Project checkboxes select every task in
          that project, including tasks hidden by search.
        </p>
      )}
      <div className="mt-5 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ group, key, visible }) => {
          const first = group[0];
          const project =
            first.projectName ?? first.projectNumber ?? 'Planned funding';
          const checked =
            !initialSelection || group.every(({ id }) => selected.has(id));
          const partial = !checked && group.some(({ id }) => selected.has(id));
          return (
            <section
              aria-label={`${project} funding sources`}
              className={`overflow-hidden rounded-lg border ${checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : partial ? 'border-primary/50 bg-primary/5' : 'border-main-border bg-base-100'}`}
              key={key}
            >
              <div className="px-4 pt-3 pb-2 sm:px-5">
                <div className="flex items-center gap-3">
                  {group.length === 1 && (
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: chartSeriesColor(
                          sources.indexOf(first)
                        ),
                      }}
                    />
                  )}
                  {initialSelection &&
                    first.projectNumber &&
                    group.length > 1 && (
                      <input
                        aria-label={`Include project ${project}`}
                        checked={checked}
                        className="checkbox checkbox-primary checkbox-sm shrink-0 rounded-full"
                        id={`${selectionId}-project-${key}`}
                        onChange={(event) =>
                          toggle(
                            group.map(({ id }) => id),
                            event.target.checked
                          )
                        }
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = partial;
                          }
                        }}
                        type="checkbox"
                      />
                    )}
                  {initialSelection && group.length === 1 && (
                    <input
                      aria-label={`Include ${sourceLabel(first)}`}
                      checked={selected.has(first.id)}
                      className="checkbox checkbox-primary checkbox-sm shrink-0 rounded-full"
                      id={`${selectionId}-source-${first.id}`}
                      onChange={(event) =>
                        toggle([first.id], event.target.checked)
                      }
                      type="checkbox"
                    />
                  )}
                  <div>
                    <h3
                      className="line-clamp-2 min-h-[2lh] text-lg font-semibold leading-snug break-words"
                      title={project}
                    >
                      {initialSelection ? (
                        <label
                          className="cursor-pointer"
                          htmlFor={
                            group.length === 1
                              ? `${selectionId}-source-${first.id}`
                              : `${selectionId}-project-${key}`
                          }
                        >
                          {project}
                        </label>
                      ) : (
                        project
                      )}
                    </h3>
                    {first.projectNumber && (
                      <p className="text-sm text-base-content/80">
                        Project {first.projectNumber} ·{' '}
                        {group.length === 1 && first.taskNumber
                          ? `Task ${first.taskNumber}`
                          : `${group.length} tasks`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div
                aria-label={group.length > 1 ? `${project} tasks` : undefined}
                className={`divide-y divide-main-border ${group.length > 1 ? 'max-h-96 overflow-y-auto' : ''}`}
                role={group.length > 1 ? 'region' : undefined}
                tabIndex={group.length > 1 ? 0 : undefined}
              >
                {visible.map((source) => (
                  <article className="px-4 pb-3 pt-2 sm:px-5" key={source.id}>
                    <div className="space-y-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {group.length > 1 && (
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: chartSeriesColor(
                                sources.indexOf(source)
                              ),
                            }}
                          />
                        )}
                        {initialSelection && group.length > 1 && (
                          <input
                            aria-label={`Include ${sourceLabel(source)}`}
                            checked={selected.has(source.id)}
                            className="checkbox checkbox-primary checkbox-sm shrink-0 rounded-full"
                            id={`${selectionId}-source-${source.id}`}
                            onChange={(event) =>
                              toggle([source.id], event.target.checked)
                            }
                            type="checkbox"
                          />
                        )}
                        <div className="min-w-0">
                          <h4
                            className={
                              source.name === project
                                ? 'sr-only'
                                : 'font-semibold break-words'
                            }
                          >
                            {initialSelection ? (
                              <label
                                className="cursor-pointer"
                                htmlFor={`${selectionId}-source-${source.id}`}
                              >
                                {source.name}
                              </label>
                            ) : (
                              source.name
                            )}
                          </h4>
                          {source.taskNumber &&
                            (group.length > 1 ||
                              (source.taskName &&
                                source.taskName !== source.name &&
                                source.taskName !== project &&
                                source.taskName !== source.taskNumber)) && (
                              <p className="mt-1 text-sm text-base-content/80">
                                {group.length > 1
                                  ? `Task ${source.taskNumber}`
                                  : ''}
                                {source.taskName &&
                                source.taskName !== source.name &&
                                source.taskName !== project &&
                                source.taskName !== source.taskNumber
                                  ? `${group.length > 1 ? ' · ' : ''}${source.taskName}`
                                  : ''}
                              </p>
                            )}
                          <p className="mt-1 text-sm text-base-content/80">
                            {source.startDate && source.endDate
                              ? `${source.startDate} to ${source.endDate}`
                              : source.startDate
                                ? `From ${source.startDate}`
                                : source.endDate
                                  ? `Through ${source.endDate}`
                                  : 'No date limits'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end justify-between gap-2 border-t border-main-border/70 pt-3">
                        <p className="text-sm text-base-content/80">
                          Planning balance{' '}
                          <span className="mt-0.5 block text-xl font-semibold text-base-content tabular-nums">
                            {formatCurrency(sourcePlanningBalance(source))}
                          </span>
                        </p>
                        <button
                          aria-label={`Edit ${sourceLabel(source)}`}
                          className="btn btn-ghost btn-sm px-2 text-primary"
                          onClick={() => onEdit(source.id)}
                          type="button"
                        >
                          <PencilSquareIcon
                            aria-hidden="true"
                            className="size-4"
                          />
                          Edit details
                        </button>
                        {!initialSelection && (
                          <button
                            aria-label={`Remove ${sourceLabel(source)}`}
                            className="btn btn-ghost btn-sm"
                            onClick={() => onRemove(source.id)}
                            type="button"
                          >
                            <TrashIcon aria-hidden="true" className="size-4" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {source.sourceKind === 'Planned' ? (
                      <p className="mt-2 text-sm text-base-content/60">
                        Planned funding
                      </p>
                    ) : (
                      <details className="mt-2 text-sm text-base-content/60">
                        <summary className="cursor-pointer">
                          Captured funding details
                        </summary>
                        <p className="mt-1">
                          Captured {source.capturedAt.slice(0, 10)} · Captured
                          balance{' '}
                          {formatCurrency(sourceCapturedBalance(source))}
                        </p>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="mt-4">
          {sources.length === 0
            ? 'No funding sources in this plan.'
            : 'No matching funding sources.'}
        </p>
      )}
    </div>
  );
}
