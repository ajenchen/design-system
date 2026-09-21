import { writeReleaseConsent, consentReleaseLedger, recordConsentRelease } from './scripts/release-orchestrator.mjs'
import { execSync } from 'node:child_process'
const head = execSync('git rev-parse HEAD').toString().trim()
writeReleaseConsent({ headSha: head, branch: 'claude/work-A', quote: '發版', source: 'user-prompt-hook' })
console.log('授權1「發版」落地後 ledger =', JSON.stringify(consentReleaseLedger()))
recordConsentRelease('0.1.0-beta.141')
console.log('發布 beta.141 後       ledger =', JSON.stringify(consentReleaseLedger()))
writeReleaseConsent({ headSha: head, branch: 'claude/work-B', quote: '發版', source: 'user-prompt-hook' })
console.log('授權2「發版」落地後 ledger =', JSON.stringify(consentReleaseLedger()), ' <= 非空 = 下一次發布需 incident 證據')
