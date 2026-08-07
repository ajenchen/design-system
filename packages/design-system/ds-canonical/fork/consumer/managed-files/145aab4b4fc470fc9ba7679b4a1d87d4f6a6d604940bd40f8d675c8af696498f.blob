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

// 兩條路都要講,只講前者會把 legacy-profile 的 consumer 導進死路:recurring lane 要求 profile 在
// consumer-upgrade-protocol.json 的 reviewedControlPlaneUpdate.entryProfiles 內,legacy profile 不在,
// 而要進去得先完成 promotion —— promotion 又要求一個「非作者」的獨立簽署,單人 fleet 無法滿足。
// legacy profile 自己的 entry mode(one-time reviewed full-snapshot PR)一直是通的,由第二條指令固化。
export const REVIEWED_CONTROL_PLANE_UPDATE_ROUTE =
  `use the recurring reviewed control-plane update protocol in the DS authority checkout; start with \`${REVIEWED_CONTROL_PLANE_UPDATE_COMMAND}\``
  + '. If the consumer is still on a legacy bootstrap profile (not in reviewedControlPlaneUpdate.entryProfiles),'
  + ' use its own one-time reviewed full-snapshot route instead: `node scripts/consumer-fullsnapshot-upgrade.mjs`'

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
