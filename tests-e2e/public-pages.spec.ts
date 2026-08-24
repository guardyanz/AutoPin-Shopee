import { expect, test, chromium } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

test('public app and policy pages are complete, linked, and responsive', async () => {
  const browser = await chromium.launch({ executablePath: findChromiumExecutable(), headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto(pathToFileURL(resolve('docs/index.html')).href)
    await expect(page.getByRole('heading', { name: 'From a selected product to an approved Pin.' })).toBeVisible()
    await expect(page.getByText('No Pinterest passwords, session cookies, engagement automation, or Pinterest scraping.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/public-site-390x844.png', fullPage: true })

    for (const file of ['privacy.html', 'terms.html', 'data-deletion.html', 'support.html']) {
      await page.goto(pathToFileURL(resolve('docs', file)).href)
      await expect(page.locator('h1')).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    expect(consoleErrors).toEqual([])
  } finally {
    await browser.close()
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
