import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { queryTextStream } from '@/api/lightrag'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { ChatMessage, MessageWithError } from '@/components/retrieval/ChatMessage'
import { SendIcon, SquareIcon, EraserIcon, SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/utils'

const generateId = () => crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

const SUGGESTED_PROMPTS = [
  'What documents are available?',
  'Summarize the knowledge graph',
  'Search for recent topics',
]

export default function ChatView() {
  const { t } = useTranslation()
  const retrievalHistory = useSettingsStore.use.retrievalHistory()
  const setRetrievalHistory = useSettingsStore.use.setRetrievalHistory()
  const querySettings = useSettingsStore.use.querySettings()
  const currentTab = useSettingsStore.use.currentTab()

  const [messages, setMessages] = useState<MessageWithError[]>(() =>
    (retrievalHistory || []).map((msg, i) => ({
      ...msg,
      id: (msg as any).id || `hist-${i}`,
      mermaidRendered: true,
      latexRendered: true,
    }))
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: MessageWithError = {
      id: generateId(),
      role: 'user',
      content: text,
      mermaidRendered: true,
      latexRendered: true,
    }
    const assistantMsg: MessageWithError = {
      id: generateId(),
      role: 'assistant',
      content: '',
      mermaidRendered: false,
      latexRendered: false,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    const updateAssistant = (chunk: string) => {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') {
          last.content += chunk
        }
        return next
      })
    }

    const queryParams = {
      ...querySettings,
      query: text,
      stream: true,
      response_type: 'Multiple Paragraphs',
    }

    try {
      let errorMsg = ''
      await queryTextStream(queryParams, updateAssistant, (error: string) => {
        errorMsg += error
      }, controller.signal)
      if (errorMsg) {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') {
            last.content = (last.content || '') + '\n' + errorMsg
            last.isError = true
          }
          return next
        })
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error(errorMessage(err))
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, loading, querySettings])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setRetrievalHistory([])
  }, [setRetrievalHistory])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    },
    [send]
  )

  // Chat page is only active when on the "chat" tab
  if (currentTab !== 'chat') return null

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin bg-[image:radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 dark:from-emerald-400/5 via-transparent to-transparent">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-xl border border-emerald-200/40 dark:border-emerald-700/30 bg-card/70 p-8 shadow-xl shadow-emerald-950/5 dark:shadow-emerald-500/10 backdrop-blur-md">
              <SparklesIcon className="mx-auto mb-4 size-12 text-emerald-400" />
              <h2 className="mb-2 text-xl font-semibold">{t('chat.welcome', 'Hello! How can I help you?')}</h2>
              <p className="mb-6 max-w-md text-sm text-muted-foreground">
                {t('chat.welcomeDesc', 'Ask questions about your documents, search the knowledge graph, or explore your data.')}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(p)}
                    className="rounded-full border border-border/40 bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:bg-secondary hover:text-accent-foreground hover:shadow-md"
                  >
                    {p}
                  </button>
                ))}
            </div>
          </div>
        </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${msg.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto w-[95%]'} mb-3`}
          >
            <ChatMessage message={msg} />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/20 bg-card/40 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder', 'Ask something...')}
            className="min-h-[44px] max-h-[120px] resize-none"
            rows={1}
            disabled={loading}
          />
          <div className="flex gap-1">
            {loading ? (
              <Button onClick={stop} variant="destructive" size="icon" title={t('chat.stop', 'Stop')}>
                <SquareIcon className="size-4" />
              </Button>
            ) : (
              <Button onClick={send} size="icon" disabled={!input.trim()} title={t('chat.send', 'Send')}>
                <SendIcon className="size-4" />
              </Button>
            )}
            {messages.length > 0 && (
              <Button onClick={clear} variant="ghost" size="icon" title={t('chat.clear', 'Clear')}>
                <EraserIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
