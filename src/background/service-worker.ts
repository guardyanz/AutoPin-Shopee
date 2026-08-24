import { validateGeneratedContent } from '../core/content-validation'
import { buildPinGenerationPrompt } from '../core/prompt'
import type { ExtensionMessage, MessageResponse } from '../core/messages'
import { createDailySchedule, localDayKey } from '../core/scheduler'
import { validateSettingsForStart, type AutomationSettings } from '../core/settings'
import { nextConsecutiveFailureCount } from '../core/state-machine'
import type { JobState, ProductCandidate, ProviderId } from '../core/types'
import { createProviderClient } from '../providers/clients'
import { PinterestApiClient, PinterestApiError } from '../providers/pinterest-api'
import { createAutomationRepository } from '../storage/repository'
import {
  appendActivity,
  clearRuntimePayload,
  getActivityLog,
  getRuntimePayload,
  getRuntimeStatus,
  setRuntimePayload,
  setRuntimeStatus,
} from '../storage/runtime-store'
import { loadSettings, saveSettings } from '../storage/settings-store'
import type { JobSnapshot, PublicationRecord } from '../storage/types'

const AFFILIATE_URL = 'https://affiliate.shopee.co.id/offer/product_offer'
const RUN_ALARM = 'affiliate-pin-run'

const repository = createAutomationRepository()
let advancePromise: Promise<void> | null = null

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  void initializeDefaults()
})

chrome.runtime.onStartup.addListener(() => {
  void resumeFromCheckpoint()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RUN_ALARM) void runAdvance()
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || isAdapterMessage(message)) return

  handleUiMessage(message)
    .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: normalizeError(error),
    } satisfies MessageResponse))
  return true
})

async function initializeDefaults(): Promise<void> {
  const settings = await loadSettings()
  await saveSettings(settings)
  const status = await getRuntimeStatus()
  await setRuntimeStatus(status)
}

async function handleUiMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_DASHBOARD':
      {
        const status = await getRuntimeStatus()
        const payload = status.state === 'awaiting_approval' ? await getRuntimePayload() : {}
        const settings = await loadSettings()
        return {
          status,
          activity: await getActivityLog(),
          publications: await repository.listRecentPublications(20),
          review: status.state === 'awaiting_approval' && payload.activeProduct?.affiliateUrl && payload.generatedContent && payload.posterDataUrl
            ? {
                productTitle: payload.activeProduct.title,
                posterDataUrl: payload.posterDataUrl,
                title: payload.generatedContent.pinTitle,
                description: payload.generatedContent.pinDescription,
                altText: payload.generatedContent.altText,
                destinationUrl: payload.activeProduct.affiliateUrl,
                boardId: settings.pinterestBoardId,
                boardLabel: settings.boardName,
              }
            : null,
        }
      }
    case 'GET_SETTINGS':
      return loadSettings()
    case 'SAVE_SETTINGS':
      return saveSettings(message.settings)
    case 'FETCH_MODELS':
      return fetchModels(message.provider)
    case 'TEST_PROVIDER':
      return testProvider(message.provider)
    case 'CONNECT_PINTEREST':
      return connectPinterest()
    case 'DISCONNECT_PINTEREST':
      return disconnectPinterest()
    case 'CREATE_PINTEREST_BOARD':
      return createPinterestBoard(message.name, message.description)
    case 'START_AUTOMATION':
      return startAutomation()
    case 'PAUSE_AUTOMATION':
      return pauseAutomation()
    case 'RESUME_AUTOMATION':
      return resumeAutomation()
    case 'APPROVE_CURRENT_PIN':
      return approveCurrentPin()
    case 'UPDATE_PIN_DRAFT':
      return updatePinDraft(message)
    case 'STOP_AUTOMATION':
      return stopAutomation()
    default:
      throw new AutomationError('unsupported_message', `Unsupported extension message: ${message.type}`)
  }
}

async function fetchModels(provider: ProviderId): Promise<{ models: unknown[] }> {
  const settings = await loadSettings()
  const config = settings.providerConfigs[provider]
  if (!config.apiKey.trim()) throw new AutomationError('api_key_required', `API key for ${provider} is required`)
  const models = await createProviderClient(provider).listModels(config.apiKey)
  settings.modelCatalogs[provider] = models
  await saveSettings(settings)
  await log('success', 'idle', `Fetched ${models.length} models from ${provider}`)
  return { models }
}

