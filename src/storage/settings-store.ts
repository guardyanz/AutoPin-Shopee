import { DEFAULT_SETTINGS, validateAffiliateTags, type AutomationSettings } from '../core/settings'

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
  const affiliateTags = Array.isArray(settings.affiliateTags)
    ? settings.affiliateTags.map((tag) => String(tag).trim())
    : []
  const tagErrors = validateAffiliateTags(affiliateTags)
  if (tagErrors.length > 0) {
    throw new Error('Shopee tag harus unik, maksimal 5, dan hanya berisi huruf atau angka tanpa spasi.')
  }
  return {
    ...settings,
    productCategory: String(settings.productCategory ?? '').trim().slice(0, 80),
    productKeywords: String(settings.productKeywords ?? '').trim().slice(0, 100),
    affiliateTags,
    pinterestEnvironment: settings.pinterestEnvironment === 'production' ? 'production' : 'sandbox',
    pinterestOAuthWorkerUrl: String(settings.pinterestOAuthWorkerUrl ?? '').trim().replace(/\/$/, ''),
    pinterestAccessToken: String(settings.pinterestAccessToken ?? '').trim(),
    pinterestRefreshToken: String(settings.pinterestRefreshToken ?? '').trim(),
    pinterestTokenExpiresAt: typeof settings.pinterestTokenExpiresAt === 'number' && Number.isFinite(settings.pinterestTokenExpiresAt)
      ? settings.pinterestTokenExpiresAt
      : null,
    pinterestBoardId: String(settings.pinterestBoardId ?? '').trim(),
    dailyLimit: 100,
    batchSize: clampInteger(settings.batchSize, 1, 100, 10),
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
