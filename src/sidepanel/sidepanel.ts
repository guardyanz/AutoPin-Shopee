import {
  createIcons,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Logs,
  Link2,
  Pause,
  Play,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  Unlink,
  Workflow,
} from 'lucide'

import type { ExtensionMessage, MessageResponse } from '../core/messages'
import type { ActivityEntry, RuntimeStatus } from '../core/runtime'
import type { AutomationSettings } from '../core/settings'
import type { ProviderId, ProviderModel } from '../core/types'
import type { PinterestBoard } from '../providers/pinterest-api'
import type { PinDraft, PublicationRecord } from '../storage/types'

interface DashboardData {
  status: RuntimeStatus
  activity: ActivityEntry[]
  publications: PublicationRecord[]
  reviews: PinReviewData[]
}

interface PinReviewData {
  productId: string
  productTitle: string
  title: string
  destinationUrl: string
  boardId: string
  boardLabel: string
}

const iconSet = { Download, Eye, EyeOff, Gauge, Link2, Logs, Pause, Play, PlugZap, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, Square, Unlink, Workflow }
let settings: AutomationSettings | null = null
let dashboard: DashboardData | null = null
let toastTimer: number | undefined
let activeReviewId = ''
const selectedProductIds = new Set<string>()
const batchDrafts = new Map<string, PinDraft>()
const loadingDraftIds = new Set<string>()
const failedDraftIds = new Set<string>()
let renderedBatchKey = ''
let pinterestBoards: PinterestBoard[] = []

document.addEventListener('DOMContentLoaded', () => {
  createIcons({ icons: iconSet })
  bindNavigation()
  bindControls()
  bindSettings()
  void loadAll()
  window.setInterval(() => void refreshDashboard(false), 2_500)
})

async function loadAll(): Promise<void> {
  await Promise.all([refreshDashboard(false), loadSettings()])
}

function bindNavigation(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-tab], [data-open-tab]').forEach((button) => {
    button.addEventListener('click', () => openTab(button.dataset.tab || button.dataset.openTab || 'dashboard'))
  })
}

function openTab(tab: string): void {
  document.querySelectorAll('[data-tab]').forEach((element) => element.classList.toggle('is-active', (element as HTMLElement).dataset.tab === tab))
  document.querySelectorAll('.view').forEach((element) => element.classList.toggle('is-active', element.id === `view-${tab}`))
}

function bindControls(): void {
  element<HTMLButtonElement>('refresh-dashboard').addEventListener('click', () => void refreshDashboard(true))
  element<HTMLButtonElement>('start-button').addEventListener('click', () => void runCommand({ type: 'START_AUTOMATION' }, 'Automation started'))
  element<HTMLButtonElement>('pause-button').addEventListener('click', () => void runCommand({ type: 'PAUSE_AUTOMATION' }, 'Automation paused'))
  element<HTMLButtonElement>('resume-button').addEventListener('click', () => void runCommand({ type: 'RESUME_AUTOMATION' }, 'Automation resumed'))
  element<HTMLButtonElement>('approve-button').addEventListener('click', () => void approvePinBatch())
  element<HTMLButtonElement>('publish-now-button').addEventListener('click', () => void publishRemainingNow())
  element<HTMLButtonElement>('save-review').addEventListener('click', () => void savePinReview(true))
  element<HTMLButtonElement>('stop-button').addEventListener('click', () => void stopAutomationWithConfirmation())
}

function bindSettings(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach((button) => {
    button.addEventListener('click', () => selectProvider(button.dataset.provider as ProviderId))
  })
  element<HTMLButtonElement>('toggle-key').addEventListener('click', toggleApiKey)
  element<HTMLButtonElement>('fetch-models').addEventListener('click', () => void fetchModels())
  element<HTMLButtonElement>('test-provider').addEventListener('click', () => void testProvider())
  element<HTMLButtonElement>('connect-pinterest').addEventListener('click', () => void connectPinterest())
  element<HTMLButtonElement>('disconnect-pinterest').addEventListener('click', () => void disconnectPinterest())
  element<HTMLButtonElement>('load-boards').addEventListener('click', () => void loadPinterestBoards(true))
  element<HTMLButtonElement>('create-board').addEventListener('click', () => void createPinterestBoard())
  element<HTMLSelectElement>('pinterest-board-id').addEventListener('change', selectPinterestBoard)
  element<HTMLSelectElement>('pinterest-environment').addEventListener('change', () => {
    pinterestBoards = []
    renderBoardOptions()
    element('board-list-state').textContent = 'Environment changed. Muat ulang daftar Board dengan token yang sesuai.'
  })
  element<HTMLFormElement>('settings-form').addEventListener('submit', (event) => {
    event.preventDefault()
    void persistSettings()
  })
}

