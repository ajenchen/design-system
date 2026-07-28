#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseFlags,
  runClosedGit,
  sha256,
  stableStringify,
} from '../lib/common.mjs'
import {
  applyReviewedExternalActivationProposal,
  applyReviewedExternalCertificationProposal,
  createExternalActivationProposal,
  createExternalActivationSigningRequest,
  createExternalCertificationProposal,
  createProviderReviewCapabilityCertificationProposal,
  createReviewedExternalActivationHandoff,
  createReviewedExternalCertificationHandoff,
  createReviewedProviderReviewCapabilityCertificationHandoff,
  externalOperatorBlockResult,
  externalOperatorPaths,
  inspectExternalSurfaceReceipt,
  materializeExternalSurfaceReceipt,
  parseCanonicalExternalOperatorArtifact,
  readExternalOperatorArtifact,
  validateExternalActivationProposal,
  validateExternalActivationSignatureBundle,
  validateExternalActivationSigningRequest,
  validateExternalCertificationProposal,
  validateExternalLedgerTransactionHandoff,
  validateProviderReviewCapabilityCertificationProposal,
  writeExternalOperatorRuntimeArtifact,
} from '../lib/external-operator.mjs'

const COMMANDS = new Set([
  'verify-surface',
  'import-surface',
  'propose-certification',
  'check-certification',
  'handoff-reviewed-certification',
  'apply-reviewed-certification',
  'propose-provider-review-certification',
  'check-provider-review-certification',
  'handoff-reviewed-provider-review-certification',
  'prepare-activation',
  'assemble-activation',
  'check-activation',
  'handoff-reviewed-activation',
  'apply-reviewed-activation',
])

function usage() {
  return `Usage: node infra/governance/bin/external-operator.mjs <command> [options]

External surface evidence:
  verify-surface --receipt <signed.json>
  import-surface --receipt <signed.json>
  propose-certification --reference <infra/governance/evidence/external-runtime/SHA.json>
    --artifact-sha256 <sha256> --certified-at <UTC> --expires-at <UTC> [--output <runtime.json>]
  check-certification --proposal <runtime.json> --expected-proposal-digest <sha256>
  handoff-reviewed-certification --proposal <runtime.json> --expected-proposal-digest <sha256>
    --expected-base-commit <git-oid> --output <runtime.json>
  apply-reviewed-certification  DEPRECATED; always typed-blocked and never writes a ledger

Provider runtime + review capability certification:
  propose-provider-review-certification --runtime-certification <record.json>
    --runtime-evidence <provider-runtime-CAS.json>
    --capability-certification <record.json>
    --capability-evidence <review-capability-CAS.json> [--output <runtime.json>]
  check-provider-review-certification --proposal <runtime.json>
    --expected-proposal-digest <sha256>
  handoff-reviewed-provider-review-certification --proposal <runtime.json>
    --expected-proposal-digest <sha256> --expected-base-commit <git-oid>
    --output <runtime.json>

External activation:
  prepare-activation --requirement-id <id> --observed-resource <canonical.json>
    --observed-at <UTC> --expires-at <UTC> [--output <runtime.json>]
  assemble-activation --signing-request <runtime.json> --signatures <canonical.json>
    [--output <runtime.json>]
  check-activation --signing-request <runtime.json> --proposal <runtime.json>
    --expected-proposal-digest <sha256>
  handoff-reviewed-activation --signing-request <runtime.json> --proposal <runtime.json>
    --expected-proposal-digest <sha256> --expected-base-commit <git-oid>
    --output <runtime.json>
  apply-reviewed-activation  DEPRECATED; always typed-blocked and never writes a ledger

Common:
  --json      Emit a machine-readable success or closed typed blocker result.

Only import-surface writes an immutable content-addressed evidence artifact.
Reviewed ledger actions only write closed handoffs below infra/governance/runtime;
they require a protected Git expected-base/PR transaction and never write canonical
ledgers directly. No command owns a private key or mutates GitHub, npm, a provider,
endpoint policy, or any other external system.
`
}

function emitArtifact(value, output, options = {}) {
  if (output) {
    const written = writeExternalOperatorRuntimeArtifact(output, value, options)
    return { output: written.path, commitTime: written.commitTime }
  }
  process.stdout.write(`${stableStringify(value)}\n`)
  return { output: null }
}

