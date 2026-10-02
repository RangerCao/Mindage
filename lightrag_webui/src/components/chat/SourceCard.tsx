import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface SourceCardItem {
  index: number
  title: string
  snippet: string
  score?: number
}

interface SourceCardProps extends SourceCardItem {
  onJump: () => void
  active?: boolean
}

/** Side-panel source card; hover lifts, active state glows. */
export default function SourceCard({ index, title, snippet, score, onJump, active }: SourceCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onJump}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      aria-pressed={active}
      aria-label={`Jump to source ${index}: ${title}`}
      className={cn(
        'group block w-full rounded-xl border bg-card/80 p-3 text-left backdrop-blur-sm',
        'transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:shadow-md hover:border-primary/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active && 'border-primary shadow-glow'
      )}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate font-mono">
          [{index}] {title}
        </span>
        {typeof score === 'number' && (
          <span className="ml-2 shrink-0 tabular-nums">{(score * 100).toFixed(0)}%</span>
        )}
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">{snippet}</p>
    </motion.button>
  )
}
