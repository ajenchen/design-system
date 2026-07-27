// Dependency-free clean-plugin validation facade. Structural validation comes from deterministic
// Ajv standalone code compiled from canonical JSON Schemas; cross-record semantics live in the
// non-generated provider-runtime-contract so development and plugin runtimes share one policy.

import {
  validateHookRegistrationsSchema,
  validateProviderRegistrySchema,
} from '../../generated/governance/provider-runtime-validator.mjs'
import {
  validateHookRegistrationSemantics,
  validateProviderRegistrySemantics,
} from './provider-runtime-contract.mjs'

export {
  assertAdapterOutputPath,
  assertRepositoryPath,
  buildProviderDiscoveryPolicy,
  buildProviderLifecycle,
  hasUsableVersionedTranscript,
  resolveProviderMaterializer,
  validateHookRegistrationSemantics,
  validateProviderRegistrySemantics,
} from './provider-runtime-contract.mjs'

function schemaFailure(label, validator) {
  const failures = (validator.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')
  return new Error(`${label} violates its committed JSON Schema:${failures}`)
}

export function validateProviderRegistryDocument(registry) {
  if (!validateProviderRegistrySchema(registry)) throw schemaFailure('provider adapter registry', validateProviderRegistrySchema)
  return validateProviderRegistrySemantics(registry)
}

export function validateHookRegistrations(registrations) {
  if (!validateHookRegistrationsSchema(registrations)) throw schemaFailure('provider hook registrations', validateHookRegistrationsSchema)
  return validateHookRegistrationSemantics(registrations)
}
