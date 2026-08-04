import { lstatSync, readFileSync, readlinkSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function repositoryPath(value, label) {
  invariant(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !isAbsolute(value), `${label} must be a repository-relative POSIX path`)
  invariant(value.split('/').every(segment => segment && segment !== '.' && segment !== '..'), `${label} contains an empty, dot, or parent segment`)
  return value
}

const under = (path, root) => path === root || path.startsWith(`${root}/`)

function assertAliasPathSafe(path, label) {
  repositoryPath(path, label)
  const first = path.split('/')[0]
  invariant(first !== '.git' && !['.gitmodules', '.gitattributes', '.gitignore'].includes(path), `${label} uses a VCS-reserved path:${path}`)
}

function readJsonFile(root, path, label) {
  const { base, absolute, rel } = within(root, path, label)
  let cursor = base
  const parts = rel.split(sep).filter(Boolean)
  for (const [index, part] of parts.entries()) {
    cursor = resolve(cursor, part)
    const info = lstatSync(cursor)
    invariant(!info.isSymbolicLink(), `${label} crosses a symbolic link:${relative(base, cursor).split(sep).join('/')}`)
    if (index < parts.length - 1) invariant(info.isDirectory(), `${label} parent is not a directory`)
    else invariant(info.isFile() && info.nlink === 1, `${label} must be one regular unaliased file`)
  }
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular unaliased file`)
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

function validateSchema(document, schema, label) {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(document), `${label} schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
}

function within(root, path, label) {
  const base = resolve(root)
  const absolute = resolve(path)
  const rel = relative(base, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the plugin root`)
  return { base, absolute, rel }
}

function assertRealDirectoryChain(root, directory, label) {
  const { base, absolute, rel } = within(root, directory, label)
  const rootInfo = lstatSync(base)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), `${label} plugin root must be a real directory`)
  let cursor = base
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part)
    const info = lstatSync(cursor)
    invariant(!info.isSymbolicLink(), `${label} destination crosses a symbolic link:${relative(base, cursor).split(sep).join('/')}`)
    invariant(info.isDirectory(), `${label} destination is not a directory:${relative(base, cursor).split(sep).join('/')}`)
  }
}

export function assertExactPluginAlias(root, {
  alias,
  target,
  requiredEntries = [],
} = {}) {
  repositoryPath(alias, 'plugin alias')
  invariant(typeof target === 'string' && target.length > 0 && !target.includes('\\') && !target.includes('\0') && !isAbsolute(target), 'plugin alias target must be an exact relative POSIX link target')
  const pluginRoot = resolve(root)
  const aliasPath = resolve(pluginRoot, alias)
  within(pluginRoot, aliasPath, `plugin alias ${alias}`)
  const aliasInfo = lstatSync(aliasPath)
  invariant(aliasInfo.isSymbolicLink(), `${alias} must be a symbolic link, not a copied or regular directory`)
  const actualTarget = readlinkSync(aliasPath)
  invariant(actualTarget === target, `${alias} target drifted: expected ${target}, got ${actualTarget}`)
  return assertPluginAliasDestination(root, { alias, target: actualTarget, requiredEntries })
}

export function assertPluginAliasDestination(root, {
  alias,
  target,
  requiredEntries = [],
} = {}) {
  repositoryPath(alias, 'plugin alias')
  invariant(typeof target === 'string' && target.length > 0 && !target.includes('\\') && !target.includes('\0') && !isAbsolute(target), 'plugin alias target must be an exact relative POSIX link target')
  const pluginRoot = resolve(root)
  const aliasPath = resolve(pluginRoot, alias)
  within(pluginRoot, aliasPath, `plugin alias ${alias}`)
  const destination = resolve(dirname(aliasPath), target)
  assertRealDirectoryChain(pluginRoot, destination, `plugin alias ${alias}`)
  const entries = new Set(readdirSync(destination))
  invariant(entries.size > 0, `${alias} destination is empty`)
  for (const entry of requiredEntries) {
    invariant(typeof entry === 'string' && entry.length > 0 && !entry.includes('/') && !entry.includes('\\'), `${alias} required entry is invalid`)
    invariant(entries.has(entry), `${alias} destination is missing ${entry}`)
    const info = lstatSync(resolve(destination, entry))
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${alias} required entry must be one regular unaliased file:${entry}`)
  }
  return {
    alias,
    target,
    destination: relative(pluginRoot, destination).split(sep).join('/'),
    entries: [...entries].sort(),
  }
}

