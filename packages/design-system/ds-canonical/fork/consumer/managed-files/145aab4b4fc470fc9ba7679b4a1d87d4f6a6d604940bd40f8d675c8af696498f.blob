import { compareUtf8Bytes } from './provider-lifecycle.mjs'

const invariant = (condition, message) => {
  if (!condition) throw new Error(message)
}

export const PROTECTED_CONTROL_PLANE_EXACT_PATHS = Object.freeze([
  '.npmrc',
])

export const PROTECTED_CONTROL_PLANE_PATH_PREFIXES = Object.freeze([
  '.github/',
  'governance/bin/',
  'scripts/',
])

export const REVIEWED_CONTROL_PLANE_UPDATE_COMMAND =
  'node infra/governance/bin/consumerctl.mjs plan-control-plane-update'

export const REVIEWED_CONTROL_PLANE_UPDATE_ROUTE =
  `use the recurring reviewed control-plane update protocol in the DS authority checkout; start with \`${REVIEWED_CONTROL_PLANE_UPDATE_COMMAND}\``

export function requiresReviewedControlPlaneUpdate(path) {
  invariant(typeof path === 'string' && path.length > 0, 'protected control-plane path must be a non-empty string')
  return PROTECTED_CONTROL_PLANE_EXACT_PATHS.includes(path)
    || PROTECTED_CONTROL_PLANE_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

export function canonicalPackageScripts(value, label = 'package manifest') {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} is invalid`)
  const scripts = value.scripts ?? {}
  invariant(scripts && typeof scripts === 'object' && !Array.isArray(scripts), `${label} scripts are invalid`)
  const entries = Object.entries(scripts).sort(([left], [right]) => compareUtf8Bytes(left, right))
  for (const [name, command] of entries) {
    invariant(name.length > 0 && typeof command === 'string' && command.length > 0, `${label} script ${name || '<empty>'} is invalid`)
  }
  return Object.freeze(Object.fromEntries(entries))
}

export function packageScriptsAreIdentical(previous, incoming, {
  previousLabel = 'protected-base package manifest',
  incomingLabel = 'incoming package manifest',
} = {}) {
  const before = canonicalPackageScripts(previous, previousLabel)
  const after = canonicalPackageScripts(incoming, incomingLabel)
  return JSON.stringify(before) === JSON.stringify(after)
}
