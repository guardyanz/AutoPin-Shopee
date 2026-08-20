import type { ProductCandidate } from '../core/types'

export type ShopeePageState = 'ready' | 'authentication_required' | 'captcha_detected'

export function detectShopeePageState(root: ParentNode): ShopeePageState {
  const text = root instanceof Document
    ? root.body?.textContent ?? ''
    : root.textContent ?? ''
  if (/captcha|verifikasi untuk melanjutkan|verify you are human/i.test(text)) return 'captcha_detected'
  if (root.querySelector('input[type="password"]') || /\b(?:log in|login|masuk)\b/i.test(text) && root.querySelector('form')) {
    return 'authentication_required'
  }
  return 'ready'
}

export function extractShopeeProductDetail(
  root: ParentNode,
  candidate: ProductCandidate,
): ProductCandidate {
  const title = firstText(root, [
    'h1',
    '[data-testid*="product-title" i]',
    '[data-testid*="product-name" i]',
    '[class*="product-title" i]',
    '[class*="product-name" i]',
  ]) || candidate.title
  const description = firstText(root, [
    '[data-testid*="product-description" i]',
    '[class*="product-description" i]',
    '[class*="description" i]',
    '[itemprop="description"]',
  ]) || candidate.description
  const imageUrl = bestProductImage(root) || candidate.imageUrl

  return { ...candidate, title, description, imageUrl }
}

export function extractAffiliateLink(root: ParentNode): string {
  return extractAffiliateLinks(root)[0] ?? ''
}

export function extractAffiliateLinks(root: ParentNode): string[] {
  const candidates = [
    ...Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[value], textarea'))
      .map((control) => control.value),
    ...Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => anchor.href),
  ]
  return [...new Set(candidates.filter(isAffiliateUrl))]
}

function firstText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const text = root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return ''
}

function bestProductImage(root: ParentNode): string {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
    .map((image) => ({
      url: image.currentSrc || image.dataset.src || image.src,
      area: Math.max(image.naturalWidth, image.width) * Math.max(image.naturalHeight, image.height),
    }))
    .filter((image) => /shopee/i.test(image.url) && image.area > 0)
    .sort((left, right) => right.area - left.area)
  return images[0]?.url ?? ''
}

function isAffiliateUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /^(?:s\.shopee\.(?:co\.id|sg)|shope\.ee)$/i.test(url.hostname)
  } catch {
    return false
  }
}