async function refreshDashboard(showConfirmation: boolean): Promise<void> {
  try {
    if (showConfirmation) failedDraftIds.clear()
    dashboard = await sendMessage<DashboardData>({ type: 'GET_DASHBOARD' })
    renderDashboard(dashboard)
    if (showConfirmation) showToast('Status refreshed')
  } catch (error) {
    showToast(messageFromError(error), true)
  }
}

function renderDashboard(data: DashboardData): void {
  const { status } = data
  element('status-state').textContent = readableState(status.state)
  element('dashboard-title').textContent = status.message
  element('quota-count').textContent = String(status.completedToday)
  element<HTMLElement>('quota-progress').style.width = `${Math.min(100, status.completedToday / status.dailyLimit * 100)}%`
  element('current-product').textContent = status.activeProductTitle || 'No product selected'
  element('next-action').textContent = status.nextRunAt ? formatFuture(status.nextRunAt) : 'Not scheduled'
  element('updated-at').textContent = `Updated ${formatTime(status.updatedAt)}`

  const dot = element('status-dot')
  dot.className = 'status-dot'
  if (['captcha_detected', 'circuit_open', 'authentication_required'].includes(status.state)) dot.classList.add('is-error')
  else if (['paused', 'await_publish_slot', 'awaiting_approval'].includes(status.state)) dot.classList.add('is-warning')
  else if (!['idle', 'stopped', 'daily_limit_reached'].includes(status.state)) dot.classList.add('is-active')

  renderPipeline(status.state)
  renderBatchReview(data.reviews)
  renderPublications(data.publications)
  renderActivity(data.activity)
  updateControlStates(status.state)
}

function renderBatchReview(reviews: PinReviewData[]): void {
  const panel = element<HTMLElement>('review-panel')
  panel.hidden = reviews.length === 0
  if (reviews.length === 0) {
    activeReviewId = ''
    selectedProductIds.clear()
    batchDrafts.clear()
    loadingDraftIds.clear()
    failedDraftIds.clear()
    renderedBatchKey = ''
    element<HTMLElement>('draft-preview').hidden = true
    return
  }
  const available = new Set(reviews.map((review) => review.productId))
  for (const id of selectedProductIds) if (!available.has(id)) selectedProductIds.delete(id)
  for (const id of batchDrafts.keys()) if (!available.has(id)) batchDrafts.delete(id)
  for (const review of reviews) {
    if (!batchDrafts.has(review.productId) && !loadingDraftIds.has(review.productId) && !failedDraftIds.has(review.productId)) {
      void loadBatchDraft(review.productId)
    }
  }
  const nextKey = reviews.map((review) => `${review.productId}:${batchDrafts.get(review.productId)?.content.pinTitle ?? ''}:${failedDraftIds.has(review.productId)}`).join('|')
  const list = element<HTMLUListElement>('batch-list')
  if (nextKey !== renderedBatchKey) {
    list.replaceChildren(...reviews.map(renderBatchCard))
    renderedBatchKey = nextKey
  }
  if (activeReviewId && !available.has(activeReviewId)) {
    activeReviewId = ''
    element<HTMLElement>('draft-preview').hidden = true
  }
  updateApprovalButton()
}

