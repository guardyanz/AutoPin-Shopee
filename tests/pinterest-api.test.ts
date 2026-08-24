import { describe, expect, it, vi } from 'vitest'

import { parseImageDataUrl, PinterestApiClient, PinterestApiError } from '../src/providers/pinterest-api'

describe('Pinterest API client', () => {
  it('uses the Sandbox host and paginates the authenticated owner boards', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: '1', name: 'One' }], bookmark: 'next' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: '2', name: 'Two' }], bookmark: null }), { status: 200 }))
    const client = new PinterestApiClient('pina_test', 'sandbox', fetcher)

    await expect(client.listBoards()).resolves.toEqual([{ id: '1', name: 'One' }, { id: '2', name: 'Two' }])
    expect(fetcher.mock.calls[0][0]).toBe('https://api-sandbox.pinterest.com/v5/boards?page_size=100')
    expect(fetcher.mock.calls[1][0]).toContain('bookmark=next')
  })

  it('creates a reviewed Pin with base64 media and bounded fields', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({
        board_id: '123',
        title: 'Approved title',
        link: 'https://s.shopee.co.id/example',
        media_source: { source_type: 'image_base64', content_type: 'image/png', data: 'aGVsbG8=', is_standard: true },
      })
      return new Response(JSON.stringify({ id: '456' }), { status: 201 })
    })
    const client = new PinterestApiClient('pina_test', 'production', fetcher)

    await expect(client.createPin({
      boardId: '123',
      title: 'Approved title',
      description: 'Description #affiliate',
      altText: 'Product poster',
      link: 'https://s.shopee.co.id/example',
      posterDataUrl: 'data:image/png;base64,aGVsbG8=',
    })).resolves.toEqual({ id: '456' })
  })

  it('marks a no-response failure as ambiguous so Create Pin is not blindly retried', async () => {
    const client = new PinterestApiClient('pina_test', 'production', vi.fn(async () => { throw new Error('socket closed') }))
    await expect(client.createPin({
      boardId: '123', title: 'Title', description: '', altText: '', link: '', posterDataUrl: 'data:image/png;base64,aA==',
    })).rejects.toMatchObject({ code: 'pinterest_network_ambiguous', ambiguous: true })
  })

  it('rejects unsupported poster data', () => {
    expect(() => parseImageDataUrl('data:image/webp;base64,aA==')).toThrow(PinterestApiError)
  })
})
