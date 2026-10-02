import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { FilesIcon } from 'lucide-react'

export type StateViewKind = 'empty' | 'loading' | 'error' | 'no-results'

interface StateViewProps {
  state?: StateViewKind
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  skeletonRows?: number
  className?: string
}

/** Reusable empty / loading / error / no-results surface with motion + skeleton. */
export default function StateView({
  state = 'empty',
  title,
  description,
  action,
  icon: Icon = FilesIcon,
  skeletonRows = 5,
  className,
}: StateViewProps) {
  if (state === 'loading') {
    return (
      <div className={cn('w-full space-y-3 p-6', className)} role="status" aria-live="polite" aria-label="Loading">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton
            key={i}
            rounded="lg"
            className="h-14 w-full"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    )
  }

  const tint =
    state === 'error'
      ? 'border-destructive/40 text-destructive'
      : state === 'no-results'
        ? 'border-amber-400/40 text-amber-600 dark:text-amber-400'
        : 'border-border text-muted-foreground'

  return (
    <Card
      className={cn(
        'flex min-h-[40vh] w-full flex-col items-center justify-center space-y-5 rounded-2xl bg-transparent p-10 text-center',
        'animate-fade-up',
        className
      )}
    >
      <div className={cn('rounded-full border border-dashed p-4', tint)}>
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {action}
    </Card>
  )
}
