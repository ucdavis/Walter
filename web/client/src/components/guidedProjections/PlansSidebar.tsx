import { useId, useState } from 'react';
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
  PresentationChartLineIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import type { ProjectionPlan } from '@/components/guidedProjections/planModel.ts';

export default function PlansSidebar({
  canCreate = true,
  currentPlanId,
  defaultPlan,
  onCreate,
  onHome,
  onOpen,
  plans,
}: {
  canCreate?: boolean;
  currentPlanId: string | null;
  defaultPlan?: ProjectionPlan;
  onCreate: () => void;
  onHome: () => void;
  onOpen: (plan: ProjectionPlan) => void;
  plans: ProjectionPlan[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationId = useId();

  function planButton(plan: ProjectionPlan, isDefault = false) {
    const active = currentPlanId === plan.id;
    return (
      <button
        aria-current={active ? 'page' : undefined}
        className={`block w-full border-b border-l-4 border-main-border px-3 py-3 text-left transition-colors ${active ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-primary/5'}`}
        key={plan.id}
        onClick={() => {
          onOpen(plan);
          setMobileOpen(false);
        }}
        title={collapsed ? plan.name : undefined}
        type="button"
      >
        <span
          className={`block ${collapsed ? 'md:truncate md:text-xs' : 'break-words'}`}
        >
          {plan.name || 'Untitled plan'}
        </span>
        <span
          className={`mt-1 block text-xs text-base-content/60 ${collapsed ? 'md:hidden' : ''}`}
        >
          {isDefault ? 'Default plan' : `${plan.months} month plan`}
        </span>
      </button>
    );
  }

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
            aria-label={collapsed ? 'Expand plan list' : 'Collapse plan list'}
            className="btn btn-ghost btn-sm btn-square hidden md:inline-flex"
            onClick={() => setCollapsed(!collapsed)}
            type="button"
          >
            {collapsed ? (
              <ChevronDoubleRightIcon className="size-5 shrink-0" />
            ) : (
              <ChevronDoubleLeftIcon className="size-5 shrink-0" />
            )}
          </button>
        </div>
        <nav
          aria-label="Plan navigation"
          className={`${mobileOpen ? 'block' : 'hidden'} md:block md:max-h-[calc(100dvh-17rem)] overflow-y-auto`}
          id={navigationId}
        >
          <button
            aria-current={currentPlanId === null ? 'page' : undefined}
            className={`flex w-full items-center gap-2 border-b border-l-4 border-main-border px-3 py-3 text-left ${currentPlanId === null ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-primary/5'}`}
            onClick={() => {
              onHome();
              setMobileOpen(false);
            }}
            title={collapsed ? 'Dashboard' : undefined}
            type="button"
          >
            <PresentationChartLineIcon
              aria-hidden="true"
              className="size-5 shrink-0"
            />
            <span className={collapsed ? 'md:sr-only' : ''}>Dashboard</span>
          </button>
          {defaultPlan && planButton(defaultPlan, true)}
          <div
            className={`border-b border-main-border bg-base-200 px-3 py-2 text-xs uppercase text-base-content/70 ${collapsed ? 'md:sr-only' : ''}`}
          >
            Your plans
          </div>
          {plans.map((plan) => planButton(plan))}
          {!plans.length && !collapsed && (
            <p className="px-3 py-3">Your saved plans will appear here.</p>
          )}
        </nav>
      </div>
      <button
        className="btn btn-link text-base-content/70"
        disabled={!canCreate}
        onClick={() => {
          onCreate();
          setMobileOpen(false);
        }}
        title={collapsed ? 'Create New Plan' : undefined}
        type="button"
      >
        <PlusIcon aria-hidden="true" className="size-5 shrink-0" />
        <span className={collapsed ? 'md:sr-only' : ''}>Create New Plan</span>
      </button>
    </aside>
  );
}
