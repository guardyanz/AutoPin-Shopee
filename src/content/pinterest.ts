import {
  detectPinterestPageState,
  fillPinterestForm,
  findPinterestPublishButton,
  isPinterestPublishConfirmed,
} from '../adapters/pinterest-dom'
import type { ExtensionMessage, MessageResponse } from '../core/messages'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message.type.startsWith('PINTEREST_')) return

  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: normalizeError(error),
    } satisfies MessageResponse))
  return true
})

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'PINTEREST_PREFLIGHT': {
      const state = detectPinterestPageState(document)
      if (state !== 'ready') throw codedError(state, `Pinterest page is not ready: ${state}`)
      return { state, url: location.href }
    }
    case 'PINTEREST_COLLECT_RESEARCH':
      return { signals: collectResearchSignals() }
    case 'PINTEREST_ENSURE_BOARD':
      return ensureBoard(message.boardName, message.boardDescription)
    case 'PINTEREST_FILL':
      await uploadPoster(message.posterDataUrl)
      await openBoardPicker()
      await waitFor(() => findExactText(message.fields.boardName), 8_000, 'board_option_missing')
      return fillPinterestForm(document, message.fields)
    case 'PINTEREST_PUBLISH': {
      const button = findPinterestPublishButton(document)
      if (!button) throw codedError('publish_button_missing', 'Pinterest Publish button was not found')
      if (button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('disabled')) {
        throw codedError('publish_button_disabled', 'Pinterest Publish button is disabled')
      }
      button.click()
      await waitFor(() => isPinterestPublishConfirmed(document), 15_000, 'publish_unconfirmed')
      return { confirmed: true, pinUrl: findPublishedPinUrl() }
    }
    case 'PINTEREST_VERIFY':
      return { confirmed: isPinterestPublishConfirmed(document), pinUrl: findPublishedPinUrl() }
    default:
      throw codedError('unsupported_message', `Unsupported Pinterest message: ${message.type}`)
  }
}

function collectResearchSignals(): string[] {
  const signals = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="option"], [data-test-id*="search" i], a[href*="/search/"], h1, h2',
  ))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((text) => text.length >= 3 && text.length <= 100)
  return [...new Set(signals)].slice(0, 80)
}

async function ensureBoard(boardName: string, boardDescription: string): Promise<{ boardName: string; created: boolean }> {
  await openBoardPicker()
  const existingOrCreate = await waitFor(
    () => findExactText(boardName) ?? findByText(/^(?:create board|buat papan|buat board)$/i),
    8_000,
    'board_picker_not_ready',
  )
  if (existingOrCreate.textContent?.trim().toLocaleLowerCase() === boardName.trim().toLocaleLowerCase()) {
    existingOrCreate.click()
    return { boardName, created: false }
  }

  existingOrCreate.click()
  const nameInput = await waitForElement('input[aria-label*="name" i], input[placeholder*="name" i], input[aria-label*="nama" i]')
  setInput(nameInput as HTMLInputElement, boardName)
  const descriptionInput = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'textarea[aria-label*="description" i], textarea[aria-label*="deskripsi" i]',
  )
  if (descriptionInput) setInput(descriptionInput, boardDescription)
  const confirm = findByText(/^(?:create|buat)$/i)
  if (!confirm) throw codedError('create_board_confirm_missing', 'Pinterest board confirmation action was not found')
  confirm.click()
  return { boardName, created: true }
}

async function openBoardPicker(): Promise<void> {
  const trigger = await waitFor(() => findBoardTrigger(), 8_000, 'board_trigger_missing')
  trigger.click()
}

async function uploadPoster(dataUrl: string): Promise<void> {
  const input = await waitForElement('input[type="file"][accept*="image"], input[type="file"]') as HTMLInputElement
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const file = new File([blob], `affiliate-pin-${Date.now()}.jpg`, { type: 'image/jpeg' })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findBoardTrigger(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], [aria-label]'))
    .find((element) => /(?:select|choose|pilih).*(?:board|papan)|(?:board|papan).*(?:select|pilih)/i.test(
      `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`,
    )) ?? null
}

function findByText(pattern: RegExp): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], [role="menuitem"]'))
    .find((element) => pattern.test(element.textContent?.trim() ?? '')) ?? null
}

function findExactText(text: string): HTMLElement | null {
  const normalized = text.trim().toLocaleLowerCase()
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], a, button'))
    .find((element) => element.textContent?.trim().toLocaleLowerCase() === normalized) ?? null
}

function findPublishedPinUrl(): string {
  if (/^\/pin\/\d+\/?/.test(location.pathname)) return location.href
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/pin/"]'))
    .map((anchor) => anchor.href)
    .find(Boolean) ?? ''
}

function waitForElement(selector: string): Promise<Element> {
  return waitFor(() => document.querySelector(selector), 10_000, 'element_timeout')
}

async function waitFor<T>(read: () => T | null | false, timeout: number, code: string): Promise<T> {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw codedError(code, `Timed out waiting for Pinterest UI (${code})`)
}

function setInput(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return { code: 'code' in error ? String(error.code) : 'pinterest_error', message: error.message }
  }
  return { code: 'pinterest_error', message: 'Unknown Pinterest adapter error' }
}
