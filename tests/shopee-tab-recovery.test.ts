import 'fake-indexeddb/auto'

import { deleteDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/core/settings'
import type { ExtensionMessage, MessageResponse } from '../src/core/messages'

type MessageListener = (
  message: ExtensionMessage,
  sender: { id: string },
  respond: (response: MessageResponse) => void,
) => boolean | void

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.resetModules()
  await deleteDB('autopin-shopee')
})

describe('Shopee tab connection recovery', () => {
  it('reloads an Affiliate tab without a content script and completes preflight', async () => {
    const browser = await startBrowserSimulation(false)
    await browser.start()

    await vi.waitFor(async () => {
      const activity = await browser.activity()
      expect(activity.some((entry) => entry.message === 'Preflight passed')).toBe(true)
    }, { timeout: 5_000 })
    expect(browser.reload).toHaveBeenCalledWith(7)
    expect(browser.sendMessage).toHaveBeenCalledWith(7, { type: 'SHOPEE_PREFLIGHT' })
  })

  it('stops with the original connection error when a tab still has no receiver', async () => {
    const browser = await startBrowserSimulation(true)
    await browser.start()

    try {
      await vi.waitFor(async () => {
        const status = await browser.status()
        expect(status.state).toBe('stopped')
        expect(status.message).toContain('content_script_unavailable')
        expect(status.message).toContain('Receiving end does not exist')
      }, { timeout: 3_000 })
    } catch (error) {
      throw new Error(`Workflow status: ${JSON.stringify(await browser.status())}; activity: ${JSON.stringify(await browser.activity())}`, { cause: error })
    }
    expect(browser.reload).toHaveBeenCalled()
    expect((await browser.activity()).some((entry) => entry.message.includes('content_script_unavailable'))).toBe(true)
  })

  it('automatically scans past page ten until Shopee has no next page', async () => {
    const browser = await startBrowserSimulation(false, 12)
    await browser.start()

    await vi.waitFor(async () => {
      expect((await browser.status()).state).toBe('stopped')
      expect(browser.sendMessage.mock.calls.filter(([, message]) => message.type === 'SHOPEE_DISCOVER')).toHaveLength(12)
    }, { timeout: 7_000 })
    const discoveryRequests = browser.sendMessage.mock.calls
      .map(([, message]) => message)
      .filter((message) => message.type === 'SHOPEE_DISCOVER')
    expect(discoveryRequests[1]).toMatchObject({ previousPageSignature: '1:' })
    expect(discoveryRequests[11]).toMatchObject({ previousPageSignature: '11:' })
    expect((await browser.activity()).some((entry) => entry.stage === 'paused')).toBe(false)
  })
})

async function startBrowserSimulation(alwaysMissing: boolean, availablePages = 1) {
  const localData: Record<string, unknown> = {
    automationSettings: {
      ...structuredClone(DEFAULT_SETTINGS),
      providerConfigs: {
        ...structuredClone(DEFAULT_SETTINGS.providerConfigs),
        openrouter: { apiKey: 'test-key', primaryModel: 'test-model', fallbackModel: '' },
      },
      pinterestAccessToken: 'pina_test',
      pinterestBoardId: '123',
    },
  }
  let listener: MessageListener | undefined
  let alarmListener: ((alarm: { name: string }) => void) | undefined
  let messageAttempts = 0
  let scannedPages = 0
  const sendMessage = vi.fn(async (_tabId: number, message: ExtensionMessage) => {
    messageAttempts += 1
    if (alwaysMissing || messageAttempts === 1) {
      throw new Error('Could not establish connection. Receiving end does not exist.')
    }
    if (message.type === 'SHOPEE_PREFLIGHT') return { ok: true, data: { state: 'ready', url: 'https://affiliate.shopee.co.id/offer/product_offer' } }
    if (message.type === 'SHOPEE_DISCOVER') {
      scannedPages += 1
      return { ok: true, data: { candidates: [], pagesScanned: 1, pageSignature: `${scannedPages}:`, hasNextPage: scannedPages < availablePages } }
    }
    throw new Error(`Unexpected Shopee message: ${message.type}`)
  })
  const reload = vi.fn(async (_tabId: number) => undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [{ id: '123', name: 'SHOPEE' }], bookmark: null }))))
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: (callback: MessageListener) => { listener = callback } },
    },
    alarms: {
      onAlarm: { addListener: (callback: (alarm: { name: string }) => void) => { alarmListener = callback } },
      create: vi.fn(async () => { setTimeout(() => alarmListener?.({ name: 'affiliate-pin-run' }), 0) }),
      clear: vi.fn(async () => undefined),
    },
    tabs: {
      query: vi.fn(async () => [{ id: 7, url: 'https://affiliate.shopee.co.id/offer/product_offer', status: 'complete' }]),
      get: vi.fn(async () => ({ id: 7, url: 'https://affiliate.shopee.co.id/offer/product_offer', status: 'complete' })),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage,
      reload,
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: localData[key] }),
        set: async (values: Record<string, unknown>) => { Object.assign(localData, values) },
        remove: async (key: string) => { delete localData[key] },
      },
    },
  })
  await import('../src/background/service-worker')
  return {
    sendMessage,
    reload,
    start: () => new Promise<void>((resolve, reject) => {
      listener!({ type: 'START_AUTOMATION' }, { id: 'test-extension' }, (response) => response.ok ? resolve() : reject(new Error(response.error.message)))
    }),
    status: async () => (await import('../src/storage/runtime-store')).getRuntimeStatus(),
    activity: async () => (await import('../src/storage/runtime-store')).getActivityLog(),
  }
}
