#!/usr/bin/env node
// Publish the exact release train directly through npm Trusted Publishing, then read it back.

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareVerifiedExactNpmRuntime } from './lib/verified-exact-npm-runtime.mjs'
import {
  assertTokenlessNpmEnvironment,
  clearSetupNodeRegistryPlaceholder,
  loadReleaseContext,
  npmRegistry,
  npmResult,
  npmView,
  readTagVersions,
  validateRegistryPackage,
  waitForPublishedPackage,
} from './release-npm-lib.mjs'

const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

function parseArgs(argv) {
  const allowed = new Set([
    '--artifacts', '--bom', '--repository', '--tag', '--git-head', '--github-token-env',
  ])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of allowed) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  if (!OBJECT_ID.test(values['--git-head'])) throw new Error('--git-head must be a full Git object ID')
  return values
}

async function requestGitHubJson(token, path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'design-system-direct-npm-release',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000)
    throw new Error(`GitHub identity API ${path} failed with HTTP ${response.status}: ${body}`)
  }
  return response.json()
}

async function resolveTagCommit(token, repository, tag) {
  const encoded = tag.split('/').map(encodeURIComponent).join('/')
  const path = `/repos/${repository}/git/ref/tags/${encoded}`
  const reference = await requestGitHubJson(token, path)
  let commit
  if (reference?.object?.type === 'commit') {
    commit = reference.object.sha
  } else if (reference?.object?.type === 'tag' && OBJECT_ID.test(reference.object.sha || '')) {
    const tagObject = await requestGitHubJson(token, `/repos/${repository}/git/tags/${reference.object.sha}`)
    if (tagObject?.tag !== tag || tagObject?.object?.type !== 'commit') {
      throw new Error(`release tag ${tag} does not directly target a commit`)
    }
    commit = tagObject.object.sha
  } else {
    throw new Error(`release tag ${tag} has an unsupported Git object type`)
  }
  const confirmed = await requestGitHubJson(token, path)
  if (confirmed?.object?.type !== reference.object.type || confirmed?.object?.sha !== reference.object.sha) {
    throw new Error(`release tag ${tag} moved during remote verification`)
  }
  if (!OBJECT_ID.test(commit || '')) throw new Error(`release tag ${tag} did not resolve to a full commit ID`)
  return commit
}

async function assertStableReleaseTag({ token, repository, tag, gitHead }) {
  const tagCommit = await resolveTagCommit(token, repository, tag)
  if (tagCommit !== gitHead) throw new Error(`release tag ${tag} targets ${tagCommit}, expected release commit ${gitHead}`)
}

function assertTrustedPublisherRuntime(npmCli) {
  const version = execFileSync(npmCli, ['--version'], { encoding: 'utf8' }).trim()
  if (version !== '11.19.0') throw new Error(`lock-bound npm 11.19.0 is required for Trusted Publishing; found ${version}`)
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('OIDC Trusted Publishing is restricted to a GitHub-hosted Actions runner')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  clearSetupNodeRegistryPlaceholder(process.env)
  assertTokenlessNpmEnvironment(process.env)
  const githubToken = process.env[args['--github-token-env']]
  if (!githubToken) throw new Error(`GitHub token environment variable is empty: ${args['--github-token-env']}`)

  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const npmRuntime = await prepareVerifiedExactNpmRuntime({ repositoryRoot })
  const npmCli = npmRuntime.cli
  try {
    assertTrustedPublisherRuntime(npmCli)
    const context = loadReleaseContext({
      artifacts: resolve(args['--artifacts']),
      bomPath: resolve(args['--bom']),
      repository: args['--repository'],
      tag: args['--tag'],
      gitHead: args['--git-head'],
    })

    await assertStableReleaseTag({
      token: githubToken,
      repository: context.identity.repository,
      tag: context.identity.tag,
      gitHead: context.identity.gitHead,
    })

    for (const item of context.ordered) {
      const existing = npmView(npmCli, `${item.name}@${item.version}`, 'dist')
      if (existing.kind === 'found') {
        await validateRegistryPackage(npmCli, item, context.identity)
        console.log(`ℹ️ ${item.name}@${item.version} already exists with the expected integrity and provenance`)
        continue
      }
      if (existing.kind !== 'missing') throw new Error(`${item.name}@${item.version}: registry state is not safe to publish`)

      await assertStableReleaseTag({
        token: githubToken,
        repository: context.identity.repository,
        tag: context.identity.tag,
        gitHead: context.identity.gitHead,
      })
      const archive = resolve(context.releaseSet.artifacts, item.file)
      const published = npmResult(npmCli, [
        'publish', archive,
        '--access', 'public',
        '--tag', context.targetTag,
        '--provenance',
        '--ignore-scripts',
        '--json',
        `--registry=${npmRegistry}`,
      ])
      if (published.status !== 0) {
        throw new Error(`${item.name}@${item.version}: npm publish failed (exit ${published.status ?? 'unknown'}): ${(published.stderr || published.stdout || '').trim().slice(0, 2000)}`)
      }
      await waitForPublishedPackage(npmCli, item, context.identity)
      console.log(`✅ published and verified ${item.name}@${item.version}`)
    }

    for (const item of context.ordered) await validateRegistryPackage(npmCli, item, context.identity)
    const targetTags = readTagVersions(npmCli, context.ordered, context.targetTag)
    for (const item of context.ordered) {
      if (targetTags[item.name] !== context.targetVersion) {
        throw new Error(`${item.name}: npm ${context.targetTag} tag is ${targetTags[item.name] || '<missing>'}, expected ${context.targetVersion}`)
      }
    }
    console.log(`✅ exact three-package ${context.targetTag} train and npm provenance read back successfully`)
  } finally {
    npmRuntime.cleanup?.()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}
