#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: LinkInput 的 view / readonly / disabled / edit 與 DataTable 連結格,只有合法 http(s) 網址(與檢視時的站內路徑)畫成連結,其他值是一般文字,所有 href 只能是 http(s) 或同一個網站
 *   紅: 判定表對「不合法的值畫成連結」「javascript: href」「合法網址沒畫成連結」「//host 畫成連結」「站內路徑沒畫成連結」各一個合成輸出必紅;7777b61c 的原始碼跑紅 140 格
 *   綠: 修好的原始碼 7 種模式 × 14 種值全綠;真的渲染時合法網址與站內路徑必須讀到連結(儀器有眼睛),否則 selftest 紅
 * ─────
 * 網址值的顯示:只有合法的 http(s) 網址畫成連結,其他一律一般文字(2026-10-13,待辦總帳 Q3e)。
 *
 * 規則:`components/LinkInput/link-input.spec.md`「readonly / disabled」與「驗證」(必須包含 http:// 或 https://)——
 * 判準與編輯模式「只有合法才顯示成連結」同一支 `isValidUrl`(`link-input.tsx` `renderLinkValue`);DataTable 連結格用 LinkInput 檢視模式,
 * 同一處生效。修前:唯讀 / 檢視模式與表格連結格把任何字串都畫成可點連結,包括 `javascript:` 開頭(表格存得進去,`href` 就是 `javascript:…`)。
 *
 * 量法:esbuild 把 TSX 探針打包成 node 可跑的 CJS,react-dom/server 靜態渲染每一種模式 × 每一種值,讀輸出的 `<a href>`:
 *   - 合法 http(s) → 必須恰好一個 `<a href=該值>`(儀器對照:這幾格一定要有連結,否則量測沒在看)
 *   - 站內路徑(`/projects/8821/tasks/4821`)→ 檢視 / 唯讀 / 表格格畫成連結(修前就是;AgentPanel 網址登記示範靠它),編輯模式不收
 *   - 其他(少了 https:// / `javascript:` 大小寫與前置空白 / `data:` / `mailto:` / `ftp:` / 中間有空白 / 會被正規化成別的網站的 `//host`、`/\host`、夾 tab)
 *     → 零個 `<a>`,而且顯示文字還在
 *   - 全部輸出裡任何 `href` 只准 http(s) 或解析後仍在同一個網站
 * 模式:LinkInput view(裸)/ view(Field 外框,表格格用)/ readonly / disabled / edit;DataTable UrlCell 檢視(可編 / 不可編)。
 * `--selftest`:判定表(純函式 judge)對「把不合法的值畫成連結」「合法值沒畫成連結」「javascript: href」各一個造出來的輸出必紅,正確形狀必綠;
 *   再真的渲染一次,合法值必須讀到連結(儀器有眼睛)。
 *   node scripts/link-input-url-display-invariant.mjs [--selftest]
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ESBUILD = path.join(ROOT, 'node_modules', '.bin', 'esbuild')

export const VALID = ['https://github.com/acme/web', 'http://intranet.example.com/wiki']
/** 站內路徑:檢視 / 唯讀 / 表格格畫成連結(修前就是,AgentPanel 網址登記示範靠它);編輯模式不收(驗證只收 http(s)) */
export const SAME_SITE = ['/projects/8821/tasks/4821']
export const INVALID = ['www.example.com/pricing', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'mailto:ops@example.com', 'ftp://files.example.com/a', 'shop example',
  // 以 / 開頭、卻會被瀏覽器正規化成別的網站的寫法 —— 不是站內路徑
  '//evil.example/x', '/\\evil.example', '/\t/evil.example']
const ALL = [...VALID, ...SAME_SITE, ...INVALID]
export const MODES = ['view', 'viewChrome', 'readonly', 'disabled', 'edit', 'cellEditable', 'cellReadonly']

/** 純函式:每格 { anchors: [{href}], text } → 不符的格(呼叫端與 selftest 共用,M37:判斷式只有一份) */
export function judge(results) {
  const failures = []
  // href 只准 http(s) 網址或解析後仍在同一個網站的站內路徑
  const PROBE = 'https://same-site.invalid'
  const allowedProtocol = (href) => {
    try { if (['http:', 'https:'].includes(new URL(href).protocol)) return true } catch { /* 不是絕對網址 → 看是不是站內路徑 */ }
    try { return href.startsWith('/') && new URL(href, PROBE).origin === PROBE } catch { return false }
  }
  const norm = (x) => x.replace(/\s+/g, ' ').trim()
  for (const mode of MODES) {
    for (const value of ALL) {
      const key = `${mode}|${value}`
      const r = results[key]
      if (!r) { failures.push(`${key}: 沒量到`); continue }
      for (const a of r.anchors) if (!allowedProtocol(a.href)) failures.push(`${key}: href「${a.href}」不是 http(s)`)
      // disabled 一律純文字(不可點,規則見 spec「readonly / disabled」),不論合不合法
      if (mode === 'disabled') { if (r.anchors.length) failures.push(`${key}: disabled 不該有連結`); continue }
      const linkable = VALID.includes(value) || (SAME_SITE.includes(value) && mode !== 'edit')
      if (linkable && r.anchors.length !== 1) failures.push(`${key}: 應畫成 1 個連結,實際 ${r.anchors.length}`)
      if (!linkable && mode !== 'edit' && r.anchors.length !== 0) failures.push(`${key}: 不合法的值應是一般文字,實際 ${r.anchors.length} 個連結`)
      if (!linkable && mode !== 'edit' && !norm(r.text).includes(norm(value).slice(0, 12))) failures.push(`${key}: 一般文字裡看不到這個值(${JSON.stringify(r.text.slice(0, 60))})`)
    }
  }
  return failures
}

const PROBE = `
import { renderToStaticMarkup } from 'react-dom/server'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { resolveCellComponent } from '@/design-system/components/DataTable/cell-registry'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
const UrlCell = resolveCellComponent('url')
const el = (mode: string, value: string) => {
  switch (mode) {
    case 'view': return <LinkInput mode="view" value={value} />
    case 'viewChrome': return <LinkInput mode="view" value={value} showDisplayEndIcon />
    case 'readonly': return <LinkInput mode="readonly" value={value} />
    case 'disabled': return <LinkInput mode="disabled" value={value} />
    case 'edit': return <LinkInput value={value} onChange={() => {}} />
    case 'cellEditable': return <UrlCell value={value} meta={{}} mode="view" size="md" autoRowHeight={false} isEditable onRequestEdit={() => {}} />
    default: return <UrlCell value={value} meta={{}} mode="view" size="md" autoRowHeight={false} isEditable={false} />
  }
}
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
const out: Record<string, unknown> = {}
for (const mode of ${JSON.stringify(MODES)}) {
  for (const value of ${JSON.stringify(ALL)}) {
    const html = renderToStaticMarkup(<TooltipProvider>{el(mode, value)}</TooltipProvider>)
    const anchors = [...html.matchAll(/<a\\b[^>]*\\bhref="([^"]*)"/g)].map((m) => ({ href: decode(m[1]) }))
    const text = decode(html.replace(/<[^>]+>/g, ' ')).replace(/\\s+/g, ' ')
    out[mode + '|' + value] = { anchors, text }
  }
}
process.stdout.write(JSON.stringify(out))
`

export function measure() {
  if (!existsSync(ESBUILD)) throw new Error(`找不到 esbuild:${ESBUILD}(先 npm install)`)
  const dir = mkdtempSync(path.join(tmpdir(), 'link-url-display-'))
  if (!dir || !existsSync(dir)) throw new Error('mkdtemp 失敗(回空)')
  const src = path.join(dir, 'probe.tsx')
  const bundle = path.join(dir, 'probe.cjs')
  writeFileSync(src, PROBE)
  const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules'), NODE_ENV: 'development' }
  const build = spawnSync(ESBUILD, [src, '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', `--tsconfig=${path.join(ROOT, 'tsconfig.app.json')}`, '--loader:.css=empty', '--log-level=warning', '--define:process.env.NODE_ENV="development"', `--outfile=${bundle}`], { cwd: ROOT, encoding: 'utf8', env })
  if (build.status !== 0) throw new Error(`esbuild 打包失敗:\n${build.stderr}`)
  const run = spawnSync(process.execPath, [bundle], { cwd: ROOT, encoding: 'utf8', env, maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`探針執行失敗:\n${run.stderr}`)
  const json = run.stdout.trim()
  if (!json) throw new Error('探針沒有輸出(儀器失效)')
  return JSON.parse(json)
}

function selftest() {
  let ok = true
  const good = {}
  for (const mode of MODES) for (const value of ALL) {
    const linkable = mode !== 'disabled' && (VALID.includes(value) || (SAME_SITE.includes(value) && mode !== 'edit'))
    good[`${mode}|${value}`] = { anchors: linkable ? [{ href: value }] : [], text: ` ${value} ` }
  }
  if (judge(good).length !== 0) { console.error('✗ selftest:正確形狀應綠,實際:', judge(good)); ok = false }
  const bad1 = { ...good, 'readonly|www.example.com/pricing': { anchors: [{ href: 'www.example.com/pricing' }], text: 'www.example.com/pricing' } }
  if (!judge(bad1).some((f) => f.startsWith('readonly|www.example.com/pricing'))) { console.error('✗ selftest:不合法的值畫成連結應紅'); ok = false }
  const bad2 = { ...good, 'cellEditable|javascript:alert(1)': { anchors: [{ href: 'javascript:alert(1)' }], text: '' } }
  if (!judge(bad2).some((f) => /不是 http\(s\)/.test(f))) { console.error('✗ selftest:javascript: href 應紅'); ok = false }
  const bad3 = { ...good, 'view|https://github.com/acme/web': { anchors: [], text: 'github.com' } }
  if (!judge(bad3).some((f) => /應畫成 1 個連結/.test(f))) { console.error('✗ selftest:合法網址沒畫成連結應紅'); ok = false }
  const bad4 = { ...good, 'cellReadonly|//evil.example/x': { anchors: [{ href: '//evil.example/x' }], text: 'x' } }
  if (!judge(bad4).some((f) => /不是 http\(s\)|不合法的值應是一般文字/.test(f))) { console.error('✗ selftest:會被正規化成別的網站的 //host 畫成連結應紅'); ok = false }
  const bad5 = { ...good, 'readonly|/projects/8821/tasks/4821': { anchors: [], text: '/projects/8821/tasks/4821' } }
  if (!judge(bad5).some((f) => /應畫成 1 個連結/.test(f))) { console.error('✗ selftest:站內路徑沒畫成連結應紅'); ok = false }
  if (judge({}).length < MODES.length) { console.error('✗ selftest:空結果應每格都紅'); ok = false }
  // 儀器有眼睛:真的渲染一次,合法網址在 view / readonly / 表格格都讀得到連結
  const out = measure()
  for (const k of ['view|https://github.com/acme/web', 'readonly|https://github.com/acme/web', 'cellEditable|https://github.com/acme/web', 'view|/projects/8821/tasks/4821']) {
    if (!(out[k]?.anchors?.length === 1)) { console.error(`✗ selftest:對照組 ${k} 應讀到 1 個連結,實際`, out[k]); ok = false }
  }
  console.log(ok ? '✅ link-input-url-display selftest PASS' : '❌ link-input-url-display selftest FAIL')
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  const failures = judge(measure())
  if (failures.length) {
    console.error(`✗ link-input-url-display:${failures.length} 格不符\n  ${failures.slice(0, 30).join('\n  ')}`)
    process.exit(1)
  }
  console.log(`✓ link-input-url-display:${MODES.length} 種模式 × ${ALL.length} 種值 —— 只有 http(s) 網址與站內路徑畫成連結,其他是一般文字,沒有別的 href`)
}
