import { describe, expect, it, vi } from 'vitest'

import { createProviderClient } from '../src/providers/clients'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('provider clients', () => {
  it('fetches OpenRouter models with bearer authentication', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: [{ id: 'vendor/model', name: 'Vendor Model', architecture: { output_modalities: ['text'] } }],
    }))
    const client = createProviderClient('openrouter', fetcher)

    await expect(client.listModels('secret')).resolves.toEqual([
      { id: 'vendor/model', label: 'Vendor Model', provider: 'openrouter' },
    ])
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/models'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
    )
  })

  it('generates structured JSON through OpenAI chat completions', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '{"pinTitle":"Example"}' } }],
    }))
    const client = createProviderClient('openai', fetcher)

    await expect(client.generateJson({ apiKey: 'secret', model: 'gpt-example', prompt: 'Create JSON' })).resolves.toEqual({ pinTitle: 'Example' })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('normalizes Gemini generation responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '```json\n{"pinTitle":"Gemini"}\n```' }] } }],
    }))
    const client = createProviderClient('gemini', fetcher)

    await expect(client.generateJson({ apiKey: 'secret', model: 'gemini-example', prompt: 'Create JSON' })).resolves.toEqual({ pinTitle: 'Gemini' })
  })

  it('returns a sanitized provider error without exposing the API key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: 'Invalid key secret-value' } }, 401))
    const client = createProviderClient('openrouter', fetcher)

    await expect(client.listModels('secret-value')).rejects.toThrow('Provider request failed (401)')
    await expect(client.listModels('secret-value')).rejects.not.toThrow('secret-value')
  })
})
