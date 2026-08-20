export function redactSensitive(source: string): string {
  return source
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret)\s*[=:]\s*)[^\s&]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:signature|sig|token|key)=)[^&#\s]+/gi, '$1[REDACTED]')
}
