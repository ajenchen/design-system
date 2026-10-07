#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 全 DS 的開合動畫(data-state 驅動的浮層進出場與原地展開收合)只由 tokens/motion 底下的 SSOT 宣告,而且
 *         (M1)任何會提高權重的變體(data-[state=…]、group-*、aria-*、hover、[&…] 等)上的 animate-* 都包在 motion-safe: 底下
 *             —— 減少動態不再靠 `motion-reduce:animate-none` 去跟它比權重(待辦總帳 T7);data-state 開合動畫只准住在 SSOT;
 *         (M2)SSOT 裡宣告了關閉動畫的常數,一定帶「關閉狀態保持最後一格」(holdClosedEndState,待辦總帳 T6);
 *         (M3)DS 自己的 CSS 不重宣告 tw-animate-css 已有的同名 keyframe / animate-* 工具類(兩份宣告各寫各的值,待辦總帳 T8);
 *         (M4)每個 SSOT 常數的時長綁 motion.css 的 `--motion-duration-*` token,不吃外掛預設;
 *         (M5)規格裡「`--motion-duration-X` N ms」這種寫法的 N 必須等於 motion.css 的值(規格與 token 不得各寫各的)
 *   紅: --selftest 對 M1–M5 各注入一個舊形狀(TreeView 修前那串 `data-[state=closed]:animate-collapsible-up … motion-reduce:animate-none`、
 *       少了 holdClosedEndState 的 SSOT 常數、舊 base.css 的 `@utility animate-collapsible-up { … 150ms … }`、不綁時長的 SSOT 常數、
 *       規格寫錯的毫秒數),五條各自必須紅;少一條沒紅 → exit 1。`--root=<修前的樹>` 直接跑:M1 / M2 / M3 / M4 紅(證據見待辦總帳 T6–T8 列)
 *   綠: 沒弄壞時必須綠;每一條都要先證明有東西可驗(掃到的檔案數、SSOT 常數數、外掛動畫名數、規格裡的 token 引用數都 > 0),
 *       掃到 0 = 儀器失效(exit 2),不是通過
 *
 * owner:`packages/design-system/src/tokens/motion/motion.spec.md`「開合動畫:何時播、怎麼收尾」;
 * 決定來源:`governance/planning/2026-09-25-interaction-and-hover-remediation.md` T6 / T7 / T8。
 * 瀏覽器那一半(真的量收起後有沒有長回來、減少動態下有沒有播):`scripts/open-close-motion-invariant.mjs`。
 *
 * Run: `node scripts/motion-ssot-invariant.mjs [--selftest] [--root=<repo 根>]`
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const ROOT = resolve(SELF_ROOT, arg('root', '.'))
const SELFTEST = process.argv.includes('--selftest')
const DS = join(ROOT, 'packages/design-system/src')
const MOTION_DIR = join(DS, 'tokens/motion')
const TW_ANIMATE = [join(ROOT, 'node_modules/tw-animate-css/dist/tw-animate.css'), join(SELF_ROOT, 'node_modules/tw-animate-css/dist/tw-animate.css')].find(existsSync)

const SKIP_DIRS = new Set(['node_modules', 'dist', 'storybook-static', '.git'])
const walk = (dir, re, out = []) => {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(p, re, out) }
    else if (re.test(entry.name)) out.push(p)
  }
  return out
}
const rel = (p) => relative(ROOT, p)
const instrument = []
const results = []
const ck = (id, ok, msg, detail = []) => { results.push({ id, ok, msg, detail }) }

// ── 讀進來的東西(selftest 在這裡注入舊形狀,判定邏輯完全不分支) ─────────────────────────
// 會被 Tailwind 掃到的程式碼:DS 原始碼 + DS 內部 dev 入口 + 產品端(src/globals.css 的 @source)
const codeFiles = [join(DS), join(ROOT, 'src'), join(ROOT, 'apps')].flatMap((d) => walk(d, /\.(tsx?|jsx?)$/))
  .filter((p) => !/\.d\.ts$/.test(p))
  .map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }))