function renderBatchCard(review: PinReviewData): HTMLLIElement {
  const item = document.createElement('li')
  const draft = batchDrafts.get(review.productId)
  const thumb = draft ? document.createElement('img') : document.createElement('div')
  if (thumb instanceof HTMLImageElement) {
    thumb.className = 'batch-thumb'
    thumb.src = draft!.posterDataUrl
    thumb.alt = `Poster Pin ${review.productTitle}`
  } else {
    thumb.className = 'batch-thumb-placeholder'
    thumb.textContent = failedDraftIds.has(review.productId) ? 'Gagal memuat' : 'Memuat gambar'
  }

  const copy = document.createElement('div')
  copy.className = 'batch-card-copy'
  const title = document.createElement('strong')
  title.textContent = draft?.content.pinTitle ?? review.title
  const description = document.createElement('p')
  description.textContent = draft?.content.pinDescription ?? 'Memuat ringkasan Pin…'
  const board = document.createElement('small')
  board.textContent = `Board: ${review.boardLabel || review.boardId}`
  const destination = document.createElement('a')
  destination.href = review.destinationUrl
  destination.textContent = review.destinationUrl
  destination.title = review.destinationUrl
  destination.target = '_blank'
  destination.rel = 'noreferrer'
  const detail = document.createElement('button')
  detail.type = 'button'
  detail.className = 'batch-detail'
  detail.textContent = 'Detail / Edit'
  detail.setAttribute('aria-label', `Detail atau edit ${review.productTitle}`)
  detail.addEventListener('click', () => void openDraftPreview(review.productId))
  copy.append(title, description, board, destination, detail)

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.disabled = !draft
  checkbox.checked = selectedProductIds.has(review.productId)
  checkbox.setAttribute('aria-label', `Pilih Pin ${review.productTitle} untuk diterbitkan`)
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedProductIds.add(review.productId)
    else selectedProductIds.delete(review.productId)
    updateApprovalButton()
  })
  item.append(thumb, copy, checkbox)
  return item
}

async function loadBatchDraft(productId: string): Promise<void> {
  loadingDraftIds.add(productId)
  try {
    const draft = await sendMessage<PinDraft>({ type: 'GET_DRAFT_PREVIEW', productId })
    if (dashboard?.reviews.some((review) => review.productId === productId)) batchDrafts.set(productId, draft)
    failedDraftIds.delete(productId)
    if (failedDraftIds.size === 0) element<HTMLElement>('review-feedback').hidden = true
  } catch (error) {
    failedDraftIds.add(productId)
    const feedback = element<HTMLElement>('review-feedback')
    feedback.hidden = false
    feedback.className = 'review-feedback is-error'
    feedback.textContent = `Gagal memuat draft: ${messageFromError(error)}. Klik Refresh status atau Detail / Edit untuk mencoba lagi.`
  } finally {
    loadingDraftIds.delete(productId)
    if (dashboard) renderBatchReview(dashboard.reviews)
  }
}

async function openDraftPreview(productId: string): Promise<void> {
  const feedback = element<HTMLElement>('review-feedback')
  feedback.hidden = false
  feedback.className = 'review-feedback'
  feedback.textContent = 'Memuat preview Pin…'
  try {
    const draft = await sendMessage<PinDraft>({ type: 'GET_DRAFT_PREVIEW', productId })
    batchDrafts.set(productId, draft)
    failedDraftIds.delete(productId)
    renderedBatchKey = ''
    activeReviewId = productId
    element<HTMLElement>('draft-preview').hidden = false
    element<HTMLImageElement>('review-poster').src = draft.posterDataUrl
    element('review-product').textContent = draft.product.title
    element<HTMLInputElement>('review-pin-title').value = draft.content.pinTitle
    element<HTMLTextAreaElement>('review-description').value = draft.content.pinDescription
    element<HTMLTextAreaElement>('review-alt-text').value = draft.content.altText
    const destination = element<HTMLAnchorElement>('review-destination')
    destination.href = draft.product.affiliateUrl ?? ''
    destination.textContent = draft.product.affiliateUrl ?? ''
    element('review-board').textContent = draft.boardLabel ? `${draft.boardLabel} · ${draft.boardId}` : draft.boardId
    await refreshDashboard(false)
    feedback.hidden = true
    element('draft-preview').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    const message = messageFromError(error)
    feedback.className = 'review-feedback is-error'
    feedback.textContent = `Preview gagal dibuka: ${message}. Draft tetap tersimpan; coba Refresh status.`
    showToast(message, true)
  }
}

function renderPipeline(state: string): void {
  const source = ['preflight', 'research_due_check', 'discover_products', 'select_candidate', 'extract_product', 'generate_affiliate_link']
  const creative = ['generate_copy', 'render_poster']
  const publish = ['awaiting_approval', 'await_publish_slot', 'fill_pinterest', 'publish_pinterest', 'verify_publication', 'commit_result', 'cleanup']
  const group = source.includes(state) ? 'source' : creative.includes(state) ? 'creative' : publish.includes(state) ? 'publish' : ''
  const order = ['source', 'creative', 'publish']
  document.querySelectorAll<HTMLElement>('[data-stage-group]').forEach((item) => {
    const itemGroup = item.dataset.stageGroup ?? ''
    item.classList.toggle('is-current', itemGroup === group)
    item.classList.toggle('is-complete', group !== '' && order.indexOf(itemGroup) < order.indexOf(group))
  })
}

