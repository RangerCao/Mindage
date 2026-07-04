import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

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

// Mock modules that state.ts transitively depends on
mock.module('@/lib/utils', () => ({
  createSelectors: (store: any) => store,
}))
mock.module('@/api/lightrag', () => ({
  checkHealth: () => Promise.resolve({ status: 'healthy' }),
}))
mock.module('@/stores/settings', () => ({
  useSettingsStore: { getState: () => ({ backendMaxGraphNodes: 1000, graphMaxNodes: 100, setBackendMaxGraphNodes: () => {}, setGraphMaxNodes: () => {} }) },
}))
mock.module('@/lib/constants', () => ({
  healthCheckInterval: 30,
}))

// Helper: build a fake JWT with the given payload
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = 'fakesig'
  return `${header}.${body}.${sig}`
}

// ---------------------------------------------------------------------------
// Import the store AFTER mocks are set up
// ---------------------------------------------------------------------------

let useAuthStore: typeof import('./state').useAuthStore

beforeEach(async () => {
  storageData.clear()
  const mod = await import('./state')
  useAuthStore = mod.useAuthStore
})

afterEach(() => {
  useAuthStore.getState().logout()
  storageData.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuthStore — initial state', () => {
  test('starts unauthenticated when no token in storage', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isGuestMode).toBe(false)
    expect(state.username).toBeNull()
    expect(state.role).toBe('user')
    expect(state.tokenExpiresAt).toBeNull()
    expect(state.lastTokenRenewal).toBeNull()
  })

  test('roundtrips through login → logout → re-login with different user', () => {
    // First login
    const token1 = fakeJwt({ sub: 'alice', role: 'admin', exp: 9999999999 })
    useAuthStore.getState().login(token1, false, '1.0', '2.0')
    expect(useAuthStore.getState().username).toBe('alice')
    expect(useAuthStore.getState().role).toBe('admin')

    // Logout
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().username).toBeNull()

    // Re-login as different user
    const token2 = fakeJwt({ sub: 'bob', role: 'user', exp: 8888888888 })
    useAuthStore.getState().login(token2)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().username).toBe('bob')
    expect(useAuthStore.getState().role).toBe('user')
    expect(useAuthStore.getState().tokenExpiresAt).toBe(8888888888 * 1000)
  })
})

describe('useAuthStore — login', () => {
  test('stores token and extracts username/role from JWT', () => {
    const token = fakeJwt({ sub: 'bob', role: 'user', exp: 9999999999 })
    useAuthStore.getState().login(token, false, '1.0.0', '2.0.0')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.isGuestMode).toBe(false)
    expect(state.username).toBe('bob')
    expect(state.role).toBe('user')
    expect(state.coreVersion).toBe('1.0.0')
    expect(state.apiVersion).toBe('2.0.0')
    expect(state.tokenExpiresAt).toBe(9999999999 * 1000)
    expect(localStorage.getItem('LIGHTRAG-API-TOKEN')).toBe(token)
  })

  test('handles guest login correctly', () => {
    const token = fakeJwt({ sub: 'guest', role: 'guest', exp: 9999999999 })
    useAuthStore.getState().login(token, true)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.isGuestMode).toBe(true)
    expect(state.username).toBe('guest')
    expect(state.role).toBe('guest')
  })

  test('defaults role to "user" when JWT has no role claim', () => {
    const token = fakeJwt({ sub: 'charlie', exp: 9999999999 })
    useAuthStore.getState().login(token)

    expect(useAuthStore.getState().role).toBe('user')
  })

  test('stores custom title in localStorage', () => {
    const token = fakeJwt({ sub: 'dave', role: 'admin', exp: 9999999999 })
    useAuthStore.getState().login(token, false, null, null, 'My LightRAG', 'Custom description')

    expect(localStorage.getItem('LIGHTRAG-WEBUI-TITLE')).toBe('My LightRAG')
    expect(localStorage.getItem('LIGHTRAG-WEBUI-DESCRIPTION')).toBe('Custom description')
    expect(useAuthStore.getState().webuiTitle).toBe('My LightRAG')
    expect(useAuthStore.getState().webuiDescription).toBe('Custom description')
  })
})

