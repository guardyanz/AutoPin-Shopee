import { productPageSignature } from './shopee-pagination'

export interface ShopeeCategory {
  label: string
  selected: boolean
}

const GROUP_SELECTOR = '[role="tablist"], .ant-tabs-nav-list, [class*="category-tabs" i], [class*="tab-list" i], [class*="tabs-nav" i]'
const CONTROL_SELECTOR = '[role="tab"], .ant-tabs-tab, button, a, [role="button"]'

export function listShopeeCategories(root: Document): ShopeeCategory[] {
  return categoryControls(root).map(({ element, label }) => ({
    label,
    selected: isSelected(element),
  }))
}

export async function selectShopeeCategory(root: Document, category: string): Promise<void> {
  const requested = normalize(category) || 'semua'
  const control = categoryControls(root).find(({ label }) => normalize(label) === requested)?.element
  if (!control) {
    if (requested === 'semua') return
    throw new Error(`Kategori "${category}" tidak tersedia pada tab Penawaran Produk Shopee. Muat ulang daftar kategori.`)
  }
  if (isSelected(control)) return

  const before = productPageSignature(root)
  control.click()
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15_000) {
    if (isSelected(control)) return
    if (productPageSignature(root) !== before && !root.querySelector('.ant-spin-spinning, [aria-busy="true"]')) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Tab kategori "${category}" tidak selesai dimuat dari Shopee.`)
}

function categoryControls(root: Document): Array<{ element: HTMLElement; label: string }> {
  for (const group of root.querySelectorAll<HTMLElement>(GROUP_SELECTOR)) {
    const controls = Array.from(group.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))
      .filter((element) => !element.closest('.product-offer-item, [data-product-id]'))
      .map((element) => ({ element, label: element.textContent?.replace(/\s+/g, ' ').trim() ?? '' }))
      .filter(({ label }) => label.length > 0 && label.length <= 80)
    if (controls.length < 3 || controls.length > 30 || !controls.some(({ label }) => normalize(label) === 'semua')) continue
    const seen = new Set<string>()
    return controls.filter(({ label }) => {
      const key = normalize(label)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return []
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
}

function isSelected(element: HTMLElement): boolean {
  return element.matches('[aria-selected="true"], .active, .ant-tabs-tab-active')
    || Boolean(element.closest('.ant-tabs-tab-active'))
}
