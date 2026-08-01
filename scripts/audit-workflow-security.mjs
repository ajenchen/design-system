#!/usr/bin/env node
// Dependency-free, fail-closed GitHub Actions policy. Provider hooks are advisory;
// this repository check keeps workflow trust boundaries enforceable in CI.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANAGED_CI_SUPPLY_CHAIN_POLICY = JSON.parse(readFileSync(
  join(ROOT, 'infra/governance/providers/managed-ci-executor-supply-chain.json'),
  'utf8',
))
const MANAGED_CI_ATTESTATION_COUNT = [
  MANAGED_CI_SUPPLY_CHAIN_POLICY.attestations?.provenance?.predicateType,
  MANAGED_CI_SUPPLY_CHAIN_POLICY.attestations?.sbom?.predicateType,
  'https://qijenchen.dev/attestations/managed-ci-image-handoff/v2',
].filter(Boolean).length
// Deliberately independent from the mutable policy file: any byte change to the
// privileged workflow or a sensitive shell body requires an explicit auditor review.
const MANAGED_CI_WORKFLOW_SHA256 = '907599cb201de7c14f370de0d87c7856b5169bcd59f88b0e689026b5e6e4856b'
const MANAGED_CI_BUILD_RUN_SHA256 = Object.freeze([
  '558cda32fa544c7135953828bc3576fabc5cc2e875450c383fb76a74494933eb',
  '929c3918a5c2f9cc6e90e6f85f782286ca7c1080e49276ba3e43a842721289dc',
  '428fa47dda7106ee9b6b909caf2fc4805da10ddde980276cedd0c1ef52a88301',
  'e7cb3a224a6ca3fa78345aa864747625ec09277a299a3a9072830a00b59f76f0',
  '931bb9a94fdf664a5cd5fd919525d097201adef7a2953cabc8ff745d00721964',
  '52e0337f0b7f57c6b67f45cbe2b4cf02faaf8d13789dcbed96a6309e84fe6aad',
])
const MANAGED_CI_SBOM_RUN_SHA256 = Object.freeze([
  'd15638b35f0c90cc483ddf107e95ba2d6ad150db14397d4a1d03e52f8a5db704',
  '1e84a4ded92da1e575232202e411c00cc8623b8495a7ea6ffc58358eb73094ab',
  'de2069f2367a00d526bac3cab2a529bc4453663183173f75e63e604cd9640986',
  'f93a932e23f0cc4e7cdc3d7d84a831893ae8628a769d33e31d86d08c1efdec4c',
  'dd38eb592768728c2e87eea843c90f3415d7d7b95f89f068fae10cf5eec1088e',
  'c5055a74cdcb20c13e5adb5c02c401c6a0e1f8ca1131d7bc5811a54051daf1e9',
])
const MANAGED_CI_BIND_RUN_SHA256 = Object.freeze([
  'd15638b35f0c90cc483ddf107e95ba2d6ad150db14397d4a1d03e52f8a5db704',
  '417250b5baff2f01176bc9e2c99c06370bedfc39920b1d077a590a2df94d6443',
])
const MANAGED_CI_ATTEST_RUN_SHA256 = Object.freeze([
  '558cda32fa544c7135953828bc3576fabc5cc2e875450c383fb76a74494933eb',
  'c1fb54a5a6e280fd0d987ce68ba5b9607af1c238ba0f13356820017be26923bc',
  '15ab6d19115ebe3c933cb62c3413845b69021887aeb5f1b102d6bbff2a03999c',
  'fedb09cd1469d4d4c1a909b26a56a587ca184da5831e8273b4c7cb3f24b767e7',
  '4b0cc65e5433f57a2223876e2007abb5f2bcd0f77551e34b6c07350fb9107e84',
])
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

function workflowTopLevelKeys(source) {
  return [...source.matchAll(/^([A-Za-z0-9_-]+):/gm)].map(match => match[1])
}

function jobTopLevelKeys(block) {
  return [...block.matchAll(/^    ([A-Za-z0-9_-]+):/gm)].map(match => match[1])
}

function workflowStepBlocks(block) {
  const lines = block.split(/\r?\n/)
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (/^      - [A-Za-z0-9_-]+:/.test(lines[index])) starts.push(index)
  }
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join('\n'))
}

function stepTopLevelKeys(block) {
  const first = block.match(/^      - ([A-Za-z0-9_-]+):/)?.[1]
  const rest = [...block.matchAll(/^        ([A-Za-z0-9_-]+):/gm)].map(match => match[1])
  return first ? [first, ...rest] : rest
}

