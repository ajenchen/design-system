#!/usr/bin/env node
/**
 * 「線上那份預覽是不是我這個 commit」(2026-09-11)
 *
 * 錨:2026-09-11 user 看的 Netlify 預覽落後兩個 commit,回報「還是很卡」—— 他測的不是我修過的東西。
 * 在把預覽連結交給 user 之前跑這支,回答不含猜測。
 *
 *   node scripts/verify-preview-head.mjs [<url>] [--expect=<sha>] [--wait=<秒>]
 *
 * 不給 url 時用 governance 的部署目標推導(與 hook 相同的分支預覽網域規則)。
 * `--wait` 會輪詢到相符或逾時(Netlify 建置要幾分鐘),逾時 exit 1 並印出線上那份的 commit。
 */
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const positional = process.argv.slice(2).find((a) => !a.startsWith('--'))
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim()
const EXPECT = arg('expect', process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD'))
const WAIT_S = Number(arg('wait', '0'))

const url = positional ?? (() => {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  const site = 'ajenchen-design-system'
  return `https://${branch.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}--${site}.netlify.app`
})()

// 用 curl 不用 fetch:沙箱的 node 解不到外部主機名(ERR_NAME_NOT_RESOLVED),curl 走代理才通。
const fetchInfo = () => {
  try {
    const body = execFileSync('curl', ['-sS', '--max-time', '20', `${url}/build-info.json`], { encoding: 'utf8' })
    try { return JSON.parse(body) } catch { return { error: '不是 JSON(可能是還沒有 build-info 的舊版產物)' } }
  } catch (e) { return { error: String(e.message ?? e).slice(0, 160) } }
}

const deadline = Date.now() + WAIT_S * 1000
let info
for (;;) {
  info = fetchInfo()
  if (info.commit === EXPECT) break
  if (Date.now() >= deadline) break
  execFileSync('node', ['-e', 'setTimeout(()=>{},15000)'])
}

const ok = info.commit === EXPECT
console.log(`${ok ? '✓' : '✗'} ${url}`)
console.log(`   期望 commit ${EXPECT.slice(0, 8)}`)
console.log(`   線上 commit ${info.commit ? info.commit.slice(0, 8) : `(讀不到:${info.error ?? '無 commit 欄位'})`}${info.builtAt ? `,build 於 ${info.builtAt}` : ''}`)
if (!ok) console.log('   → 這份預覽不是目前的 commit,不要拿它當「修過了沒」的證據。')
process.exit(ok ? 0 : 1)
