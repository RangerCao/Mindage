import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/state'
import { useSettingsStore } from '@/stores/settings'
import { loginToServer, getAuthStatus, registerUser } from '@/api/lightrag'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { ZapIcon } from 'lucide-react'
import AppSettings from '@/components/AppSettings'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isRegistering, setIsRegistering] = useState(false)
  const authCheckRef = useRef(false); // Prevent duplicate calls in Vite dev mode

  useEffect(() => {
    console.log('LoginPage mounted')
  }, []);

  // Check if authentication is configured, skip login if not
  useEffect(() => {

    const checkAuthConfig = async () => {
      // Prevent duplicate calls in Vite dev mode
      if (authCheckRef.current) {
        return;
      }
      authCheckRef.current = true;

      try {
        // If already authenticated, redirect to home
        if (isAuthenticated) {
          navigate('/')
          return
        }

        // Check auth status
        const status = await getAuthStatus()

        // Set session flag for version check to avoid duplicate checks in App component
        if (status.core_version || status.api_version) {
          sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true');
        }

        if (!status.auth_configured && status.access_token) {
          // If auth is not configured, use the guest token and redirect
          login(status.access_token, true, status.core_version, status.api_version, status.webui_title || null, status.webui_description || null)
          if (status.message) {
            toast.info(status.message)
          }
          navigate('/')
          return
        }

        // Only set checkingAuth to false if we need to show the login page
        setCheckingAuth(false);

      } catch (error) {
        console.error('Failed to check auth configuration:', error)
        // Also set checkingAuth to false in case of error
        setCheckingAuth(false);
      }
      // Removed finally block as we're setting checkingAuth earlier
    }

    // Execute immediately
    checkAuthConfig()

    // Cleanup function to prevent state updates after unmount
    return () => {
    }
  }, [isAuthenticated, login, navigate])

  // Don't render anything while checking auth
  if (checkingAuth) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error(t('login.errorEmptyFields'))
      return
    }

    if (isRegistering) {
      // Registration mode
      // Username validation: alphanumeric, underscore, hyphen only
      const usernameRegex = /^[a-zA-Z0-9_\-]+$/
      if (!usernameRegex.test(username)) {
        toast.error(t('login.usernameInvalidFormat'))
        return
      }
      if (password !== confirmPassword) {
        toast.error(t('login.passwordMismatch'))
        return
      }
      if (password.length < 4) {
        toast.error(t('login.passwordTooShort'))
        return
      }
      // Common password check (client-side)
      const commonPasswords = new Set([
        '123456', 'password', '12345678', 'qwerty', 'abc123',
        '123456789', '111111', '1234567', 'iloveyou', 'admin',
        'welcome', 'monkey', '1234', 'letmein', 'football',
        'shadow', 'master', '666666', 'qwertyuiop', '123123',
        '000000', 'password1', '12345', '1q2w3e4r', 'sunshine',
        'princess', 'qwerty123', 'azerty', 'starwars', '121212',
        'admin123', 'root', 'changeme', 'password123', 'abc123456',
        'a123456', '888888', 'woaini', '5201314',
      ])
      if (commonPasswords.has(password.toLowerCase())) {
        toast.error(t('login.passwordTooCommon'))
        return
      }

      try {
        setLoading(true)
        const response = await registerUser(username, password)

        localStorage.setItem('LIGHTRAG-PREVIOUS-USER', username)

        const isGuestMode = response.auth_mode === 'disabled'
        login(response.access_token, isGuestMode, response.core_version, response.api_version, response.webui_title || null, response.webui_description || null)

        if (response.core_version || response.api_version) {
          sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true');
        }

        toast.success(t('login.registerSuccess'))
        navigate('/')
      } catch (error) {
        console.error('Registration failed...', error)
        const status = (error as any)?.response?.status
        const detail = (error as any)?.response?.data?.detail as string | undefined
        let msg = t('login.registerFailed')
        if (status === 409) {
          msg = t('login.registerDuplicate')
        } else if (status === 422) {
          msg = detail || t('login.registerInvalid')
        } else if (detail) {
          msg = t('login.registerFailedDetail', { detail })
        }
        toast.error(msg)
        useAuthStore.getState().logout()
        localStorage.removeItem('LIGHTRAG-API-TOKEN')
      } finally {
        setLoading(false)
      }
      return
    }

    // Login mode
    try {
      setLoading(true)
      const response = await loginToServer(username, password)

      // Get previous username from localStorage
      const previousUsername = localStorage.getItem('LIGHTRAG-PREVIOUS-USER')

      // Check if it's the same user logging in again
      const isSameUser = previousUsername === username

      // If it's not the same user, clear chat history
      if (isSameUser) {
        console.log('Same user logging in, preserving chat history')
      } else {
        console.log('Different user logging in, clearing chat history')
        // Directly clear chat history instead of setting a flag
        useSettingsStore.getState().setRetrievalHistory([])
      }

      // Update previous username
      localStorage.setItem('LIGHTRAG-PREVIOUS-USER', username)

      // Check authentication mode
      const isGuestMode = response.auth_mode === 'disabled'
      login(response.access_token, isGuestMode, response.core_version, response.api_version, response.webui_title || null, response.webui_description || null)

      // Set session flag for version check
      if (response.core_version || response.api_version) {
        sessionStorage.setItem('VERSION_CHECKED_FROM_LOGIN', 'true');
      }

      if (isGuestMode) {
        // Show authentication disabled notification
        toast.info(response.message || t('login.authDisabled', 'Authentication is disabled. Using guest access.'))
      } else {
        toast.success(t('login.successMessage'))
      }

      // Navigate to home page after successful login
      navigate('/')
    } catch (error) {
      console.error('Login failed...', error)
      toast.error(t('login.errorInvalidCredentials'))

      // Clear any existing auth state
      useAuthStore.getState().logout()
      // Clear local storage
      localStorage.removeItem('LIGHTRAG-API-TOKEN')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsRegistering(!isRegistering)
    setConfirmPassword('')
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <AppSettings className="bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm rounded-md" />
      </div>
      <Card className="w-full max-w-[480px] shadow-lg mx-4">
        <CardHeader className="flex items-center justify-center space-y-2 pb-8 pt-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center gap-3">
              <img src="logo.svg" alt="Mindage Logo" className="h-12 w-12" />
              <ZapIcon className="size-10 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Mindage</h1>
              <p className="text-muted-foreground text-sm">
                {isRegistering ? t('login.createAccount') : t('login.description')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-4">
              <label htmlFor="username-input" className="text-sm font-medium w-16 shrink-0">
                {t('login.username')}
              </label>
              <Input
                id="username-input"
                placeholder={t('login.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-11 flex-1"
              />
            </div>
            <div className="flex items-center gap-4">
              <label htmlFor="password-input" className="text-sm font-medium w-16 shrink-0">
                {t('login.password')}
              </label>
              <Input
                id="password-input"
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 flex-1"
              />
            </div>
            {isRegistering && (
              <div className="flex items-center gap-4">
                <label htmlFor="confirm-password-input" className="text-sm font-medium w-16 shrink-0">
                  {t('login.confirmPassword')}
                </label>
                <Input
                  id="confirm-password-input"
                  type="password"
                  placeholder={t('login.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 flex-1"
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-11 text-base font-medium mt-2"
              disabled={loading}
            >
              {loading
                ? (isRegistering ? t('login.registering') : t('login.loggingIn'))
                : (isRegistering ? t('login.register') : t('login.loginButton'))}
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {isRegistering ? t('login.hasAccount') : t('login.noAccount')}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginPage
