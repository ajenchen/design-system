#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { inspectReleaseSet } from './release-set.mjs'
import {
  assertRemoteTagUnchanged,
  assertVerifiedReleaseTag,
  resolveRemoteTagIdentity,
} from './release-remote-tag.mjs'
import {
  assertExpectedChannelProgress,
  assertTokenlessNpmEnvironment,
  classifyNpmViewResult,
  compareReleaseVersions,
  decideNpmStageAction,
  planReleaseChannelPromotion,
  stagingTagForVersion,
  validateProvenanceStatement,
  validateStagePublishJson,
  validateStageReceipt,
} from './release-npm-publish.mjs'
import {
  assertInteractivePromotionEnvironment,
  createStageReceipt,
  loadReleaseContext,
  sha256File,
  validateFinalizationReceipt,
  writeAtomicJson,
} from './release-npm-lib.mjs'
import { compareReleaseAssets } from './release-github-release.mjs'
import {
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  buildProductTemplateScaffoldLock,
} from './product-template-scaffold-lock.mjs'
import {
  expectedReleaseTrustArtifactName,
  expectedStageArtifactName,
  resolveStageRunIdentity,
  validateStageRunApiSnapshot,
} from './release-stage-run-identity.mjs'
import { validateGitHubActionsRunArtifactsApiSnapshot } from './lib/github-actions-artifact-identity.mjs'

const root = process.cwd()
const temporaryDirectories = []
const temporaryDirectory = (prefix) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  temporaryDirectories.push(directory)
  return directory
}
process.on('exit', () => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true })
})

const fail = (message) => { throw new Error(message) }
const must = (condition, message) => { if (!condition) fail(message) }
const mustMatch = (body, pattern, message) => must(pattern.test(body), message)
const message = (result) => `${result.stderr || ''}${result.stdout || ''}`
const expectPass = (result, label) => {
  if (result.status !== 0) fail(`${label} unexpectedly failed:\n${message(result)}`)
}
const expectFail = (result, pattern, label) => {
  if (result.status === 0) fail(`${label} unexpectedly passed`)
  if (!pattern.test(message(result))) fail(`${label} failed for the wrong reason:\n${message(result)}`)
}
const expectThrow = (operation, pattern, label) => {
  try {
    operation()
  } catch (error) {
    if (!pattern.test(error.message)) fail(`${label} threw for the wrong reason: ${error.message}`)
    return
  }
  fail(`${label} unexpectedly passed`)
}
const expectReject = async (operation, pattern, label) => {
  try {
    await operation()
  } catch (error) {
    if (!pattern.test(error.message)) fail(`${label} rejected for the wrong reason: ${error.message}`)
    return
  }
  fail(`${label} unexpectedly passed`)
}
const sha256 = (body) => createHash('sha256').update(body).digest('hex')
const hashFile = (path) => sha256(readFileSync(path))
const indexesOf = (body, needle) => {
  const indexes = []
  for (let offset = 0; ; offset += needle.length) {
    const index = body.indexOf(needle, offset)
    if (index < 0) return indexes
    indexes.push(index)
    offset = index
  }
}

const desiredGithub = JSON.parse(readFileSync(join(root, 'infra/governance/desired/github.json'), 'utf8'))
for (const [profileName, profile] of Object.entries(desiredGithub.profiles)) {
  const tagRulesets = profile.rulesets.filter(item => item.target === 'tag')
  must(tagRulesets.length > 0, `${profileName} has no managed release-tag ruleset`)
  for (const ruleset of tagRulesets) {
    must(ruleset.enforcement === 'active', `${profileName}/${ruleset.name} is not active`)
    must(ruleset.rules.some(rule => rule.type === 'required_signatures'), `${profileName}/${ruleset.name} does not require signed commits as defense-in-depth`)
  }
}
const stagedReleaseRunbook = readFileSync(join(root, 'docs/npm-native-staged-release.md'), 'utf8')
mustMatch(stagedReleaseRunbook, /git tag -s vX\.Y\.Z[\s\S]*git verify-tag vX\.Y\.Z[\s\S]*git push origin refs\/tags\/vX\.Y\.Z/, 'release runbook must create, verify, and push a signed annotated exact tag before dispatch')
mustMatch(stagedReleaseRunbook, /required_signatures[\s\S]{0,500}Require signed commits[\s\S]{0,1500}verification\.verified=true/, 'release runbook must distinguish signed-commit rulesets from signed annotated tag verification')
mustMatch(stagedReleaseRunbook, /verification\.verified=true[\s\S]*trust-preflight/, 'release runbook must carry exact signed-tag verification into trust preflight')
mustMatch(stagedReleaseRunbook, /release-tag-authorizer[\s\S]*releaseTagAuthorization[\s\S]*used-authorization-digest ledger/, 'release runbook must require independent authorization and state the exact-replay boundary')
const localPreflight = readFileSync(join(root, 'scripts/release-preflight.mjs'), 'utf8')
mustMatch(localPreflight, /npm run --silent test:governance-harnesses/, 'local release preflight must run the one registered All-Harness that owns the governance/supply-chain suites')
mustMatch(localPreflight, /npx --no-install tsc -b/, 'local release preflight must not allow npx registry fallback')

// The static workflow contract proves authority separation before any fixture is built.
const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
const jobBlock = (name) => {
  const match = workflow.match(new RegExp(`(?:^|\\n)  ${name}:\\n[\\s\\S]*?(?=\\n  [a-z0-9][a-z0-9-]*:\\n|$)`))
  if (!match) fail(`release workflow job is missing: ${name}`)
  return match[0]
}
const resolveBlock = jobBlock('resolve-release-request')
const trustBlock = jobBlock('trust-preflight')
const buildBlock = jobBlock('build-release-evidence')
const attestBlock = jobBlock('attest-release')
const npmBlock = jobBlock('publish-npm')
const releaseGithubBlock = jobBlock('github-release')
const finalizeWorkflow = readFileSync(join(root, '.github/workflows/release-finalize.yml'), 'utf8')
const finalizerJobBlock = (name) => {
  const match = finalizeWorkflow.match(new RegExp(`(?:^|\\n)  ${name}:\\n[\\s\\S]*?(?=\\n  [a-z0-9][a-z0-9-]*:\\n|$)`))
  if (!match) fail(`finalizer workflow job is missing: ${name}`)
  return match[0]
}
const finalizeCertBlock = finalizerJobBlock('certify-finalization')
const githubBlock = finalizerJobBlock('publish-github-release')

for (const [label, pattern] of [
  ['protected-default dispatch trigger', /repository_dispatch:\s*\n\s*types: \[stage-protected-release\]/],
  ['dispatch tag payload binding', /RELEASE_TAG: \$\{\{ github\.event\.client_payload\.tag \}\}/],
  ['global release serialization', /group: \$\{\{ github\.repository \}\}-release/],
  ['canonical verifier', /release:verify/],
  ['tag/main ancestry verifier', /--require-release-ref/],
  ['independent release-set digest output', /release_set_sha256: \$\{\{ steps\.release_set\.outputs\.sha256 \}\}/],
  ['Actions artifact service digest output', /actions_artifact_digest: \$\{\{ steps\.retain_evidence\.outputs\.artifact-digest \}\}/],
  ['provenance attestation', /uses: actions\/attest@[0-9a-f]{40}/],
  ['SBOM attestation', /sbom-path: release-artifacts\/release\.sbom\.cdx\.json/],
]) mustMatch(workflow, pattern, `release workflow missing ${label}`)