async function testProvider(provider: ProviderId): Promise<{ connected: true; modelCount: number }> {
  const { models } = await fetchModels(provider)
  return { connected: true, modelCount: models.length }
}

interface PinterestOAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

async function connectPinterest(): Promise<{ connected: true }> {
  const settings = await loadSettings()
  const workerUrl = validateOAuthWorkerUrl(settings.pinterestOAuthWorkerUrl)
  const callbackUri = chrome.identity.getRedirectURL('pinterest')
  const start = await oauthWorkerRequest<{ authorization_url: string }>(workerUrl, '/v1/oauth/pinterest/start', {
    callback_uri: callbackUri,
    environment: settings.pinterestEnvironment,
  })
  const redirect = await chrome.identity.launchWebAuthFlow({ url: start.authorization_url, interactive: true })
  if (!redirect) throw new AutomationError('oauth_cancelled', 'Pinterest OAuth did not return to AutoPin Shopee')
  const result = new URL(redirect)
  if (result.searchParams.has('error')) throw new AutomationError('oauth_denied', 'Pinterest access was denied')
  const ticket = result.searchParams.get('ticket') ?? ''
  if (!ticket) throw new AutomationError('oauth_ticket_missing', 'OAuth callback returned no one-time ticket')
  const tokens = await oauthWorkerRequest<PinterestOAuthTokens>(workerUrl, '/v1/oauth/pinterest/redeem', { ticket })
  if (!tokens.access_token) throw new AutomationError('oauth_token_missing', 'OAuth service returned no access token')
  settings.pinterestAccessToken = tokens.access_token
  settings.pinterestRefreshToken = tokens.refresh_token ?? ''
  settings.pinterestTokenExpiresAt = Date.now() + Math.max(60, tokens.expires_in ?? 3_600) * 1_000
  await saveSettings(settings)
  await log('success', 'idle', 'Pinterest account connected through OAuth Authorization Code flow')
  return { connected: true }
}

async function disconnectPinterest(): Promise<{ disconnected: true }> {
  const settings = await loadSettings()
  settings.pinterestAccessToken = ''
  settings.pinterestRefreshToken = ''
  settings.pinterestTokenExpiresAt = null
  await saveSettings(settings)
  await log('info', 'idle', 'Pinterest OAuth tokens removed from local extension storage')
  return { disconnected: true }
}

async function createPinterestBoard(nameValue: string, descriptionValue: string): Promise<{ id: string; name: string }> {
  const name = nameValue.trim()
  const description = descriptionValue.trim()
  if (name.length < 3 || name.length > 180) throw new AutomationError('board_name_invalid', 'Board name must contain 3–180 characters')
  if (description.length > 500) throw new AutomationError('board_description_invalid', 'Board description must contain at most 500 characters')
  const settings = await loadSettings()
  const pinterest = await createPinterestClient(settings)
  const board = await pinterest.createBoard(name, description)
  if (!/^\d+$/.test(board.id)) throw new AutomationError('pinterest_board_id_missing', 'Pinterest API returned no valid Board ID')
  settings.pinterestBoardId = board.id
  settings.boardName = board.name || name
  settings.boardDescription = description
  await saveSettings(settings)
  await log('success', 'idle', 'Created an owner-requested Pinterest Board')
  return { id: board.id, name: settings.boardName }
}

async function startAutomation(): Promise<{ started: true }> {
  const settings = await loadSettings()
  const settingsErrors = validateSettingsForStart(settings)
  if (settingsErrors.length > 0) throw new AutomationError(settingsErrors[0], 'Complete provider settings before starting')

  const completedToday = await repository.countPublicationsForDay(localDayKey())
  if (completedToday >= settings.dailyLimit) {
    await updateStatus('daily_limit_reached', 'Daily limit reached', completedToday)
    return { started: true }
  }

  const windowHours = randomInteger(settings.minimumWindowHours, settings.maximumWindowHours)
  const scheduledSlots = createDailySchedule({
    startAt: Date.now(),
    windowHours,
    requestedCount: settings.dailyLimit - completedToday,
    dailyCap: settings.dailyLimit,
    minSpacingMinutes: 20,
  })
  const job: JobSnapshot = {
    id: 'active',
    state: 'preflight',
    queueProductIds: [],
    scheduledSlots,
    nextSlotIndex: 0,
    completedToday,
    consecutiveFailures: 0,
    updatedAt: Date.now(),
  }
  await repository.saveJob(job)
  await clearRuntimePayload()
  await log('info', 'preflight', `Automation started with ${scheduledSlots.length} slots over ${windowHours} hours`)
  void runAdvance()
  return { started: true }
}