function renderPublications(publications: PublicationRecord[]): void {
  const list = element<HTMLUListElement>('publication-list')
  list.replaceChildren(...publications.slice(0, 5).map((publication) => {
    const item = document.createElement('li')
    const content = document.createElement(/^\d+$/.test(publication.id) ? 'a' : 'div')
    if (content instanceof HTMLAnchorElement) {
      content.href = `https://www.pinterest.com/pin/${publication.id}/`
      content.target = '_blank'
      content.rel = 'noreferrer'
      content.setAttribute('aria-label', `Buka Pin ${publication.productTitle} di Pinterest`)
    }
    const title = document.createElement('strong')
    title.textContent = publication.productTitle || 'Published Shopee product'
    const meta = document.createElement('span')
    meta.textContent = `Verified publication · ${formatTime(publication.publishedAt)}`
    content.append(title, meta)
    item.append(content)
    return item
  }))
  element('recent-empty').hidden = publications.length > 0
}

function renderActivity(activity: ActivityEntry[]): void {
  const list = element<HTMLUListElement>('activity-list')
  list.replaceChildren(...activity.map((entry) => {
    const item = document.createElement('li')
    const indicator = document.createElement('span')
    indicator.className = `activity-indicator ${entry.level}`
    const content = document.createElement('div')
    content.className = 'activity-content'
    const message = document.createElement('p')
    message.textContent = entry.message
    const time = document.createElement('time')
    time.dateTime = new Date(entry.timestamp).toISOString()
    time.textContent = `${readableState(entry.stage)} · ${formatTime(entry.timestamp)}`
    content.append(message, time)
    item.append(indicator, content)
    return item
  }))
  element('activity-count').textContent = String(activity.length)
  element('activity-empty').hidden = activity.length > 0
}

function updateControlStates(state: string): void {
  const running = !['idle', 'stopped', 'paused', 'daily_limit_reached', 'authentication_required', 'captcha_detected', 'circuit_open'].includes(state)
  element<HTMLButtonElement>('start-button').disabled = !['idle', 'stopped'].includes(state)
  element<HTMLButtonElement>('pause-button').disabled = !running
  element<HTMLButtonElement>('resume-button').disabled = !['paused', 'authentication_required', 'captcha_detected', 'circuit_open'].includes(state)
  const approveButton = element<HTMLButtonElement>('approve-button')
  approveButton.hidden = state !== 'awaiting_approval'
  approveButton.disabled = state !== 'awaiting_approval' || selectedProductIds.size === 0
  const oldScheduledWait = state === 'await_publish_slot' && (dashboard?.status.nextRunAt ?? 0) > Date.now() + 60_000
  element<HTMLButtonElement>('publish-now-button').hidden = !oldScheduledWait
  element<HTMLButtonElement>('stop-button').disabled = state === 'idle' || state === 'stopped'
}

function updateApprovalButton(): void {
  const button = element<HTMLButtonElement>('approve-button')
  button.disabled = selectedProductIds.size === 0
  button.querySelector('span')!.textContent = `Approve ${selectedProductIds.size} selected Pins`
  if (dashboard) element('batch-summary').textContent = `${dashboard.reviews.length} draft siap · ${selectedProductIds.size} dipilih. Lihat gambar dan ringkasan, lalu centang Pin yang Anda pilih.`
}

async function publishRemainingNow(): Promise<void> {
  if (!window.confirm('Terbitkan semua Pin yang sudah Anda setujui tetapi masih menunggu jadwal lama? Pin diproses mulai sekarang, berurutan sekitar 10 detik sekali.')) return
  await runCommand({ type: 'PUBLISH_REMAINING_NOW' }, 'Remaining approved Pins are publishing now')
}

async function stopAutomationWithConfirmation(): Promise<void> {
  if (dashboard && ['awaiting_approval', 'paused'].includes(dashboard.status.state)
    && !window.confirm('Stop akan membuang draft yang belum diterbitkan. Pilih Pause untuk menyimpan dan melanjutkan review nanti. Tetap Stop?')) return
  await runCommand({ type: 'STOP_AUTOMATION' }, 'Automation stopped')
}

