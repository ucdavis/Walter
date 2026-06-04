import {
  type SearchCatalog,
  type SearchDirectoryPerson,
  type SearchPerson,
  type SearchProject,
  type SearchReport,
  useSearchCatalogQuery,
  useSearchDirectoryPeopleQuery,
  useSearchFinancialProjectsQuery,
  useSearchTeamMemberProjectsQuery,
} from '@/queries/search.ts';
import { canViewFinancials } from '@/components/search/searchAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { useDebouncedValue } from '@/lib/useDebouncedValue.ts';
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
import {
  AcademicCapIcon,
  UsersIcon,
  ClipboardDocumentCheckIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline';

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

type SearchCategory = 'Projects' | 'Reports' | 'PIs' | 'People';
const MAX_SEARCH_RESULTS = 5;

type NavigateSearchItem = {
  category: SearchCategory;
  id: string;
  keywords: string[];
  kind: 'navigate';
  label: string;
  params?: Record<string, string>;
  secondary?: string;
  to: string;
};

type ResolvePersonSearchItem = {
  category: 'People';
  iamId: string;
  id: string;
  isProjectManager: boolean;
  keywords: string[];
  kind: 'person';
  label: string;
  secondary?: string;
};

type SearchItem = NavigateSearchItem | ResolvePersonSearchItem;

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
  currentIamId: string,
  financialSearch: boolean
): NavigateSearchItem => {
  if (financialSearch) {
    return {
      category: 'Projects',
      id: `project:${project.projectNumber}`,
      keywords: project.keywords,
      kind: 'navigate',
      label: project.projectName,
      params: {
        projectNumber: project.projectNumber,
      },
      secondary: project.projectNumber,
      to: '/projects/by-number/$projectNumber',
    };
  }

  return {
    category: 'Projects',
    id: `project:${project.projectNumber}`,
    keywords: project.keywords,
    kind: 'navigate',
    label: project.projectName,
    params: {
      iamId: project.projectPiIamId ?? currentIamId,
      projectNumber: project.projectNumber,
    },
    secondary: project.projectNumber,
    to: '/projects/$iamId/$projectNumber/',
  };
};

const reportToItem = (report: SearchReport): NavigateSearchItem => ({
  category: 'Reports',
  id: `report:${report.id}`,
  keywords: report.keywords,
  kind: 'navigate',
  label: report.label,
  to: report.to,
});

const principalInvestigatorToItem = (
  person: SearchPerson
): NavigateSearchItem => ({
  category: 'PIs',
  id: `pi:${person.iamId}`,
  keywords: person.keywords,
  kind: 'navigate',
  label: person.name,
  params: { iamId: person.iamId },
  to: '/projects/$iamId/',
});

const directoryPersonToItem = (
  person: SearchDirectoryPerson
): ResolvePersonSearchItem => ({
  category: 'People',
  iamId: person.iamId,
  id: `person:${person.iamId}`,
  isProjectManager: person.isProjectManager,
  keywords: person.keywords,
  kind: 'person',
  label: person.name,
  secondary: person.email ?? undefined,
});

