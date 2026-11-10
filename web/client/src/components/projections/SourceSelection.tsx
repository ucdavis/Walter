import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import type { SourceEditorHandle } from '@/components/projections/SourceEditor.tsx';

export interface SourceSelectionChoice {
  disabled?: boolean;
  key: string;
  label: string;
  projectName: string | null;
  projectNumber: string | null;
  searchText?: string;
  taskName?: string | null;
  taskNumber?: string | null;
}

/** Search narrows results, never the tasks included by a project action. */
export function SourceSelection({
  choices,
  onChange,
  ref,
  renderSource,
  selected,
}: {
  choices: SourceSelectionChoice[];
  onChange: (keys: string[]) => void;
  ref?: Ref<SourceEditorHandle>;
  renderSource?: (choice: SourceSelectionChoice, grouped: boolean) => ReactNode;
  selected: string[];
}) {
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const taskOpener = useRef<HTMLElement | null>(null);
  const returnTaskFocus = useCallback(
    () =>
      taskOpener.current?.isConnected
        ? taskOpener.current
        : searchInput.current,
    []
  );
  const [changing, setChanging] = useState<{
    key: string;
    keys: string[];
  } | null>(null);
  useImperativeHandle(ref, () => ({
    read: () => ({
      fundingSourceId: null,
      hasChanges: changing !== null,
      kind: 'source',
      validationMessage: null,
    }),
  }));
  const selectedKeys = new Set(selected);
  const groups = new Map<string, SourceSelectionChoice[]>();
  for (const choice of choices) {
    const key = choice.projectNumber
      ? `project:${choice.projectNumber}`
      : `planned:${choice.key}`;
    groups.set(key, [...(groups.get(key) ?? []), choice]);
  }
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (values: (string | null | undefined)[]) => {
    const text = values.filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  };
  const results =
    terms.length === 0
      ? []
      : [...groups.entries()].filter(([, group]) =>
          group.some((choice) =>
            matches([
              choice.label,
              choice.projectName,
              choice.projectNumber,
              choice.taskName,
              choice.taskNumber,
              choice.searchText,
            ])
          )
        );
  function toggle(group: SourceSelectionChoice[], checked: boolean) {
    const next = new Set(selected);
    for (const choice of group) {
      if (!choice.disabled) {
        if (checked) {
          next.add(choice.key);
        } else {
          next.delete(choice.key);
        }
      }
    }
    onChange([...next]);
  }
  return (
    <div className="space-y-5">
      <label className="flex flex-col gap-2 text-sm">
        Search funding sources
        <input
          className="input input-bordered w-full"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Project, task, name, or number"
          ref={searchInput}
          type="search"
          value={search}
        />
      </label>
      {terms.length === 0 ? (
        <p className="text-sm text-base-content/70">
          Search to add a project or an individual task.
        </p>
      ) : (
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {results.length === 0 && <p>No matching funding sources.</p>}
          {results.map(([key, group]) => {
            const first = group[0];
            const project =
              first.projectName ?? first.projectNumber ?? first.label;
            const projectMatch = matches([
              first.projectName,
              first.projectNumber,
            ]);
            const available = group.filter(
              (choice) => !choice.disabled && !selectedKeys.has(choice.key)
            );
            const taskMatches = group.filter((choice) =>
              matches([
                choice.label,
                choice.projectName,
                choice.projectNumber,
                choice.taskName,
                choice.taskNumber,
                choice.searchText,
              ])
            );
            return (
              <section
                aria-label={`${project} search results`}
                className="rounded-lg border border-base-300 p-4"
                key={key}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 break-words">
                    <h3 className="font-semibold">{project}</h3>
                    <p className="text-sm text-base-content/70">
                      {first.projectNumber &&
                        `Project ${first.projectNumber} · `}
                      {group.length} {group.length === 1 ? 'task' : 'tasks'}
                    </p>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={available.length === 0}
                    onClick={() => {
                      toggle(group, true);
                      setSearch('');
                      searchInput.current?.focus();
                    }}
                    type="button"
                  >
                    {available.length === 0
                      ? 'Already included'
                      : group.length === 1
                        ? projectMatch || !first.taskNumber
                          ? 'Add source'
                          : 'Add this task'
                        : available.length < group.length
                          ? `Add remaining ${available.length} ${available.length === 1 ? 'task' : 'tasks'}`
                          : `Add all ${group.length} tasks`}
                  </button>
                </div>
                {!projectMatch && group.length > 1 && (
                  <div className="mt-3 space-y-2 border-t border-base-300 pt-3">
                    {taskMatches.map((choice) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2"
                        key={choice.key}
                      >
                        <span className="min-w-0 flex-1 break-words text-sm">
                          Task {choice.taskNumber}{' '}
                          {choice.taskName && `· ${choice.taskName}`}
                        </span>
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={
                            choice.disabled || selectedKeys.has(choice.key)
                          }
                          onClick={() => {
                            toggle([choice], true);
                            setSearch('');
                            searchInput.current?.focus();
                          }}
                          type="button"
                        >
                          {choice.disabled || selectedKeys.has(choice.key)
                            ? 'Already included'
                            : 'Add this task'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <div className="space-y-3">
        <p className="text-sm font-semibold" role="status">
          {selected.length} funding{' '}
          {selected.length === 1 ? 'source' : 'sources'} selected
        </p>
        {selected.length === 0 && (
          <p className="text-sm text-base-content/70">
            No funding sources selected yet.
          </p>
        )}
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...groups.entries()].map(([key, group]) => {
            const included = group.filter((choice) =>
              selectedKeys.has(choice.key)
            );
            if (included.length === 0) {
              return null;
            }
            const first = group[0];
            const project =
              first.projectName ?? first.projectNumber ?? first.label;
            const card = (choice: SourceSelectionChoice, grouped: boolean) =>
              renderSource ? (
                renderSource(choice, grouped)
              ) : (
                <article
                  aria-label={`${choice.label} funding source`}
                  className="min-w-0 rounded-lg border border-base-300 bg-base-100 p-4"
                  key={choice.key}
                >
                  <h3 className="font-semibold break-words">
                    {grouped
                      ? choice.taskName &&
                        choice.taskName !== choice.projectName &&
                        choice.taskName !== choice.taskNumber
                        ? choice.taskName
                        : `Task ${choice.taskNumber ?? ''}`
                      : (choice.projectName ?? choice.label)}
                  </h3>
                  {(!grouped ||
                    (choice.taskName &&
                      choice.taskName !== choice.projectName &&
                      choice.taskName !== choice.taskNumber)) && (
                    <p className="mt-1 text-sm text-base-content/70">
                      {!grouped &&
                        choice.projectNumber &&
                        `Project ${choice.projectNumber} · `}
                      {choice.taskNumber && `Task ${choice.taskNumber}`}
                    </p>
                  )}
                  <button
                    aria-label={`Remove ${choice.label}`}
                    className="btn btn-ghost btn-sm mt-2"
                    onClick={() => {
                      toggle([choice], false);
                      searchInput.current?.focus();
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </article>
              );
            if (group.length === 1) {
              return card(first, false);
            }
            return (
              <section
                aria-label={`${project} selected funding`}
                className="min-w-0 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:col-span-2 xl:col-span-3"
                key={key}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 break-words">
                    <h3 className="font-semibold">{project}</h3>
                    <p className="mt-1 text-sm text-base-content/70">
                      Project {first.projectNumber} ·{' '}
                      {included.length === group.length
                        ? `All ${group.length} tasks`
                        : `${included.length} of ${group.length} tasks`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(event) => {
                        taskOpener.current = event.currentTarget;
                        setChanging({
                          key,
                          keys: included.map((choice) => choice.key),
                        });
                      }}
                      type="button"
                    >
                      Change tasks
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        toggle(group, false);
                        searchInput.current?.focus();
                      }}
                      type="button"
                    >
                      Remove project
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {included.map((choice) => card(choice, true))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {changing && (
        <ProjectionDialog
          onClose={() => setChanging(null)}
          returnFocusTo={returnTaskFocus}
          title={`Change tasks for ${groups.get(changing.key)?.[0].projectName ?? groups.get(changing.key)?.[0].projectNumber}`}
        >
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setChanging({
                  ...changing,
                  keys: (groups.get(changing.key) ?? [])
                    .filter((choice) => !choice.disabled)
                    .map((choice) => choice.key),
                })
              }
              type="button"
            >
              Select all tasks
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setChanging({ ...changing, keys: [] })}
              type="button"
            >
              Clear all
            </button>
          </div>
          <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
            {(groups.get(changing.key) ?? []).map((choice) => (
              <label
                className="flex items-start gap-3 text-sm"
                key={choice.key}
              >
                <input
                  aria-label={`Include ${choice.label}`}
                  checked={
                    choice.disabled || changing.keys.includes(choice.key)
                  }
                  className="checkbox checkbox-primary checkbox-sm shrink-0"
                  disabled={choice.disabled}
                  onChange={(event) =>
                    setChanging({
                      ...changing,
                      keys: event.target.checked
                        ? [...changing.keys, choice.key]
                        : changing.keys.filter((key) => key !== choice.key),
                    })
                  }
                  type="checkbox"
                />
                <span className="min-w-0 break-words">
                  {choice.taskNumber
                    ? `Task ${choice.taskNumber}${choice.taskName ? ` · ${choice.taskName}` : ''}`
                    : choice.label}
                  {choice.disabled && ' · Already included'}
                </span>
              </label>
            ))}
          </div>
          <div className="modal-action">
            <button
              className="btn btn-ghost"
              onClick={() => setChanging(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const groupKeys = new Set(
                  (groups.get(changing.key) ?? []).map((choice) => choice.key)
                );
                onChange([
                  ...selected.filter((key) => !groupKeys.has(key)),
                  ...changing.keys,
                ]);
                setChanging(null);
              }}
              type="button"
            >
              Apply
            </button>
          </div>
        </ProjectionDialog>
      )}
    </div>
  );
}
