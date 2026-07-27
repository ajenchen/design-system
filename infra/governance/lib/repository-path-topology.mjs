import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from '../../../scripts/lib/closed-tool-execution.mjs'

const ROLE_PATH_POLICY = Object.freeze({
  authority: Object.freeze({
    property: 'localPathFromGovernanceRoot',
    forbiddenProperty: 'mirrorSourcePathFromGovernanceRoot',
  }),
  'template-mirror': Object.freeze({
    property: 'mirrorSourcePathFromGovernanceRoot',
    forbiddenProperty: 'localPathFromGovernanceRoot',
  }),
  'product-consumer': Object.freeze({
    property: 'localPathFromGovernanceRoot',
    forbiddenProperty: 'mirrorSourcePathFromGovernanceRoot',
  }),
})

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function exactRepositoryPath(repo) {
  const policy = ROLE_PATH_POLICY[repo?.role]
  invariant(policy, `Repository ${repo?.id ?? '<missing>'} has no path topology policy for role ${repo?.role ?? '<missing>'}`)
  invariant(repo[policy.forbiddenProperty] === undefined, `Repository ${repo.id} role ${repo.role} may not use ${policy.forbiddenProperty}`)
  return {
    property: policy.property,
    value: repo[policy.property],
  }
}

export function parsePortableRepositoryPath(value, label = 'Repository path', { allowCurrentDirectory = true } = {}) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty relative POSIX path`)
  invariant(
    !value.includes('\0')
      && !value.includes('\n')
      && !value.includes('\r')
      && !value.includes('\\')
      && !isAbsolute(value),
    `${label} must be a portable relative POSIX path`,
  )
  if (value === '.') {
    invariant(allowCurrentDirectory, `${label} may not use the current-directory shorthand`)
    return Object.freeze({ value, parentCount: 0, segments: Object.freeze([]), currentDirectory: true })
  }
  const parts = value.split('/')
  invariant(parts.every(part => part.length > 0 && part !== '.'), `${label} is not canonical`)
  let parentCount = 0
  let sawNamedSegment = false
  const segments = []
  for (const part of parts) {
    if (part === '..') {
      invariant(!sawNamedSegment, `${label} may use parent traversal only as a leading prefix`)
      parentCount += 1
      continue
    }
    invariant(
      /^[A-Za-z0-9._-]+$/.test(part)
        && !part.endsWith('.')
        && !part.endsWith(' ')
        && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part),
      `${label} contains a non-portable segment:${part}`,
    )
    sawNamedSegment = true
    segments.push(part)
  }
  invariant(parentCount > 0 || segments.length > 0, `${label} is empty after normalization`)
  return Object.freeze({
    value,
    parentCount,
    segments: Object.freeze(segments),
    currentDirectory: false,
  })
}

function virtualSegments(parsed, depth) {
  return [
    ...Array.from({ length: depth - parsed.parentCount }, (_, index) => `@governance-${index}`),
    ...parsed.segments,
  ]
}

function containsPath(parent, child) {
  return parent.length <= child.length && parent.every((part, index) => child[index] === part)
}

function pathsOverlap(left, right) {
  return containsPath(left, right) || containsPath(right, left)
}

function topologyRows(inventory) {
  invariant(Array.isArray(inventory?.repositories) && inventory.repositories.length > 0, 'Repository path topology requires a non-empty inventory')
  return inventory.repositories.map(repo => {
    invariant(typeof repo?.id === 'string' && repo.id.length > 0, 'Repository path topology requires repository ids')
    const configured = exactRepositoryPath(repo)
    const parsed = parsePortableRepositoryPath(configured.value, `Repository ${repo.id} ${configured.property}`)
    return { repo, property: configured.property, parsed }
  })
}

export function validateRepositoryPathTopology(inventory) {
  const rows = topologyRows(inventory)
  const depth = Math.max(8, ...rows.map(row => row.parsed.parentCount + 2))
  for (const row of rows) row.virtual = virtualSegments(row.parsed, depth)

  const authorities = rows.filter(row => row.repo.role === 'authority')
  invariant(authorities.length <= 1, 'Repository path topology admits at most one authority checkout')
  const authority = authorities[0] ?? null
  if (authority) {
    invariant(
      authority.parsed.value === '../..',
      `Authority repository ${authority.repo.id} must remain the governance root's exact ../.. checkout`,
    )
  }

  for (const row of rows) {
    if (!authority && row.parsed.currentDirectory) continue
    if (row.repo.role !== 'authority') {
      invariant(
        row.parsed.segments.at(-1) === row.repo.id,
        `Repository ${row.repo.id} path basename must equal its registered repository id`,
      )
    }
    if (row.repo.role === 'template-mirror' && authority) {
      invariant(
        row.parsed.value === `../../template/${row.repo.id}`,
        `Template mirror ${row.repo.id} source must remain the exact ../../template/${row.repo.id} authority projection`,
      )
      invariant(
        containsPath(authority.virtual, row.virtual) && authority.virtual.length < row.virtual.length,
        `Template mirror ${row.repo.id} source must be a proper descendant of the authority checkout`,
      )
    }
    if (row.repo.role === 'product-consumer' && authority) {
      invariant(
        row.parsed.value === `../../../${row.repo.id}`,
        `Product consumer ${row.repo.id} checkout must remain the exact ../../../${row.repo.id} sibling`,
      )
    }
  }

  const checkoutRows = rows.filter(row => row.repo.role !== 'template-mirror')
  for (let left = 0; left < checkoutRows.length; left += 1) {
    for (let right = left + 1; right < checkoutRows.length; right += 1) {
      invariant(
        !pathsOverlap(checkoutRows[left].virtual, checkoutRows[right].virtual),
        `Repository checkout roots overlap:${checkoutRows[left].repo.id},${checkoutRows[right].repo.id}`,
      )
    }
  }

  const mirrors = rows.filter(row => row.repo.role === 'template-mirror')
  for (let left = 0; left < mirrors.length; left += 1) {
    for (let right = left + 1; right < mirrors.length; right += 1) {
      invariant(
        !pathsOverlap(mirrors[left].virtual, mirrors[right].virtual),
        `Template mirror source roots overlap:${mirrors[left].repo.id},${mirrors[right].repo.id}`,
      )
    }
    for (const checkout of checkoutRows) {
      if (checkout.repo.role === 'authority') continue
      invariant(
        !pathsOverlap(mirrors[left].virtual, checkout.virtual),
        `Template mirror source overlaps a consumer checkout:${mirrors[left].repo.id},${checkout.repo.id}`,
      )
    }
  }
  return true
}

