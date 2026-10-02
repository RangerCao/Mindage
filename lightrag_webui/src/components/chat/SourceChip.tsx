import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SourceChipProps {
  index: number
  onJump: () => void
  active?: boolean
  ariaLabel?: string
}

/** Inline `[n]` reference chip with hover pop and active glow. */
export default function SourceChip({ index, onJump, active, ariaLabel }: SourceChipProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onJump}
      aria-label={ariaLabel ?? `Jump to source ${index}`}
      aria-pressed={active}
      className={cn(
        'mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 align-baseline',
        'text-[11px] font-semibold tabular-nums',
        'bg-primary/10 text-primary ring-1 ring-primary/20',
        'transition-[background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:bg-primary hover:text-primary-foreground hover:ring-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        active && 'bg-primary text-primary-foreground ring-primary shadow-[0_0_0_4px_var(--primary-glow)]'
      )}
    >
      {index}
    </motion.button>
  )
}
