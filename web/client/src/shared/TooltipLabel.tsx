import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { FloatingPortal } from '@floating-ui/react';

interface TooltipDrawerProps {
  drawerStyle?: 'compact' | 'default' | 'spotlight';
  label: string;
  tooltip: ReactNode;
  trigger: (options: {
    open: boolean;
    openDrawer: () => void;
    panelId: string;
  }) => ReactNode;
}

interface TooltipLabelProps {
  className?: string;
  drawerStyle?: 'compact' | 'default' | 'spotlight';
  label: string;
  labelClassName?: string;
  placement?: 'bottom' | 'left' | 'right' | 'top';
  tooltip: ReactNode;
}

interface TooltipIconButtonProps {
  className?: string;
  drawerStyle?: 'compact' | 'default' | 'spotlight';
  label: string;
  tooltip: ReactNode;
}

const drawerClassNames = {
  compact: {
    body: 'tooltip-drawer-copy tooltip-drawer-copy-compact',
    surface: 'tooltip-drawer-surface tooltip-drawer-surface-compact',
  },
  default: {
    body: 'tooltip-drawer-copy',
    surface: 'tooltip-drawer-surface',
  },
  spotlight: {
    body: 'tooltip-drawer-copy tooltip-drawer-copy-spotlight',
    surface: 'tooltip-drawer-surface tooltip-drawer-surface-spotlight',
  },
} as const;

function TooltipDrawer({
  drawerStyle = 'default',
  label,
  tooltip,
  trigger,
}: TooltipDrawerProps) {
  const [open, setOpen] = useState(false);
  const drawerPanelId = useId();
  const drawerTitleId = useId();
  const drawerDescriptionId = useId();
  const drawerClasses = drawerClassNames[drawerStyle];

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const closeDrawer = (event?: MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    setOpen(false);
  };

  return (
    <>
      {trigger({
        open,
        openDrawer: () => setOpen(true),
        panelId: drawerPanelId,
      })}
      {open ? (
        <FloatingPortal>
          <div className="tooltip-drawer-frame">
            <button
              aria-label={`Dismiss ${label} help`}
              className="tooltip-drawer-overlay"
              onClick={(event) => closeDrawer(event)}
              type="button"
            />
            <aside
              aria-describedby={drawerDescriptionId}
              aria-labelledby={drawerTitleId}
              aria-modal="true"
              className="tooltip-drawer-shell"
              id={drawerPanelId}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className={drawerClasses.surface}>
                <div className="tooltip-drawer-header">
                  <div className="min-w-0">
                    <p className="tooltip-drawer-eyebrow">Field help</p>
                    <h2 className="tooltip-drawer-title" id={drawerTitleId}>
                      {label}
                    </h2>
                  </div>
                  <button
                    aria-label={`Close ${label} help`}
                    className="btn btn-ghost btn-sm"
                    onClick={(event) => closeDrawer(event)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div className="tooltip-drawer-body">
                  <div className={drawerClasses.body} id={drawerDescriptionId}>
                    {typeof tooltip === 'string' ? <p>{tooltip}</p> : tooltip}
                  </div>
                  <div className="tooltip-drawer-footer">
                    <span className="badge badge-outline badge-lg">Right drawer</span>
                    <p>Tap outside the panel or press Escape to close.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export function TooltipLabel({
  className,
  drawerStyle = 'default',
  label,
  labelClassName,
  placement = 'top',
  tooltip,
}: TooltipLabelProps) {
  const triggerClasses = ['tooltip-trigger'];
  const labelClasses = ['tooltip-label'];

  if (className) {
    triggerClasses.push(className);
  }
  if (labelClassName) {
    labelClasses.push(labelClassName);
  }

  return (
    <TooltipDrawer
      drawerStyle={drawerStyle}
      label={label}
      tooltip={tooltip}
      trigger={({ open, openDrawer, panelId }) => (
        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={triggerClasses.join(' ')}
          data-tooltip-placement={placement}
          onClick={openDrawer}
          type="button"
        >
          <span className={labelClasses.join(' ')}>{label}</span>
        </button>
      )}
    />
  );
}

export function TooltipIconButton({
  className,
  drawerStyle = 'compact',
  label,
  tooltip,
}: TooltipIconButtonProps) {
  const triggerClasses = ['tooltip-icon-trigger'];

  if (className) {
    triggerClasses.push(className);
  }

  return (
    <TooltipDrawer
      drawerStyle={drawerStyle}
      label={label}
      tooltip={tooltip}
      trigger={({ open, openDrawer, panelId }) => (
        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Open ${label} help`}
          className={triggerClasses.join(' ')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openDrawer();
          }}
          type="button"
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </button>
      )}
    />
  );
}
