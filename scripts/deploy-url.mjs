#!/usr/bin/env node
/**
 * deploy-url.mjs — output Netlify deploy URL for current git branch
 *
 * Per user verbatim 2026-05-26:「完成部署之後都應該自動回吐部署的連結,每次必定自動回」
 *
 * Why predictable URL pattern(no API call needed):
 *   Netlify's branch deploy URL convention:
 *     - main / production → https://<sitename>.netlify.app
 *     - feature branch    → https://<branch-slug>--<sitename>.netlify.app
 *
 * Branch slug rules(per Netlify docs):
 *   lowercase / hyphens / strip non-alphanum
 *
 * Usage:
 *   npm run deploy-url           # prints URL for current branch
 *   npm run deploy-url -- --json # JSON output(for AI parsing)
 *
 * Exit codes:
 *   0 OK
 *   1 .netlify/state.json missing
 *   2 git branch detection failed
 *   3 site subdomain unresolvable(state.json 只有 siteId、無 siteSlug,也無 deploy-meta cache)
 *   64 unsupported CLI arguments
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
if (args.some(arg => arg !== '--json') || new Set(args).size !== args.length) {
  console.error('DEPLOY-URL-001:unsupported or duplicate argument')
  process.exit(64)
}
const asJson = args.includes('--json')

function readRegularJson(path, label, { optional = false } = {}) {
  if (!existsSync(path)) {
    if (optional) return null
    throw new Error(`${label} is missing`)
  }
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
    throw new Error(`${label} must be one regular no-link file`)
  }
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is invalid JSON:${error.message}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be one JSON object`)
  return value
}

function safeSiteSlug(value) {
  return typeof value === 'string'
    && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
    ? value
    : ''
}

const stateFile = resolve(process.cwd(), '.netlify/state.json')
if (!existsSync(stateFile)) {
  console.error('❌ .netlify/state.json not found. `setup:netlify` is Dashboard-only and will not create CLI state; read the real URL from Netlify Dashboard → Deploys.')
  process.exit(1)
}

let state
try {
  state = readRegularJson(stateFile, '.netlify/state.json')
} catch (error) {
  console.error(`DEPLOY-URL-001:${error.message}`)
  process.exit(3)
}
const siteId = state.siteId

// Resolve 真實 subdomain:state.siteSlug → setup 寫的 .netlify/deploy-meta.json sidecar。
// 禁 fallback 成 siteId —— UUID 不是 DNS subdomain,`https://<uuid>.netlify.app` 不存在 → 錯誤 dashboard / production / branch URL。
let siteSlug = safeSiteSlug(state.siteSlug)
if (!siteSlug) {
  try {
    const meta = readRegularJson(
      resolve(process.cwd(), '.netlify/deploy-meta.json'),
      '.netlify/deploy-meta.json',
      { optional: true },
    )
    siteSlug = safeSiteSlug(meta?.siteName)
  } catch (error) {
    console.error(`DEPLOY-URL-001:${error.message}`)
    process.exit(3)
  }
}
if (!siteSlug) {
  const warning = '.netlify/state.json 無 siteSlug,且無 .netlify/deploy-meta.json 快取 —— 無法推導正確 subdomain。`setup:netlify` 為唯讀 Dashboard 指引，不會寫入 site name；請從 Netlify Dashboard → Deploys 讀取真實 URL。'
  if (asJson) {
    // 吐空 url(不吐 UUID 假網址)讓 consumer(inject_deploy_url hook)fall through 到 curl-verified dashboard 偵測
    console.log(JSON.stringify({ branch: '', isProd: false, url: '', siteSlug: '', siteId, warning }, null, 2))
    process.exit(3)
  }
  console.error(`⚠️ ${warning}`)
  process.exit(3)
}

let branch = ''
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
} catch {
  console.error('❌ git branch detection failed(not a git repo?)')
  process.exit(2)
}
if (!branch || branch === 'HEAD') {
  console.error('❌ git branch detection failed(detached or empty HEAD)')
  process.exit(2)
}

const isProd = branch === 'main' || branch === 'master'
const rawSlug = branch.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

// ── DNS 63-char 硬上限截斷(2026-07-17 bug 修)──────────────────────────────
// Netlify branch preview 子網域 = `<branchSlug>--<siteSlug>`,整個 DNS label 必 ≤ 63 字元。
// 超過 → 該子網域**無法存在**(DNS 拒絕),curl 連 header 都收不到(非 404,是不解析)。
// 舊版直接拼 `${branchSlug}--${siteSlug}` 不截斷 → 長 branch 名吐出「物理上不可能」的網址。
// 修:超長時截 branch портion 到剛好塞得下 + 標記 truncated(誠實:預覽 URL 為 best-effort,
// 長 branch 名 Netlify 端截斷演算法未文件化,應以 Dashboard 實際 URL 為準或縮短 branch 名)。
const DNS_LABEL_MAX = 63
const suffix = `--${siteSlug}`
const branchBudget = DNS_LABEL_MAX - suffix.length
if (!isProd && branchBudget < 1) {
  console.error('DEPLOY-URL-001:site slug leaves no valid DNS budget for a branch preview')
  process.exit(3)
}
const truncated = !isProd && rawSlug.length > branchBudget
const branchSlug = truncated ? rawSlug.slice(0, branchBudget).replace(/-+$/, '') : rawSlug
if (!isProd && !branchSlug) {
  console.error('DEPLOY-URL-001:branch name cannot produce a valid Netlify preview slug')
  process.exit(2)
}

const url = isProd
  ? `https://${siteSlug}.netlify.app`
  : `https://${branchSlug}--${siteSlug}.netlify.app`

if (asJson) {
  console.log(JSON.stringify({ branch, isProd, url, siteSlug, siteId, truncated, fullSubdomainLen: rawSlug.length + suffix.length }, null, 2))
} else {
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (isProd) {
    console.log(`🚀 PRODUCTION deploy URL(main → live)`)
  } else {
    console.log(`🔍 PREVIEW deploy URL(branch: ${branch})`)
  }
  console.log(`   ${url}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  if (truncated) {
    console.log(`⚠️  branch 名太長:「${branch}」+ ${suffix} = ${rawSlug.length + suffix.length} 字元 > DNS 63 上限。`)
    console.log(`   上面已截斷為 best-effort URL,但 Netlify 端截斷演算法未文件化 → 可能仍不對。`)
    console.log(`   可靠做法:① 縮短 branch 名(≤ ${branchBudget} 字元)重推 ② 看 Netlify Dashboard 實際 Deploy URL`)
    console.log(`   ③ 合 main 後看正式站 https://${siteSlug}.netlify.app`)
  } else {
    console.log('Netlify build 2-3 min after push。已部署 → 上面 URL 直接開。')
    console.log('Verify deploy success:Netlify Dashboard `Deploys` tab 變綠勾。')
  }
}
