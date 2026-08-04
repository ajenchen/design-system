import { execFileSync } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  DEFAULT_MANIFEST,
  assertNoSymlinkWithin,
  assertRegularFileWithin,
  canonicalize,
  compareUtf8Bytes,
  compareInventories,
  diagnostic,
  digest,
  exists,
  inventoryTree,
  modeString,
  readJson,
  relativePath,
  resolveWithin,
  stableJson,
  treeDigest,
  unique,
} from './common.mjs'
import {
  assertCanonicalGovernanceCarrierProjectionMap,
  governanceCarrierProjectionMap,
  governanceCarrierProjectionsForSource,
  projectGovernanceCarrierBytes,
} from './carrier-projection.mjs'

const PROVIDER_HOOK_OUTPUT_TRANSPORT = 'scripts/lib/provider-hook-output-transport.mjs'

const contractRule = (kind, path, message, severity = 'critical', expected, actual) => diagnostic({
  ruleId: 'GOV-CONTRACT-001',
  severity,
  kind,
  path,
  expected,
  actual,
  message,
})

async function readRegistry(manifestDirectory, value, name, diagnostics) {
  try {
    const registryPath = resolve(manifestDirectory, relativePath(value, `registries.${name}`))
    await assertRegularFileWithin(manifestDirectory, registryPath, `registries.${name}`)
    const body = await readJson(registryPath)
    return { path: registryPath, body, hash: digest(stableJson(body)) }
  } catch (error) {
    diagnostics.push(contractRule('registry-read-error', value || name, `Cannot read ${name} registry: ${error.message}`))
    return { path: null, body: {}, hash: null }
  }
}

function duplicates(values) {
  const seen = new Set()
  const repeated = new Set()
  for (const value of values) seen.has(value) ? repeated.add(value) : seen.add(value)
  return [...repeated].sort()
}

function validateUnique(items, key, label, diagnostics) {
  for (const value of duplicates(items.map((item) => item?.[key]).filter(Boolean))) {
    diagnostics.push(contractRule('duplicate-id', label, `Duplicate ${label} identifier: ${value}`, 'critical', 'unique', value))
  }
}

function sourceRelativeExcludes(source) {
  const sourcePath = relativePath(source.path, `source ${source.id} path`)
  const raw = source.excludes || []
  if (!Array.isArray(raw)) throw new Error(`source ${source.id} excludes must be an array`)
  if (JSON.stringify(raw) !== JSON.stringify([...new Set(raw)].sort())) {
    throw new Error(`source ${source.id} excludes must be sorted and unique`)
  }
  const absoluteExcludes = raw.map((value, index) => {
    if (typeof value !== 'string' || !value.endsWith('/') || value.includes('\\') || value.includes('\0')) {
      throw new Error(`source ${source.id} exclusion ${index} must be a repository-relative POSIX directory ending in /`)
    }
    const exclusion = relativePath(value, `source ${source.id} exclusion ${index}`)
    if (exclusion === sourcePath || !exclusion.startsWith(`${sourcePath}/`)) {
      throw new Error(`source ${source.id} exclusion is outside its source tree:${value}`)
    }
    return exclusion
  })
  for (let left = 0; left < absoluteExcludes.length; left += 1) for (let right = left + 1; right < absoluteExcludes.length; right += 1) {
    if (absoluteExcludes[right].startsWith(`${absoluteExcludes[left]}/`)) {
      throw new Error(`source ${source.id} exclusions overlap:${raw[left]}:${raw[right]}`)
    }
  }
  return absoluteExcludes.map(exclusion => relative(sourcePath, exclusion).replaceAll('\\', '/'))
}

function resolveRegisteredMaterializer(providerRegistry, kind, materializerId) {
  const catalog = providerRegistry?.canonical?.materializers?.[kind]
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || typeof materializerId !== 'string' || !Object.hasOwn(catalog, materializerId)) {
    throw new Error(`${kind} materializer is unregistered:${String(materializerId)}`)
  }
  const materializer = catalog[materializerId]
  if (!materializer || typeof materializer !== 'object' || Array.isArray(materializer)) throw new Error(`${kind} materializer is invalid:${materializerId}`)
  return materializer
}

function providerHookInvocations(config, materializer) {
  const invocations = []
  const malformed = []
  if (materializer.engine === 'json-hook-map-v1') {
    const eventMap = config?.[materializer.hooksField]
    if (!eventMap || typeof eventMap !== 'object' || Array.isArray(eventMap)) return { invocations, malformed: ['hook map is missing'] }
    for (const [event, groups] of Object.entries(eventMap)) {
      if (!Array.isArray(groups)) { malformed.push(`${event}:groups`); continue }
      for (const [groupIndex, group] of groups.entries()) {
        if (!Array.isArray(group?.hooks)) { malformed.push(`${event}:${groupIndex}:hooks`); continue }
        if (group.hooks.length !== 1) malformed.push(`${event}:${groupIndex}:handler-count`)
        for (const [handlerIndex, handler] of group.hooks.entries()) {
          if (handler?.type !== 'command' || typeof handler.command !== 'string') malformed.push(`${event}:${groupIndex}:${handlerIndex}:command`)
          else invocations.push({ event, groupIndex, transport: 'command-string', value: handler.command })
        }
      }
    }
    return { invocations, malformed }
  }
  if (materializer.engine === 'json-hook-event-list-v1') {
    const events = config?.[materializer.eventsField]
    if (!Array.isArray(events)) return { invocations, malformed: ['event list is missing'] }
    for (const [eventIndex, record] of events.entries()) {
      const event = record?.[materializer.eventField]
      const groups = record?.[materializer.groupsField]
      if (typeof event !== 'string' || !Array.isArray(groups)) { malformed.push(`${eventIndex}:event/groups`); continue }
      for (const [groupIndex, group] of groups.entries()) {
        const handlers = group?.[materializer.handlersField]
        if (!Array.isArray(handlers)) { malformed.push(`${event}:${groupIndex}:handlers`); continue }
        if (handlers.length !== 1) malformed.push(`${event}:${groupIndex}:handler-count`)
        for (const [handlerIndex, handler] of handlers.entries()) {
          const argv = handler?.[materializer.handlerArgvField]
          if (!Array.isArray(argv) || !argv.every((token) => typeof token === 'string')) malformed.push(`${event}:${groupIndex}:${handlerIndex}:argv`)
          else invocations.push({ event, groupIndex, transport: 'structured-argv', value: argv })
        }
      }
    }
    return { invocations, malformed }
  }
  throw new Error(`unsupported hook materializer engine:${materializer.engine}`)
}

async function loadProviderHookGroupLaunchBuilder(repoRoot) {
  const modulePath = resolveWithin(
    repoRoot,
    PROVIDER_HOOK_OUTPUT_TRANSPORT,
    'provider hook output transport',
  )
  await assertRegularFileWithin(repoRoot, modulePath, 'provider hook output transport')
  const moduleBody = await readFile(modulePath, 'utf8')
  const moduleUrl = `${pathToFileURL(modulePath).href}?governance-hook-launch=${digest(moduleBody).slice(7)}`
  const loaded = await import(moduleUrl)
  if (typeof loaded.buildProviderHookGroupLaunchArgv !== 'function') {
    throw new Error('provider hook output transport has no event-group launch builder')
  }
  return loaded.buildProviderHookGroupLaunchArgv
}

function expectedProviderHookInvocation(invocation, provider, buildProviderHookGroupLaunchArgv) {
  const argv = buildProviderHookGroupLaunchArgv({
    provider,
    nativeEvent: invocation.event,
    groupIndex: invocation.groupIndex,
  })
  return {
    event: invocation.event,
    groupIndex: invocation.groupIndex,
    transport: invocation.transport,
    value: invocation.transport === 'command-string' ? argv.join(' ') : argv,
  }
}

function isExactProviderHookInvocation(invocation, expected) {
  if (invocation.transport !== expected.transport) return false
  if (invocation.transport === 'command-string') return invocation.value === expected.value
  if (invocation.transport === 'structured-argv') {
    return invocation.value.length === expected.value.length
      && invocation.value.every((token, index) => token === expected.value[index])
  }
  return false
}

async function expectedInstructionProjection({ repoRoot, provider, materializer }) {
  if (materializer.engine === 'shared-instruction-v1') {
    if (provider.instructionEntry !== provider.sharedInstructionEntry || provider.adapter.repositoryInstructionSource !== null) {
      throw new Error('shared-instruction-v1 requires one shared entry and forbids a supplement')
    }
    return null
  }
  if (materializer.engine !== 'markdown-relative-at-import-v1') throw new Error(`unsupported instruction materializer engine:${materializer.engine}`)
  if (provider.instructionEntry === provider.sharedInstructionEntry) throw new Error('relative import requires a distinct instruction entry')
  const importPath = relative(dirname(provider.instructionEntry), provider.sharedInstructionEntry).replaceAll('\\', '/')
  if (!importPath || importPath.includes('\0') || importPath.includes('\n') || importPath.includes('\r')) throw new Error('relative instruction import path is unsafe')
  let supplement = ''
  if (provider.adapter.repositoryInstructionSource !== null) {
    const source = resolveWithin(repoRoot, provider.adapter.repositoryInstructionSource, `${provider.id} repositoryInstructionSource`)
    await assertRegularFileWithin(repoRoot, source, `${provider.id} repositoryInstructionSource`)
    supplement = await readFile(source, 'utf8')
    if (/^\s*@[A-Za-z0-9_./@-]+\.md\s*$/mu.test(supplement)) throw new Error('instruction supplement embeds an import directive')
  } else if (materializer.supplementPolicy === 'required') {
    throw new Error('instruction materializer requires a supplement')
  }
  return `@${importPath}\n${supplement ? `\n${supplement}` : ''}`
}

