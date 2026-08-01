#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveHarnessGeneratedMirrorBinding,
  readHarnessSourceInventory,
} from '../infra/governance/lib/harness-source-inventory.mjs'
import { createGateMetaTestInventory } from './lib/gate-meta-test-inventory.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const HARNESS_INVENTORY_PATH = resolve(ROOT, 'infra/governance/providers/harness-source-inventory.json')
const HARNESS_REGISTRY_PATH = resolve(ROOT, 'infra/governance/providers/harness-registry.json')
const COMPATIBILITY_MATRIX_PATH = resolve(ROOT, 'infra/governance/providers/compatibility-matrix.json')

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is invalid JSON:${error.message}`, { cause: error })
  }
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

function synchronizeHarnessAuthorityBindings() {
  const inventory = readHarnessSourceInventory(HARNESS_INVENTORY_PATH)
  const generatedMirror = deriveHarnessGeneratedMirrorBinding(inventory, { repoRoot: ROOT })
  const gateMeta = createGateMetaTestInventory({ root: ROOT })
  const nextInventory = structuredClone(inventory)
  nextInventory.generatedMirrors = [generatedMirror.binding]
  nextInventory.gateMetaExclusions.sha256 = sha256(readFileSync(resolve(ROOT, nextInventory.gateMetaExclusions.path)))
  nextInventory.pairedMeta.members = gateMeta.runnable
    .map(({ file }) => `scripts/${file}`)
    .sort(compareUtf8Bytes)
  const canonicalHookRoot = `${nextInventory.canonicalHookStaticHelpers.root}/`
  nextInventory.canonicalHookStaticHelpers.entries = nextInventory.canonicalHookStaticHelpers.entries.map((entry) => {
    invariant(
      entry.path.startsWith(canonicalHookRoot) && !entry.path.split('/').includes('..'),
      `Harness canonical hook static-helper path is outside its canonical root:${entry.path}`,
    )
    return {
      ...entry,
      sha256: sha256(readFileSync(resolve(ROOT, entry.path))),
    }
  })
  const canonicalHookSuite = nextInventory.suites.find(item => item.id === 'canonical-hook-behavioral')
  invariant(canonicalHookSuite, 'Harness canonical hook behavioral suite is missing')
  canonicalHookSuite.members = generatedMirror.canonicalHookTree.records
    .filter(record => /(?:^|\/)test_[A-Za-z0-9._-]+\.sh$/.test(record.path))
    .map(record => `${generatedMirror.binding.canonicalRoot}/${record.path}`)
    .sort(compareUtf8Bytes)
  const inventoryBytes = canonicalJsonBytes(nextInventory)

  const registry = parseJson(HARNESS_REGISTRY_PATH, 'Harness registry')
  invariant(
    registry?.sourceInventory?.path === 'infra/governance/providers/harness-source-inventory.json'
      && registry.sourceInventory.schemaVersion === 2
      && registry.sourceInventory.kind === 'provider-neutral-governance-harness-source-inventory',
    'Harness registry source-inventory binding is invalid',
  )
  const nextRegistry = structuredClone(registry)
  nextRegistry.sourceInventory.sha256 = sha256(inventoryBytes)
  const registryBytes = canonicalJsonBytes(nextRegistry)

  const compatibility = parseJson(COMPATIBILITY_MATRIX_PATH, 'Provider compatibility matrix')
  const authorityContract = compatibility?.commonContract?.hardGateContracts?.authority
  invariant(
    authorityContract?.registryPath === 'infra/governance/providers/harness-registry.json'
      && authorityContract.registrySchemaVersion === 2
      && authorityContract.registryKind === 'provider-neutral-governance-harness-registry',
    'Provider compatibility authority Harness binding is invalid',
  )
  const nextCompatibility = structuredClone(compatibility)
  nextCompatibility.commonContract.hardGateContracts.authority.registrySha256 = sha256(registryBytes)
  const compatibilityBytes = canonicalJsonBytes(nextCompatibility)

  const outputs = [
    [HARNESS_INVENTORY_PATH, inventoryBytes],
    [HARNESS_REGISTRY_PATH, registryBytes],
    [COMPATIBILITY_MATRIX_PATH, compatibilityBytes],
  ]
  if (check) {
    for (const [path, expected] of outputs) {
      invariant(readFileSync(path).equals(expected), `derived Harness authority binding is stale:${path}`)
    }
  } else {
    for (const [path, bytes] of outputs) writeFileSync(path, bytes)
  }
  console.log(`✓ Harness mirror, inventory, registry, and compatibility digests ${check ? 'match' : 'generated'} as one authority projection`)
}

try {
  synchronizeHarnessAuthorityBindings()
} catch (error) {
  console.error(`❌ ${error.message}`)
  process.exit(1)
}
