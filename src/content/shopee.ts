import { extractShopeeCandidates } from '../adapters/shopee-dom'
import {
  detectShopeePageState,
  extractAffiliateLink,
  extractAffiliateLinks,
  extractShopeeProductDetail,
} from '../adapters/shopee-detail'
import { evaluateEligibility, rankProducts } from '../core/eligibility'
import type { ExtensionMessage, MessageResponse } from '../core/messages'
import { discoverShopeePages } from '../adapters/shopee-pagination'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message.type.startsWith('SHOPEE_')) return

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: normalizeError(error),
    } satisfies MessageResponse))
  return true
})

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'SHOPEE_PREFLIGHT': {
      const state = detectShopeePageState(document)
      if (state !== 'ready') throw codedError(state, `Shopee page is not ready: ${state}`)
      return { state, url: location.href }
    }
    case 'SHOPEE_DISCOVER': {
      const state = detectShopeePageState(document)
      if (state !== 'ready') throw codedError(state, `Shopee page is not ready: ${state}`)
      const discovery = await discoverShopeePages(
        document,
        message.maxPages,
        message.maxProducts,
        enrichAffiliateLinks,
      )
      return { candidates: rankProducts(discovery.candidates), pagesScanned: discovery.pagesScanned }
    }
    case 'SHOPEE_EXTRACT':
      return { product: extractShopeeProductDetail(document, message.candidate) }
    case 'SHOPEE_GENERATE_LINK':
      return { affiliateUrl: await generateAffiliateLink(message.productId) }
    default:
      throw codedError('unsupported_message', `Unsupported Shopee message: ${message.type}`)
  }
}

function hasIncompleteMetrics(candidate: ReturnType<typeof extractShopeeCandidates>[number]): boolean {
  return candidate.rating <= 0 || candidate.sold <= 0 || candidate.commissionPercent <= 0
}

async function enrichAffiliateLinks(
  candidates: ReturnType<typeof extractShopeeCandidates>,
  limit: number,
): Promise<ReturnType<typeof extractShopeeCandidates>> {
  const usable = rankProducts(candidates)
    .filter((candidate) => hasIncompleteMetrics(candidate) || evaluateEligibility(candidate).eligible)
    .slice(0, limit)
  const enriched: ReturnType<typeof extractShopeeCandidates> = []

  for (const candidate of usable) {
    try {
      const affiliateUrl = await generateAffiliateLink(candidate.id)
      enriched.push({ ...candidate, affiliateUrl })
    } catch (error) {
      console.warn('[AutoPin Shopee] Skipping product without an affiliate link', candidate.id, error)
    }
  }
  return enriched
}

async function generateAffiliateLink(productId: string): Promise<string> {
  const card = findProductCard(productId)
  if (!card) throw codedError('product_card_missing', 'Shopee affiliate product card was not found')
  const existing = extractAffiliateLink(card)
  if (existing) return existing

  const previousLinks = new Set(extractAffiliateLinks(document))
  const action = Array.from(card.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .find((element) => /(?:buat|dapatkan|generate|salin|copy).*(?:link|tautan)|(?:link|tautan).*(?:affiliate|afiliasi)/i.test(element.textContent ?? ''))
  if (!action) throw codedError('affiliate_action_missing', 'Affiliate link action was not found')
  action.click()

  try {
    return await waitForValue(
      () => extractAffiliateLinks(document).find((link) => !previousLinks.has(link)) ?? extractAffiliateLink(card),
      12_000,
      'affiliate_link_missing',
    )
  } finally {
    closeAffiliateDialog()
  }
}

function closeAffiliateDialog(): void {
  const dialog = document.querySelector<HTMLElement>('.ant-modal-root, .ant-modal, [role="dialog"]')
  const close = dialog?.querySelector<HTMLElement>('.ant-modal-close, button[aria-label="Close" i], button[aria-label="Tutup" i]')
  close?.click()
}

function findProductCard(productId: string): HTMLElement | null {
  const explicit = document.querySelector<HTMLElement>(`[data-product-id="${CSS.escape(productId)}"]`)
  if (explicit) return explicit
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .find((anchor) => anchor.href.includes(productId))
  return link?.closest<HTMLElement>('article, li, [role="listitem"], [class*="card" i]') ?? null
}

async function waitForValue(
  read: () => string | undefined,
  timeout: number,
  code: string,
): Promise<string> {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw codedError(code, 'Timed out waiting for Shopee affiliate link')
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return { code: 'code' in error ? String(error.code) : 'shopee_error', message: error.message }
  }
  return { code: 'shopee_error', message: 'Unknown Shopee adapter error' }
}
