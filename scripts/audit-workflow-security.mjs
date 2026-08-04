#!/usr/bin/env node
// Dependency-free, fail-closed GitHub Actions policy. Provider hooks are advisory;
// this repository check keeps workflow trust boundaries enforceable in CI.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_DIRS = ['.github/workflows', 'template/ds-product-template/.github/workflows']
const REQUIRED_PR_WORKFLOWS = [
  '.github/workflows/ci.yml',
  'template/ds-product-template/.github/workflows/audit.yml',
]

function workflowFiles(root) {
  return WORKFLOW_DIRS.flatMap((directory) => {
    const absolute = join(root, directory)
    if (!existsSync(absolute)) return []
    return readdirSync(absolute)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort()
      .map((name) => join(absolute, name))
  })
}
function hasNearbyPersistFalse(lines, index) {
  const indent = lines[index].match(/^\s*/)[0].length
  for (let i = index + 1; i < Math.min(lines.length, index + 16); i += 1) {
    const line = lines[i]
    if (/^\s*-\s+(?:name:|uses:|run:)/.test(line) && line.match(/^\s*/)[0].length <= indent) break
    if (/^\s*persist-credentials:\s*false(?:\s+#.*)?$/.test(line)) return true
  }
  return false
}

function workflowJobBlocks(source) {
  const lines = source.split(/\r?\n/)
  const jobsAt = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line))
  if (jobsAt < 0) return new Map()
  const starts = []
  for (let index = jobsAt + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$/)
    if (match) starts.push({ id: match[1], index })
  }
  return new Map(starts.map((entry, index) => {
    const end = starts[index + 1]?.index ?? lines.length
    return [entry.id, lines.slice(entry.index, end).join('\n')]
  }))
}

function workflowStepBlocks(block) {
  const lines = block.split(/\r?\n/)
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (/^      - [A-Za-z0-9_-]+:/.test(lines[index])) starts.push(index)
  }
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join('\n'))
}

function stepRunSource(block) {
  const lines = block.split(/\r?\n/)
  const runAt = lines.findIndex(line => /^(?:      - |        )run:\s*/.test(line))
  if (runAt < 0) return null
  const match = lines[runAt].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/)
  if (!match) return null
  const scalar = match[2]
  if (!/^[>|][+-]?\s*(?:#.*)?$/.test(scalar)) return scalar.trim() || null
  const bodyIndent = match[1].length + 2
  const body = []
  for (let index = runAt + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === '') {
      body.push('')
      continue
    }
    const indentation = line.match(/^\s*/)[0].length
    if (indentation < bodyIndent) break
    body.push(line.slice(bodyIndent))
  }
  while (body.at(-1) === '') body.pop()
  return body.length > 0 ? body.join('\n') : null
}

function dynamicNodeCodeKind(runSource) {
  if (typeof runSource !== 'string' || runSource.length === 0) return null
  const source = executableSource(runSource).replace(/\\\r?\n/g, ' ')
  const commandBoundary = '(?:^|[\\n;&|])\\s*'
  const assignments = String.raw`(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^\s;&|]+))\s+)*`
  const wrappers = '(?:(?:if|then|do|!)\\s+)?(?:(?:env(?:\\s+-i)?|sudo(?:\\s+-u\\s+[^\\s;&|]+)?)\\s+)?'
  const node = String.raw`(?:(?:"[^"\n]+"|'[^'\n]+'|[^\s;&|]+)/)?node`
  const runtimeFlags = '(?:(?:--[A-Za-z0-9-]+(?:=[^\\s;&|]+)?|-{1}[A-Za-z])\\s+)*'
  const dynamicFlag = new RegExp(
    `${commandBoundary}${assignments}${wrappers}${node}\\s+${runtimeFlags}(?:-e|-p|--eval|--print)(?=\\s|=|$)`,
    'm',
  )
  if (dynamicFlag.test(source)) return 'dynamic flag'

  const stdinCommand = new RegExp(
    `${commandBoundary}${assignments}${wrappers}${node}(?:\\s+(?:--[A-Za-z0-9-]+(?:=[^\\s;&|]+)?))*\\s*(?:-\\s*)?(?:<<|<\\s*\\/dev\\/stdin|\\/dev\\/stdin(?=\\s|$))`,
    'm',
  )
  if (stdinCommand.test(source)) return 'stdin code'
  const pipedStdin = new RegExp(
    `\\|\\s*${assignments}${wrappers}${node}(?:\\s+-|\\s+\\/dev\\/stdin)?\\s*(?=$|[;&|\\n])`,
    'm',
  )
  if (pipedStdin.test(source)) return 'piped stdin code'
  const bareNode = new RegExp(
    `${commandBoundary}${assignments}${wrappers}${node}(?:\\s+-)?\\s*(?=$|[;&|\\n])`,
    'm',
  )
  return bareNode.test(source) ? 'bare stdin code' : null
}

