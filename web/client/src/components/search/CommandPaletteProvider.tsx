import { useDebouncedValue } from '@/lib/useDebouncedValue.ts';
import {
  type SearchCatalog,
  type SearchPerson,
  type SearchProject,
  type SearchReport,
  usePeopleSearchQuery,
  useSearchCatalogQuery,
} from '@/queries/search.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type CommandPaletteContextValue = {
  close: () => void;
  open: () => void;
  toggle: () => void;
};

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      'useCommandPalette must be used within a CommandPaletteProvider'
    );
  }
  return context;
}

type SearchCategory = 'Projects' | 'Reports' | 'People';

type SearchItem = {
  category: SearchCategory;
  id: string;
  keywords: string[];
  label: string;
  params?: Record<string, string>;
  secondary?: string;
  to: string;
};

/**
 * Normalizes a string for case- and diacritic-insensitive matching (e.g., search).
 *
 * Applies Unicode NFKD normalization, removes combining diacritic marks, lowercases,
 * and trims surrounding whitespace.
 *
 */
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const scoreMatch = (text: string, tokens: string[]) => {
  if (!tokens.length) {
    return 1;
  }
  let score = 0;
  for (const token of tokens) {
    const idx = text.indexOf(token);
    if (idx === -1) {
      return 0;
    }
    score += idx === 0 ? 3 : 1;
  }
  return score;
};

const filterAndSort = <T extends { keywords: string[]; label: string }>(
  items: T[],
  query: string
) => {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    return items;
  }

  return items
    .map((item) => {
      const haystack = normalize([item.label, ...item.keywords].join(' '));
      return { item, score: scoreMatch(haystack, tokens) };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label)
    )
    .map((x) => x.item);
};

const projectToItem = (
  project: SearchProject,
  employeeId: string
): SearchItem => ({
  category: 'Projects',
  id: `project:${project.projectNumber}`,
  keywords: project.keywords,
  label: project.projectName,
  params: { employeeId, projectNumber: project.projectNumber },
  secondary: project.projectNumber,
  to: '/projects/$employeeId/$projectNumber/',
});

const reportToItem = (report: SearchReport): SearchItem => ({
  category: 'Reports',
  id: `report:${report.id}`,
  keywords: report.keywords,
  label: report.label,
  to: report.to,
});

const personToItem = (person: SearchPerson): SearchItem => ({
  category: 'People',
  id: `person:${person.employeeId}`,
  keywords: person.keywords,
  label: person.name,
  params: { employeeId: person.employeeId },
  secondary: person.employeeId,
  to: '/projects/$employeeId/',
});

function CommandPaletteDialog({
  dialogRef,
  isOpen,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  isOpen: boolean;
  onClose: () => void;
}) {
  const user = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [paletteKey, setPaletteKey] = useState(0);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fetch 'catalog' data when opened - this will be stuff not dependent on the query
  // so for now, projects and reports
  const catalogQuery = useSearchCatalogQuery({ enabled: isOpen });

  // Fetch people search results based on the query
  // This is assuming we are searching on all people. If we only want to search on PIs, we can add to catalog
  const peopleQuery = usePeopleSearchQuery({
    enabled: isOpen && debouncedQuery.trim().length > 0,
    query: debouncedQuery,
  });

  const catalog: SearchCatalog | undefined = catalogQuery.data;

  const projects = useMemo(() => {
    const raw = (catalog?.projects ?? []).map((p) =>
      projectToItem(p, user.employeeId)
    );
    return filterAndSort(raw, query);
  }, [catalog?.projects, query, user.employeeId]);

  const reports = useMemo(() => {
    const raw = (catalog?.reports ?? []).map(reportToItem);
    return filterAndSort(raw, query);
  }, [catalog?.reports, query]);

  const people = useMemo(() => {
    const raw = (peopleQuery.data ?? []).map(personToItem);
    return filterAndSort(raw, query);
  }, [peopleQuery.data, query]);

  const isCatalogLoading = catalogQuery.isPending;
  const isPeopleLoading = peopleQuery.isFetching;

  const hasAnyResults = projects.length + reports.length + people.length > 0;
  const showEmptyState =
    !isCatalogLoading &&
    !isPeopleLoading &&
    query.trim().length > 0 &&
    !hasAnyResults;

  const closeAndReset = useCallback(() => {
    setQuery('');
    setPaletteKey((k) => k + 1);
    queryClient.removeQueries({ queryKey: ['search', 'people'] });
    onClose();
  }, [onClose, queryClient]);

  // Focus the input when opened, using requestAnimationFrame to ensure it's visible
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  const onSelectItem = useCallback(
    (item: SearchItem) => {
      navigate({ params: item.params, to: item.to });
      dialogRef.current?.close();
    },
    [dialogRef, navigate]
  );

  return (
    <dialog className="modal" onClose={closeAndReset} ref={dialogRef}>
      <div className="modal-box w-full max-w-3xl p-2">
        <Command
          className="w-full"
          key={paletteKey}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              dialogRef.current?.close();
            }
          }}
          shouldFilter={false}
        >
          <div className="p-3">
            <Command.Input
              className="input input-bordered w-full"
              onValueChange={setQuery}
              placeholder="Search projects, reports, people..."
              ref={inputRef}
              value={query}
            />
          </div>

          <Command.List>
            {isCatalogLoading ? (
              <>
                <Command.Group heading="Projects">
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading projects…</span>
                    </div>
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Reports">
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading reports…</span>
                    </div>
                  </Command.Item>
                </Command.Group>
              </>
            ) : null}

            {!isCatalogLoading && projects.length ? (
              <Command.Group heading="Projects">
                {projects.map((item) => (
                  <Command.Item
                    key={item.id}
                    onSelect={() => onSelectItem(item)}
                    value={item.id}
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate">{item.label}</div>
                        {item.secondary ? (
                          <div className="truncate text-xs text-base-content/60">
                            {item.secondary}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {!isCatalogLoading && reports.length ? (
              <Command.Group heading="Reports">
                {reports.map((item) => (
                  <Command.Item
                    key={item.id}
                    onSelect={() => onSelectItem(item)}
                    value={item.id}
                  >
                    <div className="flex w-full items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate">{item.label}</div>
                      </div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {query.trim().length > 0 ? (
              <Command.Group heading="People">
                {isPeopleLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Searching people…</span>
                    </div>
                  </Command.Item>
                ) : null}

                {!isPeopleLoading && people.length
                  ? people.map((item) => (
                      <Command.Item
                        key={item.id}
                        onSelect={() => onSelectItem(item)}
                        value={item.id}
                      >
                        <div className="flex w-full items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate">{item.label}</div>
                            {item.secondary ? (
                              <div className="truncate text-xs text-base-content/60">
                                {item.secondary}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </Command.Item>
                    ))
                  : null}
              </Command.Group>
            ) : null}

            {showEmptyState ? (
              <div className="px-4 py-8 text-sm text-base-content/60">
                No matches found.
              </div>
            ) : null}
          </Command.List>
        </Command>
      </div>

      <form className="modal-backdrop" method="dialog">
        <button aria-label="Close command palette" />
      </form>
    </dialog>
  );
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }
    dialog.showModal();
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.open) {
      return;
    }
    dialog.close();
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.showModal();
    }
    setIsOpen(dialog.open);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const contextValue = useMemo(
    () => ({ close, open, toggle }),
    [close, open, toggle]
  );

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPaletteDialog
        dialogRef={dialogRef}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </CommandPaletteContext.Provider>
  );
}
