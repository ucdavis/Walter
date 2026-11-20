import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MegaphoneIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { DataTable } from '@/shared/DataTable.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { projectionSeriesColor } from '@/components/projections/projectionFormatting.ts';
import {
  PROJECT_SERIES_COLORS,
  projectExpenditureCategoryColor,
} from '@/components/project/projectChartColors.ts';
import type { ColumnDef } from '@tanstack/react-table';

export const Route = createFileRoute('/(authenticated)/styles')({
  component: RouteComponent,
});

const themeColors = [
  {
    badge: 'badge-primary',
    button: 'btn-primary',
    name: 'Primary',
    token: 'primary',
  },
  {
    badge: 'badge-secondary',
    button: 'btn-secondary',
    name: 'Secondary',
    token: 'secondary',
  },
  {
    badge: 'badge-accent',
    button: 'btn-accent',
    name: 'Accent',
    token: 'accent',
  },
  {
    badge: 'badge-success',
    button: 'btn-success',
    name: 'Success',
    token: 'success',
  },
  { badge: 'badge-info', button: 'btn-info', name: 'Info', token: 'info' },
  {
    badge: 'badge-warning',
    button: 'btn-warning',
    name: 'Warning',
    token: 'warning',
  },
  { badge: 'badge-error', button: 'btn-error', name: 'Error', token: 'error' },
  {
    badge: 'badge-neutral',
    button: 'btn-neutral',
    name: 'Neutral',
    token: 'neutral',
  },
];
interface SampleProject {
  balance: number;
  budget: number;
  name: string;
  personnel: number;
  projectNumber: string;
  type: 'Internal' | 'Sponsored';
}
const sampleProjects: SampleProject[] = [
  {
    balance: 82_500,
    budget: 240_000,
    name: 'Agricultural field research',
    personnel: 6,
    projectNumber: 'A26RESEARCH',
    type: 'Sponsored',
  },
  {
    balance: 45_000,
    budget: 120_000,
    name: 'Department operations',
    personnel: 3,
    projectNumber: 'K26OPERATIONS',
    type: 'Internal',
  },
  {
    balance: -2400,
    budget: 85_000,
    name: 'Graduate research support',
    personnel: 4,
    projectNumber: 'A26GRAD',
    type: 'Sponsored',
  },
];
const projectColumns: ColumnDef<SampleProject>[] = [
  { accessorKey: 'projectNumber', header: 'Project', size: 180 },
  { accessorKey: 'name', header: 'Project name', size: 260 },
  {
    accessorKey: 'type',
    cell: ({ row }) => (
      <span
        className={`badge badge-soft ${row.original.type === 'Internal' ? 'badge-secondary' : 'badge-info'}`}
      >
        {row.original.type}
      </span>
    ),
    header: 'Type',
    size: 140,
  },
  { accessorKey: 'personnel', header: 'Personnel', size: 110 },
  {
    accessorKey: 'budget',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatCurrency(row.original.budget)}
      </span>
    ),
    header: 'Budget',
    size: 140,
  },
  {
    accessorKey: 'balance',
    cell: ({ row }) => (
      <span
        className={`tabular-nums ${row.original.balance < 0 ? 'text-error' : row.original.type === 'Internal' ? 'text-secondary' : 'text-info'}`}
      >
        {formatCurrency(row.original.balance)}
      </span>
    ),
    header: 'Balance',
    size: 140,
  },
];
const adminTools = [
  {
    description: 'Search for users and manage their Walter access.',
    Icon: UsersIcon,
    title: 'User Management',
    to: '/admin/users',
  },
  {
    description: 'Share an announcement with Walter users.',
    Icon: MegaphoneIcon,
    title: 'Site Notification',
    to: '/admin/notification',
  },
  {
    description: 'Preview the notification emails sent by Walter.',
    Icon: EnvelopeIcon,
    title: 'Email Preview',
    to: '/admin/email-preview',
  },
] as const;

