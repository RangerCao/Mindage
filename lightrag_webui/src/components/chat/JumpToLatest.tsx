import { motion, AnimatePresence } from 'framer-motion'

interface JumpToLatestProps {
  visible: boolean
  onClick: () => void
  label?: string
  /** Accessible name for screen readers. Defaults to label. */
  ariaLabel?: string
}

/** Floating "Jump to latest" pill, animated in when user scrolls up. */
export default function JumpToLatest({ visible, onClick, label, ariaLabel }: JumpToLatestProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? label ?? 'Jump to latest message'}
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="sticky bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {label ?? 'Jump to latest ↓'}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
