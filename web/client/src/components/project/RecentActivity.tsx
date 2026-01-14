import React from 'react';
import {
  ClipboardDocumentIcon,
  UserGroupIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';

type Metric = { danger?: boolean; icon: React.ReactNode; value: string };
type FooterItem = { label: string; value: string };

type CardModel = {
  badge?: { text: string; variant?: 'primary' | 'neutral' };
  footer?: FooterItem[];
  id: string;
  metrics?: Metric[];
  title: string;
};

const Badge = ({
  text,
  variant = 'primary',
}: {
  text: string;
  variant?: 'primary' | 'neutral';
}) => (
  <span
    className={[
      'badge badge-sm badge-outline',
      variant === 'primary' ? 'badge-primary' : 'badge-neutral',
    ].join(' ')}
  >
    {text}
  </span>
);

const MetricPill = ({ danger, icon, value }: Metric) => (
  <div className="flex items-center gap-1 text-sm text-base-content/70">
    <span className="inline-flex h-4 w-4 items-center justify-center">
      {icon}
    </span>
    <span className={danger ? 'text-error' : ''}>{value}</span>
  </div>
);

function Card({
  model,
  onClick,
}: {
  model: CardModel;
  onClick: (id: string) => void;
}) {
  return (
    <button
      aria-label={`Open ${model.title}`}
      className="card cursor-pointer bg-base-100 text-left transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => onClick(model.id)}
      type="button"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 mb-6">
            <div className="truncate text-lg font-semibold">{model.title}</div>
            {model.badge ? (
              <div className="pt-1">
                <Badge text={model.badge.text} variant={model.badge.variant} />
              </div>
            ) : null}
          </div>

          {model.metrics?.length ? (
            <div className="flex items-center gap-4 pt-0.5">
              {model.metrics.map((m, idx) => (
                <MetricPill key={idx} {...m} />
              ))}
            </div>
          ) : null}
        </div>

        {model.footer?.length ? (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {model.footer.map((f) => (
              <div key={f.label}>
                <div className="text-xs font-semibold text-base-content/60">
                  {f.label}
                </div>
                <div className="text-sm font-semibold">{f.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default function RecentActivity() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const cards: CardModel[] = [
    {
      badge: { text: 'Principal Investigator', variant: 'primary' },
      footer: [
        { label: 'Next end date', value: '11.14.2025' },
        { label: 'Remaining Funds', value: '$1,118.87' },
      ],
      id: 'pi-edward-spang',
      metrics: [
        { icon: <ClipboardDocumentIcon />, value: '88' },
        { icon: <UserGroupIcon />, value: '9' },
        { danger: true, icon: <BanknotesIcon />, value: '10%' },
      ],
      title: 'Edward Spang',
    },
    {
      badge: { text: 'Project', variant: 'primary' },
      footer: [
        { label: 'Next end date', value: '01.05.2026' },
        { label: 'Remaining Funds', value: '$222.11' },
      ],
      id: 'project-deans-office',
      metrics: [
        { icon: <UserGroupIcon />, value: '9' },
        { icon: <BanknotesIcon />, value: '22%' },
      ],
      title: 'Dean’s Office Allocation',
    },
    {
      badge: { text: 'Person', variant: 'primary' },
      footer: [
        { label: 'Contract end date', value: '03.23.2026' },
        { label: 'Remaining Funds', value: '$222.11' },
      ],
      id: 'cal-doval',
      metrics: [
        { icon: <ClipboardDocumentIcon />, value: '1' },
        { icon: <BanknotesIcon />, value: '22%' },
      ],
      title: 'Cal Doval',
    },
    {
      badge: { text: 'Project', variant: 'primary' },
      footer: [
        { label: 'Next end date', value: '01.05.2026' },
        { label: 'Remaining Funds', value: '$222.11' },
      ],
      id: 'project-deans-office-3',
      metrics: [
        { icon: <UserGroupIcon />, value: '9' },
        { icon: <BanknotesIcon />, value: '22%' },
      ],
      title: 'Dean’s Office Allocation',
    },
  ];

  const handleClick = (id: string) => {
    setSelectedId(id);
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 px-2 py-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.id} model={c} onClick={handleClick} />
      ))}
    </div>
  );
}
