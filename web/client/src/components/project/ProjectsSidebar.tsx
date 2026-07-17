import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '@/lib/date.ts';
import {
  projectsDetailQueryOptions,
  ProjectRecord,
} from '@/queries/project.ts';
import { featureFlagsQueryOptions } from '@/queries/featureFlags.ts';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams, useRouterState } from '@tanstack/react-router';
import {
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

interface ProjectSummary {
  awardEndDate: string | null;
  displayName: string;
  isInternal: boolean;
  projectNumber: string;
  projectStatusCode: string;
  totalBalance: number;
}

type ProjectSidebarRoute =
  | '/expenditureprogress/$iamId/$projectNumber'
  | '/projectburndown/$iamId/$projectNumber'
  | '/projects/$iamId/$projectNumber';

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function groupProjects(records: ProjectRecord[]): ProjectSummary[] {
  const map: Record<string, ProjectSummary> = {};

  for (const rec of records) {
    const key = rec.projectNumber;

    if (!map[key]) {
      map[key] = {
        awardEndDate: rec.awardEndDate,
        displayName: rec.displayName,
        isInternal: rec.projectType === 'Internal',
        projectNumber: rec.projectNumber,
        projectStatusCode: rec.projectStatusCode,
        totalBalance: 0,
      };
    }

    map[key].totalBalance += rec.balance;

    if (rec.awardEndDate) {
      const current = map[key].awardEndDate;
      if (!current || rec.awardEndDate > current) {
        map[key].awardEndDate = rec.awardEndDate;
      }
    }
  }

  return Object.values(map);
}

function getProjectSidebarRoute(
  currentPathname: string,
  featureFlags: {
    burndownEnabled: boolean;
    expenditureProgressEnabled: boolean;
  },
  project: ProjectSummary
): ProjectSidebarRoute {
  if (
    currentPathname.startsWith('/expenditureprogress/') &&
    !project.isInternal &&
    featureFlags.expenditureProgressEnabled
  ) {
    return '/expenditureprogress/$iamId/$projectNumber';
  }

  if (
    currentPathname.startsWith('/projectburndown/') &&
    !project.isInternal &&
    featureFlags.burndownEnabled
  ) {
    return '/projectburndown/$iamId/$projectNumber';
  }

  return '/projects/$iamId/$projectNumber';
}

const linkClasses = (isActive: boolean, isActiveStatus: boolean) =>
  [
    'block mb-0 text-left px-3 py-2 transition-colors border-b border-main-border',
    isActive ? 'bg-primary-color/10' : 'hover:bg-[#F2F6FC]',
    isActiveStatus ? 'bg-base-100' : 'hover:bg-[#F2F6FC]',
  ].join(' ');

export function ProjectsSidebar() {
  const { iamId, projectNumber } = useParams({ strict: false });
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );
  const { data: featureFlags } = useSuspenseQuery(featureFlagsQueryOptions());
  const currentPathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // mobile drawer
  const [open, setOpen] = useState(false);

  // desktop collapse (md+)
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const hasSearchQuery = searchQuery !== '';

  useEffect(() => {
    // handle escape to close
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groupedProjects = useMemo(
    () => groupProjects(projects ?? []),
    [projects]
  );
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const filteredProjects = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groupedProjects;
    }

    return groupedProjects.filter((project) => {
      const haystack = normalizeSearchValue(
        `${project.projectNumber} ${project.displayName}`
      );
      return haystack.includes(normalizedSearchQuery);
    });
  }, [groupedProjects, normalizedSearchQuery]);
  const totalOverviewBalance = groupedProjects.reduce(
    (total, project) => total + project.totalBalance,
    0
  );
  const isAllProjectsActive = !projectNumber;
  const getProjectRoute = (project: ProjectSummary) =>
    getProjectSidebarRoute(currentPathname, featureFlags, project);

  if (!projects?.length) {
    return null;
  }

  return (
    <>
      {/* Desktop/Tablet sidebar (md+) */}
      <aside
        className={[
          'shrink-0 hidden md:block transition-[width] duration-200',
          collapsed ? 'w-24' : 'w-68',
        ].join(' ')}
      >
        <div className="sticky top-24 mt-8 h-[calc(100dvh-13.5rem)] min-h-0">
          <div className="bg-white rounded-sm border border-main-border overflow-hidden h-full flex flex-col">
            <div className="bg-light-bg-200 border-b border-main-border shrink-0">
              <div className="px-4 py-2 border-b border-main-border flex items-center justify-between">
                {!collapsed ? (
                  <h2 className="text-primary-font text-sm uppercase">
                    Project List
                  </h2>
                ) : (
                  <span className="sr-only">Project List</span>
                )}

                <button
                  aria-label={
                    collapsed ? 'Expand project list' : 'Collapse project list'
                  }
                  className="p-2 rounded-md cursor-pointer"
                  onClick={() => {
                    setCollapsed((isCollapsed) => {
                      if (!isCollapsed) {
                        setSearchQuery('');
                      }
                      return !isCollapsed;
                    });
                  }}
                >
                  {collapsed ? (
                    <ChevronDoubleRightIcon className="w-4 h-4" />
                  ) : (
                    <ChevronDoubleLeftIcon className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Search (hidden in collapsed mode) */}
              {!collapsed && (
                <div className="px-4 py-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/55" />

                    <input
                      aria-label="Search projects"
                      className="w-full h-9 pl-5 pr-9"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search..."
                      type="text"
                      value={searchQuery}
                    />
                    {hasSearchQuery ? (
                      <button
                        aria-label="Clear project search"
                        className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-circle"
                        onClick={() => setSearchQuery('')}
                        type="button"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1 min-h-0 flex-1 overflow-y-auto">
              {/* All Projects */}
              <Link
                aria-label={collapsed ? 'All Projects' : undefined}
                className={linkClasses(isAllProjectsActive, false)}
                params={{ iamId }}
                title={collapsed ? 'All Projects' : undefined}
                to="/projects/$iamId"
                viewTransition={{ types: ['slide-right'] }}
              >
                {collapsed ? (
                  <div className="flex items-center justify-center py-2">
                    <HomeIcon className="w-5 h-5 text-base-content/70" />
                    <span className="sr-only">All Projects</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-base">All Projects</span>
                    </div>
                    <div className="flex justify-between text-sm items-center text-base-content/70">
                      <Currency value={totalOverviewBalance} />
                    </div>
                  </>
                )}
              </Link>

              {/* Individual projects */}
              {filteredProjects.map((project) => (
                <Link
                  className={linkClasses(
                    projectNumber === project.projectNumber,
                    project.projectStatusCode === 'ACTIVE'
                  )}
                  key={project.projectNumber}
                  params={{ iamId, projectNumber: project.projectNumber }}
                  title={
                    collapsed
                      ? `${project.displayName} • ${project.projectNumber}`
                      : project.displayName
                  }
                  to={getProjectRoute(project)}
                  viewTransition={{ types: ['slide-left'] }}
                >
                  {collapsed ? (
                    <div className="flex flex-col gap-1 py-1">
                      <div className="text-xs leading-tight text-base-content/70">
                        {project.projectNumber}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-base-content/70">
                        {project.projectNumber}
                      </div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-base truncate">
                          {project.displayName}
                        </span>
                      </div>
                      <div className="flex text-sm justify-between items-center text-base-content/70">
                        <Currency value={project.totalBalance} />
                        <span>
                          {formatDate(project.awardEndDate, 'No end date')}
                        </span>
                      </div>
                    </>
                  )}
                </Link>
              ))}
              {searchQuery.trim() && filteredProjects.length === 0 ? (
                <div className="px-3 py-4 text-sm text-base-content/70">
                  No matching projects.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sticky header with toggle (shown < md) */}
      <div className="md:hidden sticky top-22 z-40">
        <button
          aria-controls="projects-drawer"
          aria-expanded={open}
          className="flex items-center btn gap-2 uppercase font-light"
          onClick={() => {
            setOpen((s) => !s);
            setTimeout(() => closeBtnRef.current?.focus(), 120);
          }}
        >
          <ClipboardDocumentListIcon className="w-4 h-4" />
          <span>Project List</span>
        </button>
      </div>

      {/* Mobile off-canvas panel */}
      <div
        aria-hidden={!open}
        className="fixed inset-0 z-50 md:hidden pointer-events-none"
        id="projects-drawer"
        inert={!open ? true : undefined}
      >
        {/* overlay */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0'
          }`}
          onClick={() => setOpen(false)}
        />

        {/* panel */}
        <div
          aria-label="Project List"
          aria-modal="true"
          className={`fixed top-0 left-0 h-full w-[78%] max-w-xs bg-white border-r border-main-border shadow-lg transform transition-transform duration-200 pointer-events-auto
            ${open ? 'translate-x-0' : '-translate-x-full'}`}
          ref={panelRef}
          role="dialog"
        >
          <div className="px-4 py-3 border-b border-main-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium uppercase">Project List</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-base-content/70">
                <Currency value={totalOverviewBalance} />
              </div>
              <button
                aria-label="Close projects"
                className="p-2 rounded-md hover:bg-base-100"
                onClick={() => setOpen(false)}
                ref={closeBtnRef}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-4 py-1 border-b border-main-border">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/55" />

              <input
                aria-label="Search projects"
                className="w-full h-9 pl-5 pr-9"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search..."
                type="text"
                value={searchQuery}
              />
              {hasSearchQuery ? (
                <button
                  aria-label="Clear project search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-circle"
                  onClick={() => setSearchQuery('')}
                  type="button"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-120px)]">
            <Link
              className={linkClasses(isAllProjectsActive, false)}
              onClick={() => setOpen(false)}
              params={{ iamId }}
              to="/projects/$iamId"
              viewTransition={{ types: ['slide-right'] }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-base">All Projects</span>
              </div>
              <div className="flex justify-between text-sm items-center text-base-content/70">
                <Currency value={totalOverviewBalance} />
                <span>total proj #</span>
              </div>
            </Link>

            {filteredProjects.map((project) => (
              <Link
                className={linkClasses(
                  projectNumber === project.projectNumber,
                  project.projectStatusCode === 'ACTIVE'
                )}
                key={project.projectNumber}
                onClick={() => setOpen(false)}
                params={{ iamId, projectNumber: project.projectNumber }}
                to={getProjectRoute(project)}
                viewTransition={{ types: ['slide-left'] }}
              >
                <div className="text-xs text-base-content/50">
                  {project.projectNumber}
                </div>
                <div className="flex justify-between items-start mb-1">
                  <span className="text-base">{project.displayName}</span>
                </div>
                <div className="flex text-sm justify-between items-center text-base-content/70">
                  <Currency value={project.totalBalance} />
                  <span>{formatDate(project.awardEndDate, 'No end date')}</span>
                </div>
              </Link>
            ))}
            {searchQuery.trim() && filteredProjects.length === 0 ? (
              <div className="px-3 py-4 text-sm text-base-content/70">
                No matching projects.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
