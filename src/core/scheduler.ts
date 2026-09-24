const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
export const IMMEDIATE_PIN_SPACING_MS = 10_000

export function createImmediateSchedule(startAt: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => startAt + index * IMMEDIATE_PIN_SPACING_MS)
}

interface ScheduleOptions {
  startAt: number
  windowHours: number
  requestedCount: number
  dailyCap: number
  minSpacingMinutes?: number
  random?: () => number
}

export function createDailySchedule(options: ScheduleOptions): number[] {
  const {
    startAt,
    windowHours,
    requestedCount,
    dailyCap,
    minSpacingMinutes = 20,
    random = Math.random,
  } = options

  const windowMs = Math.max(0, windowHours * HOUR_MS)
  const minSpacingMs = Math.max(0, minSpacingMinutes * MINUTE_MS)
  const spacingCapacity = minSpacingMs === 0 ? dailyCap : Math.floor(windowMs / minSpacingMs) + 1
  const count = Math.max(0, Math.min(requestedCount, dailyCap, spacingCapacity))
  if (count === 0) return []
  if (count === 1) return [startAt + Math.floor(Math.min(1, Math.max(0, random())) * windowMs)]

  const baseGap = windowMs / (count - 1)
  const jitterBudget = Math.max(0, Math.min(baseGap - minSpacingMs, baseGap * 0.7))

  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return startAt
    if (index === count - 1) return startAt + windowMs

    const centeredRandom = Math.min(1, Math.max(0, random())) - 0.5
    return Math.round(startAt + index * baseGap + centeredRandom * jitterBudget)
  })
}

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
