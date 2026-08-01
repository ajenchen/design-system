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
  '.github/workflows/a11y-and-size.yml',
  '.github/workflows/visual-regression.yml',
  '.github/workflows/composition-fidelity.yml',
  '.github/workflows/packaging-canary.yml',
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

export function auditWorkflowSources(sources, { rootNpmrc = '', releaseNpmPublisher = '' } = {}) {
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
      if (/^\s*continue-on-error:\s*true\b/.test(line)) add(file, 'WF-FAIL-OPEN', `line ${index + 1}: continue-on-error is forbidden`)
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

  const release = sources['.github/workflows/release.yml'] || ''
  if (/NPM_TOKEN|NODE_AUTH_TOKEN|_authToken/.test(release)) add('.github/workflows/release.yml', 'WF-NPM-TOKEN', 'release must use tokenless stage-only trusted publishing')
  const releaseJobs = workflowJobBlocks(release)
  const resolveRelease = releaseJobs.get('resolve-release-request') || ''
  const trustPreflight = releaseJobs.get('trust-preflight') || ''
  const buildRelease = releaseJobs.get('build-release-evidence') || ''
  const attestRelease = releaseJobs.get('attest-release') || ''
  const publishNpm = releaseJobs.get('publish-npm') || ''
  const executableRelease = executableSource(release)
  const executableNpmPublisher = executableSource(releaseNpmPublisher)
  const nativeStagePublisherIsClosed = (
    /npmResult\(npmCli,\s*\[\s*'stage',\s*'publish',\s*archive,[\s\S]*'--provenance'[\s\S]*'--json'/.test(executableNpmPublisher)
    && /receiptItem\.status = 'submitting'[\s\S]*writeAtomicJson\(receiptPath, receipt\)[\s\S]*await recheckRemoteTag\([^\n]+\)[\s\S]*npmResult\(npmCli,\s*\[\s*'stage',\s*'publish'/.test(executableNpmPublisher)
    && /receiptItem\.status = 'ambiguous'[\s\S]*writeAtomicJson\(receiptPath, receipt\)/.test(executableNpmPublisher)
    && /receiptItem\.stageId = evidence\.stageId[\s\S]*receiptItem\.status = 'staged'[\s\S]*writeAtomicJson\(receiptPath, receipt\)/.test(executableNpmPublisher)
    && !/\[\s*'publish'\b|'dist-tag'/.test(executableNpmPublisher)
  )
  if (
    !/^    environment:\s*\n      name:\s*npm-release\s*$/m.test(publishNpm)
    || !/node scripts\/release-npm-publish\.mjs/.test(publishNpm)
    || !nativeStagePublisherIsClosed
    || /\bnpm\s+publish\b|\bgh\s+release\s+(?:create|upload|edit)\b/.test(executableRelease)
  ) {
    add('.github/workflows/release.yml', 'WF-TRUSTED-PUBLISH', 'release must bind npm-release and use only the reviewed tokenless native-stage helper with provenance; direct npm publish and GitHub Release mutations are forbidden')
  }
  if (
    !resolveRelease || !trustPreflight || !buildRelease || !attestRelease || !publishNpm
    || releaseJobs.has('github-release')
    || !/^\s{2}repository_dispatch:\s*$/m.test(release)
    || !/^\s{4}types:\s*\[stage-protected-release\]\s*$/m.test(release)
    || /^\s{2}(?:workflow_dispatch|pull_request):\s*$/m.test(release)
    || /^\s{4}tags:/m.test(eventBlock(release.split(/^jobs:\s*$/m)[0], 'push'))
    || !/^\s{4}if:\s*github\.ref == 'refs\/heads\/main'\s*$/m.test(resolveRelease)
    || !/test "\$tag_commit" = "\$main_commit"/.test(resolveRelease)
    || !/test "\$event_commit" = "\$main_commit"/.test(resolveRelease)
    || !needsJob(buildRelease, 'resolve-release-request')
    || !/contents:\s*read/.test(buildRelease)
    || /(?:contents|id-token):\s*write/.test(buildRelease)
    || !needsJob(attestRelease, 'build-release-evidence')
    || !/contents:\s*read/.test(attestRelease)
    || !/id-token:\s*write/.test(attestRelease)
    || !/attestations:\s*write/.test(attestRelease)
    || /contents:\s*write/.test(attestRelease)
    || !needsJob(attestRelease, 'trust-preflight')
    || !needsJob(publishNpm, 'build-release-evidence')
    || !needsJob(publishNpm, 'attest-release')
    || !needsJob(publishNpm, 'trust-preflight')
    || !/contents:\s*read/.test(publishNpm)
    || !/id-token:\s*write/.test(publishNpm)
    || /contents:\s*write|attestations:\s*write/.test(publishNpm)
    || /\bnpm ci\b|build-storybook|test:consumer-governance|test:sync-all-transaction/.test(publishNpm)
    || /contents:\s*write/.test(release)
  ) add('.github/workflows/release.yml', 'WF-RELEASE-PRIVILEGE', 'stage authority must load from protected-default dispatch, bind the exact tag to current main, and confine writes to attestation plus stage-only npm OIDC; GitHub contents write belongs only to release-finalize.yml')

  if (
    !trustPreflight
    || /^\s{4}if:/m.test(trustPreflight)
    || /(?:contents|id-token|attestations):\s*write/.test(trustPreflight)
    || !needsJob(attestRelease, 'trust-preflight')
    || !needsJob(publishNpm, 'trust-preflight')
  ) add('.github/workflows/release.yml', 'WF-RELEASE-TRUST-PREFLIGHT', 'the read-only trust preflight must be mandatory and gate both attestation and native staging authority')

  if (
    !/release_set_sha256:\s*\$\{\{\s*steps\.release_set\.outputs\.sha256\s*\}\}/.test(buildRelease)
    || !/actions\/upload-artifact@[a-f0-9]{40}/.test(buildRelease)
    || !/(?:git merge-base --is-ancestor[\s\S]{0,300}refs\/remotes\/origin\/main|test "\$\{\{ steps\.release-identity\.outputs\.commit \}\}" = "\$\(git rev-parse refs\/remotes\/origin\/main\^\{commit\}\)")/.test(buildRelease)
    || (executableRelease.match(/node scripts\/release-sbom\.mjs/g) || []).length !== 1
    || !/node scripts\/release-sbom\.mjs[\s\S]*--input "\$RUNNER_TEMP\/release\.sbom\.raw\.json"[\s\S]*--output "\$GITHUB_WORKSPACE\/release-artifacts\/release\.sbom\.cdx\.json"[\s\S]*--tag "\$RELEASE_TAG"[\s\S]*--git-tree "\$\{\{ needs\.resolve-release-request\.outputs\.release_tree \}\}"/.test(buildRelease)
    || /(?:sbom_serial|del\(\.serialNumber|\.serialNumber\s*=|metadata\.timestamp)/.test(executableRelease)
    || ![attestRelease, publishNpm].every((block) =>
      /release-set\.mjs[\s\S]*--expected/.test(block) && /build-release-bom\.mjs --verify/.test(block))
    || ![attestRelease, publishNpm].every((block) =>
      /release-trust-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/.test(block)
      && /release-trust-preflight\.mjs[\s\S]*--verify[\s\S]*--expected-authorization-digest/.test(block))
    || (attestRelease.match(/--expected-object\b/g) || []).length !== (attestRelease.match(/actions\/attest@[a-f0-9]{40}/g) || []).length
    || !/release-remote-tag\.mjs/.test(publishNpm)
    || !/release-remote-tag\.mjs[\s\S]*--expected-object\b[\s\S]*node scripts\/release-npm-publish\.mjs/.test(publishNpm)
    || !everyAuthorityUseHasSignedTagRecheck(attestRelease, /actions\/attest@[a-f0-9]{40}/g)
    || !everyAuthorityUseHasSignedTagRecheck(publishNpm, /node scripts\/release-npm-publish\.mjs/g)
    || !/--receipt\s+"\$RUNNER_TEMP\/npm-stage\/npm-stage-receipt\.json"[\s\S]*--trust-artifact-digest[\s\S]*--trust-run-attempt/.test(publishNpm)
    || !/if:\s*always\(\)[\s\S]*sha256sum\s+"\$receipt"[\s\S]*actions\/upload-artifact@[a-f0-9]{40}[\s\S]*name:\s*npm-stage-\$\{\{ github\.event\.client_payload\.tag \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/.test(publishNpm)
    || !/stage_artifact_digest:\s*\$\{\{\s*steps\.finalizer_handoff\.outputs\.stage_artifact_digest\s*\}\}/.test(publishNpm)
    || !/stage_receipt_sha256:\s*\$\{\{\s*steps\.finalizer_handoff\.outputs\.stage_receipt_sha256\s*\}\}/.test(publishNpm)
    || !/STAGE_ARTIFACT_DIGEST:\s*\$\{\{\s*steps\.retain_stage\.outputs\.artifact-digest\s*\}\}/.test(publishNpm)
    || !/GITHUB_STEP_SUMMARY/.test(publishNpm)
  ) add('.github/workflows/release.yml', 'WF-RELEASE-EVIDENCE', 'attestation and native staging must rebind the same release/trust evidence, and staging must retain an attempt-bound receipt plus the closed finalizer digest handoff')

  const finalizerFile = '.github/workflows/release-finalize.yml'
  const finalizer = sources[finalizerFile] || ''
  const finalizerJobs = workflowJobBlocks(finalizer)
  const certifyFinalization = finalizerJobs.get('certify-finalization') || ''
  const publishGithub = finalizerJobs.get('publish-github-release') || ''
  const executableFinalizer = executableSource(finalizer)
  if (
    !/^  repository_dispatch:\s*$/m.test(finalizer)
    || !/^    types:\s*\[finalize-staged-release\]\s*$/m.test(finalizer)
    || /^  workflow_dispatch:\s*$/m.test(finalizer)
    || /\$\{\{\s*inputs\./.test(finalizer)
    || ![
      'stage_run_id', 'stage_run_attempt', 'stage_artifact_digest', 'release_set_sha256', 'stage_receipt_sha256',
      'release_authorization_digest', 'release_trust_evidence_digest', 'release_trust_artifact_digest',
    ]
      .every((key) => finalizer.includes(`github.event.client_payload.${key}`))
    || !certifyFinalization || !publishGithub
    || !/^    if:\s*github\.ref == 'refs\/heads\/main'\s*$/m.test(certifyFinalization)
    || !/^    if:\s*github\.ref == 'refs\/heads\/main'\s*$/m.test(publishGithub)
    || !/contents:\s*read/.test(certifyFinalization)
    || !/actions:\s*read/.test(certifyFinalization)
    || /contents:\s*write|id-token:\s*write|attestations:\s*write|environment:/.test(certifyFinalization)
    || !needsJob(publishGithub, 'certify-finalization')
    || !/contents:\s*write/.test(publishGithub)
    || /id-token:\s*write|attestations:\s*write/.test(publishGithub)
    || !/environment:\s*\n\s+name:\s*release-finalize/.test(publishGithub)
  ) add(finalizerFile, 'WF-FINALIZE-PRIVILEGE', 'finalizer must be default-branch repository_dispatch only and separate read-only exact-tag certification from an environment-gated contents-only writer')
  if (
    !/ref:\s*refs\/tags\/\$\{\{ github\.event\.client_payload\.tag \}\}/.test(certifyFinalization)
    || !/git merge-base --is-ancestor[\s\S]{0,300}refs\/remotes\/origin\/main/.test(certifyFinalization)
    || (certifyFinalization.match(/node scripts\/run-verified-npm\.mjs -- pack \.\/packages\//g) || []).length !== 3
    || (executableFinalizer.match(/node scripts\/release-sbom\.mjs/g) || []).length !== 1
    || !/node scripts\/release-sbom\.mjs[\s\S]*--input "\$RUNNER_TEMP\/release\.sbom\.raw\.json"[\s\S]*--output "\$GITHUB_WORKSPACE\/release-artifacts\/release\.sbom\.cdx\.json"[\s\S]*--tag "\$\{\{ github\.event\.client_payload\.tag \}\}"[\s\S]*--git-tree "\$\{\{ steps\.identity\.outputs\.tree \}\}"/.test(certifyFinalization)
    || /(?:sbom_serial|del\(\.serialNumber|\.serialNumber\s*=|metadata\.timestamp)/.test(executableFinalizer)
    || !/build-release-bom\.mjs[\s\S]*--allow-repository-dispatch/.test(certifyFinalization)
    || !/release-set\.mjs[\s\S]*--expected "\$\{\{ github\.event\.client_payload\.release_set_sha256 \}\}"/.test(certifyFinalization)
    || !/client_payload \| keys \| sort[\s\S]*stage_artifact_digest/.test(certifyFinalization)
    || !/release-stage-run-identity\.mjs[\s\S]*--release-trust-artifact-digest[\s\S]*Download exact original release trust evidence[\s\S]*release-trust-\$\{\{ github\.event\.client_payload\.stage_run_id \}\}-\$\{\{ github\.event\.client_payload\.stage_run_attempt \}\}[\s\S]*--verify-issued[\s\S]*--expected-authorization-digest[\s\S]*Download the exact durable stage receipt/.test(certifyFinalization)
    || !/npm-stage-\$\{\{ github\.event\.client_payload\.tag \}\}-\$\{\{ github\.event\.client_payload\.stage_run_id \}\}-\$\{\{ github\.event\.client_payload\.stage_run_attempt \}\}/.test(certifyFinalization)
    || !/release-npm-finalize-verify\.mjs/.test(certifyFinalization)
    || !/release-npm-finalize-verify\.mjs[\s\S]*--release-authorization-digest[\s\S]*--release-trust-evidence-digest[\s\S]*--release-trust-evidence-file\s+"\$GITHUB_WORKSPACE\/finalization-evidence\/release-trust-preflight\.json"[\s\S]*--release-trust-evidence-file-sha256\s+"\$\{\{ steps\.issued_trust\.outputs\.evidence_file_sha256 \}\}"[\s\S]*--release-trust-artifact-digest/.test(certifyFinalization)
    || !/tag_object:\s*\$\{\{\s*steps\.issued_trust\.outputs\.tag_object\s*\}\}/.test(certifyFinalization)
    || !/release_trust_evidence_file_sha256:\s*\$\{\{\s*steps\.issued_trust\.outputs\.evidence_file_sha256\s*\}\}/.test(certifyFinalization)
    || !/--verify-issued[\s\S]*--expected-authorization-digest[\s\S]*--retain-exact\s+"\$GITHUB_WORKSPACE\/finalization-evidence\/release-trust-preflight\.json"[\s\S]*--github-output\s+"\$GITHUB_OUTPUT"[\s\S]*release-remote-tag\.mjs[\s\S]*--expected-object\s+"\$\{\{ steps\.issued_trust\.outputs\.tag_object \}\}"[\s\S]*release-npm-finalize-verify\.mjs[\s\S]*--tag-object\s+"\$\{\{ steps\.issued_trust\.outputs\.tag_object \}\}"/.test(certifyFinalization)
    || !/actions\/upload-artifact@[a-f0-9]{40}[\s\S]*finalization-evidence\/release-trust-preflight\.json[\s\S]*finalization-evidence\/npm-finalization-receipt\.json/.test(certifyFinalization)
    || !/actions\/upload-artifact@[a-f0-9]{40}/.test(certifyFinalization)
    || !/release-set\.mjs[\s\S]*--expected "\$\{\{ needs\.certify-finalization\.outputs\.release_set_sha256 \}\}"/.test(publishGithub)
    || (finalizer.match(/release-stage-run-identity\.mjs/g) || []).length !== 2
    || (finalizer.match(/--release-trust-artifact-digest/g) || []).length < 4
    || !/release-stage-run-identity\.mjs[\s\S]*release-npm-finalization-receipt\.mjs/.test(publishGithub)
    || !/release-npm-finalization-receipt\.mjs/.test(publishGithub)
    || !/release-npm-finalization-receipt\.mjs[\s\S]*--tag-object\s+"\$\{\{ needs\.certify-finalization\.outputs\.tag_object \}\}"[\s\S]*--release-authorization-digest[\s\S]*--release-trust-evidence-digest[\s\S]*--release-trust-evidence-file\s+"\$GITHUB_WORKSPACE\/finalization-evidence\/release-trust-preflight\.json"[\s\S]*--release-trust-evidence-file-sha256\s+"\$\{\{ needs\.certify-finalization\.outputs\.release_trust_evidence_file_sha256 \}\}"[\s\S]*--release-trust-artifact-digest/.test(publishGithub)
    || !/release-remote-tag\.mjs/.test(publishGithub)
    || !/TAG_READ_TOKEN:\s*\$\{\{ secrets\.RELEASE_TAG_READ_TOKEN \}\}/.test(publishGithub)
    || !/release-remote-tag\.mjs[\s\S]*--expected-object\s+"\$\{\{ needs\.certify-finalization\.outputs\.tag_object \}\}"[\s\S]*--token-env\s+TAG_READ_TOKEN[\s\S]*release-github-release\.mjs[\s\S]*--tag-object\s+"\$\{\{ needs\.certify-finalization\.outputs\.tag_object \}\}"[\s\S]*--tag-token-env\s+TAG_READ_TOKEN/.test(publishGithub)
    || !/release-github-release\.mjs[\s\S]*--audit-evidence\s+"\$GITHUB_WORKSPACE\/finalization-evidence\/npm-finalization-receipt\.json"[\s\S]*--audit-evidence-sha256\s+"\$\{\{ needs\.certify-finalization\.outputs\.finalization_receipt_sha256 \}\}"/.test(publishGithub)
    || !/release-github-release\.mjs[\s\S]*--release-trust-evidence\s+"\$GITHUB_WORKSPACE\/finalization-evidence\/release-trust-preflight\.json"[\s\S]*--release-trust-evidence-sha256\s+"\$\{\{ needs\.certify-finalization\.outputs\.release_trust_evidence_file_sha256 \}\}"/.test(publishGithub)
    || /\bnpm\s+(?:stage\s+publish|publish|dist-tag)\b/.test(executableFinalizer)
  ) add(finalizerFile, 'WF-FINALIZE-EVIDENCE', 'finalizer must independently rebuild the exact tag, certify npm/tag receipts, and rebind them before immutable GitHub Release mutation')

  const mirrorFile = '.github/workflows/mirror-to-published-template.yml'
  const mirror = sources[mirrorFile] || ''
  const mirrorJobs = workflowJobBlocks(mirror)
  const certifyMirror = executableSource(mirrorJobs.get('certify-mirror') || '')
  const mirrorWriter = executableSource(mirrorJobs.get('write-mirror-pr') || '')
  const mirrorPreJobs = mirror.split(/^jobs:\s*$/m)[0]
  const mirrorEvents = workflowEventNames(mirrorPreJobs)
  const mirrorPayloadFields = [...mirror.matchAll(/github\.event\.client_payload\.([A-Za-z0-9_]+)/g)].map(match => match[1])
  const allowedMirrorPayloadFields = new Set(['finalizer_run_id', 'finalizer_run_attempt'])
  const mirrorPayloadShape = /client_payload\s*\|\s*keys(?:\s*\|\s*sort)?\)?\s*==\s*\[\s*"finalizer_run_attempt"\s*,\s*"finalizer_run_id"\s*\]/
  const mirrorPayloadGuarded = /if:\s*(?:\$\{\{\s*)?github\.event_name\s*==\s*'repository_dispatch'(?:\s*\}\})?[\s\S]{0,500}client_payload\s*\|\s*keys/.test(certifyMirror)
    || /elif\s+\[\s*"\$GITHUB_EVENT_NAME"\s*=\s*repository_dispatch\s*\];\s*then[\s\S]{0,500}client_payload\s*\|\s*keys/.test(certifyMirror)
  if (
    mirrorEvents.length !== 2
    || !mirrorEvents.includes('workflow_run')
    || !mirrorEvents.includes('repository_dispatch')
    || !/^\s{4}workflows:\s*\[Finalize staged release\]\s*(?:#.*)?$/m.test(eventBlock(mirrorPreJobs, 'workflow_run'))
    || !/^\s{4}types:\s*\[completed\]\s*(?:#.*)?$/m.test(eventBlock(mirrorPreJobs, 'workflow_run'))
    || !/^\s{4}types:\s*\[mirror-template-request\]\s*(?:#.*)?$/m.test(eventBlock(mirrorPreJobs, 'repository_dispatch'))
    || /github\.event\.workflow_run\.head_sha/.test(mirror)
    || !/github\.event\.workflow_run\.conclusion\s*==\s*'success'/.test(certifyMirror)
    || !/github\.event\.workflow_run\.id/.test(mirror)
    || !/github\.event\.workflow_run\.run_attempt/.test(mirror)
    || !/github\.event\.client_payload\.finalizer_run_id/.test(mirror)
    || !/github\.event\.client_payload\.finalizer_run_attempt/.test(mirror)
    || mirrorPayloadFields.some(field => !allowedMirrorPayloadFields.has(field))
    || !mirrorPayloadGuarded
    || !mirrorPayloadShape.test(certifyMirror)
  ) add(mirrorFile, 'WF-MIRROR-TRIGGER', 'mirror must load only from the completed finalizer or a closed two-field protected-default retry dispatch; the finalizer workflow head is never the release source')

  const concurrency = mirror.match(/^concurrency:\s*\n([\s\S]*?)(?=^[^\s#]|(?![\s\S]))/m)?.[1] || ''
  if (
    !/group:/.test(concurrency)
    || !/github\.event\.workflow_run\.id/.test(concurrency)
    || !/github\.event\.workflow_run\.run_attempt/.test(concurrency)
    || !/github\.event\.client_payload\.finalizer_run_id/.test(concurrency)
    || !/github\.event\.client_payload\.finalizer_run_attempt/.test(concurrency)
    || !/^\s{2}cancel-in-progress:\s*false\s*(?:#.*)?$/m.test(concurrency)
  ) add(mirrorFile, 'WF-MIRROR-CONCURRENCY', 'mirror concurrency must be scoped to the exact finalizer run/attempt and may not cancel an in-flight evidence writer')

  const handoffFlags = [
    '--repository', '--finalizer-run-id', '--finalizer-run-attempt', '--token-env', '--output',
  ]
  const certifyHandoffCommands = continuedShellCommands(certifyMirror, 'trusted/scripts/release-finalizer-mirror-handoff.mjs')
  const writerHandoffCommands = continuedShellCommands(mirrorWriter, 'trusted/scripts/release-finalizer-mirror-handoff.mjs')
  const commandHasFlags = (command, flags) => flags.every(flag => command.includes(flag))
  const exactCertifyHandoffArgs = [
    '--repository "$GITHUB_REPOSITORY"', '--finalizer-run-id "$FINALIZER_RUN_ID"',
    '--finalizer-run-attempt "$FINALIZER_RUN_ATTEMPT"', '--token-env GH_TOKEN', '--output ',
  ]
  const exactWriterHandoffArgs = [
    '--repository "$GITHUB_REPOSITORY"', '--finalizer-run-id "$EXPECTED_FINALIZER_RUN_ID"',
    '--finalizer-run-attempt "$EXPECTED_FINALIZER_RUN_ATTEMPT"', '--token-env GH_TOKEN', '--output ',
  ]
  const trustedCheckoutPattern = /uses:\s*actions\/checkout@[a-f0-9]{40}[\s\S]{0,500}?ref:\s*\$\{\{\s*github\.sha\s*\}\}[\s\S]{0,300}?path:\s*trusted/
  if (
    certifyHandoffCommands.length !== 1
    || writerHandoffCommands.length !== 1
    || !certifyHandoffCommands.every(command => commandHasFlags(command, handoffFlags))
    || !writerHandoffCommands.every(command => commandHasFlags(command, handoffFlags))
    || !certifyHandoffCommands.every(command => commandHasFlags(command, exactCertifyHandoffArgs))
    || !writerHandoffCommands.every(command => commandHasFlags(command, exactCertifyHandoffArgs)
      || commandHasFlags(command, exactWriterHandoffArgs))
    || !trustedCheckoutPattern.test(certifyMirror)
    || !trustedCheckoutPattern.test(mirrorWriter)
    || !/git -C trusted fetch[\s\S]*refs\/heads\/main:refs\/remotes\/origin\/main/.test(certifyMirror)
    || !/git -C trusted rev-parse ['"]?HEAD\^\{commit\}['"]?/.test(certifyMirror)
    || !/git -C trusted rev-parse ['"]?refs\/remotes\/origin\/main\^\{commit\}['"]?/.test(certifyMirror)
    || !/path:\s*source/.test(certifyMirror)
    || !/ref:\s*\$\{\{\s*steps\.[A-Za-z0-9_-]+\.outputs\.(?:release_commit|source_sha)\s*\}\}/.test(certifyMirror)
    || !/git -C source rev-parse ['"]?HEAD\^\{commit\}['"]?/.test(certifyMirror)
    || !/git -C source rev-parse ['"]?HEAD\^\{tree\}['"]?/.test(certifyMirror)
    || !/git -C source merge-base --is-ancestor[\s\S]{0,300}refs\/remotes\/origin\/main/.test(certifyMirror)
  ) add(mirrorFile, 'WF-MIRROR-SOURCE', 'protected-base code must derive the finalizer handoff twice, while the exact release commit/tree is checked out separately and proved to be on current main')

  const mirrorOutputKeys = [
    'ready', 'trusted_sha', 'handoff_sha256', 'finalizer_workflow_source_sha', 'finalizer_run_id', 'finalizer_run_attempt',
    'finalizer_artifact_id', 'finalizer_artifact_digest', 'release_id', 'release_tag', 'version',
    'tag_object', 'source_sha', 'source_tree', 'release_set_sha256', 'release_bom_sha256',
    'finalization_receipt_sha256', 'release_trust_evidence_sha256', 'external_activation_requirements_sha256',
    'activation_boundary_proof_sha256', 'archive_sha256',
    'tree_sha256', 'scaffold_lock_sha256', 'artifact_id', 'artifact_digest',
  ]
  const mirrorOutputBindings = new Map([
    ['ready', 'steps.certify.outputs.ready'],
    ['trusted_sha', 'steps.trusted.outputs.sha'],
    ['handoff_sha256', 'steps.handoff.outputs.handoff_sha256'],
    ['finalizer_workflow_source_sha', 'steps.handoff.outputs.finalizer_workflow_source_sha'],
    ['finalizer_run_id', 'steps.handoff.outputs.finalizer_run_id'],
    ['finalizer_run_attempt', 'steps.handoff.outputs.finalizer_run_attempt'],
    ['finalizer_artifact_id', 'steps.handoff.outputs.finalizer_artifact_id'],
    ['finalizer_artifact_digest', 'steps.handoff.outputs.finalizer_artifact_digest'],
    ['release_id', 'steps.handoff.outputs.release_id'],
    ['release_tag', 'steps.handoff.outputs.release_tag'],
    ['version', 'steps.handoff.outputs.version'],
    ['tag_object', 'steps.handoff.outputs.tag_object'],
    ['source_sha', 'steps.handoff.outputs.source_sha'],
    ['source_tree', 'steps.handoff.outputs.source_tree'],
    ['release_set_sha256', 'steps.handoff.outputs.release_set_sha256'],
    ['release_bom_sha256', 'steps.archive.outputs.release_bom_sha256'],
    ['finalization_receipt_sha256', 'steps.handoff.outputs.finalization_receipt_sha256'],
    ['release_trust_evidence_sha256', 'steps.handoff.outputs.release_trust_evidence_sha256'],
    ['external_activation_requirements_sha256', 'steps.handoff.outputs.external_activation_requirements_sha256'],
    ['activation_boundary_proof_sha256', 'steps.archive.outputs.activation_boundary_proof_sha256'],
    ['archive_sha256', 'steps.archive.outputs.sha256'],
    ['tree_sha256', 'steps.archive.outputs.tree_sha256'],
    ['scaffold_lock_sha256', 'steps.archive.outputs.scaffold_lock_sha256'],
    ['artifact_id', 'steps.upload.outputs.artifact-id'],
    ['artifact_digest', 'steps.upload.outputs.artifact-digest'],
  ])
  const missingDeclaredMirrorOutput = mirrorOutputKeys.some((key) => {
    const binding = mirrorOutputBindings.get(key)
    if (!binding) return true
    const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp(`^      ${key}:\\s*\\$\\{\\{\\s*${escaped}\\s*\\}\\}\\s*$`, 'm').test(certifyMirror)
  })
  const missingWriterMirrorBinding = mirrorOutputKeys.some(key => !mirrorWriter.includes(`needs.certify-mirror.outputs.${key}`))
  const handoffBindings = [
    ['.workflowSourceSha', 'FINALIZER_WORKFLOW_SOURCE_SHA'],
    ['.finalizerRun.runId', 'FINALIZER_RUN_ID'],
    ['.finalizerRun.runAttempt', 'FINALIZER_RUN_ATTEMPT'],
    ['.artifact.id', 'FINALIZER_ARTIFACT_ID'],
    ['.artifact.digest', 'FINALIZER_ARTIFACT_DIGEST'],
    ['.release.releaseId', 'RELEASE_ID'],
    ['.release.tag', 'RELEASE_TAG'],
    ['.release.version', 'VERSION'],
    ['.release.tagObject', 'TAG_OBJECT'],
    ['.release.releaseCommit', 'SOURCE_SHA'],
    ['.release.releaseTree', 'SOURCE_TREE'],
    ['.release.releaseSetSha256', 'RELEASE_SET_SHA256'],
    ['.release.bomSha256', 'RELEASE_BOM_SHA256'],
    ['.release.finalizationReceiptSha256', 'FINALIZATION_RECEIPT_SHA256'],
    ['.release.releaseTrustEvidenceSha256', 'RELEASE_TRUST_EVIDENCE_SHA256'],
    ['.release.externalActivationRequirementsSha256', 'EXTERNAL_ACTIVATION_REQUIREMENTS_SHA256'],
  ]
  const missingFreshHandoffComparison = handoffBindings.some(([selector, expected]) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const direct = new RegExp(`jq\\s+-(?:er|e)\\s+['"]${escaped}['"][^\\n]*\\)[^\\n]*=\\s*['"]?\\$(?:EXPECTED_)?${expected}\\b`)
    const helper = new RegExp(`check_field\\s+['"]${escaped}['"]\\s+['"]?\\$(?:EXPECTED_)?${expected}\\b`)
    return !direct.test(mirrorWriter) && !helper.test(mirrorWriter)
  })
  if (
    missingDeclaredMirrorOutput
    || missingWriterMirrorBinding
    || missingFreshHandoffComparison
    || !/test\s+"\$\(sha256sum\s+"?\$HANDOFF"?[^\n]*\)"\s*=\s*"\$(?:EXPECTED_)?HANDOFF_SHA256"/.test(mirrorWriter)
    || !/test\s+"\$TRUSTED_SHA"\s*=\s*"\$(?:EXPECTED_)?TRUSTED_SHA"/.test(mirrorWriter)
  ) add(mirrorFile, 'WF-MIRROR-HANDOFF', 'every finalizer, release, archive, and uploaded-artifact identity must cross the job boundary explicitly and be compared with a fresh protected-base resolution')

  const certifyActivationCommands = continuedShellCommands(certifyMirror, 'trusted/scripts/verify-mirror-activation-boundary.mjs')
  const writerActivationCommands = continuedShellCommands(mirrorWriter, 'trusted/scripts/verify-mirror-activation-boundary.mjs')
  const activationVerifierFlags = [
    '--release-source-root', '--expected-commit', '--expected-tree',
    '--expected-external-activation-requirements-sha256', '--output',
  ]
  const exactCertifyActivationArgs = [
    '--release-source-root "$GITHUB_WORKSPACE/source"',
    '--expected-commit "$EXPECTED_SOURCE_SHA"',
    '--expected-tree "$EXPECTED_SOURCE_TREE"',
    '--expected-external-activation-requirements-sha256 "$EXPECTED_EXTERNAL_ACTIVATION_REQUIREMENTS_SHA256"',
    '--output "$PROOF"',
  ]
  const exactWriterActivationArgs = [
    '--release-source-root "$GITHUB_WORKSPACE/release-source"',
    '--expected-commit "$EXPECTED_SOURCE_SHA"',
    '--expected-tree "$EXPECTED_SOURCE_TREE"',
    '--expected-external-activation-requirements-sha256 "$EXPECTED_EXTERNAL_ACTIVATION_REQUIREMENTS_SHA256"',
    '--output "$FRESH_PROOF"',
  ]
  const certifyActivationAt = certifyMirror.indexOf('trusted/scripts/verify-mirror-activation-boundary.mjs')
  const certifyReleaseSourceAt = certifyMirror.indexOf('path: source')
  const certifyReleaseBuildAt = Math.min(...[
    'node source/scripts/setup-authority-governance.mjs',
    'node source/scripts/build-published-template-mirror.mjs',
  ].map((marker) => {
    const index = certifyMirror.indexOf(marker)
    return index < 0 ? Number.POSITIVE_INFINITY : index
  }))
  const certifyReceiptAt = certifyMirror.indexOf('{schemaVersion:4')
  const certifyProofCopyAt = certifyMirror.indexOf('cp "$RUNNER_TEMP/mirror-activation-boundary-proof.json" "$EVIDENCE/mirror-activation-boundary-proof.json"')
  const certifyProofDigestAt = certifyMirror.indexOf('ACTIVATION_BOUNDARY_PROOF_SHA=$(sha256sum "$EVIDENCE/mirror-activation-boundary-proof.json"')
  const certifyUploadAt = certifyMirror.indexOf('actions/upload-artifact@')
  const writerReleaseSourceAt = mirrorWriter.indexOf('path: release-source')
  const writerReleaseCommitProofAt = mirrorWriter.indexOf("git -C release-source rev-parse 'HEAD^{commit}'")
  const writerArtifactDownloadAt = mirrorWriter.indexOf('actions/download-artifact@')
  const writerActivationAt = mirrorWriter.indexOf('trusted/scripts/verify-mirror-activation-boundary.mjs')
  const writerFirstEvidenceAt = mirrorWriter.indexOf('trusted/scripts/verify-mirror-evidence.mjs')
  if (
    certifyActivationCommands.length !== 1
    || writerActivationCommands.length !== 1
    || !certifyActivationCommands.every(command => commandHasFlags(command, activationVerifierFlags))
    || !writerActivationCommands.every(command => commandHasFlags(command, activationVerifierFlags))
    || !certifyActivationCommands.every(command => commandHasFlags(command, exactCertifyActivationArgs))
    || !writerActivationCommands.every(command => commandHasFlags(command, exactWriterActivationArgs))
    || certifyReleaseSourceAt < 0
    || certifyActivationAt < certifyReleaseSourceAt
    || !Number.isFinite(certifyReleaseBuildAt)
    || certifyActivationAt > certifyReleaseBuildAt
    || !/external_activation_requirements_sha256:\s*\$\{\{\s*steps\.handoff\.outputs\.external_activation_requirements_sha256\s*\}\}/.test(certifyMirror)
    || !/activation_boundary_proof_sha256:\s*\$\{\{\s*steps\.archive\.outputs\.activation_boundary_proof_sha256\s*\}\}/.test(certifyMirror)
    || !/EXPECTED_EXTERNAL_ACTIVATION_REQUIREMENTS_SHA256:\s*\$\{\{\s*steps\.handoff\.outputs\.external_activation_requirements_sha256\s*\}\}/.test(certifyMirror)
    || !/echo "sha256=\$PROOF_SHA" >> "\$GITHUB_OUTPUT"/.test(certifyMirror)
    || certifyProofCopyAt < certifyActivationAt
    || certifyProofDigestAt < certifyProofCopyAt
    || certifyReceiptAt < certifyProofDigestAt
    || certifyUploadAt < certifyReceiptAt
    || !/test "\$ACTIVATION_BOUNDARY_PROOF_SHA" = "\$EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256"/.test(certifyMirror)
    || !/\{schemaVersion:4[^\n]*activationBoundaryProofSha256:\$activation\}/.test(certifyMirror)
    || !/> "\$EVIDENCE\/receipt\.json"/.test(certifyMirror)
    || !/echo "activation_boundary_proof_sha256=\$ACTIVATION_BOUNDARY_PROOF_SHA" >> "\$GITHUB_OUTPUT"/.test(certifyMirror)
    || !/actions\/upload-artifact@[a-f0-9]{40}[\s\S]{0,400}path:\s*\$\{\{\s*runner\.temp\s*\}\}\/mirror-evidence\/[\s\S]{0,200}if-no-files-found:\s*error/.test(certifyMirror)
    || writerReleaseSourceAt < 0
    || !/ref:\s*\$\{\{\s*needs\.certify-mirror\.outputs\.source_sha\s*\}\}[\s\S]{0,180}path:\s*release-source/.test(mirrorWriter)
    || writerReleaseCommitProofAt < writerReleaseSourceAt
    || !/git -C release-source rev-parse 'HEAD\^\{tree\}'/.test(mirrorWriter)
    || !/git -C release-source status --porcelain=v1 --untracked-files=no --ignore-submodules=none/.test(mirrorWriter)
    || writerArtifactDownloadAt < writerReleaseCommitProofAt
    || writerActivationAt < writerArtifactDownloadAt
    || writerFirstEvidenceAt < writerActivationAt
    || !/EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256:\s*\$\{\{\s*needs\.certify-mirror\.outputs\.activation_boundary_proof_sha256\s*\}\}/.test(mirrorWriter)
    || !/ARTIFACT_PROOF="\$RUNNER_TEMP\/mirror-evidence\/mirror-activation-boundary-proof\.json"/.test(mirrorWriter)
    || !/test -f "\$ARTIFACT_PROOF" && test ! -L "\$ARTIFACT_PROOF"/.test(mirrorWriter)
    || !/test "\$\(sha256sum "\$ARTIFACT_PROOF" \| cut -d' ' -f1\)" = "\$EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256"/.test(mirrorWriter)
    || !/test "\$\(sha256sum "\$FRESH_PROOF" \| cut -d' ' -f1\)" = "\$EXPECTED_ACTIVATION_BOUNDARY_PROOF_SHA256"/.test(mirrorWriter)
    || !/cmp -s "\$FRESH_PROOF" "\$ARTIFACT_PROOF"/.test(mirrorWriter)
  ) add(mirrorFile, 'WF-MIRROR-ACTIVATION-PROOF', 'certify and writer must independently verify the exact release-bound activation proof, bind it into receipt v4 and the artifact digest, and byte-compare a fresh writer proof before evidence use')

  const mirrorWriterTokenAt = mirrorWriter.indexOf('actions/create-github-app-token@')
  const mirrorWriterSecretAt = mirrorWriter.search(/\bsecrets\.(?:GOVERNANCE_WRITER_APP_ID|GOVERNANCE_WRITER_APP_PRIVATE_KEY)\b/)
  const writerHandoffAt = mirrorWriter.indexOf('trusted/scripts/release-finalizer-mirror-handoff.mjs')
  const mirrorIdentityAt = mirrorWriter.indexOf('trusted/scripts/mirror-run-artifact-identity.mjs')
  const downloadAt = mirrorWriter.indexOf('actions/download-artifact@')
  const preExtractAt = mirrorWriter.indexOf('--pre-extract')
  const extractAt = mirrorWriter.indexOf('tar --no-same-owner')
  const preTokenMirrorWriter = mirrorWriter.slice(0, Math.max(mirrorWriterTokenAt, 0))
  const preTokenLastEvidenceVerifyAt = preTokenMirrorWriter.lastIndexOf('trusted/scripts/verify-mirror-evidence.mjs')
  const preTokenRsyncAt = preTokenMirrorWriter.indexOf('rsync ')
  if (
    !needsJob(mirrorWriter, 'certify-mirror')
    || !/^\s{4}if:\s*(?:\$\{\{\s*)?needs\.certify-mirror\.result\s*==\s*'success'\s*&&\s*needs\.certify-mirror\.outputs\.ready\s*==\s*'true'(?:\s*\}\})?\s*$/m.test(mirrorWriter)
    || !/^\s{4}environment:\s*\n\s{6}name:\s*governance-mirror\s*$/m.test(mirrorWriter)
    || !/actions:\s*read/.test(mirrorWriter)
    || !/contents:\s*read/.test(mirrorWriter)
    || /^\s{6}(?:actions|contents|id-token|attestations|checks):\s*write\s*$/m.test(mirrorWriter)
    || mirrorWriterTokenAt < 0
    || mirrorWriterSecretAt < 0
    || mirrorWriterSecretAt < mirrorWriterTokenAt
    || writerHandoffAt < 0
    || mirrorIdentityAt < writerHandoffAt
    || downloadAt < mirrorIdentityAt
    || preExtractAt < downloadAt
    || extractAt < preExtractAt
    || preTokenRsyncAt < extractAt
    || preTokenLastEvidenceVerifyAt < extractAt
    || preTokenLastEvidenceVerifyAt < preTokenRsyncAt
    || mirrorWriter.lastIndexOf('trusted/scripts/verify-mirror-evidence.mjs') >= mirrorWriterTokenAt
  ) add(mirrorFile, 'WF-LATE-CREDENTIAL', 'the fresh read-only writer must re-resolve, bind, preflight, safely extract, and fully verify the target tree before minting the App token')

  const mirrorIdentityCommands = continuedShellCommands(mirrorWriter, 'trusted/scripts/mirror-run-artifact-identity.mjs')
  const mirrorIdentityFlags = [
    '--repository', '--event', '--head-sha', '--run-id', '--run-attempt', '--artifact-id',
    '--artifact-digest', '--token-env', '--output',
  ]
  const mirrorIdentityArgs = [
    '--repository "$GITHUB_REPOSITORY"', '--event "$MIRROR_EVENT"', '--head-sha "$MIRROR_HEAD_SHA"',
    '--run-id "$MIRROR_RUN_ID"', '--run-attempt "$MIRROR_RUN_ATTEMPT"',
    '--artifact-id "$ARTIFACT_ID"', '--artifact-digest "$ARTIFACT_DIGEST"', '--token-env GH_TOKEN', '--output ',
  ]
  const directMirrorIdentityArgs = [
    '--repository "$GITHUB_REPOSITORY"', '--event "$GITHUB_EVENT_NAME"', '--head-sha "$GITHUB_SHA"',
    '--run-id "$GITHUB_RUN_ID"', '--run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--artifact-id "$ARTIFACT_ID"', '--artifact-digest "$ARTIFACT_DIGEST"', '--token-env GH_TOKEN', '--output ',
  ]
  if (
    mirrorIdentityCommands.length !== 1
    || !mirrorIdentityCommands.every(command => commandHasFlags(command, mirrorIdentityFlags))
    || !mirrorIdentityCommands.every(command => commandHasFlags(command, mirrorIdentityArgs)
      || commandHasFlags(command, directMirrorIdentityArgs))
    || !(
      (/MIRROR_EVENT:\s*\$\{\{\s*github\.event_name\s*\}\}/.test(mirrorWriter)
        && /MIRROR_HEAD_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/.test(mirrorWriter)
        && /MIRROR_RUN_ID:\s*\$\{\{\s*github\.run_id\s*\}\}/.test(mirrorWriter)
        && /MIRROR_RUN_ATTEMPT:\s*\$\{\{\s*github\.run_attempt\s*\}\}/.test(mirrorWriter))
      || mirrorIdentityCommands.every(command => commandHasFlags(command, directMirrorIdentityArgs))
    )
    || !/artifact-ids:\s*\$\{\{\s*needs\.certify-mirror\.outputs\.artifact_id\s*\}\}/.test(mirrorWriter)
    || !/artifact_id:\s*\$\{\{\s*steps\.upload\.outputs\.artifact-id\s*\}\}/.test(certifyMirror)
    || !/artifact_digest:\s*\$\{\{\s*steps\.upload\.outputs\.artifact-digest\s*\}\}/.test(certifyMirror)
  ) add(mirrorFile, 'WF-MIRROR-ARTIFACT', 'writer must re-read the active same-run workflow/artifact identity and download the exact v4 artifact by numeric ID and digest')

  const certifyEvidenceCommands = continuedShellCommands(certifyMirror, 'verify-mirror-evidence.mjs')
  const evidenceCommands = continuedShellCommands(mirrorWriter, 'verify-mirror-evidence.mjs')
  const evidenceIdentityFlags = [
    '--evidence', '--source-sha', '--source-tree', '--version', '--archive-sha256', '--tree-sha256',
    '--release-bom-sha256', '--scaffold-lock-sha256', '--activation-boundary-proof-sha256',
  ]
  const exactEvidenceBindings = source => [
    /--source-sha\s+"\$(?:EXPECTED_)?SOURCE_SHA"/,
    /--source-tree\s+"\$(?:EXPECTED_)?SOURCE_TREE"/,
    /--version\s+"\$(?:(?:EXPECTED_)?VERSION|BUILT_VER)"/,
    /--archive-sha256\s+"\$(?:EXPECTED_)?ARCHIVE_SHA256"/,
    /--tree-sha256\s+"\$(?:(?:EXPECTED_)?TREE_SHA256|MIRROR_SHA)"/,
    /--release-bom-sha256\s+"\$(?:EXPECTED_)?RELEASE_BOM_SHA256"/,
    /--scaffold-lock-sha256\s+"\$(?:EXPECTED_)?SCAFFOLD_LOCK_SHA256"/,
    /--activation-boundary-proof-sha256\s+"\$(?:EXPECTED_)?ACTIVATION_BOUNDARY_PROOF_SHA256"/,
  ].every(pattern => pattern.test(source))
  const verifyArgsBlocks = [...mirrorWriter.matchAll(/VERIFY_ARGS=\([\s\S]*?^\s*\)/gm)].map(match => match[0])
  const verifyArgsBound = verifyArgsBlocks.length === 1
    && commandHasFlags(verifyArgsBlocks[0], evidenceIdentityFlags)
    && exactEvidenceBindings(verifyArgsBlocks[0])
  const envelopeCommands = evidenceCommands.filter(command => command.includes('--pre-extract'))
  const fullEvidenceCommands = evidenceCommands.filter(command => !command.includes('--pre-extract'))
  const evidenceCommandIsBound = command => exactEvidenceBindings(command)
    || (verifyArgsBound && /"\$\{VERIFY_ARGS\[@\]\}"/.test(command))
  const preTokenEvidenceCommands = continuedShellCommands(preTokenMirrorWriter, 'verify-mirror-evidence.mjs')
  const preTokenEnvelopeCommands = preTokenEvidenceCommands.filter(command => command.includes('--pre-extract'))
  const preTokenFullEvidenceCommands = preTokenEvidenceCommands.filter(command => !command.includes('--pre-extract'))
  const rsyncAt = mirrorWriter.indexOf('rsync ')
  const lastEvidenceVerifyAt = mirrorWriter.lastIndexOf('verify-mirror-evidence.mjs')
  const firstRepositoryMutationAt = Math.min(...['git add -A', 'git push origin'].map(marker => {
    const index = mirrorWriter.indexOf(marker)
    return index < 0 ? Number.POSITIVE_INFINITY : index
  }))
  const downloadedArchiveWindow = preExtractAt >= 0 && rsyncAt > preExtractAt
    ? mirrorWriter.slice(preExtractAt, rsyncAt)
    : ''
  const safeTarPathGate = downloadedArchiveWindow.includes("grep -qE '(^/|(^|/)\\.\\.(/|$))'")
    || (
      /tar -tf/.test(downloadedArchiveWindow)
      && /"\$entry"\s*==\s*\/\*/.test(downloadedArchiveWindow)
      && /"\$entry"\s*==\s*"?\.\."?/.test(downloadedArchiveWindow)
      && /"\$entry"\s*==\s*\.\.\/\*/.test(downloadedArchiveWindow)
      && /"\$entry"\s*==\s*\*\/\.\.\/\*/.test(downloadedArchiveWindow)
      && /"\$entry"\s*==\s*\*\/\.\./.test(downloadedArchiveWindow)
    )
  const safeTarTypeGate = (
    /tar -tvf/.test(downloadedArchiveWindow)
      && /type\s*!=\s*"-"/.test(downloadedArchiveWindow)
      && /type\s*!=\s*"d"/.test(downloadedArchiveWindow)
  ) || /case\s+"\$\{listing:0:1\}"\s+in[\s\S]{0,100}-\|d\)\s*;;/.test(downloadedArchiveWindow)
  if (
    envelopeCommands.length !== 1
    || fullEvidenceCommands.length < 2
    || !certifyEvidenceCommands.every(evidenceCommandIsBound)
    || preTokenEnvelopeCommands.length !== 1
    || preTokenFullEvidenceCommands.length < 1
    || !evidenceCommands.every(evidenceCommandIsBound)
    || !evidenceCommands.every(command => command.includes('trusted/scripts/verify-mirror-evidence.mjs'))
    || !fullEvidenceCommands.every(command => command.includes('--mirror') && command.includes('--policy'))
    || !safeTarPathGate
    || !safeTarTypeGate
    || !/tar[\s\S]{0,160}--no-same-owner[\s\S]{0,160}--no-same-permissions[\s\S]{0,160}(?:-x[fv]?|--extract)\b/.test(downloadedArchiveWindow)
    || !/trusted\/scripts\/published-template-mirror-policy\.json/.test(mirrorWriter)
    || rsyncAt < 0
    || lastEvidenceVerifyAt < rsyncAt
    || !Number.isFinite(firstRepositoryMutationAt)
    || lastEvidenceVerifyAt > firstRepositoryMutationAt
  ) add(mirrorFile, 'WF-MIRROR-EVIDENCE', 'mirror evidence must be fully output-bound before extraction, reject unsafe paths and non-file/directory tar entries, and be fully reverified after extraction and target sync')

  const downgradeAt = mirrorWriter.indexOf('ROOT_PACKAGE="$PUBLISHED/package.json"')
  const downgradeEnd = rsyncAt > downgradeAt ? rsyncAt : -1
  const downgrade = downgradeAt >= 0 && downgradeEnd >= 0 ? mirrorWriter.slice(downgradeAt, downgradeEnd) : ''
  const downgradeCommands = continuedShellCommands(downgrade, 'workflow-static-validation.mjs')
  if (
    downgradeAt < 0
    || downgradeEnd < 0
    || downgradeEnd > mirrorWriterTokenAt
    || !/APP_PACKAGE="\$PUBLISHED\/apps\/template\/package\.json"/.test(downgrade)
    || !/for package_file in "\$ROOT_PACKAGE" "\$APP_PACKAGE"; do/.test(downgrade)
    || !/test -f "\$package_file" && test ! -L "\$package_file"/.test(downgrade)
    || downgradeCommands.length !== 1
    || !downgradeCommands.every(command => (
      /node "\$GITHUB_WORKSPACE\/trusted\/scripts\/workflow-static-validation\.mjs"/.test(command)
      && commandHasFlags(command, [
        'assert-mirror-version-floor',
        '--root-manifest "$ROOT_PACKAGE"',
        '--app-manifest "$APP_PACKAGE"',
        '--built-version "$BUILT_VER"',
      ])
    ))
  ) add(mirrorFile, 'WF-MIRROR-DOWNGRADE', 'before sync or credentials, two regular manifests must be passed only as data to the committed static SemVer oracle, normalize three closed exact/one-prefix legacy specs to one release, and reject BUILT_VER downgrades')

  const forceIndexAt = mirrorWriter.indexOf('git -C "$PUBLISHED" add -f -A')
  const writeTreeAt = mirrorWriter.indexOf('DESIRED_TREE=$(git -C "$PUBLISHED" write-tree)', forceIndexAt)
  const indexArchiveAt = mirrorWriter.indexOf('git -C "$PUBLISHED" archive "$DESIRED_TREE"', writeTreeAt)
  const indexVerifyCommands = evidenceCommands.filter(command => command.includes('--mirror "$INDEX_READBACK"'))
  const indexVerifyAt = mirrorWriter.lastIndexOf('trusted/scripts/verify-mirror-evidence.mjs')
  const indexWindow = forceIndexAt >= 0 && mirrorWriterTokenAt >= 0
    ? mirrorWriter.slice(forceIndexAt, mirrorWriterTokenAt)
    : ''
  if (
    forceIndexAt < rsyncAt
    || forceIndexAt > mirrorWriterTokenAt
    || !/test -z "\$\(git -C "\$PUBLISHED" ls-files --others --exclude-standard\)"/.test(indexWindow)
    || !/test -z "\$\(git -C "\$PUBLISHED" ls-files --others --ignored --exclude-standard\)"/.test(indexWindow)
    || !/git -C "\$PUBLISHED" diff --cached --check/.test(indexWindow)
    || writeTreeAt < forceIndexAt
    || indexArchiveAt < writeTreeAt
    || !/INDEX_READBACK="\$RUNNER_TEMP\/published-index-readback"/.test(indexWindow)
    || !/test ! -e "\$INDEX_READBACK"[\s\S]{0,120}mkdir -m 700 "\$INDEX_READBACK"/.test(indexWindow)
    || !/git -C "\$PUBLISHED" archive "\$DESIRED_TREE" \| tar[\s\S]{0,180}--no-same-owner[\s\S]{0,180}--no-same-permissions[\s\S]{0,180}-C "\$INDEX_READBACK" -xf -/.test(indexWindow)
    || indexVerifyCommands.length !== 1
    || !indexVerifyCommands.every(command => evidenceCommandIsBound(command) && command.includes('--policy') && !command.includes('--allow-git-metadata'))
    || indexVerifyAt < indexArchiveAt
    || indexVerifyAt > mirrorWriterTokenAt
  ) add(mirrorFile, 'WF-MIRROR-INDEX', 'the complete future-provider snapshot must be force-indexed, prove no ignored/untracked omissions, archive the exact write-tree, and pass full evidence readback before mutation checks or credentials')

  const mutationBoundaryCommands = continuedShellCommands(mirrorWriter, 'trusted/scripts/check-branch-protection.mjs')
  const sourceMutationBoundaryCommands = mutationBoundaryCommands.filter(command => command.includes('--repository "$GITHUB_REPOSITORY"'))
  const targetMutationBoundaryCommands = mutationBoundaryCommands.filter(command => command.includes('--repository ajenchen/ds-product-template'))
  const mutationBoundaryFlags = [
    '--check', '--mutation-boundary-only',
    '--activation-proof "$RUNNER_TEMP/mirror-evidence/mirror-activation-boundary-proof.json"',
    '--release-source-root "$GITHUB_WORKSPACE/release-source"',
  ]
  const mutationBoundaryPositions = [...mirrorWriter.matchAll(/trusted\/scripts\/check-branch-protection\.mjs/g)].map(match => match.index)
  const mutationBoundaryStepAt = mirrorWriter.indexOf('- name: Prove live mutation boundaries before requesting write credentials')
  const mutationTokenStepAt = mirrorWriter.indexOf('- name: Mint least-privilege short-lived Governance Writer App token')
  const interveningMutationStep = mutationBoundaryStepAt >= 0 && mutationTokenStepAt > mutationBoundaryStepAt
    ? /\n\s{6}-\s+(?:name:|uses:|run:)/.test(mirrorWriter.slice(
      mutationBoundaryStepAt + '- name: Prove live mutation boundaries before requesting write credentials'.length,
      mutationTokenStepAt,
    ))
    : true
  const mutationBoundaryStepClosed = /- name: Prove live mutation boundaries[^\n]*\n\s*if:\s*steps\.target\.outputs\.changed == 'true'/.test(mirrorWriter)
  const tokenStepClosed = /- name: Mint least-privilege[^\n]*\n\s*if:\s*steps\.target\.outputs\.changed == 'true'/.test(mirrorWriter)
  if (
    mutationBoundaryCommands.length !== 2
    || sourceMutationBoundaryCommands.length !== 1
    || targetMutationBoundaryCommands.length !== 1
    || !mutationBoundaryCommands.every(command => commandHasFlags(command, mutationBoundaryFlags))
    || !sourceMutationBoundaryCommands[0]?.includes('--environment governance-mirror')
    || targetMutationBoundaryCommands[0]?.includes('--environment')
    || mutationBoundaryPositions.some(position => position < indexVerifyAt || position > mirrorWriterTokenAt)
    || mutationBoundaryPositions[0] > mutationBoundaryPositions[1]
    || interveningMutationStep
    || !mutationBoundaryStepClosed
    || !tokenStepClosed
  ) add(mirrorFile, 'WF-MIRROR-MUTATION-BOUNDARY', 'exact source and target live mutation-boundary checks must consume the signed artifact proof and exact release source after index readback and immediately before the conditional Writer App token')

  const mirrorWriterAppTokenUses = (mirrorWriter.match(/actions\/create-github-app-token@[a-f0-9]{40}/g) || []).length
  const mirrorSecretNames = [...mirror.matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)].map(match => match[1])
  const allowedMirrorSecrets = new Set(['GOVERNANCE_WRITER_APP_ID', 'GOVERNANCE_WRITER_APP_PRIVATE_KEY'])
  const unexpectedMirrorSecret = mirrorSecretNames.some(name => !allowedMirrorSecrets.has(name))
  const postTokenMirrorWriter = mirrorWriterTokenAt >= 0 ? mirrorWriter.slice(mirrorWriterTokenAt) : ''
  if (
    mirrorWriterAppTokenUses !== 1
    || unexpectedMirrorSecret
    || mirrorSecretNames.filter(name => name === 'GOVERNANCE_WRITER_APP_ID').length !== 1
    || mirrorSecretNames.filter(name => name === 'GOVERNANCE_WRITER_APP_PRIVATE_KEY').length !== 1
    || /GH_TOKEN:\s*\$\{\{\s*secrets\./.test(mirror)
    || /\b(?:PAT|ADMIN_TOKEN|PERSONAL_ACCESS_TOKEN)\b/i.test(mirrorSecretNames.join('\n'))
    || /^\s+(?:actions|checks|contents|deployments|id-token|issues|packages|pages|pull-requests|statuses):\s*write\s*$/m.test(mirror)
    || !/^\s+owner:\s*ajenchen\s*$/m.test(mirrorWriter)
    || !/^\s+repositories:\s*ds-product-template\s*$/m.test(mirrorWriter)
    || (mirrorWriter.match(/^\s+permission-contents:\s*write\s*$/gm) || []).length !== 1
    || (mirrorWriter.match(/^\s+permission-pull-requests:\s*write\s*$/gm) || []).length !== 1
    || (mirrorWriter.match(/^\s+permission-workflows:\s*write\s*$/gm) || []).length !== 1
    || /permission-(?:actions|checks|issues|members|metadata|packages|statuses):\s*write/.test(mirrorWriter)
    || /\$\{\{\s*github\.token\s*\}\}/.test(postTokenMirrorWriter)
    || /http\.[^\s=]*extraheader|https?:\/\/[^\s/@]+:[^\s/@]+@github\.com/i.test(mirrorWriter)
  ) add(mirrorFile, 'WF-MIRROR-CREDENTIAL', 'mirror may load exactly one selected-repository Writer App credential after proof checks; PATs, admin credentials, extra secrets, broader write permissions, and additional token channels are forbidden')

  const prListCommands = continuedShellCommands(mirrorWriter, 'gh pr list')
  const prCreateCommands = continuedShellCommands(mirrorWriter, 'gh pr create')
  const prIdentityCommands = continuedShellCommands(mirrorWriter, 'PR_IDENTITY=$(gh pr view')
  const prListAt = mirrorWriter.indexOf('gh pr list')
  const prIdentityAt = mirrorWriter.indexOf('PR_IDENTITY=$(gh pr view')
  const prePr = prListAt >= 0 ? mirrorWriter.slice(Math.max(0, prListAt - 2400), prListAt) : ''
  const postPr = prIdentityAt >= 0 ? mirrorWriter.slice(prIdentityAt) : ''
  const prIdentityFields = 'headRefOid,baseRefOid,headRefName,baseRefName,isCrossRepository,headRepository,headRepositoryOwner'
  if (
    prListCommands.length !== 1
    || !prListCommands.every(command => commandHasFlags(command, [
      '--repo ajenchen/ds-product-template', '--state open', '--head "$BRANCH"', '--base main', '--json number,url',
    ]))
    || !/EXISTING_COUNT=\$\(jq ['"]length['"] <<<"\$EXISTING"\)/.test(mirrorWriter)
    || !/test "\$EXISTING_COUNT" -le 1/.test(mirrorWriter)
    || prCreateCommands.length !== 1
    || !prCreateCommands.every(command => commandHasFlags(command, [
      '--repo ajenchen/ds-product-template', '--base main', '--head "$BRANCH"',
    ]))
    || !/PR_NUMBER=\$\(jq -er ['"]\.\[0\]\.number['"] <<<"\$EXISTING"\)/.test(mirrorWriter)
    || !/PR_NUMBER=\$\(gh pr view "\$PR_URL" --repo ajenchen\/ds-product-template --json number --jq ['"]\.number['"]\)/.test(mirrorWriter)
    || prIdentityCommands.length !== 1
    || !prIdentityCommands[0].includes('--repo ajenchen/ds-product-template')
    || !prIdentityCommands[0].includes(`--json ${prIdentityFields}`)
    || !/keys == \["baseRefName", "baseRefOid", "headRefName", "headRefOid", "headRepository", "headRepositoryOwner", "isCrossRepository"\]/.test(mirrorWriter)
    || !/\.headRefOid == \$headOid/.test(mirrorWriter)
    || !/\.baseRefOid == \$baseOid/.test(mirrorWriter)
    || !/\.headRefName == \$headName/.test(mirrorWriter)
    || !/\.baseRefName == "main"/.test(mirrorWriter)
    || !/\.isCrossRepository == false/.test(mirrorWriter)
    || !/\.headRepository\.nameWithOwner == "ajenchen\/ds-product-template"/.test(mirrorWriter)
    || !/\.headRepositoryOwner\.login == "ajenchen"/.test(mirrorWriter)
    || !/EXPECTED_BRANCH_COMMIT="\$(?:REMOTE|LOCAL)_COMMIT"/.test(mirrorWriter)
    || !/LIVE_TARGET_BASE_SHA=\$\(git ls-remote origin refs\/heads\/main/.test(prePr)
    || !/test "\$LIVE_TARGET_BASE_SHA" = "\$TARGET_BASE_SHA"/.test(prePr)
    || !/LIVE_BRANCH_COMMIT=\$\(git ls-remote origin "refs\/heads\/\$BRANCH"/.test(prePr)
    || !/test "\$LIVE_BRANCH_COMMIT" = "\$EXPECTED_BRANCH_COMMIT"/.test(prePr)
    || !/test "\$\(git ls-remote origin "refs\/heads\/\$BRANCH"[^\n]*\)" = "\$EXPECTED_BRANCH_COMMIT"/.test(postPr)
    || !/test "\$\(git ls-remote origin refs\/heads\/main[^\n]*\)" = "\$TARGET_BASE_SHA"/.test(postPr)
  ) add(mirrorFile, 'WF-MIRROR-PR-IDENTITY', 'deterministic PR reuse/create must be unique for exact head/base, bind full PR repository/name/OID identity, and re-read target main plus branch immediately before and after PR operations')

  if (
    !/scripts\/verify-mirror-release\.mjs/.test(certifyMirror)
    || !/permission-contents:\s*write/.test(mirrorWriter)
    || !/permission-pull-requests:\s*write/.test(mirrorWriter)
    || !/secrets\.GOVERNANCE_WRITER_APP_ID/.test(mirrorWriter)
    || !/secrets\.GOVERNANCE_WRITER_APP_PRIVATE_KEY/.test(mirrorWriter)
    || /GOVERNANCE_CHECK_APP|permission-checks:\s*write/.test(mirrorWriter)
    || !/TARGET_BASE_SHA=\$\(git -C "\$PUBLISHED" rev-parse ['"]?refs\/remotes\/origin\/main\^\{commit\}['"]?\)/.test(mirrorWriter)
    || !/BRANCH="governance\/mirror-\$\{BUILT_VER\/\/\.\/-\}-\$\{SOURCE_SHA:0:12\}-\$\{TARGET_BASE_SHA:0:12\}"/.test(mirrorWriter)
    || !/REMOTE_LINE=\$\(git rev-list --parents -n 1 "\$REMOTE_COMMIT"\)/.test(mirrorWriter)
    || !/test "\$\(wc -w <<<"\$REMOTE_LINE" \| tr -d ' '\)" = 2/.test(mirrorWriter)
    || !/REMOTE_PARENT=\$\(cut -d' ' -f2 <<<"\$REMOTE_LINE"\)/.test(mirrorWriter)
    || !/test "\$REMOTE_TREE" = "\$DESIRED_TREE" && test "\$REMOTE_PARENT" = "\$TARGET_BASE_SHA"/.test(mirrorWriter)
    || !/LOCAL_LINE=\$\(git rev-list --parents -n 1 "\$LOCAL_COMMIT"\)/.test(mirrorWriter)
    || !/test "\$\(wc -w <<<"\$LOCAL_LINE" \| tr -d ' '\)" = 2/.test(mirrorWriter)
    || !/test "\$LOCAL_TREE" = "\$DESIRED_TREE" && test "\$LOCAL_PARENT" = "\$TARGET_BASE_SHA"/.test(mirrorWriter)
    || !/LIVE_TARGET_BASE_SHA=\$\(git ls-remote origin refs\/heads\/main/.test(mirrorWriter)
    || !/test "\$LIVE_TARGET_BASE_SHA" = "\$TARGET_BASE_SHA"/.test(mirrorWriter)
  ) add(mirrorFile, 'WF-MIRROR-PRIVILEGE', 'the scoped writer may only create or reuse a one-parent deterministic PR branch bound to current target main')
  if (!/git -C source merge-base --is-ancestor/.test(mirror) || !/no direct main write/i.test(mirror)) {
    add(mirrorFile, 'WF-MIRROR-BOUNDARY', 'mirror must prove release ancestry and open a PR without direct target-main mutation')
  }

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

  const upgradeFile = 'template/ds-product-template/.github/workflows/sync-design-system.yml'
  const upgrade = sources[upgradeFile] || ''
  const upgradeJobs = workflowJobBlocks(upgrade)
  const certifyUpgrade = upgradeJobs.get('certify-upgrade') || ''
  const verifyUpgrade = upgradeJobs.get('verify-upgrade') || ''
  const writeUpgrade = upgradeJobs.get('write-upgrade-pr') || ''
  const upgradeAnchor = sources['template/ds-product-template/.github/workflows/governance-anchor.yml'] || ''
  const upgradeEvidenceAt = upgrade.indexOf('Independently reconstruct exact incoming tree without write authority')
  const upgradeWriterAt = upgrade.indexOf('Apply preverified evidence + open Writer App reviewed PR')
  const upgradePreJobs = upgrade.split(/^jobs:\s*$/m)[0] || ''
  const upgradeEvents = workflowEventNames(upgradePreJobs)
  const upgradeDispatch = eventBlock(upgradePreJobs, 'repository_dispatch')
  const upgradeDispatchTypeLists = [...upgradeDispatch.matchAll(
    /^\s{4}types:\s*\[([^\]]*)\]\s*(?:#.*)?$/gm,
  )].map(match => match[1].split(',').map(value => value.trim()))
  const expectedUpgradeDispatchTypes = [
    'governance-release',
    'manual-governance-upgrade-request',
  ]
  const applyPreverifiedAt = writeUpgrade.indexOf('--apply-preverified')
  const writerTokenAt = writeUpgrade.indexOf('actions/create-github-app-token@')
  const writerSecretAt = writeUpgrade.search(/secrets\.GOVERNANCE_WRITER_APP_(?:ID|PRIVATE_KEY)/)
  const executableUpgradeWriter = executableSource(writeUpgrade)
  const upgradeWriterMutationStep = workflowStepBlocks(writeUpgrade)
    .find(step => /GH_TOKEN:\s*\$\{\{\s*steps\.app-token\.outputs\.token\s*\}\}/.test(step)
      && /governance-upgrade-writer-v1/.test(step)) || ''
  const executableUpgradeWriterMutation = executableSource(upgradeWriterMutationStep)
  const writerSetupAt = writeUpgrade.indexOf('npm run setup:governance')
  const writerNpmRunLines = executableUpgradeWriter.split(/\r?\n/)
    .filter(line => /\bnpm\s+run\b/.test(line))
    .map(line => line.trim())
  const liveMainReads = executableUpgradeWriter.match(/git ls-remote --exit-code origin refs\/heads\/main/g) || []
  const liveMainBindings = executableUpgradeWriter.match(/test "\$LIVE_MAIN_SHA" = "\$BASE_SHA"/g) || []
  if (
    JSON.stringify(upgradeEvents) !== JSON.stringify(['repository_dispatch'])
    || upgradeDispatchTypeLists.length !== 1
    || JSON.stringify(upgradeDispatchTypeLists[0]) !== JSON.stringify(expectedUpgradeDispatchTypes)
  ) {
    add(upgradeFile, 'WF-PRIVILEGED-TRIGGER', 'Writer App upgrade workflow must load only from protected-default repository_dispatch with the exact governance-release and manual-governance-upgrade-request event allowlist')
  }
  if (
    !certifyUpgrade
    || !verifyUpgrade
    || !writeUpgrade
    || !needsJob(verifyUpgrade, 'certify-upgrade')
    || !needsJob(writeUpgrade, 'certify-upgrade')
    || !needsJob(writeUpgrade, 'verify-upgrade')
    || !/^    environment:\s*\n      name:\s*governance-upgrade\s*$/m.test(writeUpgrade)
    || /\bsecrets\.|actions\/create-github-app-token@/.test(certifyUpgrade)
    || /\bsecrets\.|actions\/create-github-app-token@|(?:contents|pull-requests):\s*write/.test(verifyUpgrade)
    || upgradeEvidenceAt < 0
    || upgradeWriterAt < upgradeEvidenceAt
    || applyPreverifiedAt < 0
    || writerSetupAt < 0
    || writerSetupAt > applyPreverifiedAt
    || JSON.stringify(writerNpmRunLines) !== JSON.stringify(['npm run setup:governance'])
    || !/test "\$\(git rev-parse HEAD\)" = "\$\{\{ needs\.verify-upgrade\.outputs\.base_sha \}\}"[\s\S]*npm run setup:governance/.test(writeUpgrade)
    || writerTokenAt < applyPreverifiedAt
    || writerSecretAt < writerTokenAt
    || !/^    permissions:\s*\n      contents:\s*read\s*$/m.test(writeUpgrade)
    || !/actions\/create-github-app-token@[a-f0-9]{40}/.test(writeUpgrade)
    || !/app-id:\s*\$\{\{\s*secrets\.GOVERNANCE_WRITER_APP_ID\s*\}\}/.test(writeUpgrade)
    || !/private-key:\s*\$\{\{\s*secrets\.GOVERNANCE_WRITER_APP_PRIVATE_KEY\s*\}\}/.test(writeUpgrade)
    || !/permission-contents:\s*write/.test(writeUpgrade)
    || !/permission-pull-requests:\s*write/.test(writeUpgrade)
    || !/permission-workflows:\s*write/.test(writeUpgrade)
    || /permission-checks:\s*write|GOVERNANCE_CHECK_APP/.test(writeUpgrade)
    || !/GH_TOKEN:\s*\$\{\{\s*steps\.app-token\.outputs\.token\s*\}\}/.test(writeUpgrade)
    || /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}|\bGITHUB_TOKEN\b|CANDIDATE_WRITER_PAT/.test(writeUpgrade)
    || !/--apply-preverified/.test(writeUpgrade)
    || !/--expected-verification-sha256/.test(writeUpgrade)
  ) add(upgradeFile, 'WF-UPGRADE-PRIVILEGE', 'upgrade must certify and independently reconstruct without credentials before a fresh environment-gated Writer App job applies preverified bytes and mints least-privilege mutation authority')
  const upgradeGitWrapperAt = executableUpgradeWriterMutation.indexOf('git() {')
  const upgradeFirstPrivilegedGitAt = Math.min(...['git commit', 'git fetch', 'git push'].map(marker => {
    const index = executableUpgradeWriterMutation.indexOf(marker)
    return index < 0 ? Number.POSITIVE_INFINITY : index
  }))
  const upgradePrivilegedGitBypass = /\/usr\/bin\/git\s+(?:commit|fetch|ls-remote|push)\b|(?:^|[;&|$(]\s*)command\s+git\s+(?:commit|fetch|ls-remote|push)\b|(?:^|[;&|$(]\s*)\\git\s+(?:commit|fetch|ls-remote|push)\b/m
    .test(executableUpgradeWriterMutation)
  const upgradeWriterMutationLines = new Set(
    upgradeWriterMutationStep.split(/\r?\n/).map(line => line.trim()),
  )
  const upgradeClosedGitEnvironment = [
    "GH_PROMPT_DISABLED: '1'",
    'PATH: /usr/bin:/bin',
    'HOME: ${{ runner.temp }}/upgrade-writer-home',
    'XDG_CONFIG_HOME: ${{ runner.temp }}/upgrade-writer-home/xdg',
    'GH_CONFIG_DIR: ${{ runner.temp }}/upgrade-writer-home/gh',
    "GIT_CONFIG_NOSYSTEM: '1'",
    'GIT_CONFIG_GLOBAL: /dev/null',
    "GIT_TERMINAL_PROMPT: '0'",
    'GIT_ASKPASS: /bin/false',
    'SSH_ASKPASS: /bin/false',
    'GIT_PAGER: /bin/cat',
    'PAGER: /bin/cat',
    "GIT_CONFIG_COUNT: '4'",
    'GIT_CONFIG_KEY_0: credential.helper',
    "GIT_CONFIG_VALUE_0: ''",
    'GIT_CONFIG_KEY_1: credential.helper',
    "GIT_CONFIG_VALUE_1: '!/usr/bin/gh auth git-credential'",
    'GIT_CONFIG_KEY_2: core.hooksPath',
    'GIT_CONFIG_VALUE_2: /dev/null',
    'GIT_CONFIG_KEY_3: protocol.file.allow',
    'GIT_CONFIG_VALUE_3: never',
    'GIT_AUTHOR_NAME: Qijenchen Governance Writer App',
    'GIT_AUTHOR_EMAIL: qijenchen-governance-writer[bot]@users.noreply.github.com',
    'GIT_COMMITTER_NAME: Qijenchen Governance Writer App',
    'GIT_COMMITTER_EMAIL: qijenchen-governance-writer[bot]@users.noreply.github.com',
  ].every(marker => upgradeWriterMutationLines.has(marker))
  const upgradeClosedGitWrapper = [
    'set -euo pipefail',
    'WRITER_TOKEN="$GH_TOKEN"',
    'unset GH_TOKEN',
    '/usr/bin/env -i',
    'GIT_CONFIG_NOSYSTEM=1',
    'GIT_CONFIG_GLOBAL=/dev/null',
    'GIT_TERMINAL_PROMPT=0',
    'GIT_ASKPASS=/bin/false',
    'SSH_ASKPASS=/bin/false',
    'GIT_PAGER=/bin/cat',
    'PAGER=/bin/cat',
    'GIT_CONFIG_COUNT=4',
    'GIT_CONFIG_KEY_0=credential.helper',
    'GIT_CONFIG_VALUE_0=',
    'GIT_CONFIG_KEY_1=credential.helper',
    "GIT_CONFIG_VALUE_1='!/usr/bin/gh auth git-credential'",
    'GIT_CONFIG_KEY_2=core.hooksPath',
    'GIT_CONFIG_VALUE_2=/dev/null',
    'GIT_CONFIG_KEY_3=protocol.file.allow',
    'GIT_CONFIG_VALUE_3=never',
    "GIT_AUTHOR_NAME='Qijenchen Governance Writer App'",
    "GIT_AUTHOR_EMAIL='qijenchen-governance-writer[bot]@users.noreply.github.com'",
    "GIT_COMMITTER_NAME='Qijenchen Governance Writer App'",
    "GIT_COMMITTER_EMAIL='qijenchen-governance-writer[bot]@users.noreply.github.com'",
    '"${token_environment[@]}"',
    '/usr/bin/git "$@"',
    "git commit --no-gpg-sign -m",
    'WRITER_TOKEN=\'\'',
    'unset WRITER_TOKEN',
  ].every(marker => executableUpgradeWriterMutation.includes(marker))
  const upgradeClosedGitTokenScope = /case "\$\{1:-\}" in\s+fetch\|ls-remote\|push\)\s+token_environment=\(GH_TOKEN="\$WRITER_TOKEN" GH_PROMPT_DISABLED=1\)\s+;;\s+esac/.test(executableUpgradeWriterMutation)
  if (
    !upgradeWriterMutationStep
    || !upgradeClosedGitEnvironment
    || !upgradeClosedGitWrapper
    || !upgradeClosedGitTokenScope
    || upgradeGitWrapperAt < 0
    || upgradeGitWrapperAt > upgradeFirstPrivilegedGitAt
    || upgradePrivilegedGitBypass
    || (executableUpgradeWriterMutation.match(/\/usr\/bin\/git "\$@"/g) || []).length !== 1
    || (executableUpgradeWriterMutation.match(/^\s*git commit\b/gm) || []).length !== 1
    || (executableUpgradeWriterMutation.match(/^\s*git fetch\b/gm) || []).length !== 1
    || (executableUpgradeWriterMutation.match(/^\s*git push\b/gm) || []).length !== 1
    || /\bgh auth (?:login|logout|refresh|setup-git|token)\b|\bgit (?:config|credential approve)\b|persist-credentials:\s*true/.test(writeUpgrade)
    || /(?:echo|printf)[^\n]*\$(?:\{)?WRITER_TOKEN(?:\})?[^\n]*(?:>|tee\b)/.test(executableUpgradeWriterMutation)
  ) add(upgradeFile, 'WF-UPGRADE-GIT-CLOSURE', 'Writer App commit/fetch/push must use the exact closed /usr/bin/git wrapper with isolated config, hooks, pager, askpass and an ephemeral token scoped only to authenticated network subprocesses')
  if (
    !/base_sha:\s*\$\{\{\s*steps\.source\.outputs\.sha\s*\}\}/.test(certifyUpgrade)
    || !/patch_sha256:\s*\$\{\{\s*steps\.evidence\.outputs\.patch_sha256\s*\}\}/.test(certifyUpgrade)
    || !/tree_sha256:\s*\$\{\{\s*steps\.evidence\.outputs\.tree_sha256\s*\}\}/.test(certifyUpgrade)
    || !/authority_sha256:\s*\$\{\{\s*steps\.evidence\.outputs\.authority_sha256\s*\}\}/.test(certifyUpgrade)
    || !/--certify-staged/.test(certifyUpgrade)
    || !/--previous-root "\$PREVIOUS_ROOT"/.test(certifyUpgrade)
    || !/--sync-report "\$RUNNER_TEMP\/sync-all-report\.json"/.test(certifyUpgrade)
    || !/--verify-only/.test(verifyUpgrade)
    || !/--live-main-remote origin/.test(verifyUpgrade)
    || !/--base-sha "\$\{\{ needs\.certify-upgrade\.outputs\.base_sha \}\}"/.test(verifyUpgrade)
    || !/--version "\$\{\{ needs\.certify-upgrade\.outputs\.version \}\}"/.test(verifyUpgrade)
    || !/--expected-patch-sha256 "\$\{\{ needs\.certify-upgrade\.outputs\.patch_sha256 \}\}"/.test(verifyUpgrade)
    || !/--expected-tree-sha "\$\{\{ needs\.certify-upgrade\.outputs\.tree_sha256 \}\}"/.test(verifyUpgrade)
    || !/--expected-authority-sha256 "\$\{\{ needs\.certify-upgrade\.outputs\.authority_sha256 \}\}"/.test(verifyUpgrade)
    || /--manifest\b|node_modules\/@qijenchen\/design-system\/ds-canonical\/fork\/consumer\/governance-check/.test(verifyUpgrade)
    || !/ref:\s*\$\{\{ github\.sha \}\}/.test(verifyUpgrade)
    || (upgrade.match(/node-version:\s*'24\.14\.0'/g) || []).length !== 3
    || !/BRANCH="governance\/upgrade-\$\{VERSION\/\/\.\/-\}-\$\{BASE_SHA:0:12\}"/.test(writeUpgrade)
    || !/deterministic branch/.test(writeUpgrade)
    || !/no direct main write/i.test(upgrade)
  ) add(upgradeFile, 'WF-UPGRADE-EVIDENCE', 'upgrade writer must rebind base, patch and tree digests, reject path substitution, and reuse one deterministic PR branch')
  if (
    !/repository_dispatch:\s*[\s\S]*types:\s*\[[^\]]*governance-upgrade-candidate-validation/.test(upgradeAnchor)
    || !/event_type:"governance-upgrade-candidate-validation"/.test(writeUpgrade)
    || !/governance-upgrade-writer-v1/.test(writeUpgrade)
    || !/number,url,author,baseRefName,headRefName,headRefOid,isCrossRepository/.test(writeUpgrade)
    || !/WRITER_LOGIN:\s*qijenchen-governance-writer\[bot\]/.test(writeUpgrade)
    || !writeUpgrade.includes(`test "$(jq -r '.[0].author.login' <<<"$PR_JSON")" = "$WRITER_LOGIN"`)
    || !writeUpgrade.includes(`test "$(jq -r '.[0].baseRefName' <<<"$PR_JSON")" = main`)
    || !writeUpgrade.includes(`test "$(jq -r '.[0].headRefName' <<<"$PR_JSON")" = "$BRANCH"`)
    || !writeUpgrade.includes(`test "$(jq -r '.[0].isCrossRepository' <<<"$PR_JSON")" = false`)
    || !writeUpgrade.includes(`test "$(jq -r '.[0].headRefOid' <<<"$PR_JSON")" = "$REMOTE_COMMIT"`)
    || !writeUpgrade.includes(`test "$(wc -w <<<"$REMOTE_LINE" | tr -d ' ')" = 2`)
    || !writeUpgrade.includes(`test "$REMOTE_TREE" = "$DESIRED_TREE" && test "$REMOTE_PARENT" = "$BASE_SHA"`)
    || writerNpmRunLines.some(line => line !== 'npm run setup:governance')
    || /\bnode\s+(?!scripts\/verify-upgrade-evidence\.mjs\b)scripts\//.test(executableUpgradeWriter)
    || /\bgh\s+pr\s+(?:review|merge)\b|actions\/runs\/[^\s"']+\/approve|pulls\/[^\s"']+\/reviews/.test(executableUpgradeWriter)
    || liveMainReads.length < 3
    || liveMainBindings.length < 3
    || !writeUpgrade.includes(`test "$LIVE_MAIN_SHA" = "$BASE_SHA" && test "$LIVE_BRANCH_SHA" = "$REMOTE_COMMIT"`)
  ) add(upgradeFile, 'WF-UPGRADE-CANDIDATE-EXECUTION', 'only the exact Writer App-authored PR plus closed protected-default Check App validation dispatch may count; automatic candidate runs are non-authoritative, and writer approval/merge or stale PR/base/head/tree/parent are forbidden')

  const composition = sources['.github/workflows/composition-fidelity.yml'] || ''
  if (!/--require-mappings\b/.test(composition)) add('.github/workflows/composition-fidelity.yml', 'WF-NONVACUOUS', 'composition required check must reject zero executable mappings')

  const ci = sources['.github/workflows/ci.yml'] || ''
  if (/always\(\).*pages_ready/.test(ci)) add('.github/workflows/ci.yml', 'WF-DEPLOY-ON-FAILURE', 'production deploy may not bypass a failed Verify job')
  if (/(?:pages|id-token):\s*write|actions\/deploy-pages@|actions\/upload-pages-artifact@/.test(ci)) {
    add('.github/workflows/ci.yml', 'WF-CI-PRIVILEGE', 'PR/manual CI must remain read-only and may not build, upload, or deploy with Pages/OIDC authority')
  }
  // Provider/fork portability coverage is owned by the registered All-Harness
  // (its suites/pairedMeta include every portability-safety member); CI and release
  // consume it once through test:governance-harnesses instead of a duplicate chain.
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    if (!/npm run --silent test:governance-harnesses/.test(executableSource(sources[file] || ''))) {
      add(file, 'WF-PORTABILITY-MATRIX', 'CI and release must consume the registered All-Harness that owns the provider/fork portability safety members')
    }
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
  return auditWorkflowSources(sources, { rootNpmrc, releaseNpmPublisher })
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
