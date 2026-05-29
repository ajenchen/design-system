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
 *   1 .netlify/state.json missing(run `netlify init` first)
 *   2 git branch detection failed
 */

import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')

const stateFile = resolve(process.cwd(), '.netlify/state.json')
if (!existsSync(stateFile)) {
  console.error('❌ .netlify/state.json not found. Run `npm run setup:netlify` first(scaffolds Netlify site link).')
  process.exit(1)
}

const state = JSON.parse(readFileSync(stateFile, 'utf8'))
const siteId = state.siteId
const siteSlug = state.siteSlug || siteId

let branch = ''
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
} catch {
  console.error('❌ git branch detection failed(not a git repo?)')
  process.exit(2)
}

const isProd = branch === 'main' || branch === 'master'
const branchSlug = branch.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

const url = isProd
  ? `https://${siteSlug}.netlify.app`
  : `https://${branchSlug}--${siteSlug}.netlify.app`

if (asJson) {
  console.log(JSON.stringify({ branch, isProd, url, siteSlug, siteId }, null, 2))
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
  console.log('Netlify build 2-3 min after push。已部署 → 上面 URL 直接開。')
  console.log('Verify deploy success:Netlify Dashboard `Deploys` tab 變綠勾。')
}