const cssFiles = walk(DS, /\.css$/).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }))
const motionTs = walk(MOTION_DIR, /\.ts$/).filter((p) => !/\.stories\./.test(p)).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }))
const motionCss = existsSync(join(MOTION_DIR, 'motion.css')) ? readFileSync(join(MOTION_DIR, 'motion.css'), 'utf8') : ''
const specFiles = walk(DS, /\.spec\.md$/).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }))
const twAnimate = TW_ANIMATE ? readFileSync(TW_ANIMATE, 'utf8') : ''

if (SELFTEST) {
  // M1:TreeView 修前那一串(權重 (0,2,0) 的開合動畫 + 輸給它的 (0,1,0) 守衛,寫在元件裡)
  codeFiles.push({ path: '__selftest__/tree-view-before.tsx', text: 'const x = <Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none" />' })
  // M2:SSOT 常數宣告了關閉動畫,卻沒有保持最後一格
  motionTs.push({ path: '__selftest__/tokens/motion/no-hold.ts', text: "export const noHoldMotion = '[--tw-duration:var(--motion-duration-overlay)] motion-safe:data-[state=closed]:animate-out'" })
  // M3:舊 base.css 的同名重宣告
  cssFiles.push({ path: '__selftest__/styles/base-before.css', text: '@utility animate-collapsible-up {\n  animation: collapsible-up 150ms ease-out;\n}\n@keyframes collapsible-up { from { height: var(--radix-collapsible-content-height); } to { height: 0; } }' })
  // M4:SSOT 常數不綁時長(吃外掛預設)
  motionTs.push({ path: '__selftest__/tokens/motion/no-duration.ts', text: "import { holdClosedEndState } from './closed-end-state'\nexport const noDurationMotion = `motion-safe:data-[state=closed]:animate-collapsible-up ${holdClosedEndState}`" })
  // M5:規格寫錯毫秒數
  specFiles.push({ path: '__selftest__/agent-panel.spec.md', text: '| 思考塊開合 | disclosureMotion | `--motion-duration-disclosure` 150ms |' })
}

// ── 小工具:把一行 class 字串切成 class token(含變體鏈)────────────────────────────────
// 抓所有含 `animate-` 的 class token;變體鏈 = 最後一個 `:` 之前(arbitrary 變體 [&…] 裡的 `:` 不切)
const splitVariants = (token) => {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of token) {
    if (ch === '[') depth++
    if (ch === ']') depth--
    if (ch === ':' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return { variants: parts.slice(0, -1), utility: parts.at(-1) }
}
const ANIMATE_TOKEN = /(?<![\w-])((?:[\w-]+:|[\w-]*\[[^\]\s]*\]:)*!?animate-[\w-]+!?)/g
// 不提高權重的變體:媒體查詢類(含 motion-safe / motion-reduce / print / 斷點 / contrast)
const NON_SPECIFIC = /^(motion-safe|motion-reduce|print|sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|max-2xl|contrast-more|contrast-less|portrait|landscape|forced-colors)$/
const STATE_GATED_OPEN_CLOSE = /^animate-(in|out|collapsible-(up|down)|accordion-(up|down))$/

// 註解不算宣告:檔頭說明「修前長什麼樣」不該被當成宣告(Tailwind 雖然也會掃到註解,但沒有元素掛它)。
// 區塊註解 /* … */ 換成等長空白(保留行號);行註解只認行首或空白後的 `//`(網址裡的 `https://` 不算)。
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|\s)\/\/.*$/gm, (m, lead) => lead)

// ── M1 ──────────────────────────────────────────────────────────────────────
{
  const unsafe = []
  const outsideSsot = []
  let animateTokens = 0
  for (const f of codeFiles) {
    const lines = stripComments(f.text).split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(ANIMATE_TOKEN)) {
        const token = m[1]
        const { variants, utility } = splitVariants(token)
        const u = utility.replace(/!/g, '')
        if (u === 'animate-none') continue
        animateTokens++
        const raising = variants.filter((v) => !NON_SPECIFIC.test(v))
        if (raising.length && variants[0] !== 'motion-safe') unsafe.push(`${f.path}:${i + 1} ${token}`)
        const inSsot = /^packages\/design-system\/src\/tokens\/motion\/[^/]+\.ts$/.test(f.path) || f.path.startsWith('__selftest__/tokens/motion/')
        if (STATE_GATED_OPEN_CLOSE.test(u) && variants.some((v) => /data-\[state=/.test(v)) && !inSsot) outsideSsot.push(`${f.path}:${i + 1} ${token}`)
      }
    })
  }
  if (codeFiles.length === 0 || animateTokens === 0) instrument.push(`M1 掃到 ${codeFiles.length} 個程式檔、${animateTokens} 個 animate-* —— 什麼都沒驗到`)
  ck('M1a', unsafe.length === 0, `提高權重的變體上的 animate-* 都包在 motion-safe: 底下(掃 ${codeFiles.length} 檔、${animateTokens} 個 animate-*;motion-reduce:animate-none 的 (0,1,0) 贏不了它們,待辦總帳 T7)`, unsafe)
  ck('M1b', outsideSsot.length === 0, 'data-state 開合動畫(animate-in / -out / -collapsible-* / -accordion-*)只住在 tokens/motion 的 SSOT(元件只寫幾何)', outsideSsot)
}

