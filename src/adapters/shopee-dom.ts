import type { ProductCandidate } from '../core/types'

const PRODUCT_LINK_PATTERN = /(?:\/product\/\d+\/\d+|[-/]i\.\d+\.\d+|\/offer\/product_offer\/\d+)/i
const PRODUCT_CARD_SELECTOR = '[data-product-id], [data-testid*="product-card" i], [class*="product-card" i], .product-offer-item, [class*="AffiliateItemCard"]'

export function parseIndonesianCount(source: string): number {
  const normalized = source.trim().toUpperCase().replace(/\s+/g, '')
  const match = normalized.match(/([\d.,]+)(RB|K|JT|M)?/)
  if (!match) return 0

  const suffix = match[2] ?? ''
  const multiplier = suffix === 'RB' || suffix === 'K'
    ? 1_000
    : suffix === 'JT' || suffix === 'M'
      ? 1_000_000
      : 1

  const numeric = multiplier > 1
    ? Number.parseFloat(match[1].replace(',', '.'))
    : Number.parseInt(match[1].replace(/[.,]/g, ''), 10)

  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : 0
}

export function parseRupiah(source: string): number {
  const digits = source.replace(/[^\d]/g, '')
  return digits ? Number.parseInt(digits, 10) : 0
}

export function extractShopeeCandidates(root: ParentNode): ProductCandidate[] {
  const cards = findProductCards(root)
  const seen = new Set<string>()

  return cards.flatMap((card) => {
    const text = cardText(card)
    const link = findProductLink(card)
    const commissionElement = card.querySelector<HTMLElement>('.commRate, [class*="commission" i], [class*="rate" i]')
    const commissionMatch = text.match(/komisi\s*(?:hingga\s*)?([\d.,]+)\s*%/i)
      ?? commissionElement?.textContent?.match(/([\d.,]+)\s*%/i)
    if (!link || !commissionMatch) return []

    const id = card.dataset.productId || productIdFromUrl(link.href)
    if (!id || seen.has(id)) return []

    const title = findProductTitle(card, link)
    const priceElement = card.querySelector<HTMLElement>('.ItemCard__price, [data-testid*="price" i], [class*="price" i]')
    const priceMatch = (priceElement?.textContent ?? text).match(/Rp\s*[\d.]+/i)
    const ratingElement = card.querySelector<HTMLElement>('[data-testid*="rating" i], [class*="rating" i]')
    const ratingMatch = text.match(/(?:rating|bintang)\s*([0-5](?:[.,]\d+)?)/i)
      ?? (ratingElement?.getAttribute('aria-label') || ratingElement?.textContent)?.match(/([0-5](?:[.,]\d+)?)/)
    const soldElement = card.querySelector<HTMLElement>('.ItemCardSold__wrap, [data-testid*="sold" i], [class*="sold" i]')
    const soldMatch = (soldElement?.textContent ?? text).match(/([\d.,]+\s*(?:RB|K|JT|M)?)\s*\+?\s*(?:terjual|sold)/i)
    const image = card.querySelector<HTMLImageElement>('.ItemCard__image img, img[src*="susercontent.com"], picture img, img')
    const imageUrl = normalizeShopeeImageUrl(image?.currentSrc || image?.dataset.src || image?.src || '')
    if (!title || !priceMatch || !imageUrl) return []

    seen.add(id)
    return [{
      id,
      title,
      canonicalUrl: link.href,
      price: parseRupiah(priceMatch[0]),
      rating: ratingMatch ? Number.parseFloat(ratingMatch[1].replace(',', '.')) : null,
      sold: soldMatch ? parseIndonesianCount(soldMatch[1]) : null,
      commissionPercent: Number.parseFloat(commissionMatch[1].replace(',', '.')),
      imageUrl,
    }]
  })
}

export function findShopeeProductCard(root: ParentNode, productId: string): HTMLElement | null {
  return findProductCards(root).find((card) => {
    const link = findProductLink(card)
    return (card.dataset.productId || (link ? productIdFromUrl(link.href) : '')) === productId
  }) ?? null
}

function findProductCards(root: ParentNode): HTMLElement[] {
  const explicitCards = Array.from(root.querySelectorAll<HTMLElement>(PRODUCT_CARD_SELECTOR))
  const inferredCards = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((anchor) => PRODUCT_LINK_PATTERN.test(anchor.href))
    .map((anchor) => anchor.closest<HTMLElement>('.product-offer-item')
      ?? anchor.closest<HTMLElement>(PRODUCT_CARD_SELECTOR)
      ?? anchor.closest<HTMLElement>('article, li, [role="listitem"], [class*="card" i]')
      ?? anchor)
  return [...new Set([...explicitCards, ...inferredCards])]
}

function cardText(card: HTMLElement): string {
  // Adjacent price/sales elements may have no whitespace in React's markup.
  const walker = card.ownerDocument.createTreeWalker(card, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? '')
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function normalizeShopeeImageUrl(source: string): string {
  return source.replace(/@resize_[^?\s]+/i, '').split('?')[0]
}

function findProductLink(card: Element): HTMLAnchorElement | null {
  if (card instanceof HTMLAnchorElement && PRODUCT_LINK_PATTERN.test(card.href)) return card
  return Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .find((anchor) => PRODUCT_LINK_PATTERN.test(anchor.href)) ?? null
}

function findProductTitle(card: Element, link: HTMLAnchorElement): string {
  const explicit = card.querySelector<HTMLElement>(
    '.ItemCard__name, [data-testid*="product-name" i], [data-testid*="product-title" i], [class*="product-name" i], [class*="product-title" i], [class*="item-name" i]',
  )
  return (explicit?.textContent || link.textContent || link.getAttribute('aria-label') || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function productIdFromUrl(url: string): string {
  const match = url.match(/[-/]i\.\d+\.(\d+)/i)
    ?? url.match(/\/product\/\d+\/(\d+)/i)
    ?? url.match(/\/offer\/product_offer\/(\d+)/i)
  return match?.[1] ?? ''
}
