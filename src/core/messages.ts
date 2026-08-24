import type { AutomationSettings } from './settings'
import type { ProductCandidate, ProviderId } from './types'

export type ExtensionMessage =
  | { type: 'GET_DASHBOARD' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: AutomationSettings }
  | { type: 'FETCH_MODELS'; provider: ProviderId }
  | { type: 'TEST_PROVIDER'; provider: ProviderId }
  | { type: 'CONNECT_PINTEREST' }
  | { type: 'DISCONNECT_PINTEREST' }
  | { type: 'CREATE_PINTEREST_BOARD'; name: string; description: string }
  | { type: 'START_AUTOMATION' }
  | { type: 'PAUSE_AUTOMATION' }
  | { type: 'RESUME_AUTOMATION' }
  | { type: 'APPROVE_CURRENT_PIN' }
  | { type: 'UPDATE_PIN_DRAFT'; title: string; description: string; altText: string }
  | { type: 'STOP_AUTOMATION' }
  | { type: 'SHOPEE_PREFLIGHT' }
  | { type: 'SHOPEE_DISCOVER'; maxPages: number; maxProducts: number }
  | { type: 'SHOPEE_EXTRACT'; candidate: ProductCandidate }
  | { type: 'SHOPEE_GENERATE_LINK'; productId: string }
  | { type: 'RENDER_POSTER'; product: ProductCandidate; headline: string; visualTone: string; accentPreference: string }

export interface AutomationErrorPayload {
  code: string
  message: string
}

export type MessageResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: AutomationErrorPayload }
