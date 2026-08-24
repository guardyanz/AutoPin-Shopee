import type { JobState } from './types'

const transitions: Record<JobState, readonly JobState[]> = {
  idle: ['preflight', 'stopped'],
  preflight: ['research_due_check', 'authentication_required', 'captcha_detected', 'paused', 'stopped'],
  research_due_check: ['discover_products', 'paused', 'stopped'],
  discover_products: ['select_candidate', 'daily_limit_reached', 'paused', 'stopped'],
  select_candidate: ['extract_product', 'daily_limit_reached', 'paused', 'stopped'],
  extract_product: ['generate_affiliate_link', 'select_candidate', 'paused', 'stopped'],
  generate_affiliate_link: ['generate_copy', 'select_candidate', 'paused', 'stopped'],
  generate_copy: ['render_poster', 'select_candidate', 'paused', 'stopped'],
  render_poster: ['await_publish_slot', 'select_candidate', 'paused', 'stopped'],
  await_publish_slot: ['fill_pinterest', 'paused', 'stopped'],
  fill_pinterest: ['awaiting_approval', 'select_candidate', 'paused', 'stopped'],
  awaiting_approval: ['publish_pinterest', 'paused', 'stopped'],
  publish_pinterest: ['verify_publication', 'paused', 'stopped'],
  verify_publication: ['commit_result', 'select_candidate', 'paused', 'stopped'],
  commit_result: ['cleanup', 'paused', 'stopped'],
  cleanup: ['select_candidate', 'daily_limit_reached', 'paused', 'stopped'],
  paused: ['preflight', 'stopped'],
  daily_limit_reached: ['idle', 'stopped'],
  authentication_required: ['preflight', 'stopped'],
  captcha_detected: ['preflight', 'stopped'],
  circuit_open: ['preflight', 'stopped'],
  stopped: ['idle'],
}

export function canTransition(from: JobState, to: JobState): boolean {
  return transitions[from].includes(to)
}

export function nextConsecutiveFailureCount(
  currentCount: number,
  succeeded: boolean,
): { count: number; circuitOpen: boolean } {
  const count = succeeded ? 0 : currentCount + 1
  return { count, circuitOpen: count >= 3 }
}
