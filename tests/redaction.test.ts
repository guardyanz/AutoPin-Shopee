import { describe, expect, it } from 'vitest'

import { redactSensitive } from '../src/core/redaction'

describe('redactSensitive', () => {
  it('redacts bearer tokens, API keys, and signed query values', () => {
    const source = 'Authorization: Bearer secret-token apiKey=abc123 https://example.com?a=1&signature=signed-value'
    const redacted = redactSensitive(source)

    expect(redacted).not.toContain('secret-token')
    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('signed-value')
    expect(redacted).toContain('[REDACTED]')
  })
})
