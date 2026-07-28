#!/usr/bin/env node
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readlinkSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertExactPluginAlias,
  assertPluginAliasDestination,
  resolvePluginAliasPlan,
} from './lib/plugin-alias-contract.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function pathEntryExists(path) {
  try { lstatSync(path); return true } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const under = (path, root) => path === root || path.startsWith(`${root}/`)

function assertRealParentChain(root, target, label, { allowMissing = false } = {}) {
  const base = resolve(root)
  const parent = dirname(resolve(target))
  const rel = relative(base, parent)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`), `${label} escapes repository root`)
  const rootInfo = lstatSync(base)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'repository root must be a real directory')
  let cursor = base
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    let info
    try { info = lstatSync(cursor) } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') return false
      throw error
    }
    invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} parent is not one real directory:${relative(base, cursor)}`)
  }
  return true
}

function inspectContracts(root, contracts, { requireExact = false } = {}) {
  const aliases = new Set()
  for (const contract of contracts) {
    invariant(!aliases.has(contract.alias), `plugin alias transaction contains a duplicate path:${contract.alias}`)
    invariant(![...aliases].some(alias => under(alias, contract.alias) || under(contract.alias, alias)), `plugin alias transaction paths overlap:${contract.alias}`)
    aliases.add(contract.alias)
  }
  for (const contract of contracts) for (const other of contracts) {
    invariant(!under(contract.alias, other.destination) && !under(other.destination, contract.alias), `plugin alias and canonical destination overlap:${contract.alias}:${other.destination}`)
  }

  return contracts.map((contract) => {
    const aliasPath = resolve(root, contract.alias)
    assertRealParentChain(root, aliasPath, `plugin alias ${contract.alias}`)
    assertPluginAliasDestination(root, contract)
    if (pathEntryExists(aliasPath)) {
      const info = lstatSync(aliasPath)
      invariant(info.isSymbolicLink(), `${contract.alias} is user-owned regular content; refusing to replace it with a generated alias`)
      invariant(readlinkSync(aliasPath) === contract.target, `${contract.alias} is a retargeted alias; refusing a race-prone in-place replacement`)
      return { contract, aliasPath, exact: assertExactPluginAlias(root, contract) }
    }
    invariant(!requireExact, `${contract.alias} must be an exact generated symbolic link`)
    return { contract, aliasPath, exact: null }
  })
}

function writeJournal(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  const handle = openSync(path, 'r')
  try { fsyncSync(handle) } finally { closeSync(handle) }
}

function sameCreatedAlias(path, record) {
  if (!pathEntryExists(path)) return false
  const info = lstatSync(path)
  return info.isSymbolicLink()
    && String(info.dev) === record.dev
    && String(info.ino) === record.ino
    && readlinkSync(path) === record.target
}

export function syncPluginAliases(root, contracts, {
  check = false,
  createSymlink = symlinkSync,
} = {}) {
  const initial = inspectContracts(root, contracts, { requireExact: check })
  if (check || initial.every(record => record.exact)) {
    return initial.map(record => ({ ...record.exact, changed: false }))
  }

  const lockPath = resolve(root, '.git', 'governance-plugin-aliases.lock')
  assertRealParentChain(root, lockPath, 'plugin alias transaction lock')
  try {
    mkdirSync(lockPath, { mode: 0o700 })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const concurrent = inspectContracts(root, contracts)
    if (concurrent.every(record => record.exact)) return concurrent.map(record => ({ ...record.exact, changed: false }))
    throw new Error('plugin alias transaction lock already exists and desired state is incomplete')
  }

  const journalPath = join(lockPath, 'journal.json')
  const journal = {
    schemaVersion: 1,
    pid: process.pid,
    desired: contracts.map(({ alias, target }) => ({ alias, target })),
    created: [],
  }
  try {
    writeJournal(journalPath, journal)
    const locked = inspectContracts(root, contracts)
    const changed = new Set()
    for (const record of locked) {
      if (record.exact) continue
      try {
        // symlink(2) is an exclusive create. EEXIST is accepted only when a full
        // desired-state revalidation proves that a concurrent writer won safely.
        createSymlink(record.contract.target, record.aliasPath)
      } catch (error) {
        if (error?.code === 'EEXIST') {
          assertExactPluginAlias(root, record.contract)
          continue
        }
        throw error
      }
      const info = lstatSync(record.aliasPath)
      const created = {
        alias: record.contract.alias,
        target: record.contract.target,
        dev: String(info.dev),
        ino: String(info.ino),
      }
      journal.created.push(created)
      writeJournal(journalPath, journal)
      changed.add(record.contract.alias)
    }
    return inspectContracts(root, contracts, { requireExact: true })
      .map(record => ({ ...record.exact, changed: changed.has(record.contract.alias) }))
  } catch (error) {
    for (const record of [...journal.created].reverse()) {
      const aliasPath = resolve(root, record.alias)
      if (sameCreatedAlias(aliasPath, record)) unlinkSync(aliasPath)
    }
    throw error
  } finally {
    try { unlinkSync(journalPath) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    rmdirSync(lockPath)
  }
}

export function retirePluginAliases(root, aliases, { check = false } = {}) {
  const planned = aliases.map((alias) => {
    const aliasPath = resolve(root, alias)
    if (!assertRealParentChain(root, aliasPath, `retired plugin alias ${alias}`, { allowMissing: true })) return { alias, aliasPath, exists: false }
    if (!pathEntryExists(aliasPath)) return { alias, aliasPath, exists: false }
    const info = lstatSync(aliasPath)
    invariant(info.isSymbolicLink(), `${alias} is user-owned regular content; refusing retirement cleanup`)
    return { alias, aliasPath, exists: true, dev: String(info.dev), ino: String(info.ino), target: readlinkSync(aliasPath) }
  })
  const residue = planned.filter((record) => record.exists)
  invariant(!check || residue.length === 0, `stale plugin aliases for a retired provider:${residue.map((record) => record.alias).join(',')}`)
  for (const record of residue) {
    const current = lstatSync(record.aliasPath)
    invariant(current.isSymbolicLink() && String(current.dev) === record.dev && String(current.ino) === record.ino && readlinkSync(record.aliasPath) === record.target, `${record.alias} changed during retirement cleanup; refusing unlink`)
    unlinkSync(record.aliasPath)
  }
  return planned.map((record) => ({ alias: record.alias, changed: record.exists }))
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (IS_MAIN) {
  try {
    const check = process.argv.includes('--check')
    const generate = process.argv.includes('--generate')
    if (!check && !generate) throw new Error('usage: sync-plugin-aliases.mjs --generate | --check')
    if (check && generate) throw new Error('choose exactly one of --generate or --check')
    const plan = resolvePluginAliasPlan(ROOT)
    const result = plan.active
      ? syncPluginAliases(ROOT, plan.contracts, { check })
      : retirePluginAliases(ROOT, plan.aliases, { check })
    console.log(`✓ plugin aliases ${check ? 'check' : 'generate'}:${result.map(record => `${record.alias}${record.target ? `->${record.target}` : ''}${record.changed ? '*' : ''}`).join(', ')}`)
  } catch (error) {
    console.error(`✗ plugin aliases:${error.message}`)
    process.exit(1)
  }
}