export function resolveInventoryRepositoryRoot(repo, { governanceRoot }) {
  const configured = exactRepositoryPath(repo)
  const parsed = parsePortableRepositoryPath(configured.value, `Repository ${repo.id} ${configured.property}`)
  const requestedGovernanceRoot = resolve(governanceRoot)
  const governanceInfo = lstatSync(requestedGovernanceRoot)
  invariant(governanceInfo.isDirectory() && !governanceInfo.isSymbolicLink(), 'Governance root must be a real directory')
  let current = realpathSync(requestedGovernanceRoot)
  for (let index = 0; index < parsed.parentCount; index += 1) current = dirname(current)
  for (const segment of parsed.segments) {
    current = join(current, segment)
    const info = lstatSync(current)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `Repository ${repo.id} path is missing, non-directory, or redirected:${current}`)
  }
  const info = lstatSync(current)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `Repository ${repo.id} root is missing, non-directory, or redirected:${current}`)
  invariant(realpathSync(current) === current, `Repository ${repo.id} root crosses a symbolic-link redirection`)
  return current
}

export function githubSlugFromRemote(remote) {
  if (typeof remote !== 'string') return null
  const match = remote.trim().match(
    /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  )
  return match?.[1] ?? null
}

function closedGitText(root, args, label, gitRunner) {
  const result = gitRunner(args, {
    cwd: root,
    maxOutputBytes: 4 * 1024 * 1024,
  })
  invariant(
    !result.error && result.signal === null && result.status === 0 && typeof result.stdout === 'string',
    `Cannot read ${label} through closed Git`,
  )
  return result.stdout.trim()
}

function closedGitValues(root, args, label, gitRunner) {
  const result = gitRunner(args, {
    cwd: root,
    maxOutputBytes: 4 * 1024 * 1024,
  })
  if (!result.error && result.signal === null && result.status === 1 && result.stdout === '') return []
  invariant(
    !result.error && result.signal === null && result.status === 0 && typeof result.stdout === 'string',
    `Cannot read ${label} through closed Git`,
  )
  return result.stdout.split('\0').filter(Boolean)
}

export function verifyInventoryRepositoryIdentity({
  inventory,
  repositoryId,
  governanceRoot,
  gitRunner = runClosedGit,
  localConfigurationValidator = assertClosedGitLocalConfiguration,
}) {
  validateRepositoryPathTopology(inventory)
  const repo = inventory.repositories.find(candidate => candidate.id === repositoryId)
  invariant(repo, `Unknown repository identity target:${repositoryId}`)
  const authority = inventory.repositories.find(candidate => candidate.role === 'authority') ?? null
  const sourceRoot = resolveInventoryRepositoryRoot(repo, { governanceRoot })
  const expectedTopLevel = repo.role === 'template-mirror'
    ? resolveInventoryRepositoryRoot(authority, { governanceRoot })
    : sourceRoot
  const expectedGithub = repo.role === 'template-mirror' ? authority.github : repo.github
  invariant(expectedTopLevel, `Template mirror ${repo.id} requires one authority checkout`)
  localConfigurationValidator(expectedTopLevel, { maxOutputBytes: 4 * 1024 * 1024 })
  const observedTopLevel = realpathSync(closedGitText(sourceRoot, ['rev-parse', '--show-toplevel'], 'Git top-level', gitRunner))
  invariant(
    observedTopLevel === expectedTopLevel,
    `Repository ${repo.id} source is attached to an unexpected Git top-level`,
  )
  const remotes = closedGitValues(
    expectedTopLevel,
    ['config', '--local', '--no-includes', '--null', '--get-all', 'remote.origin.url'],
    'Git origin',
    gitRunner,
  )
  invariant(remotes.length === 1, `Repository ${repo.id} source must bind exactly one origin URL`)
  const pushUrls = closedGitValues(
    expectedTopLevel,
    ['config', '--local', '--no-includes', '--null', '--get-all', 'remote.origin.pushurl'],
    'Git origin push URL',
    gitRunner,
  )
  invariant(pushUrls.length === 0, `Repository ${repo.id} source may not override the origin push URL`)
  const remote = remotes[0]
  const observedGithub = githubSlugFromRemote(remote)
  invariant(
    observedGithub === expectedGithub,
    `Repository ${repo.id} source origin mismatch: expected ${expectedGithub}, got ${observedGithub ?? remote}`,
  )
  return Object.freeze({
    repositoryId: repo.id,
    role: repo.role,
    sourceRoot,
    gitTopLevel: observedTopLevel,
    github: observedGithub,
  })
}