async function pauseAutomation(): Promise<{ paused: true }> {
  const job = await requireJob()
  job.state = 'paused'
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await chrome.alarms.clear(RUN_ALARM)
  await updateStatus('paused', 'Paused by user', job.completedToday)
  await log('warning', 'paused', 'Automation paused by user')
  return { paused: true }
}

async function resumeAutomation(): Promise<{ resumed: true }> {
  const job = await requireJob()
  if (!['paused', 'authentication_required', 'captcha_detected', 'circuit_open'].includes(job.state)) {
    throw new AutomationError('not_paused', 'Automation is not in a resumable state')
  }
  job.state = 'preflight'
  job.consecutiveFailures = 0
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await log('info', 'preflight', 'Automation resumed; preflight will run again')
  void runAdvance()
  return { resumed: true }
}

async function stopAutomation(): Promise<{ stopped: true }> {
  const job = await repository.loadJob()
  if (job) {
    job.state = 'stopped'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
  }
  await chrome.alarms.clear(RUN_ALARM)
  await clearRuntimePayload()
  await updateStatus('stopped', 'Stopped by user', job?.completedToday ?? 0)
  await log('warning', 'stopped', 'Automation stopped by user')
  return { stopped: true }
}

async function approveCurrentPin(): Promise<{ approved: true }> {
  const job = await requireJob()
  if (job.state !== 'awaiting_approval') {
    throw new AutomationError('pin_not_awaiting_approval', 'No reviewed Pin is waiting for approval')
  }
  const settings = await loadSettings()
  if (settings.developerDryRun) {
    throw new AutomationError('dry_run_enabled', 'Turn off Developer dry run before approving a live publication')
  }
  const payload = await getRuntimePayload()
  if (!payload.activeProduct || !payload.generatedContent || !payload.posterDataUrl) {
    throw new AutomationError('runtime_payload_missing', 'The reviewed Pin payload is incomplete')
  }
  job.state = 'publish_pinterest'
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await log('info', 'publish_pinterest', `User explicitly approved ${payload.activeProduct.title}`)
  void runAdvance()
  return { approved: true }
}

