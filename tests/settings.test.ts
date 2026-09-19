import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, validateSettingsForStart } from '../src/core/settings'

describe('automation settings', () => {
  it('keeps the approved compliance limits immutable in defaults', () => {
    expect(DEFAULT_SETTINGS.dailyLimit).toBe(10)
    expect(DEFAULT_SETTINGS.minimumWindowHours).toBe(8)
    expect(DEFAULT_SETTINGS.maximumWindowHours).toBe(12)
    expect(DEFAULT_SETTINGS.disclosure).toBe('#affiliate')
    expect(DEFAULT_SETTINGS.discoveryMaxPages).toBe(3)
    expect(DEFAULT_SETTINGS.developerDryRun).toBe(true)
    expect(DEFAULT_SETTINGS.productSource).toBe('shopee')
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

  it('validates the Amazon service configuration only for the Amazon source', () => {
    const configured = {
      ...DEFAULT_SETTINGS,
      productSource: 'amazon' as const,
      amazonServiceUrl: 'https://amazon-service.example.com/',
      amazonServiceToken: 'a-secure-service-token-1234567890',
      amazonMarketplace: 'www.amazon.com',
      amazonPartnerTag: 'example-20',
      amazonAsin: 'B0ABC12345',
      providerConfigs: {
        ...DEFAULT_SETTINGS.providerConfigs,
        openrouter: { apiKey: 'secret', primaryModel: 'vendor/model', fallbackModel: '' },
      },
      pinterestAccessToken: 'pina_test',
      pinterestBoardId: '123456789',
    }

    expect(validateSettingsForStart(configured)).toEqual([])
    expect(validateSettingsForStart({
      ...configured,
      amazonOriginalImageDataUrl: 'data:image/png;base64,AA==',
      amazonRightsConfirmed: false,
    })).toContain('amazon_image_rights_required')
  })
})
