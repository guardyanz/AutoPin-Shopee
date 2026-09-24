import { expect, test, chromium, type BrowserContext } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const chromeExecutable = findChromiumExecutable()

test('loads the unpacked extension side panel without layout overflow', async () => {
  const extensionPath = resolve('dist')
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-'))
  let context: BrowserContext | undefined

  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: chromeExecutable,
      headless: false,
      viewport: { width: 390, height: 844 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    })

    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const page = await context.newPage()
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
    await expect(page.getByText('PinShop', { exact: true })).toBeVisible()
    await expect.poll(() => page.locator('.brand-mark').evaluate((image: HTMLImageElement) => image.naturalWidth > 0)).toBe(true)
    await expect(page.locator('#settings-form')).toBeAttached()
    await expect(page.locator('#review-panel')).toBeAttached()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(consoleErrors).toEqual([])
    await page.screenshot({ path: 'artifacts/sidepanel-390x844.png', fullPage: true })

    await page.setViewportSize({ width: 560, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/sidepanel-560x900.png', fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Pengaturan' }).click()
    await expect(page.locator('#source-settings')).toHaveAttribute('open', '')
    await expect(page.locator('#ai-settings')).not.toHaveAttribute('open', '')
    await expect(page.locator('#pinterest-settings')).not.toHaveAttribute('open', '')
    await expect(page.locator('#discovery-pages')).toHaveValue('3')
    await expect(page.locator('#affiliate-tags')).toHaveValue('')
    await expect(page.locator('#batch-size')).toHaveValue('10')
    await expect(page.locator('#product-category')).toHaveValue('')
    await expect(page.locator('#product-keywords')).toHaveValue('')
    await page.screenshot({ path: 'artifacts/settings-390x844.png', fullPage: true })
    await page.locator('#ai-settings summary').click()
    await page.locator('#pinterest-settings summary').click()
    await expect(page.locator('#api-key')).toBeVisible()
    await expect(page.locator('#primary-model')).toBeVisible()
    await expect(page.locator('#pinterest-environment')).toHaveValue('sandbox')
    await expect(page.locator('#pinterest-token')).toBeVisible()
    await expect(page.locator('#pinterest-board-id')).toHaveRole('combobox')
    await expect(page.getByRole('button', { name: 'Muat Board dari Pinterest' })).toBeVisible()
    await expect(page.locator('#create-board')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Muat model' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(consoleErrors).toEqual([])

    await page.locator('#batch-size').fill('100')
    await page.locator('#product-category').fill('Kesehatan')
    await page.locator('#product-keywords').fill('vitamin anak')
    await page.getByRole('button', { name: 'Simpan pengaturan' }).click()
    await expect.poll(() => page.evaluate(async () => {
      const { automationSettings } = await chrome.storage.local.get('automationSettings')
      return [automationSettings.batchSize, automationSettings.productCategory, automationSettings.productKeywords]
    })).toEqual([100, 'Kesehatan', 'vitamin anak'])
    await page.setViewportSize({ width: 320, height: 700 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/settings-320x700.png', fullPage: true })
  } finally {
    await context?.close()
    await rm(profilePath, { recursive: true, force: true })
  }
})

test('loads, selects, and creates boards through the extension service worker', async () => {
  const extensionPath = resolve('dist')
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-boards-'))
  let context: BrowserContext | undefined

  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: chromeExecutable,
      headless: false,
      viewport: { width: 390, height: 844 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    })
    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host

    await worker.evaluate(() => {
      const nativeFetch = globalThis.fetch
      const boards = [{ id: '123', name: 'SHOPEE', description: 'Produk Shopee' }]
      globalThis.fetch = function (this: typeof globalThis, input, init) {
        const url = new URL(String(input))
        if (url.origin !== 'https://api-sandbox.pinterest.com' || url.pathname !== '/v5/boards') {
          throw new Error(`Unexpected test request: ${url.origin}${url.pathname}`)
        }
        if (new Headers(init?.headers).get('Authorization') !== 'Bearer pina_browser_test') {
          throw new Error('Board request did not use the token saved in Settings')
        }
        const method = init?.method ?? 'GET'
        if (method !== 'GET' && method !== 'POST') throw new Error(`Unexpected test method: ${method}`)
        const created = method === 'POST'
          ? { id: '456', ...JSON.parse(String(init?.body)) as { name: string; description: string } }
          : null
        if (created) boards.push(created)
        const payload = created ?? { items: boards, bookmark: null }
        // Keep Chromium's native receiver validation. Abort before any network
        // traffic, then supply a fixture so no real Pinterest account is used.
        return nativeFetch.call(this, input, { ...init, signal: AbortSignal.abort() }).catch((error: unknown) => {
          if (!(error instanceof DOMException) || error.name !== 'AbortError') throw error
          return new Response(JSON.stringify(payload), { status: created ? 201 : 200 })
        })
      }
    })

    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
    await page.getByRole('button', { name: 'Pengaturan' }).click()
    await page.locator('#pinterest-settings summary').click()
    await page.locator('#pinterest-token').fill('pina_browser_test')
    await page.getByRole('button', { name: 'Muat Board dari Pinterest' }).click()
    await expect(page.locator('#board-list-state')).toContainText('1 Board ditemukan')
    await page.locator('#pinterest-board-id').selectOption('123')
    await expect(page.locator('#board-name')).toHaveValue('SHOPEE')
    await page.getByRole('button', { name: 'Simpan pengaturan' }).click()
    await expect.poll(() => page.evaluate(async () => {
      const stored = await chrome.storage.local.get('automationSettings')
      return stored.automationSettings.pinterestBoardId
    })).toBe('123')

    await page.locator('#board-name').fill('SHOPEE BARU')
    await page.locator('#board-description').fill('Board test')
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Buat Board melalui API' }).click()
    await expect(page.locator('#board-list-state')).toContainText('Board berhasil dibuat dan dipilih: SHOPEE BARU')
    await expect(page.locator('#pinterest-board-id')).toHaveValue('456')
    await expect.poll(() => page.evaluate(async () => {
      const stored = await chrome.storage.local.get('automationSettings')
      return { id: stored.automationSettings.pinterestBoardId, name: stored.automationSettings.boardName }
    })).toEqual({ id: '456', name: 'SHOPEE BARU' })
    await page.screenshot({ path: 'artifacts/boards-390x844.png', fullPage: true })
  } finally {
    await context?.close()
    await rm(profilePath, { recursive: true, force: true })
  }
})

