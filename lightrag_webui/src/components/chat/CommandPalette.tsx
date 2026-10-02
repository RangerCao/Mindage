import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import {
  MessageSquare,
  FileText,
  Library,
  Network,
  TreePine,
  Radar,
  Search,
  Code,
  Share2,
  Users,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/Command'

type Tab =
  | 'chat' | 'tree-mind-expand' | 'documents' | 'knowledge-base'
  | 'knowledge-graph' | 'tree-view' | 'retrieval' | 'api'
  | 'mcp-servers' | 'users'

interface Item { id: string; label: string; icon: React.ReactNode; onSelect: () => void; hint?: string }

/** Global ⌘/Ctrl+K palette. Pages + theme switch. */
export default function CommandPalette() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const setCurrentTab = useSettingsStore.use.setCurrentTab()
  const theme = useSettingsStore.use.theme()
  const setTheme = useSettingsStore.use.setTheme()

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const pages = useMemo<Item[]>(() => [
    { id: 'chat',             label: t('sidebar.chat', 'Chat'),             icon: <MessageSquare className="size-4" />, onSelect: () => setCurrentTab('chat' as Tab) },
    { id: 'tree-mind-expand', label: t('sidebar.treeMindExpand', 'Mind Explore'), icon: <Radar className="size-4" />, onSelect: () => setCurrentTab('tree-mind-expand' as Tab) },
    { id: 'documents',        label: t('sidebar.documents', 'Documents'),   icon: <FileText className="size-4" />, onSelect: () => setCurrentTab('documents' as Tab) },
    { id: 'knowledge-base',   label: t('sidebar.knowledgeBase', 'Knowledge Bases'), icon: <Library className="size-4" />, onSelect: () => setCurrentTab('knowledge-base' as Tab) },
    { id: 'knowledge-graph',  label: t('sidebar.knowledgeGraph', 'Knowledge Graph'), icon: <Network className="size-4" />, onSelect: () => setCurrentTab('knowledge-graph' as Tab) },
    { id: 'tree-view',        label: t('sidebar.treeView', 'Tree View'),    icon: <TreePine className="size-4" />, onSelect: () => setCurrentTab('tree-view' as Tab) },
    { id: 'retrieval',        label: t('sidebar.retrieval', 'Retrieval'),   icon: <Search className="size-4" />, onSelect: () => setCurrentTab('retrieval' as Tab) },
    { id: 'api',              label: t('sidebar.api', 'API'),               icon: <Code className="size-4" />, onSelect: () => setCurrentTab('api' as Tab) },
    { id: 'mcp-servers',      label: t('sidebar.mcp', 'MCP Servers'),       icon: <Share2 className="size-4" />, onSelect: () => setCurrentTab('mcp-servers' as Tab) },
    { id: 'users',            label: t('sidebar.users', 'Users'),           icon: <Users className="size-4" />, onSelect: () => setCurrentTab('users' as Tab) },
  ], [t, setCurrentTab])

  const themes = useMemo<Item[]>(() => [
    { id: 'theme-light', label: t('settings.light', 'Light'), icon: <Sun className="size-4" />, onSelect: () => setTheme('light') },
    { id: 'theme-dark',  label: t('settings.dark', 'Dark'),   icon: <Moon className="size-4" />, onSelect: () => setTheme('dark') },
    { id: 'theme-sys',   label: t('settings.system', 'System'), icon: <Monitor className="size-4" />, onSelect: () => setTheme('system') },
  ], [t, setTheme])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t('command.placeholder', 'Search pages, docs, actions…')} />
      <CommandList>
        <CommandEmpty>{t('command.empty', 'No results.')}</CommandEmpty>
        <CommandGroup heading={t('command.pages', 'Pages')}>
          {pages.map((p) => (
            <CommandItem key={p.id} value={p.label} onSelect={() => { p.onSelect(); setOpen(false) }}>
              {p.icon}<span>{p.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t('command.theme', 'Theme')}>
          {themes.map((th) => (
            <CommandItem key={th.id} value={th.label} onSelect={() => { th.onSelect(); setOpen(false) }}>
              {th.icon}<span>{th.label}</span>
              <CommandShortcut>{th.id === `theme-${theme}` ? '✓' : ''}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
