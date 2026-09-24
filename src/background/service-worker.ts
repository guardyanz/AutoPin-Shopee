import { validateGeneratedContent } from '../core/content-validation'
import type { ShopeeDiscoveryResult } from '../adapters/shopee-pagination'
import { buildPinGenerationPrompt, buildPinRepairPrompt } from '../core/prompt'
import type { ExtensionMessage, MessageResponse } from '../core/messages'
import { createImmediateSchedule, localDayKey } from '../core/scheduler'
import type { ShopeeCategory } from '../adapters/shopee-category'
import { validateSettingsForStart, type AutomationSettings } from '../core/settings'
import { nextConsecutiveFailureCount } from '../core/state-machine'
import type { JobState, ProductCandidate, ProviderId } from '../core/types'
import { createProviderClient } from '../providers/clients'
import { PinterestApiClient, PinterestApiError, type PinterestBoard } from '../providers/pinterest-api'
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
import type { JobSnapshot, PinDraft, PublicationRecord } from '../storage/types'

const AFFILIATE_URL = 'https://affiliate.shopee.co.id/offer/product_offer'
const RUN_ALARM = 'affiliate-pin-run'

const repository = createAutomationRepository()
let advancePromise: Promise<void> | null = null

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  void initializeDefaults().then(resumeFromCheckpoint)
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
        // The saved status may be from an earlier day or an interrupted run.
        // Publication history is the source of truth for the daily quota.
        status.completedToday = await repository.countPublicationsForDay(localDayKey())
        status.dailyLimit = (await loadSettings()).dailyLimit
        const job = status.state === 'awaiting_approval' ? await repository.loadJob() : undefined
        const drafts = job ? await Promise.all((job.draftProductIds ?? []).map((id) => repository.getDraft(id))) : []
        return {
          status,
          activity: await getActivityLog(),
          publications: await repository.listRecentPublications(20),
          reviews: drafts.filter((draft): draft is PinDraft => Boolean(draft)).map((draft) => ({
            productId: draft.id,
            productTitle: draft.product.title,
            title: draft.content.pinTitle,
            destinationUrl: draft.product.affiliateUrl,
            boardId: draft.boardId,
            boardLabel: draft.boardLabel,
            reviewed: (job?.reviewedProductIds ?? []).includes(draft.id),
          })),
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
    case 'LIST_PINTEREST_BOARDS':
      return listPinterestBoards()
    case 'CREATE_PINTEREST_BOARD':
      return createPinterestBoard(message.name, message.description)
    case 'LIST_SHOPEE_CATEGORIES':
      return listShopeeCategories()
    case 'START_AUTOMATION':
      return startAutomation()
    case 'PAUSE_AUTOMATION':
      return pauseAutomation()
    case 'RESUME_AUTOMATION':
      return resumeAutomation()
    case 'GET_DRAFT_PREVIEW':
      return getDraftPreview(message.productId)
    case 'APPROVE_PIN_BATCH':
      return approvePinBatch(message.productIds)
    case 'PUBLISH_REMAINING_NOW':
      return publishRemainingNow()
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
  if (!redirect) throw new AutomationError('oauth_cancelled', 'Pinterest OAuth did not return to PinShop')
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

async function listPinterestBoards(): Promise<{ boards: PinterestBoard[]; environment: AutomationSettings['pinterestEnvironment'] }> {
  const settings = await loadSettings()
  const pinterest = await createPinterestClient(settings)
  const boards = (await pinterest.listBoards())
    .filter((board) => /^\d+$/.test(board.id) && Boolean(board.name?.trim()))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { boards, environment: settings.pinterestEnvironment }
}

async function listShopeeCategories(): Promise<ShopeeCategory[]> {
  const tabId = await ensureTab('affiliate.shopee.co.id', AFFILIATE_URL)
  await navigateAndWait(tabId, AFFILIATE_URL)
  return sendToTab<ShopeeCategory[]>(tabId, { type: 'SHOPEE_CATEGORIES' })
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
  const existingJob = await repository.loadJob()
  if (existingJob && !['idle', 'stopped', 'daily_limit_reached'].includes(existingJob.state)) {
    throw new AutomationError('job_already_running', 'Stop or finish the current batch before starting another')
  }
  for (const id of existingJob?.draftProductIds ?? []) await repository.deleteDraft(id)
  const settings = await loadSettings()
  const settingsErrors = validateSettingsForStart(settings)
  if (settingsErrors.length > 0) throw new AutomationError(settingsErrors[0], 'Complete provider settings before starting')

  const completedToday = await repository.countPublicationsForDay(localDayKey())
  if (completedToday >= settings.dailyLimit) {
    await updateStatus('daily_limit_reached', 'Daily limit reached', completedToday)
    return { started: true }
  }

  const job: JobSnapshot = {
    id: 'active',
    state: 'preflight',
    queueProductIds: [],
    draftProductIds: [],
    reviewedProductIds: [],
    approvedProductIds: [],
    scheduledSlots: [],
    nextSlotIndex: 0,
    completedToday,
    consecutiveFailures: 0,
    updatedAt: Date.now(),
  }
  await repository.saveJob(job)
  await clearRuntimePayload()
  await log('info', 'preflight', `Preparing up to ${Math.min(settings.batchSize, settings.dailyLimit - completedToday)} Pin drafts for one batch review`)
  void runAdvance()
  return { started: true }
}

async function pauseAutomation(): Promise<{ paused: true }> {
  const job = await requireJob()
  job.pausedFrom = job.state
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
  if (job.publishOutcomeAmbiguous) {
    throw new AutomationError('pinterest_publish_ambiguous', 'Pinterest may have created this Pin. Check the account before starting a new batch; automatic retry is disabled.')
  }
  const approvedPending = (job.approvedProductIds?.length ?? 0) > (job.nextSlotIndex ?? 0)
  const resumablePublishStage = ['await_publish_slot', 'fill_pinterest', 'publish_pinterest', 'verify_publication', 'commit_result', 'cleanup']
  const hasUnapprovedDrafts = (job.draftProductIds?.length ?? 0) > 0
  job.state = approvedPending
    ? resumablePublishStage.includes(job.pausedFrom ?? '') ? job.pausedFrom! : 'await_publish_slot'
    : hasUnapprovedDrafts && (job.state === 'circuit_open' || job.pausedFrom === 'awaiting_approval') ? 'awaiting_approval' : 'preflight'
  if (job.state === 'awaiting_approval') {
    delete job.activeProductId
    await clearRuntimePayload()
    await updateStatus('awaiting_approval', `${job.draftProductIds?.length ?? 0} prepared drafts ready for batch review`, job.completedToday)
  }
  delete job.pausedFrom
  job.consecutiveFailures = 0
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await log('info', job.state, 'Automation resumed from the saved batch checkpoint')
  void runAdvance()
  return { resumed: true }
}

async function stopAutomation(): Promise<{ stopped: true }> {
  const job = await repository.loadJob()
  if (job) {
    for (const productId of job.draftProductIds ?? []) await repository.deleteDraft(productId)
    job.draftProductIds = []
    job.approvedProductIds = []
    job.state = 'stopped'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
  }
  await chrome.alarms.clear(RUN_ALARM)
  await clearRuntimePayload()
  await updateStatus('stopped', 'Stopped by user', await repository.countPublicationsForDay(localDayKey()))
  await log('warning', 'stopped', 'Automation stopped by user')
  return { stopped: true }
}

async function getDraftPreview(productId: string): Promise<PinDraft> {
  const job = await requireJob()
  if (job.state !== 'awaiting_approval') {
    throw new AutomationError('batch_not_awaiting_approval', 'No Pin batch is waiting for review')
  }
  if (!(job.draftProductIds ?? []).includes(productId)) throw new AutomationError('draft_not_in_batch', 'This Pin is not in the current batch')
  const draft = await repository.getDraft(productId)
  if (!draft) throw new AutomationError('draft_missing', 'The requested Pin draft could not be recovered')
  return draft
}

async function approvePinBatch(productIds: string[]): Promise<{ approved: number }> {
  const job = await requireJob()
  if (job.state !== 'awaiting_approval') throw new AutomationError('batch_not_awaiting_approval', 'No Pin batch is waiting for approval')
  if (productIds.length === 0 || new Set(productIds).size !== productIds.length) {
    throw new AutomationError('batch_selection_invalid', 'Select at least one Pin; each Pin can appear only once in the batch')
  }
  if (productIds.some((id) => !(job.draftProductIds ?? []).includes(id))) {
    throw new AutomationError('batch_selection_invalid', 'Every selected Pin must belong to the displayed draft batch')
  }
  const settings = await loadSettings()
  if (settings.developerDryRun) {
    throw new AutomationError('dry_run_enabled', 'Turn off Developer dry run before approving live publication')
  }
  const completedToday = await repository.countPublicationsForDay(localDayKey())
  const target = Math.min(settings.batchSize, settings.dailyLimit - completedToday)
  if ((job.draftProductIds?.length ?? 0) < target) {
    throw new AutomationError('batch_incomplete', `Batch baru ${job.draftProductIds?.length ?? 0}/${target} draft; lanjutkan pengumpulan sebelum persetujuan`)
  }
  if (productIds.length > settings.dailyLimit - completedToday) {
    throw new AutomationError('daily_limit_exceeded', 'Selected Pins exceed the remaining daily publication quota')
  }
  if (productIds.length > settings.batchSize) {
    throw new AutomationError('batch_limit_exceeded', 'Selected Pins exceed the configured batch size')
  }
  for (const id of productIds) {
    const draft = await repository.getDraft(id)
    if (!draft?.product.affiliateUrl || !draft.posterDataUrl || draft.boardId !== settings.pinterestBoardId) {
      throw new AutomationError('draft_invalid', 'A selected Pin is incomplete or its Board has changed; review the batch again')
    }
  }
  job.completedToday = completedToday
  job.approvedProductIds = productIds
  job.scheduledSlots = createImmediateSchedule(Date.now(), productIds.length)
  job.nextSlotIndex = 0
  await activateApprovedDraft(job, productIds[0])
  await transition(job, 'await_publish_slot', `You selected ${productIds.length} Pins; publishing this batch now`)
  await log('success', 'await_publish_slot', `Explicit batch approval recorded for ${productIds.length} selected Pins`)
  void runAdvance()
  return { approved: productIds.length }
}

async function publishRemainingNow(): Promise<{ remaining: number }> {
  const job = await requireJob()
  if (job.state !== 'await_publish_slot') {
    throw new AutomationError('batch_not_waiting', 'No approved Pin batch is waiting for a publication slot')
  }
  const remaining = (job.approvedProductIds?.length ?? 0) - (job.nextSlotIndex ?? 0)
  if (remaining < 1 || job.publishOutcomeAmbiguous) {
    throw new AutomationError('batch_not_waiting', 'There are no safely resumable approved Pins to publish')
  }
  const slots = [...job.scheduledSlots]
  slots.splice(job.nextSlotIndex ?? 0, remaining, ...createImmediateSchedule(Date.now(), remaining))
  job.scheduledSlots = slots
  job.updatedAt = Date.now()
  await repository.saveJob(job)
  await chrome.alarms.clear(RUN_ALARM)
  await updateStatus('await_publish_slot', `Publishing ${remaining} remaining approved Pins now`, job.completedToday)
  await log('info', 'await_publish_slot', `Owner moved ${remaining} remaining approved Pins from the old schedule to immediate publication`)
  void runAdvance()
  return { remaining }
}

async function updatePinDraft(message: Extract<ExtensionMessage, { type: 'UPDATE_PIN_DRAFT' }>): Promise<{ updated: true }> {
  const job = await requireJob()
  if (job.state !== 'awaiting_approval') throw new AutomationError('pin_not_awaiting_approval', 'No Pin draft is waiting for review')
  if (!(job.draftProductIds ?? []).includes(message.productId)) throw new AutomationError('draft_not_in_batch', 'This Pin is not in the current draft batch')
  const draft = await repository.getDraft(message.productId)
  if (!draft) throw new AutomationError('draft_missing', 'Pin draft content is missing')
  const title = message.title.trim()
  const description = message.description.trim()
  const altText = message.altText.trim()
  if (!title || title.length > 100) throw new AutomationError('pin_title_invalid', 'Pin title must contain 1–100 characters')
  if (description.length > 800) throw new AutomationError('pin_description_invalid', 'Pin description must contain at most 800 characters')
  if (!altText || altText.length > 500) throw new AutomationError('pin_alt_text_invalid', 'Alt text must contain 1–500 characters')
  if ((description.match(/#affiliate/gi) ?? []).length !== 1) {
    throw new AutomationError('affiliate_disclosure_invalid', 'Description must contain #affiliate exactly once')
  }
  await repository.saveDraft({ ...draft, content: { ...draft.content, pinTitle: title, pinDescription: description, altText } })
  await log('info', 'awaiting_approval', 'User reviewed and updated the current Pin draft')
  return { updated: true }
}

async function resumeFromCheckpoint(): Promise<void> {
  const job = await repository.loadJob()
  if (!job) return
  if (job.state === 'publish_pinterest' && job.publishOutcomeAmbiguous) {
    const payload = await getRuntimePayload()
    if (payload.pinterestPinId && payload.publicationConfirmed) {
      job.state = 'verify_publication'
      job.publishOutcomeAmbiguous = false
      await repository.saveJob(job)
    } else {
      job.state = 'circuit_open'
      await repository.saveJob(job)
      await updateStatus('circuit_open', 'Pinterest Create Pin outcome is unknown; inspect the account before another run', job.completedToday)
      return
    }
  }
  if (!job.draftProductIds && ['await_publish_slot', 'fill_pinterest', 'awaiting_approval'].includes(job.state)) {
    const payload = await getRuntimePayload()
    job.draftProductIds = []
    job.reviewedProductIds = []
    job.approvedProductIds = []
    job.scheduledSlots = []
    job.nextSlotIndex = 0
    job.completedToday = await repository.countPublicationsForDay(localDayKey())
    if (payload.activeProduct?.affiliateUrl && payload.generatedContent && payload.posterDataUrl && payload.provider && payload.model) {
      const settings = await loadSettings()
      await repository.saveDraft({
        id: payload.activeProduct.id,
        product: payload.activeProduct,
        content: payload.generatedContent,
        posterDataUrl: payload.posterDataUrl,
        provider: payload.provider,
        model: payload.model,
        boardId: settings.pinterestBoardId,
        boardLabel: settings.boardName,
        createdAt: Date.now(),
      })
      job.draftProductIds = [payload.activeProduct.id]
      job.queueProductIds = job.queueProductIds.filter((id) => id !== payload.activeProduct!.id)
      job.state = 'select_candidate'
      await log('info', 'select_candidate', 'Migrated the existing unpublished Pin into the new batch review')
    } else {
      job.state = 'preflight'
      job.queueProductIds = []
      await log('info', 'preflight', 'Restarting discovery because the previous publication slot has no complete Pin draft')
    }
    delete job.activeProductId
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await clearRuntimePayload()
  }
  if (job.state === 'awaiting_approval' && (job.approvedProductIds?.length ?? 0) === 0) {
    const settings = await loadSettings()
    const completedToday = await repository.countPublicationsForDay(localDayKey())
    if ((job.draftProductIds?.length ?? 0) < Math.min(settings.batchSize, settings.dailyLimit - completedToday)) {
      await holdIncompleteBatch(job, 'Batch lama belum mencapai target setelah ekstensi diperbarui; draft tetap tersimpan.')
      return
    }
  }
  if (isTerminalOrPaused(job.state)) return
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
  const result = await withSingleRetry(() => sendToTab<ShopeeDiscoveryResult>(tabId, {
    type: 'SHOPEE_DISCOVER',
    maxPages: settings.discoveryMaxPages,
    maxProducts: Math.max(1, Math.min(settings.batchSize, settings.dailyLimit - job.completedToday)),
    category: settings.productCategory,
    keywords: settings.productKeywords,
    affiliateTags: settings.affiliateTags,
  }))
  const diagnostics = result.diagnostics
  if (diagnostics) {
    await log('info', 'discover_products', `Scanned ${result.pagesScanned} page(s): ${diagnostics.productsRead} products read, ${diagnostics.productsMatchingFilters} passed filters, ${diagnostics.affiliateLinkFailures} affiliate links failed`)
  }
  if (result.candidates.length === 0) {
    if ((job.draftProductIds?.length ?? 0) > 0) {
      await holdIncompleteBatch(job, `Pemindaian ${result.pagesScanned} halaman tidak menemukan produk tambahan yang sesuai.`)
      return
    }
    const message = !diagnostics || diagnostics.productsRead === 0
      ? `Tidak ada kartu produk yang terbaca dari ${result.pagesScanned} halaman. Muat ulang halaman Shopee Affiliate lalu coba kembali.`
      : diagnostics.productsMatchingFilters === 0
        ? `${diagnostics.productsRead} produk terbaca, tetapi tidak ada yang lolos filter harga, komisi, dan metrik yang tersedia.`
        : `${diagnostics.productsMatchingFilters} produk lolos filter, tetapi link affiliate gagal diperoleh. ${diagnostics.lastAffiliateError?.message ?? 'Periksa tombol Buat Link di Shopee Affiliate.'}`
    throw new AutomationError('no_eligible_products', message)
  }
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

  const draftIds = job.draftProductIds ?? []
  if (draftIds.length >= Math.min(settings.batchSize, settings.dailyLimit - currentCount)) {
    await transition(job, 'awaiting_approval', `${draftIds.length} draft mencapai target; siap ditinjau dan disetujui bersama`)
    return
  }

  let selectedId: string | undefined
  for (const productId of job.queueProductIds) {
    if (!draftIds.includes(productId) && !await repository.wasPublishedWithin(productId, 30)) {
      selectedId = productId
      break
    }
  }
  if (!selectedId) {
    if (draftIds.length > 0) {
      await holdIncompleteBatch(job, 'Antrean produk yang ditemukan sudah habis sebelum target batch tercapai.')
      return
    }
    job.state = 'stopped'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('stopped', 'No unposted eligible products remain', job.completedToday)
    return
  }

  job.activeProductId = selectedId
  await transition(job, 'extract_product', 'Selected the next eligible product')
}

async function holdIncompleteBatch(job: JobSnapshot, reason: string): Promise<void> {
  const settings = await loadSettings()
  job.completedToday = await repository.countPublicationsForDay(localDayKey())
  const target = Math.min(settings.batchSize, settings.dailyLimit - job.completedToday)
  if (target <= 0) {
    await transition(job, 'daily_limit_reached', 'Batas terbit hari ini sudah tercapai; draft tersimpan.')
    return
  }

  job.pausedFrom = 'discover_products'
  job.queueProductIds = []
  delete job.activeProductId
  await chrome.alarms.clear(RUN_ALARM)
  await clearRuntimePayload()
  await transition(job, 'paused', `${job.draftProductIds?.length ?? 0}/${target} draft terkumpul; menunggu produk tambahan.`)
  await log('warning', 'paused', reason)
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
  const settings = await loadSettings()
  const result = await withSingleRetry(() => sendToTab<{ affiliateUrl: string }>(affiliateTab, {
    type: 'SHOPEE_GENERATE_LINK',
    productId: product.id,
    affiliateTags: settings.affiliateTags,
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
    const repairPrompt = buildPinRepairPrompt(product, generation.data, validated.errors)
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
  const settings = await loadSettings()
  if (!product.affiliateUrl || !payload.provider || !payload.model) throw new AutomationError('draft_incomplete', 'Affiliate link or provider metadata is missing')
  await repository.saveDraft({
    id: product.id, product, content, posterDataUrl: result.dataUrl,
    provider: payload.provider, model: payload.model,
    boardId: settings.pinterestBoardId, boardLabel: settings.boardName, createdAt: Date.now(),
  })
  job.draftProductIds = [...new Set([...(job.draftProductIds ?? []), product.id])]
  job.queueProductIds = job.queueProductIds.filter((id) => id !== product.id)
  delete job.activeProductId
  await transition(job, 'select_candidate', `Draft ${job.draftProductIds.length} prepared; collecting the batch`)
  await clearRuntimePayload()
}

async function awaitPublishSlot(job: JobSnapshot): Promise<boolean> {
  const approvedId = job.approvedProductIds?.[job.nextSlotIndex ?? 0]
  if (!approvedId) {
    await transition(job, 'daily_limit_reached', 'Approved batch has no remaining Pins')
    return true
  }
  if (job.activeProductId !== approvedId || !(await getRuntimePayload()).activeProduct) await activateApprovedDraft(job, approvedId)
  const slot = job.scheduledSlots[job.nextSlotIndex ?? 0]
  if (!slot) {
    await transition(job, 'daily_limit_reached', 'No publication slots remain')
    return true
  }
  if (slot > Date.now() + 1_000) {
    await chrome.alarms.create(RUN_ALARM, { when: slot })
    await updateStatus('await_publish_slot', 'Publishing the next approved Pin shortly', job.completedToday, undefined, slot)
    return true
  }
  await transition(job, 'fill_pinterest', 'Publication slot is active')
  return false
}

async function fillPinterest(job: JobSnapshot): Promise<void> {
  const payload = await getRuntimePayload()
  if (!payload.activeProduct?.affiliateUrl || !payload.generatedContent || !payload.posterDataUrl) {
    throw new AutomationError('runtime_payload_missing', 'Pinterest publication payload is incomplete')
  }
  const approvedId = job.approvedProductIds?.[job.nextSlotIndex ?? 0]
  if (payload.activeProduct.id !== approvedId) throw new AutomationError('draft_not_approved', 'The current Pin was not selected during batch approval')
  const draft = await repository.getDraft(approvedId)
  if (!draft || !/^\d+$/.test(draft.boardId)) throw new AutomationError('draft_missing', 'Approved Pin draft or Board is missing')
  const settings = await loadSettings()
  if (await repository.countPublicationsForDay(localDayKey()) >= settings.dailyLimit) {
    await transition(job, 'daily_limit_reached', 'Daily publication limit reached before the next Pin')
    return
  }
  await updateStatus('fill_pinterest', 'Approved draft validated for Pinterest API', job.completedToday, payload.activeProduct.title)
  await transition(job, 'publish_pinterest', 'Publishing a Pin explicitly selected in the reviewed batch')
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
  const approvedId = job.approvedProductIds?.[job.nextSlotIndex ?? 0]
  if (payload.activeProduct.id !== approvedId) throw new AutomationError('draft_not_approved', 'This Pin was not selected in the approved batch')
  const draft = await repository.getDraft(approvedId)
  if (!draft || !/^\d+$/.test(draft.boardId)) throw new AutomationError('draft_missing', 'Approved Pin draft or Board is missing')
  if (payload.pinterestPinId && payload.publicationConfirmed) {
    job.publishOutcomeAmbiguous = false
    await transition(job, 'verify_publication', 'Previously acknowledged Pin is ready for verification')
    return
  }
  await updateStatus('publish_pinterest', 'Creating the explicitly approved Pin through Pinterest API v5', job.completedToday, payload.activeProduct.title)
  const pinterest = await createPinterestClient(settings)
  job.publishOutcomeAmbiguous = true
  await repository.saveJob(job)
  let result
  try {
    result = await pinterest.createPin({
      boardId: draft.boardId,
      title: payload.generatedContent.pinTitle,
      description: payload.generatedContent.pinDescription,
      altText: payload.generatedContent.altText,
      link: payload.activeProduct.affiliateUrl,
      posterDataUrl: payload.posterDataUrl,
    })
  } catch (error) {
    if (error instanceof PinterestApiError && (/^pinterest_http_(?:400|401|403|404|422)$/.test(error.code) || error.code === 'poster_data_invalid')) {
      job.publishOutcomeAmbiguous = false
      await repository.saveJob(job)
    }
    throw error
  }
  if (!/^\d+$/.test(result.id)) throw new AutomationError('pinterest_pin_id_missing', 'Pinterest API returned no valid Pin ID')
  const pinUrl = `https://www.pinterest.com/pin/${result.id}/`
  await setRuntimePayload({ ...payload, pinterestPinId: result.id, pinUrl, publicationConfirmed: true })
  job.publishOutcomeAmbiguous = false
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
  if (!payload.activeProduct?.affiliateUrl || !payload.generatedContent || !payload.posterDataUrl || !payload.pinUrl || !payload.pinterestPinId || !payload.provider || !payload.model) {
    throw new AutomationError('runtime_payload_missing', 'Verified publication metadata is incomplete')
  }
  const record: PublicationRecord = {
    id: payload.pinterestPinId,
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
  job.completedToday = await repository.countPublicationsForDay(localDayKey())
  job.nextSlotIndex = Math.max(0, (job.approvedProductIds ?? []).indexOf(payload.activeProduct.id)) + 1
  job.consecutiveFailures = 0
  await transition(job, 'cleanup', 'Publication committed')
  await log('success', 'commit_result', `Published ${payload.activeProduct.title}`)
}

async function cleanupProduct(job: JobSnapshot): Promise<void> {
  const activeId = job.activeProductId
  if (activeId) {
    await repository.deleteDraft(activeId)
    job.draftProductIds = (job.draftProductIds ?? []).filter((id) => id !== activeId)
  }
  delete job.activeProductId
  await clearRuntimePayload()
  const settings = await loadSettings()
  const nextId = job.approvedProductIds?.[job.nextSlotIndex ?? 0]
  if (nextId && job.completedToday < settings.dailyLimit) {
    await activateApprovedDraft(job, nextId)
    await transition(job, 'await_publish_slot', 'Continuing the approved batch')
  } else {
    for (const id of job.draftProductIds ?? []) await repository.deleteDraft(id)
    job.draftProductIds = []
    job.approvedProductIds = []
    job.reviewedProductIds = []
    if (job.completedToday >= settings.dailyLimit) {
      await transition(job, 'daily_limit_reached', 'Daily limit reached')
    } else {
      await transition(job, 'stopped', 'Approved batch finished; no more selected Pins remain')
    }
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

  if ((job.draftProductIds?.length ?? 0) > 0 && (job.approvedProductIds?.length ?? 0) === 0
    && ['preflight', 'research_due_check', 'discover_products', 'select_candidate'].includes(job.state)) {
    await holdIncompleteBatch(job, `Sumber produk terhenti: ${normalized.message}`)
    return
  }

  if ((job.approvedProductIds?.length ?? 0) > 0) {
    job.pausedFrom = job.state
    job.publishOutcomeAmbiguous = Boolean(job.publishOutcomeAmbiguous)
    job.state = 'paused'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('paused', job.publishOutcomeAmbiguous
      ? 'Pinterest response was ambiguous; check your Pinterest account before any retry'
      : `${normalized.code}: ${normalized.message}`, job.completedToday, undefined, undefined, normalized.message)
    await notifySafetyStop(normalized.message)
    return
  }

  if (['preflight', 'research_due_check', 'discover_products', 'select_candidate'].includes(job.state) || !job.activeProductId) {
    job.state = 'stopped'
    job.updatedAt = Date.now()
    await repository.saveJob(job)
    await updateStatus('stopped', `${normalized.code}: ${normalized.message}`, job.completedToday, undefined, undefined, normalized.message)
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
    dailyLimit: (await loadSettings()).dailyLimit,
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

async function activateApprovedDraft(job: JobSnapshot, productId: string): Promise<void> {
  const draft = await repository.getDraft(productId)
  if (!draft) throw new AutomationError('draft_missing', 'The approved Pin draft could not be recovered')
  job.activeProductId = productId
  await setRuntimePayload({
    activeProduct: draft.product,
    generatedContent: draft.content,
    posterDataUrl: draft.posterDataUrl,
    provider: draft.provider,
    model: draft.model,
  })
  await repository.saveJob(job)
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
    if (error instanceof Error && /Receiving end does not exist/i.test(error.message)) {
      try {
        await chrome.tabs.reload(tabId)
        await waitForTabComplete(tabId)
        response = await chrome.tabs.sendMessage(tabId, message) as MessageResponse<T>
      } catch (retryError) {
        throw new AutomationError('content_script_unavailable', retryError instanceof Error ? retryError.message : 'Content script is unavailable after tab reload')
      }
    } else {
      throw new AutomationError('content_script_unavailable', error instanceof Error ? error.message : 'Content script is unavailable')
    }
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
    title: 'PinShop dijeda',
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

class AutomationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'AutomationError'
  }
}
