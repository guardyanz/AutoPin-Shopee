import type { ProviderId, ProviderModel } from '../core/types'
import {
  normalizeGeminiModels,
  normalizeOpenAIModels,
  normalizeOpenRouterModels,
} from './model-normalizers'

interface GenerationRequest {
  apiKey: string
  model: string
  prompt: string
}

export interface ProviderClient {
  listModels(apiKey: string): Promise<ProviderModel[]>
  generateJson(request: GenerationRequest): Promise<unknown>
}

export function createProviderClient(
  provider: ProviderId,
  fetcher: typeof fetch = fetch,
): ProviderClient {
  switch (provider) {
    case 'openrouter':
      return createOpenAICompatibleClient({
        provider,
        modelsUrl: 'https://openrouter.ai/api/v1/models?output_modalities=text',
        generationUrl: 'https://openrouter.ai/api/v1/chat/completions',
        normalizeModels: normalizeOpenRouterModels,
        fetcher,
      })
    case 'openai':
      return createOpenAICompatibleClient({
        provider,
        modelsUrl: 'https://api.openai.com/v1/models',
        generationUrl: 'https://api.openai.com/v1/chat/completions',
        normalizeModels: normalizeOpenAIModels,
        fetcher,
      })
    case 'gemini':
      return createGeminiClient(fetcher)
  }
}

interface OpenAICompatibleOptions {
  provider: 'openrouter' | 'openai'
  modelsUrl: string
  generationUrl: string
  normalizeModels(payload: unknown): ProviderModel[]
  fetcher: typeof fetch
}

function createOpenAICompatibleClient(options: OpenAICompatibleOptions): ProviderClient {
  const headers = (apiKey: string): HeadersInit => ({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  })

  return {
    async listModels(apiKey) {
      const payload = await requestJson(options.fetcher, options.modelsUrl, {
        method: 'GET',
        headers: headers(apiKey),
      })
      return options.normalizeModels(payload)
    },

    async generateJson({ apiKey, model, prompt }) {
      const payload = await requestJson(options.fetcher, options.generationUrl, {
        method: 'POST',
        headers: headers(apiKey),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Return only valid JSON that matches the requested fields.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
        }),
      })
      const content = readNestedString(payload, ['choices', 0, 'message', 'content'])
      return parseJsonText(content)
    },
  }
}

function createGeminiClient(fetcher: typeof fetch): ProviderClient {
  return {
    async listModels(apiKey) {
      const payload = await requestJson(
        fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' },
      )
      return normalizeGeminiModels(payload)
    },

    async generateJson({ apiKey, model, prompt }) {
      const payload = await requestJson(
        fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.4,
            },
          }),
        },
      )
      const content = readNestedString(payload, ['candidates', 0, 'content', 'parts', 0, 'text'])
      return parseJsonText(content)
    },
  }
}

async function requestJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init)
  if (!response.ok) throw new Error(`Provider request failed (${response.status})`)
  return response.json() as Promise<unknown>
}

function readNestedString(value: unknown, path: Array<string | number>): string {
  let current: unknown = value
  for (const segment of path) {
    if (typeof segment === 'number') {
      current = Array.isArray(current) ? current[segment] : undefined
    } else {
      current = typeof current === 'object' && current !== null
        ? (current as Record<string, unknown>)[segment]
        : undefined
    }
  }
  if (typeof current !== 'string' || current.trim() === '') {
    throw new Error('Provider response did not contain generated content')
  }
  return current
}

function parseJsonText(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(normalized) as unknown
  } catch {
    throw new Error('Provider response was not valid JSON')
  }
}
