import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon, PlusIcon, DatabaseIcon, RefreshCwIcon, CheckIcon } from 'lucide-react'
import { listWorkspaces, setWorkspace, createWorkspace, deleteWorkspace, WorkspaceInfo } from '@/api/lightrag'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/AlertDialog'

export default function KnowledgeBaseManager() {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [current, setCurrent] = useState('')
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await listWorkspaces()
      setWorkspaces(data.workspaces)
      setCurrent(data.current)
    } catch (_) {
      setError('Failed to load workspaces')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      setError('Name may only contain letters, digits, and underscores')
      return
    }
    setLoading(true)
    setError('')
    try {
      await createWorkspace(name)
      setNewName('')
      await refresh()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Create failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitch = async (name: string) => {
    setLoading(true)
    try {
      await setWorkspace(name)
      await refresh()
      window.location.reload()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Switch failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    setError('')
    try {
      await deleteWorkspace(deleteTarget)
      setDeleteTarget(null)
      await refresh()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  const label = (name: string) => name || t('knowledgeBase.defaultWorkspace', '(default)')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('knowledgeBase.title', 'Knowledge Bases')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('knowledgeBase.description', 'Manage isolated knowledge bases with separate documents and graphs')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCwIcon className="mr-1 size-4" />
          {t('knowledgeBase.refresh', 'Refresh')}
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create new */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <PlusIcon className="mr-2 inline size-4" />
            {t('knowledgeBase.createNew', 'Create New Knowledge Base')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder={t('knowledgeBase.namePlaceholder', 'Enter name (a-z, 0-9, _)')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="max-w-sm"
            />
            <Button onClick={handleCreate} disabled={loading || !newName.trim()}>
              {t('knowledgeBase.create', 'Create')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Workspace list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <DatabaseIcon className="mr-2 inline size-4" />
            {t('knowledgeBase.existing', 'Existing Knowledge Bases')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              {t('knowledgeBase.noWorkspaces', 'No knowledge bases yet. Create one above.')}
            </p>
          ) : (
            <div className="divide-y">
              {workspaces.map((ws) => (
                <div key={ws.name} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <DatabaseIcon className="size-4 text-muted-foreground" />
                    <span className={ws.is_active ? 'font-semibold' : ''}>
                      {label(ws.name)}
                    </span>
                    {ws.is_active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckIcon className="size-3" />
                        {t('knowledgeBase.active', 'Active')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!ws.is_active && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSwitch(ws.name)}
                          disabled={loading}
                        >
                          {t('knowledgeBase.switch', 'Switch')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteTarget(ws.name)}
                          disabled={loading}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('knowledgeBase.confirmDelete', 'Delete Knowledge Base?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('knowledgeBase.confirmDeleteDesc', 'This will permanently delete all documents and data in "{{name}}". This action cannot be undone.', { name: deleteTarget })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('knowledgeBase.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              {t('knowledgeBase.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
