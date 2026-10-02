import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/state'
import { navigationService } from '@/services/navigation'
import { SiteInfo, webuiPrefix } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useMediaQuery'
import {
  ZapIcon,
  MessageSquareIcon,
  FolderOpenIcon,
  EyeIcon,
  Share2Icon,
  SettingsIcon,
  LogOutIcon,
  ChevronDownIcon,
  FileTextIcon,
  LibraryIcon,
  NetworkIcon,
  TreePineIcon,
  SearchIcon,
  CodeIcon,
  RadarIcon,
  UsersIcon,
  UserIcon,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'

export type NavPage =
  | 'chat'
  | 'tree-mind-expand'
  | 'documents'
  | 'knowledge-base'
  | 'knowledge-graph'
  | 'tree-view'
  | 'retrieval'
  | 'api'
  | 'mcp-servers'
  | 'users'

interface NavItem {
  id: NavPage
  labelKey: string
  icon: React.ReactNode
}

interface NavGroup {
  labelKey: string
  icon: React.ReactNode
  children: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'sidebar.groupChat',
    icon: <MessageSquareIcon className="size-4" />,
    children: [
      { id: 'chat', labelKey: 'sidebar.chat', icon: <MessageSquareIcon className="size-4" /> },
      { id: 'tree-mind-expand', labelKey: 'sidebar.treeMindExpand', icon: <RadarIcon className="size-4" /> },
    ],
  },
  {
    labelKey: 'sidebar.groupKnowledge',
    icon: <FolderOpenIcon className="size-4" />,
    children: [
      { id: 'documents', labelKey: 'sidebar.documents', icon: <FileTextIcon className="size-4" /> },
      { id: 'knowledge-base', labelKey: 'sidebar.knowledgeBase', icon: <LibraryIcon className="size-4" /> },
    ],
  },
  {
    labelKey: 'sidebar.groupViews',
    icon: <EyeIcon className="size-4" />,
    children: [
      { id: 'knowledge-graph', labelKey: 'sidebar.knowledgeGraph', icon: <NetworkIcon className="size-4" /> },
      { id: 'tree-view', labelKey: 'sidebar.treeView', icon: <TreePineIcon className="size-4" /> },
    ],
  },
  {
    labelKey: 'sidebar.groupSystem',
    icon: <SettingsIcon className="size-4" />,
    children: [
      { id: 'retrieval', labelKey: 'sidebar.retrieval', icon: <SearchIcon className="size-4" /> },
      { id: 'api', labelKey: 'sidebar.api', icon: <CodeIcon className="size-4" /> },
      { id: 'mcp-servers', labelKey: 'sidebar.mcp', icon: <Share2Icon className="size-4" /> },
      { id: 'users', labelKey: 'sidebar.users', icon: <UsersIcon className="size-4" /> },
    ],
  },
]

