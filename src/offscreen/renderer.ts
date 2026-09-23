import type { ExtensionMessage, MessageResponse } from '../core/messages'
import { computePosterLayout } from '../renderer/layout'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'RENDER_POSTER') return

  renderPoster(message)
    .then((dataUrl) => sendResponse({ ok: true, data: { dataUrl } } satisfies MessageResponse))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: { code: 'poster_render_failed', message: error instanceof Error ? error.message : 'Poster rendering failed' },
    } satisfies MessageResponse))
  return true
})

async function renderPoster(message: Extract<ExtensionMessage, { type: 'RENDER_POSTER' }>): Promise<string> {
  const canvas = document.querySelector<HTMLCanvasElement>('#poster')
  const context = canvas?.getContext('2d', { alpha: false })
  if (!canvas || !context) throw new Error('Poster canvas is unavailable')

  const imageResponse = await fetch(message.product.imageUrl, { credentials: 'omit' })
  if (!imageResponse.ok) throw new Error(`Product image download failed (${imageResponse.status})`)
  const image = await createImageBitmap(await imageResponse.blob())
  const layout = computePosterLayout({
    imageWidth: image.width,
    imageHeight: image.height,
    headlineLength: message.headline.length,
  })
  const palette = samplePalette(image)

  context.fillStyle = '#f5f7f8'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = palette.soft
  context.fillRect(0, 0, canvas.width, 22)
  context.fillStyle = '#ffffff'
  context.fillRect(layout.image.x, layout.image.y, layout.image.width, layout.image.height)
  context.strokeStyle = '#dce1e4'
  context.lineWidth = 2
  context.strokeRect(layout.image.x, layout.image.y, layout.image.width, layout.image.height)

  drawContainedImage(context, image, layout.image)

  context.fillStyle = palette.accent
  context.font = `600 ${layout.eyebrow.fontSize}px Inter, Arial, sans-serif`
  context.fillText('PRODUK PILIHAN', layout.eyebrow.x, layout.eyebrow.y + layout.eyebrow.fontSize)

  context.fillStyle = '#172126'
  context.font = `700 ${layout.headline.fontSize}px Inter, Arial, sans-serif`
  drawWrappedText(context, message.headline, layout.headline)

  context.fillStyle = '#536168'
  context.font = `500 ${layout.footer.fontSize}px Inter, Arial, sans-serif`
  context.fillText('Detail produk tersedia melalui tautan Pin', layout.footer.x, layout.footer.y)

  image.close()
  return canvas.toDataURL('image/jpeg', 0.9)
}

function samplePalette(image: ImageBitmap): { accent: string; soft: string } {
  const sample = new OffscreenCanvas(1, 1)
  const context = sample.getContext('2d')
  if (!context) return { accent: '#087e8b', soft: '#d7f0f2' }
  context.drawImage(image, 0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  const darken = (value: number) => Math.max(35, Math.round(value * 0.55))
  const soften = (value: number) => Math.round(230 + value * 0.1)
  return {
    accent: `rgb(${darken(red)}, ${darken(green)}, ${darken(blue)})`,
    soft: `rgb(${soften(red)}, ${soften(green)}, ${soften(blue)})`,
  }
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  box: { x: number; y: number; width: number; height: number },
): void {
  const scale = Math.min(box.width / image.width, box.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const x = box.x + (box.width - width) / 2
  const y = box.y + (box.height - height) / 2
  context.drawImage(image, x, y, width, height)
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; width: number; lineHeight: number; maxLines: number },
): void {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (context.measureText(candidate).width <= box.width || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  const visible = lines.slice(0, box.maxLines)
  if (lines.length > box.maxLines) {
    let last = visible[visible.length - 1]
    while (last && context.measureText(`${last}...`).width > box.width) {
      last = last.split(' ').slice(0, -1).join(' ')
    }
    visible[visible.length - 1] = `${last}...`
  }
  visible.forEach((line, index) => context.fillText(line, box.x, box.y + box.lineHeight * (index + 1)))
}
