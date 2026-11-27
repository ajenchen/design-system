#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: LinkInput 的 view / readonly / disabled / edit 與 DataTable 連結格,只有網頁網址(http(s) 開頭,或看起來像網址而補上 https://)與檢視時的站內路徑畫成連結,其他值是一般文字,所有 href 只能是 http(s) 或同一個網站
 *   紅: 判定表對「不合法的值畫成連結」「javascript: href」「合法網址沒畫成連結」「//host 畫成連結」「站內路徑沒畫成連結」「停用時字與唯讀不同」「網址樣字沒補 https://」各一個合成輸出必紅;
 *       52abc933 的原始碼紅 18 格(網址樣字三種 × 停用以外六種模式:F2 乙前畫成一般文字);
 *       1d98db88 的原始碼紅 15 格(檔名 report.pdf / invoice-2026.xlsx / node.js × 檢視 / 外框檢視 / 唯讀 / 表格可編 / 表格不可編:補上 https:// 畫成連結,2026-11-04 fields 審查 12);
 *       7777b61c 的原始碼跑紅 140 格;a6390356 的原始碼紅停用 7 格(javascript: 三種寫法 / data: / mailto: / tel: 被畫成「-」,ftp: 只剩主機名,2026-10-21 r1b fields F2)
 *       2026-11-27 起(值的前綴圖示 `icon` / 表格 `meta.linkIcon`,link-input.spec.md「值的前綴圖示」):判定表 judgeIcon 對「圖示在連結外面」「停用沒畫圖示」
 *       「空值畫了圖示」「打字狀態畫了圖示」「圖示沒有 aria-hidden」「加圖示後連結的名字變了」各一個合成輸出必紅;eb985952(加 icon 前)的原始碼紅 43 格(要畫圖示的格全紅,原本的判定表那幾格照綠)
 *   綠: 修好的原始碼每一種模式 × 每一種值全綠(MODES × VALID / SAME_SITE / INVALID,數量以本檔為準);真的渲染時合法網址與站內路徑必須讀到連結(儀器有眼睛),否則 selftest 紅;
 *       帶圖示的每一種模式 × ICON_VALUES 全綠,真的渲染時唯讀 / 表格格的合法網址必須讀到連結裡的圖示(儀器有眼睛)
 * ─────
 * 網址值的顯示:只有合法的 http(s) 網址畫成連結,其他一律一般文字(2026-10-13,待辦總帳 Q3e)。
 *
 * 規則:`components/LinkInput/link-input.spec.md`「readonly / disabled」與「驗證」(http(s) 開頭,或看起來像網址就補 https://;2026-10-21 F2 乙)——
 * 判準與編輯模式同一支 `toWebUrl`(`link-input.tsx` `renderLinkValue`);DataTable 連結格用 LinkInput 檢視模式,
 * 同一處生效。修前:唯讀 / 檢視模式與表格連結格把任何字串都畫成可點連結,包括 `javascript:` 開頭(表格存得進去,`href` 就是 `javascript:…`)。
 *
 * 量法:esbuild 把 TSX 探針打包成 node 可跑的 CJS,react-dom/server 靜態渲染每一種模式 × 每一種值,讀輸出的 `<a href>`:
 *   - 合法 http(s) → 必須恰好一個 `<a href=該值>`(儀器對照:這幾格一定要有連結,否則量測沒在看)
 *   - 站內路徑(`/projects/8821/tasks/4821`)→ 檢視 / 唯讀 / 表格格畫成連結(修前就是;AgentPanel 網址登記示範靠它),編輯模式不收
 *   - 網址樣字(`www.example.com/pricing`、`acme.com`、`docs.acme.io/guide?x=1#y`)→ 停用以外都是恰好一個 `<a href="https://…">`(補上的就是 https://)
 *   - 其他(`javascript:` 大小寫與前置空白 / `data:` / `mailto:` / `ftp:` / 信箱 / 單字 / 中間有空白 / 會被正規化成別的網站的 `//host`、`/\host`、夾 tab)
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
/** 看起來像網址、沒寫協定 → 補 https:// 當連結(F2 乙);href 必須恰好是 `https://` + 值 */
export const LOOKS_LIKE = ['www.example.com/pricing', 'acme.com', 'docs.acme.io/guide?x=1#y']
export const INVALID = ['ops@example.com', 'acme', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'mailto:ops@example.com', 'tel:+886223456789', 'ftp://files.example.com/a', 'shop example',
  // 以 / 開頭、卻會被瀏覽器正規化成別的網站的寫法 —— 不是站內路徑
  '//evil.example/x', '/\\evil.example', '/\t/evil.example',
  // 檔名:形狀像「標籤.標籤」,但結尾的副檔名不是頂級網域(link-input.spec.md「驗證」:頂級網域要是真的)—— 不是網址,不補 https://
  'report.pdf', 'invoice-2026.xlsx', 'node.js']
const ALL = [...VALID, ...LOOKS_LIKE, ...SAME_SITE, ...INVALID]
export const MODES = ['view', 'viewChrome', 'readonly', 'disabled', 'edit', 'cellEditable', 'cellReadonly']
/** 帶值的前綴圖示渲染的值:網頁網址 / 網址樣字 / 站內路徑 / 不是網址 / 空值(link-input.spec.md「值的前綴圖示」「哪些地方畫」) */
export const ICON_VALUES = [VALID[0], LOOKS_LIKE[1], SAME_SITE[0], 'ops@example.com', '']

/**
 * 純函式:值的前綴圖示每格 { icons, iconsInAnchor, iconsHidden, anchors, anchorText, anchorTextPlain } → 不符的格。
 * 該畫的地方 = 值畫成連結的每一處(圖示在連結裡)+ 停用 + 值不是網址的一般文字;不畫 = 空值、編輯模式的打字狀態(link-input.spec.md「值的前綴圖示」)。
 */
export function judgeIcon(results) {
  const failures = []
  for (const mode of MODES) {
    for (const value of ICON_VALUES) {
      const key = `icon|${mode}|${value}`
      const r = results[key]
      if (!r) { failures.push(`${key}: 沒量到`); continue }
      // 編輯模式只有網頁網址會是連結狀態(站內路徑、不是網址 = 打字狀態);其他模式網頁網址 / 網址樣字 / 站內路徑都是連結
      const linkable = value !== '' && (VALID.includes(value) || LOOKS_LIKE.includes(value) || (SAME_SITE.includes(value) && mode !== 'edit'))
      const shouldDraw = value !== '' && (mode === 'edit' ? linkable : true)
      if (!shouldDraw && r.icons !== 0) failures.push(`${key}: ${value === '' ? '空值' : '打字狀態'}不畫值的圖示,實際 ${r.icons} 個`)
      if (shouldDraw && r.icons !== 1) failures.push(`${key}: 應畫 1 個值的圖示,實際 ${r.icons} 個`)
      if (shouldDraw && linkable && mode !== 'disabled' && r.iconsInAnchor !== 1) failures.push(`${key}: 值的圖示要在連結裡(實際連結裡 ${r.iconsInAnchor} 個)`)
      if (r.icons !== r.iconsHidden) failures.push(`${key}: 值的圖示要 aria-hidden(${r.icons} 個裡 ${r.iconsHidden} 個有)`)
      if (r.anchorText !== r.anchorTextPlain) failures.push(`${key}: 加圖示後連結的名字變了(「${r.anchorTextPlain}」→「${r.anchorText}」)`)
    }
  }
  return failures
}

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
      // disabled 一律純文字(不可點,規則見 spec「readonly / disabled」),不論合不合法;顯示的字與 readonly 同一份(停用只換顏色,
      // 有值不能顯示成空值 —— M24;2026-10-21 r1b fields F2:修前 mailto: / tel: / javascript: / data: 在停用時畫成「-」)
      if (mode === 'disabled') {
        if (r.anchors.length) failures.push(`${key}: disabled 不該有連結`)
        const ro = results[`readonly|${value}`]
        if (ro && norm(r.text) !== norm(ro.text)) failures.push(`${key}: disabled 顯示「${norm(r.text).slice(0, 40)}」,readonly 顯示「${norm(ro.text).slice(0, 40)}」—— 停用只換顏色,字應相同`)
        continue
      }
      const linkable = VALID.includes(value) || LOOKS_LIKE.includes(value) || (SAME_SITE.includes(value) && mode !== 'edit')
      if (linkable && r.anchors.length !== 1) failures.push(`${key}: 應畫成 1 個連結,實際 ${r.anchors.length}`)
      if (LOOKS_LIKE.includes(value) && r.anchors.length === 1 && r.anchors[0].href !== `https://${value}`) failures.push(`${key}: 網址樣字的 href 應補成「https://${value}」,實際「${r.anchors[0].href}」`)
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
import { Paperclip } from 'lucide-react'
const UrlCell = resolveCellComponent('url')
// icon:值的前綴圖示(LinkInput icon / 表格 meta.linkIcon);不給 = 原本的量法
const el = (mode: string, value: string, icon?: typeof Paperclip) => {
  switch (mode) {
    case 'view': return <LinkInput mode="view" value={value} icon={icon} />
    case 'viewChrome': return <LinkInput mode="view" value={value} showDisplayEndIcon icon={icon} />
    case 'readonly': return <LinkInput mode="readonly" value={value} icon={icon} />
    case 'disabled': return <LinkInput mode="disabled" value={value} icon={icon} />
    case 'edit': return <LinkInput value={value} onChange={() => {}} icon={icon} />
    case 'cellEditable': return <UrlCell value={value} meta={{ linkIcon: icon }} mode="view" size="md" autoRowHeight={false} isEditable onRequestEdit={() => {}} />
    default: return <UrlCell value={value} meta={{ linkIcon: icon }} mode="view" size="md" autoRowHeight={false} isEditable={false} />
  }
}
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
const render = (node: unknown) => renderToStaticMarkup(<TooltipProvider>{node as never}</TooltipProvider>)
const anchorInners = (html: string) => [...html.matchAll(/<a\\b[^>]*\\bhref="[^"]*"[^>]*>([\\s\\S]*?)<\\/a>/g)].map((m) => m[1])
const textOf = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\\s+/g, ' ').trim()
const ICON_MARK = /data-link-value-icon=""/g
const out: Record<string, unknown> = {}
for (const mode of ${JSON.stringify(MODES)}) {
  for (const value of ${JSON.stringify(ALL)}) {
    const html = render(el(mode, value))
    const anchors = [...html.matchAll(/<a\\b[^>]*\\bhref="([^"]*)"/g)].map((m) => ({ href: decode(m[1]) }))
    const text = decode(html.replace(/<[^>]+>/g, ' ')).replace(/\\s+/g, ' ')
    out[mode + '|' + value] = { anchors, text }
  }
  // 值的前綴圖示:同一格帶 / 不帶圖示各渲染一次(連結的名字 = 連結裡的字,兩者要相同)
  for (const value of ${JSON.stringify(ICON_VALUES)}) {
    const html = render(el(mode, value, Paperclip))
    const plain = render(el(mode, value))
    const inners = anchorInners(html)
    out['icon|' + mode + '|' + value] = {
      icons: (html.match(ICON_MARK) ?? []).length,
      iconsInAnchor: inners.reduce((n, s) => n + (s.match(ICON_MARK) ?? []).length, 0),
      // 圖示那一格(ItemPrefix)裡第一個 svg 帶 aria-hidden="true"
      iconsHidden: [...html.matchAll(/data-link-value-icon=""[^>]*>\\s*<svg\\b[^>]*>/g)].filter((m) => /aria-hidden="true"/.test(m[0])).length,
      anchors: inners.length,
      anchorText: inners.map(textOf).join(' | '),
      anchorTextPlain: anchorInners(plain).map(textOf).join(' | '),
    }
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
    const linkable = mode !== 'disabled' && (VALID.includes(value) || LOOKS_LIKE.includes(value) || (SAME_SITE.includes(value) && mode !== 'edit'))
    good[`${mode}|${value}`] = { anchors: linkable ? [{ href: LOOKS_LIKE.includes(value) ? `https://${value}` : value }] : [], text: ` ${value} ` }
  }
  if (judge(good).length !== 0) { console.error('✗ selftest:正確形狀應綠,實際:', judge(good)); ok = false }
  const bad1 = { ...good, 'readonly|ops@example.com': { anchors: [{ href: 'https://ops@example.com' }], text: 'ops@example.com' } }
  if (!judge(bad1).some((f) => f.startsWith('readonly|ops@example.com'))) { console.error('✗ selftest:不合法的值(信箱)畫成連結應紅'); ok = false }
  const bad7 = { ...good, 'cellReadonly|acme.com': { anchors: [], text: 'acme.com' } }
  if (!judge(bad7).some((f) => /應畫成 1 個連結/.test(f))) { console.error('✗ selftest:網址樣字沒畫成連結應紅'); ok = false }
  const bad8 = { ...good, 'view|www.example.com/pricing': { anchors: [{ href: 'www.example.com/pricing' }], text: 'example.com' } }
  if (!judge(bad8).some((f) => /應補成/.test(f))) { console.error('✗ selftest:網址樣字的 href 沒補 https:// 應紅'); ok = false }
  const bad2 = { ...good, 'cellEditable|javascript:alert(1)': { anchors: [{ href: 'javascript:alert(1)' }], text: '' } }
  if (!judge(bad2).some((f) => /不是 http\(s\)/.test(f))) { console.error('✗ selftest:javascript: href 應紅'); ok = false }
  const bad3 = { ...good, 'view|https://github.com/acme/web': { anchors: [], text: 'github.com' } }
  if (!judge(bad3).some((f) => /應畫成 1 個連結/.test(f))) { console.error('✗ selftest:合法網址沒畫成連結應紅'); ok = false }
  const bad4 = { ...good, 'cellReadonly|//evil.example/x': { anchors: [{ href: '//evil.example/x' }], text: 'x' } }
  if (!judge(bad4).some((f) => /不是 http\(s\)|不合法的值應是一般文字/.test(f))) { console.error('✗ selftest:會被正規化成別的網站的 //host 畫成連結應紅'); ok = false }
  const bad5 = { ...good, 'readonly|/projects/8821/tasks/4821': { anchors: [], text: '/projects/8821/tasks/4821' } }
  if (!judge(bad5).some((f) => /應畫成 1 個連結/.test(f))) { console.error('✗ selftest:站內路徑沒畫成連結應紅'); ok = false }
  const bad6 = { ...good, 'disabled|mailto:ops@example.com': { anchors: [], text: ' - ' } }
  if (!judge(bad6).some((f) => /停用只換顏色/.test(f))) { console.error('✗ selftest:停用時把有值的格畫成「-」應紅'); ok = false }
  if (judge({}).length < MODES.length) { console.error('✗ selftest:空結果應每格都紅'); ok = false }
  // 值的前綴圖示(judgeIcon):正確形狀綠,六種壞法各紅
  const goodIcon = {}
  for (const mode of MODES) for (const value of ICON_VALUES) {
    const linkable = value !== '' && (VALID.includes(value) || LOOKS_LIKE.includes(value) || (SAME_SITE.includes(value) && mode !== 'edit'))
    const draw = value !== '' && (mode === 'edit' ? linkable : true)
    const inAnchor = draw && linkable && mode !== 'disabled'
    goodIcon[`icon|${mode}|${value}`] = { icons: draw ? 1 : 0, iconsInAnchor: inAnchor ? 1 : 0, iconsHidden: draw ? 1 : 0, anchors: inAnchor ? 1 : 0, anchorText: inAnchor ? 'github.com' : '', anchorTextPlain: inAnchor ? 'github.com' : '' }
  }
  if (judgeIcon(goodIcon).length !== 0) { console.error('✗ selftest:值的圖示正確形狀應綠,實際:', judgeIcon(goodIcon)); ok = false }
  const iconBad = [
    ['圖示在連結外面', 'icon|readonly|https://github.com/acme/web', { iconsInAnchor: 0 }, /要在連結裡/],
    ['停用沒畫圖示', 'icon|disabled|https://github.com/acme/web', { icons: 0, iconsHidden: 0 }, /應畫 1 個/],
    ['空值畫了圖示', 'icon|readonly|', { icons: 1, iconsHidden: 1 }, /空值不畫/],
    ['打字狀態畫了圖示', 'icon|edit|ops@example.com', { icons: 1, iconsHidden: 1 }, /打字狀態不畫/],
    ['圖示沒有 aria-hidden', 'icon|cellReadonly|https://github.com/acme/web', { iconsHidden: 0 }, /aria-hidden/],
    ['加圖示後連結的名字變了', 'icon|view|acme.com', { anchorText: '圖示 github.com' }, /名字變了/],
  ]
  for (const [name, key, patch, re] of iconBad) {
    const bad = { ...goodIcon, [key]: { ...goodIcon[key], ...patch } }
    if (!judgeIcon(bad).some((f) => f.startsWith(key) && re.test(f))) { console.error(`✗ selftest:值的圖示「${name}」應紅`); ok = false }
  }
  if (judgeIcon({}).length < MODES.length) { console.error('✗ selftest:值的圖示空結果應每格都紅'); ok = false }
  // 儀器有眼睛:真的渲染一次,合法網址在 view / readonly / 表格格都讀得到連結
  const out = measure()
  for (const k of ['view|https://github.com/acme/web', 'readonly|https://github.com/acme/web', 'cellEditable|https://github.com/acme/web', 'view|/projects/8821/tasks/4821', 'view|www.example.com/pricing']) {
    if (!(out[k]?.anchors?.length === 1)) { console.error(`✗ selftest:對照組 ${k} 應讀到 1 個連結,實際`, out[k]); ok = false }
  }
  // 儀器有眼睛:帶圖示渲染時,唯讀與表格格的合法網址讀得到連結裡的圖示
  for (const k of ['icon|readonly|https://github.com/acme/web', 'icon|cellReadonly|https://github.com/acme/web', 'icon|edit|https://github.com/acme/web']) {
    if (!(out[k]?.iconsInAnchor === 1)) { console.error(`✗ selftest:對照組 ${k} 應讀到連結裡 1 個值的圖示,實際`, out[k]); ok = false }
  }
  console.log(ok ? '✅ link-input-url-display selftest PASS' : '❌ link-input-url-display selftest FAIL')
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  const measured = measure()
  const failures = [...judge(measured), ...judgeIcon(measured)]
  if (failures.length) {
    console.error(`✗ link-input-url-display:${failures.length} 格不符\n  ${failures.slice(0, 30).join('\n  ')}`)
    process.exit(1)
  }
  console.log(`✓ link-input-url-display:${MODES.length} 種模式 × ${ALL.length} 種值 —— 只有網頁網址(含補上 https:// 的網址樣字)與站內路徑畫成連結,其他是一般文字,沒有別的 href;` +
    `帶值的前綴圖示 ${MODES.length} × ${ICON_VALUES.length} 格 —— 連結裡的圖示、停用與一般文字照畫、空值與打字狀態不畫、讀屏略過、連結名字不變`)
}
