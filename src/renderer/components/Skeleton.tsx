interface SkeletonProps {
  /** A line of text, or a block whose size the owner sets. */
  variant?: 'line' | 'block';
  short?: boolean;
}

// Static: a skeleton never animates, and says nothing to assistive technology.
export function Skeleton({ variant = 'line', short = false }: SkeletonProps) {
  return (
    <span
      className={`skeleton skeleton-${variant}${short ? ' skeleton-short' : ''}`}
      data-skeleton={variant}
      data-short={short ? '' : undefined}
      aria-hidden="true"
    />
  );
}
