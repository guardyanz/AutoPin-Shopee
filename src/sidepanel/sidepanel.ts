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
import type { PublicationRecord } from '../storage/types'

interface DashboardData {
  status: RuntimeStatus
  activity: ActivityEntry[]
  publications: PublicationRecord[]
  review: PinReviewData | null
}

interface PinReviewData {
  productTitle: string
  posterDataUrl: string
  title: string
  description: string
  altText: string
  destinationUrl: string
  boardId: string
  boardLabel: string
}

const iconSet = { Download, Eye, EyeOff, Gauge, Link2, Logs, Pause, Play, PlugZap, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, Square, Unlink, Workflow }
let settings: AutomationSettings | null = null
let dashboard: DashboardData | null = null
let toastTimer: number | undefined
let renderedReviewKey = ''
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
  element<HTMLButtonElement>('approve-button').addEventListener('click', () => void approveCurrentPin())
  element<HTMLButtonElement>('save-review').addEventListener('click', () => void savePinReview(true))
  element<HTMLButtonElement>('stop-button').addEventListener('click', () => void runCommand({ type: 'STOP_AUTOMATION' }, 'Automation stopped'))
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
  renderPinReview(data.review)
  renderPublications(data.publications)
  renderActivity(data.activity)
  updateControlStates(status.state)
}

function renderPinReview(review: PinReviewData | null): void {
  const panel = element<HTMLElement>('review-panel')
  panel.hidden = !review
  if (!review) {
    renderedReviewKey = ''
    return
  }
  const key = `${review.productTitle}:${review.posterDataUrl.slice(-48)}`
  if (key !== renderedReviewKey) {
    element<HTMLImageElement>('review-poster').src = review.posterDataUrl
    element('review-product').textContent = review.productTitle
    element<HTMLInputElement>('review-pin-title').value = review.title
    element<HTMLTextAreaElement>('review-description').value = review.description
    element<HTMLTextAreaElement>('review-alt-text').value = review.altText
    const destination = element<HTMLAnchorElement>('review-destination')
    destination.href = review.destinationUrl
    destination.textContent = review.destinationUrl
    element('review-board').textContent = review.boardLabel
      ? `${review.boardLabel} · ${review.boardId}`
      : review.boardId
    renderedReviewKey = key
  }
}

function renderPipeline(state: string): void {
  const source = ['preflight', 'research_due_check', 'discover_products', 'select_candidate', 'extract_product', 'generate_affiliate_link']
  const creative = ['generate_copy', 'render_poster', 'await_publish_slot']
  const publish = ['fill_pinterest', 'awaiting_approval', 'publish_pinterest', 'verify_publication', 'commit_result', 'cleanup']
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
    const content = document.createElement('div')
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
  const running = !['idle', 'stopped', 'paused', 'awaiting_approval', 'daily_limit_reached', 'authentication_required', 'captcha_detected', 'circuit_open'].includes(state)
  element<HTMLButtonElement>('start-button').disabled = !['idle', 'stopped'].includes(state)
  element<HTMLButtonElement>('pause-button').disabled = !running
  element<HTMLButtonElement>('resume-button').disabled = !['paused', 'authentication_required', 'captcha_detected', 'circuit_open'].includes(state)
  const approveButton = element<HTMLButtonElement>('approve-button')
  approveButton.hidden = state !== 'awaiting_approval'
  approveButton.disabled = state !== 'awaiting_approval'
  element<HTMLButtonElement>('stop-button').disabled = state === 'idle' || state === 'stopped'
}

async function approveCurrentPin(): Promise<void> {
  if (!await savePinReview(false)) return
  if (!window.confirm('Publish this reviewed Pin now? Confirm that the image, copy, affiliate disclosure, destination link, and board are correct.')) return
  await runCommand({ type: 'APPROVE_CURRENT_PIN' }, 'Pin approved for publication')
}

async function savePinReview(showConfirmation: boolean): Promise<boolean> {
  try {
    await sendMessage({
      type: 'UPDATE_PIN_DRAFT',
      title: element<HTMLInputElement>('review-pin-title').value,
      description: element<HTMLTextAreaElement>('review-description').value,
      altText: element<HTMLTextAreaElement>('review-alt-text').value,
    })
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
