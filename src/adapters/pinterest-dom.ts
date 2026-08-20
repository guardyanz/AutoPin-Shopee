export type PinterestPageState = 'ready' | 'authentication_required' | 'captcha_detected'

export interface PinterestPinFields {
  title: string
  description: string
  altText: string
  destinationUrl: string
  boardName: string
}

export interface PinterestFillResult {
  success: boolean
  missingFields: Array<'title' | 'description' | 'altText' | 'destinationUrl' | 'board'>
}

export function detectPinterestPageState(root: ParentNode): PinterestPageState {
  const text = root instanceof Document
    ? root.body?.textContent ?? ''
    : root.textContent ?? ''
  if (/captcha|verify you are human|verifikasi.*manusia/i.test(text)) return 'captcha_detected'
  if (root.querySelector('input[type="password"]') || /\b(?:log in|login|masuk)\b/i.test(text) && root.querySelector('form')) {
    return 'authentication_required'
  }
  return 'ready'
}

export function fillPinterestForm(root: ParentNode, fields: PinterestPinFields): PinterestFillResult {
  const missingFields: PinterestFillResult['missingFields'] = []
  const title = findControl(root, ['add your title', 'tambahkan judul', 'title', 'judul'])
  const description = findControl(root, ['tell everyone what your pin is about', 'ceritakan tentang pin', 'description', 'deskripsi'])
  const altText = findControl(root, ['add alt text', 'tambahkan teks alternatif', 'alt text', 'teks alternatif'])
  const destination = findControl(root, ['add a destination link', 'tambahkan tautan tujuan', 'destination link', 'tautan tujuan'])

  if (title) setControlValue(title, fields.title)
  else missingFields.push('title')
  if (description) setControlValue(description, fields.description)
  else missingFields.push('description')
  if (altText) setControlValue(altText, fields.altText)
  else missingFields.push('altText')
  if (destination) setControlValue(destination, fields.destinationUrl)
  else missingFields.push('destinationUrl')

  const boardOption = Array.from(root.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], button, [role="button"]'))
    .find((element) => element.textContent?.trim().toLocaleLowerCase() === fields.boardName.trim().toLocaleLowerCase())
  if (boardOption) {
    boardOption.click()
  } else {
    missingFields.push('board')
  }

  return { success: missingFields.length === 0, missingFields }
}

export function findPinterestPublishButton(root: ParentNode): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .find((element) => /^(?:publish|publikasikan|terbitkan)$/i.test(element.textContent?.trim() ?? '')) ?? null
}

export function isPinterestPublishConfirmed(root: ParentNode): boolean {
  const statusText = Array.from(root.querySelectorAll<HTMLElement>('[role="status"], [role="alert"], [aria-live]'))
    .map((element) => element.textContent ?? '')
    .join(' ')
  return /(?:pin (?:was )?published|pin berhasil diterbitkan|published successfully)/i.test(statusText)
}

function findControl(root: ParentNode, names: string[]): HTMLElement | null {
  const controls = Array.from(root.querySelectorAll<HTMLElement>('input, textarea, [contenteditable="true"], [role="textbox"]'))
  return controls.find((control) => {
    const accessibleName = [
      control.getAttribute('aria-label'),
      control.getAttribute('placeholder'),
      control.getAttribute('data-test-id'),
      control.getAttribute('name'),
    ].filter(Boolean).join(' ').toLocaleLowerCase()
    return names.some((name) => accessibleName.includes(name))
  }) ?? null
}

function setControlValue(control: HTMLElement, value: string): void {
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(control, value)
  } else {
    control.focus()
    control.textContent = value
  }
  control.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}