async function updatePinDraft(message: Extract<ExtensionMessage, { type: 'UPDATE_PIN_DRAFT' }>): Promise<{ updated: true }> {
  const job = await requireJob()
  if (job.state !== 'awaiting_approval') throw new AutomationError('pin_not_awaiting_approval', 'No Pin draft is waiting for review')
  const payload = await getRuntimePayload()
  if (!payload.generatedContent) throw new AutomationError('runtime_payload_missing', 'Pin draft content is missing')
  const title = message.title.trim()
  const description = message.description.trim()
  const altText = message.altText.trim()
  if (!title || title.length > 100) throw new AutomationError('pin_title_invalid', 'Pin title must contain 1–100 characters')
  if (description.length > 800) throw new AutomationError('pin_description_invalid', 'Pin description must contain at most 800 characters')
  if (!altText || altText.length > 500) throw new AutomationError('pin_alt_text_invalid', 'Alt text must contain 1–500 characters')
  if ((description.match(/#affiliate/gi) ?? []).length !== 1) {
    throw new AutomationError('affiliate_disclosure_invalid', 'Description must contain #affiliate exactly once')
  }
  await setRuntimePayload({
    ...payload,
    generatedContent: { ...payload.generatedContent, pinTitle: title, pinDescription: description, altText },
  })
  await log('info', 'awaiting_approval', 'User reviewed and updated the current Pin draft')
  return { updated: true }
}

async function resumeFromCheckpoint(): Promise<void> {
  const job = await repository.loadJob()
  if (!job || isTerminalOrPaused(job.state)) return
  if (job.state === 'await_publish_slot') {
    const slot = job.scheduledSlots[job.nextSlotIndex ?? 0]
    if (slot && slot > Date.now()) {
      await chrome.alarms.create(RUN_ALARM, { when: slot })
      return
    }
  }
  await runAdvance()
}

async function runAdvance(): Promise<void> {
  if (advancePromise) return advancePromise
  advancePromise = advanceWorkflow().catch(handleWorkflowError).finally(() => {
    advancePromise = null
  })
  return advancePromise
}

async function advanceWorkflow(): Promise<void> {
  let job = await requireJob()
  while (!isTerminalOrPaused(job.state)) {
    switch (job.state) {
      case 'preflight':
        await runPreflight(job)
        break
      case 'research_due_check':
        await runResearch(job)
        break
      case 'discover_products':
        await discoverProducts(job)
        break
      case 'select_candidate':
        await selectCandidate(job)
        break
      case 'extract_product':
        await extractProduct(job)
        break
      case 'generate_affiliate_link':
        await generateAffiliateLink(job)
        break
      case 'generate_copy':
        await generateCopy(job)
        break
      case 'render_poster':
        await renderPoster(job)
        break
      case 'await_publish_slot':
        if (await awaitPublishSlot(job)) return
        break
      case 'fill_pinterest':
        await fillPinterest(job)
        break
      case 'publish_pinterest':
        await publishPinterest(job)
        break
      case 'verify_publication':
        await verifyPublication(job)
        break
      case 'commit_result':
        await commitResult(job)
        break
      case 'cleanup':
        await cleanupProduct(job)
        break
      case 'idle':
        return
      default:
        throw new AutomationError('invalid_job_state', `Cannot advance from state ${job.state}`)
    }
    job = await requireJob()
  }
}

async function runPreflight(job: JobSnapshot): Promise<void> {
  await updateStatus('preflight', 'Checking Shopee, Pinterest API, and provider configuration', job.completedToday)
  const settings = await loadSettings()
  const errors = validateSettingsForStart(settings)
  if (errors.length > 0) throw new AutomationError(errors[0], 'AI and Pinterest API settings are incomplete')

  const affiliateTab = await ensureTab('affiliate.shopee.co.id', AFFILIATE_URL)
  await withSingleRetry(() => sendToTab(affiliateTab, { type: 'SHOPEE_PREFLIGHT' }))
  const pinterest = await createPinterestClient(settings)
  const boards = await pinterest.listBoards()
  if (!boards.some((board) => board.id === settings.pinterestBoardId)) {
    throw new AutomationError('pinterest_board_not_found', 'The selected Board ID is not owned by the authenticated Pinterest account')
  }
  await transition(job, 'research_due_check', 'Preflight passed')
}

async function runResearch(job: JobSnapshot): Promise<void> {
  await updateStatus('research_due_check', 'Using the Board explicitly selected by the account owner', job.completedToday)
  await log('info', 'research_due_check', 'Owner selected the destination Pinterest Board')
  await transition(job, 'discover_products', 'Owner-selected Pinterest Board is ready')
}

async function discoverProducts(job: JobSnapshot): Promise<void> {
  const settings = await loadSettings()
  await updateStatus('discover_products', `Scanning up to ${settings.discoveryMaxPages} Shopee Affiliate pages`, job.completedToday)
  const tabId = await ensureTab('affiliate.shopee.co.id', AFFILIATE_URL)
  await navigateAndWait(tabId, AFFILIATE_URL)
  const result = await withSingleRetry(() => sendToTab<{ candidates: ProductCandidate[]; pagesScanned: number }>(tabId, {
    type: 'SHOPEE_DISCOVER',
    maxPages: settings.discoveryMaxPages,
    maxProducts: Math.max(1, settings.dailyLimit - job.completedToday),
  }))
  if (result.candidates.length === 0) throw new AutomationError('no_eligible_products', 'No usable products were found on the scanned Affiliate pages')
  await repository.saveProducts(result.candidates)
  job.queueProductIds = result.candidates.map((candidate) => candidate.id)
  await transition(job, 'select_candidate', `Queued ${result.candidates.length} products from ${result.pagesScanned} page(s)`)
}

async function selectCandidate(job: JobSnapshot): Promise<void> {
  const settings = await loadSettings()
  const currentCount = await repository.countPublicationsForDay(localDayKey())
  job.completedToday = currentCount
  if (currentCount >= settings.dailyLimit) {
    await transition(job, 'daily_limit_reached', 'Daily limit reached')
    return
  }

  let selectedId: string | undefined
  for (const productId of job.queueProductIds) {
    if (!await repository.wasPublishedWithin(productId, 30)) {
      selectedId = productId
      break
    }
  }
  if (!selectedId) {
    job.state = 'stopped'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('stopped', 'No unposted eligible products remain', job.completedToday)
    return
  }

  job.activeProductId = selectedId
  await transition(job, 'extract_product', 'Selected the next eligible product')
}

async function extractProduct(job: JobSnapshot): Promise<void> {
  const candidate = await requireActiveProduct(job)
  await updateStatus('extract_product', 'Reading the product details and selecting one image', job.completedToday, candidate.title)
  const tab = await chrome.tabs.create({ url: candidate.canonicalUrl, active: false })
  if (!tab.id) throw new AutomationError('tab_creation_failed', 'Could not open the Shopee product tab')
  try {
    await waitForTabComplete(tab.id)
    const result = await withSingleRetry(() => sendToTab<{ product: ProductCandidate }>(tab.id!, {
      type: 'SHOPEE_EXTRACT',
      candidate,
    }))
    await repository.saveProducts([result.product])
    await setRuntimePayload({ activeProduct: result.product })
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => undefined)
  }
  await transition(job, 'generate_affiliate_link', 'Product detail extraction complete')
}

async function generateAffiliateLink(job: JobSnapshot): Promise<void> {
  const product = await requireActiveProduct(job)
  if (product.affiliateUrl) {
    await setRuntimePayload({ ...(await getRuntimePayload()), activeProduct: product })
    await transition(job, 'generate_copy', 'Affiliate link collected during Shopee discovery')
    return
  }
  await updateStatus('generate_affiliate_link', 'Generating the Shopee affiliate link', job.completedToday, product.title)
  const affiliateTab = await ensureTab('affiliate.shopee.co.id', AFFILIATE_URL)
  const result = await withSingleRetry(() => sendToTab<{ affiliateUrl: string }>(affiliateTab, {
    type: 'SHOPEE_GENERATE_LINK',
    productId: product.id,
  }))
  if (!result.affiliateUrl) throw new AutomationError('affiliate_link_missing', 'Shopee did not return an affiliate link')
  const updated = { ...product, affiliateUrl: result.affiliateUrl }
  await repository.saveProducts([updated])
  await setRuntimePayload({ ...(await getRuntimePayload()), activeProduct: updated })
  await transition(job, 'generate_copy', 'Affiliate link generated')
}

async function generateCopy(job: JobSnapshot): Promise<void> {
  const product = await requireActiveProduct(job)
  await updateStatus('generate_copy', 'Generating factual Pinterest copy', job.completedToday, product.title)
  const settings = await loadSettings()
  let generation = await generateWithFallback(settings, buildPinGenerationPrompt(product))
  let validated = validateGeneratedContent(generation.data, [product.title, product.description ?? ''])
  if (!validated.success) {
    const repairPrompt = `${buildPinGenerationPrompt(product)}\n\nPerbaiki respons karena: ${validated.errors.join(', ')}`
    const repaired = await generateWithFallback(settings, repairPrompt)
    validated = validateGeneratedContent(repaired.data, [product.title, product.description ?? ''])
    if (!validated.success) throw new AutomationError('invalid_generated_content', validated.errors.join(', '))
    generation = repaired
  }
  await setRuntimePayload({
    ...(await getRuntimePayload()),
    activeProduct: product,
    generatedContent: validated.data,
    provider: generation.provider,
    model: generation.model,
  })
  await transition(job, 'render_poster', 'Pinterest copy validated')
}

async function renderPoster(job: JobSnapshot): Promise<void> {
  const payload = await getRuntimePayload()
  const product = payload.activeProduct
  const content = payload.generatedContent
  if (!product || !content) throw new AutomationError('runtime_payload_missing', 'Product or generated content is missing')
  await updateStatus('render_poster', 'Rendering a 1000 x 1500 product poster', job.completedToday, product.title)
  await ensureOffscreenDocument()
  const result = await sendRuntime<{ dataUrl: string }>({
    type: 'RENDER_POSTER',
    product,
    headline: content.layoutDirection.headline,
    visualTone: content.layoutDirection.visualTone,
    accentPreference: content.layoutDirection.accentPreference,
  })
  await setRuntimePayload({ ...payload, posterDataUrl: result.dataUrl })
  await transition(job, 'await_publish_slot', 'Poster is ready')
}

async function awaitPublishSlot(job: JobSnapshot): Promise<boolean> {
  const slot = job.scheduledSlots[job.nextSlotIndex ?? 0]
  if (!slot) {
    await transition(job, 'daily_limit_reached', 'No publication slots remain')
    return true
  }
  if (slot > Date.now() + 1_000) {
    await chrome.alarms.create(RUN_ALARM, { when: slot })
    await updateStatus('await_publish_slot', 'Waiting for the next randomized publication slot', job.completedToday, undefined, slot)
    return true
  }
  await transition(job, 'fill_pinterest', 'Publication slot is active')
  return false
}

async function fillPinterest(job: JobSnapshot): Promise<void> {
  const settings = await loadSettings()
  const payload = await getRuntimePayload()
  if (!payload.activeProduct?.affiliateUrl || !payload.generatedContent || !payload.posterDataUrl) {
    throw new AutomationError('runtime_payload_missing', 'Pinterest publication payload is incomplete')
  }
  if (!/^\d+$/.test(settings.pinterestBoardId)) throw new AutomationError('pinterest_board_id_required', 'Select a valid Pinterest Board ID')
  await updateStatus('fill_pinterest', 'Draft ready; no Pinterest API write has occurred', job.completedToday, payload.activeProduct.title)
  await transition(job, 'awaiting_approval', 'Review the image, copy, disclosure, link, Board, and schedule; then explicitly approve this Pin')
}

async function publishPinterest(job: JobSnapshot): Promise<void> {
  const settings = await loadSettings()
  const payload = await getRuntimePayload()
  if (settings.developerDryRun) {
    job.state = 'paused'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('paused', 'Developer dry run: draft approved locally, Pinterest API was not called', job.completedToday, payload.activeProduct?.title)
    return
  }
  if (!payload.activeProduct?.affiliateUrl || !payload.generatedContent || !payload.posterDataUrl) {
    throw new AutomationError('runtime_payload_missing', 'Approved Pinterest API payload is incomplete')
  }
  await updateStatus('publish_pinterest', 'Creating the explicitly approved Pin through Pinterest API v5', job.completedToday, payload.activeProduct.title)
  const pinterest = await createPinterestClient(settings)
  const result = await pinterest.createPin({
    boardId: settings.pinterestBoardId,
    title: payload.generatedContent.pinTitle,
    description: payload.generatedContent.pinDescription,
    altText: payload.generatedContent.altText,
    link: payload.activeProduct.affiliateUrl,
    posterDataUrl: payload.posterDataUrl,
  })
  if (!/^\d+$/.test(result.id)) throw new AutomationError('pinterest_pin_id_missing', 'Pinterest API returned no valid Pin ID')
  const pinUrl = `https://www.pinterest.com/pin/${result.id}/`
  await setRuntimePayload({ ...payload, pinterestPinId: result.id, pinUrl, publicationConfirmed: true })
  await transition(job, 'verify_publication', 'Pinterest API acknowledged the Create Pin request')
}

async function verifyPublication(job: JobSnapshot): Promise<void> {
  const settings = await loadSettings()
  const payload = await getRuntimePayload()
  if (!payload.pinterestPinId || !payload.pinUrl || !payload.publicationConfirmed) {
    throw new AutomationError('publish_unconfirmed', 'Pinterest publication could not be verified; Create Pin will not be retried')
  }
  const pinterest = await createPinterestClient(settings)
  const result = await withSingleRetry(() => pinterest.getPin(payload.pinterestPinId!))
  if (result.id !== payload.pinterestPinId) throw new AutomationError('publish_unconfirmed', 'Pinterest returned a different Pin during verification')
  await transition(job, 'commit_result', 'Pinterest API publication verified')
}

async function commitResult(job: JobSnapshot): Promise<void> {
  const payload = await getRuntimePayload()
  if (!payload.activeProduct?.affiliateUrl || !payload.generatedContent || !payload.posterDataUrl || !payload.pinUrl || !payload.provider || !payload.model) {
    throw new AutomationError('runtime_payload_missing', 'Verified publication metadata is incomplete')
  }
  const record: PublicationRecord = {
    id: crypto.randomUUID(),
    productId: payload.activeProduct.id,
    productTitle: payload.activeProduct.title,
    productUrl: payload.activeProduct.canonicalUrl,
    affiliateUrl: payload.activeProduct.affiliateUrl,
    provider: payload.provider,
    model: payload.model,
    publishedAt: Date.now(),
    contentFingerprint: await fingerprint(JSON.stringify(payload.generatedContent)),
    posterFingerprint: await fingerprint(payload.posterDataUrl),
  }
  await repository.recordPublication(record)
  job.completedToday += 1
  job.nextSlotIndex = (job.nextSlotIndex ?? 0) + 1
  job.consecutiveFailures = 0
  await transition(job, 'cleanup', 'Publication committed')
  await log('success', 'commit_result', `Published ${payload.activeProduct.title}`)
}

async function cleanupProduct(job: JobSnapshot): Promise<void> {
  const activeId = job.activeProductId
  if (activeId) job.queueProductIds = job.queueProductIds.filter((productId) => productId !== activeId)
  delete job.activeProductId
  await clearRuntimePayload()
  const settings = await loadSettings()
  if (job.completedToday >= settings.dailyLimit) {
    await transition(job, 'daily_limit_reached', 'Daily limit reached')
  } else {
    await transition(job, 'select_candidate', 'Temporary product assets removed')
  }
}

async function handleWorkflowError(error: unknown): Promise<void> {
  const normalized = normalizeError(error)
  const job = await repository.loadJob()
  if (!job) return
  await log('error', job.state, `${normalized.code}: ${normalized.message}`)

  if (normalized.code === 'authentication_required' || normalized.code === 'captcha_detected') {
    job.state = normalized.code
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus(job.state, normalized.message, job.completedToday, undefined, undefined, normalized.message)
    await notifySafetyStop(normalized.message)
    return
  }

  if (normalized.code === 'no_eligible_products') {
    job.state = 'stopped'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('stopped', normalized.message, job.completedToday, undefined, undefined, normalized.message)
    return
  }

  const failure = nextConsecutiveFailureCount(job.consecutiveFailures, false)
  job.consecutiveFailures = failure.count
  if (failure.circuitOpen) {
    job.state = 'circuit_open'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('circuit_open', 'Stopped after three consecutive product failures', job.completedToday, undefined, undefined, normalized.message)
    await notifySafetyStop('Automation stopped after three consecutive failures')
    return
  }

  if (job.activeProductId) {
    job.queueProductIds = job.queueProductIds.filter((productId) => productId !== job.activeProductId)
    delete job.activeProductId
  }
  await clearRuntimePayload()
  job.state = 'select_candidate'
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await updateStatus('select_candidate', 'Skipped failed product and continuing', job.completedToday, undefined, undefined, normalized.message)
  await chrome.alarms.create(RUN_ALARM, { when: Date.now() + 1_000 })
}

async function transition(job: JobSnapshot, state: JobState, message: string): Promise<void> {
  job.state = state
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await updateStatus(state, message, job.completedToday, (await getRuntimePayload()).activeProduct?.title)
  await log('info', state, message)
}

async function updateStatus(
  state: JobState,
  message: string,
  completedToday: number,
  activeProductTitle?: string,
  nextRunAt?: number,
  lastError?: string,
): Promise<void> {
  await setRuntimeStatus({
    state,
    message,
    activeProductTitle,
    completedToday,
    dailyLimit: 10,
    nextRunAt,
    lastError,
    updatedAt: Date.now(),
  })
}

async function log(level: 'info' | 'success' | 'warning' | 'error', stage: JobState, message: string): Promise<void> {
  await appendActivity({ id: crypto.randomUUID(), level, stage, message, timestamp: Date.now() })
}

async function requireJob(): Promise<JobSnapshot> {
  const job = await repository.loadJob()
  if (!job) throw new AutomationError('job_missing', 'No active automation job exists')
  return job
}

async function requireActiveProduct(job: JobSnapshot): Promise<ProductCandidate> {
  if (!job.activeProductId) throw new AutomationError('active_product_missing', 'No active product is selected')
  const product = await repository.getProduct(job.activeProductId)
  if (!product) throw new AutomationError('active_product_missing', 'The active product could not be recovered')
  return product
}

async function generateWithFallback(
  settings: AutomationSettings,
  prompt: string,
): Promise<{ data: unknown; provider: ProviderId; model: string }> {
  const provider = settings.activeProvider
  const config = settings.providerConfigs[provider]
  const client = createProviderClient(provider)
  try {
    return {
      data: await client.generateJson({ apiKey: config.apiKey, model: config.primaryModel, prompt }),
      provider,
      model: config.primaryModel,
    }
  } catch (primaryError) {
    if (!config.fallbackModel) throw primaryError
    return {
      data: await client.generateJson({ apiKey: config.apiKey, model: config.fallbackModel, prompt }),
      provider,
      model: config.fallbackModel,
    }
  }
}

async function createPinterestClient(settings: AutomationSettings): Promise<PinterestApiClient> {
  if (
    settings.pinterestTokenExpiresAt
    && settings.pinterestTokenExpiresAt <= Date.now() + 5 * 60_000
    && settings.pinterestRefreshToken
  ) {
    const workerUrl = validateOAuthWorkerUrl(settings.pinterestOAuthWorkerUrl)
    const tokens = await oauthWorkerRequest<PinterestOAuthTokens>(workerUrl, '/v1/oauth/pinterest/refresh', {
      refresh_token: settings.pinterestRefreshToken,
      environment: settings.pinterestEnvironment,
    })
    if (!tokens.access_token) throw new AutomationError('oauth_refresh_failed', 'OAuth refresh returned no access token')
    settings.pinterestAccessToken = tokens.access_token
    settings.pinterestRefreshToken = tokens.refresh_token ?? settings.pinterestRefreshToken
    settings.pinterestTokenExpiresAt = Date.now() + Math.max(60, tokens.expires_in ?? 3_600) * 1_000
    await saveSettings(settings)
  }
  return new PinterestApiClient(settings.pinterestAccessToken, settings.pinterestEnvironment)
}

async function oauthWorkerRequest<T>(workerUrl: string, path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${workerUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new AutomationError('oauth_service_unreachable', error instanceof Error ? error.message : 'OAuth service is unreachable')
  }
  if (!response.ok) throw new AutomationError('oauth_service_error', `OAuth service returned HTTP ${response.status}`)
  return response.json() as Promise<T>
}

function validateOAuthWorkerUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AutomationError('oauth_worker_url_invalid', 'Enter a valid OAuth callback service URL')
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new AutomationError('oauth_worker_url_invalid', 'OAuth callback service must be a root HTTPS workers.dev URL')
  }
  return url.toString().replace(/\/$/, '')
}

