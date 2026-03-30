import { useId, useState } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';

interface TooltipLabelProps {
  className?: string;
  label: string;
  labelClassName?: string;
  placement?: 'bottom' | 'left' | 'right' | 'top';
  tooltip: string;
}

export function TooltipLabel({
  className,
  label,
  labelClassName,
  placement = 'top',
  tooltip,
}: TooltipLabelProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const { context, floatingStyles, refs } = useFloating({
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    onOpenChange: setOpen,
    open,
    placement,
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    delay: { close: 0, open: 150 },
    move: false,
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const triggerClasses = ['tooltip-trigger'];
  const labelClasses = ['tooltip-label'];

  if (className) {
    triggerClasses.push(className);
  }
  if (labelClassName) {
    labelClasses.push(labelClassName);
  }

  return (
    <>
      <span
        {...getReferenceProps({
          className: triggerClasses.join(' '),
          tabIndex: 0,
        })}
        data-tooltip-placement={placement}
        ref={refs.setReference}
      >
        <span className={labelClasses.join(' ')}>{label}</span>
      </span>
      {open ? (
        <FloatingPortal>
          <div
            {...getFloatingProps({
              className: 'floating-tooltip',
              id: tooltipId,
              ref: refs.setFloating,
              style: floatingStyles,
            })}
          >
            {tooltip}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
