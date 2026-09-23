import { describe, expect, it } from 'vitest'

import manifest from '../manifest.json'

describe('Shopee image access', () => {
  it('allows the offscreen poster renderer to fetch images from the Affiliate CDN', () => {
    const imageUrl = new URL('https://down-id.img.susercontent.com/file/product')
    const hostPermission = manifest.host_permissions.some((pattern) => {
      const [, host] = pattern.match(/^https:\/\/([^/]+)\/\*$/) ?? []
      return host?.startsWith('*.') && imageUrl.hostname.endsWith(host.slice(1))
    })
    const connectSources = manifest.content_security_policy.extension_pages
      .split('connect-src ')[1]?.split(';')[0].trim().split(/\s+/) ?? []

    expect(hostPermission).toBe(true)
    expect(connectSources.some((source) => {
      const host = source.replace(/^https:\/\/\*\./, '')
      return source.startsWith('https://*.') && imageUrl.hostname.endsWith(`.${host}`)
    })).toBe(true)
  })
})