export function resolvePluginAliasPlan(root, {
  registryPath = 'packages/governance/canonical/plugin-aliases.json',
  providersPath = 'packages/governance/canonical/providers.json',
  providersDocument = null,
} = {}) {
  const pluginRoot = resolve(root)
  const registryFile = resolve(pluginRoot, repositoryPath(registryPath, 'plugin alias registry path'))
  const providersFile = resolve(pluginRoot, repositoryPath(providersPath, 'provider registry path'))
  within(pluginRoot, registryFile, 'plugin alias registry')
  within(pluginRoot, providersFile, 'provider registry')
  const registry = readJsonFile(pluginRoot, registryFile, 'plugin alias registry')
  const providers = providersDocument || readJsonFile(pluginRoot, providersFile, 'provider registry')
  const aliasSchemaFile = resolve(dirname(registryFile), registry.$schema || '')
  const providerSchemaFile = resolve(dirname(providersFile), providers.$schema || '')
  within(pluginRoot, aliasSchemaFile, 'plugin alias schema')
  within(pluginRoot, providerSchemaFile, 'provider registry schema')
  validateSchema(registry, readJsonFile(pluginRoot, aliasSchemaFile, 'plugin alias schema'), 'plugin alias registry')
  validateSchema(providers, readJsonFile(pluginRoot, providerSchemaFile, 'provider registry schema'), 'provider registry')

  const transport = providers.canonical.compatibilityProjections.marketplacePluginTransport
  invariant(transport.aliasRegistry === registryPath, `marketplace plugin transport alias registry drifted:${transport.aliasRegistry}`)
  invariant(transport.providerId === registry.providerId, `marketplace plugin transport provider drifted:${transport.providerId}:${registry.providerId}`)
  const provider = providers.providers.find(candidate => candidate.id === registry.providerId)
  const retired = (providers.canonical.retiredProviders || []).some(candidate => candidate.id === registry.providerId)
  invariant(provider?.adapter?.generate === true || retired, `plugin alias provider is absent or not generated/retired:${registry.providerId}`)
  const ids = registry.aliases.map(record => record.id)
  invariant(JSON.stringify(ids) === JSON.stringify([...ids].sort()) && new Set(ids).size === ids.length, 'plugin aliases must be sorted and unique by id')
  const aliases = new Set()
  const records = registry.aliases.map(record => {
    const alias = repositoryPath(record.alias, `plugin alias ${record.id}`)
    assertAliasPathSafe(alias, `plugin alias ${record.id}`)
    invariant(!aliases.has(alias), `plugin alias path duplicated:${alias}`)
    invariant(![...aliases].some(other => alias.startsWith(`${other}/`) || other.startsWith(`${alias}/`)), `plugin alias paths overlap:${alias}`)
    aliases.add(alias)
    return { ...record, alias }
  })
  if (!provider?.adapter?.generate) {
    return { providerId: registry.providerId, active: false, aliases: records.map(record => record.alias), contracts: [] }
  }
  const contracts = records.map(record => {
    const { alias } = record
    let destination
    if (record.source.kind === 'repositoryManagedTree') {
      invariant(Object.hasOwn(provider.adapter.repositoryManagedTrees || {}, record.source.key), `plugin alias ${record.id} references an unknown repository managed tree:${record.source.key}`)
      destination = provider.adapter.repositoryManagedTrees[record.source.key]
    } else if (record.source.kind === 'canonicalRoot') {
      // Aliases the provider-neutral canonical corpus directly. Introduced when the `.claude/hooks`
      // mirror was retired (2026-08-04): the runtime dispatcher already reads the canonical root, so
      // the plugin layout links straight to it instead of shipping a second copy of every hook.
      invariant(Object.hasOwn(providers.canonical.roots || {}, record.source.key), `plugin alias ${record.id} references an unknown canonical root:${record.source.key}`)
      destination = providers.canonical.roots[record.source.key]
    } else {
      invariant(record.source.kind === 'skillView' && provider.adapter.skillView?.directory, `plugin alias ${record.id} has no provider skill view`)
      destination = provider.adapter.skillView.directory
    }
    destination = repositoryPath(destination, `plugin alias ${record.id} destination`)
    assertAliasPathSafe(destination, `plugin alias ${record.id} destination`)
    const target = relative(dirname(resolve(pluginRoot, alias)), resolve(pluginRoot, destination)).split(sep).join('/')
    invariant(target && !isAbsolute(target), `plugin alias ${record.id} has an invalid derived target`)
    invariant(JSON.stringify(record.requiredEntries) === JSON.stringify([...record.requiredEntries].sort()), `plugin alias ${record.id} requiredEntries must be sorted`)
    return { id: record.id, alias, target, destination, requiredEntries: [...record.requiredEntries] }
  })
  for (const contract of contracts) for (const other of contracts) {
    invariant(!under(contract.alias, other.destination) && !under(other.destination, contract.alias), `plugin alias and canonical destination overlap:${contract.alias}:${other.destination}`)
  }
  return { providerId: registry.providerId, active: true, aliases: records.map(record => record.alias), contracts }
}

export function resolvePluginAliasContracts(root, options = {}) {
  return resolvePluginAliasPlan(root, options).contracts
}

export function validateClaudePluginAliases(root) {
  return resolvePluginAliasContracts(root).map(contract => assertExactPluginAlias(root, contract))
}
