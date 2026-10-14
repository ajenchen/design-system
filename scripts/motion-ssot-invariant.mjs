#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 全 DS 的開合動畫(data-state 驅動的浮層進出場與原地展開收合)只由 tokens/motion 底下的 SSOT 宣告,而且
 *         (M1)任何會提高權重的變體(data-[state=…]、group-*、aria-*、hover、[&…] 等)上的 animate-* 都包在 motion-safe: 底下
 *             —— 減少動態不再靠 `motion-reduce:animate-none` 去跟它比權重(待辦總帳 T7);data-state 開合動畫只准住在 SSOT;
 *         (M2)SSOT 裡宣告了關閉動畫的常數,一定帶「關閉狀態保持最後一格」(holdClosedEndState,待辦總帳 T6);
 *         (M3)DS 自己的 CSS 不重宣告 tw-animate-css 已有的同名 keyframe / animate-* 工具類(兩份宣告各寫各的值,待辦總帳 T8);
 *         (M4)每個 SSOT 常數的時長綁 motion.css 的 `--motion-duration-*` token,不吃外掛預設;
 *         (M5)規格裡「`--motion-duration-X` N ms」這種寫法的 N 必須等於 motion.css 的值(規格與 token 不得各寫各的);
 *         (M1c)「打開」的判準只有一個 = 不是 closed:`data-[state=open]:` 開頭的進場動畫 / 進場幾何(animate-in、fade-in、zoom-in、
 *             slide-in-from、spin-in、blur-in)一律紅 —— Radix Tooltip 打開是 delayed-open / instant-open,那樣寫對它永遠不成立(待辦總帳 T10);
 *         (M6)跟著開合狀態旋轉的箭頭,時長與曲線跟它打開的東西是同一份(motion.spec.md「展開箭頭跟它打開的東西同步」,AI 建議「乙」、user 2026-10-07 採納,原話見 motion.spec.md):
 *             M6a 會轉的那個元素的 class 消費 disclosureIndicatorMotion / overlayIndicatorMotion;M6b 同一處不得再寫字面的
 *             transition / duration / ease(會蓋掉 SSOT);M6c 旋轉寫在會轉的元素本身,不從父層用 `[&…>svg]:rotate-*` 去轉別人
 *             (過渡跟旋轉分住兩個元素,閘就看不到它們是不是同一份),而且角度看自己那顆觸發鈕的狀態 —— 不用「任一層祖先」
 *             (`[[data-state=open]_&]`、`in-*`、不具名 `group-*`;Sidebar 群組箭頭原本這樣寫,住進 SheetContent 就被轉成朝上);M6d SSOT 裡箭頭常數的時長 / 曲線與內容常數逐項相等
 *             (原地展開:disclosureIndicatorMotion ≡ disclosureMotion;浮層:overlayIndicatorMotion 打開 / 收起 ≡ overlayMotion 進場 / 出場);
 *             M6e 每處箭頭用的是 motion.spec.md 該段消費者表替它登記的那一組(表上每列一組常數 + 各消費者的 `file:line`;以檔案對應,
 *             同一檔登記在兩列時取離旋轉最近的那一行)—— 用了另一組、檔案不在表上(未登記的新箭頭)、表上登記的那一行附近找不到箭頭(登記過期)都紅
 *   紅: --selftest 對 M1–M6 各注入一個舊形狀(TreeView 修前那串 `data-[state=closed]:animate-collapsible-up … motion-reduce:animate-none`、
 *       少了 holdClosedEndState 的 SSOT 常數、舊 base.css 的 `@utility animate-collapsible-up { … 150ms … }`、不綁時長的 SSOT 常數、
 *       規格寫錯的毫秒數、Tooltip 修前的 `data-[state=open]:fade-in-0`、1ef86547 的三種箭頭寫法(TreeView `transition-transform duration-150`、
 *       Select 裸 `transition-transform`、Accordion 父層 `[&[data-state=open]>svg]:rotate-180`)、時長 150ms 的箭頭常數、
 *       側欄群組形狀的箭頭登記在原地展開那一列卻吃 `overlayIndicatorMotion(true)`、未登記的新箭頭、登記了卻沒有箭頭的一行),每條各自必須紅在注入的那一筆;
 *       少一條沒紅 → exit 1。`--root=<修前的樹>` 直接跑:M1 / M2 / M3 / M4 紅(待辦總帳 T6–T8);`--root=<1ef86547>`:M1c / M6a / M6b / M6c / M6d / M6e 紅
 *   綠: 沒弄壞時必須綠;每一條都要先證明有東西可驗(掃到的檔案數、SSOT 常數數、外掛動畫名數、規格裡的 token 引用數、旋轉箭頭數都 > 0),
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
// M6e 的登記簿:motion.spec.md「展開箭頭跟它打開的東西同步」的消費者表
const MOTION_SPEC = 'packages/design-system/src/tokens/motion/motion.spec.md'

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
  // M1c:Tooltip 修前的進場幾何(1ef86547 tooltip.tsx:105)
  codeFiles.push({ path: '__selftest__/tooltip-before.tsx', text: 'const t = cn(overlayMotion, "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0")' })
  // M6a / M6b:1ef86547 的 TreeView 與 Select 箭頭(字面時長 / 裸 transition-transform,沒消費 SSOT)
  codeFiles.push({ path: '__selftest__/tree-chevron-before.tsx', text: "const a = <ItemInlineActionButton icon={ChevronRight} iconClassName={cn('transition-transform duration-150 motion-reduce:duration-0', isExpanded && 'rotate-90')} />" })
  codeFiles.push({ path: '__selftest__/select-chevron-before.tsx', text: "const b = <ChevronDown size={iconSize} className={cn('text-fg-muted transition-transform motion-reduce:duration-0', open && 'rotate-180')} aria-hidden />" })
  // M6c:1ef86547 的 Accordion —— 旋轉寫在父層、轉的是子元素;Sidebar —— 角度看任一層祖先(就算已消費 SSOT 也紅)
  codeFiles.push({ path: '__selftest__/accordion-trigger-before.tsx', text: 'const c = <Trigger className={cn("flex flex-1", "[&[data-state=open]>svg]:rotate-180", className)} />' })
  codeFiles.push({ path: '__selftest__/sidebar-chevron-ancestor.tsx', text: 'const e = <ItemInlineActionButton icon={ChevronDown} iconClassName={cn(disclosureIndicatorMotion, "[[data-state=open]_&]:rotate-180")} />' })
  // M6d:箭頭常數的時長跟內容不同(1ef86547 AgentPanel 思考塊箭頭 150ms、內容 200ms)
  motionTs.push({ path: '__selftest__/tokens/motion/indicator-150.ts', text: "export const disclosureIndicatorMotion = 'motion-safe:transition-transform [--tw-duration:var(--motion-duration-overlay)] [--tw-ease:ease-out]'" })
  // M6e:(1)側欄群組的形狀,登記在消費者表「原地展開」那一列,卻吃浮層常數(150ms)—— M6a–M6d 全綠也必須紅;
  //      (2)未登記的新箭頭;(3)表上登記了、程式裡卻沒有箭頭的一行(登記過期)。登記是改表的文字,判定照常從表讀
  codeFiles.push({ path: '__selftest__/sidebar-chevron-wrong-set.tsx', text: 'const g = <ItemInlineActionButton icon={ChevronDown} iconClassName={cn(overlayIndicatorMotion(true), "[[data-state=open]>&]:rotate-180")} />' })
  codeFiles.push({ path: '__selftest__/unregistered-chevron.tsx', text: "const h = <ChevronDown className={cn(disclosureIndicatorMotion, expanded && 'rotate-180')} aria-hidden />" })
  const spec = specFiles.find((f) => f.path === MOTION_SPEC)
  if (spec) {
    spec.text = spec.text
      .replace(/^(\|[^|\n]*\|[^|\n]*`disclosureIndicatorMotion`[^\n]*?)(\s*\|\s*)$/m, '$1、selftest(`__selftest__/sidebar-chevron-wrong-set.tsx:1`)$2')
      .replace(/^(\|[^|\n]*\|[^|\n]*`overlayIndicatorMotion\(open\)`[^\n]*?)(\s*\|\s*)$/m, '$1、selftest(`__selftest__/removed-chevron.tsx:1`)$2')
  }
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
// 一段變體(含 arbitrary 變體裡再一層中括號,例 `[[data-state=open]_&]:`、`group-data-[state=open]/agent-thinking:`)
const VARIANT = String.raw`(?:[\w-]*(?:\[(?:[^\[\]\s]|\[[^\]\s]*\])*\])?(?:\/[\w-]+)?:)`
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

