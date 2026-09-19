import 'fake-indexeddb/auto'

import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'

import { createAutomationRepository } from '../src/storage/repository'
import type { JobSnapshot, PublicationRecord } from '../src/storage/types'
import type { ProductCandidate } from '../src/core/types'

const databaseName = 'affiliate-pin-agent-test'

afterEach(async () => {
  await deleteDB(databaseName)
})

describe('automation repository', () => {
  it('persists and resumes the latest job checkpoint', async () => {
    const repository = createAutomationRepository(databaseName)
    const checkpoint: JobSnapshot = {
      id: 'active',
      state: 'generate_copy',
      queueProductIds: ['sku-1', 'sku-2'],
      activeProductId: 'sku-1',
      scheduledSlots: [100, 200],
      completedToday: 1,
      consecutiveFailures: 0,
      updatedAt: 123,
    }

    await repository.saveJob(checkpoint)
    expect(await repository.loadJob()).toEqual(checkpoint)
  })

  it('prevents reposting inside 30 days and allows it after the window', async () => {
    const repository = createAutomationRepository(databaseName)
    const publishedAt = new Date('2026-07-01T08:00:00+07:00').getTime()
    const publication: PublicationRecord = {
      id: 'pin-1',
      source: 'shopee',
      productId: 'sku-1',
      productTitle: 'Produk 1',
      productUrl: 'https://shopee.co.id/product/1',
      affiliateUrl: 'https://s.shopee.co.id/example',
      provider: 'openrouter',
      model: 'vendor/model',
      publishedAt,
      contentFingerprint: 'content-hash',
      posterFingerprint: 'poster-hash',
    }

    await repository.recordPublication(publication)

    expect(await repository.wasPublishedWithin('sku-1', 30, publishedAt + 29 * 86_400_000)).toBe(true)
    expect(await repository.wasPublishedWithin('sku-1', 30, publishedAt + 31 * 86_400_000)).toBe(false)
  })

  it('counts successful publications by local day key', async () => {
    const repository = createAutomationRepository(databaseName)
    await repository.recordPublication({
      id: 'pin-1',
      source: 'shopee',
      productId: 'sku-1',
      productTitle: 'Produk 1',
      productUrl: 'https://shopee.co.id/product/1',
      affiliateUrl: 'https://s.shopee.co.id/1',
      provider: 'openrouter',
      model: 'model',
      publishedAt: new Date(2026, 6, 20, 8).getTime(),
      contentFingerprint: 'a',
      posterFingerprint: 'b',
    })
    await repository.recordPublication({
      id: 'pin-2',
      source: 'shopee',
      productId: 'sku-2',
      productTitle: 'Produk 2',
      productUrl: 'https://shopee.co.id/product/2',
      affiliateUrl: 'https://s.shopee.co.id/2',
      provider: 'openrouter',
      model: 'model',
      publishedAt: new Date(2026, 6, 21, 8).getTime(),
      contentFingerprint: 'c',
      posterFingerprint: 'd',
    })

    expect(await repository.countPublicationsForDay('2026-07-20')).toBe(1)
  })

  it('persists discovered products for service-worker restart recovery', async () => {
    const repository = createAutomationRepository(databaseName)
    const product: ProductCandidate = {
      source: 'shopee',
      id: 'sku-1',
      title: 'Kabel Fast Charging',
      canonicalUrl: 'https://shopee.co.id/product/1',
      price: 75_000,
      rating: 4.8,
      sold: 250,
      commissionPercent: 12,
      imageUrl: 'https://cf.shopee.co.id/file/example',
    }

    await repository.saveProducts([product])
    expect(await repository.getProduct('sku-1')).toEqual(product)

    await repository.deleteProduct('sku-1')
    expect(await repository.getProduct('sku-1')).toBeUndefined()
  })
})