async function ensureTab(host: string, defaultUrl: string): Promise<number> {
  const tabs = await chrome.tabs.query({})
  const existing = tabs.find((tab) => tab.id && tab.url?.includes(host))
  if (existing?.id) return existing.id
  const created = await chrome.tabs.create({ url: defaultUrl, active: false })
  if (!created.id) throw new AutomationError('tab_creation_failed', `Could not open ${host}`)
  await waitForTabComplete(created.id)
  return created.id
}

async function navigateAndWait(tabId: number, url: string): Promise<void> {
  const current = await chrome.tabs.get(tabId)
  if (current.url === url && current.status === 'complete') return
  await chrome.tabs.update(tabId, { url, active: false })
  await waitForTabComplete(tabId)
}

function waitForTabComplete(tabId: number, timeout = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new AutomationError('tab_load_timeout', 'Timed out waiting for the browser tab'))
    }, timeout)
    const listener = (updatedTabId: number, change: chrome.tabs.TabChangeInfo): void => {
      if (updatedTabId !== tabId || change.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    })
  })
}

async function sendToTab<T = unknown>(tabId: number, message: ExtensionMessage): Promise<T> {
  let response: MessageResponse<T>
  try {
    response = await chrome.tabs.sendMessage(tabId, message) as MessageResponse<T>
  } catch (error) {
    throw new AutomationError('content_script_unavailable', error instanceof Error ? error.message : 'Content script is unavailable')
  }
  if (!response?.ok) throw new AutomationError(response?.error.code ?? 'adapter_error', response?.error.message ?? 'Adapter request failed')
  return response.data
}

