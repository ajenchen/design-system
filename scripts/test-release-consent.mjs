#!/usr/bin/env node
// test-release-consent.mjs — 發版同意閘:無 receipt → merge 停在 awaiting-consent;receipt 綁錯 sha → 仍停;綁對 → pending。
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFiveStepStatus, loadReleaseWorkflow, previewUrls, readReleaseConsent } from './release-orchestrator.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = resolve(ROOT, '.git/governance-runtime/release-consent')
const workflow = loadReleaseWorkflow()
const sha = 'f'.repeat(40)
const other = 'e'.repeat(40)
const base = {
  repository: 'ajenchen/design-system', branch: 'claude/x', headSha: sha, protectedMainSha: other, onProtectedMain: false,
  version: '0.1.0-beta.999', tag: 'v0.1.0-beta.999',
  pullRequest: { number: 999, state: 'OPEN', headRefOid: sha, requiredChecks: [{ state: 'SUCCESS', conclusion: 'SUCCESS', status: 'COMPLETED' }] },
  release: null, releaseCommitSha: null, publishRun: null, npmPackages: [], consumers: [],
}
const file = resolve(DIR, `${sha}.json`)
try {
  rmSync(file, { force: true })
  assert.equal(workflow.releaseConsent?.required, true, 'workflow must require release consent')
  assert.equal(workflow.steps.find(s => s.id === 'merge').gate, 'user-release-consent')
  const noReceipt = buildFiveStepStatus(workflow, { ...base, releaseConsent: readReleaseConsent(sha) })
  assert.equal(noReceipt.find(s => s.id === 'merge').status, 'awaiting-consent', '無 receipt → awaiting-consent')
  mkdirSync(DIR, { recursive: true })
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, headSha: other, quote: '發版', source: 'test' }))
  assert.equal(readReleaseConsent(sha), null, 'receipt 內 sha 不符 → 視為無')
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, headSha: sha, quote: '', source: 'test' }))
  assert.equal(readReleaseConsent(sha), null, '空 quote → 視為無')
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, headSha: sha, quote: '可以發版了', source: 'test' }))
  const withReceipt = buildFiveStepStatus(workflow, { ...base, releaseConsent: readReleaseConsent(sha) })
  assert.equal(withReceipt.find(s => s.id === 'merge').status, 'pending', '有 receipt → pending(可合併)')
  const merged = buildFiveStepStatus(workflow, { ...base, pullRequest: { ...base.pullRequest, state: 'MERGED' }, releaseConsent: null })
  assert.equal(merged.find(s => s.id === 'merge').status, 'complete', '已合併不回頭要 receipt')
  const urls = previewUrls(workflow, base)
  assert.ok(urls[0].includes('deploy-preview-999--ajenchen-design-system.netlify.app'), 'PR 預覽 URL')
  assert.ok(urls[1].includes('claude-x--ajenchen-design-system.netlify.app'), '分支預覽 URL')
  console.log('✅ test-release-consent PASS(6 cases)')
} finally {
  rmSync(file, { force: true })
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true })
}
