import { sep } from 'node:path'

// This module is the zero-I/O ownership resolution boundary shared by authority
// tooling and fork projection. It must remain safe to import without reading or
// validating any repository-local provider, Harness, or generated state.
export const OWNERSHIP_MODES = new Set([
  'authority',
  'generated',
  'upstream-managed',
  'three-way',
  'consumer-owned',
])

export const REPOSITORY_ROLES = new Set([
  'authority',
  'template-mirror',
  'product-consumer',
])

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export function normalizeRepoPath(path) {
  invariant(typeof path === 'string', 'Repository path must be a string')
  return path.split(sep).join('/').replace(/^\.\//, '')
}

export function globToRegExp(pattern) {
  invariant(typeof pattern === 'string' && pattern.length > 0, 'Ownership glob must be a non-empty string')
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    }
  }
  source += '$'
  return new RegExp(source)
}

export function resolveOwnership(policy, path) {
  invariant(policy && typeof policy === 'object' && !Array.isArray(policy), 'Ownership policy must be an object')
  invariant(Array.isArray(policy.rules), 'Ownership policy rules must be an array')
  const normalized = normalizeRepoPath(path)
  const matches = policy.rules.filter(rule => globToRegExp(rule.pattern).test(normalized))
  if (matches.length > 1) {
    throw new Error(`Ambiguous ownership for ${normalized}: ${matches.map(match => `${match.pattern}:${match.mode}`).join(', ')}`)
  }
  return matches[0] ?? { pattern: '<default>', mode: policy.defaultMode, owner: '<default>' }
}

export function resolveInventoryOwnershipPolicy(inventory, policyId) {
  invariant(
    inventory?.ownershipPolicies
      && typeof inventory.ownershipPolicies === 'object'
      && !Array.isArray(inventory.ownershipPolicies),
    'Managed repository inventory must contain ownershipPolicies',
  )
  invariant(typeof policyId === 'string' && policyId.length > 0, 'Ownership policy id must be a non-empty string')
  const policy = inventory.ownershipPolicies[policyId]
  invariant(policy && typeof policy === 'object' && !Array.isArray(policy), `Managed repository inventory is missing ownership policy:${policyId}`)
  return policy
}