async function approvePinBatch(): Promise<void> {
  if (selectedProductIds.size === 0 || !dashboard) return
  if (activeReviewId && selectedProductIds.has(activeReviewId) && !await savePinReview(false)) return
  const selected = dashboard.reviews.filter((review) => selectedProductIds.has(review.productId))
  const titles = selected.map((review) => `• ${review.productTitle}`).join('\n')
  if (!window.confirm(`Terbitkan ${selected.length} Pin berikut sekarang? Pin diproses berurutan dengan jeda sekitar 10 detik.\n\n${titles}\n\nHanya Pin yang dipilih ini yang akan dikirim ke Pinterest.`)) return
  await runCommand({ type: 'APPROVE_PIN_BATCH', productIds: selected.map((review) => review.productId) }, `${selected.length} Pins approved for immediate publication`)
}

async function savePinReview(showConfirmation: boolean): Promise<boolean> {
  if (!activeReviewId) return false
  try {
    await sendMessage({
      type: 'UPDATE_PIN_DRAFT',
      productId: activeReviewId,
      title: element<HTMLInputElement>('review-pin-title').value,
      description: element<HTMLTextAreaElement>('review-description').value,
      altText: element<HTMLTextAreaElement>('review-alt-text').value,
    })
    batchDrafts.set(activeReviewId, await sendMessage<PinDraft>({ type: 'GET_DRAFT_PREVIEW', productId: activeReviewId }))
    renderedBatchKey = ''
    if (dashboard) renderBatchReview(dashboard.reviews)
    if (showConfirmation) showToast('Reviewed draft saved')
    return true
  } catch (error) {
    showToast(messageFromError(error), true)
    return false
  }
}

async function loadSettings(): Promise<void> {
  try {
    settings = await sendMessage<AutomationSettings>({ type: 'GET_SETTINGS' })
    renderSettings()
  } catch (error) {
    showToast(messageFromError(error), true)
  }
}

function renderSettings(): void {
  if (!settings) return
  const provider = settings.activeProvider
  document.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.provider === provider)
  })
  const config = settings.providerConfigs[provider]
  element<HTMLInputElement>('api-key').value = config.apiKey
  element<HTMLSelectElement>('pinterest-environment').value = settings.pinterestEnvironment
  element<HTMLInputElement>('oauth-worker-url').value = settings.pinterestOAuthWorkerUrl
  element<HTMLInputElement>('pinterest-token').value = settings.pinterestAccessToken
  renderBoardOptions()
  element<HTMLInputElement>('board-name').value = settings.boardName
  element<HTMLTextAreaElement>('board-description').value = settings.boardDescription
  element<HTMLInputElement>('discovery-pages').value = String(settings.discoveryMaxPages)
  element<HTMLInputElement>('affiliate-tags').value = settings.affiliateTags.join(', ')
  element<HTMLInputElement>('dry-run').checked = settings.developerDryRun
  element('pinterest-connection-state').textContent = settings.pinterestAccessToken ? 'Connected / token available' : 'Not connected'
  element<HTMLButtonElement>('disconnect-pinterest').disabled = !settings.pinterestAccessToken
  renderModelOptions(settings.modelCatalogs[provider], config.primaryModel, config.fallbackModel)
}

function selectProvider(provider: ProviderId): void {
  captureCurrentProviderFields()
  if (!settings) return
  settings.activeProvider = provider
  renderSettings()
}

function captureCurrentProviderFields(): void {
  if (!settings) return
  const config = settings.providerConfigs[settings.activeProvider]
  config.apiKey = element<HTMLInputElement>('api-key').value.trim()
  config.primaryModel = element<HTMLSelectElement>('primary-model').value
  config.fallbackModel = element<HTMLSelectElement>('fallback-model').value
  settings.pinterestEnvironment = element<HTMLSelectElement>('pinterest-environment').value === 'production' ? 'production' : 'sandbox'
  settings.pinterestOAuthWorkerUrl = element<HTMLInputElement>('oauth-worker-url').value.trim().replace(/\/$/, '')
  settings.pinterestAccessToken = element<HTMLInputElement>('pinterest-token').value.trim()
  settings.pinterestBoardId = element<HTMLSelectElement>('pinterest-board-id').value.trim()
  settings.boardName = element<HTMLInputElement>('board-name').value.trim()
  settings.boardDescription = element<HTMLTextAreaElement>('board-description').value.trim()
  settings.discoveryMaxPages = Number.parseInt(element<HTMLInputElement>('discovery-pages').value, 10) || 3
  settings.affiliateTags = element<HTMLInputElement>('affiliate-tags').value
    .split(',').map((tag) => tag.trim()).filter(Boolean)
  settings.developerDryRun = element<HTMLInputElement>('dry-run').checked
}

