import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

const storageData = new Map<string, string>()
const storageMock = {
  getItem: (key: string) => storageData.get(key) ?? null,
  setItem: (key: string, value: string) => { storageData.set(key, value) },
  removeItem: (key: string) => { storageData.delete(key) },
  clear: () => { storageData.clear() },
}

// Must define localStorage at top level (not in beforeAll) so it's available
// when mock.module() triggers module evaluation
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  configurable: true,
})
Object.defineProperty(globalThis, 'sessionStorage', {
  value: storageMock,
  configurable: true,
})

// Track axios calls for assertions
type MockCall = { method: string; url: string; data?: unknown }
const calls: MockCall[] = []

// Configurable response overrides
let responseOverrides: Record<string, unknown> = {}

mock.module('@/stores/state', () => ({
  useAuthStore: {
    getState: () => ({
      isGuestMode: false,
      login: () => {},
      logout: () => {},
      setTokenRenewal: () => {},
    }),
  },
}))
mock.module('@/stores/settings', () => ({
  useSettingsStore: { getState: () => ({ apiKey: null }) },
}))
mock.module('@/services/navigation', () => ({
  navigationService: { navigateToLogin: () => {} },
}))
mock.module('@/lib/utils', () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : `${error}`,
}))
mock.module('@/lib/constants', () => ({
  backendBaseUrl: 'http://localhost:9621',
  popularLabelsDefaultLimit: 300,
  searchLabelsDefaultLimit: 50,
}))

// Mock axios with tracking
mock.module('axios', () => {
  const instance = {
    get: (url: string) => {
      calls.push({ method: 'GET', url })
      if (responseOverrides[url]) return Promise.resolve({ data: responseOverrides[url], headers: {} })
      return Promise.resolve({ data: {}, headers: {} })
    },
    post: (url: string, data?: unknown) => {
      calls.push({ method: 'POST', url, data })
      if (responseOverrides[url]) return Promise.resolve({ data: responseOverrides[url], headers: {} })
      return Promise.resolve({ data: {}, headers: {} })
    },
    put: (url: string, data?: unknown) => {
      calls.push({ method: 'PUT', url, data })
      if (responseOverrides[url]) return Promise.resolve({ data: responseOverrides[url], headers: {} })
      return Promise.resolve({ data: {}, headers: {} })
    },
    delete: (url: string) => {
      calls.push({ method: 'DELETE', url })
      if (responseOverrides[url]) return Promise.resolve({ data: responseOverrides[url], headers: {} })
      return Promise.resolve({ data: {}, headers: {} })
    },
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} },
    },
  }
  const axiosFn: any = () => Promise.resolve({ data: {}, headers: {} })
  axiosFn.create = () => instance
  axiosFn.get = instance.get
  axiosFn.post = instance.post
  axiosFn.put = instance.put
  axiosFn.delete = instance.delete
  axiosFn.interceptors = instance.interceptors
  return { default: axiosFn, __esModule: true }
})

// ---------------------------------------------------------------------------
// Import AFTER mocks — use dynamic import in beforeAll so mock.module
// registrations are processed before the module under test is evaluated
// ---------------------------------------------------------------------------

type ApiModule = typeof import('./lightrag')
let apiModule: ApiModule

beforeAll(async () => {
  apiModule = await import('./lightrag')
})

beforeEach(() => {
  calls.length = 0
  responseOverrides = {}
  storageData.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkSession', () => {
  test('calls GET /auth/me and returns session info', async () => {
    responseOverrides['/auth/me'] = {
      username: 'alice',
      role: 'admin',
      session_valid: true,
    }

    const result = await apiModule.checkSession()

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toBe('/auth/me')
    expect(result).toEqual({
      username: 'alice',
      role: 'admin',
      session_valid: true,
    })
  })

  test('returns session_valid false for invalidated session', async () => {
    responseOverrides['/auth/me'] = {
      username: 'bob',
      role: 'user',
      session_valid: false,
    }

    const result = await apiModule.checkSession()
    expect(result.session_valid).toBe(false)
  })
})

describe('listUsers', () => {
  test('calls GET /users and returns user list', async () => {
    responseOverrides['/users'] = {
      users: [
        { username: 'admin', role: 'admin', is_current: true },
        { username: 'bob', role: 'user', is_current: false },
      ],
      total: 2,
    }

    const result = await apiModule.listUsers()

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toBe('/users')
    expect(result.total).toBe(2)
    expect(result.users[0].username).toBe('admin')
    expect(result.users[1].role).toBe('user')
  })
})

describe('changeUserRole', () => {
  test('calls PUT /users/:username/role with new role', async () => {
    responseOverrides['/users/bob/role'] = { username: 'bob', role: 'admin' }

    const result = await apiModule.changeUserRole('bob', 'admin')

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toBe('/users/bob/role')
    expect(calls[0].data).toEqual({ role: 'admin' })
    expect(result).toEqual({ username: 'bob', role: 'admin' })
  })

  test('can downgrade role to user', async () => {
    responseOverrides['/users/admin/role'] = { username: 'admin', role: 'user' }

    const result = await apiModule.changeUserRole('admin', 'user')

    expect(calls[0].data).toEqual({ role: 'user' })
    expect(result.role).toBe('user')
  })
})

describe('deleteUser', () => {
  test('calls DELETE /users/:username', async () => {
    responseOverrides['/users/bob'] = { status: 'ok', username: 'bob' }

    const result = await apiModule.deleteUser('bob')

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].url).toBe('/users/bob')
    expect(result.status).toBe('ok')
    expect(result.username).toBe('bob')
  })
})

describe('changeOwnPassword', () => {
  test('calls PUT /users/me/password with old and new passwords', async () => {
    responseOverrides['/users/me/password'] = {
      status: 'ok',
      message: 'Password changed successfully',
    }

    const result = await apiModule.changeOwnPassword('oldpass', 'newpass')

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toBe('/users/me/password')
    expect(calls[0].data).toEqual({
      old_password: 'oldpass',
      new_password: 'newpass',
    })
    expect(result.status).toBe('ok')
  })
})

describe('adminResetPassword', () => {
  test('calls PUT /users/:username/password with new password', async () => {
    responseOverrides['/users/bob/password'] = {
      status: 'ok',
      username: 'bob',
    }

    const result = await apiModule.adminResetPassword('bob', 'reset123')

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('PUT')
    expect(calls[0].url).toBe('/users/bob/password')
    expect(calls[0].data).toEqual({ new_password: 'reset123' })
    expect(result.status).toBe('ok')
    expect(result.username).toBe('bob')
  })
})

describe('API call isolation', () => {
  test('each function makes exactly one API call', async () => {
    responseOverrides['/auth/me'] = { username: 'x', role: 'user', session_valid: true }
    responseOverrides['/users'] = { users: [], total: 0 }

    await apiModule.checkSession()
    expect(calls).toHaveLength(1)

    calls.length = 0
    await apiModule.listUsers()
    expect(calls).toHaveLength(1)
  })

  test('different endpoints are called for different functions', async () => {
    responseOverrides['/users/me/password'] = { status: 'ok', message: '' }
    responseOverrides['/users/bob/password'] = { status: 'ok', username: 'bob' }

    await apiModule.changeOwnPassword('a', 'b')
    await apiModule.adminResetPassword('bob', 'c')

    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('/users/me/password')
    expect(calls[1].url).toBe('/users/bob/password')
  })
})
