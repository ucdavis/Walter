import type { CSSProperties } from 'react';
import { useId, useState } from 'react';
import {
  autoUpdate,
  arrow,
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
  const [arrowElement, setArrowElement] = useState<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const {
    context,
    floatingStyles,
    middlewareData,
    placement: resolvedPlacement,
    refs: { setFloating, setReference },
  } = useFloating({
    middleware: [
      offset(12),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: arrowElement }),
    ],
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

  const staticSideByPlacement = {
    bottom: 'top',
    left: 'right',
    right: 'left',
    top: 'bottom',
  } as const;
  const basePlacement = resolvedPlacement.split('-')[0] as keyof typeof staticSideByPlacement;
  const staticSide = staticSideByPlacement[basePlacement];
  const arrowStyle: CSSProperties = {};

  if (middlewareData.arrow?.x != null) {
    arrowStyle.left = `${middlewareData.arrow.x}px`;
  }

  if (middlewareData.arrow?.y != null) {
    arrowStyle.top = `${middlewareData.arrow.y}px`;
  }

  arrowStyle[staticSide] = '-5px';

  return (
    <>
      <span
        {...getReferenceProps({
          className: triggerClasses.join(' '),
          tabIndex: 0,
        })}
        data-tooltip-placement={placement}
        ref={setReference}
      >
        <span className={labelClasses.join(' ')}>{label}</span>
      </span>
      {open ? (
        <FloatingPortal>
          <div
            {...getFloatingProps({
              className: 'floating-tooltip',
              id: tooltipId,
              style: floatingStyles,
            })}
            ref={setFloating}
          >
            <div
              aria-hidden="true"
              className="floating-tooltip-arrow"
              ref={setArrowElement}
              style={arrowStyle}
            />
            {tooltip}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