describe('useAuthStore — logout', () => {
  test('clears authentication state and removes token from storage', () => {
    const token = fakeJwt({ sub: 'eve', role: 'admin', exp: 9999999999 })
    useAuthStore.getState().login(token, false, '1.0', '2.0')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isGuestMode).toBe(false)
    expect(state.username).toBeNull()
    expect(state.role).toBe('user')
    expect(state.tokenExpiresAt).toBeNull()
    expect(state.lastTokenRenewal).toBeNull()
    expect(localStorage.getItem('LIGHTRAG-API-TOKEN')).toBeNull()
  })

  test('preserves version and title info after logout', () => {
    const token = fakeJwt({ sub: 'frank', role: 'user', exp: 9999999999 })
    useAuthStore.getState().login(token, false, '1.2.3', '4.5.6', 'Title', 'Desc')
    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.coreVersion).toBe('1.2.3')
    expect(state.apiVersion).toBe('4.5.6')
    expect(state.webuiTitle).toBe('Title')
    expect(state.webuiDescription).toBe('Desc')
  })
})

describe('useAuthStore — setTokenRenewal', () => {
  test('updates renewal timestamp and expiration', () => {
    const token = fakeJwt({ sub: 'grace', role: 'user', exp: 9999999999 })
    useAuthStore.getState().login(token)

    const renewalTime = Date.now()
    const newExpiresAt = (Math.floor(renewalTime / 1000) + 172800) * 1000
    useAuthStore.getState().setTokenRenewal(renewalTime, newExpiresAt)

    const state = useAuthStore.getState()
    expect(state.tokenExpiresAt).toBe(newExpiresAt)
    expect(state.lastTokenRenewal).toBeTruthy()
    expect(localStorage.getItem('LIGHTRAG-LAST-TOKEN-RENEWAL')).toBeTruthy()
  })
})

describe('useAuthStore — setVersion', () => {
  test('updates version info in both state and localStorage', () => {
    useAuthStore.getState().setVersion('3.0.0', '4.0.0')

    const state = useAuthStore.getState()
    expect(state.coreVersion).toBe('3.0.0')
    expect(state.apiVersion).toBe('4.0.0')
    expect(localStorage.getItem('LIGHTRAG-CORE-VERSION')).toBe('3.0.0')
    expect(localStorage.getItem('LIGHTRAG-API-VERSION')).toBe('4.0.0')
  })
})

describe('useAuthStore — setCustomTitle', () => {
  test('sets title and description', () => {
    useAuthStore.getState().setCustomTitle('New Title', 'New Desc')

    const state = useAuthStore.getState()
    expect(state.webuiTitle).toBe('New Title')
    expect(state.webuiDescription).toBe('New Desc')
    expect(localStorage.getItem('LIGHTRAG-WEBUI-TITLE')).toBe('New Title')
    expect(localStorage.getItem('LIGHTRAG-WEBUI-DESCRIPTION')).toBe('New Desc')
  })

  test('removes title from localStorage when set to null', () => {
    localStorage.setItem('LIGHTRAG-WEBUI-TITLE', 'Old')
    localStorage.setItem('LIGHTRAG-WEBUI-DESCRIPTION', 'Old Desc')

    useAuthStore.getState().setCustomTitle(null, null)

    const state = useAuthStore.getState()
    expect(state.webuiTitle).toBeNull()
    expect(state.webuiDescription).toBeNull()
    expect(localStorage.getItem('LIGHTRAG-WEBUI-TITLE')).toBeNull()
    expect(localStorage.getItem('LIGHTRAG-WEBUI-DESCRIPTION')).toBeNull()
  })
})

describe('useAuthStore — malformed token handling', () => {
  test('handles token with invalid base64 gracefully', () => {
    const badToken = 'header.!!!invalid-base64!!!.signature'
    useAuthStore.getState().login(badToken)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.username).toBeNull()
    expect(state.role).toBe('user')
  })

  test('handles token with only one part', () => {
    const badToken = 'only-one-part'
    useAuthStore.getState().login(badToken)

    const state = useAuthStore.getState()
    expect(state.username).toBeNull()
    expect(state.role).toBe('user')
  })
})
