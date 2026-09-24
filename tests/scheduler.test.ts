import { describe, expect, it } from 'vitest'

import { createDailySchedule, createImmediateSchedule, IMMEDIATE_PIN_SPACING_MS, localDayKey } from '../src/core/scheduler'

describe('createImmediateSchedule', () => {
  it('starts now and keeps approved Pins in one short sequential batch', () => {
    const start = Date.now()
    expect(createImmediateSchedule(start, 3)).toEqual([
      start,
      start + IMMEDIATE_PIN_SPACING_MS,
      start + 2 * IMMEDIATE_PIN_SPACING_MS,
    ])
  })
})

describe('createDailySchedule', () => {
  it('creates sorted slots across the requested window and respects the daily cap', () => {
    const start = new Date('2026-07-20T08:00:00+07:00').getTime()
    const randomValues = [0, 0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4, 0.5]
    let index = 0

    const slots = createDailySchedule({
      startAt: start,
      windowHours: 10,
      requestedCount: 25,
      dailyCap: 10,
      random: () => randomValues[index++] ?? 0.5,
    })

    expect(slots).toHaveLength(10)
    expect(slots).toEqual([...slots].sort((a, b) => a - b))
    expect(slots.every((slot) => slot >= start && slot <= start + 10 * 60 * 60 * 1000)).toBe(true)
  })

  it('does not compress slots closer than the configured minimum spacing', () => {
    const start = Date.now()
    const slots = createDailySchedule({
      startAt: start,
      windowHours: 8,
      requestedCount: 10,
      dailyCap: 10,
      minSpacingMinutes: 20,
      random: () => 0.5,
    })

    const gaps = slots.slice(1).map((slot, index) => slot - slots[index])
    expect(gaps.every((gap) => gap >= 20 * 60 * 1000)).toBe(true)
  })
})

describe('localDayKey', () => {
  it('creates a stable local calendar key', () => {
    expect(localDayKey(new Date(2026, 6, 20, 23, 59))).toBe('2026-07-20')
  })
})
