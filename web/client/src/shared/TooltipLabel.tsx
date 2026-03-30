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
  const classes = [
    'tooltip',
    `tooltip-${placement}`,
    'inline-block',
    'tooltip-trigger',
  ];
  const labelClasses = ['tooltip-label'];

  if (className) {
    classes.push(className);
  }
  if (labelClassName) {
    labelClasses.push(labelClassName);
  }

  return (
    <span
      aria-description={tooltip}
      className={classes.join(' ')}
      data-tip={tooltip}
      tabIndex={0}
    >
      <span className={labelClasses.join(' ')}>{label}</span>
    </span>
  );
}
