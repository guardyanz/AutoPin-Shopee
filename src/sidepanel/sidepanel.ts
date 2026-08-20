import {
  createIcons,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Logs,
  Pause,
  Play,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Square,
  Workflow,
} from 'lucide'

import type { ExtensionMessage, MessageResponse } from '../core/messages'
import type { ActivityEntry, RuntimeStatus } from '../core/runtime'
import type { AutomationSettings } from '../core/settings'
import type { ProviderId, ProviderModel } from '../core/types'
import type { PublicationRecord } from '../storage/types'

interface DashboardData {
  status: RuntimeStatus
  activity: ActivityEntry[]
  publications: PublicationRecord[]
}

const iconSet = { Download, Eye, EyeOff, Gauge, Logs, Pause, Play, PlugZap, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, Square, Workflow }
let settings: AutomationSettings | null = null
let dashboard: DashboardData | null = null
let toastTimer: number | undefined

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
  element<HTMLButtonElement>('stop-button').addEventListener('click', () => void runCommand({ type: 'STOP_AUTOMATION' }, 'Automation stopped'))
}

function bindSettings(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach((button) => {
    button.addEventListener('click', () => selectProvider(button.dataset.provider as ProviderId))
  })
  element<HTMLButtonElement>('toggle-key').addEventListener('click', toggleApiKey)
  element<HTMLButtonElement>('fetch-models').addEventListener('click', () => void fetchModels())
  element<HTMLButtonElement>('test-provider').addEventListener('click', () => void testProvider())
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
  else if (['paused', 'await_publish_slot'].includes(status.state)) dot.classList.add('is-warning')
  else if (!['idle', 'stopped', 'daily_limit_reached'].includes(status.state)) dot.classList.add('is-active')

  renderPipeline(status.state)
  renderPublications(data.publications)
  renderActivity(data.activity)
  updateControlStates(status.state)
}

function renderPipeline(state: string): void {
  const source = ['preflight', 'research_due_check', 'discover_products', 'select_candidate', 'extract_product', 'generate_affiliate_link']
  const creative = ['generate_copy', 'render_poster', 'await_publish_slot']
  const publish = ['fill_pinterest', 'publish_pinterest', 'verify_publication', 'commit_result', 'cleanup']
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
    const link = document.createElement('a')
    link.href = publication.pinUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    const title = document.createElement('strong')
    title.textContent = publication.boardName
    const meta = document.createElement('span')
    meta.textContent = `${publication.provider} · ${formatTime(publication.publishedAt)}`
    link.append(title, meta)
    item.append(link)
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
  element<HTMLButtonElement>('start-button').disabled = running
  element<HTMLButtonElement>('pause-button').disabled = !running
  element<HTMLButtonElement>('resume-button').disabled = !['paused', 'authentication_required', 'captcha_detected', 'circuit_open'].includes(state)
  element<HTMLButtonElement>('stop-button').disabled = state === 'idle' || state === 'stopped'
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
  element<HTMLInputElement>('board-name').value = settings.boardName
  element<HTMLInputElement>('discovery-pages').value = String(settings.discoveryMaxPages)
  element<HTMLInputElement>('dry-run').checked = settings.developerDryRun
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
  settings.discoveryMaxPages = Number.parseInt(element<HTMLInputElement>('discovery-pages').value, 10) || 3
  settings.developerDryRun = element<HTMLInputElement>('dry-run').checked
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

async function persistSettings(): Promise<void> {
  if (!settings) return
  captureCurrentProviderFields()
  try {
    settings = await sendMessage<AutomationSettings>({ type: 'SAVE_SETTINGS', settings })
    element('save-state').textContent = 'Saved'
    showToast('Settings saved')
    window.setTimeout(() => { element('save-state').textContent = '' }, 2_000)
  } catch (error) {
    showToast(messageFromError(error), true)
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
