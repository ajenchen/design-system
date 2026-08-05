#!/usr/bin/env node

// Sole executable adapter for the published product-template package-lock generator.
// The lock metadata and the exact npm argv both derive from product-template-scaffold-lock.mjs.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR,
  productTemplatePackageLockNpmArgs,
} from './product-template-scaffold-lock.mjs'
import { runVerifiedNpm } from './run-verified-npm.mjs'

const invariant = (condition, message) => { if (!condition) throw new Error(`SCAFFOLD-GENERATOR-001:${message}`) }

// 產出的 lock 必須真的釘住本次發版的 exact version。npm registry 傳播延遲時 `npm install
// --package-lock-only` 會靜默解析到「當下 registry 上的最新可解版本」(= 前一版),流程仍
// 一路成功、開出 consumer PR,直到 consumer 的 `npm ci` 才炸(lock 與 package.json 不同版)。
// 2026-08-05 beta.112 / beta.113 兩次實證 → 此處 fail-closed,讓 mirror job 紅、可重跑。
const LOCK_PINNED_PACKAGES = Object.freeze(['@qijenchen/design-system', '@qijenchen/storybook-config'])

export function assertProductTemplateLockPinsVersion({ prefix, expectedVersion }) {
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expectedVersion || ''), `expected exact version is invalid: ${expectedVersion}`)
  const lockPath = join(prefix, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const seen = new Map()
  for (const [entryPath, entry] of Object.entries(lock.packages || {})) {
    const match = entryPath.match(/(?:^|\/)node_modules\/(@qijenchen\/[a-z-]+)$/)
    if (match && LOCK_PINNED_PACKAGES.includes(match[1])) seen.set(match[1], entry?.version)
  }
  for (const name of LOCK_PINNED_PACKAGES) {
    const actual = seen.get(name)
    invariant(actual !== undefined, `generated lock is missing ${name}`)
    invariant(actual === expectedVersion, `generated lock pins ${name}@${actual}, expected ${expectedVersion} — npm registry propagation likely incomplete; rerun the mirror`)
  }
  return Object.freeze({ lockPath, expectedVersion, packages: Object.fromEntries(seen) })
}

export async function generateProductTemplatePackageLock({ prefix, expectedVersion = null, npmRunner = runVerifiedNpm } = {}) {
  invariant(typeof npmRunner === 'function', 'verified npm runner is missing')
  const args = productTemplatePackageLockNpmArgs(prefix)
  const result = await npmRunner({ args })
  invariant(result?.status === 'passed', 'verified npm runner did not report success')
  const pinned = expectedVersion ? assertProductTemplateLockPinsVersion({ prefix, expectedVersion }) : null
  return Object.freeze({ generator: PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR, args, result, pinned })
}

function parseArgs(argv) {
  invariant(argv.length >= 2 && argv[0] === '--prefix' && argv[1] && !argv[1].startsWith('--'), 'usage: generate-product-template-package-lock.mjs --prefix <RUNNER_TEMP scaffold> [--expect-version <exact>]')
  const rest = argv.slice(2)
  invariant(rest.length === 0 || (rest.length === 2 && rest[0] === '--expect-version' && rest[1] && !rest[1].startsWith('--')),
    'usage: generate-product-template-package-lock.mjs --prefix <RUNNER_TEMP scaffold> [--expect-version <exact>]')
  return { prefix: argv[1], expectedVersion: rest.length === 2 ? rest[1] : null }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await generateProductTemplatePackageLock(parseArgs(process.argv.slice(2)))
    console.log(`product-template package-lock generated with ${result.generator}`)
    if (result.pinned) console.log(`  ✓ lock pins the exact released version ${result.pinned.expectedVersion}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