async function validateProviderWiring({ repoRoot, role, providers, providerRegistry, sourcePaths, diagnostics }) {
  if (!role) return
  for (const providerId of role.requiredProviders || []) {
    const provider = providers.find((item) => item.id === providerId)
    if (!provider) continue
    const authorityPointers = [
      ['sharedInstructionEntry', provider.sharedInstructionEntry],
      ['repositoryInstructionSource', provider.adapter?.repositoryInstructionSource],
      ['hookEntrypoint', provider.hookEntrypoint],
    ]
    for (const [field, authority] of authorityPointers) {
      if (authority && !sourcePaths.has(authority)) {
        diagnostics.push(contractRule('provider-path-unbound', `${provider.id}:${field}`, `Provider ${field} authority must be a digest-locked canonical source.`, 'critical', 'manifest.sources entry', authority))
      }
    }

    try {
      const instructionMaterializer = resolveRegisteredMaterializer(providerRegistry, 'instructionViews', provider.adapter?.instructionView?.materializerId)
      const instruction = resolveWithin(repoRoot, provider.instructionEntry, `${provider.id} instructionEntry`)
      const shared = resolveWithin(repoRoot, provider.sharedInstructionEntry, `${provider.id} sharedInstructionEntry`)
      await assertRegularFileWithin(repoRoot, instruction, `${provider.id} instructionEntry`)
      await assertRegularFileWithin(repoRoot, shared, `${provider.id} sharedInstructionEntry`)
      const expected = await expectedInstructionProjection({ repoRoot, provider, materializer: instructionMaterializer })
      if (expected !== null) {
        const actual = await readFile(instruction, 'utf8')
        if (actual !== expected) diagnostics.push(contractRule('provider-instruction-projection-drift', provider.instructionEntry, `${provider.id} instruction view differs from its registered materializer projection.`, 'critical', expected, actual))
      }
    } catch (error) {
      diagnostics.push(contractRule('provider-instruction-invalid', provider.instructionEntry || provider.id, `Provider instruction wiring is invalid: ${error.message}`))
    }

    try {
      const skillDirectory = resolveWithin(repoRoot, provider.skillDirectory, `${provider.id} skillDirectory`)
      await assertNoSymlinkWithin(repoRoot, skillDirectory, `${provider.id} skillDirectory`, { allowMissing: false })
      const info = await lstat(skillDirectory)
      if (!info.isDirectory()) throw new Error('skillDirectory must be a regular directory')
    } catch (error) {
      diagnostics.push(contractRule('provider-skill-directory-invalid', provider.skillDirectory || provider.id, `Provider skill discovery directory is invalid: ${error.message}`))
    }

    if (!provider.capabilities?.nativeHooks) {
      if (provider.hookConfig !== null || provider.hookConfigFormat !== null || provider.hookEntrypoint !== null) {
        diagnostics.push(contractRule('provider-hook-capability-mismatch', provider.id, 'A provider without native hooks must not declare native hook wiring.'))
      }
      continue
    }
    if (!provider.hookConfig || provider.hookConfigFormat !== 'json' || !provider.hookEntrypoint) {
      diagnostics.push(contractRule('provider-hook-wiring-missing', provider.id, 'A native-hook provider requires a JSON hook config and shared hook entrypoint.'))
      continue
    }
    try {
      const hookConfig = resolveWithin(repoRoot, provider.hookConfig, `${provider.id} hookConfig`)
      const hookEntrypoint = resolveWithin(repoRoot, provider.hookEntrypoint, `${provider.id} hookEntrypoint`)
      await assertRegularFileWithin(repoRoot, hookConfig, `${provider.id} hookConfig`)
      await assertRegularFileWithin(repoRoot, hookEntrypoint, `${provider.id} hookEntrypoint`)
      const entrypointInfo = await lstat(hookEntrypoint)
      if ((entrypointInfo.mode & 0o111) === 0) throw new Error('shared hook entrypoint is not executable')
      const materializer = resolveRegisteredMaterializer(providerRegistry, 'hookViews', provider.adapter.hookView.materializerId)
      const config = JSON.parse(await readFile(hookConfig, 'utf8'))
      const { invocations, malformed } = providerHookInvocations(config, materializer)
      const buildProviderHookGroupLaunchArgv = await loadProviderHookGroupLaunchBuilder(repoRoot)
      const expectedInvocations = invocations.map((invocation) => expectedProviderHookInvocation(
        invocation,
        provider,
        buildProviderHookGroupLaunchArgv,
      ))
      const wired = invocations.length > 0
        && malformed.length === 0
        && invocations.every((invocation, index) => isExactProviderHookInvocation(invocation, expectedInvocations[index]))
      if (!wired) {
        diagnostics.push(contractRule(
          'provider-hook-entrypoint-missing',
          provider.hookConfig,
          `${provider.id} hook config does not invoke the shared provider-normalized entrypoint through the exact transport declared by its materializer.`,
          'critical',
          expectedInvocations,
          { invocations, malformed },
        ))
      }
    } catch (error) {
      diagnostics.push(contractRule('provider-hook-config-invalid', provider.hookConfig, `Provider hook wiring is invalid: ${error.message}`))
    }
  }
}

async function schemaPointerDigest(registry, label, diagnostics) {
  const pointer = registry.body?.$schema
  if (!pointer || !registry.path) {
    diagnostics.push(contractRule('schema-pointer-missing', registry.path || '', 'Registry has no $schema pointer.'))
    return null
  }
  try {
    const schemaPath = resolve(dirname(registry.path), relativePath(pointer, `${label} schema`))
    await assertRegularFileWithin(dirname(registry.path), schemaPath, `${label} schema`)
    const schema = await readJson(schemaPath)
    return digest(stableJson(schema))
  } catch (error) {
    diagnostics.push(contractRule('schema-read-error', pointer, `Cannot read ${label} schema: ${error.message}`))
    return null
  }
}

