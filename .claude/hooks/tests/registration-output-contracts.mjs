#!/usr/bin/env node
// Registration-derived static output-contract audit.

import fs from 'node:fs'
import path from 'node:path'

const [registryPath, schemaPath, hookRoot] = process.argv.slice(2)
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const descriptorSchema = schema.properties.hooks.additionalProperties.items
  .properties.hooks.items.oneOf.find((entry) => entry.properties?.kind?.const === 'hook')
const allowedModes = new Set(descriptorSchema.properties.outputMode.enum)
const allowedRuntimes = new Set(descriptorSchema.properties.runtime.enum)
const allowedEvents = new Set(schema.properties.hooks.propertyNames.enum)
const failures = []
const descriptors = []

const shellSources = []
const walkShellSources = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walkShellSources(absolute)
    else if (entry.isFile() && entry.name.endsWith('.sh')) shellSources.push(absolute)
  }
}
walkShellSources(hookRoot)
const dynamicNodeSource = /\bnode[ \t]+(?:-[ep](?=[ \t]|$)|--(?:eval|print)(?:=|(?=[ \t]|$))|-(?=[ \t]|$)|<<)/
for (const shellPath of shellSources) {
  const source = fs.readFileSync(shellPath, 'utf8').replace(/\\\r?\n/g, ' ')
  for (const [index, line] of source.split('\n').entries()) {
    if (/^\s*#/.test(line)) continue
    if (dynamicNodeSource.test(line)) {
      failures.push(
        `${path.relative(hookRoot, shellPath)}:${index + 1}:dynamic Node source is prohibited`,
      )
    }
  }
}

for (const [event, matcherGroups] of Object.entries(registry.hooks ?? {})) {
  if (!allowedEvents.has(event)) failures.push(`unknown hook event:${event}`)
  if (!Array.isArray(matcherGroups)) {
    failures.push(`event is not an array:${event}`)
    continue
  }
  for (const [groupIndex, group] of matcherGroups.entries()) {
    if (!Array.isArray(group?.hooks)) {
      failures.push(`matcher hooks is not an array:${event}[${groupIndex}]`)
      continue
    }
    for (const [hookIndex, descriptor] of group.hooks.entries()) {
      if (descriptor?.kind !== 'hook') continue
      descriptors.push({ event, groupIndex, hookIndex, ...descriptor })
    }
  }
}

if (descriptors.length === 0) failures.push('registration contains no hook descriptors')

const signatures = new Map()
for (const descriptor of descriptors) {
  const label = `${descriptor.event}[${descriptor.groupIndex}].hooks[${descriptor.hookIndex}]`
  if (!allowedModes.has(descriptor.outputMode)) {
    failures.push(`${label}:${descriptor.hook}:unsupported outputMode ${descriptor.outputMode}`)
  }
  if (!allowedRuntimes.has(descriptor.runtime)) {
    failures.push(`${label}:${descriptor.hook}:unsupported runtime ${descriptor.runtime}`)
  }
  if (typeof descriptor.hook !== 'string' || !/^[A-Za-z0-9._-]+$/.test(descriptor.hook)) {
    failures.push(`${label}:unsafe hook path ${JSON.stringify(descriptor.hook)}`)
    continue
  }

  const hookPath = path.join(hookRoot, descriptor.hook)
  let stat
  try {
    stat = fs.lstatSync(hookPath)
  } catch {
    failures.push(`${label}:${descriptor.hook}:canonical source is missing`)
    continue
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    failures.push(`${label}:${descriptor.hook}:canonical source must be a regular non-symlink file`)
    continue
  }
  const runtimeExtensionValid = {
    bash: descriptor.hook.endsWith('.sh'),
    python3: descriptor.hook.endsWith('.py'),
    node: /\.(?:mjs|cjs|js)$/.test(descriptor.hook),
  }[descriptor.runtime]
  if (!runtimeExtensionValid) {
    failures.push(`${label}:${descriptor.hook}:runtime/extension mismatch (${descriptor.runtime})`)
  }

  const signature = `${descriptor.runtime}\0${descriptor.outputMode}`
  const prior = signatures.get(descriptor.hook)
  if (prior && prior !== signature) {
    failures.push(`${descriptor.hook}:duplicate registrations disagree on runtime/outputMode`)
  } else {
    signatures.set(descriptor.hook, signature)
  }
}

// A diagnostic may return 70 only for an explicit integrity failure. It must never block policy
// with exit 1/2 or a dynamic exit status, because the runner would misclassify that as integrity.
for (const hook of new Set(
  descriptors.filter((entry) => entry.outputMode === 'diagnostic').map((entry) => entry.hook),
)) {
  const source = fs.readFileSync(path.join(hookRoot, hook), 'utf8')
  for (const [index, rawLine] of source.split('\n').entries()) {
    if (/^\s*#/.test(rawLine)) continue
    const shellExit = rawLine.match(/\bexit\s+(?:"?)(\$[A-Za-z_{]|\d+)/)
    const pythonExit = rawLine.match(/\bsys\.exit\(\s*(\d+)/)
    const token = shellExit?.[1] ?? pythonExit?.[1]
    if (!token) continue
    const numeric = /^\d+$/.test(token) ? Number(token) : null
    if (numeric !== 0 && numeric !== 70) {
      failures.push(`${hook}:${index + 1}:diagnostic has prohibited non-integrity exit ${token}`)
    }
  }
}

// Lock the high-risk modes that exercise both neutral transports and genuine policy blocking.
const requiredModes = new Map([
  ['check_spec_class_drift.sh', 'governance-context'],
  ['check_audit_post_report_validator.sh', 'governance-context-or-block'],
  ['auto_regen_ds_barrel.sh', 'governance-context'],
  ['stop_self_audit.sh', 'governance-decision'],
  ['check_orphan_ds_css.sh', 'governance-decision'],
  ['inject_deploy_url_after_push.sh', 'governance-context'],
  ['session_start_governance_check.sh', 'governance-context'],
])
for (const [hook, expectedMode] of requiredModes) {
  const matches = descriptors.filter((entry) => entry.hook === hook)
  if (matches.length === 0) {
    failures.push(`${hook}:required descriptor is missing`)
  } else if (matches.some((entry) => entry.outputMode !== expectedMode)) {
    failures.push(`${hook}:expected every registration to use ${expectedMode}`)
  }
}

if (failures.length > 0) {
  console.error('registration output-contract failures:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(
  `PASS registration output contracts: ${descriptors.length} descriptors, `
  + `${new Set(descriptors.map((entry) => entry.hook)).size} canonical hooks`,
)
