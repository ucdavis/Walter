interface TooltipLabelProps {
  className?: string;
  label: string;
  tooltip: string;
}

export function TooltipLabel({ className, label, tooltip }: TooltipLabelProps) {
  const classes = ['tooltip', 'tooltip-top', 'inline-block', 'tooltip-label'];

  if (className) {
    classes.push(className);
  }

  return (
    <span
      aria-description={tooltip}
      className={classes.join(' ')}
      data-tip={tooltip}
      tabIndex={0}
    >
      {label}
    </span>
  );
}