const sectionHeading = (label: string) => {
  const getIcon = (label: string) => {
    switch (label) {
      case 'My Projects':
        return <ClipboardDocumentCheckIcon className="w-4 h-4" />;
      case 'My Managed Projects':
        return <ClipboardDocumentCheckIcon className="w-4 h-4" />;
      case 'PIs':
        return <AcademicCapIcon className="w-4 h-4" />;
      case 'All Projects':
        return <ClipboardDocumentCheckIcon className="w-4 h-4" />;
      case 'All People':
        return <UsersIcon className="w-4 h-4" />;
      case 'Reports':
        return <DocumentChartBarIcon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="text-xs mt-3 font-bold uppercase tracking-wide text-base-content flex items-center gap-2">
      {getIcon(label)}
      {label}
    </div>
  );
};

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

  const [paletteKey, setPaletteKey] = useState(0);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasFinancialSearchAccess = canViewFinancials(user.roles);

  const debouncedQuery = useDebouncedValue(query, 300);
  const hasFinancialQuery = debouncedQuery.trim().length >= 3;

  const catalogQuery = useSearchCatalogQuery({ enabled: isOpen });

  const teamProjectsQuery = useSearchTeamMemberProjectsQuery({
    enabled: isOpen,
    iamId: user.iamId,
  });

  const financialProjectsQuery = useSearchFinancialProjectsQuery({
    enabled: isOpen && hasFinancialSearchAccess && hasFinancialQuery,
    query: debouncedQuery,
  });

  const directoryPeopleQuery = useSearchDirectoryPeopleQuery({
    enabled: isOpen && hasFinancialSearchAccess && hasFinancialQuery,
    query: debouncedQuery,
  });

  const catalog: SearchCatalog | undefined = catalogQuery.data;

  const myProjects = useMemo(() => {
    const rawProjects =
      teamProjectsQuery.data?.myProjects ??
      teamProjectsQuery.data?.projects ??
      [];
    const raw = rawProjects.map((p) =>
      projectToItem(p, user.iamId, false)
    );
    return filterAndSort(raw, query);
  }, [
    query,
    teamProjectsQuery.data?.myProjects,
    teamProjectsQuery.data?.projects,
    user.iamId,
  ]);

  const myManagedProjects = useMemo(() => {
    const raw = (teamProjectsQuery.data?.myManagedProjects ?? []).map((p) =>
      projectToItem(p, user.iamId, false)
    );
    return filterAndSort(raw, query);
  }, [query, teamProjectsQuery.data?.myManagedProjects, user.iamId]);

  const allProjects = useMemo(() => {
    if (!hasFinancialSearchAccess) {
      return [];
    }

    const excludedProjectIds = new Set(
      [...myProjects, ...myManagedProjects].map((p) => p.id)
    );
    const raw = (financialProjectsQuery.data ?? []).map((p) =>
      projectToItem(p, user.iamId, true)
    );

    return filterAndSort(raw, query)
      .filter((item) => !excludedProjectIds.has(item.id))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [
    financialProjectsQuery.data,
    hasFinancialSearchAccess,
    myManagedProjects,
    myProjects,
    query,
    user.iamId,
  ]);

  const reports = useMemo(() => {
    const raw = (catalog?.reports ?? []).map(reportToItem);
    return filterAndSort(raw, query);
  }, [catalog?.reports, query]);

  const principalInvestigators = useMemo(() => {
    const raw = (teamProjectsQuery.data?.principalInvestigators ?? []).map(
      principalInvestigatorToItem
    );
    return filterAndSort(raw, query);
  }, [query, teamProjectsQuery.data?.principalInvestigators]);

  const directoryPeople = useMemo(() => {
    if (!hasFinancialSearchAccess) {
      return [];
    }

    const raw = (directoryPeopleQuery.data ?? []).map(directoryPersonToItem);
    return filterAndSort(raw, query).slice(0, MAX_SEARCH_RESULTS);
  }, [directoryPeopleQuery.data, hasFinancialSearchAccess, query]);

  const isCatalogLoading = catalogQuery.isPending;
  const isMyProjectsLoading = teamProjectsQuery.isPending;
  const isMyManagedProjectsLoading =
    hasFinancialSearchAccess && teamProjectsQuery.isPending;
  const isAllProjectsLoading =
    hasFinancialSearchAccess &&
    hasFinancialQuery &&
    financialProjectsQuery.isPending;
  const isPiLoading = teamProjectsQuery.isPending;
  const isPeopleLoading =
    hasFinancialSearchAccess &&
    hasFinancialQuery &&
    directoryPeopleQuery.isPending;

  const hasAnyResults =
    myProjects.length +
      myManagedProjects.length +
      allProjects.length +
      reports.length +
      principalInvestigators.length +
      directoryPeople.length >
    0;

  const showFinancialSearchHint =
    hasFinancialSearchAccess &&
    query.trim().length > 0 &&
    query.trim().length < 3;
  const showFinancialStartTypingHint =
    hasFinancialSearchAccess && query.trim().length === 0;

  const showEmptyState =
    !isCatalogLoading &&
    !isMyProjectsLoading &&
    !isMyManagedProjectsLoading &&
    !isAllProjectsLoading &&
    !isPiLoading &&
    !isPeopleLoading &&
    query.trim().length > 0 &&
    !showFinancialSearchHint &&
    !hasAnyResults;

  const closeAndReset = useCallback(() => {
    setQuery('');
    setPaletteKey((k) => k + 1);
    onClose();
  }, [onClose]);

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
    async (item: SearchItem) => {
      if (item.kind === 'navigate') {
        navigate({ params: item.params, to: item.to });
        dialogRef.current?.close();
        return;
      }

      if (item.isProjectManager) {
        navigate({
          params: { iamId: item.iamId },
          to: '/principalInvestigators/$iamId',
        });
      } else {
        navigate({
          params: { iamId: item.iamId },
          to: '/projects/$iamId/',
        });
      }
      dialogRef.current?.close();
    },
    [dialogRef, navigate]
  );

  const renderSelectableItem = useCallback(
    (item: SearchItem) => (
      <Command.Item
        key={item.id}
        onSelect={() => {
          void onSelectItem(item);
        }}
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
    ),
    [onSelectItem]
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
              onValueChange={(value) => {
                setQuery(value);
              }}
              placeholder="Search projects, people, reports..."
              ref={inputRef}
              value={query}
            />
          </div>

          <Command.List>
            {showFinancialStartTypingHint ? (
              <div className="px-4 py-2 text-sm text-base-content/60">
                Start typing to search all projects and people.
              </div>
            ) : null}

            {isMyProjectsLoading || myProjects.length ? (
              <Command.Group heading={sectionHeading('My Projects')}>
                {isMyProjectsLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading my projects…</span>
                    </div>
                  </Command.Item>
                ) : (
                  myProjects.map(renderSelectableItem)
                )}
              </Command.Group>
            ) : null}

            {isMyManagedProjectsLoading || myManagedProjects.length ? (
              <Command.Group heading={sectionHeading('My Managed Projects')}>
                {isMyManagedProjectsLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading my managed projects…</span>
                    </div>
                  </Command.Item>
                ) : (
                  myManagedProjects.map(renderSelectableItem)
                )}
              </Command.Group>
            ) : null}

            {isPiLoading || principalInvestigators.length ? (
              <Command.Group heading={sectionHeading('PIs')}>
                {isPiLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading PIs…</span>
                    </div>
                  </Command.Item>
                ) : (
                  principalInvestigators.map(renderSelectableItem)
                )}
              </Command.Group>
            ) : null}

            {isAllProjectsLoading || allProjects.length ? (
              <Command.Group heading={sectionHeading('All Projects')}>
                {isAllProjectsLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading all projects…</span>
                    </div>
                  </Command.Item>
                ) : (
                  allProjects.map(renderSelectableItem)
                )}
              </Command.Group>
            ) : null}

            {isPeopleLoading || directoryPeople.length ? (
              <Command.Group heading={sectionHeading('All People')}>
                {isPeopleLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading all people…</span>
                    </div>
                  </Command.Item>
                ) : (
                  directoryPeople.map(renderSelectableItem)
                )}
              </Command.Group>
            ) : null}

            {isCatalogLoading || reports.length ? (
              <Command.Group heading={sectionHeading('Reports')}>
                {isCatalogLoading ? (
                  <Command.Item aria-disabled="true" data-disabled="true">
                    <div className="flex items-center gap-3">
                      <div className="loading loading-spinner loading-sm" />
                      <span>Loading reports…</span>
                    </div>
                  </Command.Item>
                ) : (
                  reports.map(renderSelectableItem)
                )}
              </Command.Group>
            ) : null}

            {showFinancialSearchHint ? (
              <div className="px-4 py-8 text-sm text-base-content/60">
                Type at least 3 characters to search all projects and people.
              </div>
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
