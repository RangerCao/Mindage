import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCwIcon, GitBranchIcon, DatabaseIcon } from 'lucide-react'
import { listTrees, getTree, TreeMeta, TreeStructure } from '@/api/lightrag'
import { ScrollArea } from '@/components/ui/ScrollArea'
import TreeCanvas from '@/components/TreeCanvas'

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <GitBranchIcon className="size-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-medium mb-1">{t('treeViewer.noTrees', 'No Tree Indexes')}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {t('treeViewer.noTreesDesc', 'Tree indexes are built automatically when documents are processed with PageIndex enabled. Enable ENABLE_PAGEINDEX=true in your .env file.')}
      </p>
      <p className="text-xs text-muted-foreground/60 mb-4">
        {t('treeViewer.noTreesHint', 'After enabling, upload a document and wait for processing to complete.')}
      </p>
      <button
        onClick={onRefresh}
        className="inline-flex items-center gap-1 rounded-md border border-border/40 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-accent"
      >
        <RefreshCwIcon className="size-3.5" />
        {t('treeViewer.refresh', 'Refresh')}
      </button>
    </div>
  )
}

// ── Disabled State ─────────────────────────────────────────────────────────

function DisabledState() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <DatabaseIcon className="size-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-medium mb-1">{t('treeViewer.disabled', 'Tree Index Disabled')}</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {t('treeViewer.disabledDesc', 'Set ENABLE_PAGEINDEX=true in your .env file and restart the server to enable tree index generation.')}
      </p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

const POLL_INTERVAL = 5000 // ms

export default function TreeViewer() {
  const { t } = useTranslation()
  const [trees, setTrees] = useState<TreeMeta[]>([])
  const [enabled, setEnabled] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<TreeStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firstDocIdRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listTrees()
      setTrees(data.trees)
      setEnabled(data.enabled)

      // Auto-select new tree if none selected, or if the first doc changed
      if (data.trees.length > 0) {
        const currentFirst = data.trees[0].doc_id
        if (!selectedDoc || currentFirst !== firstDocIdRef.current) {
          // Check if selectedDoc still exists in the list
          const stillExists = data.trees.some((t) => t.doc_id === selectedDoc)
          if (!stillExists) {
            setSelectedDoc(currentFirst)
          }
          firstDocIdRef.current = currentFirst
        }
      } else {
        setSelectedDoc(null)
      }
    } catch (_) {
      setEnabled(false)
    } finally {
      setLoading(false)
    }
  }, [selectedDoc])

  // Initial load
  useEffect(() => { refresh() }, [])

  // Auto-poll for new trees
  useEffect(() => {
    pollRef.current = setInterval(refresh, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh])

  // Load tree data when selected document changes
  useEffect(() => {
    if (!selectedDoc) { setTreeData(null); return }
    setLoading(true)
    getTree(selectedDoc)
      .then(setTreeData)
      .catch(() => setTreeData(null))
      .finally(() => setLoading(false))
  }, [selectedDoc])

  if (!enabled) return <DisabledState />

  return (
    <div className="flex h-full w-full gap-3 px-1 py-1">
      {/* Left sidebar: document list */}
      <aside className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-card/50">
        <div className="flex items-center justify-between border-b-2 border-gray-300 dark:border-gray-700 px-3 py-2">
          <span className="text-xs font-medium text-foreground/70">{t('treeViewer.documents', 'Documents')}</span>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <RefreshCwIcon className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden px-1 py-1">
          {trees.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t('treeViewer.noDocuments', 'No documents with tree indexes')}
            </p>
          ) : (
            <ScrollArea className="h-full max-h-[calc(100vh-10rem)]">
              <div className="space-y-0.5">
                {trees.map((meta) => (
                  <button
                    key={meta.doc_id}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      selectedDoc === meta.doc_id
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'hover:bg-accent/50'
                    }`}
                    onClick={() => setSelectedDoc(meta.doc_id)}
                  >
                    <div className="truncate font-medium">{meta.title || meta.doc_id}</div>
                    <div className="text-[10px] text-muted-foreground/60">
                      {meta.node_count} {t('treeViewer.nodes', 'nodes')}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </aside>

      {/* Main: canvas tree view */}
      <div className="flex flex-1 flex-col min-w-0">
        {treeData ? (
          <TreeCanvas tree={treeData} />
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('treeViewer.loading', 'Loading...')}
          </div>
        ) : trees.length > 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('treeViewer.selectDoc', 'Select a document to view its tree structure')}
          </div>
        ) : (
          <EmptyState onRefresh={refresh} />
        )}
      </div>
    </div>
  )
}