function stepUses(block) {
  return block.match(/^(?:      - |        )uses:\s*([^\s#]+)/m)?.[1] ?? null
}

function literalRunBody(block) {
  const lines = block.split(/\r?\n/)
  const runAt = lines.findIndex(line => /^        run:\s*\|\s*$/.test(line))
  if (runAt < 0) return null
  const body = lines.slice(runAt + 1)
  if (body.some(line => line && !line.startsWith('          '))) return null
  while (body.at(-1) === '') body.pop()
  if (!body.length) return null
  return `${body.map(line => line.slice(10)).join('\n')}\n`
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

function sha256(value) {
  return typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : null
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

function continuedShellCommands(block, marker) {
  const lines = block.split(/\r?\n/)
  const commands = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(marker)) continue
    const command = [lines[index]]
    while (command.at(-1).trimEnd().endsWith('\\') && index + 1 < lines.length) {
      index += 1
      command.push(lines[index])
    }
    commands.push(command.join('\n'))
  }
  return commands
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
  if (!list) return null
  const labels = [...list.matchAll(/^      - ([^\s#]+)\s*(?:#.*)?$/gm)].map(match => match[1])
  return JSON.stringify(labels) === JSON.stringify(['self-hosted', 'linux', 'x64', 'qijenchen-managed-ci-v1'])
}

function everyAuthorityUseHasSignedTagRecheck(block, marker) {
  const source = executableSource(block)
  const positions = [...source.matchAll(marker)].map(match => match.index)
  if (positions.length === 0) return false
  let boundary = 0
  for (const position of positions) {
    const preAuthority = source.slice(boundary, position)
    if (!/node\s+scripts\/release-remote-tag\.mjs[\s\S]*--expected[\s\S]*--token-env/.test(preAuthority)) return false
    boundary = position + 1
  }
  return true
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
        add(file, 'WF-RUNNER-PIN', `job ${job}: runs-on must be the exact ubuntu-24.04 image or the closed managed-CI label set`)
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

  const managedBuilderFile = '.github/workflows/build-managed-ci-executors.yml'
  const managedBuilder = sources[managedBuilderFile] || ''
  if (managedBuilder) {
    const jobs = workflowJobBlocks(managedBuilder)
    const build = jobs.get('build-and-push') || ''
    const sbom = jobs.get('generate-sbom') || ''
    const bind = jobs.get('bind-image-set') || ''
    const attest = jobs.get('attest-image') || ''
    const buildPermissions = jobPermissionMap(build)
    const sbomPermissions = jobPermissionMap(sbom)
    const bindPermissions = jobPermissionMap(bind)
    const attestPermissions = jobPermissionMap(attest)
    const exactJobClosure = JSON.stringify([...jobs.keys()])
      === JSON.stringify(['build-and-push', 'generate-sbom', 'bind-image-set', 'attest-image'])
    // GitHub does not expose the runner context to job-level `env`, so the builder binds
    // DOCKER_CONFIG in its first step through $GITHUB_ENV. That step is asserted separately and the
    // canonical ten builder steps keep their original indexes below.
    const buildStepBlocks = workflowStepBlocks(build)
    const dockerConfigStep = buildStepBlocks[0] || ''
    const buildSteps = buildStepBlocks.slice(1)
    const sbomSteps = workflowStepBlocks(sbom)
    const bindSteps = workflowStepBlocks(bind)
    const attestSteps = workflowStepBlocks(attest)
    const buildUses = buildSteps.map(stepUses).filter(Boolean)
    const sbomUses = sbomSteps.map(stepUses).filter(Boolean)
    const bindUses = bindSteps.map(stepUses).filter(Boolean)
    const attestUses = attestSteps.map(stepUses).filter(Boolean)
    const exactWorkflowShape = JSON.stringify(workflowTopLevelKeys(managedBuilder))
      === JSON.stringify(['name', 'on', 'permissions', 'concurrency', 'jobs'])
    const exactJobShapes = (
      JSON.stringify(jobTopLevelKeys(build))
        === JSON.stringify(['if', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps'])
      && JSON.stringify(jobTopLevelKeys(sbom))
        === JSON.stringify(['if', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps'])
      && JSON.stringify(jobTopLevelKeys(bind))
        === JSON.stringify(['if', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'outputs', 'steps'])
      && JSON.stringify(jobTopLevelKeys(attest))
        === JSON.stringify(['if', 'needs', 'runs-on', 'timeout-minutes', 'permissions', 'strategy', 'steps'])
    )
    const exactAttestStepShapes = JSON.stringify(attestSteps.map(stepTopLevelKeys))
      === JSON.stringify([
        ['name', 'uses', 'with'],
        ['name', 'env', 'run'],
        ['name', 'uses', 'with'],
        ['name', 'id', 'env', 'run'],
        ['name', 'id', 'uses', 'with'],
        ['name', 'env', 'run'],
        ['name', 'id', 'uses', 'with'],
        ['name', 'env', 'run'],
        ['name', 'id', 'uses', 'with'],
        ['name', 'env', 'run'],
        ['name', 'uses', 'with'],
      ])
    const exactBuildStepShapes = JSON.stringify(buildSteps.map(stepTopLevelKeys))
      === JSON.stringify([
        ['name', 'uses', 'with'],
        ['name', 'env', 'run'],
        ['name', 'run'],
        ['name', 'id', 'uses', 'with'],
        ['name', 'env', 'run'],
        ['name', 'uses', 'with'],
        ['name', 'id', 'env', 'run'],
        ['name', 'if', 'run'],
        ['name', 'env', 'run'],
        ['name', 'uses', 'with'],
      ])
    const exactSbomStepShapes = JSON.stringify(sbomSteps.map(stepTopLevelKeys))
      === JSON.stringify([
        ['name', 'env', 'run'],
        ['name', 'uses', 'with'],
        ['name', 'run'],
        ['name', 'env', 'run'],
        ['name', 'env', 'run'],
        ['name', 'env', 'run'],
        ['name', 'env', 'run'],
        ['name', 'uses', 'with'],
      ])
    const exactBuildRunBodies = JSON.stringify([1, 2, 4, 6, 7, 8]
      .map(index => sha256(literalRunBody(buildSteps[index] || ''))))
      === JSON.stringify(MANAGED_CI_BUILD_RUN_SHA256)
    const buildProgram = literalRunBody(buildSteps[6] || '')
    const archiveMaterializeAt = buildProgram.indexOf(
      '/usr/bin/git -c tar.umask=0022 archive --format=tar --mtime="@$SOURCE_COMMIT_TIME"',
    )
    const archiveMemberClosureAt = buildProgram.indexOf('test "$(tar -tf "$CONTEXT_ARCHIVE")"')
    const archiveModeClosureAt = buildProgram.indexOf('/usr/bin/python3 - "$CONTEXT_ARCHIVE"')
    const archiveBlobClosureAt = buildProgram.indexOf('verify_archived_blob runtime/managed-ci-runtime.mjs')
    const archiveDigestAt = buildProgram.indexOf('CONTEXT_ARCHIVE_SHA256="$(sha256sum "$CONTEXT_ARCHIVE"')
    const archiveReadOnlyAt = buildProgram.indexOf('chmod 0400 "$CONTEXT_ARCHIVE"')
    const registryPushAt = buildProgram.indexOf('/usr/bin/docker buildx build')
    const prePushArchiveValidationClosed = (
      archiveMaterializeAt >= 0
      && archiveMaterializeAt < archiveMemberClosureAt
      && archiveMemberClosureAt < archiveModeClosureAt
      && archiveModeClosureAt < archiveBlobClosureAt
      && archiveBlobClosureAt < archiveDigestAt
      && archiveDigestAt < archiveReadOnlyAt
      && archiveReadOnlyAt < registryPushAt
      && !buildProgram.slice(0, archiveReadOnlyAt).includes('/usr/bin/docker buildx build')
      && !buildProgram.includes('| /usr/bin/docker buildx build')
      && buildProgram.slice(registryPushAt).includes('- 0<&"$CONTEXT_ARCHIVE_FD"')
    )
    const exactSbomRunBodies = JSON.stringify([0, 2, 3, 4, 5, 6]
      .map(index => sha256(literalRunBody(sbomSteps[index] || ''))))
      === JSON.stringify(MANAGED_CI_SBOM_RUN_SHA256)
    const exactBindRunBodies = JSON.stringify([0, 5]
      .map(index => sha256(literalRunBody(bindSteps[index] || ''))))
      === JSON.stringify(MANAGED_CI_BIND_RUN_SHA256)
    const exactAttestRunBodies = JSON.stringify([1, 3, 5, 7, 9]
      .map(index => sha256(literalRunBody(attestSteps[index] || ''))))
      === JSON.stringify(MANAGED_CI_ATTEST_RUN_SHA256)
    const exactAttestUses = JSON.stringify(attestUses) === JSON.stringify([
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
      'actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
      'actions/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    ])
    const exactBuildUses = JSON.stringify(buildUses) === JSON.stringify([
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
      'docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    ])
    const exactSbomUses = JSON.stringify(sbomUses) === JSON.stringify([
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    ])
    const exactBindUses = JSON.stringify(bindUses) === JSON.stringify([
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    ])
    const exactWorkflowBytes = sha256(managedBuilder) === MANAGED_CI_WORKFLOW_SHA256
      && MANAGED_CI_SUPPLY_CHAIN_POLICY.builder?.workflowSourceSha256 === MANAGED_CI_WORKFLOW_SHA256
    if (
      !exactWorkflowBytes
      || !exactJobClosure
      || !exactWorkflowShape
      || !exactJobShapes
      || buildSteps.length !== 10
      || !/name:\s*Bind DOCKER_CONFIG to the runner-scoped temp directory/.test(dockerConfigStep)
      || !/test -d "\$RUNNER_TEMP"/.test(dockerConfigStep)
      || !/DOCKER_CONFIG=%s\/managed-ci-docker-config/.test(dockerConfigStep)
      || !/>> "\$GITHUB_ENV"/.test(dockerConfigStep)
      || sbomSteps.length !== 8
      || bindSteps.length !== 7
      || attestSteps.length !== 11
      || !exactBuildUses
      || !exactSbomUses
      || !exactBindUses
      || !exactAttestUses
      || !exactAttestStepShapes
      || !exactBuildStepShapes
      || !exactSbomStepShapes
      || !exactBuildRunBodies
      || !exactSbomRunBodies
      || !exactBindRunBodies
      || !exactAttestRunBodies
      || JSON.stringify(buildPermissions) !== JSON.stringify({ contents: 'read', packages: 'write' })
      || JSON.stringify(sbomPermissions) !== JSON.stringify({ actions: 'read', packages: 'read' })
      || JSON.stringify(bindPermissions) !== JSON.stringify({ actions: 'read' })
      || JSON.stringify(attestPermissions) !== JSON.stringify({
        actions: 'read', contents: 'read', 'id-token': 'write', attestations: 'write',
      })
      || !needsJob(sbom, 'build-and-push')
      || !needsJob(bind, 'generate-sbom')
      || !needsJob(attest, 'bind-image-set')
      || ![build, sbom, bind, attest].every(block => /^    if:\s*github\.ref == 'refs\/heads\/main'\s*$/m.test(block))
      || /docker\/build-push-action@/.test(managedBuilder)
      || /\$HOME\/\.docker|~\/\.docker/.test(build)
      || /^          version:/m.test(buildSteps[3] || '')
      || !/^          driver:\s*docker-container\s*$/m.test(buildSteps[3] || '')
      || !/^          driver-opts:\s*image=moby\/buildkit:v0\.31\.2@sha256:2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec\s*$/m.test(buildSteps[3] || '')
      || !/^          buildkitd-flags:\s*--debug=false\s*$/m.test(buildSteps[3] || '')
      || !/^          cache-binary:\s*false\s*$/m.test(buildSteps[3] || '')
      || !/d41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda/.test(buildSteps[2] || '')
      || !/\/usr\/bin\/git -c tar\.umask=0022 archive --format=tar --mtime="@\$SOURCE_COMMIT_TIME"/.test(buildSteps[6] || '')
      || !/> "\$CONTEXT_ARCHIVE"/.test(buildSteps[6] || '')
      || !/\/usr\/bin\/python3 - "\$CONTEXT_ARCHIVE"/.test(buildSteps[6] || '')
      || !/\("runtime\/managed-ci-runtime\.mjs", "file", 0o644, 0, 0\)/.test(buildSteps[6] || '')
      || !/chmod 0400 "\$CONTEXT_ARCHIVE"/.test(buildSteps[6] || '')
      || !/- 0<&"\$CONTEXT_ARCHIVE_FD"/.test(buildSteps[6] || '')
      || !prePushArchiveValidationClosed
      || MANAGED_CI_SUPPLY_CHAIN_POLICY.attestations?.provenance?.prePushContextValidationRequired !== true
      || !/--builder "\$BUILDX_BUILDER"/.test(buildSteps[6] || '')
      || !/--network none/.test(buildSteps[6] || '')
      || !/--provenance=false/.test(buildSteps[6] || '')
      || !/--sbom=false/.test(buildSteps[6] || '')
      || !/context-archive-mtime-epoch/.test(buildSteps[6] || '')
      || !/context-archive-sha256/.test(buildSteps[6] || '')
      || !/\/usr\/bin\/docker logout ghcr\.io/.test(buildSteps[7] || '')
      || !/0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509/.test(sbomSteps[2] || '')
      || !/6c1eb5c6f15c177fa3dd727ee186c61a660a3939a4e1dc1bc4b3e00eafec098e/.test(sbomSteps[2] || '')
      || !/exec \/usr\/bin\/env -i/.test(sbomSteps[4] || '')
      || !/GHCR_READ_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(sbomSteps[4] || '')
      || !/SYFT_REGISTRY_AUTH_AUTHORITY="ghcr\.io"/.test(sbomSteps[4] || '')
      || sbomSteps.some((step, index) => ![4, 5].includes(index) && /\bsecrets\./.test(step))
      || !/--arg imageSubject "\$IMAGE_SUBJECT"/.test(sbomSteps[6] || '')
      || !/\.metadata\.component\.name == \$imageSubject/.test(sbomSteps[6] || '')
      || !/--arg imageSubject "\$IMAGE_SUBJECT"/.test(attestSteps[3] || '')
      || !/\.metadata\.component\.name == \$imageSubject/.test(attestSteps[3] || '')
      || /\$imageInput|IMAGE_INPUT=/.test(`${sbomSteps[6] || ''}\n${attestSteps[3] || ''}`)
      || !/projectionCanonical="\$\(jq -cS/.test(attestSteps[3] || '')
      || !/printf '%s\\n' "\$projectionCanonical" > "\$projectionFile"/.test(attestSteps[3] || '')
      || /printf '%s' "\$projectionCanonical"/.test(attestSteps[3] || '')
      || /anchore\/sbom-action@/.test(managedBuilder)
      || /actions\/attest@/.test(build)
      || /(?:packages:\s*write|docker\/(?:login|build-push)-action@|\bsecrets\.)/.test(attest)
      || (attest.match(/actions\/attest@[a-f0-9]{40}/g) || []).length !== MANAGED_CI_ATTESTATION_COUNT
      || (attest.match(/push-to-registry:\s*false/g) || []).length !== MANAGED_CI_ATTESTATION_COUNT
      || (attest.match(/create-storage-record:\s*false/g) || []).length !== MANAGED_CI_ATTESTATION_COUNT
      || !/^        id:\s*provenance\s*$/m.test(attestSteps[4] || '')
      || !/^          predicate-type:\s*https:\/\/slsa\.dev\/provenance\/v1\s*$/m.test(attestSteps[4] || '')
      || !/^          predicate-path:\s*\$\{\{\s*steps\.image\.outputs\.provenance\s*\}\}\s*$/m.test(attestSteps[4] || '')
      || !/^        id:\s*sbom\s*$/m.test(attestSteps[6] || '')
      || !/^          sbom-path:\s*\$\{\{\s*steps\.image\.outputs\.sbom\s*\}\}\s*$/m.test(attestSteps[6] || '')
      || /^\s*predicate-(?:type|path):/m.test(attestSteps[6] || '')
      || !/^        id:\s*handoff\s*$/m.test(attestSteps[8] || '')
      || !/^          predicate-type:\s*https:\/\/qijenchen\.dev\/attestations\/managed-ci-image-handoff\/v2\s*$/m.test(attestSteps[8] || '')
      || !/^          predicate-path:\s*\$\{\{\s*steps\.image\.outputs\.predicate\s*\}\}\s*$/m.test(attestSteps[8] || '')
      || /push-to-registry:\s*true|artifact-metadata:\s*write/.test(attest)
    ) {
      add(managedBuilderFile, 'WF-MANAGED-CI-PRIVILEGE-SEPARATION', 'managed executor writer, read-only SBOM generator, digest binder, and OIDC-only attester must be four byte-closed jobs with an exact verified toolchain and no combined authority')
    }
    if (
      !/steps\.build\.outputs\.digest/.test(build)
      || !/https:\/\/actions\.github\.io\/buildtypes\/workflow\/v1/.test(build)
      || !/SBOM_DIGEST/.test(sbom)
      || !/CONTEXT_ARCHIVE_MTIME_EPOCH/.test(build)
      || !/CONTEXT_ARCHIVE_SHA256/.test(build)
      || !/CONTEXT_DIGEST/.test(build)
      || !/MATERIALS_DIGEST/.test(build)
      || !/TOOLCHAIN_DIGEST/.test(build)
      || !/24\.14\.0-bookworm-slim/.test(build)
      || !/4bd6219054c8bebcd26a66bfd8ca0bd6e1024b4b97474c59bb7ee3bbcbef4fe8/.test(build)
      || !/a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e/.test(build)
      || !/2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec/.test(build)
      || !/0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509/.test(sbom)
      || !/6c1eb5c6f15c177fa3dd727ee186c61a660a3939a4e1dc1bc4b3e00eafec098e/.test(sbom)
      || !/managed-ci-image-binding-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-\$\{\{ matrix\.execution-class \}\}/.test(sbom)
      || !/CONTEXT_ARCHIVE_SOURCE/.test(sbom)
      || !/\.context\.tar/.test(sbom)
      || (bind.match(/managed-ci-image-binding-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-(?:dependency-acquisition|deterministic-hook-audit|model-broker|github-observer)/g) || []).length !== 4
      || !/test "\$\(sha256sum "\$SBOM" \| cut -d' ' -f1\)" = "\$\(jq -r '\.sbom\.sha256' "\$FILE"\)"/.test(bind)
      || !/contexts\/\$EXECUTION_CLASS\.tar/.test(bind)
      || !/cmp -s/.test(bind)
      || !/cmp -s "\$EXPECTED_PATHS" "\$ACTUAL_PATHS"/.test(bind)
      || !/artifact_id:\s*\$\{\{\s*steps\.retain\.outputs\.artifact-id\s*\}\}/.test(bind)
      || !/artifact_digest:\s*\$\{\{\s*steps\.retain\.outputs\.artifact-digest\s*\}\}/.test(bind)
      || !/manifest_sha256:\s*\$\{\{\s*steps\.bind\.outputs\.manifest_sha256\s*\}\}/.test(bind)
      || !/managed-ci-image-set-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/.test(bind)
      || !/artifact-ids:\s*\$\{\{\s*needs\.bind-image-set\.outputs\.artifact_id\s*\}\}/.test(attest)
      || !/EXPECTED_ARTIFACT_DIGEST:\s*\$\{\{\s*needs\.bind-image-set\.outputs\.artifact_digest\s*\}\}/.test(attest)
      || !/EXPECTED_MANIFEST_SHA256:\s*\$\{\{\s*needs\.bind-image-set\.outputs\.manifest_sha256\s*\}\}/.test(attest)
      || !/sha256sum "\$MANIFEST"[\s\S]{0,120}\$EXPECTED_MANIFEST_SHA256/.test(attest)
      || !/ORIGINAL_CONTEXT_ARCHIVE/.test(attest)
      || !/cmp -s "\$ORIGINAL_CONTEXT_ARCHIVE" "\$FRESH_CONTEXT_ARCHIVE"/.test(attest)
      || !/--mtime="@\$SOURCE_COMMIT_TIME"/.test(attest)
      || !/\[\.\[\]\.sourceTree\] \| unique \| if length == 1 then \.\[0\]/.test(bind)
      || !/\.workflow\.sha == \$workflowSha/.test(bind)
      || !/test "\$\(sha256sum "\$SBOM_PATH" \| cut -d' ' -f1\)" = "\$SBOM_DIGEST"/.test(attest)
      || !/buildDefinition:/.test(attest)
      || !/resolvedDependencies:/.test(attest)
      || !/recipeDigest: \$image\.build\.recipe\.sha256/.test(attest)
      || !/buildContextArchiveMtimeEpoch: \$image\.build\.context\.archiveMtimeEpoch/.test(attest)
      || !/buildContextArchiveSha256: \$image\.build\.context\.archiveSha256/.test(attest)
      || !/buildContextDigest: \$image\.build\.context\.sha256/.test(attest)
      || !/materialsDigest: \$image\.build\.materials\.sha256/.test(attest)
      || !/toolchainDigest: \$image\.build\.toolchain\.sha256/.test(attest)
      || !/dockerfileFrontendDigest: \$image\.build\.toolchain\.dockerfileFrontend\.subjectDigest/.test(attest)
      || !/buildxBinarySha256: \$image\.build\.toolchain\.buildx\.linuxAmd64Sha256/.test(attest)
      || !/buildkitImageDigest: \$image\.build\.toolchain\.buildkit\.subjectDigest/.test(attest)
      || !/syftArchiveSha256: \$image\.build\.toolchain\.syft\.linuxAmd64ArchiveSha256/.test(attest)
      || !/syftBinarySha256: \$image\.build\.toolchain\.syft\.linuxAmd64BinarySha256/.test(attest)
      || !/managed-ci-image-handoff-v2/.test(attest)
      || !/predicate-type:\s*https:\/\/qijenchen\.dev\/attestations\/managed-ci-image-handoff\/v2/.test(attest)
    ) {
      add(managedBuilderFile, 'WF-MANAGED-CI-DIGEST-HANDOFF', 'managed executor attestation must consume one same-run immutable artifact ID and bind its archive digest, exact manifest SHA-256, closed class/subject, and pushed OCI digest before minting authority')
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

  const anchorFiles = [
    '.github/workflows/governance-anchor.yml',
    'template/ds-product-template/.github/workflows/governance-anchor.yml',
  ]
  for (const anchorFile of anchorFiles) {
    const anchor = sources[anchorFile]
    if (!anchor) {
      if (anchorFile.startsWith('template/')) add(anchorFile, 'WF-ANCHOR', 'required protected-base Governance App producer is missing')
      continue
    }
    const anchorJobs = workflowJobBlocks(anchor)
    const anchorVerify = anchorJobs.get('verify-candidate') || ''
    const anchorVerdict = anchorJobs.get('publish-app-verdict') || ''
    const productToolStageAt = anchorVerify.indexOf('--stage-trusted-product-checks trusted/.governance-tools')
    const playwrightInstallAt = anchorVerify.indexOf('node trusted/node_modules/playwright/cli.js install --with-deps chromium')
    const candidateLockPreflightAt = anchorVerify.indexOf('--lock-only')
    const candidateDependencySetupAt = anchorVerify.search(
      /node\s+\.\.\/trusted\/scripts\/setup-governance\.mjs\s+--dependencies-only\s+--root\s+\./,
    )
    const candidateFullSetupAt = anchorVerify.indexOf('runGovernanceSetup')
    const candidateAttestationAuditAt = anchorVerify.indexOf('--include-attestations')
    const candidateProvenanceAt = anchorVerify.indexOf('--verified-attestations')
    const candidateCheckerAt = anchorVerify.search(
      /node\s+\.\.\/trusted\/scripts\/setup-governance\.mjs\s+--installed-check-only\s+--root\s+\./,
    )
    const candidateStaticSetupCommands = anchorVerify.match(
      /node\s+\.\.\/trusted\/scripts\/setup-governance\.mjs\s+(?:--dependencies-only|--installed-check-only)\s+--root\s+\./g,
    ) || []
    const candidateHarnessAt = anchorVerify.indexOf('trusted/.governance-tools/scripts/consumer-source-harness.mjs --repo candidate')
    const candidateKillAt = anchorVerify.indexOf('pkill -KILL -u governance-candidate')
    const candidateFreezeAt = anchorVerify.indexOf('chmod -R a-w candidate')
    const productToolVerifyAt = anchorVerify.indexOf('--verify-trusted-product-checks trusted/.governance-tools')
    const protectedLintAt = anchorVerify.indexOf('trusted/.governance-tools/scripts/lint-ds-internal-imports.mjs --repo candidate')
    const protectedA11yAt = anchorVerify.indexOf('trusted/.governance-tools/scripts/audit-consumer-a11y.mjs --repo candidate')
    const templateProductChecksClosed = !anchorFile.startsWith('template/') || (
      [
        productToolStageAt,
        playwrightInstallAt,
        candidateLockPreflightAt,
        candidateDependencySetupAt,
        candidateAttestationAuditAt,
        candidateProvenanceAt,
        candidateCheckerAt,
        candidateHarnessAt,
        candidateKillAt,
        candidateFreezeAt,
        productToolVerifyAt,
        protectedLintAt,
        protectedA11yAt,
      ].every(position => position >= 0)
      && candidateFullSetupAt < 0
      && candidateStaticSetupCommands.length === 2
      && productToolStageAt < playwrightInstallAt
      && playwrightInstallAt < candidateLockPreflightAt
      && candidateLockPreflightAt < candidateDependencySetupAt
      && candidateDependencySetupAt < candidateAttestationAuditAt
      && candidateAttestationAuditAt < candidateProvenanceAt
      && candidateProvenanceAt < candidateCheckerAt
      && candidateCheckerAt < candidateHarnessAt
      && candidateHarnessAt < candidateKillAt
      && candidateKillAt < candidateFreezeAt
      && candidateFreezeAt < productToolVerifyAt
      && productToolVerifyAt < protectedLintAt
      && protectedLintAt < protectedA11yAt
      && /useradd --system --user-group --no-create-home[\s\S]*governance-candidate/.test(anchorVerify)
      && /sudo -u governance-candidate env -i/.test(anchorVerify)
      && !/(?:^|\s)node (?:candidate\/)?scripts\/(?:lint-ds-internal-imports|audit-consumer-a11y)\.mjs/m.test(anchorVerify)
      && !/\bnpx\b[^\n]*\bplaywright\b/.test(anchorVerify)
      && !/node \.\.\/trusted\/node_modules\/npm\/bin\/npm-cli\.js audit --audit-level=high/.test(anchorVerify)
    )
    const templateDispatchClosed = !anchorFile.startsWith('template/') || (
      /^\s{2}repository_dispatch:\s*$/m.test(anchor)
      && /types:\s*\[governance-upgrade-candidate-validation\]/.test(anchor)
      && /governance-upgrade-writer-v1/.test(anchorVerify)
      && /\.client_payload \| keys \| sort/.test(anchorVerify)
      && /\.base\.ref/.test(anchorVerify)
      && /\.base\.sha/.test(anchorVerify)
      && /\.head\.sha/.test(anchorVerify)
      && /git\/ref\/heads\/main/.test(anchorVerify)
    )
    // 2026-07-29 user 拍板 1B:root repo 拆除 App-pinned verdict 層(App secrets 從未
    // provision、檢查恆紅;protected required checks 已覆蓋同一保證面)。root anchor
    // fail-closed 要求 verdict job 不得再出現(防未審查重引入);template anchor 是
    // fleet consumer 藍圖,保留 App 架構待 fleet 啟用時重估。
    const verdictClosed = anchorFile.startsWith('template/')
      ? (
        /^\s{2}publish-app-verdict:\s*$/m.test(anchor)
        && needsJob(anchorVerdict, 'verify-candidate')
        && /^\s{4}if:\s*(?:\$\{\{\s*)?always\(\)/m.test(anchorVerdict)
        && /^\s{4}environment:\s*\n\s{6}name:\s*governance-check-verdict\s*$/m.test(anchorVerdict)
        && /actions\/create-github-app-token@[a-f0-9]{40}/.test(anchorVerdict)
        && /secrets\.GOVERNANCE_CHECK_APP_ID/.test(anchorVerdict)
        && /secrets\.GOVERNANCE_CHECK_APP_PRIVATE_KEY/.test(anchorVerdict)
        && /permission-checks:\s*write/.test(anchorVerdict)
        && !/GOVERNANCE_WRITER_APP|permission-(?:contents|pull-requests):\s*write/.test(anchorVerdict)
        && /(?:github\.event\.pull_request\.head\.sha|needs\.verify-candidate\.outputs\.head_sha)/.test(anchorVerdict)
        && /repos\/\$GITHUB_REPOSITORY\/check-runs/.test(anchorVerdict)
        && /Immutable consumer snapshot/.test(anchorVerdict)
      )
      : !/^\s{2}publish-app-verdict:/m.test(anchor)
    if (
      !/^\s{2}pull_request_target:\s*$/m.test(anchor)
      || /^\s{2}workflow_dispatch:\s*$/m.test(anchor)
      || !templateDispatchClosed
      || !/^\s{2}verify-candidate:\s*$/m.test(anchor)
      || !verdictClosed
      || /\bsecrets\.|actions\/create-github-app-token@/.test(anchorVerify)
      || (anchorFile === '.github/workflows/governance-anchor.yml' && !/trusted\/scripts\/verify-privileged-change\.mjs/.test(anchorVerify))
      || !templateProductChecksClosed
      || (anchorFile.startsWith('template/') && /npm run (?:typecheck|build|audit:a11y)/.test(anchorVerify))
    ) add(anchorFile, 'WF-ANCHOR', 'protected-base credential-free verifier and environment-isolated App-pinned verdict producer are incomplete')
  }

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