must(!/^[ ]{2}push:/m.test(workflow), 'privileged release workflow must never load from a pushed tag')
mustMatch(resolveBlock, /if: github\.ref == 'refs\/heads\/main'/, 'release resolver must run only from protected default ref')
mustMatch(resolveBlock, /test "\$event_commit" = "\$main_commit"/, 'release resolver must bind workflow source to current protected main')
mustMatch(resolveBlock, /test "\$tag_commit" = "\$main_commit"/, 'release resolver must bind requested tag to current protected main')
mustMatch(resolveBlock, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\(-\(beta\|next\|rc\)\\\.\[0-9\]\+\)\?\$/, 'release resolver must reject prerelease/build grammars that later trust gates cannot finalize')
mustMatch(trustBlock, /needs: resolve-release-request/, 'release trust preflight must depend on protected-main resolution')
mustMatch(trustBlock, /actions: read[\s\S]*checks: read[\s\S]*contents: read/, 'release trust preflight must have only the required read authorities')
must(!/(?:contents|id-token|attestations): write/.test(trustBlock), 'release trust preflight gained write or federation authority')
mustMatch(trustBlock, /release-trust-preflight\.mjs[\s\S]*release-trust-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/, 'release trust preflight must retain attempt-unique evidence')
mustMatch(trustBlock, /--event "\$GITHUB_EVENT_PATH"/, 'release trust preflight must parse the canonical repository-dispatch event file')
mustMatch(trustBlock, /tag_object: \$\{\{ steps\.resolve_trust\.outputs\.tag_object \}\}[\s\S]*--release-tag/, 'release trust preflight must emit a digest-bound verified annotated tag object')
mustMatch(trustBlock, /evidence_file_sha256: \$\{\{ steps\.resolve_trust\.outputs\.evidence_file_sha256 \}\}/, 'release trust preflight must expose the exact evidence-file digest')
mustMatch(buildBlock, /needs: \[resolve-release-request, smoke-shard\]/, 'evidence build must depend on the protected-main resolver and smoke matrix')
mustMatch(trustBlock, /if: vars\.RELEASE_HIGH_ASSURANCE == 'true'/, 'the high-assurance trust preflight must stay an explicit opt-in lane')
mustMatch(attestBlock, /needs: \[resolve-release-request, build-release-evidence\]/, 'attestation must depend on protected-main resolution and the unprivileged evidence build')
mustMatch(npmBlock, /needs: \[resolve-release-request, build-release-evidence, attest-release\]/, 'npm publication must depend on protected-main resolution, evidence, and attestation')
mustMatch(githubBlock, /needs: certify-finalization/, 'GitHub Release writer must depend on independent finalization certification')
mustMatch(buildBlock, /permissions:\s*\n\s*contents: read/, 'evidence builder must remain read-only')
must(!/contents: write|id-token: write|attestations: write|environment:/.test(buildBlock), 'evidence builder gained authority')
mustMatch(buildBlock, /test "\$\{\{ steps\.release-identity\.outputs\.commit \}\}" = "\$\(git rev-parse refs\/remotes\/origin\/main\^\{commit\}\)"/, 'evidence builder must require the release tag to equal current protected main')
mustMatch(buildBlock, /--allow-repository-dispatch/, 'evidence builder must use the guarded protected-default dispatch verifier')
mustMatch(attestBlock, /contents: read[\s\S]*id-token: write[\s\S]*attestations: write/, 'attestation job permissions drifted')
must(!/contents: write|environment:/.test(attestBlock), 'attestation job gained publish authority')
mustMatch(npmBlock, /environment:\s*\n\s*name: npm-release/, 'npm publish job lost its protected environment')
mustMatch(npmBlock, /contents: read[\s\S]*id-token: write/, 'npm publish job permissions drifted')
must(!/contents: write|attestations: write/.test(npmBlock), 'npm publish job gained repository/attestation write authority')
mustMatch(npmBlock, /npm publish "\$tarball" --provenance --access public --tag latest/, 'publication must go through tokenless OIDC Trusted Publishing with provenance')
mustMatch(npmBlock, /release-published-integrity\.mjs --tarball "\$tarball" --version "\$version"/, 'publish loop must probe already-published versions through the committed static integrity CLI')
mustMatch(npmBlock, /already published with identical integrity/, 'publish loop must be idempotent across reruns for byte-identical already-published versions')
const integrityProbe = readFileSync(join(root, 'scripts/release-published-integrity.mjs'), 'utf8')
mustMatch(integrityProbe, /DIFFERENT bytes: refusing to continue/, 'integrity probe must fail closed when the registry already holds different bytes for the same version')
mustMatch(integrityProbe, /sha512-\$\{createHash\('sha512'\)\.update\(tarball\)\.digest\('base64'\)\}/, 'integrity probe must bind the comparison to the exact local tarball bytes')
mustMatch(npmBlock, /npm view "\$\{name\}@\$\{version\}" version/, 'publication must read back the exact published registry versions')
mustMatch(releaseGithubBlock, /needs: \[resolve-release-request, build-release-evidence, publish-npm\]/, 'GitHub Release publication must depend on the completed npm publish')
mustMatch(releaseGithubBlock, /permissions:\s*\n\s*contents: write/, 'GitHub Release job needs contents write')
must(!/id-token: write|attestations: write/.test(releaseGithubBlock), 'GitHub Release job gained npm/attestation authority')
mustMatch(releaseGithubBlock, /gh release create "\$RELEASE_TAG"[\s\S]*--verify-tag/, 'GitHub Release must bind the verified tag')
mustMatch(githubBlock, /permissions:\s*\n\s*contents: write/, 'GitHub Release job needs contents write')
must(!/id-token: write|attestations: write/.test(githubBlock), 'GitHub Release job gained npm/attestation authority')
mustMatch(githubBlock, /environment:\s*\n\s*name: release-finalize/, 'GitHub Release writer lost its independently protected environment')
must((workflow.match(/environment:\s*\n\s*name: npm-release/g) || []).length === 1, 'npm-release environment must occur in exactly one job')
const attestationTagChecks = indexesOf(attestBlock, 'scripts/release-remote-tag.mjs')
const attestationAuthorityUses = indexesOf(attestBlock, 'uses: actions/attest@')
must(
  attestationTagChecks.length === 2
  && attestationAuthorityUses.length === 2
  && attestationTagChecks[0] < attestationAuthorityUses[0]
  && attestationAuthorityUses[0] < attestationTagChecks[1]
  && attestationTagChecks[1] < attestationAuthorityUses[1],
  'each attestation must have its own immediately preceding remote signed-tag recheck',
)
const stagingTagChecks = indexesOf(npmBlock, 'scripts/release-remote-tag.mjs')
const stagingAuthorityUses = indexesOf(npmBlock, 'npm publish "$tarball"')
must(
  stagingTagChecks.length === 1 && stagingAuthorityUses.length === 1
  && stagingTagChecks[0] < stagingAuthorityUses[0],
  'npm publication authority must have its own preceding remote tag recheck',
)
must((workflow.match(/--expected "\$\{\{ needs\.build-release-evidence\.outputs\.release_set_sha256 \}\}"/g) || []).length === 2, 'attestation and staging must bind the same independent release-set digest')
must((workflow.match(/node scripts\/run-verified-npm\.mjs -- pack \.\/packages\//g) || []).length === 3, 'each publishable package must be packed exactly once through the verified npm runtime')
must(!/npm install --global|\bnpx\s+-y\b/.test(workflow), 'release workflow must not bootstrap mutable ambient npm tooling')
const releaseTrustHelper = readFileSync(join(root, 'scripts/release-trust-preflight.mjs'), 'utf8')
const releaseTrustResolver = readFileSync(join(root, 'infra/governance/lib/release-trust-preflight.mjs'), 'utf8')
mustMatch(releaseTrustHelper, /External activation requirements:/, 'trust preflight must identify the external activation record when observation fails')
mustMatch(releaseTrustHelper, /client_payload[\s\S]*releaseTagAuthorization,tag/, 'trust preflight must enforce a closed authorization payload')
mustMatch(releaseTrustResolver, /candidateRelease=null[\s\S]*materializeProfile/, 'trust preflight must remain independent of the rollout candidate gate')
mustMatch(releaseTrustResolver, /verifyReleaseTagAuthorization[\s\S]*tagObject:[\s\S]*commit:[\s\S]*tree:/, 'trust preflight must bind the independent authorization to the exact live Git identity')
mustMatch(releaseTrustResolver, /resolveVerifiedReleaseTag[\s\S]*rulesets[\s\S]*requiredChecks[\s\S]*environments[\s\S]*workflows[\s\S]*immutableReleases/, 'trust preflight evidence must close the verified tag object and every privileged GitHub trust surface')
const npmPublishHelper = readFileSync(join(root, 'scripts/release-npm-publish.mjs'), 'utf8')
mustMatch(
  npmPublishHelper,
  /prepareVerifiedExactNpmRuntime[\s\S]*assertNativeStageRuntime\(npmCli\)[\s\S]*version !== '11\.18\.0'/,
  'staging authority must bind its npm capability to the exact verified runtime and read back npm 11.18.0',
)
mustMatch(npmPublishHelper, /'stage', 'publish', archive,[\s\S]*'--tag', context\.stagingTag[\s\S]*'--json'/, 'exact archives must use native stage publish and parse JSON stage IDs')
mustMatch(npmPublishHelper, /receiptItem\.stageId = evidence\.stageId[\s\S]*writeAtomicJson\(receiptPath, receipt\)/, 'every successful package must durably record its stageId')
mustMatch(npmPublishHelper, /tagObject: args\['--tag-object'\][\s\S]*createStageReceipt/, 'stage receipt must retain the exact quorum-authorized tag object')
mustMatch(npmPublishHelper, /evidenceFileSha256: args\['--release-trust-evidence-file-sha256'\][\s\S]*createStageReceipt/, 'stage receipt must retain the exact trust-evidence file digest')
must(!/\[\s*'publish'\b|'dist-tag'/.test(npmPublishHelper), 'OIDC helper contains direct publication or channel mutation')
const npmPromotionHelper = readFileSync(join(root, 'scripts/release-npm-promote.mjs'), 'utf8')
mustMatch(npmPromotionHelper, /assertInteractivePromotionEnvironment[\s\S]*verifyAuthorizedTrain[\s\S]*'dist-tag', 'add'/, 'promotion must validate the platform-interactive session and the entire authorized train before channel mutation')
must(!/createInterface|PROMOTE \$\{context\.identity\.tag\}|human confirmation phrase|approved-awaiting-human-confirmation|awaiting-approval/.test(npmPromotionHelper), 'promotion must not add a second human engineering-decision confirmation gate')
must(!/complete digest-bound human handoff|inspect all stage IDs/.test(workflow), 'release handoff must request only npm account-holder login/2FA, never human engineering inspection')
must(!/Account-holder action only:/.test(workflow), 'the ordinary publish path must not require a per-release human npm handoff')
mustMatch(npmPromotionHelper, /assertExpectedChannelProgress[\s\S]*publishOrder/, 'promotion must use exact-plan prefix/resume drift checks')
mustMatch(npmPromotionHelper, /args\['--tag-object'\] !== receipt\.releaseTrust\.tagObject[\s\S]*assertRemoteTag\(context, receipt\.releaseTrust\.tagObject/, 'promotion must reject a tag object that differs from the stage receipt')
mustMatch(npmPromotionHelper, /resolveRemoteTagIdentity[\s\S]*expectedTagObject[\s\S]*'dist-tag', 'add'/, 'promotion must re-read the same GitHub-verified tag object before channel mutation')
mustMatch(npmPromotionHelper, /isolated staging tag drifted immediately before target promotion[\s\S]*await assertRemoteTag\([\s\S]*const promoted = npmResult\(npmCli, \[[\s\S]*'dist-tag', 'add'/, 'promotion tag recheck must remain adjacent to each dist-tag authority use')
const npmApprovalHelper = readFileSync(join(root, 'scripts/release-npm-approve.mjs'), 'utf8')
mustMatch(npmApprovalHelper, /assertInteractivePromotionEnvironment[\s\S]*resolveRemoteTagIdentity[\s\S]*'stage', 'view'[\s\S]*recheckRemoteTag[\s\S]*'stage', 'approve'/, '2FA approval must validate the exact stage and re-read the signed tag immediately before authority use')
mustMatch(npmApprovalHelper, /args\['--tag-object'\] !== receipt\.releaseTrust\.tagObject[\s\S]*recheckRemoteTag\(context, receipt\.releaseTrust\.tagObject/, '2FA approval must use the tag object bound by the stage receipt')
const npmRejectionHelper = readFileSync(join(root, 'scripts/release-npm-reject.mjs'), 'utf8')
mustMatch(npmRejectionHelper, /assertInteractivePromotionEnvironment[\s\S]*resolveRemoteTagIdentity[\s\S]*'stage', 'view'[\s\S]*recheckRemoteTag[\s\S]*'stage', 'reject'/, '2FA rejection must validate the exact stage and re-read the signed tag immediately before authority use')
mustMatch(npmRejectionHelper, /args\['--tag-object'\] !== receipt\.releaseTrust\.tagObject[\s\S]*recheckRemoteTag\(context, receipt\.releaseTrust\.tagObject/, '2FA rejection must use the tag object bound by the stage receipt')
const npmFinalizeHelper = readFileSync(join(root, 'scripts/release-npm-finalize-verify.mjs'), 'utf8')
mustMatch(npmFinalizeHelper, /validateRegistryPackage[\s\S]*readTagVersions[\s\S]*readAndPlanChannel[\s\S]*verifyRegistrySignatures/, 'finalizer must verify exact package provenance, both tag sets, and signatures')
const githubReleaseHelper = readFileSync(join(root, 'scripts/release-github-release.mjs'), 'utf8')
for (const [phase, pattern] of [
  ['draft creation', /assertImmutableReleasesEnabled\([^\n]+immediately before draft creation[^\n]+\n\s*await recheckRemoteTag\([^\n]+\n\s*ghRun\(ghContext, \[\n\s*'release', 'create'/],
  ['asset upload', /assertImmutableReleasesEnabled\([^\n]+immediately before uploading[^\n]+\n\s*await recheckRemoteTag\([^\n]+\n\s*ghRun\(ghContext, \[\n\s*'release', 'upload'/],
  ['publication', /assertImmutableReleasesEnabled\([^\n]+immediately before publication[^\n]+\n\s*await recheckRemoteTag\([^\n]+\n\s*ghRun\(ghContext, \[\n\s*'release', 'edit'/],
]) {
  mustMatch(githubReleaseHelper, pattern, `GitHub Release ${phase} must re-read the signed tag immediately before mutation`)
}
mustMatch(finalizeWorkflow, /repository_dispatch:[\s\S]*types: \[finalize-staged-release\]/, 'finalizer must load only from protected-default repository_dispatch')
must(!/^[ ]{2}workflow_dispatch:/m.test(finalizeWorkflow), 'branch-selectable workflow_dispatch cannot own release write authority')
for (const key of [
  'stage_run_id', 'stage_run_attempt', 'stage_artifact_digest', 'release_set_sha256', 'stage_receipt_sha256',
  'release_authorization_digest', 'release_trust_evidence_digest', 'release_trust_artifact_digest',
]) {
  must(finalizeWorkflow.includes(`github.event.client_payload.${key}`), `finalizer handoff is missing client_payload.${key}`)
}
mustMatch(finalizeCertBlock, /client_payload \| keys \| sort[\s\S]*stage_artifact_digest/, 'finalizer dispatch payload must have a closed input shape')
mustMatch(finalizeCertBlock, /release-stage-run-identity\.mjs[\s\S]*Download exact original release trust evidence[\s\S]*--verify-issued[\s\S]*Download the exact durable stage receipt/, 'finalizer must verify the original run and exact trust artifact/evidence before stage receipt download')
mustMatch(finalizeCertBlock, /--verify-issued[\s\S]*--retain-exact "\$GITHUB_WORKSPACE\/finalization-evidence\/release-trust-preflight\.json"[\s\S]*--github-output "\$GITHUB_OUTPUT"[\s\S]*--expected-object "\$\{\{ steps\.issued_trust\.outputs\.tag_object \}\}"[\s\S]*release-npm-finalize-verify\.mjs[\s\S]*--release-trust-evidence-file-sha256 "\$\{\{ steps\.issued_trust\.outputs\.evidence_file_sha256 \}\}"/, 'finalizer must byte-preserve and digest-bind the original trust evidence through receipt certification')
must((finalizeWorkflow.match(/release-stage-run-identity\.mjs/g) || []).length === 2, 'certifier and fresh writer must independently resolve stage run/artifact identity')
must((finalizeWorkflow.match(/release-finalize-\$\{\{ github\.event\.client_payload\.tag \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/g) || []).length === 2, 'finalization evidence must be attempt-unique to prevent rerun replay')
mustMatch(githubBlock, /actions: read[\s\S]*release-stage-run-identity\.mjs[\s\S]*release-npm-finalization-receipt\.mjs/, 'fresh contents writer must re-resolve and rebind stage identity')
mustMatch(
  npmFinalizeHelper,
  /resolveExactNpmRuntimeContract[\s\S]*prepareVerifiedExactNpmRuntime[\s\S]*assertVerifiedExactNpmRuntimeCapability\(npmRuntime, expectedNpmRuntime\)[\s\S]*npmVersion !== '11\.18\.0'[\s\S]*npmRuntime\.cleanup/,
  'finalizer registry certification must verify and clean up the exact overlay-bound npm 11.18.0 runtime',
)
must(!/args\['--npm'\]|\|\| 'npm'/.test(npmFinalizeHelper), 'finalizer may not accept or fall back to an ambient npm executable')
mustMatch(finalizeCertBlock, /run-verified-npm\.mjs -- pack \.\/packages\/design-system[\s\S]*run-verified-npm\.mjs -- pack \.\/packages\/storybook-config[\s\S]*run-verified-npm\.mjs -- pack \.\/packages\/governance/, 'finalizer must rebuild all three archives from the exact tag through the verified npm runtime')
mustMatch(finalizeCertBlock, /--expected "\$\{\{ github\.event\.client_payload\.release_set_sha256 \}\}"[\s\S]*release-npm-finalize-verify\.mjs/, 'finalizer must match original bytes before npm read-back certification')
mustMatch(githubBlock, /release-npm-finalization-receipt\.mjs[\s\S]*--tag-object "\$\{\{ needs\.certify-finalization\.outputs\.tag_object \}\}"[\s\S]*release-remote-tag\.mjs[\s\S]*--expected-object[\s\S]*release-github-release\.mjs[\s\S]*--tag-object/, 'contents writer must rebind receipt and the same originally authorized tag object before immutable GitHub Release')
mustMatch(githubBlock, /release-github-release\.mjs[\s\S]*--audit-evidence[\s\S]*--audit-evidence-sha256/, 'immutable GitHub Release must retain and read back the closed finalization audit receipt')
mustMatch(githubBlock, /release-npm-finalization-receipt\.mjs[\s\S]*--release-trust-evidence-file-sha256 "\$\{\{ needs\.certify-finalization\.outputs\.release_trust_evidence_file_sha256 \}\}"[\s\S]*release-github-release\.mjs[\s\S]*--release-trust-evidence[\s\S]*--release-trust-evidence-sha256 "\$\{\{ needs\.certify-finalization\.outputs\.release_trust_evidence_file_sha256 \}\}"/, 'fresh writer and immutable Release asset must rebind the exact historical trust-evidence digest')

for (const [label, pattern] of [
  ['long-lived npm token', /NPM_TOKEN|NODE_AUTH_TOKEN/],
  ['mutable manual release trigger', /workflow_dispatch/],
  ['mutable npm dist-tag operation', /npm dist-tag (?:add|rm)/],
  ['source-directory npm publish', /npm publish\s+(?:\.\/)?packages\//],
  ['third-party release action', /softprops\/action-gh-release/],
  ['floating official action ref', /uses: actions\/[A-Za-z0-9_.-]+@v\d/],
]) {
  if (pattern.test(workflow)) fail(`release workflow contains forbidden ${label}`)
}
for (const [label, pattern] of [
  ['npm token', /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/],
  ['npm publish authority', /\bnpm\s+(?:stage\s+publish|publish|dist-tag)\b/],
  ['OIDC permission', /id-token:\s*write/],
]) {
  if (pattern.test(finalizeWorkflow)) fail(`finalizer workflow contains forbidden ${label}`)
}

// Build two real, independently packed release sets to prove byte-deterministic BOMs.
// The standalone governance remainder must be order-independent: release workflows
// build these publishable workspaces before packing, so reproduce that prerequisite
// here instead of accepting archives that silently omit required dist entries.
execFileSync('npm', ['run', '--silent', 'build:lib'], {
  cwd: root,
  env: process.env,
  stdio: 'pipe',
})
const packageSources = [
  ['@qijenchen/design-system', 'packages/design-system'],
  ['@qijenchen/storybook-config', 'packages/storybook-config'],
  ['@qijenchen/governance', 'packages/governance'],
]
const createPackedFixture = () => {
  const directory = temporaryDirectory('release-bom-test-')
  const npmState = temporaryDirectory('release-bom-npm-state-')
  const npmCache = join(npmState, 'cache')
  const npmUserConfig = join(npmState, 'npmrc')
  mkdirSync(npmCache, { recursive: true })
  writeFileSync(npmUserConfig, '')
  const npmEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
    !/^(?:NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG_CACHE|NPM_CONFIG_USERCONFIG)$/i.test(name)
  )))
  Object.assign(npmEnvironment, {
    npm_config_audit: 'false',
    npm_config_cache: npmCache,
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_userconfig: npmUserConfig,
  })
  const manifests = packageSources.map(([expectedName, packageDirectory]) => {
    const manifest = JSON.parse(readFileSync(join(root, packageDirectory, 'package.json'), 'utf8'))
    must(manifest.name === expectedName, `fixture package identity drift: ${packageDirectory}`)
    const packed = JSON.parse(execFileSync('npm', [
      'pack', `./${packageDirectory}`, '--pack-destination', directory, '--json', '--ignore-scripts',
    ], { cwd: root, encoding: 'utf8', env: npmEnvironment }))
    must(packed.length === 1, `npm pack returned ${packed.length} artifacts for ${expectedName}`)
    return { ...manifest, file: packed[0].filename }
  })
  const versions = new Set(manifests.map((item) => item.version))
  must(versions.size === 1, 'fixture packages must share one release version train')
  writeFileSync(join(directory, 'release.sbom.cdx.json'), JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components: manifests.map((item) => ({
      type: 'library',
      name: item.name.replace(/^@[^/]+\//, ''),
      version: item.version,
      purl: `pkg:npm/${encodeURIComponent(item.name).replace('%2F', '/')}@${item.version}`,
    })),
  }, null, 2) + '\n')
  const scaffoldRoot = temporaryDirectory('release-scaffold-test-')
  mkdirSync(join(scaffoldRoot, 'apps/template'), { recursive: true })
  writeFileSync(join(scaffoldRoot, 'package.json'), `${JSON.stringify({
    name: 'ds-product-template', version: '0.0.0', workspaces: ['apps/*'],
    dependencies: {
      '@qijenchen/design-system': manifests[0].version,
      '@qijenchen/storybook-config': manifests[0].version,
    },
  }, null, 2)}\n`)
  writeFileSync(join(scaffoldRoot, 'apps/template/package.json'), `${JSON.stringify({
    name: '@product/template', version: '0.0.0',
    dependencies: { '@qijenchen/design-system': manifests[0].version },
  }, null, 2)}\n`)
  const scaffoldLock = buildProductTemplateScaffoldLock({ root: scaffoldRoot, releaseVersion: manifests[0].version })
  writeFileSync(join(directory, PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET), `${JSON.stringify(scaffoldLock, null, 2)}\n`)
  return { directory, manifests, version: manifests[0].version }
}

const first = createPackedFixture()
const second = createPackedFixture()
const repository = 'ajenchen/design-system'
const tag = `v${first.version}`
must(first.version === second.version, 'independent fixtures have different versions')

// Keep release primitive tests independent from unrelated, concurrently generated governance files.
// The real workflow runs all governance gates against the actual repository before building its BOM.
const releaseRepository = temporaryDirectory('release-source-repo-')
const copySource = (relativePath) => {
  const target = join(releaseRepository, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(root, relativePath), target)
}
for (const relativePath of [
  'packages/design-system/package.json',
  'packages/storybook-config/package.json',
  'packages/governance/package.json',
  'packages/design-system/ds-canonical/fork/governance.lock',
  'infra/governance/consumer-upgrade-protocol.json',
  'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'infra/governance/lib/consumer-upgrade-protocol.mjs',
]) copySource(relativePath)
const writeFixtureJson = (relativePath, value) => {
  const target = join(releaseRepository, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n')
}
const controlPlaneLock = JSON.parse(readFileSync(join(root, 'governance/control-plane.lock.json'), 'utf8'))
must(controlPlaneLock._provenance?.generatorVersion === first.version, 'actual control-plane lock is not on the release version')
writeFixtureJson('governance/control-plane.lock.json', controlPlaneLock)
const consumerLock = JSON.parse(readFileSync(join(root, 'template/ds-product-template/governance/lock.json'), 'utf8'))
must(
  consumerLock.release?.designSystem === first.version && consumerLock.release?.storybookConfig === first.version,
  'actual consumer governance lock is not on the release version',
)
writeFixtureJson('template/ds-product-template/governance/lock.json', consumerLock)
const pluginManifest = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
must(pluginManifest.version === first.version, 'actual plugin manifest is not on the release version')
writeFixtureJson('.claude-plugin/plugin.json', pluginManifest)
const marketplaceManifest = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
must(
  marketplaceManifest.metadata?.version === first.version
    && marketplaceManifest.plugins.find((item) => item.name === 'design-system')?.version === first.version,
  'actual marketplace manifest is not on the release version',
)
writeFixtureJson('.claude-plugin/marketplace.json', marketplaceManifest)
execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: releaseRepository })
execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: releaseRepository })
execFileSync('git', ['config', 'user.email', 'release-test@example.invalid'], { cwd: releaseRepository })
execFileSync('git', ['add', '.'], { cwd: releaseRepository })
execFileSync('git', ['commit', '--quiet', '-m', 'release fixture'], { cwd: releaseRepository })
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: releaseRepository, encoding: 'utf8' }).trim()
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: releaseRepository, encoding: 'utf8' }).trim()

const stageRunExpected = {
  repository,
  tag,
  gitHead: head,
  runId: '123456789',
  runAttempt: '2',
  artifactDigest: 'a'.repeat(64),
  releaseTrustArtifactDigest: 'b'.repeat(64),
}
const stageArtifactName = expectedStageArtifactName(stageRunExpected)
const releaseTrustArtifactName = expectedReleaseTrustArtifactName(stageRunExpected)
const stageRunApi = {
  id: Number(stageRunExpected.runId),
  path: '.github/workflows/release.yml@main',
  event: 'repository_dispatch',
  head_branch: 'main',
  head_sha: head,
  status: 'completed',
  conclusion: 'success',
  run_attempt: Number(stageRunExpected.runAttempt),
  repository: { full_name: repository },
  head_repository: { full_name: repository },
}
const stageArtifactApi = {
  id: 987654321,
  name: stageArtifactName,
  size_in_bytes: 4096,
  expired: false,
  digest: `sha256:${stageRunExpected.artifactDigest}`,
  created_at: '2026-07-20T00:00:00Z',
  expires_at: '2026-10-18T00:00:00Z',
  archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/987654321/zip`,
  workflow_run: { id: Number(stageRunExpected.runId), head_branch: 'main', head_sha: head },
}
const releaseTrustArtifactApi = {
  id: 987654322,
  name: releaseTrustArtifactName,
  size_in_bytes: 8192,
  expired: false,
  digest: `sha256:${stageRunExpected.releaseTrustArtifactDigest}`,
  created_at: '2026-07-20T00:00:00.12Z',
  expires_at: '2026-10-18T00:00:00.1Z',
  archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/987654322/zip`,
  workflow_run: { id: Number(stageRunExpected.runId), head_branch: 'main', head_sha: head },
}
const stageArtifactsApi = { total_count: 2, artifacts: [stageArtifactApi, releaseTrustArtifactApi] }
const stageNow = new Date('2026-07-21T00:00:00.000Z')
const stageRunIdentity = validateStageRunApiSnapshot({
  run: stageRunApi,
  artifacts: stageArtifactsApi,
  expected: stageRunExpected,
  now: stageNow,
})
const expectedStageIdentityDocument = {
  schemaVersion: 2,
  repository,
  workflow: {
    path: '.github/workflows/release.yml',
    event: 'repository_dispatch',
    headBranch: 'main',
    runId: stageRunExpected.runId,
    runAttempt: Number(stageRunExpected.runAttempt),
    headSha: head,
    status: 'completed',
    conclusion: 'success',
  },
  artifact: {
    id: String(stageArtifactApi.id),
    name: stageArtifactName,
    digest: stageArtifactApi.digest,
    sizeInBytes: stageArtifactApi.size_in_bytes,
    createdAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-10-18T00:00:00.000Z',
  },
  releaseTrustArtifact: {
    id: String(releaseTrustArtifactApi.id),
    name: releaseTrustArtifactName,
    digest: releaseTrustArtifactApi.digest,
    sizeInBytes: releaseTrustArtifactApi.size_in_bytes,
    createdAt: '2026-07-20T00:00:00.120Z',
    expiresAt: '2026-10-18T00:00:00.100Z',
  },
}
must(
  JSON.stringify(stageRunIdentity) === JSON.stringify(expectedStageIdentityDocument),
  'release-stage run/artifact identity document changed bytes',
)
const sharedStageIdentity = validateGitHubActionsRunArtifactsApiSnapshot({
  run: stageRunApi,
  artifacts: stageArtifactsApi,
  expected: {
    repository,
    workflowPath: '.github/workflows/release.yml',
    workflowEvent: 'repository_dispatch',
    headBranch: 'main',
    headSha: head,
    runId: stageRunExpected.runId,
    runAttempt: stageRunExpected.runAttempt,
  },
  artifactExpectations: [
    { label: 'stage artifact', name: stageArtifactName, digest: stageRunExpected.artifactDigest },
    { label: 'release trust artifact', name: releaseTrustArtifactName, digest: stageRunExpected.releaseTrustArtifactDigest },
  ],
  now: stageNow,
  runLabel: 'stage run',
  artifactSetLabel: 'stage artifact',
})
must(
  JSON.stringify({
    schemaVersion: 2,
    repository: sharedStageIdentity.repository,
    workflow: sharedStageIdentity.workflow,
    artifact: sharedStageIdentity.artifacts[0],
    releaseTrustArtifact: sharedStageIdentity.artifacts[1],
  }) === JSON.stringify(stageRunIdentity),
  'release-stage adapter changed the shared GitHub Actions run/artifact identity bytes',
)
must(stageRunIdentity.artifact.digest === `sha256:${stageRunExpected.artifactDigest}`, 'stage run resolver did not retain exact v4 artifact digest')
must(stageRunIdentity.releaseTrustArtifact.digest === `sha256:${stageRunExpected.releaseTrustArtifactDigest}`, 'stage run resolver did not retain exact trust artifact digest')
must(stageRunIdentity.artifact.createdAt === '2026-07-20T00:00:00.000Z', 'whole-second GitHub artifact timestamps were not normalized')
must(stageRunIdentity.releaseTrustArtifact.createdAt === '2026-07-20T00:00:00.120Z', 'fractional GitHub artifact timestamps were not normalized')
const barePathStageRun = structuredClone(stageRunApi)
barePathStageRun.path = '.github/workflows/release.yml'
must(
  validateStageRunApiSnapshot({ run: barePathStageRun, artifacts: stageArtifactsApi, expected: stageRunExpected, now: stageNow }).workflow.path === '.github/workflows/release.yml',
  'stage run resolver did not normalize the documented workflow path variants',
)

for (const [label, mutate, pattern] of [
  ['wrong workflow', (run) => { run.path = '.github/workflows/ci.yml' }, /wrong workflow path/],
  ['wrong workflow ref', (run) => { run.path = '.github/workflows/release.yml@develop' }, /wrong workflow path/],
  ['wrong event', (run) => { run.event = 'workflow_dispatch' }, /wrong event/],
  ['wrong branch', (run) => { run.head_branch = 'develop' }, /wrong head branch/],
  ['wrong head', (run) => { run.head_sha = 'b'.repeat(40) }, /head SHA differs/],
  ['failed conclusion', (run) => { run.conclusion = 'failure' }, /did not complete successfully/],
  ['wrong attempt', (run) => { run.run_attempt = 3 }, /attempt mismatch/],
]) {
  const run = structuredClone(stageRunApi)
  mutate(run)
  expectThrow(
    () => validateStageRunApiSnapshot({ run, artifacts: stageArtifactsApi, expected: stageRunExpected, now: stageNow }),
    pattern,
    `stage run ${label} negative`,
  )
}
const wrongStageDigest = structuredClone(stageArtifactsApi)
wrongStageDigest.artifacts[0].digest = `sha256:${'b'.repeat(64)}`
expectThrow(
  () => validateStageRunApiSnapshot({ run: stageRunApi, artifacts: wrongStageDigest, expected: stageRunExpected, now: stageNow }),
  /digest differs/,
  'stage artifact digest substitution negative',
)
const wrongTrustArtifactDigest = structuredClone(stageArtifactsApi)
wrongTrustArtifactDigest.artifacts[1].digest = `sha256:${'c'.repeat(64)}`
expectThrow(
  () => validateStageRunApiSnapshot({ run: stageRunApi, artifacts: wrongTrustArtifactDigest, expected: stageRunExpected, now: stageNow }),
  /release trust artifact digest differs/,
  'release trust artifact digest substitution negative',
)
const replayedStageArtifact = structuredClone(stageArtifactsApi)
replayedStageArtifact.artifacts[0].workflow_run.id = Number(stageRunExpected.runId) + 1
expectThrow(
  () => validateStageRunApiSnapshot({ run: stageRunApi, artifacts: replayedStageArtifact, expected: stageRunExpected, now: stageNow }),
  /belongs to a different workflow run/,
  'stage artifact cross-run replay negative',
)
const wrongStageArtifactBranch = structuredClone(stageArtifactsApi)
wrongStageArtifactBranch.artifacts[0].workflow_run.head_branch = 'develop'
expectThrow(
  () => validateStageRunApiSnapshot({ run: stageRunApi, artifacts: wrongStageArtifactBranch, expected: stageRunExpected, now: stageNow }),
  /artifact head branch mismatch/,
  'stage artifact wrong-branch replay negative',
)
const expiredStageArtifact = structuredClone(stageArtifactsApi)
expiredStageArtifact.artifacts[0].expired = true
expectThrow(
  () => validateStageRunApiSnapshot({ run: stageRunApi, artifacts: expiredStageArtifact, expected: stageRunExpected, now: stageNow }),
  /artifact is expired/,
  'expired stage artifact negative',
)
const stageRequestPaths = []
const resolvedStageRunIdentity = await resolveStageRunIdentity({
  ...stageRunExpected,
  now: stageNow,
  requestJson: async (path) => {
    stageRequestPaths.push(path)
    return path.includes('/artifacts?') ? stageArtifactsApi : stageRunApi
  },
})
must(JSON.stringify(resolvedStageRunIdentity) === JSON.stringify(stageRunIdentity), 'live stage resolver differs from the pure snapshot validator')
must(stageRequestPaths.join('\n') === [
  `/repos/${repository}/actions/runs/${stageRunExpected.runId}`,
  `/repos/${repository}/actions/runs/${stageRunExpected.runId}/artifacts?per_page=100`,
].join('\n'), 'stage run resolver queried unexpected GitHub endpoints')

const bomArgs = (directory, releaseTag = tag) => [
  '--repo', releaseRepository, '--artifacts', directory,
  '--tag', releaseTag, '--git-head', head, '--git-tree', tree,
  '--repository', repository, '--require-sbom',
]
const runBom = (directory, extra, releaseTag = tag) => {
  return spawnSync(
    process.execPath,
    ['--', 'scripts/build-release-bom.mjs', ...bomArgs(directory, releaseTag), ...extra],
    { cwd: root, encoding: 'utf8' },
  )
}
const bomPath = (directory) => join(directory, 'release-bom.json')

const missingArtifacts = join(temporaryDirectory('release-missing-parent-'), 'release-artifacts')
const missingArtifactsResult = runBom(
  missingArtifacts,
  ['--verify', '--bom', bomPath(missingArtifacts)],
)
expectFail(
  missingArtifactsResult,
  /release verification requires an existing immutable release candidate; release artifacts directory is missing/,
  'missing release candidate negative',
)
must(!/ENOENT/.test(message(missingArtifactsResult)), 'missing release candidate leaked a raw filesystem error')

expectPass(runBom(first.directory, ['--output', bomPath(first.directory)]), 'first deterministic BOM build')
expectPass(runBom(second.directory, ['--output', bomPath(second.directory)]), 'second deterministic BOM build')
must(readFileSync(bomPath(first.directory), 'utf8') === readFileSync(bomPath(second.directory), 'utf8'), 'BOM is not byte-deterministic')

const bom = JSON.parse(readFileSync(bomPath(first.directory), 'utf8'))
must(bom.schemaVersion === 5 && bom.packages.length === 3, 'BOM package set is incomplete')
must(
  bom.supplyChain?.npmProvenance?.workflow === '.github/workflows/release.yml'
    && bom.supplyChain?.npmProvenance?.workflowRef === 'refs/heads/main'
    && bom.supplyChain?.npmProvenance?.predicateType === 'https://slsa.dev/provenance/v1'
    && bom.supplyChain?.immutableGitHubRelease?.required === true
    && bom.supplyChain?.immutableGitHubRelease?.bomAsset === 'release-bom.json',
  'BOM does not bind the trusted npm provenance and immutable GitHub Release policy',
)
must(
  bom.publishOrder.join(',') === '@qijenchen/governance,@qijenchen/storybook-config,@qijenchen/design-system',
  'BOM publish order must keep the consumer-facing design system last',
)
for (const item of bom.packages) {
  must(/^[0-9a-f]{64}$/.test(item.sha256), `${item.name}: missing SHA-256`)
  must(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity), `${item.name}: missing npm SHA-512 SRI`)
  must(/^[0-9a-f]{40}$/.test(item.shasum), `${item.name}: missing npm SHA-1 staged-record binding`)
  must(item.packageJsonSha256 && item.sourceManifestSha256 && item.entryCount >= 2, `${item.name}: archive evidence is incomplete`)
}
must(bom.governance.controlPlane.path === 'governance/control-plane.lock.json', 'BOM does not bind the canonical control plane')
must(
  bom.governance.productTemplateScaffold.path === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET
    && bom.governance.productTemplateScaffold.releaseVersion === bom.releaseVersion
    && bom.governance.productTemplateScaffold.publishedPathCount > 1,
  'BOM does not bind the complete product-template scaffold lock',
)
must(Boolean(bom.sbom?.sha256), 'BOM does not bind the release SBOM')

const loadedBuiltContext = loadReleaseContext({
  artifacts: first.directory,
  bomPath: bomPath(first.directory),
  repository,
  tag,
  gitHead: head,
})
must(loadedBuiltContext.targetVersion === bom.releaseVersion, 'production loader rejected or changed the actual builder BOM')
must(loadedBuiltContext.ordered.map(item => item.name).join(',') === bom.publishOrder.join(','), 'production loader changed builder publish order')
for (const helper of [
  'release-npm-publish.mjs',
  'release-npm-approve.mjs',
  'release-npm-reject.mjs',
  'release-npm-promote.mjs',
  'release-npm-finalize-verify.mjs',
  'release-npm-finalization-receipt.mjs',
  'release-npm-stage-recover.mjs',
]) {
  mustMatch(readFileSync(join(root, 'scripts', helper), 'utf8'), /loadReleaseContext\s*\(/, `${helper} bypasses production BOM loader`)
}
const canonicalBuiltBom = readFileSync(bomPath(first.directory), 'utf8')
const expectBuiltBomRejected = (mutate, pattern, label) => {
  const altered = JSON.parse(canonicalBuiltBom)
  mutate(altered)
  writeFileSync(bomPath(first.directory), `${JSON.stringify(altered, null, 2)}\n`)
  expectThrow(() => loadReleaseContext({
    artifacts: first.directory,
    bomPath: bomPath(first.directory),
    repository,
    tag,
    gitHead: head,
  }), pattern, label)
  writeFileSync(bomPath(first.directory), canonicalBuiltBom)
}
expectBuiltBomRejected((value) => { value.schemaVersion = 4 }, /required schema 5/, 'lower BOM schema negative')
expectBuiltBomRejected((value) => { value.schemaVersion = 6 }, /required schema 5/, 'higher BOM schema negative')
expectBuiltBomRejected((value) => { value.untrusted = true }, /open or incomplete shape/, 'extra BOM field negative')
expectBuiltBomRejected((value) => { delete value.supplyChain }, /open or incomplete shape/, 'missing BOM field negative')

const firstSet = inspectReleaseSet(first.directory)
const secondSet = inspectReleaseSet(second.directory)
must(firstSet.files.length === 6, 'release set is not exactly six files')
must(firstSet.sha256 === secondSet.sha256, 'canonical release-set digest is not deterministic')
must(
  firstSet.files.map((item) => item.name).sort().join(',')
    === [...bom.packages.map((item) => item.file), 'release-bom.json', 'release.sbom.cdx.json', PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET].sort().join(','),
  'release-set allowlist does not exactly match the BOM',
)

const snapshot = (directory) => Object.fromEntries(
  readdirSync(directory).sort().map((name) => [name, hashFile(join(directory, name))]),
)
const beforeVerify = snapshot(first.directory)
expectPass(runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]), 'canonical read-only verification')
must(JSON.stringify(beforeVerify) === JSON.stringify(snapshot(first.directory)), 'read-only verifier changed release evidence')

for (const relativePath of [
  'infra/governance/consumer-upgrade-protocol.json',
  'infra/governance/schemas/consumer-upgrade-protocol.schema.json',
  'infra/governance/lib/consumer-upgrade-protocol.mjs',
]) {
  const protocolSource = join(releaseRepository, relativePath)
  const original = readFileSync(protocolSource)
  writeFileSync(protocolSource, Buffer.concat([original, Buffer.from('\n')]))
  expectFail(
    runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
    /does not bind the exact protected-base reconstruction protocol/,
    `${relativePath} digest substitution negative`,
  )
  writeFileSync(protocolSource, original)
}

const unexpected = join(first.directory, 'unexpected.txt')
writeFileSync(unexpected, 'unexpected\n')
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /must contain exactly 6 allowlisted files/,
  'unexpected file negative',
)
unlinkSync(unexpected)

const unexpectedDirectory = join(first.directory, 'unexpected-directory')
mkdirSync(unexpectedDirectory)
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /must be a regular file/,
  'unexpected directory negative',
)
rmSync(unexpectedDirectory, { recursive: true })

const symlinkTarget = join(temporaryDirectory('release-link-target-'), 'outside.txt')
writeFileSync(symlinkTarget, 'outside\n')
const unexpectedLink = join(first.directory, 'unexpected-link')
symlinkSync(symlinkTarget, unexpectedLink)
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /no directory\/symlink/,
  'unexpected symlink negative',
)
unlinkSync(unexpectedLink)

const governance = first.manifests.find((item) => item.name === '@qijenchen/governance')
const designSystem = first.manifests.find((item) => item.name === '@qijenchen/design-system')
const governanceArchive = join(first.directory, governance.file)
const governanceOriginal = readFileSync(governanceArchive)

const movedArchive = join(temporaryDirectory('release-archive-target-'), governance.file)
renameSync(governanceArchive, movedArchive)
symlinkSync(movedArchive, governanceArchive)
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /regular file \(no symlink\)/,
  'allowlisted archive symlink negative',
)
unlinkSync(governanceArchive)
renameSync(movedArchive, governanceArchive)

writeFileSync(governanceArchive, 'not a gzip archive\n')
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /invalid npm tarball/,
  'fake archive negative',
)
writeFileSync(governanceArchive, governanceOriginal)

copyFileSync(join(first.directory, designSystem.file), governanceArchive)
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /embedded package\/package\.json does not exactly match/,
  'wrong embedded manifest negative',
)
writeFileSync(governanceArchive, governanceOriginal)

const tamperedArchive = Buffer.from(governanceOriginal)
tamperedArchive[Math.floor(tamperedArchive.length / 2)] ^= 0xff
writeFileSync(governanceArchive, tamperedArchive)
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /invalid npm tarball|required publish entry is missing|BOM differs from the exact canonical release set/,
  'post-BOM archive byte tamper negative',
)
writeFileSync(governanceArchive, governanceOriginal)

const canonicalBom = readFileSync(bomPath(first.directory), 'utf8')
const changedBom = JSON.parse(canonicalBom)
changedBom.packages[0].sha256 = '0'.repeat(64)
writeFileSync(bomPath(first.directory), JSON.stringify(changedBom, null, 2) + '\n')
expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)]),
  /BOM differs from the exact canonical release set/,
  'BOM tamper negative',
)
writeFileSync(bomPath(first.directory), canonicalBom)

expectFail(
  runBom(first.directory, ['--verify', '--bom', bomPath(first.directory)], 'v9.9.9'),
  /tag\/version mismatch/,
  'tag/version negative',
)
expectFail(
  spawnSync(process.execPath, [
    'scripts/release-set.mjs', '--artifacts', first.directory, '--expected', '0'.repeat(64),
  ], { cwd: root, encoding: 'utf8' }),
  /release-set digest mismatch/,
  'independent release-set substitution negative',
)

// Remote release identity must be a direct, GitHub-verified signed annotated tag.
const commitOid = 'a'.repeat(40)
const tagObjectOne = 'b'.repeat(40)
const requestedPaths = []
const identity = await resolveRemoteTagIdentity({
  repository,
  tag,
  requestJson: async (path) => {
    requestedPaths.push(path)
    if (path.includes('/git/ref/tags/')) return { ref: `refs/tags/${tag}`, object: { type: 'tag', sha: tagObjectOne } }
    if (path.endsWith(tagObjectOne)) {
      return {
        sha: tagObjectOne,
        tag,
        object: { type: 'commit', sha: commitOid },
        verification: {
          verified: true,
          reason: 'valid',
          signature: 'signed-tag-fixture',
          payload: 'signed-payload-fixture',
          verified_at: '2026-07-20T00:00:00Z',
        },
      }
    }
    fail(`unexpected tag API path: ${path}`)
  },
})
must(identity.commit === commitOid && identity.tagObject === tagObjectOne && requestedPaths.length === 3, 'verified annotated remote tag identity was not fully bound')
assertVerifiedReleaseTag({ identity, expectedCommit: commitOid, expectedTagObject: tagObjectOne })
assertRemoteTagUnchanged({ tag, actual: commitOid, expected: commitOid })
expectThrow(
  () => assertRemoteTagUnchanged({ tag, actual: commitOid, expected: 'd'.repeat(40) }),
  /remote tag moved/,
  'moved remote tag negative',
)
await expectReject(
  () => resolveRemoteTagIdentity({
    repository,
    tag,
    requestJson: async () => ({ ref: `refs/tags/${tag}`, object: { type: 'commit', sha: commitOid } }),
  }),
  /annotated tag object/,
  'lightweight tag negative',
)

// npm lookup classification is deliberately strict: only an actual E404 is publishable.
assertTokenlessNpmEnvironment({ ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-is-required' })
expectThrow(
  () => assertTokenlessNpmEnvironment({ NODE_AUTH_TOKEN: 'long-lived-secret' }),
  /long-lived or injected npm write credentials are forbidden/,
  'npm tokenless trusted-publishing negative',
)
must(
  JSON.stringify(classifyNpmViewResult({ status: 0, stdout: JSON.stringify({ integrity: 'exact' }), stderr: '' }))
    === JSON.stringify({ kind: 'found', value: { integrity: 'exact' } }),
  'npm existing-version result was not classified as found',
)
must(
  classifyNpmViewResult({ status: 1, stdout: JSON.stringify({ error: { code: 'E404' } }), stderr: '' }).kind === 'missing',
  'npm E404 was not classified as missing',
)
must(
  classifyNpmViewResult({ status: 1, stdout: '', stderr: 'npm error code E500 registry unavailable' }).kind === 'error',
  'non-E404 npm failure was not fail-closed',
)
must(
  classifyNpmViewResult({
    status: 1,
    stdout: '',
    stderr: 'npm error code E500\nupstream mentioned E404 while unavailable',
  }).kind === 'error',
  'incidental E404 text in a non-E404 npm failure was not fail-closed',
)
expectThrow(
  () => decideNpmStageAction({
    name: '@qijenchen/governance', version: first.version, versionState: { kind: 'found', value: {} },
  }),
  /already public/,
  'already-public exact version staging negative',
)
must(
  decideNpmStageAction({
    name: '@qijenchen/governance', version: first.version,
    versionState: { kind: 'missing' }, packageState: { kind: 'found', value: '@qijenchen/governance' },
  }) === 'stage-missing-version',
  'E404 version under an existing package is not routed to native staging',
)
expectThrow(
  () => decideNpmStageAction({
    name: '@qijenchen/governance', version: first.version,
    versionState: { kind: 'missing' }, packageState: { kind: 'missing' },
  }),
  /Native npm staged publishing cannot create a package[\s\S]*bootstrap version/,
  'npm first-publication bootstrap negative',
)
expectThrow(
  () => decideNpmStageAction({
    name: '@qijenchen/governance', version: first.version, versionState: { kind: 'error' },
  }),
  /safe E404 state/,
  'npm non-E404 decision negative',
)

// npm cannot atomically move a channel across packages. The helper therefore permits only a
// monotonic publishOrder prefix as a resumable partial state and rejects every other split.
const trainNames = bom.publishOrder
const previousVersion = first.version.replace(/(\d+)$/, (value) => String(Number(value) - 1))
const futureVersion = first.version.replace(/(\d+)$/, (value) => String(Number(value) + 1))
must(compareReleaseVersions(first.version, previousVersion) === 1, 'release version ordering rejected a newer beta')
must(compareReleaseVersions(futureVersion, first.version) === 1, 'release fixture future version must remain newer than the target')
must(compareReleaseVersions('1.0.0', '1.0.0-beta.99') === 1, 'stable release must sort above its prerelease')
must(stagingTagForVersion(first.version) === `governance-stage-${first.version}`, 'isolated staging tag is not deterministic')
const alignedTags = Object.fromEntries(trainNames.map((name) => [name, previousVersion]))
const readyPlan = planReleaseChannelPromotion({
  orderedNames: trainNames,
  targetVersion: first.version,
  targetTag: bom.npmDistTag,
  tagVersions: alignedTags,
})
must(
  readyPlan.status === 'ready'
    && JSON.stringify(readyPlan.baselineVersions) === JSON.stringify(alignedTags)
    && readyPlan.promotedCount === 0,
  'aligned release channel did not produce a fresh promotion plan',
)
const bootstrapVersion = '0.1.0-beta.0'
const skewedTags = {
  [trainNames[0]]: bootstrapVersion,
  [trainNames[1]]: previousVersion,
  [trainNames[2]]: previousVersion,
}
const skewHealingPlan = planReleaseChannelPromotion({
  orderedNames: trainNames,
  targetVersion: first.version,
  targetTag: bom.npmDistTag,
  tagVersions: skewedTags,
})
must(
  skewHealingPlan.status === 'ready'
    && JSON.stringify(skewHealingPlan.baselineVersions) === JSON.stringify(skewedTags)
    && skewHealingPlan.promotedCount === 0,
  'beta.0/beta.93/beta.93 baseline skew was not accepted for monotonic healing to beta.94',
)
assertExpectedChannelProgress(skewHealingPlan, structuredClone(skewHealingPlan))
expectThrow(
  () => assertExpectedChannelProgress(
    { ...skewHealingPlan, baselineVersions: { ...skewedTags, [trainNames[1]]: '0.1.0-beta.92' } },
    skewHealingPlan,
  ),
  /release channel changed concurrently/,
  'per-package baseline concurrent-change negative',
)
const partialTags = { ...alignedTags, [trainNames[0]]: first.version }
const partialPlan = planReleaseChannelPromotion({
  orderedNames: trainNames,
  targetVersion: first.version,
  targetTag: bom.npmDistTag,
  tagVersions: partialTags,
})
must(
  partialPlan.status === 'partial'
    && JSON.stringify(partialPlan.baselineVersions) === JSON.stringify(partialTags)
    && partialPlan.promotedCount === 1,
  'partial train retry did not resume the exact promotion-order prefix',
)
const completePlan = planReleaseChannelPromotion({
  orderedNames: trainNames,
  targetVersion: first.version,
  targetTag: bom.npmDistTag,
  tagVersions: Object.fromEntries(trainNames.map((name) => [name, first.version])),
})
must(completePlan.status === 'complete' && completePlan.promotedCount === 3, 'completed train retry is not a no-op')
expectThrow(
  () => planReleaseChannelPromotion({
    orderedNames: trainNames,
    targetVersion: previousVersion,
    targetTag: bom.npmDistTag,
    tagVersions: Object.fromEntries(trainNames.map((name) => [name, first.version])),
  }),
  /downgrade\/replay forbidden/,
  'old missing exact version downgrade negative',
)
expectThrow(
  () => planReleaseChannelPromotion({
    orderedNames: trainNames,
    targetVersion: first.version,
    targetTag: bom.npmDistTag,
    tagVersions: { ...alignedTags, [trainNames[1]]: first.version },
  }),
  /non-resumable split-brain promotion order/,
  'out-of-order split channel negative',
)
expectThrow(
  () => planReleaseChannelPromotion({
    orderedNames: trainNames,
    targetVersion: first.version,
    targetTag: bom.npmDistTag,
    tagVersions: { ...skewedTags, [trainNames[2]]: futureVersion },
  }),
  /downgrade\/replay forbidden for/,
  'target lower than one skewed package baseline negative',
)
expectThrow(
  () => planReleaseChannelPromotion({
    orderedNames: trainNames,
    targetVersion: first.version,
    targetTag: bom.npmDistTag,
    tagVersions: Object.fromEntries(trainNames.map((name) => [name, null])),
  }),
  /channel beta has never been bootstrapped|channel latest has never been bootstrapped/,
  'unbootstrapped channel negative',
)
expectThrow(
  () => planReleaseChannelPromotion({
    orderedNames: trainNames,
    targetVersion: first.version,
    targetTag: bom.npmDistTag,
    tagVersions: { ...alignedTags, [trainNames[2]]: null },
  }),
  /one or more package tags are missing/,
  'partially missing channel negative',
)

expectThrow(
  () => assertInteractivePromotionEnvironment({ environment: {}, stdinIsTTY: false, stdoutIsTTY: true }),
  /real interactive TTY/,
  'non-interactive promotion negative',
)
expectThrow(
  () => assertInteractivePromotionEnvironment({
    environment: { NPM_TOKEN: 'forbidden' }, stdinIsTTY: true, stdoutIsTTY: true,
  }),
  /npm write credentials are forbidden/,
  'injected promotion token negative',
)
assertInteractivePromotionEnvironment({ environment: {}, stdinIsTTY: true, stdoutIsTTY: true })

const releaseContext = {
  releaseSet: firstSet,
  bom,
  bomPath: bomPath(first.directory),
  ordered: bom.publishOrder.map((name) => bom.packages.find((item) => item.name === name)),
  targetVersion: bom.releaseVersion,
  targetTag: bom.npmDistTag,
  stagingTag: stagingTagForVersion(bom.releaseVersion),
  identity: { repository, tag, gitHead: head },
}
const releaseAuthorizationDigest = 'c'.repeat(64)
const releaseTrustEvidenceDigest = 'd'.repeat(64)
const releaseTrustEvidenceBytes = Buffer.from('{"fixture":"exact historical release trust evidence"}\n')
const releaseTrustEvidenceFileSha256 = sha256(releaseTrustEvidenceBytes)
const releaseTrust = {
  authorizationDigest: releaseAuthorizationDigest,
  evidenceSha256: releaseTrustEvidenceDigest,
  evidenceFileSha256: releaseTrustEvidenceFileSha256,
  tagObject: tagObjectOne,
  artifact: {
    name: releaseTrustArtifactName,
    digest: `sha256:${stageRunExpected.releaseTrustArtifactDigest}`,
    workflow: {
      path: '.github/workflows/release.yml',
      event: 'repository_dispatch',
      headBranch: 'main',
      headSha: head,
      runId: stageRunExpected.runId,
      runAttempt: Number(stageRunExpected.runAttempt),
    },
  },
}
const releaseTrustExpected = {
  authorizationDigest: releaseAuthorizationDigest,
  evidenceSha256: releaseTrustEvidenceDigest,
  evidenceFileSha256: releaseTrustEvidenceFileSha256,
  tagObject: tagObjectOne,
  artifactDigest: stageRunExpected.releaseTrustArtifactDigest,
  runId: stageRunExpected.runId,
  runAttempt: stageRunExpected.runAttempt,
  headSha: head,
}
const stageReceipt = createStageReceipt(releaseContext, releaseTrust)
validateStageReceipt(stageReceipt, releaseContext)
for (let index = 0; index < releaseContext.ordered.length; index += 1) {
  const item = releaseContext.ordered[index]
  const stageId = `0000000${index + 1}-0000-4000-8000-00000000000${index + 1}`
  const parsed = validateStagePublishJson({
    [item.name]: {
      name: item.name,
      version: item.version,
      integrity: item.integrity,
      shasum: item.shasum,
      stageId,
    },
  }, item)
  stageReceipt.packages[index].status = 'staged'
  stageReceipt.packages[index].stageId = parsed.stageId
}
stageReceipt.state = 'awaiting-platform-confirmation'
validateStageReceipt(stageReceipt, releaseContext, { requireComplete: true })
const receiptPath = join(temporaryDirectory('stage-receipt-test-'), 'npm-stage-receipt.json')
writeAtomicJson(receiptPath, stageReceipt)
const writtenReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
validateStageReceipt(writtenReceipt, releaseContext, { requireComplete: true, releaseTrustExpected })
must(/^[0-9a-f]{64}$/.test(sha256File(receiptPath)), 'atomic stage receipt has no stable SHA-256')
const receiptSchemaAjv = new Ajv2020({ strict: true, allErrors: true })
const stageReceiptSchema = JSON.parse(readFileSync(join(root, 'scripts/schemas/npm-stage-receipt.schema.json'), 'utf8'))
const finalizationReceiptSchema = JSON.parse(readFileSync(join(root, 'scripts/schemas/npm-finalization-receipt.schema.json'), 'utf8'))
receiptSchemaAjv.addSchema(stageReceiptSchema)
const validateStageReceiptSchema = receiptSchemaAjv.getSchema(stageReceiptSchema.$id)
const validateFinalizationReceiptSchema = receiptSchemaAjv.compile(finalizationReceiptSchema)
must(validateStageReceiptSchema(writtenReceipt), `stage receipt failed its closed schema: ${JSON.stringify(validateStageReceiptSchema.errors)}`)
const tamperedReceipt = structuredClone(writtenReceipt)
tamperedReceipt.releaseSetSha256 = '0'.repeat(64)
expectThrow(
  () => validateStageReceipt(tamperedReceipt, releaseContext, { requireComplete: true }),
  /plan\/digest does not match/,
  'stage receipt release-set substitution negative',
)
const openStageReceipt = structuredClone(writtenReceipt)
openStageReceipt.untrusted = true
expectThrow(
  () => validateStageReceipt(openStageReceipt, releaseContext, { requireComplete: true, releaseTrustExpected }),
  /open shape/,
  'stage receipt open-shape negative',
)
const substitutedTrustReceipt = structuredClone(writtenReceipt)
substitutedTrustReceipt.releaseTrust.authorizationDigest = 'e'.repeat(64)
expectThrow(
  () => validateStageReceipt(substitutedTrustReceipt, releaseContext, { requireComplete: true, releaseTrustExpected }),
  /audit chain differs/,
  'stage receipt release authorization substitution negative',
)
const substitutedTagObjectReceipt = structuredClone(writtenReceipt)
substitutedTagObjectReceipt.releaseTrust.tagObject = 'f'.repeat(40)
expectThrow(
  () => validateStageReceipt(substitutedTagObjectReceipt, releaseContext, { requireComplete: true, releaseTrustExpected }),
  /audit chain differs/,
  'same-commit substituted tag-object receipt negative',
)
const substitutedTrustFileReceipt = structuredClone(writtenReceipt)
substitutedTrustFileReceipt.releaseTrust.evidenceFileSha256 = 'f'.repeat(64)
expectThrow(
  () => validateStageReceipt(substitutedTrustFileReceipt, releaseContext, { requireComplete: true, releaseTrustExpected }),
  /audit chain differs/,
  'stage receipt exact trust-evidence file substitution negative',
)

const exactTagMap = Object.fromEntries(releaseContext.ordered.map((item) => [item.name, item.version]))
const finalizationReceipt = {
  schemaVersion: 3,
  state: 'certified',
  source: { ...releaseContext.identity, gitTree: bom.source.gitTree },
  releaseTrust,
  releaseSetSha256: firstSet.sha256,
  bomSha256: sha256File(bomPath(first.directory)),
  stageReceiptSha256: sha256File(receiptPath),
  stageRun: stageRunIdentity,
  finalizerRun: {
    workflow: '.github/workflows/release-finalize.yml',
    event: 'repository_dispatch',
    runId: '555555555',
    runAttempt: 1,
  },
  stagingTag: releaseContext.stagingTag,
  targetTag: releaseContext.targetTag,
  targetVersion: releaseContext.targetVersion,
  publishOrder: bom.publishOrder,
  stageIds: Object.fromEntries(writtenReceipt.packages.map((item) => [item.name, item.stageId])),
  isolatedTags: exactTagMap,
  targetTags: exactTagMap,
  packages: releaseContext.ordered.map((item) => ({
    name: item.name, version: item.version, integrity: item.integrity, shasum: item.shasum,
  })),
  certifiedAt: '2026-07-20T01:00:00.000Z',
  updatedAt: '2026-07-20T01:00:01.000Z',
}
const finalizationValidation = {
  stageReceiptSha256: sha256File(receiptPath),
  stageRunIdentity,
  stageRunExpected,
  finalizerRunId: '555555555',
  finalizerRunAttempt: '1',
  releaseTrustExpected,
  now: stageNow,
}
validateFinalizationReceipt(finalizationReceipt, releaseContext, finalizationValidation)
must(validateFinalizationReceiptSchema(finalizationReceipt), `finalization receipt failed its closed schema: ${JSON.stringify(validateFinalizationReceiptSchema.errors)}`)
const splitFinalization = structuredClone(finalizationReceipt)
splitFinalization.targetTags[releaseContext.ordered[2].name] = previousVersion
expectThrow(
  () => validateFinalizationReceipt(splitFinalization, releaseContext, finalizationValidation),
  /does not certify both isolated and target tags/,
  'split target-tag finalization negative',
)
const replayedFinalization = structuredClone(finalizationReceipt)
replayedFinalization.finalizerRun.runId = '555555556'
expectThrow(
  () => validateFinalizationReceipt(replayedFinalization, releaseContext, finalizationValidation),
  /different finalizer run \(replay forbidden\)/,
  'finalization run replay negative',
)
const substitutedStageRun = structuredClone(finalizationReceipt)
substitutedStageRun.stageRun.artifact.digest = `sha256:${'b'.repeat(64)}`
expectThrow(
  () => validateFinalizationReceipt(substitutedStageRun, releaseContext, finalizationValidation),
  /stage run\/artifact identity drifted/,
  'finalization stage artifact substitution negative',
)
const substitutedFinalTrust = structuredClone(finalizationReceipt)
substitutedFinalTrust.releaseTrust.evidenceSha256 = 'f'.repeat(64)
expectThrow(
  () => validateFinalizationReceipt(substitutedFinalTrust, releaseContext, finalizationValidation),
  /audit chain differs/,
  'finalization trust evidence substitution negative',
)
const substitutedFinalTagObject = structuredClone(finalizationReceipt)
substitutedFinalTagObject.releaseTrust.tagObject = 'f'.repeat(40)
expectThrow(
  () => validateFinalizationReceipt(substitutedFinalTagObject, releaseContext, finalizationValidation),
  /audit chain differs/,
  'finalization original tag-object substitution negative',
)
const substitutedFinalTrustFile = structuredClone(finalizationReceipt)
substitutedFinalTrustFile.releaseTrust.evidenceFileSha256 = 'f'.repeat(64)
expectThrow(
  () => validateFinalizationReceipt(substitutedFinalTrustFile, releaseContext, finalizationValidation),
  /audit chain differs/,
  'finalization exact trust-evidence file substitution negative',
)
const finalizationEvidenceDirectory = temporaryDirectory('release-finalization-evidence-')
const auditEvidencePath = join(finalizationEvidenceDirectory, 'npm-finalization-receipt.json')
writeFileSync(auditEvidencePath, `${JSON.stringify(finalizationReceipt, null, 2)}\n`)
const auditEvidenceItem = {
  name: 'npm-finalization-receipt.json',
  size: readFileSync(auditEvidencePath).length,
  sha256: sha256File(auditEvidencePath),
}
const releaseTrustEvidencePath = join(finalizationEvidenceDirectory, 'release-trust-preflight.json')
writeFileSync(releaseTrustEvidencePath, releaseTrustEvidenceBytes)
const releaseTrustEvidenceItem = {
  name: 'release-trust-preflight.json',
  size: readFileSync(releaseTrustEvidencePath).length,
  sha256: sha256File(releaseTrustEvidencePath),
}

const provenanceItem = bom.packages[0]
const provenanceExpected = {
  ...provenanceItem,
  repository,
  tag,
  gitHead: head,
}
const expectedPurl = `pkg:npm/${encodeURIComponent(provenanceItem.name).replace('%2F', '/')}@${provenanceItem.version}`
const expectedSha512 = Buffer.from(provenanceItem.integrity.slice('sha512-'.length), 'base64').toString('hex')
const provenanceStatement = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: expectedPurl, digest: { sha512: expectedSha512 } }],
  predicateType: 'https://slsa.dev/provenance/v1',
  predicate: {
    buildDefinition: {
      externalParameters: {
        workflow: {
          repository: `https://github.com/${repository}`,
          path: '.github/workflows/release.yml',
          ref: 'refs/heads/main',
        },
      },
      resolvedDependencies: [{
        uri: `git+https://github.com/${repository}@refs/heads/main`,
        digest: { gitCommit: head },
      }],
    },
    runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } },
  },
}
validateProvenanceStatement(provenanceStatement, provenanceExpected)
const wrongSRI = structuredClone(provenanceStatement)
wrongSRI.subject[0].digest.sha512 = '0'.repeat(128)
expectThrow(
  () => validateProvenanceStatement(wrongSRI, provenanceExpected),
  /does not bind the exact npm SHA-512/,
  'provenance SRI negative',
)
const wrongCommit = structuredClone(provenanceStatement)
wrongCommit.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'f'.repeat(40)
expectThrow(
  () => validateProvenanceStatement(wrongCommit, provenanceExpected),
  /exact protected-main release commit/,
  'provenance commit negative',
)
const wrongWorkflowRef = structuredClone(provenanceStatement)
wrongWorkflowRef.predicate.buildDefinition.externalParameters.workflow.ref = `refs/tags/${tag}`
expectThrow(
  () => validateProvenanceStatement(wrongWorkflowRef, provenanceExpected),
  /workflow identity/,
  'provenance protected-main ref negative',
)

