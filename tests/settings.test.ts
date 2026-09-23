import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, validateAffiliateTags, validateSettingsForStart } from '../src/core/settings'

describe('automation settings', () => {
  it('keeps the approved compliance limits immutable in defaults', () => {
    expect(DEFAULT_SETTINGS.dailyLimit).toBe(10)
    expect(DEFAULT_SETTINGS.minimumWindowHours).toBe(8)
    expect(DEFAULT_SETTINGS.maximumWindowHours).toBe(12)
    expect(DEFAULT_SETTINGS.disclosure).toBe('#affiliate')
    expect(DEFAULT_SETTINGS.discoveryMaxPages).toBe(3)
    expect(DEFAULT_SETTINGS.developerDryRun).toBe(true)
    expect(DEFAULT_SETTINGS.affiliateTags).toEqual([])
  })

  it('requires an API key and selected model before start', () => {
    expect(validateSettingsForStart(DEFAULT_SETTINGS)).toEqual([
      'api_key_required',
      'primary_model_required',
      'pinterest_token_required',
      'pinterest_board_id_required',
    ])

    expect(validateSettingsForStart({
      ...DEFAULT_SETTINGS,
      providerConfigs: {
        ...DEFAULT_SETTINGS.providerConfigs,
        openrouter: { apiKey: 'secret', primaryModel: 'vendor/model', fallbackModel: '' },
      },
      pinterestAccessToken: 'pina_test',
      pinterestBoardId: '123456789',
    })).toEqual([])
  })

  it('accepts up to five Shopee tracking tags made of letters and numbers', () => {
    expect(validateAffiliateTags(['PinterestFeed', 'Promo2026'])).toEqual([])
    expect(validateAffiliateTags(['bad tag'])).toContain('affiliate_tag_invalid')
    expect(validateAffiliateTags(['one', 'two', 'three', 'four', 'five', 'six'])).toContain('affiliate_tags_limit')
  })
})