function RouteComponent() {
  return (
    <main className="mt-8 min-w-0 pb-12">
      <div className="container space-y-12">
        <header>
          <h1 className="h1">Walter styles</h1>
          <p className="subtitle">
            Theme colors and components used throughout Walter.
          </p>
          <p className="mt-2 text-sm text-base-content/85">
            Examples below use sample data.
          </p>
        </header>
        <section aria-labelledby="theme-colors-title">
          <h2 className="h2 mb-4" id="theme-colors-title">
            Theme colors
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
            {themeColors.map(({ name, token }) => (
              <div className="min-w-0" key={token}>
                <div
                  className="h-16 rounded-sm"
                  style={{ backgroundColor: `var(--color-${token})` }}
                />
                <p className="mt-2 font-semibold">{name}</p>
                <p className="text-sm text-base-content/85">{token}</p>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="project-colors-title">
          <h2 className="h2 mb-4" id="project-colors-title">
            Project and projection colors
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(['Internal', 'Sponsored'] as const).map((type) => {
              const internal = type === 'Internal';
              return (
                <div
                  className={`border-l-4 bg-base-200 p-5 ${internal ? 'border-secondary' : 'border-info'}`}
                  key={type}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{type} projects</h3>
                    <span
                      className={`badge badge-soft ${internal ? 'badge-secondary' : 'badge-info'}`}
                    >
                      {type}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-base-content/85">
                    {internal ? 'Secondary' : 'Info'} · balances, chart labels,
                    and sidebar highlights
                  </p>
                  <dl className="mt-4">
                    <dt className="stat-label">Available balance</dt>
                    <dd
                      className={`text-3xl font-semibold tabular-nums ${internal ? 'text-secondary' : 'text-info'}`}
                    >
                      {formatCurrency(internal ? 45_000 : 82_500)}
                    </dd>
                  </dl>
                </div>
              );
            })}
          </div>
          <h3 className="mt-6 font-semibold">Projection funding sources</h3>
          <p className="mt-1 text-sm text-base-content/85">
            Funding sources use their own chart series colors across the
            forecast and staffing timeline.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index}>
                <div
                  className="h-12 rounded-sm"
                  style={{ backgroundColor: projectionSeriesColor(index) }}
                />
                <p className="mt-2 font-semibold">Source {index + 1}</p>
                <code className="text-sm text-base-content/85">
                  {projectionSeriesColor(index)}
                </code>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="spending-colors-title">
          <h2 className="h2 mb-4" id="spending-colors-title">
            Spending colors
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {Object.entries(PROJECT_SERIES_COLORS).map(([name, color]) => (
              <div key={name}>
                <div
                  className="h-12 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <p className="mt-2 font-semibold">{name}</p>
              </div>
            ))}
          </div>
          {[
            {
              categories: ['01 - Salaries and Wages', '02 - Fringe Benefits'],
              title: 'Personnel categories',
            },
            {
              categories: [
                '03 - Supplies / Services / Other Expenses',
                '04 - Equipment and Facilities',
                '05 - Contracts (Subrecipients)',
                '06 - UC Multi-Campus',
                '07 - Travel',
                '08 - Fellowship & Scholarships',
                '09 - Indirect Costs',
                '99 - Uncategorized',
              ],
              title: 'Non-personnel categories',
            },
          ].map(({ categories, title }) => (
            <div className="mt-6" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {categories.map((category) => (
                  <div key={category}>
                    <div
                      className="h-12 rounded-sm"
                      style={{
                        backgroundColor:
                          projectExpenditureCategoryColor(category),
                      }}
                    />
                    <p className="mt-2 text-sm">{category}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section aria-labelledby="buttons-title">
          <h2 className="h2 mb-4" id="buttons-title">
            Buttons and badges
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-sm" to="/admin">
              <ArrowLeftIcon className="size-4" />
              Admin Dashboard
            </Link>
            <Link className="btn btn-primary" to="/admin/users">
              <UsersIcon className="size-4" />
              User Management
            </Link>
            <Link className="btn btn-link" to="/projections">
              <ArrowTrendingUpIcon className="size-4" />
              Projections Dashboard
            </Link>
            <button className="btn" disabled type="button">
              Save plan
            </button>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {themeColors.map(({ button, name }) => (
              <button className={`btn ${button}`} key={name} type="button">
                {name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {themeColors.map(({ button, name }) => (
              <button
                className={`btn btn-soft ${button}`}
                key={name}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {themeColors.map(({ badge, name }) => (
              <span className={`badge badge-soft ${badge}`} key={name}>
                {name}
              </span>
            ))}
          </div>
        </section>
        <section aria-labelledby="admin-tools-title">
          <h2 className="h2 mb-4" id="admin-tools-title">
            Admin navigation
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {adminTools.map(({ description, Icon, title, to }) => (
              <Link
                className="border-main-border group block h-full rounded-sm border bg-base-100 p-5 transition hover:bg-[#F2F6FC] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                key={title}
                to={to}
              >
                <div className="flex items-start justify-between gap-3">
                  <Icon className="size-6" />
                  <ArrowRightIcon className="mt-1 size-5 shrink-0 text-base-content/70 transition group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <h3 className="mt-4 text-xl font-sans font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-base-content/85">
                  {description}
                </p>
              </Link>
            ))}
          </div>
        </section>
        <section aria-labelledby="summary-title">
          <h2 className="h2" id="summary-title">
            Fancy data
          </h2>
          <div className="fancy-data">
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  Icon: ClipboardDocumentListIcon,
                  label: 'Projects',
                  value: '3',
                },
                { Icon: UsersIcon, label: 'Personnel', value: '13' },
                {
                  Icon: BanknotesIcon,
                  label: 'Total Budget',
                  value: formatCurrency(445_000),
                },
                {
                  Icon: BanknotesIcon,
                  label: 'Balance',
                  value: formatCurrency(125_100),
                },
              ].map(({ Icon, label, value }) => (
                <div className="flex flex-col" key={label}>
                  <Icon className="size-4" />
                  <dt className="stat-label-lg">{label}</dt>
                  <dd className="stat-value-lg tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <section aria-labelledby="table-title">
          <h2 className="h2" id="table-title">
            Project table
          </h2>
          <p className="mt-1 mb-4 text-base-content/85">
            Search and sort the sample projects using Walter’s shared table.
          </p>
          <DataTable
            caption="Sample project balances"
            columns={projectColumns}
            data={sampleProjects}
            filterPlaceholder="Search sample projects…"
            rowHeaderColumnId="projectNumber"
          />
        </section>
        <section aria-labelledby="alerts-title">
          <h2 className="h2 mb-4" id="alerts-title">
            Alerts
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="alert alert-soft alert-info">
              <InformationCircleIcon className="size-5" />
              <span>Financial data refreshes weekly on Monday.</span>
            </div>
            <div className="alert alert-soft alert-success">
              <CheckCircleIcon className="size-5" />
              <span>Your projection plan has been saved.</span>
            </div>
            <div className="alert alert-soft alert-warning">
              <ExclamationTriangleIcon className="size-5" />
              <span>
                This project has less than 10% of its budget remaining.
              </span>
            </div>
            <div className="alert alert-soft alert-error">
              <ExclamationTriangleIcon className="size-5" />
              <span>One funding source is projected to run short.</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
