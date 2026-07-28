#!/usr/bin/env node

// Sole executable adapter for the published product-template package-lock generator.
// The lock metadata and the exact npm argv both derive from product-template-scaffold-lock.mjs.

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR,
  productTemplatePackageLockNpmArgs,
} from './product-template-scaffold-lock.mjs'
import { runVerifiedNpm } from './run-verified-npm.mjs'

const invariant = (condition, message) => { if (!condition) throw new Error(`SCAFFOLD-GENERATOR-001:${message}`) }

export async function generateProductTemplatePackageLock({ prefix, npmRunner = runVerifiedNpm } = {}) {
  invariant(typeof npmRunner === 'function', 'verified npm runner is missing')
  const args = productTemplatePackageLockNpmArgs(prefix)
  const result = await npmRunner({ args })
  invariant(result?.status === 'passed', 'verified npm runner did not report success')
  return Object.freeze({ generator: PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR, args, result })
}

function parseArgs(argv) {
  invariant(argv.length === 2 && argv[0] === '--prefix' && argv[1] && !argv[1].startsWith('--'), 'usage: generate-product-template-package-lock.mjs --prefix <RUNNER_TEMP scaffold>')
  return { prefix: argv[1] }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await generateProductTemplatePackageLock(parseArgs(process.argv.slice(2)))
    console.log(`product-template package-lock generated with ${result.generator}`)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