test('discovers Affiliate offers without ratings through the installed content script', async () => {
  const extensionPath = resolve('dist')
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-discovery-'))
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: chromeExecutable,
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check'],
    })
    const affiliateUrl = 'https://affiliate.shopee.co.id/offer/product_offer'
    await context.route('https://down-id.img.susercontent.com/**', (route) => route.abort())
    await context.route('https://affiliate.shopee.co.id/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><h1>Penawaran Produk</h1>
        <div role="tablist">
          <button role="tab" aria-selected="true">Semua</button>
          <button role="tab" aria-selected="false">Perlengkapan Rumah</button>
          <button role="tab" aria-selected="false">Kesehatan</button>
        </div>
        <div class="product-offer-item"><div class="ItemCard">
          <a href="/offer/product_offer/1234"><span class="ItemCard__name">Produk mahal</span></a>
          <img src="https://down-id.img.susercontent.com/file/a">
          <span class="ItemCard__price">Rp13.999.000</span><span class="ItemCardSold__wrap">373 terjual</span><span class="commRate">Komisi hingga 1,5%</span>
        </div><button>Buat Link</button></div>
        <div class="product-offer-item"><div class="ItemCard">
          <a href="/offer/product_offer/123"><span class="ItemCard__name">Lampu Meja</span></a>
          <img src="https://down-id.img.susercontent.com/file/b">
          <span class="ItemCard__price">Rp80.500</span><span class="ItemCardSold__wrap">3RB+ terjual</span><span class="commRate">Komisi hingga 11,5%</span>
        </div><button id="make-link">Buat Link</button></div>
        <script>
          document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => {
            document.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute('aria-selected', 'false'));
            tab.setAttribute('aria-selected', 'true');
          }));
          document.getElementById('make-link').addEventListener('click', () => {
            const dialog = document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            const input = document.createElement('input');
            input.value = 'https://s.shopee.co.id/lamp-test';
            const close = document.createElement('button');
            close.setAttribute('aria-label', 'Close');
            close.addEventListener('click', () => dialog.remove());
            dialog.append(input, close);
            document.body.append(dialog);
          });
        </script></body></html>`,
    }))
    let worker = context.serviceWorkers().find((candidate) => candidate.url().startsWith('chrome-extension://'))
    worker ??= await context.waitForEvent('serviceworker', { predicate: (candidate) => candidate.url().startsWith('chrome-extension://') })
    await expect.poll(() => worker.evaluate(() => typeof chrome).catch(() => 'unavailable')).toBe('object')
    const page = await context.newPage()
    await page.goto(affiliateUrl)
    await expect.poll(() => worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url })
      try {
        return (await chrome.tabs.sendMessage(tabs[0].id!, { type: 'SHOPEE_PREFLIGHT' }))?.ok
      } catch { return false }
    }, affiliateUrl)).toBe(true)
    const categories = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url })
      return chrome.tabs.sendMessage(tabs[0].id!, { type: 'SHOPEE_CATEGORIES' })
    }, affiliateUrl)
    expect(categories).toMatchObject({ ok: true, data: [{ label: 'Semua' }, { label: 'Perlengkapan Rumah' }, { label: 'Kesehatan' }] })
    const panel = await context.newPage()
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/src/sidepanel/index.html`)
    await panel.getByRole('button', { name: 'Pengaturan' }).click()
    await panel.getByRole('button', { name: 'Muat kategori dari Shopee' }).click()
    await expect(panel.locator('#shopee-categories option')).toHaveCount(3)
    await expect(panel.locator('#category-list-state')).toContainText('3 tab tersedia')
    const result = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url })
      return chrome.tabs.sendMessage(tabs[0].id!, { type: 'SHOPEE_DISCOVER', maxPages: 1, maxProducts: 1, category: 'Perlengkapan Rumah', keywords: 'meja lampu' })
    }, affiliateUrl)
    expect(result).toMatchObject({ ok: true, data: {
      candidates: [{ id: '123', price: 80_500, sold: 3_000, rating: null, commissionPercent: 11.5, affiliateUrl: 'https://s.shopee.co.id/lamp-test' }],
      diagnostics: { productsRead: 2, productsMatchingFilters: 1, affiliateLinkFailures: 0 },
    } })
    await expect(page.getByRole('tab', { name: 'Perlengkapan Rumah' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  } finally {
    await context?.close()
    await rm(profilePath, { recursive: true, force: true })
  }
})