function renderBoardOptions(): void {
  const select = element<HTMLSelectElement>('pinterest-board-id')
  const selectedId = settings?.pinterestBoardId ?? ''
  const options = pinterestBoards.map((board) => option(board.id, `${board.name} · ${board.id}`))
  if (selectedId && !pinterestBoards.some((board) => board.id === selectedId)) {
    options.unshift(option(selectedId, `${settings?.boardName || 'Board tersimpan'} · ${selectedId}`))
  }
  select.replaceChildren(option('', 'Pilih Board'), ...options)
  select.value = selectedId
}

function selectPinterestBoard(): void {
  if (!settings) return
  const boardId = element<HTMLSelectElement>('pinterest-board-id').value
  const board = pinterestBoards.find((candidate) => candidate.id === boardId)
  settings.pinterestBoardId = boardId
  if (board) {
    settings.boardName = board.name
    settings.boardDescription = board.description ?? ''
    element<HTMLInputElement>('board-name').value = board.name
    element<HTMLTextAreaElement>('board-description').value = board.description ?? ''
    element('board-list-state').textContent = `Board terpilih: ${board.name}`
  }
}

function renderModelOptions(models: ProviderModel[], primary: string, fallback: string): void {
  const primarySelect = element<HTMLSelectElement>('primary-model')
  const fallbackSelect = element<HTMLSelectElement>('fallback-model')
  primarySelect.replaceChildren(option('', 'Select a model'), ...models.map((model) => option(model.id, model.label)))
  fallbackSelect.replaceChildren(option('', 'No fallback'), ...models.map((model) => option(model.id, model.label)))
  if (primary && !models.some((model) => model.id === primary)) primarySelect.append(option(primary, primary))
  if (fallback && !models.some((model) => model.id === fallback)) fallbackSelect.append(option(fallback, fallback))
  primarySelect.value = primary
  fallbackSelect.value = fallback
}

async function persistSettings(showConfirmation = true): Promise<boolean> {
  if (!settings) return false
  captureCurrentProviderFields()
  try {
    settings = await sendMessage<AutomationSettings>({ type: 'SAVE_SETTINGS', settings })
    element('save-state').textContent = 'Saved'
    if (showConfirmation) showToast('Settings saved')
    window.setTimeout(() => { element('save-state').textContent = '' }, 2_000)
    return true
  } catch (error) {
    showToast(messageFromError(error), true)
    return false
  }
}

async function fetchModels(): Promise<void> {
  if (!settings) return
  captureCurrentProviderFields()
  await persistSettings()
  setBusy('fetch-models', true)
  try {
    await sendMessage({ type: 'FETCH_MODELS', provider: settings.activeProvider })
    await loadSettings()
    showToast('Model catalog updated')
  } catch (error) {
    showToast(messageFromError(error), true)
  } finally {
    setBusy('fetch-models', false)
  }
}

async function testProvider(): Promise<void> {
  if (!settings) return
  captureCurrentProviderFields()
  await persistSettings()
  setBusy('test-provider', true)
  try {
    const result = await sendMessage<{ connected: true; modelCount: number }>({ type: 'TEST_PROVIDER', provider: settings.activeProvider })
    showToast(`Connected · ${result.modelCount} models`)
    await loadSettings()
  } catch (error) {
    showToast(messageFromError(error), true)
  } finally {
    setBusy('test-provider', false)
  }
}

async function connectPinterest(): Promise<void> {
  if (!settings) return
  captureCurrentProviderFields()
  await persistSettings()
  setBusy('connect-pinterest', true)
  try {
    await sendMessage({ type: 'CONNECT_PINTEREST' })
    await loadSettings()
    await loadPinterestBoards(false)
    showToast('Pinterest OAuth connected')
  } catch (error) {
    showToast(messageFromError(error), true)
  } finally {
    setBusy('connect-pinterest', false)
  }
}

