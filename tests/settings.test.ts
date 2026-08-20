import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, validateSettingsForStart } from '../src/core/settings'

describe('automation settings', () => {
  it('keeps the approved compliance limits immutable in defaults', () => {
    expect(DEFAULT_SETTINGS.dailyLimit).toBe(10)
    expect(DEFAULT_SETTINGS.minimumWindowHours).toBe(8)
    expect(DEFAULT_SETTINGS.maximumWindowHours).toBe(12)
    expect(DEFAULT_SETTINGS.disclosure).toBe('#affiliate')
    expect(DEFAULT_SETTINGS.discoveryMaxPages).toBe(3)
  })

  it('requires an API key and selected model before start', () => {
    expect(validateSettingsForStart(DEFAULT_SETTINGS)).toEqual([
      'api_key_required',
      'primary_model_required',
    ])

    expect(validateSettingsForStart({
      ...DEFAULT_SETTINGS,
      providerConfigs: {
        ...DEFAULT_SETTINGS.providerConfigs,
        openrouter: { apiKey: 'secret', primaryModel: 'vendor/model', fallbackModel: '' },
      },
    })).toEqual([])
  })
})