test('uses Shopee’s tag form when generating an Affiliate shortlink', async () => {
  const extensionPath = resolve('dist')
  const profilePath = await mkdtemp(resolve(tmpdir(), 'autopin-shopee-tags-'))
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: chromeExecutable, headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-first-run', '--no-default-browser-check'],
    })
    const affiliateUrl = 'https://affiliate.shopee.co.id/offer/product_offer'
    await context.route('https://down-id.img.susercontent.com/**', (route) => route.abort())
    await context.route('https://affiliate.shopee.co.id/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><h1>Penawaran Produk</h1>
        <div class="product-offer-item"><div class="ItemCard">
          <a href="/offer/product_offer/123"><span class="ItemCard__name">Lampu Meja</span></a>
          <img src="https://down-id.img.susercontent.com/file/lamp">
          <span class="ItemCard__price">Rp80.500</span><span class="ItemCardSold__wrap">3RB+ terjual</span>
          <span class="commRate">Komisi hingga 11,5%</span>
        </div><button id="make-link">Buat Link</button></div>
        <script>
          document.getElementById('make-link').addEventListener('click', () => {
            const dialog = document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            dialog.innerHTML = '<h2>Link Penawaran Produk</h2><div>Pakai Tag <label><input type="radio" name="use-tag" value="no" checked>Tidak</label><label><input type="radio" name="use-tag" value="yes">Iya</label></div>'
              + '<label>Tag ke 1<input type="text" placeholder="Contoh: SepatuOlahraga"></label>'
              + '<label>Tag ke 2<input type="text"></label>'
              + '<button type="button" id="add-tags">Tambahkan ke Link</button>'
              + '<button type="button" aria-label="Close">Tutup</button>';
            dialog.querySelector('#add-tags').addEventListener('click', () => {
              const tags = Array.from(dialog.querySelectorAll('input[type="text"]')).map((input) => input.value);
              document.body.dataset.appliedTags = tags.join(',');
              if (dialog.querySelector('input[value="yes"]').checked && tags[0] === 'PinterestFeed') {
                const textarea = document.createElement('textarea');
                textarea.value = 'https://s.shopee.co.id/tagged-pinterest-feed';
                dialog.append(textarea);
              }
            });
            dialog.querySelector('[aria-label="Close"]').addEventListener('click', () => dialog.remove());
            document.body.append(dialog);
          });
        </script></body></html>`,
    }))
    let worker = context.serviceWorkers().find((candidate) => candidate.url().startsWith('chrome-extension://'))
    worker ??= await context.waitForEvent('serviceworker', { predicate: (candidate) => candidate.url().startsWith('chrome-extension://') })
    await expect.poll(() => worker.evaluate(() => typeof chrome).catch(() => 'unavailable')).toBe('object')
    const page = await context.newPage()
    await page.goto(affiliateUrl)
    await expect.poll(() => worker.evaluate(async (url) => {
      if (typeof chrome === 'undefined') return false
      const tabs = await chrome.tabs.query({ url })
      try { return (await chrome.tabs.sendMessage(tabs[0].id!, { type: 'SHOPEE_PREFLIGHT' }))?.ok }
      catch { return false }
    }, affiliateUrl)).toBe(true)
    const response = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url })
      return chrome.tabs.sendMessage(tabs[0].id!, {
        type: 'SHOPEE_DISCOVER', maxPages: 1, maxProducts: 1, affiliateTags: ['PinterestFeed'],
      })
    }, affiliateUrl)
    expect(response).toMatchObject({ ok: true, data: { candidates: [{ affiliateUrl: 'https://s.shopee.co.id/tagged-pinterest-feed' }] } })
    expect(await page.locator('body').getAttribute('data-applied-tags')).toBe('PinterestFeed,')
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
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