async function validateDocumentSchema(body, documentPath, label, diagnostics) {
  const pointer = body?.$schema
  if (!pointer) return
  try {
    const schemaPath = resolve(dirname(documentPath), relativePath(pointer, `${label} schema`))
    await assertRegularFileWithin(dirname(documentPath), schemaPath, `${label} schema`)
    const schema = await readJson(schemaPath)
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    if (!validate(body)) {
      diagnostics.push(contractRule(
        'schema-validation-failed',
        documentPath,
        `${label} violates its JSON Schema: ${ajv.errorsText(validate.errors, { separator: '; ' })}`,
        'critical',
        'schema-valid',
        validate.errors,
      ))
    }
  } catch (error) {
    diagnostics.push(contractRule('schema-validation-error', documentPath, `Cannot validate ${label} against its JSON Schema: ${error.message}`))
  }
}

async function artifactSchemaDigests(manifestDirectory, manifest, diagnostics) {
  const records = {}
  const configured = manifest.artifactSchemas || {}
  for (const name of ['diagnostic', 'lock', 'attestation', 'upgradePlan']) {
    if (!configured[name]) diagnostics.push(contractRule('artifact-schema-missing', `artifactSchemas.${name}`, `Manifest must register the ${name} artifact schema.`))
  }
  for (const [name, pointer] of Object.entries(configured)) {
    try {
      const path = resolve(manifestDirectory, relativePath(pointer, `artifactSchemas.${name}`))
      await assertRegularFileWithin(manifestDirectory, path, `artifactSchemas.${name}`)
      const schema = await readJson(path)
      const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
      addFormats(ajv)
      ajv.compile(schema)
      records[name] = digest(stableJson(schema))
    } catch (error) {
      diagnostics.push(contractRule('schema-read-error', pointer || name, `Cannot read or compile ${name} artifact schema: ${error.message}`))
    }
  }
  return canonicalize(records)
}

