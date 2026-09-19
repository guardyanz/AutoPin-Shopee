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

  let image: ImageBitmap | null = null
  if (message.product.imageUrl) {
    const imageResponse = await fetch(message.product.imageUrl, { credentials: 'omit' })
    if (!imageResponse.ok) throw new Error(`Product image download failed (${imageResponse.status})`)
    image = await createImageBitmap(await imageResponse.blob())
  }
  const layout = computePosterLayout({
    imageWidth: image?.width ?? 1,
    imageHeight: image?.height ?? 1,
    headlineLength: message.headline.length,
  })
  const palette = image ? samplePalette(image) : paletteFromText(message.product.title)

  context.fillStyle = '#f5f7f8'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = palette.soft
  context.fillRect(0, 0, canvas.width, 22)
  context.fillStyle = '#ffffff'
  context.fillRect(layout.image.x, layout.image.y, layout.image.width, layout.image.height)
  context.strokeStyle = '#dce1e4'
  context.lineWidth = 2
  context.strokeRect(layout.image.x, layout.image.y, layout.image.width, layout.image.height)

  if (image) drawContainedImage(context, image, layout.image)
  else drawOriginalGraphic(context, layout.image, palette, message.product.title)

  context.fillStyle = palette.accent
  context.font = `600 ${layout.eyebrow.fontSize}px Inter, Arial, sans-serif`
  context.fillText('PILIHAN PRODUK AFFILIATE', layout.eyebrow.x, layout.eyebrow.y + layout.eyebrow.fontSize)

  context.fillStyle = '#172126'
  context.font = `700 ${layout.headline.fontSize}px Inter, Arial, sans-serif`
  drawWrappedText(context, message.headline, layout.headline)

  context.fillStyle = '#536168'
  context.font = `500 ${layout.footer.fontSize}px Inter, Arial, sans-serif`
  context.fillText('Detail produk tersedia melalui tautan Pin', layout.footer.x, layout.footer.y)

  image?.close()
  return canvas.toDataURL('image/jpeg', 0.9)
}

function paletteFromText(value: string): { accent: string; soft: string } {
  let hash = 0
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0
  const hue = Math.abs(hash) % 360
  return {
    accent: `hsl(${hue} 58% 32%)`,
    soft: `hsl(${hue} 45% 92%)`,
  }
}

function drawOriginalGraphic(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  palette: { accent: string; soft: string },
  title: string,
): void {
  context.save()
  context.fillStyle = palette.soft
  context.fillRect(box.x, box.y, box.width, box.height)

  context.globalAlpha = 0.16
  context.fillStyle = palette.accent
  context.beginPath()
  context.arc(box.x + box.width * 0.24, box.y + box.height * 0.28, box.width * 0.2, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.arc(box.x + box.width * 0.78, box.y + box.height * 0.72, box.width * 0.26, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 1

  const cardWidth = box.width * 0.58
  const cardHeight = box.height * 0.46
  const cardX = box.x + (box.width - cardWidth) / 2
  const cardY = box.y + (box.height - cardHeight) / 2
  context.fillStyle = '#ffffff'
  context.shadowColor = 'rgba(23, 33, 38, 0.14)'
  context.shadowBlur = 28
  context.shadowOffsetY = 14
  roundRect(context, cardX, cardY, cardWidth, cardHeight, 42)
  context.fill()
  context.shadowColor = 'transparent'

  context.strokeStyle = palette.accent
  context.lineWidth = 10
  context.beginPath()
  context.moveTo(cardX + cardWidth * 0.34, cardY + cardHeight * 0.32)
  context.lineTo(cardX + cardWidth * 0.66, cardY + cardHeight * 0.32)
  context.quadraticCurveTo(cardX + cardWidth * 0.78, cardY + cardHeight * 0.32, cardX + cardWidth * 0.78, cardY + cardHeight * 0.44)
  context.lineTo(cardX + cardWidth * 0.78, cardY + cardHeight * 0.68)
  context.quadraticCurveTo(cardX + cardWidth * 0.78, cardY + cardHeight * 0.76, cardX + cardWidth * 0.7, cardY + cardHeight * 0.76)
  context.lineTo(cardX + cardWidth * 0.3, cardY + cardHeight * 0.76)
  context.quadraticCurveTo(cardX + cardWidth * 0.22, cardY + cardHeight * 0.76, cardX + cardWidth * 0.22, cardY + cardHeight * 0.68)
  context.lineTo(cardX + cardWidth * 0.44, cardY + cardHeight * 0.48)
  context.stroke()

  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'AP'
  context.fillStyle = palette.accent
  context.font = '700 88px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(initials, cardX + cardWidth / 2, cardY + cardHeight * 0.5)
  context.restore()
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.arcTo(x + width, y, x + width, y + height, safeRadius)
  context.arcTo(x + width, y + height, x, y + height, safeRadius)
  context.arcTo(x, y + height, x, y, safeRadius)
  context.arcTo(x, y, x + width, y, safeRadius)
  context.closePath()
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
