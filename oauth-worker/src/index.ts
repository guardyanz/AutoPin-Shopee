interface Env {
  OAUTH_TRANSACTIONS: KVNamespace
  APP_ENV: 'sandbox' | 'production'
  PINTEREST_CLIENT_ID: string
  PINTEREST_CLIENT_SECRET: string
  PINTEREST_REDIRECT_URI: string
}

interface OAuthTransaction {
  callbackUri: string
  environment: 'sandbox' | 'production'
  createdAt: number
}

const SCOPES = ['boards:read', 'boards:write', 'pins:read', 'pins:write'] as const
const AUTHORIZE_URL = 'https://www.pinterest.com/oauth/'
const STATE_TTL_SECONDS = 300
const TICKET_TTL_SECONDS = 120

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return withCors(await route(request, env), request)
    } catch (error) {
      const normalized = error instanceof WorkerError
        ? error
        : new WorkerError(500, 'internal_error', 'Unexpected OAuth service error')
      return withCors(Response.json({ error: { code: normalized.code, message: normalized.message } }, { status: normalized.status }), request)
    }
  },
}

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  const url = new URL(request.url)
  const routeKey = `${request.method.toUpperCase()} ${url.pathname}`
  switch (routeKey) {
    case 'GET /health':
      return Response.json({ status: 'ok', service: 'autopin-shopee-oauth', environment: env.APP_ENV })
    case 'POST /v1/oauth/pinterest/start':
      return startOAuth(request, env)
    case 'GET /v1/oauth/pinterest/callback':
      return finishOAuth(request, env)
    case 'POST /v1/oauth/pinterest/redeem':
      return redeemTicket(request, env)
    case 'POST /v1/oauth/pinterest/refresh':
      return refreshTokens(request, env)
    default:
      throw new WorkerError(404, 'not_found', 'Route not found')
  }
}

async function startOAuth(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env)
  const body = await parseJson<{ callback_uri?: unknown; environment?: unknown }>(request)
  const callbackUri = validateExtensionCallback(body.callback_uri)
  const environment = validateEnvironment(body.environment ?? env.APP_ENV)
  const state = randomToken(32)
  const transaction: OAuthTransaction = { callbackUri, environment, createdAt: Date.now() }
  await env.OAUTH_TRANSACTIONS.put(`state:${state}`, JSON.stringify(transaction), { expirationTtl: STATE_TTL_SECONDS })

  const authorizationUrl = new URL(AUTHORIZE_URL)
  authorizationUrl.search = new URLSearchParams({
    client_id: env.PINTEREST_CLIENT_ID,
    redirect_uri: env.PINTEREST_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  }).toString()
  return Response.json({ authorization_url: authorizationUrl.toString(), expires_in: STATE_TTL_SECONDS })
}

async function finishOAuth(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env)
  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  if (!state) throw new WorkerError(400, 'state_missing', 'OAuth callback is missing state')
  const key = `state:${state}`
  const transaction = await env.OAUTH_TRANSACTIONS.get<OAuthTransaction>(key, 'json')
  await env.OAUTH_TRANSACTIONS.delete(key)
  if (!transaction) throw new WorkerError(400, 'state_invalid', 'OAuth state is invalid or expired')

  const callback = new URL(transaction.callbackUri)
  if (url.searchParams.has('error')) {
    callback.searchParams.set('error', 'oauth_denied')
    return Response.redirect(callback.toString(), 302)
  }
  const code = url.searchParams.get('code') ?? ''
  if (!code) throw new WorkerError(400, 'code_missing', 'OAuth callback is missing the authorization code')

  const tokens = await exchangeTokens(env, transaction.environment, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.PINTEREST_REDIRECT_URI,
  })
  const ticket = randomToken(32)
  await env.OAUTH_TRANSACTIONS.put(`ticket:${ticket}`, JSON.stringify(tokens), { expirationTtl: TICKET_TTL_SECONDS })
  callback.searchParams.set('ticket', ticket)
  return Response.redirect(callback.toString(), 302)
}