function eventBlock(preJobs, event) {
  const lines = preJobs.split(/\r?\n/)
  const start = lines.findIndex((line) => new RegExp(`^  ${event}:\\s*(?:#.*)?$`).test(line))
  if (start < 0) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*(?:#.*)?$/.test(lines[index])) { end = index; break }
  }
  return lines.slice(start, end).join('\n')
}

function workflowEventNames(preJobs) {
  const lines = preJobs.split(/\r?\n/)
  const onAt = lines.findIndex(line => /^on:\s*(?:#.*)?$/.test(line))
  if (onAt < 0) return []
  const events = []
  for (let index = onAt + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^[^\s#]/.test(line)) break
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$/)
    if (match) events.push(match[1])
  }
  return events
}

function executableSource(source) {
  return source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('#')).join('\n')
}

function needsJob(block, job) {
  const escaped = job.replaceAll('-', '\\-')
  return new RegExp(`^    needs:\\s*(?:${escaped}|\\[[^\\]]*\\b${escaped}\\b[^\\]]*\\])\\s*(?:#.*)?$`, 'm').test(block)
}

function jobPermissionMap(block) {
  const lines = block.split(/\r?\n/)
  const at = lines.findIndex(line => /^    permissions:\s*(?:#.*)?$/.test(line))
  if (at < 0) return null
  const permissions = {}
  for (let index = at + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^      ([A-Za-z0-9_-]+):\s*(read|write|none)\s*(?:#.*)?$/)
    if (match) {
      permissions[match[1]] = match[2]
      continue
    }
    if (/^    \S/.test(lines[index])) break
  }
  return permissions
}

function workflowPermissionMap(source) {
  const preJobs = source.split(/^jobs:\s*$/m)[0]
  if (/^permissions:\s*\{\s*\}\s*(?:#.*)?$/m.test(preJobs)) return {}
  if (/^permissions:\s*write-all\s*(?:#.*)?$/m.test(preJobs)) return { '*': 'write' }
  const lines = preJobs.split(/\r?\n/)
  const at = lines.findIndex(line => /^permissions:\s*(?:#.*)?$/.test(line))
  if (at < 0) return {}
  const permissions = {}
  for (let index = at + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^  ([A-Za-z0-9_-]+):\s*(read|write|none)\s*(?:#.*)?$/)
    if (match) {
      permissions[match[1]] = match[2]
      continue
    }
    if (/^[^\s#]/.test(lines[index])) break
  }
  return permissions
}

function exactRunnerLabel(block) {
  const scalar = block.match(/^    runs-on:\s*([^\s#]+)\s*(?:#.*)?$/m)?.[1]
  if (scalar) return scalar === 'ubuntu-24.04'
  const list = block.match(/^    runs-on:\s*(?:#.*)?\n((?:      - [^\n]+\n?)+)/m)?.[1]
  return list ? false : null
}

export function auditWorkflowSources(sources, {
  rootNpmrc = '',
  releaseNpmPublisher = '',
  releaseGithubPublisher = '',
} = {}) {
  const findings = []
  const add = (file, rule, message) => findings.push({ file, rule, message })

  for (const [file, source] of Object.entries(sources).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      const uses = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/)
      if (uses && !uses[1].startsWith('./') && !uses[1].startsWith('docker://')) {
        const ref = uses[1].split('@').at(-1)
        if (!/^[a-f0-9]{40}$/.test(ref || '')) add(file, 'WF-ACTION-PIN', `line ${index + 1}: external action must use a full commit SHA`)
        if (uses[1].startsWith('actions/checkout@') && !hasNearbyPersistFalse(lines, index)) {
          add(file, 'WF-CHECKOUT-CREDS', `line ${index + 1}: checkout must set persist-credentials: false`)
        }
      }

      const executable = line.trim() && !line.trimStart().startsWith('#')
      if (executable && /\bnpm\s+ci\b/.test(line) && !line.includes('--ignore-scripts')) {
        add(file, 'WF-LIFECYCLE', `line ${index + 1}: npm ci must explicitly disable lifecycle scripts`)
      }
      if (executable && /\bnpx\s+/.test(line) && !/\bnpx\s+--no-install\b/.test(line)) {
        add(file, 'WF-NPX', `line ${index + 1}: npx must use --no-install`)
      }
      if (/^\s*continue-on-error:\s*true\b/.test(line)
        && (REQUIRED_PR_WORKFLOWS.includes(file) || file === '.github/workflows/release.yml')) {
        add(file, 'WF-FAIL-OPEN', `line ${index + 1}: required workflows may not fail open`)
      }
      if (/^\s*if:.*(?:\[skip-|skip[_-](?:visual|composition|governance))/i.test(line)) {
        add(file, 'WF-BYPASS', `line ${index + 1}: user-controlled skip conditions are forbidden`)
      }
    })

    for (const [job, block] of workflowJobBlocks(source)) {
      for (const [index, step] of workflowStepBlocks(block).entries()) {
        const kind = dynamicNodeCodeKind(stepRunSource(step))
        if (kind) {
          add(
            file,
            'WF-NODE-DYNAMIC-CODE',
            `job ${job} step ${index + 1}: Node.js ${kind} is forbidden; invoke a committed static CLI and pass only data arguments`,
          )
        }
      }
    }

    const preJobs = source.split(/^jobs:\s*$/m)[0]
    const workflowExecutable = executableSource(source)
    const tokenAuthority = /(?:id-token|attestations|pages):\s*write/.test(source)
    if (tokenAuthority) {
      const push = eventBlock(preJobs, 'push')
      const branchSelectable = eventBlock(preJobs, 'workflow_dispatch') || eventBlock(preJobs, 'pull_request')
      const pushedTag = /^\s{4}tags:/m.test(push)
      const nonDefaultPush = push && !pushedTag && !/^\s{4}branches:\s*\[main\]\s*(?:#.*)?$/m.test(push)
      if (branchSelectable || pushedTag || nonDefaultPush || /\$\{\{\s*inputs\./.test(preJobs)) {
        add(file, 'WF-PRIVILEGED-TRIGGER', 'OIDC, attestation, or Pages authority may not be loaded from PR, workflow_dispatch, tag, or non-default branch workflow code')
      }
    }
    if (/GOVERNANCE_WRITER_APP/.test(source)) {
      const push = eventBlock(preJobs, 'push')
      const branchSelectable = eventBlock(preJobs, 'workflow_dispatch')
        || eventBlock(preJobs, 'pull_request')
        || eventBlock(preJobs, 'pull_request_target')
      const pushIsProtectedDefaultOnly = !push
        || (/^\s{4}branches:\s*\[main\]\s*(?:#.*)?$/m.test(push)
          && !/^\s{4}branches-ignore:/m.test(push))
      if (branchSelectable || !pushIsProtectedDefaultOnly || /\$\{\{\s*inputs\./.test(preJobs)) {
        add(file, 'WF-PRIVILEGED-TRIGGER', 'Writer App authority may run only from protected-default push, workflow_run, or repository_dispatch; branch-selectable triggers and inputs are forbidden')
      }
    }
    if (/GOVERNANCE_CHECK_APP/.test(source)) {
      const branchSelectable = eventBlock(preJobs, 'workflow_dispatch')
        || eventBlock(preJobs, 'pull_request')
        || eventBlock(preJobs, 'push')
      if (branchSelectable || /\$\{\{\s*inputs\./.test(preJobs)) {
        add(file, 'WF-PRIVILEGED-TRIGGER', 'Check App authority must be loaded through protected-base pull_request_target or a closed protected-default repository_dispatch; branch-selectable triggers and inputs are forbidden')
      }
    }
    if (
      /^\s{2}pull_request:\s*$/m.test(preJobs)
      && (/^\s+[a-z0-9_-]+:\s*write\s*$/mi.test(workflowExecutable)
        || /^\s*permissions:\s*write-all\s*$/mi.test(workflowExecutable)
        || /^\s*permissions:\s*\{[^}\n]*:\s*write(?:\s*[,}])/mi.test(workflowExecutable))
    ) {
      add(file, 'WF-PR-PERMISSION', 'pull_request workflow grants a write permission at top level or inside a job')
    }
    if (/^\s{2}pull_request:\s*$/m.test(preJobs) && /\bsecrets(?:\.|\[)/.test(workflowExecutable)) {
      add(file, 'WF-PR-SECRET', 'pull_request workflow may not receive repository or environment secrets')
    }
    if (/^\s{2}pull_request_target:\s*$/m.test(preJobs)) {
      if (/^\s+[a-z0-9_-]+:\s*write\s*$/mi.test(preJobs)) add(file, 'WF-PR-TARGET-WRITE', 'pull_request_target workflow may not grant write permission')
      for (const [job, block] of workflowJobBlocks(source)) {
        for (const [index, step] of workflowStepBlocks(block).entries()) {
          const runSource = stepRunSource(step)
          if (/\$\{\{\s*github\.event\.pull_request(?:\.|\[)/.test(runSource || '')) {
            add(
              file,
              'WF-PR-TARGET-SHELL-INTERPOLATION',
              `job ${job} step ${index + 1}: pull_request_target run may not directly interpolate candidate pull-request fields; bind them through env and use quoted shell variables`,
            )
          }
        }
      }
      if (
        !/ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/.test(source)
        && !/ref:\s*\$\{\{\s*steps\.request\.outputs\.head_sha\s*\}\}/.test(source)
      ) {
        add(file, 'WF-PR-TARGET-REF', 'pull_request_target workflow must explicitly checkout the PR head SHA')
      }
      const secretAt = source.search(/\bsecrets\./)
      const verdictAt = source.search(/^\s{2}publish-app-verdict:\s*$/m)
      const splitVerdict = verdictAt >= 0
        && /^\s{4}needs:\s*verify-candidate\s*$/m.test(source.slice(verdictAt))
        && /^\s{4}if:\s*(?:\$\{\{\s*)?always\(\)/m.test(source.slice(verdictAt))
      if (secretAt >= 0 && (!splitVerdict || secretAt < verdictAt)) {
        add(file, 'WF-PR-TARGET-SECRET', 'pull_request_target secrets are allowed only in a fresh verdict job after credential-free verification')
      }
    }

    for (const [job, block] of workflowJobBlocks(source)) {
      const runnerIsExact = exactRunnerLabel(block)
      if (runnerIsExact === false) {
        add(file, 'WF-RUNNER-PIN', `job ${job}: runs-on must be the exact ubuntu-24.04 image`)
      }
      const permissions = jobPermissionMap(block) ?? workflowPermissionMap(source)
      const writeAll = permissions['*'] === 'write'
      if ((writeAll || permissions.packages === 'write')
        && (writeAll || permissions['id-token'] === 'write' || permissions.attestations === 'write')) {
        add(file, 'WF-REGISTRY-OIDC-SEPARATION', `job ${job}: registry mutation and OIDC/attestation authority must be isolated in different digest-bound jobs`)
      }
      const executable = executableSource(block)
      if (!/\bnpm\s+ci\b/.test(executable)) continue
      if (file === 'template/ds-product-template/.github/workflows/audit.yml') continue
      if (!/\bnpm\s+audit\s+signatures\b/.test(executable)) {
        add(file, 'WF-SIGNATURE-AUDIT', `job ${job}: npm ci must be followed by registry signature verification`)
      }
      if (!/\bnpm\s+audit\b[^\n]*--audit-level=high\b/.test(executable)) {
        add(file, 'WF-VULNERABILITY-AUDIT', `job ${job}: npm ci must reject high-severity advisories`)
      }
    }

    if (/\bGOVERNANCE_APP_(?:ID|PRIVATE_KEY)\b/.test(source)) {
      add(file, 'WF-APP-LEGACY-SECRET', 'the ambiguous legacy Governance App secret is forbidden; use distinct check-only and writer Apps')
    }
    if (/GOVERNANCE_CHECK_APP/.test(source) && /GOVERNANCE_WRITER_APP/.test(source)) {
      add(file, 'WF-APP-SEPARATION', 'one workflow may not receive both Governance Check and Governance Writer App identities')
    }
    if (/GOVERNANCE_WRITER_APP/.test(source) && /permission-checks:\s*write/.test(source)) {
      add(file, 'WF-APP-SEPARATION', 'Governance Writer App workflows may not request Checks write')
    }
    if (/GOVERNANCE_CHECK_APP/.test(source) && /permission-(?:contents|pull-requests):\s*write/.test(source)) {
      add(file, 'WF-APP-SEPARATION', 'Governance Check App workflows may not request repository mutation permissions')
    }
  }

  for (const file of REQUIRED_PR_WORKFLOWS) {
    const source = sources[file]
    const preJobs = source?.split(/^jobs:\s*$/m)[0] || ''
    const pullRequest = eventBlock(preJobs, 'pull_request')
    if (!pullRequest) add(file, 'WF-REQUIRED-TRIGGER', 'required workflow must run on pull_request')
    else if (/^\s{4}(?:paths|paths-ignore):/m.test(pullRequest)) {
      add(file, 'WF-REQUIRED-UNCONDITIONAL', 'required pull_request workflow may not use path filters')
    }
  }

  const releaseFile = '.github/workflows/release.yml'
  const directRelease = sources[releaseFile] || ''
  const directReleaseJobs = workflowJobBlocks(directRelease)
  const directResolve = directReleaseJobs.get('resolve-release-request') || ''
  const directNpm = directReleaseJobs.get('build-and-publish-npm') || ''
  const directGithub = directReleaseJobs.get('publish-github-release') || ''
  const directReleaseEvents = workflowEventNames(directRelease.split(/^jobs:\s*$/m)[0])
  if (
    directReleaseEvents.length !== 1
    || directReleaseEvents[0] !== 'repository_dispatch'
    || !/^\s{4}types:\s*\[stage-protected-release\]\s*$/m.test(directRelease)
    || /^\s{2}(?:push|workflow_dispatch|pull_request):/m.test(directRelease)
  ) add(releaseFile, 'WF-RELEASE-TRIGGER', 'release must load only from protected-default repository_dispatch')
  if (
    directReleaseJobs.size !== 3 || !directResolve || !directNpm || !directGithub
    || !/^\s{4}if:\s*github\.ref == 'refs\/heads\/main'\s*$/m.test(directResolve)
    || !/test "\$event_commit" = "\$main_commit"/.test(directResolve)
    || !/test "\$tag_commit" = "\$main_commit"/.test(directResolve)
  ) add(releaseFile, 'WF-RELEASE-IDENTITY', 'release must have exactly three jobs and bind event SHA plus exact tag to current main')
  if (
    !needsJob(directNpm, 'resolve-release-request')
    || !/^\s{4}environment:\s*\n\s{6}name:\s*npm-release\s*$/m.test(directNpm)
    || !/contents:\s*read/.test(directNpm) || !/id-token:\s*write/.test(directNpm)
    || /contents:\s*write|attestations:\s*write/.test(directNpm)
    || !needsJob(directGithub, 'resolve-release-request')
    || !needsJob(directGithub, 'build-and-publish-npm')
    || !/actions:\s*read/.test(directGithub) || !/contents:\s*write/.test(directGithub)
    || /id-token:\s*write|attestations:\s*write/.test(directGithub)
  ) add(releaseFile, 'WF-RELEASE-PRIVILEGE', 'npm OIDC and GitHub contents authority must remain in separate least-privilege jobs')
  if (
    /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/.test(directRelease)
    || !/node scripts\/release-npm-publish\.mjs/.test(directNpm)
    || !/npmResult\(npmCli,\s*\[\s*'publish',\s*archive,[\s\S]*'--provenance'/.test(releaseNpmPublisher)
    || !/existing\.kind === 'found'[\s\S]*validateRegistryPackage[\s\S]*continue/.test(releaseNpmPublisher)
    || !/existing\.kind !== 'missing'[\s\S]*npmResult\(npmCli,[\s\S]*waitForPublishedPackage/.test(releaseNpmPublisher)
    || !/for \(const item of context\.ordered\) await validateRegistryPackage/.test(releaseNpmPublisher)
    || !/readTagVersions\(npmCli, context\.ordered, context\.targetTag\)/.test(releaseNpmPublisher)
    || /\bstage\b|NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/.test(executableSource(releaseNpmPublisher))
  ) add(releaseFile, 'WF-TRUSTED-PUBLISH', 'release must use tokenless direct npm publish --provenance with resumable three-package readback')
  if (
    (directRelease.match(/node scripts\/run-verified-npm\.mjs -- pack \.\/packages\//g) || []).length !== 3
    || !/build-release-bom\.mjs/.test(directNpm)
    || !/product-template-scaffold-lock\.mjs/.test(directNpm)
    || !/release-set\.mjs[\s\S]*--github-output/.test(directNpm)
    || !/release_set_sha256:\s*\$\{\{\s*steps\.release_set\.outputs\.sha256\s*\}\}/.test(directNpm)
    || !/release-set\.mjs[\s\S]*--expected "\$\{\{ needs\.build-and-publish-npm\.outputs\.release_set_sha256 \}\}"/.test(directGithub)
    || !/node scripts\/release-github-release\.mjs/.test(directGithub)
    || !/compareReleaseAssets/.test(releaseGithubPublisher)
    || !/observed\.digest !== wanted\.digest \|\| observed\.size !== wanted\.size/.test(releaseGithubPublisher)
    || !/release', 'create'/.test(releaseGithubPublisher)
    || !/release', 'upload'/.test(releaseGithubPublisher)
    || !/release', 'edit'/.test(releaseGithubPublisher)
    || !/node scripts\/release-github-release\.mjs[\s\S]*event_type:"mirror-published-release"[\s\S]*client_payload:\{tag:\$tag,commit:\$commit\}/.test(directGithub)
  ) add(releaseFile, 'WF-RELEASE-EVIDENCE', 'the exact six-file release set must be bound and read back by name, size, and digest')
  if (/trust-preflight|release-finalize|stage\s+publish|release-npm-(?:approve|promote)|actions\/attest@|test:governance-harnesses|build-storybook/.test(executableSource(directRelease))) {
    add(releaseFile, 'WF-RELEASE-LEGACY', 'retired trust, staging, finalizer, attestation, and duplicate harness gates must stay off the release path')
  }
  if (sources['.github/workflows/release-finalize.yml']) {
    add('.github/workflows/release-finalize.yml', 'WF-RELEASE-LEGACY', 'the separate release finalizer workflow is retired')
  }

  const publishedMirrorFile = '.github/workflows/mirror-to-published-template.yml'
  const publishedMirror = sources[publishedMirrorFile] || ''
  const publishedMirrorJobs = workflowJobBlocks(publishedMirror)
  const publishedMirrorJob = publishedMirrorJobs.get('mirror-published-release') || ''
  const publishedMirrorEvents = workflowEventNames(publishedMirror.split(/^jobs:\s*$/m)[0])
  if (
    publishedMirrorEvents.length !== 1 || publishedMirrorEvents[0] !== 'repository_dispatch'
    || !/^\s{4}types:\s*\[mirror-published-release\]\s*$/m.test(publishedMirror)
    || /workflow_run|workflow_dispatch|release-finalize|finalizer/.test(executableSource(publishedMirror))
  ) add(publishedMirrorFile, 'WF-MIRROR-TRIGGER', 'the nonblocking mirror may run only from the exact post-publish repository dispatch')
  if (
    publishedMirrorJobs.size !== 1 || !publishedMirrorJob
    || !/^\s{4}if:\s*github\.ref == 'refs\/heads\/main'\s*$/m.test(publishedMirrorJob)
    || !/contents:\s*read/.test(publishedMirrorJob)
    || /contents:\s*write/.test(publishedMirrorJob)
    || !/github\.event\.client_payload\.tag/.test(publishedMirrorJob)
    || !/github\.event\.client_payload\.commit/.test(publishedMirrorJob)
    || !/test "\$event_commit" = "\$main_commit"/.test(publishedMirrorJob)
    || !/test "\$release_commit" = "\$RELEASE_COMMIT"/.test(publishedMirrorJob)
    || !/gh release view/.test(publishedMirrorJob)
    || !/\.isDraft == false/.test(publishedMirrorJob)
    || !/\.publishedAt/.test(publishedMirrorJob)
    || !/gh release download/.test(publishedMirrorJob)
    || !/release-set\.mjs/.test(publishedMirrorJob)
    || !/build-release-bom\.mjs --verify/.test(publishedMirrorJob)
    || !/release-npm-readback\.mjs/.test(publishedMirrorJob)
    || !/product-template-scaffold-lock\.mjs --verify/.test(publishedMirrorJob)
  ) add(publishedMirrorFile, 'WF-MIRROR-RELEASE', 'mirror must verify protected workflow source, exact dispatch identity, live published release, six assets, BOM, npm provenance, and scaffold lock before writing')
  const mirrorTokenAt = publishedMirrorJob.indexOf('secrets.CROSS_REPO_TOKEN')
  const mirrorVerifyAt = publishedMirrorJob.indexOf('Verify six-file release set')
  if (
    mirrorTokenAt < 0 || mirrorVerifyAt < 0 || mirrorTokenAt < mirrorVerifyAt
    || /actions\/create-github-app-token@|GOVERNANCE_WRITER_APP/.test(publishedMirrorJob)
    || /secrets\.[\s\S]{0,300}gh release download/.test(publishedMirrorJob)
  ) add(publishedMirrorFile, 'WF-MIRROR-CREDENTIAL', 'mirror may expose the existing cross-repository token only after all release verification')

  const retiredConsumerAnchor = 'template/ds-product-template/.github/workflows/governance-anchor.yml'
  if (sources[retiredConsumerAnchor]) {
    add(retiredConsumerAnchor, 'WF-RETIRED-CONSUMER-ANCHOR', 'consumer repositories use only audit.yml / Verify consumer; the retired App verdict workflow must not return')
  }

  const anchorFile = '.github/workflows/governance-anchor.yml'
  const anchor = sources[anchorFile] || ''
  const anchorJobs = workflowJobBlocks(anchor)
  const anchorVerify = anchorJobs.get('verify-candidate') || ''
  const rootPrivilegedVerifyAt = anchorVerify.search(/^[ \t]*(?:(?:-[ \t]+)?run:[ \t]+)?node\s+trusted\/scripts\/verify-privileged-change\.mjs\b/m)
  const rootCandidateInstallAt = anchorVerify.search(/^[ \t]*(?:(?:-[ \t]+)?run:[ \t]+)?node\s+trusted\/scripts\/install-candidate-dependencies\.mjs\s+--candidate\s+candidate[ \t]*$/m)
  const rootVersionProjectionAt = anchorVerify.search(/^[ \t]*(?:(?:-[ \t]+)?run:[ \t]+)?node\s+trusted\/infra\/governance\/lib\/governance-anchor-version-projection\.mjs\b/m)
  const rootWorkflowAuditAt = anchorVerify.search(/^[ \t]*(?:(?:-[ \t]+)?run:[ \t]+)?node\s+trusted\/scripts\/audit-workflow-security\.mjs\s+--root\s+candidate[ \t]*$/m)
  const rootVersionProjectionCommands = anchorVerify.match(
    /^[ \t]*(?:(?:-[ \t]+)?run:[ \t]+)?node\s+trusted\/infra\/governance\/lib\/governance-anchor-version-projection\.mjs\b/gm,
  ) || []
  const rootVersionProjectionClosed = rootPrivilegedVerifyAt >= 0
    && rootCandidateInstallAt > rootPrivilegedVerifyAt
    && rootVersionProjectionAt > rootCandidateInstallAt
    && rootWorkflowAuditAt > rootVersionProjectionAt
    && rootVersionProjectionCommands.length === 1
    && /^[ \t]*(?:(?:-[ \t]+)?run:[ \t]+)?node[ \t]+trusted\/infra\/governance\/lib\/governance-anchor-version-projection\.mjs(?:[ \t]+\\[ \t]*\n[ \t]*|[ \t]+)--trusted-root[ \t]+trusted(?:[ \t]+\\[ \t]*\n[ \t]*|[ \t]+)--candidate-root[ \t]+candidate[ \t]*$/m.test(anchorVerify)
    && !/node\s+trusted\/packages\/governance\/bin\/governance\.mjs\s+check\b/.test(anchorVerify)
  if (
    !/^\s{2}pull_request_target:\s*$/m.test(anchor)
    || /^\s{2}workflow_dispatch:\s*$/m.test(anchor)
    || !/^\s{2}verify-candidate:\s*$/m.test(anchor)
    || /^\s{2}publish-app-verdict:/m.test(anchor)
    || /\bsecrets\.|actions\/create-github-app-token@/.test(anchorVerify)
    || !/trusted\/scripts\/verify-privileged-change\.mjs/.test(anchorVerify)
    || !rootVersionProjectionClosed
  ) add(anchorFile, 'WF-ANCHOR', 'authority protected-base credential-free verifier is incomplete')

  const composition = sources['.github/workflows/composition-fidelity.yml'] || ''
  if (!/--require-mappings\b/.test(composition)) add('.github/workflows/composition-fidelity.yml', 'WF-NONVACUOUS', 'composition required check must reject zero executable mappings')

  const ci = sources['.github/workflows/ci.yml'] || ''
  if (/always\(\).*pages_ready/.test(ci)) add('.github/workflows/ci.yml', 'WF-DEPLOY-ON-FAILURE', 'production deploy may not bypass a failed Verify job')
  if (/(?:pages|id-token):\s*write|actions\/deploy-pages@|actions\/upload-pages-artifact@/.test(ci)) {
    add('.github/workflows/ci.yml', 'WF-CI-PRIVILEGE', 'PR/manual CI must remain read-only and may not build, upload, or deploy with Pages/OIDC authority')
  }
  const pagesFile = '.github/workflows/deploy-storybook.yml'
  const pages = sources[pagesFile] || ''
  const pagesJobs = workflowJobBlocks(pages)
  const pagesBuild = pagesJobs.get('build-pages') || ''
  const pagesDeploy = pagesJobs.get('deploy-pages') || ''
  if (
    !/^\s{2}workflow_run:\s*$/m.test(pages)
    || !/^\s{4}workflows:\s*\[CI\]\s*$/m.test(pages)
    || /^\s{2}(?:pull_request|workflow_dispatch|push):/m.test(pages)
    || !/github\.event\.workflow_run\.event == 'push'/.test(pagesBuild)
    || !/github\.event\.workflow_run\.head_branch == 'main'/.test(pagesBuild)
    || !/github\.event\.workflow_run\.conclusion == 'success'/.test(pagesBuild)
    || !/test "\$source_sha" = "\$main_sha"/.test(pagesBuild)
    || /(?:pages|id-token):\s*write|actions\/deploy-pages@/.test(pagesBuild)
    || !needsJob(pagesDeploy, 'build-pages')
    || !/pages:\s*write/.test(pagesDeploy)
    || !/id-token:\s*write/.test(pagesDeploy)
    || !/^\s{4}environment:\s*\n\s{6}name:\s*github-pages\s*$/m.test(pagesDeploy)
    || !/actions\/deploy-pages@[a-f0-9]{40}/.test(pagesDeploy)
  ) add(pagesFile, 'WF-PAGES-PRIVILEGE', 'Pages authority must be isolated in a protected-default workflow_run after successful current-main CI and byte-rebuilt evidence')

  if (!/^ignore-scripts=true$/m.test(rootNpmrc) || !/^legacy-peer-deps=true$/m.test(rootNpmrc)) {
    add('.npmrc', 'WF-NPM-DEFAULTS', 'authority repo must disable lifecycle scripts and pin peer-resolution policy')
  }

  return findings.sort((a, b) => compareUtf8Bytes(
    `${a.file}:${a.rule}:${a.message}`,
    `${b.file}:${b.rule}:${b.message}`,
  ))
}

export function auditRepository(root = ROOT) {
  const sources = Object.fromEntries(workflowFiles(root).map((file) => [relative(root, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')]))
  const rootNpmrc = existsSync(join(root, '.npmrc')) ? readFileSync(join(root, '.npmrc'), 'utf8') : ''
  const publisher = join(root, 'scripts/release-npm-publish.mjs')
  const releaseNpmPublisher = existsSync(publisher) ? readFileSync(publisher, 'utf8') : ''
  const githubPublisher = join(root, 'scripts/release-github-release.mjs')
  const releaseGithubPublisher = existsSync(githubPublisher) ? readFileSync(githubPublisher, 'utf8') : ''
  return auditWorkflowSources(sources, { rootNpmrc, releaseNpmPublisher, releaseGithubPublisher })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rootAt = process.argv.indexOf('--root')
  if (rootAt >= 0 && (!process.argv[rootAt + 1] || process.argv[rootAt + 1].startsWith('--'))) {
    console.error('usage: audit-workflow-security.mjs [--root <repository>]')
    process.exit(2)
  }
  const findings = auditRepository(rootAt >= 0 ? resolve(process.argv[rootAt + 1]) : ROOT)
  if (findings.length) {
    for (const finding of findings) console.error(`❌ ${finding.rule} ${finding.file}: ${finding.message}`)
    process.exit(1)
  }
  console.log(`✅ workflow security policy PASS (${workflowFiles(ROOT).length} workflows, no floating actions/lifecycle installs/bypasses/early credentials)`)
}