// ── M1c ─────────────────────────────────────────────────────────────────────
// 進場動畫 / 進場幾何的打開判準不得寫 data-[state=open](Radix Tooltip 打開是 delayed-open / instant-open)
{
  const ENTER = /^-?(animate-in|fade-in|zoom-in|slide-in-from|spin-in|blur-in)(-|$)/
  const TOKEN = new RegExp(String.raw`(?<![\w-])(${VARIANT}+-?(?:animate-in|fade-in|zoom-in|slide-in-from|spin-in|blur-in)[\w-]*)`, 'g')
  const bad = []
  let enterTokens = 0
  for (const f of [...codeFiles, ...motionTs]) {
    stripComments(f.text).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(TOKEN)) {
        const { variants, utility } = splitVariants(m[1])
        if (!ENTER.test(utility)) continue
        enterTokens++
        if (variants.some((v) => /^data-\[state=open\]$/.test(v))) bad.push(`${f.path}:${i + 1} ${m[1]}(打開判準要寫 not-data-[state=closed])`)
      }
    })
  }
  if (enterTokens === 0) instrument.push('M1c 掃不到任何帶狀態變體的進場動畫 / 進場幾何 —— 什麼都沒驗到')
  ck('M1c', bad.length === 0, `進場動畫 / 進場幾何的打開判準 = 不是 closed,沒有 data-[state=open](${enterTokens} 個;Radix Tooltip 打開是 delayed-open / instant-open,待辦總帳 T10)`, bad)
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

