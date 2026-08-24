import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const source = resolve('docs/assets/app-icon.svg')
const outputs = [
  { size: 512, path: resolve('docs/pinterest-submission/assets/autopin-shopee-app-icon-512.png') },
  { size: 1024, path: resolve('docs/pinterest-submission/assets/autopin-shopee-app-icon-1024.png') },
]

const browser = await chromium.launch({ executablePath: findChromiumExecutable(), headless: true })
try {
  const page = await browser.newPage()
  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true })
    await page.setViewportSize({ width: output.size, height: output.size })
    await page.goto(pathToFileURL(source).href)
    await page.screenshot({ path: output.path, clip: { x: 0, y: 0, width: output.size, height: output.size } })
    process.stdout.write(`Rendered ${output.path}\n`)
  }
} finally {
  await browser.close()
}

function findChromiumExecutable() {
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