// A stateful fake gh CLI proves draft resume, exact uploads, immutable verification, and no-op retry.
const fakeDirectory = temporaryDirectory('release-gh-test-')
const fakeGh = join(fakeDirectory, 'gh')
const fakeTagFetch = join(fakeDirectory, 'tag-fetch.mjs')
const fakeState = join(fakeDirectory, 'state.json')
const fakeLog = join(fakeDirectory, 'commands.log')
const fakeGhControl = join(fakeDirectory, 'control.json')
writeFileSync(fakeTagFetch, `
const repository = process.env.FAKE_TAG_REPOSITORY
const tag = process.env.FAKE_TAG_NAME
const tagObject = process.env.FAKE_TAG_OBJECT
const commit = process.env.FAKE_GH_COMMIT
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
})
globalThis.fetch = async (input) => {
  const path = new URL(String(input)).pathname
  if (path === '/repos/' + repository + '/git/ref/tags/' + tag) {
    return json({ ref: 'refs/tags/' + tag, object: { type: 'tag', sha: tagObject } })
  }
  if (path === '/repos/' + repository + '/git/tags/' + tagObject) {
    return json({
      sha: tagObject,
      tag,
      object: { type: 'commit', sha: commit },
      verification: {
        verified: true,
        reason: 'valid',
        signature: 'signed-tag-fixture',
        payload: 'signed-payload-fixture',
        verified_at: '2026-07-20T00:00:00Z',
      },
    })
  }
  return json({ message: 'unexpected fake tag request: ' + path }, 404)
}
`)
writeFileSync(fakeGh, `#!${process.execPath}
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { basename } = require('node:path')
const args = process.argv.slice(2)
if (process.env.GH_TOKEN !== 'fixture-writer-token') {
  process.stderr.write('closed gh fixture did not receive the exact writer token\\n')
  process.exit(96)
}
const leaked = Object.keys(process.env).filter((name) => (
  name.startsWith('FAKE_')
    || name.startsWith('AWS_')
    || name === 'NPM_TOKEN'
    || name === 'NODE_OPTIONS'
    || name === 'TAG_READ_TOKEN'
))
if (leaked.length) {
  process.stderr.write('closed gh fixture received ambient secrets:' + leaked.sort().join(',') + '\\n')
  process.exit(97)
}
const logPath = ${JSON.stringify(fakeLog)}
const statePath = ${JSON.stringify(fakeState)}
const control = JSON.parse(readFileSync(${JSON.stringify(fakeGhControl)}, 'utf8'))
appendFileSync(logPath, JSON.stringify(args) + '\\n')
const readState = () => JSON.parse(readFileSync(statePath, 'utf8'))
const writeState = (state) => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\\n')
const flag = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const fail = (body) => { process.stderr.write(body + '\\n'); process.exit(1) }
if (args[0] === 'api') {
  if (args[1].includes('/immutable-releases')) {
    const checks = readFileSync(logPath, 'utf8').split('\\n').filter(line => line.includes('immutable-releases')).length
    const max = Number(control.immutableMaxChecks || '999')
    if (control.immutableEnabled === '0' || checks > max) fail('HTTP 404 immutable releases disabled')
    process.stdout.write(JSON.stringify({ enabled: true, enforced_by_owner: false }))
    process.exit(0)
  }
  if (args[1].includes('/git/ref/tags/')) {
    process.stdout.write(JSON.stringify({ object: { type: 'commit', sha: ${JSON.stringify(head)} } }))
    process.exit(0)
  }
  fail('unsupported fake GitHub API path')
}
if (args[0] !== 'release') fail('unsupported fake gh namespace')
const command = args[1]
const tag = args[2]
if (command === 'view') {
  if (!existsSync(statePath)) fail('release not found')
  process.stdout.write(JSON.stringify(readState()))
  process.exit(0)
}
if (command === 'create') {
  if (existsSync(statePath)) fail('release already exists')
  writeState({ tagName: tag, name: tag, isDraft: true, isImmutable: false, isPrerelease: false, targetCommitish: 'main', assets: [] })
  process.exit(0)
}
if (!existsSync(statePath)) fail('release not found')
const state = readState()
if (command === 'upload') {
  const path = args[3]
  const name = basename(path)
  if (state.assets.some((asset) => asset.name === name)) fail('asset already exists')
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  state.assets.push({ name, digest: 'sha256:' + digest })
  writeState(state)
  process.exit(0)
}
if (command === 'edit') {
  state.isDraft = false
  state.isImmutable = true
  state.isPrerelease = args.includes('--prerelease=true')
  writeState(state)
  process.exit(0)
}
if (command === 'verify') {
  if (state.isDraft || !state.isImmutable) fail('release is not immutable')
  process.exit(0)
}
if (command === 'verify-asset') {
  const path = args[3]
  const digest = 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex')
  const asset = state.assets.find((item) => item.name === basename(path))
  if (!asset || asset.digest !== digest) fail('asset verification failed')
  process.exit(0)
}
fail('unsupported fake gh command: ' + command)
`)
chmodSync(fakeGh, 0o755)
const githubArgs = [
  '--artifacts', first.directory,
  '--repository', repository, '--tag', tag, '--git-head', head,
  '--tag-object', tagObjectOne, '--tag-token-env', 'FAKE_TAG_READ_TOKEN', '--gh', fakeGh,
  '--audit-evidence', auditEvidencePath, '--audit-evidence-sha256', auditEvidenceItem.sha256,
  '--release-trust-evidence', releaseTrustEvidencePath,
  '--release-trust-evidence-sha256', releaseTrustEvidenceItem.sha256,
]
const runGithubRelease = (env = {}, cliArgs = githubArgs) => {
  writeFileSync(fakeGhControl, JSON.stringify({
    immutableEnabled: env.FAKE_IMMUTABLE_ENABLED ?? '1',
    immutableMaxChecks: env.FAKE_IMMUTABLE_MAX_CHECKS ?? '999',
  }))
  return spawnSync(process.execPath, ['--', 'scripts/release-github-release.mjs', ...cliArgs], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${pathToFileURL(fakeTagFetch).href}`].filter(Boolean).join(' '),
      GH_TOKEN: 'fixture-writer-token',
      FAKE_GH_COMMIT: head,
      FAKE_TAG_REPOSITORY: repository,
      FAKE_TAG_NAME: tag,
      FAKE_TAG_OBJECT: tagObjectOne,
      FAKE_TAG_READ_TOKEN: 'fixture-token',
      AWS_SECRET_ACCESS_KEY: 'must-not-reach-gh',
      NPM_TOKEN: 'must-not-reach-gh',
      ...env,
    },
  })
}
const readLog = () => existsSync(fakeLog)
  ? readFileSync(fakeLog, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : []
const draftState = (assets = []) => ({
  tagName: tag,
  name: tag,
  isDraft: true,
  isImmutable: false,
  isPrerelease: false,
  targetCommitish: 'main',
  assets,
})
const githubReleaseFiles = [...firstSet.files, auditEvidenceItem, releaseTrustEvidenceItem]
const exactAssets = githubReleaseFiles.map((item) => ({ name: item.name, digest: `sha256:${item.sha256}` }))
must(compareReleaseAssets(draftState(exactAssets), githubReleaseFiles).length === 0, 'exact GitHub assets did not compare cleanly')
must(compareReleaseAssets(draftState(exactAssets.slice(0, 2)), githubReleaseFiles).length === 6, 'missing GitHub assets were not detected')
expectThrow(
  () => compareReleaseAssets(draftState([...exactAssets, { name: 'extra.txt', digest: `sha256:${'0'.repeat(64)}` }]), githubReleaseFiles),
  /unexpected assets/,
  'unexpected GitHub asset negative',
)
expectThrow(
  () => compareReleaseAssets(draftState(exactAssets), [...githubReleaseFiles, releaseTrustEvidenceItem]),
  /duplicate names/,
  'duplicate expected GitHub asset negative',
)
expectThrow(
  () => compareReleaseAssets(draftState([...exactAssets, exactAssets[0]]), githubReleaseFiles),
  /duplicate\/invalid asset names/,
  'duplicate actual GitHub asset negative',
)

const substitutedTrustEvidenceArgs = [...githubArgs]
substitutedTrustEvidenceArgs[substitutedTrustEvidenceArgs.indexOf('--release-trust-evidence-sha256') + 1] = '0'.repeat(64)
rmSync(fakeLog, { force: true })
expectFail(
  runGithubRelease({}, substitutedTrustEvidenceArgs),
  /release trust evidence digest differs/,
  'substituted permanent trust-evidence digest negative',
)
must(!readLog().some((args) => ['create', 'upload', 'edit'].includes(args[1])), 'trust-evidence digest mismatch triggered a release mutation')

writeFileSync(fakeState, JSON.stringify(draftState(exactAssets.slice(0, 2)), null, 2) + '\n')
expectPass(runGithubRelease(), 'partial GitHub draft resume')
const resumed = JSON.parse(readFileSync(fakeState, 'utf8'))
must(!resumed.isDraft && resumed.isImmutable && resumed.isPrerelease === tag.includes('-'), 'resumed GitHub Release is not exact and immutable')
must(compareReleaseAssets(resumed, githubReleaseFiles).length === 0, 'resumed GitHub Release assets are incomplete')
const firstRunCommands = readLog()
must(firstRunCommands.filter((args) => args[1] === 'upload').length === 6, 'draft resume did not upload only the six missing assets')
must(firstRunCommands.filter((args) => args[1] === 'edit').length === 1, 'draft resume did not publish exactly once')

const retryStart = firstRunCommands.length
expectPass(runGithubRelease(), 'fully published GitHub Release no-op retry')
const retryCommands = readLog().slice(retryStart)
must(!retryCommands.some((args) => ['create', 'upload', 'edit'].includes(args[1])), 'no-op retry mutated an immutable GitHub Release')
must(retryCommands.some((args) => args[1] === 'verify'), 'no-op retry skipped immutable release verification')
must(retryCommands.filter((args) => args[1] === 'verify-asset').length === 8, 'no-op retry did not verify the six-file release set plus both evidence assets')

rmSync(fakeState, { force: true })
rmSync(fakeLog, { force: true })
const disabled = runGithubRelease({ FAKE_IMMUTABLE_ENABLED: '0' })
must(disabled.status !== 0, 'disabled immutable releases unexpectedly allowed draft creation')
must(!readLog().some((args) => args[0] === 'release' && args[1] === 'create'), 'draft was created before immutable-release preflight')
must(!existsSync(fakeState), 'disabled immutable-release preflight left a draft behind')

rmSync(fakeLog, { force: true })
const disabledAfterInspection = runGithubRelease({ FAKE_IMMUTABLE_MAX_CHECKS: '1' })
must(disabledAfterInspection.status !== 0, 'immutable-release disable race unexpectedly allowed draft creation')
must(!readLog().some((args) => args[0] === 'release' && args[1] === 'create'), 'draft was created after immutable releases were disabled between preflights')
must(!existsSync(fakeState), 'immutable-release disable race left a mutable draft behind')

rmSync(fakeLog, { force: true })
expectPass(runGithubRelease(), 'new GitHub draft assembly')
const newCommands = readLog()
must(newCommands.filter((args) => args[1] === 'create').length === 1, 'new release did not create one draft')
must(newCommands.filter((args) => args[1] === 'upload').length === 8, 'new release did not upload the exact six-file set plus both evidence assets')
must(newCommands.filter((args) => args[1] === 'edit').length === 1, 'new release did not publish exactly once')

writeFileSync(fakeState, JSON.stringify(draftState([{ ...exactAssets[0], digest: `sha256:${'0'.repeat(64)}` }]), null, 2) + '\n')
rmSync(fakeLog, { force: true })
expectFail(runGithubRelease(), /has digest/, 'wrong existing GitHub asset negative')
must(!readLog().some((args) => ['create', 'upload', 'edit'].includes(args[1])), 'wrong existing asset triggered a mutation')

writeFileSync(fakeState, JSON.stringify({ ...draftState(exactAssets), name: 'wrong-title' }, null, 2) + '\n')
rmSync(fakeLog, { force: true })
expectFail(runGithubRelease(), /title mismatch/, 'wrong GitHub Release identity negative')
must(!readLog().some((args) => ['create', 'upload', 'edit'].includes(args[1])), 'wrong release identity triggered a mutation')

console.log('✅ RELEASE SUPPLY-CHAIN TEST PASS')
console.log('   exact six-file deterministic set + scaffold-lock/symlink/directory/extra/tamper rejection')
console.log('   closed stage/finalization receipts bind authorization, semantic trust evidence, exact evidence bytes, and original successful run/artifacts')
console.log('   remote tag guard + npm provenance + immutable GitHub draft resume with both permanent evidence assets')
