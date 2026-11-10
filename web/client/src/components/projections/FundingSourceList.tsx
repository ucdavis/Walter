import { useState } from 'react';
import { FundingSourceCard } from '@/components/projections/FundingSourceCard.tsx';
import type { ProjectionFundingSource } from '@/queries/projections.ts';

/** Captured project numbers group sources even when editable names change. */
export function FundingSourceList({
  onEdit,
  onRemove,
  sources,
}: {
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
  sources: ProjectionFundingSource[];
}) {
  const [search, setSearch] = useState('');
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
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  const shown = [...groups.entries()]
    .map(([key, group]) => ({ group, key, visible: group.filter(matches) }))
    .filter(({ visible }) => visible.length > 0);
  const card = (source: ProjectionFundingSource, grouped: boolean) => (
    <FundingSourceCard
      colorIndex={sources.indexOf(source)}
      grouped={grouped}
      key={source.id}
      onEdit={onEdit}
      onRemove={onRemove}
      source={source}
    />
  );
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
      <div className="mt-5 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(({ group, key, visible }) => {
          if (group.length === 1) {
            return card(group[0], false);
          }
          const project = group[0].projectName ?? group[0].projectNumber;
          return (
            <section
              aria-label={`${project} funding sources`}
              className="min-w-0 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:col-span-2 xl:col-span-3"
              key={key}
            >
              <h3 className="font-semibold break-words">{project}</h3>
              <p className="mt-1 text-sm text-base-content/70">
                Project {group[0].projectNumber} · {group.length} tasks
              </p>
              <div
                aria-label={`${project} tasks`}
                className="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3"
                role="region"
              >
                {visible.map((source) => card(source, true))}
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
