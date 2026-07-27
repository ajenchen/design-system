import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  createAllHarnessReceipt,
  invalidateAllHarnessReceipt,
  runHarnessRegistry,
  writeAllHarnessReceipt,
} from '../lib/harness-runner.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

if (process.env.GOVERNANCE_HARNESS_ACTIVE === '1') {
  console.error('Harness runner blocked: nested all-Harness execution is forbidden')
  process.exitCode = 1
} else if (process.argv.length !== 2) {
  console.error('Usage: node infra/governance/bin/run-harnesses.mjs')
  process.exitCode = 2
} else {
  try {
    invalidateAllHarnessReceipt({ repoRoot: REPO_ROOT })
    const summary = await runHarnessRegistry({
      repoRoot: REPO_ROOT,
      onCommandStart({ index, total, argv, registeredBy }) {
        const domains = registeredBy.map(item => item.domain).join(',')
        console.log(`\n[Harness ${index + 1}/${total}] ${argv.join(' ')} [${domains}]`)
      },
    })
    if (summary.status === 'passed') {
      const receipt = createAllHarnessReceipt({ repoRoot: REPO_ROOT, summary })
      writeAllHarnessReceipt(receipt, { repoRoot: REPO_ROOT })
    }
    console.log('\n' + JSON.stringify(summary, null, 2))
    if (summary.status !== 'passed') process.exitCode = 1
  } catch (error) {
    console.error(`Harness runner blocked: ${error.message}`)
    process.exitCode = 1
  }
}
