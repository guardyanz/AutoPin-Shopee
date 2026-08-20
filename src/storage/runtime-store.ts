import { redactSensitive } from '../core/redaction'
import {
  DEFAULT_RUNTIME_STATUS,
  type ActivityEntry,
  type RuntimePayload,
  type RuntimeStatus,
} from '../core/runtime'

const STATUS_KEY = 'runtimeStatus'
const PAYLOAD_KEY = 'runtimePayload'
const ACTIVITY_KEY = 'activityLog'

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const stored = await chrome.storage.local.get(STATUS_KEY)
  return stored[STATUS_KEY] as RuntimeStatus | undefined ?? DEFAULT_RUNTIME_STATUS
}

export async function setRuntimeStatus(status: RuntimeStatus): Promise<void> {
  await chrome.storage.local.set({ [STATUS_KEY]: status })
}

export async function getRuntimePayload(): Promise<RuntimePayload> {
  const stored = await chrome.storage.local.get(PAYLOAD_KEY)
  return stored[PAYLOAD_KEY] as RuntimePayload | undefined ?? {}
}

export async function setRuntimePayload(payload: RuntimePayload): Promise<void> {
  await chrome.storage.local.set({ [PAYLOAD_KEY]: payload })
}

export async function clearRuntimePayload(): Promise<void> {
  await chrome.storage.local.remove(PAYLOAD_KEY)
}

export async function getActivityLog(): Promise<ActivityEntry[]> {
  const stored = await chrome.storage.local.get(ACTIVITY_KEY)
  return stored[ACTIVITY_KEY] as ActivityEntry[] | undefined ?? []
}

export async function appendActivity(entry: ActivityEntry): Promise<void> {
  const current = await getActivityLog()
  const sanitized = { ...entry, message: redactSensitive(entry.message) }
  await chrome.storage.local.set({ [ACTIVITY_KEY]: [sanitized, ...current].slice(0, 100) })
}
