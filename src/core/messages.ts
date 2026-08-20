import type { PinterestPinFields } from '../adapters/pinterest-dom'
import type { AutomationSettings } from './settings'
import type { ProductCandidate, ProviderId } from './types'

export type ExtensionMessage =
  | { type: 'GET_DASHBOARD' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: AutomationSettings }
  | { type: 'FETCH_MODELS'; provider: ProviderId }
  | { type: 'TEST_PROVIDER'; provider: ProviderId }
  | { type: 'START_AUTOMATION' }
  | { type: 'PAUSE_AUTOMATION' }
  | { type: 'RESUME_AUTOMATION' }
  | { type: 'STOP_AUTOMATION' }
  | { type: 'SHOPEE_PREFLIGHT' }
  | { type: 'SHOPEE_DISCOVER'; maxPages: number; maxProducts: number }
  | { type: 'SHOPEE_EXTRACT'; candidate: ProductCandidate }
  | { type: 'SHOPEE_GENERATE_LINK'; productId: string }
  | { type: 'PINTEREST_PREFLIGHT' }
  | { type: 'PINTEREST_COLLECT_RESEARCH' }
  | { type: 'PINTEREST_ENSURE_BOARD'; boardName: string; boardDescription: string }
  | { type: 'PINTEREST_FILL'; fields: PinterestPinFields; posterDataUrl: string }
  | { type: 'PINTEREST_PUBLISH' }
  | { type: 'PINTEREST_VERIFY' }
  | { type: 'RENDER_POSTER'; product: ProductCandidate; headline: string; visualTone: string; accentPreference: string }

export interface AutomationErrorPayload {
  code: string
  message: string
}

export type MessageResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: AutomationErrorPayload }
