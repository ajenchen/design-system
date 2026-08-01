#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prepareDeepAuditRun, stableStringify } from './lib/deep-audit-evidence-contract.mjs'

function usage() {
  return 'usage: prepare-deep-audit-run.mjs [--repo-root <path>] [--evidence-root <path>] --self-provider <id> --self-surface <surface> [--peer-surface <surface>] [--peer-provider <expected-id>] [--reviewer-entitlement <required-id>] [--second-opinion-waiver user] [--author-provider <id>] [--self-runtime <kind>] [--peer-runtime <kind>] [--self-target <id>] [--peer-target <id>] [--replace-active] [--json]'
}

function parseArgs(argv) {
  const result = { json: false, replaceActive: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--json') { result.json = true; continue }
    if (token === '--replace-active') { result.replaceActive = true; continue }
    if (!['--repo-root', '--evidence-root', '--self-provider', '--peer-provider', '--reviewer-entitlement', '--second-opinion-waiver', '--author-provider', '--self-runtime', '--peer-runtime', '--self-surface', '--peer-surface', '--self-target', '--peer-target'].includes(token)) {
      throw new Error(`${usage()}; unknown option:${token}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
    result[token.slice(2)] = value
    index += 1
  }
  return result
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const secondOpinionWaiver = args['second-opinion-waiver'] ?? null
  const result = prepareDeepAuditRun({
    repoRoot: args['repo-root'] ?? process.cwd(),
    explicitRoot: args['evidence-root'] ?? process.env.GOVERNANCE_EVIDENCE_ROOT ?? null,
    selfProvider: args['self-provider'] ?? process.env.GOVERNANCE_SELF_PROVIDER ?? null,
    // A one-run user waiver is explicit CLI authority. Provider adapters inject
    // ambient peer metadata for ordinary turns; inherited metadata must not
    // silently turn the waived run back into a peer-selected run. An explicit
    // peer CLI assertion is still forwarded so the contract rejects the conflict.
    peerProvider: args['peer-provider'] ?? (secondOpinionWaiver ? null : process.env.GOVERNANCE_PEER_PROVIDER ?? null),
    authorProvider: args['author-provider'] ?? process.env.GOVERNANCE_AUTHOR_PROVIDER ?? args['self-provider'] ?? process.env.GOVERNANCE_SELF_PROVIDER ?? null,
    selfRuntime: args['self-runtime'] ?? null,
    peerRuntime: args['peer-runtime'] ?? null,
    selfSurface: args['self-surface'] ?? process.env.GOVERNANCE_SELF_SURFACE ?? null,
    peerSurface: args['peer-surface'] ?? (secondOpinionWaiver ? null : process.env.GOVERNANCE_PEER_SURFACE ?? null),
    selfTarget: args['self-target'] ?? null,
    peerTarget: args['peer-target'] ?? null,
    requiredReviewerEntitlement: args['reviewer-entitlement'] ?? (secondOpinionWaiver ? null : process.env.GOVERNANCE_REVIEWER_ENTITLEMENT ?? null),
    secondOpinionWaiver,
    replaceActive: args.replaceActive,
  })
  const output = {
    status: 'prepared',
    runId: result.manifest.runId,
    manifestSha256: result.manifestSha256,
    head: result.manifest.head,
    tree: result.manifest.tree,
    inventoryDigest: result.manifest.inventoryDigest,
    rubricDigest: result.manifest.rubricDigest,
    worktreeFingerprint: result.manifest.worktreeFingerprint,
    authorProvider: result.manifest.authorProvider,
    providerIdentityDigest: result.manifest.providerIdentityDigest,
    reviewSelectionStatus: result.manifest.reviewSelection.selectionStatus ?? 'selected',
    reviewSelectionDigest: result.manifest.reviewSelection.selectionDigest,
    providers: {
      self: {
        id: result.manifest.providers.self.id,
        runtime: result.manifest.providers.self.runtimeIdentity,
        surface: result.manifest.providers.self.runtimeSurface,
        profile: result.manifest.providers.self.runtimeProfileId,
      },
      peer: result.manifest.providers.peer === null ? null : {
        id: result.manifest.providers.peer.id,
        runtime: result.manifest.providers.peer.runtimeIdentity,
        surface: result.manifest.providers.peer.runtimeSurface,
        profile: result.manifest.providers.peer.runtimeProfileId,
      },
    },
    manifestPath: result.manifestPath,
  }
  process.stdout.write(args.json ? `${stableStringify(output, 2)}\n` : `deep-audit run prepared:${output.runId}\nmanifest:${output.manifestPath}\n`)
  return output
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()

if (IS_MAIN) {
  try { main() } catch (error) { console.error(error.message); process.exit(2) }
}
