import { describe, expect, it } from 'vitest'

import { normalizeGeminiModels, normalizeOpenAIModels, normalizeOpenRouterModels } from '../src/providers/model-normalizers'

describe('provider model normalization', () => {
  it('normalizes and filters OpenRouter text models', () => {
    const models = normalizeOpenRouterModels({
      data: [
        { id: 'vendor/text', name: 'Text', architecture: { output_modalities: ['text'] } },
        { id: 'vendor/image', name: 'Image', architecture: { output_modalities: ['image'] } },
      ],
    })
    expect(models).toEqual([{ id: 'vendor/text', label: 'Text', provider: 'openrouter' }])
  })

  it('normalizes OpenAI and Gemini catalog shapes', () => {
    expect(normalizeOpenAIModels({ data: [{ id: 'gpt-example' }] })).toEqual([
      { id: 'gpt-example', label: 'gpt-example', provider: 'openai' },
    ])
    expect(normalizeGeminiModels({ models: [{ name: 'models/gemini-example', displayName: 'Gemini Example', supportedGenerationMethods: ['generateContent'] }] })).toEqual([
      { id: 'gemini-example', label: 'Gemini Example', provider: 'gemini' },
    ])
  })
})
