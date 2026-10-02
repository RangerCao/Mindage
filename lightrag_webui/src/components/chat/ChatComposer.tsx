import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Send, Square, Eraser, Paperclip, CornerDownLeft, History } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'

interface ChatComposerProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onStop?: () => void
  onClear?: () => void
  isStreaming: boolean
  placeholder?: string
  history?: string[]
  onPickHistory?: (v: string) => void
}

const MIN_H = 44
const MAX_H = 160

/**
 * Sticky-bottom chat input with:
 *  - auto-grow height (44 → 160)
 *  - focus glow + drag-over highlight
 *  - keyboard shortcuts: ⌘/Ctrl+Enter send, Esc stop
 *  - accessible labels + reduced-motion safe
 */
export default function ChatComposer(props: ChatComposerProps) {
  const {
    value, onChange, onSubmit, onStop, onClear,
    isStreaming, placeholder, history, onPickHistory,
  } = props
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [drag, setDrag] = useState(false)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    const next = Math.min(MAX_H, Math.max(MIN_H, ta.scrollHeight))
    ta.style.height = `${next}px`
  }, [value])

  // Keep cursor in view when text grows
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    const id = window.setTimeout(() => {
      const caret = ta.selectionStart ?? value.length
      // measure a fake range up to caret
      ta.setSelectionRange(caret, caret)
    }, 0)
    return () => window.clearTimeout(id)
  }, [value])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        if (!isStreaming && value.trim()) onSubmit()
      } else if (e.key === 'Escape' && isStreaming) {
        e.preventDefault()
        onStop?.()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isStreaming, value, onSubmit, onStop])

  const onFiles = useCallback((_files: FileList | null) => {
    /* hook for future: feed uploaded filenames back into textarea as refs */
  }, [])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
      className={cn(
        'relative mx-auto w-full max-w-3xl rounded-2xl border bg-card/80 px-3 py-2 backdrop-blur-md shadow-sm',
        'transition-[box-shadow,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        focused && 'border-primary/50 shadow-glow',
        drag && 'border-primary ring-2 ring-primary/30 bg-primary/5'
      )}
    >
      <AnimatePresence>
        {drag && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/10 text-sm font-medium text-primary"
          >
            Drop files to attach as reference
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!isStreaming && value.trim()) onSubmit()
          }
        }}
        rows={1}
        placeholder={placeholder ?? 'Ask anything · Enter to send · Shift+Enter for newline'}
        aria-label="Message input"
        className="block w-full resize-none bg-transparent px-2 py-2 text-base leading-6 placeholder:text-muted-foreground/70 focus:outline-none"
        style={{ minHeight: MIN_H, maxHeight: MAX_H }}
      />

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" aria-hidden="true" />
          <span>Drop files to attach</span>
          <span className="mx-2 h-3 w-px bg-border" />
          <CornerDownLeft className="size-3.5" aria-hidden="true" />
          <span>Enter</span>
          <span className="mx-1">·</span>
          <span>Shift+Enter newline</span>
        </div>
        <div className="flex items-center gap-1">
          {history && history.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              tooltip="History"
              onClick={() => onPickHistory?.(history[history.length - 1])}
            >
              <History className="size-4" />
            </Button>
          )}
          {onClear && (
            <Button variant="ghost" size="icon" tooltip="Clear" onClick={onClear}>
              <Eraser className="size-4" />
            </Button>
          )}
          {isStreaming ? (
            <Button variant="destructive" size="icon" tooltip="Stop (Esc)" onClick={onStop}>
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              tooltip="Send (⌘↵)"
              onClick={onSubmit}
              disabled={!value.trim()}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