// ── 解析 tokens/motion/*.ts 的字串常數(含 `${NAME}` 代換)──────────────────────────────
const consts = new Map()
const exported = []
for (const f of motionTs) {
  for (const m of f.text.matchAll(/(export\s+)?const\s+(\w+)\s*=\s*(?:'([^']*)'|`([^`]*)`|"([^"]*)")/g)) {
    const name = m[2]
    consts.set(name, m[3] ?? m[4] ?? m[5] ?? '')
    if (m[1]) exported.push({ name, path: f.path })
  }
}
const expand = (value, depth = 0) => depth > 5 ? value : value.replace(/\$\{(\w+)\}/g, (_, n) => (consts.has(n) ? expand(consts.get(n), depth + 1) : `\${${n}}`))
const holdValue = consts.get('holdClosedEndState')
const ssot = exported.map((e) => ({ ...e, raw: consts.get(e.name), value: expand(consts.get(e.name)) }))
  .filter((e) => /animate-/.test(e.value))

// ── M2 ──────────────────────────────────────────────────────────────────────
{
  if (ssot.length === 0) instrument.push('M2 tokens/motion 底下找不到任何宣告動畫的 SSOT 常數')
  // 共用的「關閉保持」本身不存在 / 被改掉 = 收尾沒有住所 → M2 紅(不是儀器失效:這正是要守的東西)
  const holdBroken = !holdValue || !/data-\[state=closed\]:fill-mode-forwards/.test(holdValue)
    ? [`tokens/motion/closed-end-state.ts holdClosedEndState 不存在或不是「data-[state=closed]:fill-mode-forwards」(${holdValue ?? '缺'})`] : []
  const missing = ssot.filter((e) => /data-\[state=closed\]:animate-/.test(e.value) && !(holdValue && e.value.includes(holdValue)))
    .map((e) => `${e.path} ${e.name}`)
  const unsafeInSsot = ssot.flatMap((e) => [...e.value.matchAll(ANIMATE_TOKEN)].map((m) => m[1]).filter((t) => !t.startsWith('motion-safe:') && !/animate-none/.test(t)).map((t) => `${e.path} ${e.name}: ${t}`))
  ck('M2', holdBroken.length === 0 && missing.length === 0 && unsafeInSsot.length === 0, `SSOT 常數(${ssot.map((e) => e.name).join(' / ') || '0 個'})宣告關閉動畫就帶 holdClosedEndState,動畫一律 motion-safe:(待辦總帳 T6 / T7)`, [...holdBroken, ...missing.map((m) => `${m} 缺 holdClosedEndState`), ...unsafeInSsot])
}

// ── M3 ──────────────────────────────────────────────────────────────────────
{
  const pluginAnimations = new Set([...twAnimate.matchAll(/--animate-([\w-]+)\s*:/g)].map((m) => m[1]))
  const pluginKeyframes = new Set([...twAnimate.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))
  if (!twAnimate || pluginAnimations.size === 0) instrument.push('M3 讀不到 tw-animate-css 的動畫清單(node_modules/tw-animate-css/dist/tw-animate.css)')
  const dup = []
  for (const f of cssFiles) {
    f.text.split('\n').forEach((line, i) => {
      const u = line.match(/@utility\s+animate-([\w-]+)/)
      if (u && pluginAnimations.has(u[1])) dup.push(`${f.path}:${i + 1} @utility animate-${u[1]}(tw-animate-css 已有 --animate-${u[1]})`)
      const k = line.match(/@keyframes\s+([\w-]+)/)
      if (k && pluginKeyframes.has(k[1])) dup.push(`${f.path}:${i + 1} @keyframes ${k[1]}(tw-animate-css 已有同名 keyframe)`)
    })
  }
  ck('M3', dup.length === 0, `DS 的 CSS 不重宣告 tw-animate-css 已有的動畫(外掛 ${pluginAnimations.size} 個 animate-* / ${pluginKeyframes.size} 個 keyframe;掃 ${cssFiles.length} 個 CSS 檔,待辦總帳 T8)`, dup)
}

