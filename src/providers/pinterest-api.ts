export type PinterestApiEnvironment = 'sandbox' | 'production'

export interface PinterestBoard {
  id: string
  name: string
  description?: string
}

export interface PinterestPin {
  id: string
  title?: string
  link?: string
  board_id?: string
}

export interface CreatePinterestPinInput {
  boardId: string
  title: string
  description: string
  altText: string
  link: string
  posterDataUrl: string
}

export class PinterestApiClient {
  private readonly baseUrl: string

  constructor(
    private readonly accessToken: string,
    environment: PinterestApiEnvironment,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!accessToken.trim()) throw new PinterestApiError('pinterest_token_required', 'Pinterest access token is required')
    this.baseUrl = environment === 'sandbox'
      ? 'https://api-sandbox.pinterest.com/v5'
      : 'https://api.pinterest.com/v5'
  }

  async listBoards(): Promise<PinterestBoard[]> {
    const boards: PinterestBoard[] = []
    let bookmark = ''
    do {
      const query = new URLSearchParams({ page_size: '100' })
      if (bookmark) query.set('bookmark', bookmark)
      const page = await this.request<{ items?: PinterestBoard[]; bookmark?: string | null }>(`/boards?${query}`)
      boards.push(...(page.items ?? []))
      bookmark = page.bookmark ?? ''
    } while (bookmark)
    return boards
  }

  createBoard(name: string, description = ''): Promise<PinterestBoard> {
    return this.request('/boards', {
      method: 'POST',
      body: JSON.stringify({ name: name.slice(0, 180), description: description.slice(0, 500) }),
    })
  }

  createPin(input: CreatePinterestPinInput): Promise<PinterestPin> {
    const media = parseImageDataUrl(input.posterDataUrl)
    return this.request('/pins', {
      method: 'POST',
      body: JSON.stringify({
        board_id: input.boardId,
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 800),
        alt_text: input.altText.slice(0, 500),
        link: input.link.slice(0, 2048),
        media_source: {
          source_type: 'image_base64',
          content_type: media.contentType,
          data: media.data,
          is_standard: true,
        },
      }),
    })
  }

  getPin(pinId: string): Promise<PinterestPin> {
    if (!/^\d+$/.test(pinId)) throw new PinterestApiError('pinterest_pin_id_invalid', 'Pinterest Pin ID is invalid')
    return this.request(`/pins/${pinId}`)
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      })
    } catch (error) {
      throw new PinterestApiError(
        'pinterest_network_ambiguous',
        error instanceof Error ? error.message : 'Pinterest API request did not return a response',
        true,
      )
    }

    if (!response.ok) {
      const correlationId = response.headers.get('x-pinterest-rid') ?? response.headers.get('x-request-id') ?? ''
      const retryable = response.status === 429 || response.status >= 500
      throw new PinterestApiError(
        `pinterest_http_${response.status}`,
        `Pinterest API request failed with HTTP ${response.status}${correlationId ? ` (${correlationId})` : ''}`,
        retryable,
      )
    }
    return response.json() as Promise<T>
  }
}

export class PinterestApiError extends Error {
  constructor(readonly code: string, message: string, readonly ambiguous = false) {
    super(message)
    this.name = 'PinterestApiError'
  }
}

export function parseImageDataUrl(value: string): { contentType: 'image/png' | 'image/jpeg'; data: string } {
  const match = value.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new PinterestApiError('poster_data_invalid', 'Poster must be a base64 PNG or JPEG data URL')
  return { contentType: match[1] as 'image/png' | 'image/jpeg', data: match[2] }
}
