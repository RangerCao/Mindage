import { useState, useEffect, useCallback } from 'react'
import AppSettings from '@/components/AppSettings'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/state'
import { useTranslation } from 'react-i18next'
import { navigationService } from '@/services/navigation'
import { LogOutIcon, MenuIcon, DatabaseIcon } from 'lucide-react'
import GithubIcon from '@/components/icons/GithubIcon'
import LanguageToggle from '@/components/LanguageToggle'
import ThemeToggle from '@/components/ThemeToggle'
import { listWorkspaces, setWorkspace, WorkspaceInfo } from '@/api/lightrag'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select'
import { useIsMobile } from '@/hooks/useMediaQuery'

function WorkspaceSelector() {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [current, setCurrent] = useState('')
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const data = await listWorkspaces()
      setWorkspaces(data?.workspaces ?? [])
      setCurrent(data?.current ?? '')
    } catch (_) { /* ignore */ }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('focus', h)
    return () => window.removeEventListener('focus', h)
  }, [refresh])

  const handleSwitch = async (name: string) => {
    setLoading(true)
    try {
      await setWorkspace(name)
      setCurrent(name)
      window.location.reload()
    } catch (e) {
      console.error('Switch workspace failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const toValue = (name: string) => name || '__default__'
  const fromValue = (v: string) => v === '__default__' ? '' : v
  const currentValue = toValue(current)

  if (workspaces.length <= 1) return null

  return (
    <div className="flex items-center gap-1">
      <DatabaseIcon className="size-3 text-muted-foreground" />
      <Select
        value={currentValue}
        onValueChange={(v) => handleSwitch(fromValue(v))}
        disabled={loading}
      >
        <SelectTrigger className="h-7 border-2 border-gray-300 dark:border-gray-600 bg-transparent px-1 text-xs shadow-none hover:bg-accent/50 focus:ring-0">
          <SelectValue placeholder={t('header.defaultWorkspace', '(default)')} />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((ws) => (
            <SelectItem key={ws.name} value={toValue(ws.name)} className="text-xs">
              {ws.name || t('header.defaultWorkspace', '(default)')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function SiteHeader() {
  const { t } = useTranslation()
  const { isGuestMode, coreVersion, apiVersion } = useAuthStore()
  const isMobile = useIsMobile()
  const toggleMobileSidebar = useSettingsStore.use.toggleMobileSidebar()

  const versionDisplay = (coreVersion && apiVersion)
    ? `${coreVersion}/${apiVersion}`
    : null

  const handleLogout = () => {
    navigationService.navigateToLogin()
  }

  return (
    <header className="border-border/30 bg-background/90 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex h-10 w-full items-center justify-between border-b px-3 backdrop-blur-md shadow-md shadow-black/5">
      <div className="flex items-center gap-2">
        {/* Mobile hamburger menu */}
        {isMobile && (
          <button
            onClick={toggleMobileSidebar}
            className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title={t('sidebar.menu', 'Menu')}
          >
            <MenuIcon className="size-5" />
          </button>
        )}
        <WorkspaceSelector />
        {isGuestMode && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {t('login.guestMode', 'Guest Mode')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {versionDisplay && (
          <span className="mr-1 text-xs text-muted-foreground">v{versionDisplay}</span>
        )}
        <AppSettings />
        <LanguageToggle />
        <ThemeToggle />
        <a
          href="https://github.com/HKUDS/LightRAG"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <GithubIcon className="size-4" />
        </a>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={t('header.logout', 'Logout')}
        >
          <LogOutIcon className="size-4" />
        </button>
      </div>
    </header>
  )
}
