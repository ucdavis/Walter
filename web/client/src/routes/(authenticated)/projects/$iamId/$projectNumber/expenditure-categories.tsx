import { useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react';
import {
  ExpenditureCategoryBreakdown,
  type ExpenditureCategoryFilters,
} from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';

type SearchParams = ExpenditureCategoryFilters;

const filterKeys = ['task', 'dept', 'fund', 'program', 'activity'] as const;

// Blank is a real filter value: it selects rows with no code for that segment.
function parseFilter(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export const Route = createFileRoute(
  '/(authenticated)/projects/$iamId/$projectNumber/expenditure-categories'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    activity: parseFilter(search.activity),
    dept: parseFilter(search.dept),
    fund: parseFilter(search.fund),
    program: parseFilter(search.program),
    task: parseFilter(search.task),
  }),
});

function RouteComponent() {
  const { iamId, projectNumber } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );
  const { data: featureFlags } = useFeatureFlagsQuery();

  const projectRecords = useMemo(
    () => projects.filter((p) => p.projectNumber === projectNumber),
    [projects, projectNumber]
  );

  const taskOptions = useMemo(() => {
    const options = new Map<
      string,
      { filters: Required<ExpenditureCategoryFilters>; label: string }
    >();

    for (const record of projectRecords) {
      const filters = {
        activity: record.activityCode ?? '',
        dept: record.projectOwningOrgCode ?? '',
        fund: record.fundCode ?? '',
        program: record.programCode ?? '',
        task: record.taskNum ?? '',
      };
      const key = JSON.stringify(filters);
      const taskLabel = [filters.task || 'No task', record.taskName]
        .filter(Boolean)
        .join(' – ');

      options.set(key, {
        filters,
        label: [
          taskLabel,
          filters.dept || '—',
          filters.fund || '—',
          filters.program || '—',
          filters.activity || '—',
        ].join(' / '),
      });
    }

    return Array.from(options, ([value, option]) => ({ value, ...option }));
  }, [projectRecords]);

  const hasFilters = filterKeys.some((key) => search[key] !== undefined);
  const selectedTask = hasFilters
    ? taskOptions.find(({ filters }) =>
        filterKeys.every((key) => filters[key] === search[key])
      )
    : taskOptions[0];
  const filters = selectedTask?.filters ?? search;

  const {
    context,
    floatingStyles,
    refs: { setFloating, setReference },
  } = useFloating({
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    onOpenChange: setIsTaskMenuOpen,
    open: isTaskMenuOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'listbox' });
  const listNavigation = useListNavigation(context, {
    activeIndex,
    listRef: optionRefs,
    loop: true,
    onNavigate: setActiveIndex,
    selectedIndex: taskOptions.findIndex(
      ({ value }) => value === selectedTask?.value
    ),
  });
  const { getFloatingProps, getItemProps, getReferenceProps } = useInteractions(
    [click, dismiss, role, listNavigation]
  );

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-2">
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            className="btn btn-sm"
            params={{ iamId, projectNumber }}
            to="/projects/$iamId/$projectNumber/"
          >
            <ClipboardDocumentListIcon className="h-4 w-4" />
            Project Details
          </Link>
        </div>
        <h1 className="h1">Expenditure Category Breakdown</h1>
        <h3 className="subtitle">
          Data source: Faculty Department Portfolio Report (PPM)
        </h3>
      </section>

      <section className="mb-8">
        <div className="mb-4 flex min-w-0 items-center">
          <button
            aria-label={`Task: ${selectedTask?.label ?? 'Choose a task'}`}
            className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-xs py-1.5 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            ref={setReference}
            type="button"
            {...getReferenceProps()}
          >
            <span className="truncate">
              {selectedTask?.label ?? 'Choose a task'}
            </span>
            <ChevronDownIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          </button>
          {isTaskMenuOpen && (
            <FloatingPortal>
              <FloatingFocusManager context={context} modal={false}>
                <div
                  aria-label="Task"
                  className="z-110 max-h-80 w-max max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-main-border bg-base-100 p-1 shadow-lg"
                  ref={setFloating}
                  style={floatingStyles}
                  {...getFloatingProps()}
                >
                  {taskOptions.map(({ filters, label, value }, index) => (
                    <button
                      aria-selected={selectedTask?.value === value}
                      className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-base-200 focus:bg-base-200 focus:outline-none ${
                        selectedTask?.value === value
                          ? 'bg-base-200 font-semibold'
                          : ''
                      }`}
                      key={value}
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      role="option"
                      tabIndex={activeIndex === index ? 0 : -1}
                      type="button"
                      {...getItemProps({
                        onClick: () => {
                          setIsTaskMenuOpen(false);
                          void navigate({ search: filters });
                        },
                      })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </FloatingFocusManager>
            </FloatingPortal>
          )}
        </div>
        <ExpenditureCategoryBreakdown
          filters={filters}
          iamId={iamId}
          projectCostsEnabled={featureFlags?.projectCostsEnabled}
          projectNumber={projectNumber}
          records={projectRecords}
        />
      </section>
    </main>
  );
}
