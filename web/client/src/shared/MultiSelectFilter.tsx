import { useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import {
  CheckIcon,
  ChevronUpDownIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';

export interface FilterOption {
  /** Optional group heading; options sharing a group render under one heading. */
  group?: string;
  /** Small muted suffix shown right-aligned, e.g. "L1 rollup". */
  hint?: string;
  label: string;
  value: string;
}

interface MultiSelectFilterProps {
  disabled?: boolean;
  emptyText?: string;
  loading?: boolean;
  /** Single-select when false: picking a value replaces the selection and closes. */
  multiple?: boolean;
  onChange: (values: string[]) => void;
  options: FilterOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  selected: string[];
}

/**
 * Searchable dropdown with type-ahead and removable chips. daisyUI styling for the
 * look, cmdk for the search/filter/keyboard behavior, floating-ui for positioning.
 * Used by the department-balances filter panel for both single (department) and
 * multi (fund/activity/etc.) facets.
 */
export function MultiSelectFilter({
  disabled = false,
  emptyText = 'No matches',
  loading = false,
  multiple = true,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  selected,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    context,
    floatingStyles,
    refs: { setFloating, setReference },
  } = useFloating({
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ elements, rects }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
          });
        },
        padding: 8,
      }),
    ],
    onOpenChange: setOpen,
    open,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'listbox' });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const labelFor = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  const toggle = (value: string) => {
    if (!multiple) {
      onChange(selectedSet.has(value) ? [] : [value]);
      setOpen(false);
      return;
    }
    onChange(
      selectedSet.has(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const remove = (value: string) =>
    onChange(selected.filter((v) => v !== value));

  const groups = useMemo(() => {
    const map = new Map<string, FilterOption[]>();
    for (const opt of options) {
      const key = opt.group ?? '';
      (map.get(key) ?? map.set(key, []).get(key)!).push(opt);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <>
      <div
        aria-disabled={disabled}
        className={`flex min-h-10 w-full flex-wrap items-center gap-1 rounded-lg border border-base-300 bg-base-100 px-2 py-1.5 text-sm ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${open ? 'ring-2 ring-primary' : ''}`}
        ref={setReference}
        {...getReferenceProps()}
      >
        {selected.length === 0 ? (
          <span className="text-base-content/50">
            {loading ? 'Loading…' : placeholder}
          </span>
        ) : (
          selected.map((v) => (
            <span
              className="badge badge-primary badge-soft max-w-full gap-1"
              key={v}
            >
              <span className="truncate">{labelFor(v)}</span>
              {!disabled ? (
                <button
                  aria-label={`Remove ${labelFor(v)}`}
                  className="hover:text-primary-content/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(v);
                  }}
                  type="button"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))
        )}
        <ChevronUpDownIcon className="ml-auto h-4 w-4 shrink-0 text-base-content/50" />
      </div>

      {open ? (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            initialFocus={inputRef}
            modal={false}
          >
            <div
              className="z-50 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-lg"
              ref={setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <Command className="flex max-h-80 flex-col" loop>
                <div className="border-b border-base-200 p-2">
                  <Command.Input
                    className="input input-sm input-bordered w-full"
                    placeholder={searchPlaceholder}
                    ref={inputRef}
                  />
                </div>
                <Command.List className="overflow-y-auto p-1">
                  <Command.Empty className="px-2 py-4 text-center text-sm text-base-content/60">
                    {emptyText}
                  </Command.Empty>
                  {groups.map(([group, opts]) => (
                    <Command.Group
                      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-base-content/60"
                      heading={group || undefined}
                      key={group || 'default'}
                    >
                      {opts.map((opt) => {
                        const isSelected = selectedSet.has(opt.value);
                        return (
                          <Command.Item
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm data-[selected=true]:bg-base-200"
                            key={opt.value}
                            onSelect={() => toggle(opt.value)}
                            value={`${opt.value}::${opt.label}`}
                          >
                            <CheckIcon
                              className={`h-4 w-4 shrink-0 text-primary ${
                                isSelected ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            <span className="truncate">{opt.label}</span>
                            {opt.hint ? (
                              <span className="ml-auto shrink-0 text-xs text-base-content/50">
                                {opt.hint}
                              </span>
                            ) : null}
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ))}
                </Command.List>
              </Command>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}
