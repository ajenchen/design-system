import { randomUUID } from 'node:crypto'
import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  assertNoSymlinkPath,
  canonicalRepositoryRoot,
  normalizeRepositoryRelative,
  pathEntryExists,
} from '../refresh-fork-launchers.mjs'

function inventory(repositoryRoot, mirrors) {
  const root = canonicalRepositoryRoot(repositoryRoot)
  const rows = []
  for (const [sourceRelative, targetRelative] of mirrors) {
    const sourceRel = normalizeRepositoryRelative(sourceRelative, 'instruction mirror source')
    const targetRel = normalizeRepositoryRelative(targetRelative, 'instruction mirror target')
    const source = join(root, sourceRel)
    const target = join(root, targetRel)
    assertNoSymlinkPath(root, source, `instruction mirror source ${sourceRel}`, { allowMissing: false })
    const sourceInfo = lstatSync(source)
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error(`instruction mirror source must be a regular non-symlink file:${sourceRel}`)
    assertNoSymlinkPath(root, target, `instruction mirror target ${targetRel}`)
    if (pathEntryExists(target)) {
      const targetInfo = lstatSync(target)
      if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) throw new Error(`instruction mirror target must be a regular non-symlink file:${targetRel}`)
    }
    rows.push({
      sourceRel,
      targetRel,
      source,
      target,
      content: readFileSync(source),
      mode: sourceInfo.mode & 0o777,
    })
  }
  return { root, rows }
}

export function checkInstructionMirrors(repositoryRoot, mirrors) {
  const { rows } = inventory(repositoryRoot, mirrors)
  const drift = []
  for (const row of rows) {
    if (!pathEntryExists(row.target)) drift.push({ source: row.sourceRel, target: row.targetRel, kind: 'missing' })
    else if (!readFileSync(row.target).equals(row.content)) drift.push({ source: row.sourceRel, target: row.targetRel, kind: 'content' })
    else if ((lstatSync(row.target).mode & 0o777) !== row.mode) drift.push({ source: row.sourceRel, target: row.targetRel, kind: 'mode' })
  }
  return { rows, drift }
}

export function writeInstructionMirrors(repositoryRoot, mirrors) {
  // Inventory every source and destination before the first write, so a later malicious symlink
  // cannot leave a partially refreshed mirror set.
  const { root, rows } = inventory(repositoryRoot, mirrors)
  for (const row of rows) {
    mkdirSync(dirname(row.target), { recursive: true })
    assertNoSymlinkPath(root, dirname(row.target), `instruction mirror target parent ${row.targetRel}`, { allowMissing: false })
    const temporary = `${row.target}.tmp-governance-${process.pid}-${randomUUID()}`
    assertNoSymlinkPath(root, temporary, `instruction mirror temporary ${row.targetRel}`)
    try {
      writeFileSync(temporary, row.content, { flag: 'wx', mode: row.mode })
      chmodSync(temporary, row.mode)
      renameSync(temporary, row.target)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
  return { rows }
}
