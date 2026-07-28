#!/usr/bin/env node
// Resolve a GitHub-verified signed annotated tag and fail if its object/commit moved.

import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertVerifiedReleaseTag,
  resolveVerifiedReleaseTag,
  validateVerifiedReleaseTagSnapshot,
} from '../infra/governance/lib/signed-release-tag.mjs'

const objectIdPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

export { assertVerifiedReleaseTag, resolveVerifiedReleaseTag, validateVerifiedReleaseTagSnapshot }

export async function requestGitHubJson({ token, path }) {
  if (!token) throw new Error('GitHub token is required for remote tag verification')
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'design-system-release-remote-tag-guard',
      'X-GitHub-Api-Version': '2026-03-10',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000)
    throw new Error(`GitHub tag API ${path} failed with HTTP ${response.status}: ${body}`)
  }
  return response.json()
}

export async function resolveRemoteTagCommit({ repository, tag, requestJson }) {
  return (await resolveVerifiedReleaseTag({ repository, tag, requestJson })).commit
}

export async function resolveRemoteTagIdentity({ repository, tag, requestJson }) {
  return resolveVerifiedReleaseTag({ repository, tag, requestJson })
}

export function assertRemoteTagUnchanged({ tag, actual, expected }) {
  if (!objectIdPattern.test(actual || '') || !objectIdPattern.test(expected || '')) {
    throw new Error('remote tag comparison requires full Git object IDs')
  }
  if (actual !== expected) throw new Error(`remote tag moved: ${tag} peels to ${actual}, expected ${expected}`)
}

function parseArgs(argv) {
  const allowed = new Set(['--repository', '--tag', '--expected', '--expected-object', '--token-env', '--github-output'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(name) || !value || value.startsWith('--')) throw new Error(`invalid argument: ${name || '<missing>'}`)
    values[name] = value
  }
  for (const required of ['--repository', '--tag', '--expected', '--token-env']) {
    if (!values[required]) throw new Error(`${required} is required`)
  }
  if (!objectIdPattern.test(values['--expected'])) throw new Error('--expected must be a full Git object ID')
  if (values['--expected-object'] && !objectIdPattern.test(values['--expected-object'])) throw new Error('--expected-object must be a full Git object ID')
  return values
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const token = process.env[args['--token-env']]
  if (!token) throw new Error(`GitHub token environment variable is empty: ${args['--token-env']}`)
  const identity = await resolveRemoteTagIdentity({
    repository: args['--repository'],
    tag: args['--tag'],
    requestJson: (path) => requestGitHubJson({ token, path }),
  })
  assertVerifiedReleaseTag({
    identity,
    expectedCommit: args['--expected'],
    expectedTagObject: args['--expected-object'] || null,
  })
  if (args['--github-output']) appendFileSync(resolve(args['--github-output']), `tag_object=${identity.tagObject}\n`)
  console.log(`✅ GitHub-verified signed annotated tag is exact: ${identity.tag} (${identity.tagObject}) -> ${identity.commit}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  })
}
