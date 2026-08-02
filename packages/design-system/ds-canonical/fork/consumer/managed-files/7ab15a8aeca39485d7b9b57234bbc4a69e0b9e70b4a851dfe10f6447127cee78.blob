#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  discoverPackageManifestPaths,
  discoverReceiverDependencyPaths,
  pinExactWorkspaceDependencies,
  verifyExactWorkspaceDependencies,
} from './lib/exact-workspace-dependencies.mjs'

function isMain() {
  try {
    return Boolean(process.argv[1])
      && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const [mode, expectedVersion, ...extra] = process.argv.slice(2)
  const listMode = ['--list', '--list-receiver-paths'].includes(mode)
    && expectedVersion === undefined
    && extra.length === 0
  const versionMode = ['--set', '--check'].includes(mode)
    && typeof expectedVersion === 'string'
    && extra.length === 0
  if (!listMode && !versionMode) {
    console.error('Usage: node scripts/sync-exact-workspace-dependencies.mjs (--list|--list-receiver-paths) | (--set|--check) <exact-version>')
    process.exitCode = 64
  } else {
    try {
      if (mode === '--list') {
        for (const path of discoverPackageManifestPaths(process.cwd())) console.log(path)
      } else if (mode === '--list-receiver-paths') {
        for (const path of discoverReceiverDependencyPaths(process.cwd())) console.log(path)
      } else if (mode === '--set') {
        const changed = pinExactWorkspaceDependencies(process.cwd(), expectedVersion)
        console.log(JSON.stringify({ changed, expectedVersion, mode }))
      } else {
        const result = verifyExactWorkspaceDependencies(process.cwd(), expectedVersion)
        console.log(JSON.stringify({ expectedVersion, mode, ...result }))
      }
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
