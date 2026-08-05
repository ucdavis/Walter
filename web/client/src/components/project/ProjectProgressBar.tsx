import type { CSSProperties } from 'react';

export interface ProjectProgressBarSegment {
  color: string;
  label: string;
  width: number;
}

interface ProjectProgressBarProps {
  ariaLabel: string;
  segments: ProjectProgressBarSegment[];
  style?: CSSProperties;
}

export function ProjectProgressBar({
  ariaLabel,
  segments,
  style,
}: ProjectProgressBarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex h-3 overflow-hidden rounded-sm bg-base-300"
      role="img"
      style={style}
    >
      {segments
        .filter((segment) => segment.width > 0)
        .map((segment) => (
          <span
            aria-hidden="true"
            className="block h-full"
            key={segment.label}
            style={{
              backgroundColor: segment.color,
              width: `${segment.width}%`,
            }}
          />
        ))}
    </div>
  );
}