async function sendRuntime<T>(message: ExtensionMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as MessageResponse<T>
  if (!response?.ok) throw new AutomationError(response?.error.code ?? 'runtime_error', response?.error.message ?? 'Runtime request failed')
  return response.data
}

async function withSingleRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 750 + Math.random() * 500))
    return operation()
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
  if (contexts.length > 0) return
  await chrome.offscreen.createDocument({
    url: 'src/offscreen/index.html',
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Render a temporary Pinterest poster from an Affiliate-provided product image',
  })
}

async function fingerprint(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function notifySafetyStop(message: string): Promise<void> {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: 'AutoPin Shopee paused',
    message,
  })
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof AutomationError) return { code: error.code, message: error.message }
  if (error instanceof PinterestApiError) return { code: error.code, message: error.message }
  if (error instanceof Error) return { code: 'automation_error', message: error.message }
  return { code: 'automation_error', message: 'Unknown automation error' }
}

function isAdapterMessage(message: ExtensionMessage): boolean {
  return message.type.startsWith('SHOPEE_') || message.type === 'RENDER_POSTER'
}

function isTerminalOrPaused(state: JobState): boolean {
  return ['awaiting_approval', 'paused', 'daily_limit_reached', 'authentication_required', 'captcha_detected', 'circuit_open', 'stopped'].includes(state)
}

function randomInteger(minimum: number, maximum: number): number {
  return Math.floor(minimum + Math.random() * (maximum - minimum + 1))
}

class AutomationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'AutomationError'
  }
}
