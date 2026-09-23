export async function applyShopeeAffiliateTags(dialog: HTMLElement, tags: string[]): Promise<void> {
  if (tags.length === 0) return
  const yesLabel = Array.from(dialog.querySelectorAll<HTMLLabelElement>('label'))
    .find((label) => label.textContent?.trim() === 'Iya')
  const yesRadio = yesLabel?.querySelector<HTMLInputElement>('input[type="radio"]')
  if (!yesLabel || !yesRadio) throw new Error('Pilihan Pakai Tag: Iya tidak ditemukan di formulir Shopee')
  yesRadio.click()

  for (const [index, tag] of tags.entries()) {
    const input = await waitForTagInput(dialog, index + 1)
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(input, tag)
    else input.value = tag
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const addButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => /Tambahkan ke Link/i.test(button.textContent ?? ''))
  if (!addButton) throw new Error('Tombol Tambahkan ke Link tidak ditemukan di formulir Shopee')
  addButton.click()
}

async function waitForTagInput(dialog: HTMLElement, number: number): Promise<HTMLInputElement> {
  const started = Date.now()
  while (Date.now() - started < 5_000) {
    const captionPattern = new RegExp(`^Tag ke\\s*${number}$`, 'i')
    const label = Array.from(dialog.querySelectorAll<HTMLLabelElement>('label'))
      .find((candidate) => captionPattern.test(candidate.textContent?.trim() ?? ''))
    const caption = Array.from(dialog.querySelectorAll<HTMLElement>('span, div'))
      .find((candidate) => candidate.childElementCount === 0 && captionPattern.test(candidate.textContent?.trim() ?? ''))
    const input = label?.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
      ?? (label?.htmlFor ? dialog.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`) : null)
      ?? label?.parentElement?.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
      ?? caption?.parentElement?.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')
    if (input) return input
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Kolom Tag ke ${number} tidak ditemukan di formulir Shopee`)
}
