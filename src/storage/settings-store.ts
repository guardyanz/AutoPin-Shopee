import { DEFAULT_SETTINGS, type AutomationSettings } from '../core/settings'

const SETTINGS_KEY = 'automationSettings'

export async function loadSettings(): Promise<AutomationSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  const candidate = stored[SETTINGS_KEY] as Partial<AutomationSettings> | undefined
  if (!candidate) return structuredClone(DEFAULT_SETTINGS)

  return enforceComplianceDefaults({
    ...structuredClone(DEFAULT_SETTINGS),
    ...candidate,
    providerConfigs: {
      ...structuredClone(DEFAULT_SETTINGS.providerConfigs),
      ...candidate.providerConfigs,
    },
    modelCatalogs: {
      ...structuredClone(DEFAULT_SETTINGS.modelCatalogs),
      ...candidate.modelCatalogs,
    },
  })
}

export async function saveSettings(settings: AutomationSettings): Promise<AutomationSettings> {
  const safeSettings = enforceComplianceDefaults(settings)
  await chrome.storage.local.set({ [SETTINGS_KEY]: safeSettings })
  return safeSettings
}

function enforceComplianceDefaults(settings: AutomationSettings): AutomationSettings {
  const marketplace = String(settings.amazonMarketplace ?? '').trim().toLowerCase()
  const imageDataUrl = String(settings.amazonOriginalImageDataUrl ?? '')
  return {
    ...settings,
    discoveryMaxPages: clampInteger(settings.discoveryMaxPages, 1, 10, 3),
    productSource: settings.productSource === 'amazon' ? 'amazon' : 'shopee',
    amazonServiceUrl: String(settings.amazonServiceUrl ?? '').trim().replace(/\/$/, ''),
    amazonServiceToken: String(settings.amazonServiceToken ?? '').trim(),
    amazonMarketplace: marketplace || 'www.amazon.com',
    amazonPartnerTag: String(settings.amazonPartnerTag ?? '').trim(),
    amazonAsin: String(settings.amazonAsin ?? '').trim().toUpperCase(),
    amazonOriginalImageDataUrl: /^data:image\/(?:png|jpeg|webp);base64,/i.test(imageDataUrl) ? imageDataUrl : '',
    amazonOriginalImageName: String(settings.amazonOriginalImageName ?? '').trim().slice(0, 200),
    amazonRightsConfirmed: settings.amazonRightsConfirmed === true,
    pinterestEnvironment: settings.pinterestEnvironment === 'production' ? 'production' : 'sandbox',
    pinterestOAuthWorkerUrl: String(settings.pinterestOAuthWorkerUrl ?? '').trim().replace(/\/$/, ''),
    pinterestAccessToken: String(settings.pinterestAccessToken ?? '').trim(),
    pinterestRefreshToken: String(settings.pinterestRefreshToken ?? '').trim(),
    pinterestTokenExpiresAt: typeof settings.pinterestTokenExpiresAt === 'number' && Number.isFinite(settings.pinterestTokenExpiresAt)
      ? settings.pinterestTokenExpiresAt
      : null,
    pinterestBoardId: String(settings.pinterestBoardId ?? '').trim(),
    dailyLimit: 10,
    minimumWindowHours: 8,
    maximumWindowHours: 12,
    disclosure: '#affiliate',
  }
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)))
}
