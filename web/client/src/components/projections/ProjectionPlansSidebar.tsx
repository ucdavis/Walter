import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowTrendingUpIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import type { ProjectionSummary } from '@/queries/projections.ts';

export function ProjectionPlansSidebar({
  iamId,
  plans,
}: {
  iamId: string;
  plans: ProjectionSummary[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationId = useId();
  return (
    <aside
      aria-label="Projection plans"
      className={`shrink-0 text-base leading-6 font-normal md:sticky md:top-24 md:self-start ${collapsed ? 'md:w-24' : 'md:w-68'}`}
    >
      <div className="overflow-hidden rounded-sm border border-main-border bg-base-100">
        <div className="flex items-center justify-between border-b border-main-border bg-base-200 px-4 py-2">
          <span
            className={`text-sm uppercase ${collapsed ? 'md:sr-only' : ''}`}
          >
            Plan list
          </span>
          <button
            aria-controls={navigationId}
            aria-expanded={mobileOpen}
            className="btn btn-ghost btn-sm btn-square md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            type="button"
          >
            <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0" />
            <span className="sr-only">
              {mobileOpen ? 'Hide plans' : 'Show plans'}
            </span>
          </button>
          <button
            aria-controls={navigationId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand plan list' : 'Collapse plan list'}
            className="btn btn-ghost btn-sm btn-square hidden md:inline-flex"
            onClick={() => setCollapsed(!collapsed)}
            type="button"
          >
            {collapsed ? (
              <ChevronDoubleRightIcon
                aria-hidden="true"
                className="size-5 shrink-0"
              />
            ) : (
              <ChevronDoubleLeftIcon
                aria-hidden="true"
                className="size-5 shrink-0"
              />
            )}
          </button>
        </div>
        <nav
          aria-label="Plan navigation"
          className={`${mobileOpen ? 'block' : 'hidden'} overflow-y-auto md:block md:max-h-[calc(100dvh-17rem)]`}
          id={navigationId}
        >
          <Link
            aria-current="page"
            className="flex w-full items-center gap-2 border-b border-l-4 border-main-border border-l-primary bg-primary/10 px-3 py-3 text-left"
            onClick={() => setMobileOpen(false)}
            params={{ iamId }}
            title={collapsed ? 'Dashboard' : undefined}
            to="/projections/$iamId"
          >
            <ArrowTrendingUpIcon
              aria-hidden="true"
              className="size-5 shrink-0"
            />
            <span className={collapsed ? 'md:sr-only' : ''}>Dashboard</span>
          </Link>
          <div
            className={`border-b border-main-border bg-base-200 px-3 py-2 text-xs uppercase text-base-content/80 ${collapsed ? 'md:sr-only' : ''}`}
          >
            Your plans
          </div>
          {plans.map((plan) => (
            <Link
              className="block w-full border-b border-l-4 border-main-border border-l-transparent px-3 py-3 text-left transition-colors hover:bg-primary/5"
              key={plan.id}
              onClick={() => setMobileOpen(false)}
              params={{ iamId, projectionId: String(plan.id) }}
              title={collapsed ? plan.name : undefined}
              to="/projections/$iamId/$projectionId"
            >
              <span
                className={`block ${collapsed ? 'md:truncate md:text-xs' : 'break-words'}`}
              >
                {plan.name || 'Untitled plan'}
              </span>
            </Link>
          ))}
          {!plans.length && !collapsed && (
            <p className="px-3 py-3">Your saved plans will appear here.</p>
          )}
        </nav>
      </div>
    </aside>
  );
}
