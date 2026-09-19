import { z } from 'zod'

import type { GeneratedPinContent } from './types'

const generatedPinContentSchema = z.object({
  pinTitle: z.string().trim().min(8).max(180),
  pinDescription: z.string().trim().min(20).max(1_000),
  altText: z.string().trim().min(8).max(500),
  keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
  layoutDirection: z.object({
    headline: z.string().trim().min(3).max(100),
    visualTone: z.string().trim().min(3).max(80),
    accentPreference: z.string().trim().min(2).max(40),
  }),
})

const FORBIDDEN_COMMERCIAL_PATTERN = /(?:\b(?:harga|diskon|voucher|promo|cashback)\b|\bRp\s?\d|\d+\s?%\s*(?:off|diskon))/i
const UNSUPPORTED_URGENCY_PATTERN = /\b(?:beli sekarang|sebelum habis|stok terbatas|buruan|wajib beli hari ini)\b/i

export type ContentValidationResult =
  | { success: true; data: GeneratedPinContent }
  | { success: false; errors: string[] }

export function validateGeneratedContent(input: unknown, _sourceFacts: string[]): ContentValidationResult {
  const parsed = generatedPinContentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, errors: parsed.error.issues.map((issue) => issue.message) }
  }

  const errors: string[] = []
  const content = `${parsed.data.pinTitle} ${parsed.data.pinDescription} ${parsed.data.layoutDirection.headline}`
  const disclosureCount = parsed.data.pinDescription.match(/#affiliate\b/gi)?.length ?? 0

  if (disclosureCount !== 1) errors.push('affiliate_disclosure_must_appear_once')
  if (FORBIDDEN_COMMERCIAL_PATTERN.test(content)) errors.push('price_or_promotion_claim_not_allowed')
  if (UNSUPPORTED_URGENCY_PATTERN.test(content)) errors.push('unsupported_urgency_claim')

  return errors.length > 0
    ? { success: false, errors }
    : { success: true, data: parsed.data }
}
