#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  loadManagedCiTrustedExecutionPlan,
} from './lib/managed-ci-trusted-execution-plan.mjs'
import {
  MODEL_RELEASE_AUTHORITY_BINDING_SCHEMA_PATH,
  MODEL_RELEASE_AUTHORITY_POLICY_PATH,
  MODEL_RELEASE_AUTHORITY_POLICY_SCHEMA_PATH,
} from './lib/model-release-authority.mjs'

function fail(message) {
  throw new Error(`managed CI trusted execution CLI blocked:${message}`)
}

function parseArgs(argv) {
  const allowed = new Set(['--plan', '--check', '--json'])
  if (argv.some(arg => !allowed.has(arg))) fail(`unknown argument:${argv.find(arg => !allowed.has(arg))}`)
  if (new Set(argv).size !== argv.length) fail('duplicate arguments are forbidden')
  const modes = ['--plan', '--check'].filter(flag => argv.includes(flag))
  if (modes.length !== 1) fail('choose exactly one of --plan or --check')
  return { mode: modes[0].slice(2), json: argv.includes('--json') }
}

export function managedCiTrustedExecutionReport(state) {
  return {
    schemaVersion: 1,
    kind: 'managed-ci-trusted-execution-verification',
    active: state.active,
    blockers: state.blockers,
    plan: {
      path: state.plan.$schema === 'schemas/managed-ci-trusted-execution-plan.schema.json'
        ? 'scripts/managed-ci-trusted-execution-plan.json'
        : null,
      sha256: state.planDigest,
      schemaSha256: state.schemaDigest,
    },
    activatedWorkflowContract: {
      path: state.plan.activatedWorkflowContract.path,
      sha256: state.activatedWorkflowContract.digest,
      schemaPath: state.plan.activatedWorkflowContract.schemaPath,
      schemaSha256: state.activatedWorkflowContract.schemaDigest,
    },
    workflow: {
      path: state.plan.workflow.path,
      identity: state.workflow.identity,
      identityDigest: state.workflow.workflowIdentityDigest,
    },
    activationTrustBundle: {
      sha256: state.activationTrustBundle.bindingDigest,
      filesSha256: state.activationTrustBundle.filesDigest,
      fileDigests: state.activationTrustBundle.fileDigests,
      manifest: state.activationTrustBundle.manifest,
      controlPlaneLock: state.activationTrustBundle.controlPlaneLock,
      lockCurrent: state.activationTrustBundle.lockCurrent,
    },
    oidcBrokerPolicy: {
      path: state.plan.oidcBrokerPolicy.path,
      sha256: state.oidcBrokerPolicy.digest,
      schemaPath: state.plan.oidcBrokerPolicy.schemaPath,
      schemaSha256: state.oidcBrokerPolicy.schemaDigest,
      claimPolicySha256: state.oidcBrokerPolicy.claimPolicyDigest,
      receiptSigningPolicySha256: state.oidcBrokerPolicy.receiptSigningPolicyDigest,
      brokerPolicyDigests: state.oidcBrokerPolicy.brokerPolicyDigests,
    },
    executorSupplyChain: {
      path: state.plan.executorSupplyChainPolicy.path,
      sha256: state.executorSupplyChain.digest,
      schemaPath: state.plan.executorSupplyChainPolicy.schemaPath,
      schemaSha256: state.executorSupplyChain.schemaDigest,
      recipeSha256: state.executorSupplyChain.recipeDigest,
      buildContextSha256: state.executorSupplyChain.buildContext.digest,
      materialsSha256: state.executorSupplyChain.materials.digest,
      classAdapterControlPlaneSha256: state.executorSupplyChain.controlPlane.digest,
      hostSandboxPolicySha256: state.executorSupplyChain.hostSandboxPolicyDigest,
    },
    trustedAuthorityPolicy: {
      path: state.plan.trustedAuthorityPolicy.path,
      sha256: state.trustedAuthority.digest,
      schemaPath: state.plan.trustedAuthorityPolicy.schemaPath,
      schemaSha256: state.trustedAuthority.schemaDigest,
      candidateBoundarySha256: state.trustedAuthority.candidateBoundaryDigest,
      oidcAuthoritySha256: state.trustedAuthority.oidcAuthorityDigest,
      frozenSubjectPolicySha256: state.trustedAuthority.frozenSubjectPolicyDigest,
      receiptSignerPolicySha256: state.trustedAuthority.receiptSignerPolicyDigest,
      hostObservationContractSha256: state.trustedAuthority.hostObservationContractDigest,
    },
    modelReleaseAuthorityPolicy: {
      path: MODEL_RELEASE_AUTHORITY_POLICY_PATH,
      sha256: state.modelReleaseAuthority.policyDigest,
      schemaPath: MODEL_RELEASE_AUTHORITY_POLICY_SCHEMA_PATH,
      schemaSha256: state.modelReleaseAuthority.policySchemaDigest,
      bindingSchemaPath: MODEL_RELEASE_AUTHORITY_BINDING_SCHEMA_PATH,
      bindingSchemaSha256: state.modelReleaseAuthority.bindingSchemaDigest,
    },
    trustProfileDigest: state.trust.digest,
    executionClasses: [...state.classes.entries()].map(([id, item]) => ({
      id,
      profileDigest: item.profileDigest,
      networkPolicyCatalogDigest: item.networkPolicyCatalogDigest,
      isolationPolicyDigest: item.isolationPolicyDigest,
      permissionsDigest: item.permissionsDigest,
      containerImageDigest: item.containerImageDigest,
      modelEgressRegistryDigest: item.modelEgress?.registrySha256 ?? null,
    })),
  }
}

export function runManagedCiTrustedExecutionCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const state = loadManagedCiTrustedExecutionPlan({ requireActivated: args.mode === 'check' })
  const report = managedCiTrustedExecutionReport(state)
  if (args.json) process.stdout.write(`${JSON.stringify(report)}\n`)
  else if (args.mode === 'plan') {
    process.stdout.write(`Managed CI trusted execution: ${report.active ? 'active' : 'inactive'}\n`)
    for (const blocker of report.blockers) process.stdout.write(`- ${blocker}\n`)
  } else process.stdout.write('Managed CI trusted execution: verified active\n')
  return report
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    runManagedCiTrustedExecutionCli()
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
