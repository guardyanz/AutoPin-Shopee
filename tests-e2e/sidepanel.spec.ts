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
    await expect(page.getByText('AutoPin Shopee', { exact: true })).toBeVisible()
    await expect(page.locator('#settings-form')).toBeAttached()
    await expect(page.locator('#review-panel')).toBeAttached()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(consoleErrors).toEqual([])
    await page.screenshot({ path: 'artifacts/sidepanel-390x844.png', fullPage: true })

    await page.setViewportSize({ width: 560, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/sidepanel-560x900.png', fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.locator('#api-key')).toBeVisible()
    await expect(page.locator('#primary-model')).toBeVisible()
    await expect(page.locator('#discovery-pages')).toHaveValue('3')
    await expect(page.locator('#pinterest-environment')).toHaveValue('sandbox')
    await expect(page.locator('#pinterest-token')).toBeVisible()
    await expect(page.locator('#pinterest-board-id')).toHaveRole('combobox')
    await expect(page.getByRole('button', { name: 'Muat Board dari Pinterest' })).toBeVisible()
    await expect(page.locator('#create-board')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Fetch Models' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(consoleErrors).toEqual([])
    await page.screenshot({ path: 'artifacts/settings-390x844.png', fullPage: true })
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