// ── M4 ──────────────────────────────────────────────────────────────────────
const tokenValues = new Map([...motionCss.matchAll(/(--motion-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
{
  if (tokenValues.size === 0) instrument.push('M4 motion.css 讀不到任何 --motion-* token')
  const bad = []
  for (const e of ssot) {
    const d = e.value.match(/\[--tw-duration:var\((--motion-duration-[\w-]+)\)\]/)
    if (!d) bad.push(`${e.path} ${e.name} 沒有綁 [--tw-duration:var(--motion-duration-*)](= 吃 tw-animate-css 的預設時長)`)
    else if (!tokenValues.has(d[1])) bad.push(`${e.path} ${e.name} 綁的 ${d[1]} 不在 motion.css`)
  }
  ck('M4', bad.length === 0, `每個 SSOT 常數的時長綁 motion.css 的 --motion-duration-* token(${ssot.length} 個常數)`, bad)
}

// ── M5 ──────────────────────────────────────────────────────────────────────
{
  let refs = 0
  const bad = []
  for (const f of specFiles) {
    f.text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/`(--motion-(?:duration|delay)-[\w-]+)`\s*(?:=\s*)?(\d+(?:\.\d+)?)\s*(ms|s)\b/g)) {
        refs++
        const declared = tokenValues.get(m[1])
        const written = `${m[2]}${m[3]}`
        const toMs = (v) => (v?.endsWith('ms') ? parseFloat(v) : v?.endsWith('s') ? parseFloat(v) * 1000 : NaN)
        if (declared == null) bad.push(`${f.path}:${i + 1} ${m[1]} 不在 motion.css`)
        else if (toMs(declared) !== toMs(written)) bad.push(`${f.path}:${i + 1} ${m[1]} 寫 ${written},motion.css 是 ${declared}`)
      }
    })
  }
  if (refs === 0) instrument.push('M5 規格裡找不到任何「`--motion-*` N ms」寫法 —— 什麼都沒驗到')
  ck('M5', bad.length === 0, `規格裡寫明毫秒數的 motion token 引用都與 motion.css 同值(${refs} 處)`, bad)
}

// ── 判定 ─────────────────────────────────────────────────────────────────────
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.id} ${r.msg}`)
  for (const d of r.detail.slice(0, 40)) console.log(`    ${d}`)
  if (r.detail.length > 40) console.log(`    …另 ${r.detail.length - 40} 筆`)
}
if (instrument.length) {
  for (const line of instrument) console.error(`✗ INSTRUMENT-FAIL ${line}`)
  process.exit(2)
}
if (SELFTEST) {
  // 每一條都要紅在**注入的那一筆**上(__selftest__/…),不是紅在 repo 本來就有的問題上 —— 後者證明不了量具抓得到這個形狀
  const missed = ['M1a', 'M1b', 'M2', 'M3', 'M4', 'M5'].filter((id) => {
    const r = results.find((x) => x.id === id)
    return !r || r.ok || !r.detail.some((d) => d.includes('__selftest__/'))
  })
  if (missed.length === 0) { console.log('\n✓ selftest:五種舊形狀讓 M1a / M1b / M2 / M3 / M4 / M5 全紅,量具會紅'); process.exit(0) }
  console.log(`\n✗ selftest:${missed.join(', ')} 沒有紅 —— 那幾條量具沒在量它宣稱的東西`)
  process.exit(1)
}
const failed = results.filter((r) => !r.ok)
if (failed.length) { console.log(`\n✗ 開合動畫 SSOT:${failed.length} 條不符`); process.exit(1) }
console.log('\n✓ 開合動畫 SSOT:只住在 tokens/motion、一律 motion-safe、關閉保持最後一格、不重宣告外掛動畫、時長綁 token、規格與 token 同值')