export default function Sidebar() {
  const { t } = useTranslation()
  const currentTab = useSettingsStore.use.currentTab() as NavPage
  const setCurrentTab = useSettingsStore.use.setCurrentTab()
  const { isGuestMode, username, coreVersion, apiVersion, webuiTitle } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = useIsMobile()
  const mobileSidebarOpen = useSettingsStore.use.mobileSidebarOpen()
  const setMobileSidebarOpen = useSettingsStore.use.setMobileSidebarOpen()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'sidebar.groupChat': true,
    'sidebar.groupKnowledge': true,
    'sidebar.groupViews': true,
    'sidebar.groupSystem': true,
  })

  // On mobile, sidebar is open only when mobileSidebarOpen is true
  const effectiveCollapsed = isMobile ? !mobileSidebarOpen : collapsed

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleNavigate = useCallback(
    (page: NavPage) => {
      setCurrentTab(page as any)
      // On mobile, auto-close sidebar after navigation
      if (isMobile) {
        setMobileSidebarOpen(false)
      }
    },
    [setCurrentTab, isMobile, setMobileSidebarOpen]
  )

  const handleLogout = useCallback(() => {
    navigationService.navigateToLogin()
  }, [])

  const versionDisplay =
    coreVersion && apiVersion ? `${coreVersion}/${apiVersion}` : null

  return (
    <aside
      data-state={effectiveCollapsed ? 'collapsed' : 'expanded'}
      className={cn(
        'bg-gradient-to-b from-sidebar-background via-sidebar-background to-sidebar-border/5 text-sidebar-foreground flex h-full flex-col',
        'transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'grid grid-rows-[auto_1fr_auto]',
        isMobile && !effectiveCollapsed && 'fixed inset-y-0 left-0 z-50 w-[280px] shadow-2xl',
        !isMobile && effectiveCollapsed && 'w-[56px]',
        !isMobile && !effectiveCollapsed && 'w-[240px]'
      )}
    >
      {/* Mobile overlay backdrop */}
      {isMobile && !effectiveCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-[-1]"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {/* ── Logo / Brand ── */}
      <div className="flex h-10 items-center gap-2 border-b-2 border-gray-300 dark:border-gray-700 px-3">
        <a href={webuiPrefix} className="flex items-center gap-2 min-w-0">
          <ZapIcon className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          {!effectiveCollapsed && (
            <span className="truncate text-sm font-bold">{SiteInfo.name}</span>
          )}
        </a>
        {!effectiveCollapsed && webuiTitle && (
          <span className="truncate text-xs text-muted-foreground">| {webuiTitle}</span>
        )}
      </div>

      {/* ── Navigation groups ── */}
      <nav className="flex-1 overflow-y-auto border-t-2 border-gray-300 dark:border-gray-700 px-2 py-3 scrollbar-thin">
        {navGroups.map((group) => {
          const isExpanded = expandedGroups[group.labelKey]
          // Check if any child in this group is active
          const hasActiveChild = group.children.some((c) => c.id === currentTab)

          return (
            <div key={group.labelKey} className="mb-1">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.labelKey)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  hasActiveChild && !effectiveCollapsed && 'text-sidebar-foreground'
                )}
                title={effectiveCollapsed ? t(group.labelKey as any) : ''}
              >
                {effectiveCollapsed ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center">{group.icon}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{t(group.labelKey as any)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <>
                    {group.icon}
                    <span className="flex-1 text-left">{t(group.labelKey as any)}</span>
                    <motion.span
                      animate={{ rotate: isExpanded ? 0 : -90 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="inline-flex"
                    >
                      <ChevronDownIcon className="size-3" />
                    </motion.span>
                  </>
                )}
              </button>

              {/* Children */}
              <AnimatePresence initial={false}>
                {!effectiveCollapsed && isExpanded && (
                  <motion.div
                    key={`children-${group.labelKey}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="ml-1 mt-0.5 space-y-0.5 border-l-2 border-gray-400 dark:border-gray-600 pl-2">
                      {group.children.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleNavigate(item.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                            currentTab === item.id
                              ? 'bg-emerald-400/20 text-emerald-600 font-medium dark:text-emerald-400'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                          )}
                        >
                          {item.icon}
                          <span>{t(item.labelKey as any)}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      {/* ── Bottom section: collapse toggle, version, logout ── */}
      <div className="border-t-2 border-gray-300 dark:border-gray-700 px-2 py-2">
        {/* Collapse toggle */}
        <button
          onClick={() => isMobile ? setMobileSidebarOpen(!mobileSidebarOpen) : setCollapsed((c) => !c)}
          className="mb-1 flex w-full items-center justify-center rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title={effectiveCollapsed ? t('sidebar.expand', 'Expand') : t('sidebar.collapse', 'Collapse')}
        >
          {effectiveCollapsed ? '→' : '←'}
        </button>

        {/* Version */}
        {!effectiveCollapsed && versionDisplay && (
          <div className="mb-1 px-2 text-xs text-muted-foreground">
            v{versionDisplay}
          </div>
        )}

        {/* Username */}
        {!effectiveCollapsed && username && (
          <div className="mb-1 flex items-center gap-1.5 px-2">
            <UserIcon className="size-3 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">{username}</span>
          </div>
        )}

        {/* Logout / Guest badge */}
        <div className="flex items-center gap-1 px-2">
          {isGuestMode && !effectiveCollapsed && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Guest
            </span>
          )}
          <button
            onClick={handleLogout}
            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title={t('header.logout', 'Logout')}
          >
            <LogOutIcon className="size-3" />
            {!effectiveCollapsed && <span>{t('header.logout', 'Logout')}</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
