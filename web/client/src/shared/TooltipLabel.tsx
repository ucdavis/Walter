import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import { cloneElement, isValidElement, useState } from 'react';
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
  useMergeRefs,
} from '@floating-ui/react';

type TooltipChildProps = HTMLAttributes<HTMLElement> & {
  'data-tooltip-placement'?: string;
  ref?: Ref<HTMLElement>;
};

interface TooltipLabelProps {
  asChild?: boolean;
  className?: string;
  label: ReactNode;
  labelClassName?: string;
  placement?: 'bottom' | 'left' | 'right' | 'top';
  tooltip?: string;
}

export function TooltipLabel({
  asChild = false,
  className,
  label,
  labelClassName,
  placement = 'top',
  tooltip,
}: TooltipLabelProps) {
  const [open, setOpen] = useState(false);
  const [arrowElement, setArrowElement] = useState<HTMLDivElement | null>(null);
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
  const enabled = Boolean(tooltip);
  const hover = useHover(context, {
    delay: { close: 0, open: 150 },
    enabled,
    move: false,
  });
  const focus = useFocus(context, { enabled });
  const dismiss = useDismiss(context, { enabled });
  const role = useRole(context, { enabled, role: 'tooltip' });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const triggerClasses = ['tooltip-trigger'];
  const child =
    asChild && isValidElement<TooltipChildProps>(label) ? label : null;
  const referenceRef = useMergeRefs([setReference, child?.props.ref]);

  if (!tooltip) {
    return <>{label}</>;
  }

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
  const basePlacement = resolvedPlacement.split(
    '-'
  )[0] as keyof typeof staticSideByPlacement;
  const staticSide = staticSideByPlacement[basePlacement];
  const arrowStyle: CSSProperties = {};

  if (middlewareData.arrow?.x != null) {
    arrowStyle.left = `${middlewareData.arrow.x}px`;
  }

  if (middlewareData.arrow?.y != null) {
    arrowStyle.top = `${middlewareData.arrow.y}px`;
  }

  arrowStyle[staticSide] = '-5px';

  const reference = child ? (
    cloneElement(child, {
      ...getReferenceProps({
        ...child.props,
        ref: referenceRef,
      }),
      'data-tooltip-placement': placement,
    })
  ) : (
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
  );

  return (
    <>
      {reference}
      {open ? (
        <FloatingPortal>
          <div
            {...getFloatingProps({
              className: 'floating-tooltip',
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
