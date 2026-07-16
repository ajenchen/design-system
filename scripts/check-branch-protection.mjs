#!/usr/bin/env node
/**
 * check-branch-protection.mjs — PNG P4.2:main branch 保護 / required checks 機械驗證(G6)。
 *
 * 為何存在(codex 規格 §16):「workflow file 存在不代表 enforcement 已成立」— required status
 *   checks 必須在 repo protection 真的啟用,否則 direct push / merge 可繞過 CI。本 probe 用 gh API
 *   讀真實 protection 狀態;**無權限讀取時誠實輸出 Unverified,禁宣稱 enforced**(fail-honest)。
 *
 * 用法:node scripts/check-branch-protection.mjs [--check]
 *   --check:Unprotected(明確讀到無保護)→ exit 1;Unverified(無權限/無網路)→ exit 0 + 顯著警告
 *   (Unverified 不擋本地 preflight — 它是資訊缺失非違規;C.1 report 必列 Unverified 狀態)
 */
import { execSync } from 'node:child_process'

const CHECK = process.argv.includes('--check')
const run = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch (e) { return null } }

const repo = run("gh repo view --json nameWithOwner -q .nameWithOwner")
if (!repo) {
  console.log('⚠️ branch-protection: **Unverified**(gh 不可用/未登入/無網路)。')
  console.log('   人工驗證:GitHub → Settings → Branches/Rulesets → main 需 required status checks(ci)+ 禁 force-push。')
  process.exit(0)
}

// classic protection API;404 = 無 classic protection(可能用 rulesets → 再查)
const prot = run(`gh api repos/${repo}/branches/main/protection 2>/dev/null`)
const rules = run(`gh api repos/${repo}/rules/branches/main 2>/dev/null`)

let verdict = 'UNPROTECTED'
const detail = []
if (prot) {
  try {
    const p = JSON.parse(prot)
    const checks = p.required_status_checks?.contexts ?? p.required_status_checks?.checks?.map((c) => c.context) ?? []
    detail.push(`classic protection:required checks = [${checks.join(', ') || '無'}]`)
    if (checks.length) verdict = 'PROTECTED'
  } catch { /* ignore */ }
}
if (rules) {
  try {
    const r = JSON.parse(rules)
    const rsChecks = r.filter((x) => x.type === 'required_status_checks')
    if (rsChecks.length) { verdict = 'PROTECTED'; detail.push(`rulesets:required_status_checks 啟用(${rsChecks.length} rule)`) }
    const noForce = r.some((x) => x.type === 'non_fast_forward')
    if (noForce) detail.push('rulesets:禁 force-push ✓')
  } catch { /* ignore */ }
}
if (!prot && !rules) {
  // 讀不到且 gh 正常 → 403 無權限 or 404 真無保護;gh api 404/403 都回 null — 區分:
  const probe403 = run(`gh api repos/${repo}/branches/main/protection 2>&1; echo EXIT`) // 不可靠,保守 Unverified
  verdict = 'UNVERIFIED'
}

if (verdict === 'PROTECTED') {
  console.log(`✅ branch-protection PROTECTED(${repo} main):${detail.join(';')}`)
  process.exit(0)
}
if (verdict === 'UNVERIFIED') {
  console.log(`⚠️ branch-protection **Unverified**(${repo}:API 無權限或非 admin)。禁宣稱 enforced。`)
  console.log('   人工驗證:Settings → Branches/Rulesets → main required checks。')
  process.exit(0)
}
console.error(`❌ branch-protection **UNPROTECTED**(${repo} main 無 required status checks)— direct push 可繞過 CI gates。`)
console.error('   修:GitHub Settings → Branches → main → require status checks(勾 ci workflow)。')
process.exit(CHECK ? 1 : 0)
