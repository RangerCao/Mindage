import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  UsersIcon,
  ShieldIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  Trash2Icon,
  KeyIcon,
  RefreshCwIcon,
  Loader2Icon,
  UserCircleIcon,
  SaveIcon,
  XIcon,
} from 'lucide-react'
import {
  type UserInfo,
  listUsers,
  changeUserRole,
  deleteUser,
  changeOwnPassword,
  adminResetPassword,
} from '@/api/lightrag'
import { useAuthStore } from '@/stores/state'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select'
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

const roleIcons: Record<string, React.ReactNode> = {
  admin: <ShieldAlertIcon className="size-4 text-red-500" />,
  user: <ShieldCheckIcon className="size-4 text-emerald-500" />,
  guest: <ShieldIcon className="size-4 text-gray-400" />,
}

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  user: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  guest: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default function UserManagementView() {
  const { t } = useTranslation()
  const currentUsername = useAuthStore((s) => s.username)
  const currentUserRole = useAuthStore((s) => s.role)
  const isAdmin = currentUserRole === 'admin'

  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [changingRoles, setChangingRoles] = useState<Record<string, boolean>>({})
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Password change states
  const [showOwnPasswordForm, setShowOwnPasswordForm] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingOwnPassword, setChangingOwnPassword] = useState(false)

  // Admin reset password
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listUsers()
      setUsers(data.users)
    } catch {
      toast.error(t('users.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleRoleChange = useCallback(
    async (username: string, newRole: string) => {
      try {
        setChangingRoles((prev) => ({ ...prev, [username]: true }))
        await changeUserRole(username, newRole)
        setUsers((prev) =>
          prev.map((u) => (u.username === username ? { ...u, role: newRole } : u))
        )
        toast.success(t('users.roleChanged', { username }))
      } catch {
        toast.error(t('users.roleChangeError'))
      } finally {
        setChangingRoles((prev) => ({ ...prev, [username]: false }))
      }
    },
    [t]
  )

  const handleDeleteUser = useCallback(
    async (username: string) => {
      try {
        setDeletingUser(username)
        await deleteUser(username)
        setUsers((prev) => prev.filter((u) => u.username !== username))
        toast.success(t('users.deleted', { username }))
      } catch {
        toast.error(t('users.deleteError'))
      } finally {
        setDeletingUser(null)
        setConfirmDelete(null)
      }
    },
    [t]
  )

  const handleChangeOwnPassword = useCallback(async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error(t('users.passwordTooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('users.passwordMismatch'))
      return
    }
    try {
      setChangingOwnPassword(true)
      await changeOwnPassword(oldPassword, newPassword)
      toast.success(t('users.passwordChanged'))
      setShowOwnPasswordForm(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error(t('users.passwordChangeError'))
    } finally {
      setChangingOwnPassword(false)
    }
  }, [t, oldPassword, newPassword, confirmPassword])

  const handleAdminResetPassword = useCallback(async () => {
    if (!resetTarget) return
    if (!resetNewPassword || resetNewPassword.length < 6) {
      toast.error(t('users.passwordTooShort'))
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error(t('users.passwordMismatch'))
      return
    }
    try {
      setResettingPassword(true)
      await adminResetPassword(resetTarget, resetNewPassword)
      toast.success(t('users.passwordResetDone', { username: resetTarget }))
      setResetTarget(null)
      setResetNewPassword('')
      setResetConfirmPassword('')
    } catch {
      toast.error(t('users.passwordResetError'))
    } finally {
      setResettingPassword(false)
    }
  }, [t, resetTarget, resetNewPassword, resetConfirmPassword])

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('users.title')}</h2>
          <p className="text-muted-foreground">{t('users.description')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
          {loading ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCwIcon className="mr-2 size-4" />
          )}
          {t('users.refresh')}
        </Button>
      </div>

      {/* Change own password */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyIcon className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">{t('users.changePassword')}</CardTitle>
            </div>
            {!showOwnPasswordForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOwnPasswordForm(true)}
              >
                {t('users.changePassword')}
              </Button>
            )}
          </div>
          <CardDescription>{t('users.changePasswordDesc')}</CardDescription>
        </CardHeader>
        {showOwnPasswordForm && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('users.oldPassword')}</label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder={t('users.oldPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('users.newPassword')}</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('users.newPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('users.confirmPassword')}</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('users.confirmPasswordPlaceholder')}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleChangeOwnPassword}
                disabled={changingOwnPassword}
                size="sm"
              >
                {changingOwnPassword ? (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                ) : (
                  <SaveIcon className="mr-2 size-4" />
                )}
                {t('users.savePassword')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowOwnPasswordForm(false)
                  setOldPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
              >
                <XIcon className="mr-2 size-4" />
                {t('users.cancel')}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* User list */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UsersIcon className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">{t('users.userList')}</CardTitle>
          </div>
          <CardDescription>
            {t('users.totalUsers', { count: users.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <UserCircleIcon className="mb-2 size-8" />
              <p>{t('users.noUsers')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.username}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    {roleIcons[user.role] || roleIcons.guest}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.username}</span>
                        {user.is_current && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                            {t('users.currentUser')}
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-xs ${roleBadgeClass[user.role] || roleBadgeClass.guest}`}
                      >
                        {user.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Role selector (admin only) */}
                    {isAdmin && (
                      <Select
                        value={user.role}
                        onValueChange={(val) => handleRoleChange(user.username, val)}
                        disabled={!!changingRoles[user.username] || user.is_current}
                      >
                        <SelectTrigger className="w-[110px] h-8 text-xs">
                          {changingRoles[user.username] ? (
                            <Loader2Icon className="size-3 animate-spin" />
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="guest">{t('users.roles.guest')}</SelectItem>
                          <SelectItem value="user">{t('users.roles.user')}</SelectItem>
                          <SelectItem value="admin">{t('users.roles.admin')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* Admin reset password */}
                    {isAdmin && !user.is_current && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setResetTarget(user.username)
                          setResetNewPassword('')
                          setResetConfirmPassword('')
                        }}
                      >
                        <KeyIcon className="mr-1 size-3" />
                        {t('users.resetPassword')}
                      </Button>
                    )}

                    {/* Delete (admin only, can't delete self) */}
                    {isAdmin && !user.is_current && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={deletingUser === user.username}
                        onClick={() => setConfirmDelete(user.username)}
                      >
                        {deletingUser === user.username ? (
                          <Loader2Icon className="size-3 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('users.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('users.confirmDeleteDesc', { username: confirmDelete || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('users.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDeleteUser(confirmDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('users.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin reset password dialog */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null)
            setResetNewPassword('')
            setResetConfirmPassword('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('users.resetPasswordTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('users.resetPasswordDesc', { username: resetTarget || '' })}
              {' '}{t('users.sessionInvalidated')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('users.newPassword')}</label>
              <Input
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                placeholder={t('users.newPasswordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('users.confirmPassword')}</label>
              <Input
                type="password"
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                placeholder={t('users.confirmPasswordPlaceholder')}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('users.cancel')}</AlertDialogCancel>
            <Button
              onClick={handleAdminResetPassword}
              disabled={resettingPassword}
            >
              {resettingPassword ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <SaveIcon className="mr-2 size-4" />
              )}
              {t('users.savePassword')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
