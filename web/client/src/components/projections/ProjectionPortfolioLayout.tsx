import { useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowTrendingUpIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { projectionListQueryOptions } from '@/queries/projections.ts';

export function ProjectionPortfolioLayout({
  children,
  currentPlanId,
  enabled = true,
  iamId,
}: {
  children: ReactNode;
  currentPlanId?: number;
  enabled?: boolean;
  iamId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationId = useId();
  const { data: plans, isError } = useQuery({
    ...projectionListQueryOptions(iamId),
    enabled,
    refetchOnMount: false,
  });

  return (
    <div className="container">
      <div className="flex flex-col gap-6 py-6 md:flex-row md:gap-8">
        {enabled && (
          <aside
            aria-label="Projection plans"
            className={`shrink-0 text-base leading-6 font-normal md:sticky md:top-24 md:self-start ${collapsed ? 'md:w-24' : 'md:w-68'}`}
          >
            <div className="overflow-hidden rounded-sm border border-main-border bg-base-100">
              <div className="flex items-center justify-between border-b border-main-border bg-base-200 px-4 py-2">
                <span className={`text-sm ${collapsed ? 'md:sr-only' : ''}`}>
                  Plan list
                </span>
                <button
                  aria-controls={navigationId}
                  aria-expanded={mobileOpen}
                  className="btn btn-ghost btn-sm btn-square md:hidden"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  type="button"
                >
                  <ChevronDownIcon aria-hidden="true" className="size-5" />
                  <span className="sr-only">
                    {mobileOpen ? 'Hide plans' : 'Show plans'}
                  </span>
                </button>
                <button
                  aria-label={
                    collapsed ? 'Expand plan list' : 'Collapse plan list'
                  }
                  className="btn btn-ghost btn-sm btn-square hidden md:inline-flex"
                  onClick={() => setCollapsed(!collapsed)}
                  type="button"
                >
                  {collapsed ? (
                    <ChevronDoubleRightIcon
                      aria-hidden="true"
                      className="size-5"
                    />
                  ) : (
                    <ChevronDoubleLeftIcon
                      aria-hidden="true"
                      className="size-5"
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
                  activeOptions={{ exact: true }}
                  aria-current={
                    currentPlanId === undefined ? 'page' : undefined
                  }
                  className={`flex items-center gap-2 border-b border-l-4 border-main-border px-3 py-3 ${currentPlanId === undefined ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-primary/5'}`}
                  onClick={() => setMobileOpen(false)}
                  params={{ iamId }}
                  search={{}}
                  title={collapsed ? 'Dashboard' : undefined}
                  to="/projections/$iamId"
                >
                  <ArrowTrendingUpIcon
                    aria-hidden="true"
                    className="size-5 shrink-0"
                  />
                  <span className={collapsed ? 'md:sr-only' : ''}>
                    Dashboard
                  </span>
                </Link>
                <div
                  className={`border-b border-main-border bg-base-200 px-3 py-2 text-xs text-base-content/80 ${collapsed ? 'md:sr-only' : ''}`}
                >
                  Your plans
                </div>
                {plans?.map((plan) => (
                  <Link
                    aria-current={
                      currentPlanId === plan.id ? 'page' : undefined
                    }
                    className={`block border-b border-l-4 border-main-border px-3 py-3 transition-colors ${currentPlanId === plan.id ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-primary/5'}`}
                    key={plan.id}
                    onClick={() => setMobileOpen(false)}
                    params={{ iamId, projectionId: String(plan.id) }}
                    search={{}}
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
                {(!plans || !plans.length) && (
                  <p
                    className={`px-3 py-3 text-sm ${collapsed ? 'md:sr-only' : ''}`}
                  >
                    {isError
                      ? 'Saved plans could not be loaded.'
                      : plans
                        ? 'Your saved plans will appear here.'
                        : 'Loading plans…'}
                  </p>
                )}
              </nav>
            </div>
          </aside>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
