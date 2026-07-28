import { isAbsolute } from 'node:path'
import {
  compareUtf8Bytes,
  resolveProviderMaterializer,
} from './provider-runtime-contract.mjs'

export const PRODUCT_TEMPLATE_PROJECTION_ROOT = 'template/ds-product-template'
export const CLOSED_TREE_MATERIALIZER_ENGINE = 'closed-tree-copy-v1'
export const CLOSED_TREE_TRANSFORM_POLICY = 'byte-exact'
export const SHARED_INSTRUCTION_MATERIALIZER_ID = 'shared-instruction-v1'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export function providerProjectionPath(value, label) {
  invariant(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !isAbsolute(value), `${label} must be a repository-relative POSIX path`)
  invariant(!value.endsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..'), `${label} contains an unsafe segment:${value}`)
  return value
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} has an open or incomplete shape`)
  return value
}

function productManagedTree(registry, provider, name, value) {
  const label = `${provider.id}.adapter.productManagedTrees.${name}`
  exactKeys(value, ['sourceRoot', 'destination', 'materializerId', 'transformPolicy'], label)
  providerProjectionPath(value.sourceRoot, `${label}.sourceRoot`)
  providerProjectionPath(value.destination, `${label}.destination`)
  const materializer = resolveProviderMaterializer(
    registry,
    'treeViews',
    value.materializerId,
    `${label}.materializerId`,
  )
  invariant(
    materializer.engine === CLOSED_TREE_MATERIALIZER_ENGINE,
    `${label}.materializerId resolves to an unsupported engine:${materializer.engine || '<missing>'}`,
  )
  invariant(
    value.transformPolicy === CLOSED_TREE_TRANSFORM_POLICY
      && Array.isArray(materializer.transformPolicies)
      && materializer.transformPolicies.includes(value.transformPolicy),
    `${label}.transformPolicy is unsupported:${value.transformPolicy}`,
  )
  return value
}

function instructionOwnershipPolicy(registry, provider) {
  const materializer = resolveProviderMaterializer(
    registry,
    'instructionViews',
    provider?.adapter?.instructionView?.materializerId,
    `${provider?.id || '<missing>'}.adapter.instructionView.materializerId`,
  )
  invariant(
    ['common-authority-consumer', 'provider-generated-projection'].includes(materializer.ownershipPolicy),
    `${provider.id}.adapter.instructionView.materializerId has an unsupported ownership policy:${materializer.ownershipPolicy || '<missing>'}`,
  )
  return materializer.ownershipPolicy
}

function projectionDeclarations(registry, scope) {
  invariant(Array.isArray(registry?.providers), 'provider registry must contain providers')
  invariant(scope === 'repository' || scope === 'product', `provider projection scope is invalid:${scope}`)
  const declarations = new Map()
  const add = (provider, path, kind, surface) => {
    providerProjectionPath(path, `${provider.id}.${surface}`)
    invariant(kind === 'file' || kind === 'tree', `${provider.id}.${surface} has an invalid projection kind`)
    const prior = declarations.get(path)
    invariant(!prior, prior
      ? `provider projection path has multiple owners:${scope}:${path}:${prior.provider}:${provider.id}`
      : `provider projection path is duplicated:${scope}:${path}`)
    declarations.set(path, { path, kind, provider: provider.id, surface })
  }
  for (const provider of registry.providers) {
    const adapter = provider?.adapter
    if (!adapter?.generate) continue
    invariant(typeof provider.id === 'string' && provider.id.length > 0, `generated ${scope} provider projection has no provider id`)
    // Ownership is a registered materializer contract, not an engine/id convention. That keeps a
    // future common-instruction consumer out of provider retirement/tombstone ownership.
    const ownsInstruction = instructionOwnershipPolicy(registry, provider) === 'provider-generated-projection'
    if (scope === 'repository') {
      if (ownsInstruction) add(provider, provider.instructionEntry, 'file', 'instructionEntry')
      for (const [name, path] of Object.entries(adapter.repositoryManagedTrees || {})) add(provider, path, 'tree', `repositoryManagedTrees.${name}`)
      if (adapter.skillView) add(provider, adapter.skillView.directory, 'tree', 'skillView.directory')
      if (adapter.hookView) add(provider, adapter.hookView.output, 'file', 'hookView.output')
      continue
    }
    const prefix = PRODUCT_TEMPLATE_PROJECTION_ROOT
    if (ownsInstruction && adapter.productInstructionSource) add(provider, `${prefix}/${provider.instructionEntry}`, 'file', 'instructionEntry')
    if (provider.hookConfig) add(provider, `${prefix}/${provider.hookConfig}`, 'file', 'hookConfig')
    for (const [name, value] of Object.entries(adapter.productManagedTrees || {})) {
      const tree = productManagedTree(registry, provider, name, value)
      add(provider, `${prefix}/${tree.destination}`, 'tree', `productManagedTrees.${name}`)
    }
    if (adapter.skillView && provider.skillDirectory) add(provider, `${prefix}/${provider.skillDirectory}`, 'tree', 'skillDirectory')
  }
  const values = [...declarations.values()].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) {
    const a = values[left]
    const b = values[right]
    invariant(!b.path.startsWith(`${a.path}/`), `provider projection paths overlap:${scope}:${a.path}:${b.path}`)
  }
  return values
}

/**
 * Resolve every repository-level provider projection from the provider registry.
 * This is intentionally structural: the generator owns bytes, while the build
 * graph and protected-root classifier share this one output-set authority.
 */
export function repositoryProviderProjectionDeclarations(registry) {
  return projectionDeclarations(registry, 'repository')
}

/** Resolve every product-template provider projection from the same provider registry. */
export function productProviderProjectionDeclarations(registry) {
  return projectionDeclarations(registry, 'product')
}

/**
 * A shared instruction (AGENTS.md today) is one common product output. It is deliberately absent
 * from provider-owned declarations so provider retirement can never tombstone the common surface.
 */
export function productCommonProjectionDeclarations(registry) {
  invariant(Array.isArray(registry?.providers), 'provider registry must contain providers')
  const providers = registry.providers.filter((provider) => (
    provider?.adapter?.generate
      && instructionOwnershipPolicy(registry, provider) === 'common-authority-consumer'
  ))
  if (!providers.length) return []
  providerProjectionPath(registry?.canonical?.productSharedInstructionSource, 'canonical.productSharedInstructionSource')
  const destinations = [...new Set(providers.map((provider) => provider.instructionEntry))]
  invariant(destinations.length === 1, `shared product instruction has multiple destinations:${destinations.join(',')}`)
  const destination = providerProjectionPath(destinations[0], 'shared product instruction destination')
  return [{
    path: `${PRODUCT_TEMPLATE_PROJECTION_ROOT}/${destination}`,
    kind: 'file',
    provider: 'common',
    surface: 'commonInstruction',
  }]
}

/** Resolve canonical source -> product destination tree materialization contracts. */
export function productProviderManagedTreeDeclarations(registry) {
  invariant(Array.isArray(registry?.providers), 'provider registry must contain providers')
  return registry.providers.filter((provider) => provider?.adapter?.generate).flatMap((provider) => (
    Object.entries(provider.adapter.productManagedTrees || {}).map(([name, value]) => {
      const tree = productManagedTree(registry, provider, name, value)
      return {
        provider: provider.id,
        name,
        sourceRoot: tree.sourceRoot,
        destination: tree.destination,
        materializerId: tree.materializerId,
        transformPolicy: tree.transformPolicy,
      }
    })
  )).sort((left, right) => compareUtf8Bytes(
    `${left.provider}/${left.name}`,
    `${right.provider}/${right.name}`,
  ))
}

/**
 * Provider-owned nested homes are partitions: generated declarations are authority, while any
 * undeclared sibling (cache, local settings, runtime logs) is explicitly non-authoritative.
 */
export function providerProjectionLocalStateRoots(registry, scope) {
  const base = scope === 'product' ? PRODUCT_TEMPLATE_PROJECTION_ROOT : ''
  return [...new Set(projectionDeclarations(registry, scope).flatMap((declaration) => {
    const relative = base ? declaration.path.slice(base.length + 1) : declaration.path
    const [first, ...rest] = relative.split('/')
    return rest.length ? [`${base ? `${base}/` : ''}${first}`] : []
  }))].sort()
}
