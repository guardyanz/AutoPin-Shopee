import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

test('one explicit batch approval posts each selected draft through Pinterest API', async () => {
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-batch-'))
  const extensionPath = resolve('dist')
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: findChromiumExecutable(), headless: false, viewport: { width: 390, height: 844 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check'],
    })
    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    await expect.poll(() => worker.evaluate(() => typeof chrome)).toBe('object')
    const extensionId = new URL(worker.url()).host
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)

    await worker.evaluate(() => {
      const pins: Array<{ id: string; body: Record<string, unknown> }> = []
      Object.assign(globalThis, { __testPins: pins })
      const nativeFetch = globalThis.fetch
      globalThis.fetch = function (this: typeof globalThis, input, init) {
        const url = new URL(String(input))
        if (url.origin === 'https://api-sandbox.pinterest.com' && url.pathname === '/v5/pins' && init?.method === 'POST') {
          const id = String(900 + pins.length)
          pins.push({ id, body: JSON.parse(String(init.body)) as Record<string, unknown> })
          return Promise.resolve(new Response(JSON.stringify({ id }), { status: 201 }))
        }
        const pinId = url.pathname.match(/^\/v5\/pins\/(\d+)$/)?.[1]
        if (url.origin === 'https://api-sandbox.pinterest.com' && pinId) {
          return Promise.resolve(new Response(JSON.stringify({ id: pinId }), { status: 200 }))
        }
        return nativeFetch.call(this, input, init)
      }
    })

    const png = (await readFile(resolve('dist/icon-128.png'))).toString('base64')
    await page.evaluate(async (posterBase64) => {
      const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      const settings = settingsResponse.data
      settings.pinterestEnvironment = 'sandbox'
      settings.pinterestAccessToken = 'pina_batch_browser_test'
      settings.pinterestBoardId = '123'
      settings.boardName = 'SHOPEE'
      settings.developerDryRun = false
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings })

      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const request = indexedDB.open('autopin-shopee', 3)
        request.onsuccess = () => resolveDb(request.result)
        request.onerror = () => rejectDb(request.error)
      })
      const transaction = db.transaction(['jobs', 'drafts'], 'readwrite')
      const ids = ['sku-1', 'sku-2']
      for (const [index, id] of ids.entries()) {
        transaction.objectStore('drafts').put({
          id,
          product: {
            id, title: `Lampu ${index + 1}`, canonicalUrl: `https://affiliate.shopee.co.id/offer/product_offer/${index + 1}`,
            price: 80_500, rating: null, sold: 3000, commissionPercent: 11.5,
            imageUrl: 'https://down-id.img.susercontent.com/file/lamp', affiliateUrl: `https://s.shopee.co.id/tagged-${index + 1}`,
          },
          content: {
            pinTitle: `Lampu ${index + 1} untuk ruang kerja`,
            pinDescription: 'Lampu untuk penggunaan sehari-hari. #affiliate',
            altText: `Lampu ${index + 1} pada poster`, keywords: ['lampu meja'],
            layoutDirection: { headline: 'Lampu ruang kerja', visualTone: 'natural', accentPreference: 'blue' },
          },
          posterDataUrl: `data:image/png;base64,${posterBase64}`,
          provider: 'openrouter', model: 'vendor/model', boardId: '123', boardLabel: 'SHOPEE', createdAt: Date.now(),
        })
      }
      transaction.objectStore('jobs').put({
        id: 'active', state: 'awaiting_approval', queueProductIds: [], draftProductIds: ids,
        reviewedProductIds: [], approvedProductIds: [], scheduledSlots: [], nextSlotIndex: 0,
        completedToday: 0, consecutiveFailures: 0, updatedAt: Date.now(),
      })
      await new Promise<void>((resolveTx, rejectTx) => {
        transaction.oncomplete = () => resolveTx()
        transaction.onerror = () => rejectTx(transaction.error)
      })
      db.close()
      await chrome.storage.local.set({ runtimeStatus: {
        state: 'awaiting_approval', message: '2 drafts ready for review', completedToday: 0,
        dailyLimit: 10, updatedAt: Date.now(),
      } })
    }, png)

    await page.getByRole('button', { name: 'Muat ulang status' }).click()
    await expect(page.locator('#batch-list li')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Jeda' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Hentikan batch' })).toBeVisible()
    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.getByRole('button', { name: 'Hentikan batch' }).click()
    await expect(page.locator('#batch-list li')).toHaveCount(2)
    const first = page.getByRole('checkbox', { name: 'Pilih Pin Lampu 1 untuk diterbitkan' })
    const second = page.getByRole('checkbox', { name: 'Pilih Pin Lampu 2 untuk diterbitkan' })
    await expect(first).toBeEnabled()
    await expect(second).toBeEnabled()
    await expect(first).not.toBeChecked()
    await expect(second).not.toBeChecked()
    await expect(page.locator('.batch-thumb')).toHaveCount(2)
    await page.getByRole('button', { name: 'Jeda' }).click()
    await expect(page.locator('#status-state')).toHaveText('Dijeda')
    await page.getByRole('button', { name: 'Lanjutkan' }).click()
    await expect(page.locator('#batch-list li')).toHaveCount(2)
    await expect(first).toBeEnabled()
    await page.getByRole('button', { name: 'Pilih semua 2 Pin' }).click()
    await expect(first).toBeChecked()
    await expect(second).toBeChecked()
    await page.getByRole('button', { name: 'Kosongkan' }).click()
    await expect(first).not.toBeChecked()
    await expect(second).not.toBeChecked()
    await page.getByRole('button', { name: 'Pilih semua 2 Pin' }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/batch-review.png', fullPage: true })
    await page.getByRole('button', { name: 'Setujui 2 Pin pilihan' }).click()
    await expect(page.locator('#batch-confirm-dialog')).toBeVisible()
    await expect(page.locator('#batch-confirm-list li')).toHaveCount(2)
    await page.getByRole('button', { name: 'Terbitkan Pin' }).click()

    await expect.poll(() => worker.evaluate(() => (Reflect.get(globalThis, '__testPins') as unknown[]).length)).toBe(1)
    const firstPin = await worker.evaluate(() => (Reflect.get(globalThis, '__testPins') as Array<{ body: Record<string, unknown> }>)[0])
    expect(firstPin.body).toMatchObject({ board_id: '123', link: 'https://s.shopee.co.id/tagged-1' })
    await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('runtimeStatus')).runtimeStatus.state)).toBe('await_publish_slot')
    await expect(page.getByRole('button', { name: 'Setujui 2 Pin pilihan' })).toBeHidden()
    const initialNextRunAt = await page.evaluate(async () => (await chrome.storage.local.get('runtimeStatus')).runtimeStatus.nextRunAt as number)
    expect(initialNextRunAt - Date.now()).toBeLessThan(20_000)

    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const request = indexedDB.open('autopin-shopee', 3)
        request.onsuccess = () => resolveDb(request.result)
        request.onerror = () => rejectDb(request.error)
      })
      const transaction = db.transaction('jobs', 'readwrite')
      const store = transaction.objectStore('jobs')
      const job = await new Promise<Record<string, unknown>>((resolveJob, rejectJob) => {
        const request = store.get('active')
        request.onsuccess = () => resolveJob(request.result)
        request.onerror = () => rejectJob(request.error)
      })
      const slots = job.scheduledSlots as number[]
      slots[1] = Date.now() + 3_600_000
      store.put(job)
      await new Promise<void>((resolveTx, rejectTx) => {
        transaction.oncomplete = () => resolveTx()
        transaction.onerror = () => rejectTx(transaction.error)
      })
      db.close()
      await chrome.alarms.create('affiliate-pin-run', { when: Date.now() + 250 })
    })

    await expect(page.getByRole('button', { name: 'Terbitkan sisa sekarang' })).toBeVisible()
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Terbitkan sisa sekarang' }).click()

    await expect.poll(() => worker.evaluate(() => (Reflect.get(globalThis, '__testPins') as unknown[]).length), { timeout: 15_000 }).toBe(2)
    const secondPin = await worker.evaluate(() => (Reflect.get(globalThis, '__testPins') as Array<{ body: Record<string, unknown> }>)[1])
    expect(secondPin.body).toMatchObject({ board_id: '123', link: 'https://s.shopee.co.id/tagged-2' })
    await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('runtimeStatus')).runtimeStatus.state)).toBe('stopped')
    await expect(page.locator('#quota-count')).toHaveText('2')
    await expect(page.locator('#publication-list a[href="https://www.pinterest.com/pin/901/"]')).toBeVisible()
  } finally {
    await context?.close()
    await rm(profilePath, { recursive: true, force: true })
  }
})

