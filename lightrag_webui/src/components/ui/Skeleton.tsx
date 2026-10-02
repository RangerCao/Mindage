import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional rounded radius override; defaults to subtle 'rounded-md'. */
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

const ROUNDED_CLASS: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}

/**
 * Animated placeholder block used while content is loading.
 * The shimmer respects `prefers-reduced-motion` via a CSS media query
 * defined in `src/index.css`.
 */
export function Skeleton({ className, rounded = 'md', ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'relative overflow-hidden bg-muted/60',
        ROUNDED_CLASS[rounded],
        className
      )}
      {...props}
    >
      <div className="skeleton-shimmer absolute inset-0" aria-hidden="true" />
    </div>
  )
}

/** Multi-line text skeleton with sensible defaults for paragraphs. */
export function SkeletonText({
  lines = 3,
  className,
  ...props
}: { lines?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className={cn('space-y-2', className)}
      {...props}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          rounded="sm"
          className="h-3"
          style={{ width: `${Math.max(60, 100 - i * 12)}%` }}
        />
      ))}
    </div>
  )
}