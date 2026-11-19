import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useId, useState, type ReactNode } from 'react';
import { formatProjectionCurrency } from '@/components/projections/projectionFormatting.ts';
export interface SourceSelectionChoice {
  balance?: number;
  disabled?: boolean;
  key: string;
  label: string;
  projectName: string | null;
  projectNumber: string | null;
  projectType?: string | null;
  searchText?: string;
  taskName?: string | null;
  taskNumber?: string | null;
}

/** Project actions always affect the complete project, including tasks hidden by search. */
export function SourceSelectionRows({
  choices,
  onChange,
  renderDetails,
  selected,
}: {
  choices: SourceSelectionChoice[];
  onChange: (keys: string[]) => void;
  renderDetails?: (choice: SourceSelectionChoice) => ReactNode;
  selected: string[];
}) {
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const id = useId();
  const selectedKeys = new Set(selected);
  const groups = new Map<string, SourceSelectionChoice[]>();
  for (const choice of choices) {
    const key = choice.projectNumber ?? choice.key;
    groups.set(key, [...(groups.get(key) ?? []), choice]);
  }
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  function matches(choice: SourceSelectionChoice) {
    const text = [
      choice.label,
      choice.projectName,
      choice.projectNumber,
      choice.taskName,
      choice.taskNumber,
      choice.searchText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  }
  function toggle(group: SourceSelectionChoice[], checked: boolean) {
    const next = new Set(selected);
    for (const choice of group) {
      if (choice.disabled) {
        continue;
      }
      if (checked) {
        next.add(choice.key);
      } else {
        next.delete(choice.key);
      }
    }
    onChange([...next]);
  }
  const visibleGroups = [...groups]
    .map(([key, group]) => ({
      group,
      key,
      visible: group.filter(
        (choice) =>
          matches(choice) && (!selectedOnly || selectedKeys.has(choice.key))
      ),
    }))
    .filter(({ visible }) => visible.length > 0);
  const projectCount = [...groups.values()].filter((group) =>
    group.some((choice) => selectedKeys.has(choice.key))
  ).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-main-border pb-4">
        <label className="input flex min-w-0 flex-1 items-center gap-2">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-base-content/80"
          />
          <input
            aria-label="Search funding sources"
            className="min-w-0 grow"
            onChange={(event) => {
              setSearch(event.target.value);
              setCollapsed(new Set());
            }}
            placeholder="Search by project name, project number, task name or task code"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="Funding source view" className="join" role="group">
          <button
            aria-pressed={!selectedOnly}
            className={`btn btn-sm join-item ${!selectedOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedOnly(false)}
            type="button"
          >
            Browse all
          </button>
          <button
            aria-pressed={selectedOnly}
            className={`btn btn-sm join-item ${selectedOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedOnly(true)}
            type="button"
          >
            Selected · {selected.length}
          </button>
        </div>
      </div>
      <div className="max-h-[65dvh] overflow-y-auto overscroll-contain">
        {visibleGroups.length === 0 && (
          <p
            className="px-4 py-8 text-center text-sm text-base-content/80"
            role="status"
          >
            {selectedOnly && selected.length === 0
              ? 'No funding sources selected.'
              : 'No matching funding sources.'}
          </p>
        )}
        {visibleGroups.map(({ group, key, visible }, index) => {
          const first = group[0];
          const name = first.projectName ?? first.projectNumber ?? first.label;
          const available = group.filter((choice) => !choice.disabled);
          const count = available.filter((choice) =>
            selectedKeys.has(choice.key)
          ).length;
          const allSelected =
            available.length > 0 && count === available.length;
          const hasTasks = group.length > 1;
          const expanded = !collapsed.has(key);
          const tasksId = `${id}-${index}`;
          return (
            <section
              aria-label={`${name} funding sources`}
              className={`border-b border-main-border ${count > 0 ? 'bg-primary/5' : ''}`}
              key={key}
            >
              <div className="flex flex-wrap items-center gap-3 px-3 py-4">
                <input
                  aria-label={`Include all sources for ${name}`}
                  checked={allSelected}
                  className="checkbox checkbox-sm mt-0.5 shrink-0"
                  disabled={available.length === 0}
                  onChange={(event) => toggle(group, event.target.checked)}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = count > 0 && !allSelected;
                    }
                  }}
                  type="checkbox"
                />
                <div className="min-w-40 flex-1">
                  <h3 className="text-sm font-semibold break-words">{name}</h3>
                  <p className="mt-1 text-xs text-base-content/80">
                    <span
                      className={
                        first.projectType === 'Internal'
                          ? 'text-accent'
                          : first.projectType
                            ? 'text-info'
                            : undefined
                      }
                    >
                      {first.projectNumber}
                    </span>
                    {!hasTasks &&
                      first.taskNumber &&
                      ` · ${first.taskName || 'Task'} · ${first.taskNumber}`}
                    {available.length === 0 && ' · Already included'}
                    {!hasTasks &&
                      ` · ${first.projectNumber ? '1 task' : 'Planned funding'}`}
                  </p>
                </div>
                {hasTasks ? (
                  <button
                    aria-controls={tasksId}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} tasks for ${name}`}
                    className="btn btn-ghost btn-sm shrink-0 gap-2"
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (expanded) {
                          next.add(key);
                        } else {
                          next.delete(key);
                        }
                        return next;
                      })
                    }
                    type="button"
                  >
                    {count} of {group.length} tasks
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={`size-4 ${expanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                ) : (
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                    {first.balance !== undefined && (
                      <span
                        className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${first.balance < 0 ? 'text-error' : ''}`}
                      >
                        {formatProjectionCurrency(first.balance)}
                      </span>
                    )}
                    {renderDetails && renderDetails(first)}
                  </div>
                )}
              </div>
              {hasTasks && expanded && (
                <div className="pb-3 pl-10 pr-3" id={tasksId}>
                  <div className="mb-2 flex gap-4 text-xs">
                    <button
                      className="link link-primary"
                      disabled={available.length === 0}
                      onClick={() => toggle(group, true)}
                      type="button"
                    >
                      Select all {group.length}
                    </button>
                    <button
                      className="link link-primary"
                      disabled={count === 0}
                      onClick={() => toggle(group, false)}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                  <ul className="divide-y divide-main-border">
                    {visible.map((choice) => (
                      <li
                        className="flex flex-wrap items-center"
                        key={choice.key}
                      >
                        <label
                          className={`flex min-w-40 flex-1 cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-base-200 ${selectedKeys.has(choice.key) ? 'bg-primary/5' : ''} ${choice.disabled ? 'cursor-default text-base-content/80' : ''}`}
                        >
                          <input
                            aria-label={`Include ${choice.label}`}
                            checked={
                              choice.disabled || selectedKeys.has(choice.key)
                            }
                            className="checkbox checkbox-sm shrink-0"
                            disabled={choice.disabled}
                            onChange={(event) =>
                              toggle([choice], event.target.checked)
                            }
                            type="checkbox"
                          />
                          <span className="min-w-0 flex-1 break-words">
                            {choice.taskName || choice.label}
                            {choice.disabled && (
                              <span className="ml-2 text-xs">
                                Already included
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-base-content/80">
                            {choice.taskNumber}
                          </span>
                        </label>
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-3 py-1 pl-3">
                          {choice.balance !== undefined && (
                            <span
                              className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${choice.balance < 0 ? 'text-error' : ''}`}
                            >
                              {formatProjectionCurrency(choice.balance)}
                            </span>
                          )}
                          {renderDetails && renderDetails(choice)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-main-border pt-4 text-sm">
        <p className="font-semibold" role="status">
          {selected.length} {selected.length === 1 ? 'source' : 'sources'}{' '}
          across {projectCount} {projectCount === 1 ? 'project' : 'projects'}
        </p>
        <button
          className="link link-primary"
          disabled={
            !choices.some(
              (choice) => !choice.disabled && !selectedKeys.has(choice.key)
            )
          }
          onClick={() => toggle(choices, true)}
          type="button"
        >
          Select all
        </button>
        <button
          className="link link-primary"
          disabled={selected.length === 0}
          onClick={() => toggle(choices, false)}
          type="button"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