async function redeemTicket(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ ticket?: unknown }>(request)
  const ticket = typeof body.ticket === 'string' ? body.ticket : ''
  if (!/^[A-Za-z0-9_-]{40,}$/.test(ticket)) throw new WorkerError(422, 'ticket_invalid', 'OAuth ticket is invalid')
  const key = `ticket:${ticket}`
  const tokens = await env.OAUTH_TRANSACTIONS.get<Record<string, unknown>>(key, 'json')
  await env.OAUTH_TRANSACTIONS.delete(key)
  if (!tokens) throw new WorkerError(403, 'ticket_expired', 'OAuth ticket is invalid, expired, or already redeemed')
  return Response.json(tokens, { headers: { 'Cache-Control': 'no-store' } })
}

async function refreshTokens(request: Request, env: Env): Promise<Response> {
  requireConfiguration(env)
  const body = await parseJson<{ refresh_token?: unknown; environment?: unknown }>(request)
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : ''
  if (!refreshToken.startsWith('pinr')) throw new WorkerError(422, 'refresh_token_invalid', 'Refresh token is invalid')
  const environment = validateEnvironment(body.environment ?? env.APP_ENV)
  const tokens = await exchangeTokens(env, environment, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES.join(','),
  })
  return Response.json(tokens, { headers: { 'Cache-Control': 'no-store' } })
}

async function exchangeTokens(
  env: Env,
  environment: 'sandbox' | 'production',
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = environment === 'sandbox' ? 'https://api-sandbox.pinterest.com' : 'https://api.pinterest.com'
  const response = await fetch(`${base}/v5/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.PINTEREST_CLIENT_ID}:${env.PINTEREST_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields),
  })
  if (!response.ok) throw new WorkerError(response.status >= 500 ? 503 : 400, 'token_exchange_failed', 'Pinterest token exchange failed')
  const payload = await response.json<Record<string, unknown>>()
  if (typeof payload.access_token !== 'string') throw new WorkerError(502, 'access_token_missing', 'Pinterest returned no access token')
  return payload
}

export function validateExtensionCallback(value: unknown): string {
  if (typeof value !== 'string') throw new WorkerError(422, 'callback_invalid', 'callback_uri is required')
  let callback: URL
  try {
    callback = new URL(value)
  } catch {
    throw new WorkerError(422, 'callback_invalid', 'callback_uri must be a valid URL')
  }
  if (
    callback.protocol !== 'https:'
    || !/^[a-p]{32}\.chromiumapp\.org$/u.test(callback.hostname)
    || callback.pathname !== '/pinterest'
    || callback.username
    || callback.password
    || callback.search
    || callback.hash
  ) {
    throw new WorkerError(422, 'callback_invalid', 'callback_uri must be an exact Chrome Identity redirect URL ending in /pinterest')
  }
  return callback.toString()
}

function validateEnvironment(value: unknown): 'sandbox' | 'production' {
  if (value !== 'sandbox' && value !== 'production') throw new WorkerError(422, 'environment_invalid', 'environment must be sandbox or production')
  return value
}

function requireConfiguration(env: Env): void {
  if (!env.PINTEREST_CLIENT_ID || !env.PINTEREST_CLIENT_SECRET || !env.PINTEREST_REDIRECT_URI) {
    throw new WorkerError(503, 'oauth_not_configured', 'Pinterest OAuth service is not configured')
  }
}

async function parseJson<T>(request: Request): Promise<T> {
  try {
    return await request.json<T>()
  } catch {
    throw new WorkerError(400, 'json_invalid', 'Request body must be valid JSON')
  }
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin') ?? ''
  const allowedOrigin = origin.startsWith('chrome-extension://') ? origin : 'null'
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

class WorkerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'WorkerError'
  }
}
