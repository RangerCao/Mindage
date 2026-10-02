import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { queryTextStream } from '@/api/lightrag'
import { ChatMessage, MessageWithError } from '@/components/retrieval/ChatMessage'
import ChatComposer from '@/components/chat/ChatComposer'
import JumpToLatest from '@/components/chat/JumpToLatest'
import { SparklesIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const userPromptHistory = useSettingsStore.use.userPromptHistory()
  const addUserPromptToHistory = useSettingsStore.use.addUserPromptToHistory()

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  // Track scroll position to decide whether to auto-scroll / show JumpToLatest
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      setPinned(dist < 80)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll only while pinned
  useEffect(() => {
    if (!pinned) return
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pinned])

  // rAF-coalesced stream buffer — caps setState at ~60Hz
  const flushRef = useRef<{ buffer: string; raf: number | null }>({ buffer: '', raf: null })
  const scheduleFlush = useCallback((apply: (chunk: string) => void) => {
    const state = flushRef.current
    return (chunk: string) => {
      state.buffer += chunk
      if (state.raf == null) {
        state.raf = requestAnimationFrame(() => {
          const b = state.buffer
          state.buffer = ''
          state.raf = null
          if (b) apply(b)
        })
      }
    }
  }, [])

  const send = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || loading) return
    setInput('')
    addUserPromptToHistory(text)
    setPinned(true)

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

    const applyChunk = scheduleFlush((chunk: string) => {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') last.content += chunk
        return next
      })
    })

    const queryParams = {
      ...querySettings,
      query: text,
      stream: true,
      response_type: 'Multiple Paragraphs',
    }

    let errorBuf = ''
    try {
      await queryTextStream(queryParams, applyChunk, (e: string) => { errorBuf += e }, controller.signal)
      if (errorBuf) {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') {
            last.content = (last.content || '') + '\n' + errorBuf
            last.isError = true
          }
          return next
        })
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') last.isAborted = true
          return next
        })
      } else {
        toast.error(errorMessage(err))
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, loading, querySettings, scheduleFlush, addUserPromptToHistory])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setRetrievalHistory([])
  }, [setRetrievalHistory])

  const regenerate = useCallback(() => {
    // Drop trailing assistant messages then resend the last user prompt
    setMessages((prev) => {
      const next = [...prev]
      while (next.length && next[next.length - 1].role === 'assistant') next.pop()
      // schedule resend
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'user') {
          setTimeout(() => send(next[i].content), 0)
          break
        }
      }
      return next
    })
  }, [send])

  // Chat page is only active when on the "chat" tab
  if (currentTab !== 'chat') return null

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('chat.messagesRegion', 'Conversation messages')}
        className="relative flex-1 overflow-y-auto px-4 py-4 scrollbar-thin bg-[image:radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/5 dark:from-emerald-400/5 via-transparent to-transparent"
      >
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-emerald-200/40 dark:border-emerald-700/30 bg-card/70 p-8 shadow-xl shadow-emerald-950/5 dark:shadow-emerald-500/10 backdrop-blur-md"
            >
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
                    className="hover-lift rounded-full border border-border/40 bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-accent-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1
            const isStreaming = loading && isLast && msg.role === 'assistant'
            return (
              <motion.div
                key={msg.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`group ${msg.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto w-[95%]'} mb-3`}
              >
                <ChatMessage
                  message={msg}
                  isStreaming={isStreaming}
                  onRegenerate={msg.role === 'assistant' ? regenerate : undefined}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>

        <div ref={endRef} />
        <JumpToLatest
          visible={!pinned && messages.length > 0}
          label={t('chat.jumpToLatest', 'Jump to latest ↓')}
          ariaLabel={t('chat.jumpToLatestAria', 'Jump to latest message')}
          onClick={() => {
            endRef.current?.scrollIntoView({ behavior: 'smooth' })
            setPinned(true)
          }}
        />
      </div>

      {/* Input area */}
      <div className="border-t border-border/20 bg-card/40 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={() => send()}
          onStop={stop}
          onClear={messages.length > 0 ? clear : undefined}
          isStreaming={loading}
          history={userPromptHistory}
          onPickHistory={(v) => setInput(v)}
          placeholder={t('chat.inputPlaceholder', 'Ask something...')}
        />
      </div>
    </div>
  )
}