async function disconnectPinterest(): Promise<void> {
  if (!window.confirm('Disconnect Pinterest and remove locally stored OAuth tokens?')) return
  setBusy('disconnect-pinterest', true)
  try {
    await sendMessage({ type: 'DISCONNECT_PINTEREST' })
    pinterestBoards = []
    await loadSettings()
    showToast('Pinterest disconnected')
  } catch (error) {
    showToast(messageFromError(error), true)
  } finally {
    setBusy('disconnect-pinterest', false)
  }
}

async function loadPinterestBoards(showConfirmation: boolean): Promise<void> {
  if (!settings) return
  captureCurrentProviderFields()
  if (!await persistSettings(false)) return
  setBusy('load-boards', true)
  element('board-list-state').textContent = 'Memuat Board dari Pinterest...'
  try {
    const result = await sendMessage<{ boards: PinterestBoard[]; environment: 'sandbox' | 'production' }>({ type: 'LIST_PINTEREST_BOARDS' })
    pinterestBoards = result.boards
    renderBoardOptions()
    element('board-list-state').textContent = result.boards.length > 0
      ? `${result.boards.length} Board ditemukan di ${result.environment}.`
      : `Tidak ada Board yang ditemukan di ${result.environment}. Buat Board baru di bawah ini atau periksa environment token.`
    if (showConfirmation) showToast(result.boards.length > 0 ? `${result.boards.length} Board dimuat` : 'Tidak ada Board pada environment ini')
  } catch (error) {
    element('board-list-state').textContent = messageFromError(error)
    showToast(messageFromError(error), true)
  } finally {
    setBusy('load-boards', false)
  }
}

async function createPinterestBoard(): Promise<void> {
  if (!settings) return
  captureCurrentProviderFields()
  if (!await persistSettings(false)) return
  if (!window.confirm('Create this Board on the connected Pinterest account?')) return
  setBusy('create-board', true)
  try {
    const result = await sendMessage<{ id: string; name: string }>({
      type: 'CREATE_PINTEREST_BOARD',
      name: element<HTMLInputElement>('board-name').value,
      description: element<HTMLTextAreaElement>('board-description').value,
    })
    await loadSettings()
    await loadPinterestBoards(false)
    element('board-list-state').textContent = `Board berhasil dibuat dan dipilih: ${result.name}`
    showToast(`Board created · ${result.id}`)
  } catch (error) {
    element('board-list-state').textContent = messageFromError(error)
    showToast(messageFromError(error), true)
  } finally {
    setBusy('create-board', false)
  }
}

async function runCommand(message: ExtensionMessage, successMessage: string): Promise<void> {
  try {
    await sendMessage(message)
    showToast(successMessage)
    await refreshDashboard(false)
  } catch (error) {
    showToast(messageFromError(error), true)
  }
}

function toggleApiKey(): void {
  const input = element<HTMLInputElement>('api-key')
  const button = element<HTMLButtonElement>('toggle-key')
  input.type = input.type === 'password' ? 'text' : 'password'
  button.innerHTML = `<i data-lucide="${input.type === 'password' ? 'eye' : 'eye-off'}"></i>`
  button.title = input.type === 'password' ? 'Show API key' : 'Hide API key'
  createIcons({ icons: iconSet, root: button })
}

async function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as MessageResponse<T>
  if (!response?.ok) throw new Error(response?.error.message ?? 'Extension request failed')
  return response.data
}

function setBusy(id: string, busy: boolean): void {
  const button = element<HTMLButtonElement>(id)
  button.disabled = busy
  button.setAttribute('aria-busy', String(busy))
}

function showToast(message: string, isError = false): void {
  const toast = element('toast')
  toast.textContent = message
  toast.className = `toast is-visible${isError ? ' is-error' : ''}`
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.className = 'toast' }, 3_000)
}

function readableState(state: string): string {
  return state.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function formatFuture(timestamp: number): string {
  const difference = Math.max(0, timestamp - Date.now())
  const minutes = Math.ceil(difference / 60_000)
  return `${formatTime(timestamp)} · ${minutes} min`
}

function option(value: string, label: string): HTMLOptionElement {
  const item = document.createElement('option')
  item.value = value
  item.textContent = label
  return item
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element #${id}`)
  return found as T
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected extension error'
}