test('a 100-Pin review can be selected and confirmed without opening drafts individually', async () => {
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-100-'))
  const extensionPath = resolve('dist')
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: findChromiumExecutable(), headless: false, viewport: { width: 390, height: 844 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check'],
    })
    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
    const png = (await readFile(resolve('dist/icon-128.png'))).toString('base64')
    await page.evaluate(async (posterBase64) => {
      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const request = indexedDB.open('autopin-shopee', 3)
        request.onsuccess = () => resolveDb(request.result)
        request.onerror = () => rejectDb(request.error)
      })
      const ids = Array.from({ length: 100 }, (_, index) => `sku-${index + 1}`)
      const transaction = db.transaction(['jobs', 'drafts'], 'readwrite')
      for (const [index, id] of ids.entries()) {
        transaction.objectStore('drafts').put({
          id, product: { id, title: `Lampu meja ${index + 1}`, canonicalUrl: 'https://affiliate.shopee.co.id/offer/product_offer/1',
            price: 80_500, rating: null, sold: 3000, commissionPercent: 11.5,
            imageUrl: 'https://down-id.img.susercontent.com/file/lamp', affiliateUrl: `https://s.shopee.co.id/tagged-${index + 1}` },
          content: { pinTitle: `Lampu meja ${index + 1}`, pinDescription: 'Lampu untuk ruang kerja. #affiliate',
            altText: 'Lampu meja', keywords: ['lampu meja'],
            layoutDirection: { headline: 'Lampu meja', visualTone: 'natural', accentPreference: 'blue' } },
          posterDataUrl: `data:image/png;base64,${posterBase64}`,
          provider: 'openrouter', model: 'vendor/model', boardId: '123', boardLabel: 'Rumah', createdAt: Date.now(),
        })
      }
      transaction.objectStore('jobs').put({ id: 'active', state: 'awaiting_approval', queueProductIds: [], draftProductIds: ids,
        reviewedProductIds: [], approvedProductIds: [], scheduledSlots: [], nextSlotIndex: 0,
        completedToday: 0, consecutiveFailures: 0, updatedAt: Date.now() })
      await new Promise<void>((resolveTx, rejectTx) => {
        transaction.oncomplete = () => resolveTx()
        transaction.onerror = () => rejectTx(transaction.error)
      })
      db.close()
      await chrome.storage.local.set({ runtimeStatus: { state: 'awaiting_approval', message: '100 drafts ready for review',
        completedToday: 0, dailyLimit: 100, updatedAt: Date.now() } })
    }, png)
    await page.getByRole('button', { name: 'Muat ulang status' }).click()
    await expect(page.locator('#batch-list li')).toHaveCount(100)
    await expect(page.getByRole('button', { name: 'Pilih semua 100 Pin' })).toBeEnabled({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Pilih semua 100 Pin' }).click()
    await expect(page.getByRole('button', { name: 'Setujui 100 Pin pilihan' })).toBeEnabled()
    await page.getByRole('button', { name: 'Setujui 100 Pin pilihan' }).click()
    await expect(page.locator('#batch-confirm-list li')).toHaveCount(100)
    await page.getByRole('button', { name: 'Batal' }).click()
    await expect(page.locator('#batch-confirm-dialog')).toBeHidden()
    await page.getByRole('button', { name: 'Setujui 100 Pin pilihan' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#batch-confirm-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#batch-confirm-dialog')).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    await context?.close()
    await rm(profilePath, { recursive: true, force: true })
  }
})

test('an unpublished Pin from an older job is moved into batch review after extension reload', async () => {
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-migration-'))
  const extensionPath = resolve('dist')
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: findChromiumExecutable(), headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check'],
    })
    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
    await expect.poll(() => page.evaluate(async () => {
      const stored = await chrome.storage.local.get(['automationSettings', 'runtimeStatus'])
      return Boolean(stored.automationSettings && stored.runtimeStatus)
    })).toBe(true)
    const png = (await readFile(resolve('dist/icon-128.png'))).toString('base64')
    await page.evaluate(async (posterBase64) => {
      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const request = indexedDB.open('autopin-shopee', 3)
        request.onsuccess = () => resolveDb(request.result)
        request.onerror = () => rejectDb(request.error)
      })
      const transaction = db.transaction('jobs', 'readwrite')
      transaction.objectStore('jobs').put({
        id: 'active', state: 'await_publish_slot', queueProductIds: [], scheduledSlots: [Date.now() + 3_600_000],
        nextSlotIndex: 0, completedToday: 0, consecutiveFailures: 0, activeProductId: 'legacy-sku', updatedAt: Date.now(),
      })
      await new Promise<void>((resolveTx, rejectTx) => {
        transaction.oncomplete = () => resolveTx()
        transaction.onerror = () => rejectTx(transaction.error)
      })
      db.close()
      await chrome.storage.local.set({ runtimePayload: {
        activeProduct: {
          id: 'legacy-sku', title: 'Lampu lama', canonicalUrl: 'https://affiliate.shopee.co.id/offer/product_offer/1',
          price: 80_500, rating: null, sold: 3000, commissionPercent: 11.5,
          imageUrl: 'https://down-id.img.susercontent.com/file/lamp', affiliateUrl: 'https://s.shopee.co.id/legacy-tagged',
        },
        generatedContent: {
          pinTitle: 'Lampu lama untuk ruang kerja', pinDescription: 'Lampu untuk penggunaan sehari-hari. #affiliate',
          altText: 'Lampu pada poster', keywords: ['lampu meja'],
          layoutDirection: { headline: 'Lampu ruang kerja', visualTone: 'natural', accentPreference: 'blue' },
        },
        posterDataUrl: `data:image/png;base64,${posterBase64}`,
        provider: 'openrouter', model: 'vendor/model',
      } })
    }, png)

    await context.close()
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: findChromiumExecutable(), headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check'],
    })
    const reloadedPage = await context.newPage()
    await reloadedPage.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
    await expect.poll(() => reloadedPage.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD' }).catch(() => null)
      return response?.data ? { state: response.data.status.state, reviews: response.data.reviews.length } : null
    }), { timeout: 15_000 }).toEqual({ state: 'awaiting_approval', reviews: 1 })
  } finally {
    await context?.close()
    await rm(profilePath, { recursive: true, force: true })
  }
})

function findChromiumExecutable(): string {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  if (configured && existsSync(configured)) return configured
  const cacheRoot = resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (existsSync(cacheRoot)) {
    const installations = readdirSync(cacheRoot)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split('-')[1]) - Number(left.split('-')[1]))
    for (const installation of installations) {
      const executable = resolve(cacheRoot, installation, 'chrome-win64', 'chrome.exe')
      if (existsSync(executable)) return executable
    }
  }
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
}
