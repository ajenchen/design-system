#!/usr/bin/env node
// Provider-neutral canonical sync. packages/design-system/ds-canonical is the only owner;
// .claude/**, .agents/**, and native hook configs are deterministic adapter views.

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkCanonicalViews, recoverInterruptedCanonicalSync, synchronizeCanonicalViews } from './lib/canonical-sync-transaction.mjs'

export { checkCanonicalViews, recoverInterruptedCanonicalSync, synchronizeCanonicalViews }

const isMain = Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
if (isMain) {
  try {
    const check = process.argv.includes('--check')
    const recover = process.argv.includes('--recover')
    if (check && recover) throw new Error('--check and --recover are mutually exclusive')
    if (recover) {
      const result = recoverInterruptedCanonicalSync()
      console.log(result.recovered
        ? `✓ recovered interrupted canonical sync ${result.transactionId}`
        : '✓ no interrupted canonical sync requires recovery')
    } else if (check) {
      const result = checkCanonicalViews()
      console.log(`✓ ds-canonical is authoritative; ${result.targetCount} generated provider-view files and 2 scoped package instructions have 0 drift`)
    } else {
      const result = synchronizeCanonicalViews()
      if (result.recovered.recovered) console.error(`⚠ recovered interrupted canonical sync ${result.recovered.transactionId} before regeneration`)
      console.log(`✓ transactionally generated ${result.generatedTargetCount} provider-view files from packages/design-system/ds-canonical and refreshed 2 scoped package instructions`)
    }
  } catch (error) {
    console.error(`❌ canonical provider sync failed:${error?.message || error}`)
    process.exitCode = 1
  }
}