function gitOutput(args, { encoding = 'utf8' } = {}) {
  const result = runClosedGit(args, {
    cwd: externalOperatorPaths.repoRoot,
    maxOutputBytes: 8 * 1024 * 1024,
    output: encoding === 'utf8' ? 'capture' : 'buffer',
    timeoutMs: 10_000,
  })
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr
    throw new Error(`Protected Git base read failed: ${String(detail || '').trim()}`)
  }
  return result.stdout
}

function resolveProtectedBase(expectedBaseCommit, ledgerPath) {
  if (!/^[a-f0-9]{40}$/.test(expectedBaseCommit ?? '')) {
    throw new Error('Expected protected Git base commit must be a full SHA-1 object id')
  }
  if (![
    'infra/governance/providers/certifications.json',
    'infra/governance/providers/review-capability-certifications.json',
    'infra/governance/external-activation-requirements.json',
  ].includes(ledgerPath)) throw new Error('Protected Git base ledger path is not an external operator authority')
  const topLevel = String(gitOutput(['rev-parse', '--show-toplevel'])).trim()
  if (realpathSync(topLevel) !== realpathSync(externalOperatorPaths.repoRoot)) {
    throw new Error('External operator checkout is not the canonical repository root')
  }
  const currentBaseCommit = String(gitOutput(['rev-parse', '--verify', 'HEAD'])).trim()
  if (currentBaseCommit !== expectedBaseCommit) {
    throw new Error(`Protected Git expected base changed:${expectedBaseCommit}:${currentBaseCommit}`)
  }
  const currentBaseTree = String(gitOutput(['rev-parse', `${expectedBaseCommit}^{tree}`])).trim()
  if (!/^[a-f0-9]{40}$/.test(currentBaseTree)) throw new Error('Protected Git expected base tree is invalid')
  const ledgerBytes = gitOutput(['show', `${expectedBaseCommit}:${ledgerPath}`], { encoding: null })
  let ledger
  try {
    ledger = JSON.parse(Buffer.from(ledgerBytes).toString('utf8'))
  } catch (error) {
    throw new Error(`Protected Git base ledger is not JSON: ${error.message}`, { cause: error })
  }
  return {
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256: sha256(stableStringify(ledger, 0)),
  }
}

function readCanonical(path, label, options = {}) {
  const artifact = readExternalOperatorArtifact(path, { label, ...options })
  return {
    ...artifact,
    value: parseCanonicalExternalOperatorArtifact(artifact.bytes, label),
  }
}

function success(command, detail = {}) {
  return {
    schemaVersion: 1,
    kind: 'external-operator-success-result',
    command,
    ready: true,
    externalMutationPerformed: false,
    ...detail,
  }
}

