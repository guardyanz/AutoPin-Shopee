import type { ProviderModel } from '../core/types'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function normalizeOpenRouterModels(payload: unknown): ProviderModel[] {
  const root = asRecord(payload)
  return asArray(root?.data).flatMap((entry) => {
    const model = asRecord(entry)
    const architecture = asRecord(model?.architecture)
    const outputs = asArray(architecture?.output_modalities)
    if (typeof model?.id !== 'string' || (outputs.length > 0 && !outputs.includes('text'))) return []

    return [{
      id: model.id,
      label: typeof model.name === 'string' ? model.name : model.id,
      provider: 'openrouter' as const,
    }]
  })
}

export function normalizeOpenAIModels(payload: unknown): ProviderModel[] {
  const root = asRecord(payload)
  return asArray(root?.data).flatMap((entry) => {
    const model = asRecord(entry)
    if (typeof model?.id !== 'string') return []
    return [{ id: model.id, label: model.id, provider: 'openai' as const }]
  })
}

export function normalizeGeminiModels(payload: unknown): ProviderModel[] {
  const root = asRecord(payload)
  return asArray(root?.models).flatMap((entry) => {
    const model = asRecord(entry)
    const methods = asArray(model?.supportedGenerationMethods)
    if (typeof model?.name !== 'string' || !methods.includes('generateContent')) return []

    const id = model.name.replace(/^models\//, '')
    return [{
      id,
      label: typeof model.displayName === 'string' ? model.displayName : id,
      provider: 'gemini' as const,
    }]
  })
}
