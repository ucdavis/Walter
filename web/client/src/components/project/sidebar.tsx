import React, { useEffect, useRef, useState } from 'react';
import { formatDate } from '@/lib/date.ts';
import {
  projectsDetailQueryOptions,
  ProjectRecord,
} from '@/queries/project.ts';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface ProjectSummary {
  awardEndDate: string | null;
  displayName: string;
  projectNumber: string;
  projectStatusCode: string;
  totalCatBudBal: number;
}

function groupProjects(records: ProjectRecord[]): ProjectSummary[] {
  const map: Record<string, ProjectSummary> = {};

  for (const rec of records) {
    const key = rec.projectNumber;

    if (!map[key]) {
      map[key] = {
        awardEndDate: rec.awardEndDate,
        displayName: rec.displayName,
        projectNumber: rec.projectNumber,
        projectStatusCode: rec.projectStatusCode,
        totalCatBudBal: 0,
      };
    }

    map[key].totalCatBudBal += rec.catBudBal;

    if (rec.awardEndDate) {
      const current = map[key].awardEndDate;
      if (!current || rec.awardEndDate > current) {
        map[key].awardEndDate = rec.awardEndDate;
      }
    }
  }

  return Object.values(map);
}

const linkClasses = (isActive: boolean, isActiveStatus: boolean) =>
  [
    'block mb-0 text-left px-3 py-2 transition-colors border-b border-main-border',
    isActive ? 'bg-primary-color/10' : 'hover:bg-[#F2F6FC]',
  ].join(' ');

export function ProjectsSidebar() {
  const { employeeId, projectNumber } = useParams({ strict: false });
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // close panel when route selection changes (e.g., user navigates to a project)
    setOpen(false);
  }, [projectNumber]);

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

  if (!projects?.length) {
    return null;
  }

  const groupedProjects = groupProjects(projects);
  const totalOverviewBalance = groupedProjects.reduce(
    (total, project) => total + project.totalCatBudBal,
    0
  );
  const isAllProjectsActive = !projectNumber;

  return (
    <>
      {/* Desktop/Tablet sidebar (md+) */}
      <aside className="w-72 shrink-0 hidden md:block">
        <div className="sticky top-24">
          <div className="bg-white rounded-sm border border-main-border">
            <div className="bg-light-bg-200 border-b border-main-border">
              <div className="px-4 py-2 border-b border-main-border">
                <h2 className="text-primary-font text-sm uppercase">
                  My Projects
                </h2>
              </div>
              <div className="px-4 py-1">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-dark-font/55" />

                  <input
                    aria-label="Search projects"
                    className="w-full h-9 pl-5 pr-3"
                    placeholder="Search..."
                    type="text"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1 max-h-[650px] overflow-y-auto">
              <Link
                className={linkClasses(isAllProjectsActive, false)}
                params={{ employeeId }}
                to="/projects/$employeeId"
                viewTransition={{ types: ['slide-right'] }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-base">All Projects</span>
                </div>
                <div className="flex justify-between text-sm items-center text-dark-font/70">
                  <Currency value={totalOverviewBalance} />
                </div>
              </Link>

              {groupedProjects.map((project, index) => (
                <Link
                  className={linkClasses(
                    projectNumber === project.projectNumber,
                    project.projectStatusCode === 'ACTIVE'
                  )}
                  key={index}
                  params={{ employeeId, projectNumber: project.projectNumber }}
                  to="/projects/$employeeId/$projectNumber"
                  viewTransition={{ types: ['slide-left'] }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-base">{project.displayName}</span>
                  </div>
                  <div className="flex text-sm justify-between items-center text-dark-font/70">
                    <Currency value={project.totalCatBudBal} />
                    <span>
                      {formatDate(project.awardEndDate, 'No end date')}
                    </span>
                  </div>
                </Link>
              ))}
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
          <span>My Projects</span>
        </button>
      </div>

      {/* Mobile off-canvas panel */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-50 md:hidden pointer-events-none`}
        id="projects-drawer"
        {...(!open ? ({ inert: '' } as any) : {})}
      >
        {/* overlay */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />

        {/* panel */}
        <div
          aria-label="My Projects"
          aria-modal="true"
          className={`fixed top-0 left-0 h-full w-[78%] max-w-xs bg-white border-r border-main-border shadow-lg transform transition-transform duration-200 pointer-events-auto
            ${open ? 'translate-x-0' : '-translate-x-full'}`}
          ref={panelRef}
          role="dialog"
        >
          <div className="px-4 py-3 border-b border-main-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium uppercase">My Projects</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-dark-font/70">
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
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-dark-font/55" />

              <input
                aria-label="Search projects"
                className="w-full h-9 pl-5 pr-3"
                placeholder="Search..."
                type="text"
              />
            </div>
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-120px)]">
            <Link
              className={linkClasses(isAllProjectsActive, false)}
              params={{ employeeId }}
              to="/projects/$employeeId"
              viewTransition={{ types: ['slide-right'] }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-base">All Projects</span>
              </div>
              <div className="flex justify-between text-sm items-center text-dark-font/70">
                <Currency value={totalOverviewBalance} />
                <span>total proj #</span>
              </div>
            </Link>

            {groupedProjects.map((project, index) => (
              <Link
                className={linkClasses(
                  projectNumber === project.projectNumber,
                  project.projectStatusCode === 'ACTIVE'
                )}
                key={index}
                onClick={() => setOpen(false)} // close panel when navigating
                params={{ employeeId, projectNumber: project.projectNumber }}
                to="/projects/$employeeId/$projectNumber"
                viewTransition={{ types: ['slide-left'] }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-base">{project.displayName}</span>
                </div>
                <div className="flex text-sm justify-between items-center text-dark-font/70">
                  <Currency value={project.totalCatBudBal} />
                  <span>{formatDate(project.awardEndDate, 'No end date')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