export async function run(argv = process.argv.slice(2), {
  now = new Date(),
  clock = () => new Date(),
} = {}) {
  const flags = parseFlags(argv, {
    receipt: 'string',
    reference: 'string',
    'artifact-sha256': 'string',
    'certified-at': 'string',
    'expires-at': 'string',
    proposal: 'string',
    'expected-proposal-digest': 'string',
    'requirement-id': 'string',
    'observed-resource': 'string',
    'observed-at': 'string',
    'signing-request': 'string',
    signatures: 'string',
    'expected-base-commit': 'string',
    'runtime-certification': 'string',
    'runtime-evidence': 'string',
    'capability-certification': 'string',
    'capability-evidence': 'string',
    output: 'string',
    json: 'boolean',
    help: 'boolean',
  })
  if (flags.help) {
    process.stdout.write(usage())
    return 0
  }
  if (flags._.length !== 1 || !COMMANDS.has(flags._[0])) throw new Error(`Choose exactly one external operator command.\n${usage()}`)
  const command = flags._[0]
  if (command === 'apply-reviewed-certification') applyReviewedExternalCertificationProposal()
  if (command === 'apply-reviewed-activation') applyReviewedExternalActivationProposal()

  if (command === 'verify-surface' || command === 'import-surface') {
    if (!flags.receipt) throw new Error(`${command} requires --receipt`)
    const source = readExternalOperatorArtifact(flags.receipt, { label: 'External surface receipt' })
    if (command === 'verify-surface') {
      const result = inspectExternalSurfaceReceipt(source.bytes, { now })
      if (flags.json) process.stdout.write(`${stableStringify(success(command, {
        artifactSha256: result.artifactSha256,
        evidenceDigest: result.evidence.evidenceDigest,
        profileId: result.profile.id,
        runId: result.evidence.run.runId,
        targetId: result.target.id,
      }))}\n`)
      else console.log(`external surface receipt verified: ${result.profile.id}/${result.target.id}; artifact=${result.artifactSha256}`)
      return 0
    }
    const result = materializeExternalSurfaceReceipt(source.bytes, { now })
    if (flags.json) process.stdout.write(`${stableStringify(result.receipt)}\n`)
    else console.log(`external surface artifact imported: ${result.reference}; no external system was mutated`)
    return 0
  }

  if (command === 'propose-certification') {
    for (const name of ['reference', 'artifact-sha256', 'certified-at', 'expires-at']) {
      if (!flags[name]) throw new Error(`${command} requires --${name}`)
    }
    const proposal = createExternalCertificationProposal({
      reference: flags.reference,
      artifactSha256: flags['artifact-sha256'],
      certifiedAt: flags['certified-at'],
      expiresAt: flags['expires-at'],
      now,
    })
    const emitted = emitArtifact(proposal, flags.output, { clock })
    if (flags.output) console.log(`external certification review proposal ${proposal.proposalDigest} written to ${emitted.output}; no ledger changed`)
    return 0
  }

  if (command === 'check-certification' || command === 'handoff-reviewed-certification') {
    if (!flags.proposal || !flags['expected-proposal-digest']) throw new Error(`${command} requires --proposal and --expected-proposal-digest`)
    const proposal = readCanonical(flags.proposal, 'External certification proposal', {
      boundary: externalOperatorPaths.runtimeDirectory,
    })
    if (proposal.value.proposalDigest !== flags['expected-proposal-digest']) throw new Error('Reviewed certification proposal digest acknowledgement does not match')
    if (command === 'check-certification') {
      validateExternalCertificationProposal(proposal.value, { now })
      const result = success(command, {
        proposalDigest: proposal.value.proposalDigest,
        certificationId: proposal.value.certification.id,
        targetId: proposal.value.certification.targetId,
      })
      if (flags.json) process.stdout.write(`${stableStringify(result)}\n`)
      else console.log(`external certification proposal is current and review-bound: ${proposal.value.proposalDigest}`)
      return 0
    }
    if (!flags['expected-base-commit'] || !flags.output) {
      throw new Error(`${command} requires --expected-base-commit and --output`)
    }
    const base = resolveProtectedBase(flags['expected-base-commit'], proposal.value.ledger.path)
    const handoff = createReviewedExternalCertificationHandoff({
      reviewedProposal: proposal.value,
      expectedProposalDigest: flags['expected-proposal-digest'],
      expectedBaseCommit: flags['expected-base-commit'],
      currentBaseCommit: base.currentBaseCommit,
      expectedBaseTree: base.currentBaseTree,
      currentBaseTree: base.currentBaseTree,
      baseLedgerSha256: base.baseLedgerSha256,
      now,
    })
    const emitted = emitArtifact(handoff, flags.output, {
      clock,
      validateBeforeWrite: commitNow => {
        const fresh = resolveProtectedBase(flags['expected-base-commit'], handoff.ledger.path)
        validateExternalLedgerTransactionHandoff(handoff, {
          currentBaseCommit: fresh.currentBaseCommit,
          currentBaseTree: fresh.currentBaseTree,
          baseLedgerSha256: fresh.baseLedgerSha256,
          now: commitNow,
        })
      },
    })
    if (flags.json) process.stdout.write(`${stableStringify(success(command, {
      handoffDigest: handoff.handoffDigest,
      canonicalLedgerMutationPerformed: false,
      output: emitted.output,
    }))}\n`)
    else console.log(`external certification transaction handoff ${handoff.handoffDigest} written to ${emitted.output}; canonical ledger unchanged`)
    return 0
  }

  if (command === 'propose-provider-review-certification') {
    for (const name of [
      'runtime-certification',
      'runtime-evidence',
      'capability-certification',
      'capability-evidence',
    ]) {
      if (!flags[name]) throw new Error(`${command} requires --${name}`)
    }
    const runtimeCertification = readCanonical(
      flags['runtime-certification'],
      'Provider runtime certification record',
    )
    const runtimeEvidence = readExternalOperatorArtifact(flags['runtime-evidence'], {
      label: 'Provider runtime evidence',
    })
    const capabilityCertification = readCanonical(
      flags['capability-certification'],
      'Review capability certification record',
    )
    const capabilityEvidence = readExternalOperatorArtifact(flags['capability-evidence'], {
      label: 'Review capability evidence',
    })
    const capabilityEvidenceValue = parseCanonicalExternalOperatorArtifact(
      capabilityEvidence.bytes,
      'Review capability evidence',
    )
    const proposal = createProviderReviewCapabilityCertificationProposal({
      runtimeCertification: runtimeCertification.value,
      runtimeEvidenceArtifactBytes: runtimeEvidence.bytes,
      capabilityPrepared: {
        evidence: capabilityEvidenceValue,
        evidenceBytes: capabilityEvidence.bytes,
        evidenceSha256: sha256(capabilityEvidence.bytes),
        evidenceReference:
          `infra/governance/evidence/review-capability/${sha256(capabilityEvidence.bytes)}.json`,
        certification: capabilityCertification.value,
      },
      now,
    })
    const emitted = emitArtifact(proposal, flags.output, { clock })
    if (flags.output) {
      console.log(`provider review certification proposal ${proposal.proposalDigest} written to ${emitted.output}; no ledger changed`)
    }
    return 0
  }

  if (command === 'check-provider-review-certification'
    || command === 'handoff-reviewed-provider-review-certification') {
    if (!flags.proposal || !flags['expected-proposal-digest']) {
      throw new Error(`${command} requires --proposal and --expected-proposal-digest`)
    }
    const proposal = readCanonical(flags.proposal, 'Provider review certification proposal', {
      boundary: externalOperatorPaths.runtimeDirectory,
    })
    if (proposal.value.proposalDigest !== flags['expected-proposal-digest']) {
      throw new Error('Reviewed provider review certification proposal digest acknowledgement does not match')
    }
    if (command === 'check-provider-review-certification') {
      validateProviderReviewCapabilityCertificationProposal(proposal.value, { now })
      const result = success(command, {
        proposalDigest: proposal.value.proposalDigest,
        runtimeCertificationId: proposal.value.runtime.certificationId,
        reviewCapabilityCertificationId:
          proposal.value.reviewCapability.certificationId,
      })
      if (flags.json) process.stdout.write(`${stableStringify(result)}\n`)
      else console.log(`provider review certification proposal is current and review-bound: ${proposal.value.proposalDigest}`)
      return 0
    }
    if (!flags['expected-base-commit'] || !flags.output) {
      throw new Error(`${command} requires --expected-base-commit and --output`)
    }
    const baseLedgerSha256s = Object.fromEntries(proposal.value.ledgers.map(ledger => {
      const base = resolveProtectedBase(flags['expected-base-commit'], ledger.path)
      return [ledger.path, base.baseLedgerSha256]
    }))
    const base = resolveProtectedBase(
      flags['expected-base-commit'],
      proposal.value.ledgers[0].path,
    )
    const handoff = createReviewedProviderReviewCapabilityCertificationHandoff({
      reviewedProposal: proposal.value,
      expectedProposalDigest: flags['expected-proposal-digest'],
      expectedBaseCommit: flags['expected-base-commit'],
      currentBaseCommit: base.currentBaseCommit,
      expectedBaseTree: base.currentBaseTree,
      currentBaseTree: base.currentBaseTree,
      baseLedgerSha256s,
      now,
    })
    const emitted = emitArtifact(handoff, flags.output, {
      clock,
      validateBeforeWrite: commitNow => {
        const freshLedgerSha256s = Object.fromEntries(handoff.ledgers.map(ledger => {
          const fresh = resolveProtectedBase(flags['expected-base-commit'], ledger.path)
          return [ledger.path, fresh.baseLedgerSha256]
        }))
        validateExternalLedgerTransactionHandoff(handoff, {
          currentBaseCommit: base.currentBaseCommit,
          currentBaseTree: base.currentBaseTree,
          baseLedgerSha256s: freshLedgerSha256s,
          now: commitNow,
        })
      },
    })
    if (flags.json) process.stdout.write(`${stableStringify(success(command, {
      handoffDigest: handoff.handoffDigest,
      canonicalLedgerMutationPerformed: false,
      output: emitted.output,
    }))}\n`)
    else console.log(`provider review certification transaction handoff ${handoff.handoffDigest} written to ${emitted.output}; canonical ledgers unchanged`)
    return 0
  }

  if (command === 'prepare-activation') {
    for (const name of ['requirement-id', 'observed-resource', 'observed-at', 'expires-at']) {
      if (!flags[name]) throw new Error(`${command} requires --${name}`)
    }
    const observed = readCanonical(flags['observed-resource'], 'External activation observed resource')
    const request = createExternalActivationSigningRequest({
      requirementId: flags['requirement-id'],
      observedResource: observed.value,
      observedAt: flags['observed-at'],
      expiresAt: flags['expires-at'],
      now,
    })
    const emitted = emitArtifact(request, flags.output, { clock })
    if (flags.output) console.log(`external activation signing request ${request.requestDigest} written to ${emitted.output}; private keys remain external`)
    return 0
  }

  if (command === 'assemble-activation') {
    if (!flags['signing-request'] || !flags.signatures) throw new Error(`${command} requires --signing-request and --signatures`)
    const request = readCanonical(flags['signing-request'], 'External activation signing request', {
      boundary: externalOperatorPaths.runtimeDirectory,
    })
    validateExternalActivationSigningRequest(request.value, { now })
    const bundle = readCanonical(flags.signatures, 'External activation signature bundle')
    const signatures = validateExternalActivationSignatureBundle(bundle.value, request.value)
    const proposal = createExternalActivationProposal({
      signingRequest: request.value,
      signatures,
      now,
    })
    const emitted = emitArtifact(proposal, flags.output, { clock })
    if (flags.output) console.log(`external activation review proposal ${proposal.proposalDigest} written to ${emitted.output}; no ledger or external system changed`)
    return 0
  }

  if (command === 'check-activation' || command === 'handoff-reviewed-activation') {
    for (const name of ['signing-request', 'proposal', 'expected-proposal-digest']) {
      if (!flags[name]) throw new Error(`${command} requires --${name}`)
    }
    const request = readCanonical(flags['signing-request'], 'External activation signing request', {
      boundary: externalOperatorPaths.runtimeDirectory,
    })
    const proposal = readCanonical(flags.proposal, 'External activation proposal', {
      boundary: externalOperatorPaths.runtimeDirectory,
    })
    if (proposal.value.proposalDigest !== flags['expected-proposal-digest']) throw new Error('Reviewed activation proposal digest acknowledgement does not match')
    if (command === 'check-activation') {
      validateExternalActivationProposal(proposal.value, {
        signingRequest: request.value,
        now,
      })
      const result = success(command, {
        proposalDigest: proposal.value.proposalDigest,
        requirementId: proposal.value.requirementId,
      })
      if (flags.json) process.stdout.write(`${stableStringify(result)}\n`)
      else console.log(`external activation proposal is current, signed, and review-bound: ${proposal.value.proposalDigest}`)
      return 0
    }
    if (!flags['expected-base-commit'] || !flags.output) {
      throw new Error(`${command} requires --expected-base-commit and --output`)
    }
    const base = resolveProtectedBase(flags['expected-base-commit'], proposal.value.ledger.path)
    const handoff = createReviewedExternalActivationHandoff({
      reviewedProposal: proposal.value,
      signingRequest: request.value,
      expectedProposalDigest: flags['expected-proposal-digest'],
      expectedBaseCommit: flags['expected-base-commit'],
      currentBaseCommit: base.currentBaseCommit,
      expectedBaseTree: base.currentBaseTree,
      currentBaseTree: base.currentBaseTree,
      baseLedgerSha256: base.baseLedgerSha256,
      now,
    })
    const emitted = emitArtifact(handoff, flags.output, {
      clock,
      validateBeforeWrite: commitNow => {
        const fresh = resolveProtectedBase(flags['expected-base-commit'], handoff.ledger.path)
        validateExternalLedgerTransactionHandoff(handoff, {
          currentBaseCommit: fresh.currentBaseCommit,
          currentBaseTree: fresh.currentBaseTree,
          baseLedgerSha256: fresh.baseLedgerSha256,
          now: commitNow,
        })
      },
    })
    if (flags.json) process.stdout.write(`${stableStringify(success(command, {
      handoffDigest: handoff.handoffDigest,
      canonicalLedgerMutationPerformed: false,
      output: emitted.output,
    }))}\n`)
    else console.log(`external activation transaction handoff ${handoff.handoffDigest} written to ${emitted.output}; canonical ledger unchanged`)
    return 0
  }

  throw new Error(`Unsupported external operator command: ${command}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await run()
  } catch (error) {
    const flagsJson = process.argv.includes('--json')
    if (flagsJson) process.stdout.write(`${stableStringify(externalOperatorBlockResult(error))}\n`)
    else console.error(`external operator blocked:${error.message}`)
    process.exitCode = 2
  }
}
