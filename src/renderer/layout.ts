interface LayoutInput {
  imageWidth: number
  imageHeight: number
  headlineLength: number
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface PosterLayout {
  canvas: { width: 1000; height: 1500 }
  image: Box & { fit: 'contain' }
  headline: Box & { fontSize: number; lineHeight: number; maxLines: number }
  eyebrow: Box & { fontSize: number }
  footer: Box & { fontSize: number }
}

export function computePosterLayout(input: LayoutInput): PosterLayout {
  const imageRatio = input.imageWidth > 0 && input.imageHeight > 0
    ? input.imageWidth / input.imageHeight
    : 1
  const imageHeight = imageRatio < 0.7 ? 900 : imageRatio > 1.35 ? 720 : 840
  const imageY = 120
  const headlineY = imageY + imageHeight + 54
  const fontSize = input.headlineLength > 78 ? 50 : input.headlineLength > 48 ? 60 : 72

  return {
    canvas: { width: 1000, height: 1500 },
    image: { x: 64, y: imageY, width: 872, height: imageHeight, fit: 'contain' },
    eyebrow: { x: 64, y: 60, width: 872, height: 34, fontSize: 24 },
    headline: {
      x: 64,
      y: headlineY,
      width: 872,
      height: 240,
      fontSize,
      lineHeight: Math.round(fontSize * 1.15),
      maxLines: 3,
    },
    footer: { x: 64, y: 1430, width: 872, height: 30, fontSize: 22 },
  }
}
