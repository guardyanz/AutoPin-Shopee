import { openDB, type DBSchema } from 'idb'

import { localDayKey } from '../core/scheduler'
import type { ProductCandidate } from '../core/types'
import type { JobSnapshot, PinDraft, PublicationRecord } from './types'

interface AutomationDatabase extends DBSchema {
  jobs: {
    key: string
    value: JobSnapshot
  }
  publications: {
    key: string
    value: PublicationRecord
    indexes: { 'by-product': string }
  }
  products: {
    key: string
    value: ProductCandidate
  }
  drafts: {
    key: string
    value: PinDraft
  }
}

export interface AutomationRepository {
  saveJob(snapshot: JobSnapshot): Promise<void>
  loadJob(): Promise<JobSnapshot | undefined>
  recordPublication(record: PublicationRecord): Promise<void>
  wasPublishedWithin(productId: string, days: number, now?: number): Promise<boolean>
  countPublicationsForDay(dayKey: string): Promise<number>
  listRecentPublications(limit?: number): Promise<PublicationRecord[]>
  saveProducts(products: ProductCandidate[]): Promise<void>
  getProduct(productId: string): Promise<ProductCandidate | undefined>
  saveDraft(draft: PinDraft): Promise<void>
  getDraft(productId: string): Promise<PinDraft | undefined>
  deleteDraft(productId: string): Promise<void>
}

export function createAutomationRepository(databaseName = 'autopin-shopee'): AutomationRepository {
  const withDatabase = async <T>(operation: (database: Awaited<ReturnType<typeof openDatabase>>) => Promise<T>): Promise<T> => {
    const database = await openDatabase(databaseName)
    try {
      return await operation(database)
    } finally {
      database.close()
    }
  }

  return {
    saveJob(snapshot) {
      return withDatabase(async (database) => {
        await database.put('jobs', snapshot)
      })
    },

    loadJob() {
      return withDatabase((database) => database.get('jobs', 'active'))
    },

    recordPublication(record) {
      return withDatabase(async (database) => {
        await database.put('publications', record)
      })
    },

    wasPublishedWithin(productId, days, now = Date.now()) {
      return withDatabase(async (database) => {
        const publications = await database.getAllFromIndex('publications', 'by-product', productId)
        const cutoff = now - days * 86_400_000
        return publications.some((publication) => publication.publishedAt >= cutoff && publication.publishedAt <= now)
      })
    },

    countPublicationsForDay(dayKey) {
      return withDatabase(async (database) => {
        const publications = await database.getAll('publications')
        return publications.filter((publication) => localDayKey(new Date(publication.publishedAt)) === dayKey).length
      })
    },

    listRecentPublications(limit = 20) {
      return withDatabase(async (database) => {
        const publications = await database.getAll('publications')
        return publications
          .sort((left, right) => right.publishedAt - left.publishedAt)
          .slice(0, limit)
      })
    },

    saveProducts(products) {
      return withDatabase(async (database) => {
        const transaction = database.transaction('products', 'readwrite')
        await Promise.all([
          ...products.map((product) => transaction.store.put(product)),
          transaction.done,
        ])
      })
    },

    getProduct(productId) {
      return withDatabase((database) => database.get('products', productId))
    },

    saveDraft(draft) {
      return withDatabase(async (database) => {
        await database.put('drafts', draft)
      })
    },

    getDraft(productId) {
      return withDatabase((database) => database.get('drafts', productId))
    },

    deleteDraft(productId) {
      return withDatabase(async (database) => {
        await database.delete('drafts', productId)
      })
    },
  }
}

function openDatabase(databaseName: string) {
  return openDB<AutomationDatabase>(databaseName, 3, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('jobs')) {
        database.createObjectStore('jobs', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('publications')) {
        const publications = database.createObjectStore('publications', { keyPath: 'id' })
        publications.createIndex('by-product', 'productId')
      }
      if (!database.objectStoreNames.contains('products')) {
        database.createObjectStore('products', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('drafts')) {
        database.createObjectStore('drafts', { keyPath: 'id' })
      }
    },
  })
}