export async function assertArtifactSchema(contract, name, value) {
  const manifestDirectory = dirname(contract.manifestPath)
  const pointer = contract.manifest?.artifactSchemas?.[name]
  if (typeof pointer !== 'string' || pointer.length === 0) throw new Error(`Artifact schema is not registered: ${name}`)
  const path = resolve(manifestDirectory, relativePath(pointer, `artifactSchemas.${name}`))
  await assertRegularFileWithin(manifestDirectory, path, `artifactSchemas.${name}`)
  const schema = await readJson(path)
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (!validate(value)) {
    throw new Error(`${name} artifact violates its JSON Schema: ${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  }
  return true
}

function resolveRoleProviderSelection(role, providers) {
  if (!role) return role
  const requiredProviders = role.providerSelection === 'all-registered'
    ? providers.map((provider) => provider.id).sort()
    : []
  return { ...role, requiredProviders }
}

function resolveRuleProviderCoverage(rule, providers) {
  const classification = rule.providerCoverage?.['*']
  const providerCoverage = classification
    ? Object.fromEntries(providers.map((provider) => [provider.id, classification]).sort(([left], [right]) => compareUtf8Bytes(left, right)))
    : {}
  return { ...rule, providerCoverage }
}

function resolveSkillParityTargets(item, providerRegistry) {
  const providers = Array.isArray(providerRegistry?.providers) ? providerRegistry.providers : []
  const targets = item.targetSelection === 'all-generated-skill-views'
    ? providers
      .filter((provider) => provider.adapter?.generate && provider.adapter?.skillView)
      .map((provider) => {
        const materializer = providerRegistry.canonical?.materializers?.skillViews?.[provider.adapter.skillView.materializerId]
        return {
          provider: provider.id,
          targetDirectory: provider.adapter.skillView.directory,
          entryFile: materializer?.entryFile || null,
          requiredTargetExtras: [...new Set((provider.adapter.skillAliases || []).map((alias) => alias.name))].sort(),
          allowUnexpectedTargetExtras: false,
        }
      })
      .sort((left, right) => compareUtf8Bytes(left.provider, right.provider))
    : []
  return { ...item, targets }
}

export async function inspectContract({
  repoRoot = process.cwd(),
  manifestPath = DEFAULT_MANIFEST,
  role: roleOverride,
  outputDirectory: outputOverride,
  lockFile: lockOverride,
  verifySources = true,
} = {}) {
  const diagnostics = []
  let manifest
  const absoluteManifest = resolve(manifestPath)
  try {
    await assertRegularFileWithin(dirname(absoluteManifest), absoluteManifest, 'manifest')
    manifest = await readJson(absoluteManifest)
  } catch (error) {
    diagnostics.push(contractRule('manifest-read-error', absoluteManifest, `Cannot read canonical manifest: ${error.message}`))
    return { contract: null, diagnostics }
  }

  const manifestDirectory = dirname(absoluteManifest)
  const registryEntries = {}
  await validateDocumentSchema(manifest, absoluteManifest, 'manifest', diagnostics)
  const schemaDigests = {}
  schemaDigests.manifest = await schemaPointerDigest({ body: manifest, path: absoluteManifest }, 'manifest', diagnostics)
  for (const name of ['rules', 'roles', 'providers', 'gates']) {
    registryEntries[name] = await readRegistry(manifestDirectory, manifest.registries?.[name], name, diagnostics)
    if (registryEntries[name].path) await validateDocumentSchema(registryEntries[name].body, registryEntries[name].path, `${name} registry`, diagnostics)
    schemaDigests[name] = await schemaPointerDigest(registryEntries[name], name, diagnostics)
  }
  schemaDigests.artifacts = await artifactSchemaDigests(manifestDirectory, manifest, diagnostics)

  let outputDirectory
  let lockFile
  try {
    outputDirectory = relativePath(outputOverride || manifest.outputDirectory, 'outputDirectory')
    lockFile = relativePath(lockOverride || manifest.lockFile, 'lockFile')
    if (lockFile === outputDirectory || lockFile.startsWith(`${outputDirectory}/`)) {
      diagnostics.push(contractRule('unsafe-layout', lockFile, 'lockFile must be outside outputDirectory so the lock is not self-referential.'))
    }
    await assertNoSymlinkWithin(repoRoot, resolveWithin(repoRoot, outputDirectory, 'outputDirectory'), 'outputDirectory')
    await assertNoSymlinkWithin(repoRoot, resolveWithin(repoRoot, lockFile, 'lockFile'), 'lockFile')
  } catch (error) {
    diagnostics.push(contractRule('unsafe-path', '', error.message))
  }

  const rawRules = Array.isArray(registryEntries.rules.body?.rules) ? registryEntries.rules.body.rules : []
  const rawRoles = Array.isArray(registryEntries.roles.body?.roles) ? registryEntries.roles.body.roles : []
  const providers = Array.isArray(registryEntries.providers.body?.providers) ? registryEntries.providers.body.providers : []
  const gates = Array.isArray(registryEntries.gates.body?.gates) ? registryEntries.gates.body.gates : []
  const sources = Array.isArray(manifest.sources) ? manifest.sources : []
  const rawSkillParityContracts = Array.isArray(manifest.skillParityContracts) ? manifest.skillParityContracts : []
  const rules = rawRules.map((rule) => resolveRuleProviderCoverage(rule, providers))
  const roles = rawRoles.map((role) => resolveRoleProviderSelection(role, providers))
  const skillParityContracts = rawSkillParityContracts.map((item) => resolveSkillParityTargets(item, registryEntries.providers.body))

  validateUnique(rules, 'ruleId', 'rule', diagnostics)
  validateUnique(roles, 'id', 'role', diagnostics)
  validateUnique(providers, 'id', 'provider', diagnostics)
  validateUnique(gates, 'id', 'gate', diagnostics)
  validateUnique(sources, 'id', 'source', diagnostics)
  validateUnique(sources, 'path', 'source-path', diagnostics)
  validateUnique(skillParityContracts, 'id', 'skill-parity-contract', diagnostics)
  for (const source of sources) {
    try { sourceRelativeExcludes(source) } catch (error) {
      diagnostics.push(contractRule('canonical-source-exclusion', source.path || source.id, error.message))
    }
  }
  let carrierProjectionBindings = new Map()
  try {
    carrierProjectionBindings = governanceCarrierProjectionMap(sources)
    if (manifest.id === 'qijenchen-provider-neutral-governance') {
      assertCanonicalGovernanceCarrierProjectionMap(carrierProjectionBindings)
    }
  } catch (error) {
    diagnostics.push(contractRule('canonical-source-carrier-projection', 'manifest.sources', error.message))
  }

  const roleId = roleOverride || manifest.defaultRole
  const role = roles.find((item) => item.id === roleId)
  if (!role) diagnostics.push(contractRule('unknown-role', roleId || '', `Role is not registered: ${roleId || '<empty>'}`))

  const providerIds = new Set(providers.map((item) => item.id))
  const gateIds = new Set(gates.map((item) => item.id))
  const sourceIds = new Set(sources.map((item) => item.id))
  if (role) {
    for (const id of role.requiredProviders || []) if (!providerIds.has(id)) diagnostics.push(contractRule('unknown-provider', id, `Role ${role.id} requires an unknown provider.`))
    for (const id of role.requiredGateIds || []) if (!gateIds.has(id)) diagnostics.push(contractRule('unknown-gate', id, `Role ${role.id} requires an unknown gate.`))
    for (const id of role.requiredSourceIds || []) if (!sourceIds.has(id)) diagnostics.push(contractRule('unknown-source', id, `Role ${role.id} requires an unknown canonical source.`))
  }
  const sourcePaths = new Set(sources.map((item) => item.path))
  const productSharedInstructionSource = registryEntries.providers.body?.canonical?.productSharedInstructionSource
  if (productSharedInstructionSource && !sourcePaths.has(productSharedInstructionSource)) {
    diagnostics.push(contractRule('provider-path-unbound', 'canonical:productSharedInstructionSource', 'Common product instruction authority must be a digest-locked canonical source.', 'critical', 'manifest.sources entry', productSharedInstructionSource))
  }
  for (const item of skillParityContracts) {
    for (const target of item.targets || []) {
      if (!providerIds.has(target.provider)) diagnostics.push(contractRule('unknown-provider', `${item.id}:${target.provider}`, 'Skill parity target provider is not registered.'))
    }
    if (item.projection?.module && !sourcePaths.has(item.projection.module)) diagnostics.push(contractRule('projection-source-unbound', item.projection.module, 'Skill projection module must also be a canonical source so its digest is locked.'))
  }
  await validateProviderWiring({ repoRoot, role, providers, providerRegistry: registryEntries.providers.body, sourcePaths, diagnostics })

  for (const gate of gates) {
    if (gate.hard && !gate.hookIndependent) diagnostics.push(contractRule('hook-dependent-hard-gate', gate.id, 'A hard gate must remain effective with native hooks disabled.'))
  }

  for (const rule of rules) {
    const applies = rule.appliesToRoles?.includes('*') || rule.appliesToRoles?.includes(roleId)
    if (!applies || !role) continue
    for (const providerId of role.requiredProviders || []) {
      const coverage = rule.providerCoverage?.[providerId]
      if (!coverage) diagnostics.push(contractRule('provider-coverage-missing', `${rule.ruleId}:${providerId}`, 'Applicable rule has no provider coverage classification.'))
      if (rule.severity === 'critical' && coverage === 'unsupported') diagnostics.push(contractRule('critical-provider-unsupported', `${rule.ruleId}:${providerId}`, 'Critical rule cannot be unsupported on a required provider.'))
    }
    for (const gateId of rule.gateIds || []) if (!gateIds.has(gateId)) diagnostics.push(contractRule('rule-gate-missing', `${rule.ruleId}:${gateId}`, 'Rule references an unknown hard gate.'))
    const sourceFile = String(rule.source || '').split('#')[0]
    if (sourceFile && verifySources && !(await exists(resolveWithin(repoRoot, sourceFile, `rule ${rule.ruleId} source`)))) diagnostics.push(contractRule('rule-source-missing', sourceFile, `Rule ${rule.ruleId} source pointer does not exist.`))
  }

  if (verifySources && role) {
    const required = new Set(role.requiredSourceIds || [])
    for (const source of sources) {
      if (!(source.required || required.has(source.id))) continue
      try {
        const absolute = resolveWithin(repoRoot, source.path, `source ${source.id}`)
        await assertNoSymlinkWithin(repoRoot, absolute, `source ${source.id}`)
        if (!(await exists(absolute))) diagnostics.push(contractRule('canonical-source-missing', source.path, `Required canonical source is missing: ${source.id}`))
        else if ((source.excludes || []).length && !(await lstat(absolute)).isDirectory()) {
          diagnostics.push(contractRule('canonical-source-exclusion', source.path, `Source exclusions require a directory source: ${source.id}`))
        }
      } catch (error) {
        diagnostics.push(contractRule('canonical-source-path', source.path || source.id, error.message))
      }
    }
  }

  const contractPayload = {
    manifest: canonicalize(manifest),
    registries: canonicalize(Object.fromEntries(Object.entries(registryEntries).map(([name, entry]) => [name, entry.body]))),
    role: roleId,
    outputDirectory,
    lockFile,
    schemaDigests,
  }
  const contract = {
    repoRoot: resolve(repoRoot),
    manifestPath: absoluteManifest,
    manifest,
    rules,
    roles,
    providers,
    gates,
    sources,
    carrierProjectionBindings,
    skillParityContracts,
    role,
    roleId,
    outputDirectory,
    lockFile,
    registryDigests: canonicalize(Object.fromEntries(Object.entries(registryEntries).map(([name, entry]) => [name, entry.hash]))),
    schemaDigests: canonicalize(schemaDigests),
    contractDigest: digest(contractPayload),
  }
  return { contract, diagnostics }
}

// Index-authoritative verification window (see canonical-sync-transaction index publishing): a
// generated provider view whose live working tree is sandbox-denied is validated against the Git
// INDEX for exactly the repo-relative prefixes the running transaction declares via this env var.
// Outside that window every read stays disk-based, so on-disk tamper detection is unchanged.
function indexAuthorityPrefixes() {
  try {
    const parsed = JSON.parse(process.env.GOVERNANCE_INDEX_AUTHORITATIVE_PATHS || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch { return [] }
}

function indexInventoryTree(repoRoot, relDirectory) {
  const listing = execFileSync('git', ['ls-files', '-s', '-z', '--', relDirectory], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const entries = []
  for (const record of listing.split('\0').filter(Boolean)) {
    const match = record.match(/^(\d{6}) ([0-9a-f]{40,64}) \d\t(.+)$/)
    if (!match) throw new Error(`index inventory could not parse: ${record}`)
    const [, indexMode, blob, fullPath] = match
    const rel = fullPath === relDirectory ? '' : fullPath.slice(relDirectory.length + 1)
    const body = execFileSync('git', ['cat-file', 'blob', blob], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    if (indexMode === '120000') {
      const target = body.toString('utf8')
      entries.push({ path: rel, type: 'symlink', mode: '755', hash: digest(target), target })
      continue
    }
    entries.push({
      path: rel,
      type: 'file',
      mode: indexMode === '100755' ? '755' : '644',
      hash: digest(body),
      size: body.length,
    })
  }
  entries.sort((a, b) => compareUtf8Bytes(a.path, b.path))
  return entries
}

async function indexAwareInventoryTree(repoRoot, absoluteRoot) {
  const rel = relative(repoRoot, absoluteRoot).split('\\').join('/')
  const windowed = indexAuthorityPrefixes().some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
  return windowed ? indexInventoryTree(repoRoot, rel) : inventoryTree(absoluteRoot)
}

export async function sourceRecords(contract) {
  const records = []
  const bindings = contract.carrierProjectionBindings instanceof Map
    ? contract.carrierProjectionBindings
    : governanceCarrierProjectionMap(contract.sources)
  for (const source of contract.sources) {
    const absolute = resolveWithin(contract.repoRoot, source.path, `source ${source.id}`)
    if (!(await exists(absolute))) continue
    await assertNoSymlinkWithin(contract.repoRoot, absolute, `source ${source.id}`, { allowMissing: false })
    const info = await lstat(absolute)
    if (info.isDirectory()) {
      const excludes = sourceRelativeExcludes(source)
      const sourcePath = source.path.replace(/\/+$/, '')
      const carrierProjections = governanceCarrierProjectionsForSource(source, bindings)
      const entries = await inventoryTree(absolute, {
        excludes,
        projectFile: ({ path, bytes }) => {
          const repositoryPath = `${sourcePath}/${path}`
          const binding = bindings.get(repositoryPath)
          return binding
            ? projectGovernanceCarrierBytes({
              path: repositoryPath,
              projectionId: binding.projection,
              bytes,
            })
            : bytes
        },
      })
      records.push({
        id: source.id,
        ownerRepo: source.ownerRepo,
        path: source.path,
        excludes: [...(source.excludes || [])],
        type: 'directory',
        mode: modeString(info.mode),
        hash: treeDigest(entries),
        files: entries.length,
        carrierProjections,
      })
    } else if (info.isFile()) {
      const body = await readFile(absolute)
      const binding = bindings.get(source.path)
      const projected = binding
        ? projectGovernanceCarrierBytes({
          path: source.path,
          projectionId: binding.projection,
          bytes: body,
        })
        : body
      records.push({
        id: source.id,
        ownerRepo: source.ownerRepo,
        path: source.path,
        type: 'file',
        mode: modeString(info.mode),
        hash: digest(projected),
        size: projected.length,
        ...(binding ? { carrierProjection: binding.projection } : {}),
      })
    }
  }
  return records.sort((a, b) => compareUtf8Bytes(a.id, b.id))
}

async function skillNames(directory, entryFile = 'SKILL.md') {
  if (!(await exists(directory))) return []
  if (typeof entryFile !== 'string' || !entryFile || entryFile.includes('/') || entryFile.includes('\\')) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const names = []
  for (const entry of entries) {
    if (entry.isDirectory() && await exists(resolve(directory, entry.name, entryFile))) names.push(entry.name)
  }
  return names.sort()
}

async function loadSkillProjection(contract, item, diagnostics) {
  if (!item.projection) return null
  let modulePath
  try {
    modulePath = resolveWithin(contract.repoRoot, item.projection.module, `skill parity ${item.id} projection.module`)
    await assertRegularFileWithin(contract.repoRoot, modulePath, `skill parity ${item.id} projection.module`)
    const moduleBody = await readFile(modulePath)
    const moduleUrl = `${pathToFileURL(modulePath).href}?governance=${digest(moduleBody).slice(7)}`
    const namespace = await import(moduleUrl)
    const projector = namespace[item.projection.export]
    if (typeof projector !== 'function') throw new TypeError(`export ${item.projection.export} is not a function`)
    return { projector, files: new Set(item.projection.files || []) }
  } catch (error) {
    diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-projection-invalid', path: item.projection.module || item.id, message: `Cannot load canonical skill projection: ${error.message}` }))
    return false
  }
}

async function projectedInventory(contract, item, target, skillName, sourceDirectory, entries, projection, diagnostics) {
  const projected = []
  for (const entry of entries) {
    const targetPath = entry.path === 'SKILL.md' ? target.entryFile : entry.path
    if (!projection || entry.type !== 'file' || !projection.files.has(entry.path)) {
      projected.push({ ...entry, path: targetPath })
      continue
    }
    const sourceRel = `${item.sourceDirectory}/${skillName}/${entry.path}`
    try {
      const content = await readFile(resolve(sourceDirectory, skillName, entry.path), 'utf8')
      const output = await projection.projector(content, sourceRel, target.provider)
      if (typeof output !== 'string' && !Buffer.isBuffer(output)) throw new TypeError('projection must return a string or Buffer')
      const body = Buffer.isBuffer(output) ? output : Buffer.from(output)
      projected.push({ ...entry, path: targetPath, hash: digest(body), size: body.length })
    } catch (error) {
      diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-projection-error', path: sourceRel, message: `Canonical skill projection failed: ${error.message}` }))
      return null
    }
  }
  return projected
}

export async function inspectSkillParity(contract) {
  const diagnostics = []
  const records = []
  for (const item of contract.skillParityContracts) {
    let sourceDirectory
    try {
      sourceDirectory = resolveWithin(contract.repoRoot, item.sourceDirectory, `skill parity ${item.id} sourceDirectory`)
      await assertNoSymlinkWithin(contract.repoRoot, sourceDirectory, `skill parity ${item.id} sourceDirectory`)
    } catch (error) {
      diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-path-invalid', path: item.id, message: error.message }))
      continue
    }
    if (item.required && !(await exists(sourceDirectory))) diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-source-missing', path: item.sourceDirectory, message: 'Canonical skill directory is missing.' }))
    const sourceNames = await skillNames(sourceDirectory, 'SKILL.md')
    const projection = await loadSkillProjection(contract, item, diagnostics)
    for (const target of item.targets || []) {
      if (typeof target.entryFile !== 'string' || !target.entryFile || target.entryFile.includes('/') || target.entryFile.includes('\\')) {
        diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-materializer-invalid', path: `${item.id}:${target.provider}`, message: 'Provider skill materializer must resolve one safe entry file.' }))
        continue
      }
      let targetDirectory
      try {
        targetDirectory = resolveWithin(contract.repoRoot, target.targetDirectory, `skill parity ${item.id}:${target.provider} targetDirectory`)
        await assertNoSymlinkWithin(contract.repoRoot, targetDirectory, `skill parity ${item.id}:${target.provider} targetDirectory`)
      } catch (error) {
        diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-path-invalid', path: `${item.id}:${target.provider}`, message: error.message }))
        continue
      }
      if (item.required && !(await exists(targetDirectory))) diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-target-missing', path: target.targetDirectory, message: 'Provider skill directory is missing.' }))
      const targetNames = await skillNames(targetDirectory, target.entryFile)
      const extras = [...(target.requiredTargetExtras || [])].sort()
      const requiredTarget = unique([...sourceNames, ...extras]).sort()
      const missing = requiredTarget.filter((name) => !targetNames.includes(name))
      const unexpected = targetNames.filter((name) => !requiredTarget.includes(name))
      for (const name of missing) diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'skill-missing', path: `${target.targetDirectory}/${name}`, expected: 'present', actual: 'missing', message: `Required ${target.provider} skill is missing.` }))
      if (!target.allowUnexpectedTargetExtras) {
        for (const name of unexpected) diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'major', kind: 'skill-extra', path: `${target.targetDirectory}/${name}`, expected: null, actual: 'present', message: `Unexpected ${target.provider} skill is not classified by the parity contract.` }))
      }
      const sharedDigests = []
      if (item.compare !== 'names') {
        for (const name of sourceNames.filter((value) => targetNames.includes(value))) {
          const source = await inventoryTree(resolve(sourceDirectory, name))
          const expected = projection === false ? null : await projectedInventory(contract, item, target, name, sourceDirectory, source, projection, diagnostics)
          const targetAbsolute = resolve(targetDirectory, name)
          let actual = await indexAwareInventoryTree(contract.repoRoot, targetAbsolute)
          if (!expected) continue
          // Inside an index-authoritative window, adopt the expected entry's mode wherever the
          // content hash already matches: the Git index can only say 644/755, while the expected
          // side carries local-FS mode bits — the digests baked into the control-plane lock were
          // computed from those expected modes at generation time, so this keeps targetDigest
          // byte-identical to the workspace computation instead of drifting on representation.
          const windowRel = relative(contract.repoRoot, targetAbsolute).split('\\').join('/')
          const windowActive = indexAuthorityPrefixes().some((prefix) => windowRel === prefix || windowRel.startsWith(`${prefix}/`))
          if (windowActive) {
            const expectedByPath = new Map(expected.map((entry) => [entry.path, entry]))
            actual = actual.map((entry) => {
              const wanted = expectedByPath.get(entry.path)
              return wanted && wanted.hash === entry.hash ? { ...entry, mode: wanted.mode } : entry
            })
          }
          let differences = compareInventories(expected, actual, { prefix: `${target.targetDirectory}/${name}`, ruleId: 'GOV-PROVIDER-001' })
          if (item.compare === 'content') differences = differences.filter((entry) => entry.evidence.kind !== 'mode-mismatch')
          diagnostics.push(...differences)
          sharedDigests.push({ name, sourceDigest: treeDigest(source), expectedTargetDigest: treeDigest(expected), targetDigest: treeDigest(actual) })
        }
      }
      records.push({
        id: `${item.id}:${target.provider}`,
        sourceProvider: 'canonical',
        targetProvider: target.provider,
        sourceDirectory: item.sourceDirectory,
        targetDirectory: target.targetDirectory,
        compare: item.compare,
        projection: item.projection || null,
        sourceSkills: sourceNames,
        targetSkills: targetNames,
        requiredTargetExtras: extras,
        targetEntryFile: target.entryFile,
        sharedDigests,
      })
    }
  }
  return { diagnostics, records }
}
