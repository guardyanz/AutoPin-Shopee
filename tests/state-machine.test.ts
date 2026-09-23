import { describe, expect, it } from 'vitest'

import { canTransition, nextConsecutiveFailureCount } from '../src/core/state-machine'

describe('state machine', () => {
  it('allows the approved workflow and rejects speculative transitions', () => {
    expect(canTransition('idle', 'preflight')).toBe(true)
    expect(canTransition('extract_product', 'generate_affiliate_link')).toBe(true)
    expect(canTransition('render_poster', 'select_candidate')).toBe(true)
    expect(canTransition('select_candidate', 'awaiting_approval')).toBe(true)
    expect(canTransition('awaiting_approval', 'await_publish_slot')).toBe(true)
    expect(canTransition('fill_pinterest', 'publish_pinterest')).toBe(true)
    expect(canTransition('cleanup', 'await_publish_slot')).toBe(true)
    expect(canTransition('publish_pinterest', 'verify_publication')).toBe(true)
    expect(canTransition('idle', 'publish_pinterest')).toBe(false)
    expect(canTransition('generate_copy', 'commit_result')).toBe(false)
  })

  it('opens the circuit after three consecutive failed products and resets after success', () => {
    expect(nextConsecutiveFailureCount(2, false)).toEqual({ count: 3, circuitOpen: true })
    expect(nextConsecutiveFailureCount(2, true)).toEqual({ count: 0, circuitOpen: false })
  })
})
