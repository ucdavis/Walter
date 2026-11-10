import { useId, useState } from 'react';
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
      <label className="flex flex-col gap-1 text-sm">
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
        <p className="mt-2 text-sm">
          Select the tasks to include. Project checkboxes select every task in
          that project, including tasks hidden by search.
        </p>
      )}
      <div className="mt-4 space-y-4">
        {shown.map(({ group, key, visible }) => {
          const first = group[0];
          const project =
            first.projectName ?? first.projectNumber ?? 'Planned funding';
          const checked = group.every(({ id }) => selected.has(id));
          const partial = !checked && group.some(({ id }) => selected.has(id));
          return (
            <section
              aria-label={`${project} funding sources`}
              className="rounded-box border border-base-300"
              key={key}
            >
              <div className="rounded-t-box bg-base-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  {initialSelection && first.projectNumber && (
                    <input
                      aria-label={`Include project ${project}`}
                      checked={checked}
                      className="checkbox checkbox-sm"
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
                  <div>
                    <h3 className="font-bold">
                      {initialSelection && first.projectNumber ? (
                        <label
                          className="cursor-pointer"
                          htmlFor={`${selectionId}-project-${key}`}
                        >
                          {project}
                        </label>
                      ) : (
                        project
                      )}
                    </h3>
                    {first.projectNumber && (
                      <p className="text-sm">
                        Project {first.projectNumber} · {group.length}{' '}
                        {group.length === 1 ? 'task' : 'tasks'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="divide-y divide-base-300">
                {visible.map((source) => (
                  <article className="px-4 py-3" key={source.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {initialSelection && (
                          <input
                            aria-label={`Include ${sourceLabel(source)}`}
                            checked={selected.has(source.id)}
                            className="checkbox checkbox-sm shrink-0"
                            id={`${selectionId}-source-${source.id}`}
                            onChange={(event) =>
                              toggle([source.id], event.target.checked)
                            }
                            type="checkbox"
                          />
                        )}
                        <div className="min-w-0">
                          <h4 className="font-semibold break-words">
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
                          {source.taskNumber && (
                            <p className="mt-1 text-sm">
                              Task {source.taskNumber}
                              {source.taskName &&
                              source.taskName !== source.name
                                ? ` · ${source.taskName}`
                                : ''}
                            </p>
                          )}
                          <p className="mt-1 text-sm">
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
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm">
                          Planning balance{' '}
                          <span className="font-semibold">
                            {formatCurrency(sourcePlanningBalance(source))}
                          </span>
                        </p>
                        <button
                          aria-label={`Edit ${sourceLabel(source)}`}
                          className="btn btn-outline btn-sm"
                          onClick={() => onEdit(source.id)}
                          type="button"
                        >
                          Edit
                        </button>
                        {!initialSelection && (
                          <button
                            aria-label={`Remove ${sourceLabel(source)}`}
                            className="btn btn-ghost btn-sm"
                            onClick={() => onRemove(source.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {source.sourceKind === 'Planned' ? (
                      <p className="mt-2 text-sm">Planned funding</p>
                    ) : (
                      <details className="mt-2 text-sm">
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
