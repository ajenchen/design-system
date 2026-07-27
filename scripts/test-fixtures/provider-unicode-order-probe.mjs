import {
  deriveProviderProductManagedInventory,
} from '../lib/provider-lifecycle.mjs'
import {
  validateProviderRegistrySemantics,
} from '../lib/provider-runtime-contract.mjs'

const lifecycleRegistry = JSON.parse(process.env.GOVERNANCE_UNICODE_LIFECYCLE_REGISTRY || 'null')
const runtimeRegistry = JSON.parse(process.env.GOVERNANCE_UNICODE_RUNTIME_REGISTRY || 'null')

if (!lifecycleRegistry || !runtimeRegistry) {
  throw new Error('provider Unicode ordering probe requires both closed registry fixtures')
}

validateProviderRegistrySemantics(runtimeRegistry)
const paths = deriveProviderProductManagedInventory(lifecycleRegistry)[0].surfaces
  .map((surface) => surface.path)
  .filter((path) => path.startsWith('.unicode-order/runtime/'))

process.stdout.write(JSON.stringify(paths))
