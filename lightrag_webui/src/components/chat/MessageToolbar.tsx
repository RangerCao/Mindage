import { RotateCcw, Clipboard, ThumbsUp, ThumbsDown } from 'lucide-react'
import Button from '@/components/ui/Button'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from 'sonner'

interface MessageToolbarProps {
  content: string
  onRegenerate?: () => void
}

/** Hover-revealed toolbar for assistant messages: regen, copy, feedback. */
export default function MessageToolbar({ content, onRegenerate }: MessageToolbarProps) {
  const handleCopy = () => {
    copyToClipboard(content)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Copy failed'))
  }

  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {onRegenerate && (
        <Button variant="ghost" size="icon" tooltip="Regenerate" onClick={onRegenerate}>
          <RotateCcw className="size-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" tooltip="Copy" onClick={handleCopy}>
        <Clipboard className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" tooltip="Helpful">
        <ThumbsUp className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" tooltip="Not helpful">
        <ThumbsDown className="size-3.5" />
      </Button>
    </div>
  )
}
