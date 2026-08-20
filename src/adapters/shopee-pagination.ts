import type { ProductCandidate } from '../core/types'
import { extractShopeeCandidates } from './shopee-dom'

const NEXT_SELECTORS = [
  '.offer-list-page .page-item.page-next',
  '.ant-pagination-next:not(.ant-pagination-disabled)',
  'button[aria-label*="next" i]',
  'button[aria-label*="berikut" i]',
]

export interface ShopeeDiscoveryResult {
  candidates: ProductCandidate[]
  pagesScanned: number
}

export type PageProductEnricher = (candidates: ProductCandidate[], limit: number) => Promise<ProductCandidate[]>

export async function discoverShopeePages(
  root: Document,
  requestedPages: number,
  requestedProducts = Number.POSITIVE_INFINITY,
  enrichPage?: PageProductEnricher,
): Promise<ShopeeDiscoveryResult> {
  const maxPages = Math.min(10, Math.max(1, Math.round(requestedPages) || 1))
  const maxProducts = Number.isFinite(requestedProducts)
    ? Math.max(1, Math.round(requestedProducts))
    : Number.POSITIVE_INFINITY
  const products = new Map<string, ProductCandidate>()
  let pagesScanned = 0

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const remaining = maxProducts - products.size
    const pageCandidates = extractShopeeCandidates(root)
    const enriched = enrichPage ? await enrichPage(pageCandidates, remaining) : pageCandidates
    enriched.slice(0, remaining).forEach((candidate) => products.set(candidate.id, candidate))
    pagesScanned += 1

    const next = findNextPageControl(root)
    if (products.size >= maxProducts || pageIndex + 1 >= maxPages || !next || isDisabled(next)) break

    const signature = productPageSignature(root)
    clickNextPage(next)
    if (!await waitForProductPageChange(root, signature)) break
  }

  return { candidates: [...products.values()], pagesScanned }
}

export function findNextPageControl(root: ParentNode): HTMLElement | null {
  for (const selector of NEXT_SELECTORS) {
    const control = root.querySelector<HTMLElement>(selector)
    if (control) return control
  }
  return null
}

export function isDisabled(control: HTMLElement): boolean {
  return control.matches(':disabled')
    || control.getAttribute('aria-disabled') === 'true'
    || control.classList.contains('disabled')
    || control.classList.contains('ant-pagination-disabled')
}

export function productPageSignature(root: ParentNode): string {
  const activePage = root.querySelector('.page-item.active, .ant-pagination-item-active')?.textContent?.trim() ?? ''
  const products = extractShopeeCandidates(root)
    .slice(0, 5)
    .map((candidate) => candidate.id)
    .join('|')
  return `${activePage}:${products}`
}

function clickNextPage(control: HTMLElement): void {
  const clickable = control.querySelector<HTMLElement>('button, a, [role="button"]') ?? control
  clickable.scrollIntoView?.({ block: 'center' })
  clickable.click()
}

async function waitForProductPageChange(
  root: ParentNode,
  previousSignature: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const loading = root.querySelector('.ant-spin-spinning, [aria-busy="true"]')
    if (!loading && productPageSignature(root) !== previousSignature) return true
  }
  return false
}
