import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, { validateExtensionCallback } from '../src/index'

class MemoryKV {
  values = new Map<string, string>()

  async put(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async get<T>(key: string, type?: string): Promise<T | string | null> {
    const value = this.values.get(key)
    if (value === undefined) return null
    return (type === 'json' ? JSON.parse(value) : value) as T | string
  }
  async delete(key: string): Promise<void> { this.values.delete(key) }
}

function env(kv = new MemoryKV()) {
  return {
    OAUTH_TRANSACTIONS: kv as unknown as KVNamespace,
    APP_ENV: 'sandbox' as const,
    PINTEREST_CLIENT_ID: 'client-id',
    PINTEREST_CLIENT_SECRET: 'client-secret',
    PINTEREST_REDIRECT_URI: 'https://oauth.example/v1/oauth/pinterest/callback',
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Pinterest OAuth worker', () => {
  it('accepts only exact Chrome Identity callbacks', () => {
    expect(validateExtensionCallback('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pinterest'))
      .toBe('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pinterest')
    for (const callback of [
      'https://example.com/pinterest',
      'http://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pinterest',
      'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/other',
    ]) expect(() => validateExtensionCallback(callback)).toThrow()
  })

  it('starts OAuth with fixed least-privilege scopes and stores state server-side', async () => {
    const environment = env()
    const request = new Request('https://oauth.example/v1/oauth/pinterest/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' },
      body: JSON.stringify({
        callback_uri: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pinterest',
        environment: 'sandbox',
      }),
    })
    const response = await worker.fetch(request, environment)
    const result = await response.json() as { authorization_url: string }

    expect(response.status).toBe(200)
    const authorization = new URL(result.authorization_url)
    expect(authorization.searchParams.get('scope')).toBe('boards:read,boards:write,pins:read,pins:write')
    expect(authorization.searchParams.get('redirect_uri')).toBe(environment.PINTEREST_REDIRECT_URI)
    expect([...((environment.OAUTH_TRANSACTIONS as unknown as MemoryKV).values).keys()][0]).toMatch(/^state:/)
  })

  it('exchanges a callback code and sends only an opaque ticket through the browser redirect', async () => {
    const kv = new MemoryKV()
    const environment = env(kv)
    kv.values.set('state:state-value', JSON.stringify({
      callbackUri: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pinterest',
      environment: 'sandbox',
      createdAt: Date.now(),
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'pina_secret_token',
      refresh_token: 'pinr_secret_token',
      expires_in: 3600,
    }), { status: 200 })))

    const response = await worker.fetch(new Request('https://oauth.example/v1/oauth/pinterest/callback?state=state-value&code=code-value'), environment)
    const location = response.headers.get('Location') ?? ''

    expect(response.status).toBe(302)
    expect(location).toContain('chromiumapp.org/pinterest?ticket=')
    expect(location).not.toContain('pina_secret_token')
    expect(location).not.toContain('pinr_secret_token')
    expect([...kv.values.keys()].some((key) => key.startsWith('ticket:'))).toBe(true)
  })

  it('redeems each ticket once', async () => {
    const kv = new MemoryKV()
    const environment = env(kv)
    const ticket = 'a'.repeat(43)
    kv.values.set(`ticket:${ticket}`, JSON.stringify({ access_token: 'pina_once' }))
    const request = () => new Request('https://oauth.example/v1/oauth/pinterest/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }),
    })

    expect((await worker.fetch(request(), environment)).status).toBe(200)
    expect((await worker.fetch(request(), environment)).status).toBe(403)
  })
})
