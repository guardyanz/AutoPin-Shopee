import type { ProductCandidate } from '../core/types'
import { extractShopeeCandidates } from './shopee-dom'

const NEXT_SELECTORS = [
  '.offer-list-page .page-item.page-next',
  '.page-item.page-next',
  '.ant-pagination-next:not(.ant-pagination-disabled)',
  '[class*="pagination-next" i]',
  'button[aria-label*="next" i]',
  'button[aria-label*="berikut" i]',
]

export interface ShopeeDiscoveryResult {
  candidates: ProductCandidate[]
  pagesScanned: number
  pageSignature: string
  hasNextPage: boolean
  hasMoreOnPage: boolean
  diagnostics?: ShopeeDiscoveryDiagnostics
}

export interface ShopeeDiscoveryDiagnostics {
  productsRead: number
  productsMatchingFilters: number
  affiliateLinkFailures: number
  lastAffiliateError?: { code: string; message: string }
}

export type PageProductEnricher = (candidates: ProductCandidate[], limit: number) => Promise<ProductCandidate[]>

export async function discoverShopeePage(
  root: Document,
  requestedProducts = Number.POSITIVE_INFINITY,
  enrichPage?: PageProductEnricher,
  previousPageSignature?: string,
  skipProductIds: readonly string[] = [],
): Promise<ShopeeDiscoveryResult> {
  const maxProducts = Number.isFinite(requestedProducts)
    ? Math.max(1, Math.round(requestedProducts))
    : Number.POSITIVE_INFINITY
  // Only advance when the source tab is still on the page we last scanned.
  // If Shopee or the browser reloaded the tab, re-scan it and let the saved
  // product IDs prevent duplicate work while we catch up automatically.
  if (previousPageSignature && productPageSignature(root) === previousPageSignature) {
    const next = findNextPageControl(root)
    if (!next || isDisabled(next)) {
      return { candidates: [], pagesScanned: 0, pageSignature: previousPageSignature, hasNextPage: false, hasMoreOnPage: false }
    }
    clickNextPage(next)
    if (!await waitForProductPageChange(root, previousPageSignature)) {
      throw new Error('Halaman Shopee tidak berpindah setelah tombol berikutnya diklik. Periksa halaman sumber.')
    }
  }

  const pageSignature = productPageSignature(root)
  const skipped = new Set(skipProductIds)
  const pageCandidates = extractShopeeCandidates(root).filter((candidate) => !skipped.has(candidate.id))
  const enriched = enrichPage ? await enrichPage(pageCandidates, maxProducts) : pageCandidates
  const candidates = [...new Map(enriched.slice(0, maxProducts).map((candidate) => [candidate.id, candidate])).values()]
  const next = findNextPageControl(root)
  return {
    candidates,
    pagesScanned: 1,
    pageSignature,
    hasNextPage: Boolean(next && !isDisabled(next)),
    hasMoreOnPage: candidates.length >= maxProducts && pageCandidates.length > candidates.length,
  }
}

export function findNextPageControl(root: ParentNode): HTMLElement | null {
  for (const selector of NEXT_SELECTORS) {
    const control = root.querySelector<HTMLElement>(selector)
    if (control) return control
  }
  const pagination = root.querySelector<HTMLElement>('nav[class*="pagination" i], nav[aria-label*="page" i], [class*="pagination" i]')
  const arrow = Array.from(pagination?.querySelectorAll<HTMLElement>('button, a, [role="button"]') ?? [])
    .find((control) => /^(?:›|»|>|→|next|berikut(?:nya)?)$/i.test(control.textContent?.trim() ?? ''))
  if (arrow) return arrow
  return null
}

export function isDisabled(control: HTMLElement): boolean {
  return control.matches(':disabled')
    || control.getAttribute('aria-disabled') === 'true'
    || control.classList.contains('disabled')
    || control.classList.contains('ant-pagination-disabled')
    || Boolean(control.querySelector(':disabled, [aria-disabled="true"]'))
    || Boolean(control.closest('.page-next.disabled, .ant-pagination-next.ant-pagination-disabled, [aria-disabled="true"]'))
}

export function productPageSignature(root: ParentNode): string {
  const activePage = root.querySelector('.page-item.active, .ant-pagination-item-active, [aria-current="page"]')?.textContent?.trim() ?? ''
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
