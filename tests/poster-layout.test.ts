import { describe, expect, it } from 'vitest'

import { computePosterLayout } from '../src/renderer/layout'

describe('computePosterLayout', () => {
  it('uses a stable 2:3 canvas and keeps text outside the product box', () => {
    const layout = computePosterLayout({ imageWidth: 1000, imageHeight: 1000, headlineLength: 42 })

    expect(layout.canvas).toEqual({ width: 1000, height: 1500 })
    expect(layout.image.y + layout.image.height).toBeLessThanOrEqual(layout.headline.y)
    expect(layout.headline.x).toBeGreaterThanOrEqual(64)
    expect(layout.headline.width).toBeLessThanOrEqual(872)
  })

  it('reduces headline size for long titles without changing layout geometry', () => {
    const short = computePosterLayout({ imageWidth: 1200, imageHeight: 800, headlineLength: 30 })
    const long = computePosterLayout({ imageWidth: 1200, imageHeight: 800, headlineLength: 95 })

    expect(long.headline.fontSize).toBeLessThan(short.headline.fontSize)
    expect(long.headline).toMatchObject({ x: short.headline.x, y: short.headline.y, width: short.headline.width })
  })

  it('contains portrait images without cropping the product', () => {
    const layout = computePosterLayout({ imageWidth: 700, imageHeight: 1400, headlineLength: 40 })
    expect(layout.image.fit).toBe('contain')
    expect(layout.image.height).toBeLessThanOrEqual(930)
  })
})
