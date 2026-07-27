export const AUDIT_COVERAGE_TIERS = Object.freeze([
  'DETERMINISTIC',
  'HOOK-ENFORCED',
  'PURE-JUDGMENT',
  'CI-ENFORCED',
])

export function validateAuditCoverageEntry(entry, { dim = '<unknown>' } = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`coverage dimension ${dim} must be an object`)
  }
  const keys = Object.keys(entry).sort()
  if (JSON.stringify(keys) !== JSON.stringify(['mechanism', 'tier'])) {
    throw new Error(`coverage dimension ${dim} keys must be exactly mechanism,tier`)
  }
  if (!AUDIT_COVERAGE_TIERS.includes(entry.tier)) {
    throw new Error(`coverage dimension ${dim} has unsupported tier:${entry.tier}`)
  }
  if (typeof entry.mechanism !== 'string' || !entry.mechanism.trim()) {
    throw new Error(`coverage dimension ${dim} has an empty mechanism`)
  }
  return true
}
