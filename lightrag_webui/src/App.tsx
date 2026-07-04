import { useState, useCallback, useEffect, useRef } from 'react'
import ThemeProvider from '@/components/ThemeProvider'
import TabVisibilityProvider from '@/contexts/TabVisibilityProvider'
import ApiKeyAlert from '@/components/ApiKeyAlert'
import StatusIndicator from '@/components/status/StatusIndicator'
import { SiteInfo, webuiPrefix } from '@/lib/constants'
import { useBackendState, useAuthStore } from '@/stores/state'
import { useSettingsStore } from '@/stores/settings'
import { getAuthStatus } from '@/api/lightrag'
import SiteHeader from '@/features/SiteHeader'
import { InvalidApiKeyError, RequireApiKeError } from '@/api/lightrag'
import { ZapIcon } from 'lucide-react'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

import Sidebar from '@/components/Sidebar'
import ChatView from '@/features/ChatView'
import GraphViewer from '@/features/GraphViewer'
import DocumentManager from '@/features/DocumentManager'
import RetrievalView from '@/features/RetrievalView'
import ApiSite from '@/features/ApiSite'
import McpServersView from '@/features/McpServersView'
import TravelPlannerView from '@/features/TravelPlannerView'
import KnowledgeBaseManager from '@/features/KnowledgeBaseManager'
import TreeViewer from '@/features/TreeViewer'
import TreeMindExplore from '@/features/TreeMindExplore'
import UserManagementView from '@/features/UserManagementView'

function App() {
  const message = useBackendState.use.message()
  const enableHealthCheck = useSettingsStore.use.enableHealthCheck()
  const currentTab = useSettingsStore.use.currentTab()
  const [apiKeyAlertOpen, setApiKeyAlertOpen] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const versionCheckRef = useRef(false)
  const healthCheckInitializedRef = useRef(false)
  const isMountedRef = useRef(true)
  const isMobile = useIsMobile()
  const mobileSidebarOpen = useSettingsStore.use.mobileSidebarOpen()

  const handleApiKeyAlertOpenChange = useCallback((open: boolean) => {
    setApiKeyAlertOpen(open)
    if (!open) {
      useBackendState.getState().clear()
    }
  }, [])

  // Mount tracking
  useEffect(() => {
    isMountedRef.current = true
    const handleBeforeUnload = () => { isMountedRef.current = false }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      isMountedRef.current = false
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Health check
  useEffect(() => {
    const performHealthCheck = async () => {
      if (isMountedRef.current) {
        await useBackendState.getState().check()
      }
    }
    useBackendState.getState().setHealthCheckFunction(performHealthCheck)

    if (!enableHealthCheck || apiKeyAlertOpen) {
      useBackendState.getState().clearHealthCheckTimer()
      return
    }
    if (!healthCheckInitializedRef.current) {
      healthCheckInitializedRef.current = true
    }
    useBackendState.getState().resetHealthCheckTimer()
    return () => {
      useBackendState.getState().clearHealthCheckTimer()
    }
  }, [enableHealthCheck, apiKeyAlertOpen])

  // Version check
  useEffect(() => {
    const checkVersion = async () => {
      if (versionCheckRef.current) return
      versionCheckRef.current = true

      const versionCheckedFromLogin = sessionStorage.getItem('VERSION_CHECKED_FROM_LOGIN') === 'true'
      if (versionCheckedFromLogin) {
        setInitializing(false)
        return
      }

      try {
        setInitializing(true)
        const token = localStorage.getItem('LIGHTRAG-API-TOKEN')
        const status = await getAuthStatus()

        if (!status.auth_configured && status.access_token) {
          useAuthStore.getState().login(
            status.access_token, true,
            status.core_version, status.api_version,
            status.webui_title || null, status.webui_description || null
          )
        } else if (token && (status.core_version || status.api_version || status.webui_title || status.webui_description)) {
          const isGuestMode = status.auth_mode === 'disabled' || useAuthStore.getState().isGuestMode
          useAuthStore.getState().login(
            token, isGuestMode,
            status.core_version, status.api_version,
            status.webui_title || null, status.webui_description || null
          )
        }
        sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true')
      } catch (error) {
        console.error('Failed to get version info:', error)
      } finally {
        setInitializing(false)
      }
    }
    checkVersion()
  }, [])

  // React to backend errors
  const [previousMessage, setPreviousMessage] = useState(message)
  if (message !== previousMessage) {
    setPreviousMessage(message)
    if (message && (message.includes(InvalidApiKeyError) || message.includes(RequireApiKeError))) {
      setApiKeyAlertOpen(true)
    }
  }

  const renderContent = () => {
    switch (currentTab) {
      case 'chat': return <ChatView />
      case 'documents': return <DocumentManager />
      case 'knowledge-base': return <KnowledgeBaseManager />
      case 'knowledge-graph': return <GraphViewer />
      case 'tree-view': return <TreeViewer />
      case 'tree-mind-expand': return <TreeMindExplore />
      case 'retrieval': return <RetrievalView />
      case 'api': return <ApiSite />
      case 'mcp-servers': return <McpServersView />
      case 'travel': return <TravelPlannerView />
      case 'users': return <UserManagementView />
      default: return <ChatView />
    }
  }

  return (
    <ThemeProvider>
      <TabVisibilityProvider>
        {initializing ? (
          <div className="flex h-screen w-screen flex-col">
            <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-10 w-full border-b px-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <a href={webuiPrefix} className="flex items-center gap-2">
                  <ZapIcon className="size-4 text-emerald-400" />
                  <span className="font-bold">{SiteInfo.name}</span>
                </a>
              </div>
            </header>
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                <p>Initializing...</p>
              </div>
            </div>
          </div>
        ) : (
          <main className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-background via-background to-emerald-950/5 dark:to-emerald-500/5">
            {/* Left sidebar navigation */}
            <div className={cn(
              "z-10 border-r-2 border-gray-300 dark:border-gray-700",
              isMobile && cn(
                "border-r-0",
                mobileSidebarOpen
                  ? "fixed inset-y-0 left-0 z-40 w-0 overflow-visible"
                  : "w-0 overflow-hidden"
              )
            )}>
              <Sidebar />
            </div>

            {/* Right content area */}
            <div className="flex flex-1 flex-col overflow-hidden bg-background/90 backdrop-blur-sm">
              {/* Top bar */}
              <SiteHeader />

              {/* Page content */}
              <div className="relative flex-1 overflow-auto border-t-2 border-gray-300 dark:border-gray-700 bg-[image:radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/5 dark:from-emerald-400/5 via-transparent to-transparent">
                {renderContent()}
              </div>
            </div>

            {enableHealthCheck && <StatusIndicator />}
            <ApiKeyAlert open={apiKeyAlertOpen} onOpenChange={handleApiKeyAlertOpenChange} />
          </main>
        )}
      </TabVisibilityProvider>
    </ThemeProvider>
  )
}

export default App
