import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const sourcePath = resolve('brand/PINSHOP.svg')
const source = readFileSync(sourcePath, 'utf8')
if (!source.includes('viewBox="0 0 2000 2000"') || /<script|<foreignObject|\son\w+=|\shref=/i.test(source)) {
  throw new Error('The supplied PinShop SVG is not the expected self-contained vector')
}

// The original artwork includes several lockups on one canvas. The lower-right
// mark is the high-resolution square variant supplied by the owner.
const mark = source.replace('viewBox="0 0 2000 2000"', 'viewBox="1140 1170 760 760"')
const vectorOutputs = [
  resolve('public/pinshop-mark.svg'),
  resolve('docs/assets/app-icon.svg'),
]
for (const output of vectorOutputs) {
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, mark)
}

const rasterOutputs = [
  ...[16, 48, 128].map((size) => ({ size, path: resolve(`public/icon-${size}.png`) })),
  ...[512, 1024].map((size) => ({ size, path: resolve(`docs/pinterest-submission/assets/autopin-shopee-app-icon-${size}.png`) })),
]

const browser = await chromium.launch({ executablePath: findChromiumExecutable(), headless: true })
try {
  for (const output of rasterOutputs) {
    const page = await browser.newPage({ viewport: { width: output.size, height: output.size }, deviceScaleFactor: 1 })
    await loadSvg(page, mark)
    await page.screenshot({ path: output.path, omitBackground: true, timeout: 30_000 })
    await page.close()
    process.stdout.write(`Rendered ${output.path}\n`)
  }
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 })
  await loadSvg(page, source)
  mkdirSync(resolve('artifacts'), { recursive: true })
  await page.screenshot({ path: resolve('artifacts/pinshop-source.png'), omitBackground: true, timeout: 30_000 })
  await page.close()
} finally {
  await browser.close()
}

async function loadSvg(page, svg) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%;object-fit:contain}</style><img src="${dataUrl}" alt="">`)
  await page.locator('img').evaluate((image) => image.decode())
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
