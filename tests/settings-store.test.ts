import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/core/settings'
import { loadSettings, saveSettings } from '../src/storage/settings-store'

afterEach(() => vi.unstubAllGlobals())

describe('settings storage', () => {
  it('keeps the batch limit between 1 and 100 while allowing 100 Pins per day', async () => {
    let stored: Record<string, unknown> = {}
    vi.stubGlobal('chrome', {
      storage: { local: {
        get: async () => stored,
        set: async (value: Record<string, unknown>) => { stored = { ...stored, ...value } },
      } },
    })

    expect((await saveSettings({ ...DEFAULT_SETTINGS, batchSize: 150 })).batchSize).toBe(100)
    expect((await loadSettings()).dailyLimit).toBe(100)
    expect((await saveSettings({ ...DEFAULT_SETTINGS, batchSize: -3 })).batchSize).toBe(1)
  })
})
