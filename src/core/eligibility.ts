import type {
  EligibilityReason,
  EligibilityRules,
  ProductCandidate,
} from './types'

export const DEFAULT_ELIGIBILITY_RULES: EligibilityRules = {
  minimumRating: 4.7,
  minimumSales: 100,
  minimumCommissionPercent: 10,
  minimumPrice: 25_000,
  maximumPrice: 500_000,
}

export function evaluateEligibility(
  product: ProductCandidate,
  rules: EligibilityRules = DEFAULT_ELIGIBILITY_RULES,
): { eligible: boolean; reasons: EligibilityReason[] } {
  const reasons: EligibilityReason[] = []

  // Affiliate cards do not always expose these metrics. Null means unreported;
  // an actual zero or a known value below the minimum still fails its gate.
  if (product.rating !== null && product.rating < rules.minimumRating) reasons.push('rating_below_minimum')
  if (product.sold !== null && product.sold < rules.minimumSales) reasons.push('sales_below_minimum')
  if (product.commissionPercent < rules.minimumCommissionPercent) reasons.push('commission_below_minimum')
  if (product.price < rules.minimumPrice || product.price > rules.maximumPrice) reasons.push('price_out_of_range')
  if (!product.imageUrl.trim()) reasons.push('affiliate_image_missing')

  return { eligible: reasons.length === 0, reasons }
}

function normalize(value: number, minimum: number, maximum: number): number {
  if (maximum === minimum) return 1
  return (value - minimum) / (maximum - minimum)
}

export function rankProducts(products: ProductCandidate[]): ProductCandidate[] {
  const eligible = products.filter((product) => evaluateEligibility(product).eligible)
  if (eligible.length < 2) return eligible

  const soldValues = eligible.map((product) => Math.log10((product.sold ?? 0) + 1))
  const commissionValues = eligible.map((product) => product.commissionPercent)
  const ratingValues = eligible.map((product) => product.rating ?? 0)

  const ranges = {
    sold: [Math.min(...soldValues), Math.max(...soldValues)] as const,
    commission: [Math.min(...commissionValues), Math.max(...commissionValues)] as const,
    rating: [Math.min(...ratingValues), Math.max(...ratingValues)] as const,
  }

  const score = (product: ProductCandidate): number => (
    normalize(product.commissionPercent, ...ranges.commission) * 0.4
    + normalize(Math.log10((product.sold ?? 0) + 1), ...ranges.sold) * 0.35
    + normalize(product.rating ?? 0, ...ranges.rating) * 0.25
  )

  return [...eligible].sort((left, right) => score(right) - score(left))
}