// ── M6 箭頭旋轉 ─────────────────────────────────────────────────────────────────
// owner:motion.spec.md「展開箭頭跟它打開的東西同步」。「跟著開合狀態旋轉」= rotate-* 的變體鏈含 state=open / closed / aria-expanded / expanded,
// 或 rotate-* 字串前面是 `<名字含 open / expanded> &&` / `? `。單位 = 這個 rotate 所在的那一個 `*className=` 屬性值(找不到屬性就退回該行)。
{
  const INDICATORS = /\b(disclosureIndicatorMotion|overlayIndicatorMotion)\b/
  const ROTATE = new RegExp(String.raw`(?<![\w.$-])(${VARIANT}*-?rotate-(?:\d+|\[[^\]\s]+\]))`, 'g')
  const OPEN_VARIANT = /state=(open|closed)|aria-expanded|expanded|(^|-)open$/i
  const LITERAL_TIMING = new RegExp(String.raw`(?<![\w-])(${VARIANT}*(?:transition(?:-transform|-all|-\[[^\]\s]*\])?(?![\w-])|duration-[\w.()[\]-]+|ease-[\w.()[\]-]+|\[--tw-(?:duration|ease):[^\]\s]+\]))`, 'g')
  // 從 idx 往回找最近的 `xxxClassName=` / `className=`,算出它的值的範圍;idx 落在裡面就以它為單位
  const unitAt = (text, idx) => {
    const re = /\b\w*[cC]lassName\s*=\s*/g
    let best = null
    for (const m of text.matchAll(re)) { if (m.index < idx) best = m; else break }
    if (best) {
      const start = best.index + best[0].length
      const open = text[start]
      let end = -1
      if (open === '"' || open === "'") end = text.indexOf(open, start + 1)
      else if (open === '{') {
        let depth = 0
        for (let k = start; k < text.length; k++) {
          const ch = text[k]
          if (ch === '{') depth++
          else if (ch === '}') { depth--; if (depth === 0) { end = k; break } }
        }
      }
      if (end >= idx) return text.slice(best.index, end + 1)
    }
    const ls = text.lastIndexOf('\n', idx) + 1
    const le = text.indexOf('\n', idx)
    return text.slice(ls, le === -1 ? undefined : le)
  }
  const a = [], b = [], c = []
  const chevrons = []
  let rotating = 0
  for (const f of codeFiles) {
    if (/^packages\/design-system\/src\/tokens\/motion\//.test(f.path)) continue
    const text = stripComments(f.text)
    const lineOf = (idx) => text.slice(0, idx).split('\n').length
    for (const m of text.matchAll(ROTATE)) {
      const token = m[1]
      const { variants } = splitVariants(token)
      const lineStart = text.lastIndexOf('\n', m.index) + 1
      const before = text.slice(lineStart, m.index)
      const conditional = /[\w.$]*(?:open|expanded)[\w.$]*\s*(?:&&|\?)\s*['"`][^'"`]*$/i.test(before)
      const stateGated = variants.some((v) => OPEN_VARIANT.test(v))
      if (!conditional && !stateGated) continue
      rotating++
      const where = `${f.path}:${lineOf(m.index)}`
      const unit = unitAt(text, m.index)
      if (!INDICATORS.test(unit)) a.push(`${where} ${token}(沒有消費 disclosureIndicatorMotion / overlayIndicatorMotion)`)
      chevrons.push({ file: f.path, line: lineOf(m.index), where, token, used: new Set([...unit.matchAll(new RegExp(INDICATORS.source, 'g'))].map((x) => x[1])) })
      const literal = [...unit.matchAll(LITERAL_TIMING)].map((x) => x[1])
      if (literal.length) b.push(`${where} ${token} 旁邊寫了字面的 ${literal.join(' ')}`)
      // 變體裡的 arbitrary 選擇器若 & 後面還有東西(`[&[data-state=open]>svg]`、`[&_svg]`)或用 `*:` → 轉的是別的元素
      if (variants.some((v) => (/^\[.*&.+\]$/.test(v) && !/&\]$/.test(v)) || v === '*' || v === '**')) c.push(`${where} ${token}(旋轉寫在父層、轉的是子元素)`)
      // 角度的依據是「任一層祖先」:arbitrary 變體裡 & 前面是後代組合子(`_&` / 空白)、in-*、不具名的 group-*
      else if (variants.some((v) => /^\[.*[_\s]&\]$/.test(v) || /^in-/.test(v) || (/^group-/.test(v) && !/\/[\w-]+$/.test(v)))) c.push(`${where} ${token}(看的是任一層祖先的狀態,不是自己那顆觸發鈕)`)
    }
  }
  if (rotating === 0) instrument.push('M6 掃不到任何跟著開合狀態旋轉的箭頭 —— 什麼都沒驗到')
  ck('M6a', a.length === 0, `跟著開合狀態旋轉的箭頭消費 SSOT 的箭頭常數(${rotating} 處)`, a)
  ck('M6b', b.length === 0, '旋轉箭頭旁邊不另寫字面的 transition / duration / ease(會蓋掉 SSOT 的時長與曲線)', b)
  ck('M6c', c.length === 0, '旋轉寫在會轉的元素本身(過渡與旋轉同一個元素,閘才看得到它們是同一份),角度看自己那顆觸發鈕的狀態(不是任一層祖先)', c)

  // M6d:SSOT 裡箭頭常數與內容常數的時長 / 曲線逐項相等
  const paths = new Map()
  for (const f of motionTs) for (const m of f.text.matchAll(/const\s+(\w+)\s*=/g)) paths.set(m[1], f.path)
  const val = (n) => (consts.has(n) ? expand(consts.get(n)) : null)
  const at = (n) => `${paths.get(n) ?? 'tokens/motion'} ${n}`
  const dur = (v) => v?.match(/(?:^|\s)\[--tw-duration:([^\]\s]+)\]/)?.[1] ?? null
  const easeBare = (v) => v?.match(/(?:^|\s)\[--tw-ease:([^\]\s]+)\]/)?.[1] ?? null
  const easeOn = (v, variant) => v?.match(new RegExp(`(?:^|\\s)${variant.replace(/[[\]]/g, '\\$&')}:\\[--tw-ease:([^\\]\\s]+)\\]`))?.[1] ?? null
  const d = []
  const same = (label, x, y, nx, ny) => { if (x == null || y == null || x !== y) d.push(`${label}:${at(nx)} = ${x ?? '缺'} / ${at(ny)} = ${y ?? '缺'}`) }
  const safeOnly = (n) => { const v = val(n); if (v == null) d.push(`${at(n)} 不存在(箭頭沒有住所)`); else if (!/(?:^|\s)motion-safe:transition-transform(?:\s|$)/.test(v) || /(?:^|\s)transition-transform(?:\s|$)/.test(v)) d.push(`${at(n)} 的旋轉過渡沒有只宣告在 motion-safe: 底下(${v})`) }
  const content = val('disclosureMotion'), ind = val('disclosureIndicatorMotion')
  safeOnly('disclosureIndicatorMotion')
  same('原地展開 時長', dur(ind), dur(content), 'disclosureIndicatorMotion', 'disclosureMotion')
  same('原地展開 曲線', easeBare(ind), easeBare(content) ?? 'ease-out', 'disclosureIndicatorMotion', 'disclosureMotion')
  const overlay = val('overlayMotion'), openI = val('OVERLAY_INDICATOR_OPEN'), closedI = val('OVERLAY_INDICATOR_CLOSED')
  safeOnly('OVERLAY_INDICATOR_OPEN'); safeOnly('OVERLAY_INDICATOR_CLOSED')
  same('浮層 時長(打開)', dur(openI), dur(overlay), 'OVERLAY_INDICATOR_OPEN', 'overlayMotion')
  same('浮層 時長(收起)', dur(closedI), dur(overlay), 'OVERLAY_INDICATOR_CLOSED', 'overlayMotion')
  same('浮層 曲線(打開 = 進場)', easeBare(openI), easeOn(overlay, 'not-data-[state=closed]') ?? easeOn(overlay, 'data-[state=open]'), 'OVERLAY_INDICATOR_OPEN', 'overlayMotion')
  same('浮層 曲線(收起 = 出場)', easeBare(closedI), easeOn(overlay, 'data-[state=closed]'), 'OVERLAY_INDICATOR_CLOSED', 'overlayMotion')
  const fn = motionTs.find((f) => /export const overlayIndicatorMotion\s*=\s*\(\s*open[^)]*\)\s*=>\s*\(?\s*open\s*\?\s*OVERLAY_INDICATOR_OPEN\s*:\s*OVERLAY_INDICATOR_CLOSED/.test(f.text))
  if (!fn) d.push('tokens/motion overlayIndicatorMotion 不是「open ? OVERLAY_INDICATOR_OPEN : OVERLAY_INDICATOR_CLOSED」(打開 / 收起各吃哪組曲線沒有住所)')
  ck('M6d', d.length === 0, 'SSOT 的箭頭常數與它打開的東西同一個時長與曲線(原地展開 ≡ disclosureMotion;浮層打開 / 收起 ≡ overlayMotion 進場 / 出場)', d)

  // M6e:每處箭頭用的是消費者表替它登記的那一組。M6a 只問「有沒有消費箭頭常數」,原地展開的箭頭吃浮層常數(150ms)它照樣綠;
  // 哪一處屬於哪一組,住在 motion.spec.md 那張表(每列一組常數 + 消費者的 `file:line`),閘從表讀,不在這裡另抄一份清單。
  // 表上的路徑以 packages/design-system/src 為根(也接受 repo 根相對路徑);同一檔登記在兩列(AgentPanel 歷史 + 思考塊)時取離旋轉最近的那一行。
  // 空表不算儀器失效而是紅:上面已確保旋轉箭頭數 > 0,登記簿讀不到 → 每一處都「未登記」,不可能假綠。
  const e = []
  const reg = []
  const FAMILIES = ['disclosureIndicatorMotion', 'overlayIndicatorMotion']
  const known = new Set(codeFiles.map((f) => f.path))
  const specLines = (specFiles.find((f) => f.path === MOTION_SPEC)?.text ?? '').split('\n')
  const secStart = specLines.findIndex((l) => /^## 展開箭頭跟它打開的東西同步/.test(l))
  const secEnd = secStart < 0 ? -1 : specLines.findIndex((l, i) => i > secStart && /^## /.test(l))
  const sec = secStart < 0 ? [] : specLines.slice(secStart, secEnd < 0 ? undefined : secEnd)
  const cells = (l) => l.split('|').slice(1, -1).map((x) => x.trim())
  const hi = sec.findIndex((l) => l.startsWith('|') && l.includes('箭頭常數') && l.includes('消費者'))
  if (hi < 0) e.push(`${MOTION_SPEC} 找不到「展開箭頭跟它打開的東西同步」的消費者表(表頭含「箭頭常數」「消費者」)—— 箭頭該用哪一組沒有登記簿`)
  else {
    const head = cells(sec[hi])
    const colConst = head.findIndex((x) => x.includes('箭頭常數'))
    const colUse = head.findIndex((x) => x.includes('消費者'))
    for (let i = hi + 1; i < sec.length && sec[i].startsWith('|'); i++) {
      if (/^\|[\s:|-]+\|$/.test(sec[i])) continue
      const row = cells(sec[i])
      const family = row[colConst]?.match(new RegExp(`\\b(${FAMILIES.join('|')})\\b`))?.[1]
      if (!family) { e.push(`${MOTION_SPEC}:${secStart + i + 1} 消費者表這一列沒寫它是哪一組箭頭常數`); continue }
      for (const m of (row[colUse] ?? '').matchAll(/`([\w./-]+\.(?:tsx?|jsx?)):(\d+)`/g)) {
        const file = [m[1], `packages/design-system/src/${m[1]}`].find((p) => known.has(p)) ?? `packages/design-system/src/${m[1]}`
        reg.push({ file, line: Number(m[2]), family, claimed: false })
      }
    }
  }
  for (const ch of chevrons) {
    const mine = reg.filter((r) => r.file === ch.file)
    if (mine.length === 0) { e.push(`${ch.where} 未登記:${ch.token} 所在的檔案不在 motion.spec.md「展開箭頭跟它打開的東西同步」的消費者表 —— 新的旋轉箭頭先登記它打開的是原地展開還是浮層`); continue }
    const near = mine.reduce((p, r) => (Math.abs(r.line - ch.line) < Math.abs(p.line - ch.line) ? r : p))
    near.claimed = true
    const wrong = [...ch.used].filter((n) => n !== near.family)
    if (wrong.length) e.push(`${ch.where} 用錯箭頭常數:消費者表登記為 ${near.family}(${near.file}:${near.line}),這裡用的是 ${wrong.join(' / ')}`)
  }
  for (const r of reg) if (!r.claimed) e.push(`${r.file}:${r.line} 登記過期:消費者表登記了這一行(${r.family}),這個檔案裡卻沒有任何跟著開合狀態旋轉的箭頭以它為最近的登記`)
  ck('M6e', e.length === 0, `每處旋轉箭頭用的是 motion.spec.md 消費者表替它登記的那一組(原地展開 → disclosureIndicatorMotion、浮層 → overlayIndicatorMotion;登記 ${reg.length} 處,未登記的新箭頭與登記過期都紅)`, e)
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
  // 同一條注入了好幾種舊形狀的,每一種都要點名到(只紅其中一種 = 另一種量具沒在量)
  const REQUIRED = { M6a: ['tree-chevron-before', 'select-chevron-before', 'accordion-trigger-before'], M6b: ['tree-chevron-before', 'select-chevron-before'], M6c: ['accordion-trigger-before', 'sidebar-chevron-ancestor'], M6e: ['sidebar-chevron-wrong-set.tsx:1 用錯箭頭常數', 'unregistered-chevron.tsx:1 未登記', 'removed-chevron.tsx:1 登記過期'] }
  const missed = ['M1a', 'M1b', 'M1c', 'M2', 'M3', 'M4', 'M5', 'M6a', 'M6b', 'M6c', 'M6d', 'M6e'].filter((id) => {
    const r = results.find((x) => x.id === id)
    return !r || r.ok || !r.detail.some((d) => d.includes('__selftest__/')) || (REQUIRED[id] ?? []).some((k) => !r.detail.some((d) => d.includes(`__selftest__/${k}`)))
  })
  if (missed.length === 0) { console.log('\n✓ selftest:注入的舊形狀讓 M1a / M1b / M1c / M2 / M3 / M4 / M5 / M6a / M6b / M6c / M6d / M6e 全紅,量具會紅'); process.exit(0) }
  console.log(`\n✗ selftest:${missed.join(', ')} 沒有紅 —— 那幾條量具沒在量它宣稱的東西`)
  process.exit(1)
}
const failed = results.filter((r) => !r.ok)
if (failed.length) { console.log(`\n✗ 開合動畫 SSOT:${failed.length} 條不符`); process.exit(1) }
console.log('\n✓ 開合動畫 SSOT:只住在 tokens/motion、一律 motion-safe、打開判準 = 不是 closed、關閉保持最後一格、不重宣告外掛動畫、時長綁 token、規格與 token 同值、旋轉箭頭用的是消費者表登記的那一組箭頭常數(原地展開 / 浮層)且箭頭常數與內容同一份時長與曲線')
