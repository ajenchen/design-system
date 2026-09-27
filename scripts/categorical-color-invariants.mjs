#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 12 色相的 categorical map 名實一致、無漏色相、引用的 token 都存在、實心底的字對比 ≥ 3:1,
 *         而且色階號碼 = 離所在底色多遠(淺色號碼越大越深、深色號碼越大越亮,每一種底上都成立,深色每一階都比底亮)。
 *   紅: 把某色相偷換成別的色相 → I1 指名該 map 與色相並紅;把深色 step-2 退回往純黑退的舊公式 → I5 指名色相、底與哪兩階並紅
 *       (test-categorical-color-invariants.mjs 兩組對照都跑)。
 *   綠: 現行色票全綠。不是抽籤 —— 純靜態解析 primitives.css / semantic.css / categorical-color.ts 並用固定公式算色,
 *       沒有瀏覽器、沒有時間相依,同一份 worktree 重複跑結果恆等。
 */
// categorical-color-invariants.mjs — 守 categorical 色相 SSOT 的 4 條不變條件:
//   (I1) 1:1 名實一致(零 offset):map 的 key X 的值只能引用 X 的色相 token
//        ——`--color-X-*`(bg/border/text)或 `--X-hover` / `--X-active`(互動)。
//        根治「red variant 接 --color-deep-orange」這類 categorical-vs-semantic 混淆。
//   (I2) 完整性:全 12 色相(CATEGORICAL_HUES)都必出現在每個 map(無漏色相)。
//   (I3) Token 存在性:categorical-color.ts 引用的每個 `var(--token)` 都必在
//        primitives.css / semantic.css 真實定義(catch typo / 不存在的 token,如 lime-hover scare)。
//   (I4) Solid 文字對比:CAT_SOLID 每 hue 的 on-solid 文字(白 --on-emphasis / 深 --on-emphasis-dark)
//        實測 WCAG contrast 必 ≥3:1(oklch→相對亮度,green documented exception exempt)。
//
// 改 categorical-color.ts / 加色相必跑此 script。fail → exit 1。
// Run: `node scripts/categorical-color-invariants.mjs`(deterministic audit chain)。

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SSOT = join(ROOT, 'packages/design-system/src/tokens/categorical-color.ts')
// 對照組用:meta-test 以環境變數指向「舊版 / 故意弄壞」的 primitives 副本(唯讀,不寫 repo 檔)
const PRIMITIVES = process.env.CATEGORICAL_COLOR_PRIMITIVES ?? join(ROOT, 'packages/design-system/src/tokens/color/primitives.css')
const SEMANTIC = join(ROOT, 'packages/design-system/src/tokens/color/semantic.css')

const src = readFileSync(SSOT, 'utf8')
const failures = []
const passes = []
const rec = (id, label, pass, detail = '') =>
  pass ? passes.push(`✓ ${id} | ${label}`) : failures.push(`✗ ${id} | ${label}${detail ? ' | ' + detail : ''}`)

// ── 解析 CATEGORICAL_HUES(從 SSOT 自身取,避免 drift)──
const huesBlock = src.match(/export const CATEGORICAL_HUES\s*=\s*\[([\s\S]*?)\]\s*as const/)
if (!huesBlock) { console.error('✗ 無法解析 CATEGORICAL_HUES'); process.exit(1) }
const HUES = [...huesBlock[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
rec('I2', `CATEGORICAL_HUES 解析出 12 色相`, HUES.length === 12, `got ${HUES.length}: ${HUES.join(',')}`)

// ── 解析每個 map 的 block(export const NAME...= { ... }) ──
// 7 個 categorical map:CAT_SUBTLE / CAT_SOLID / CAT_INTERACT / CAT_SUBTLE_TOKENS /
// CAT_SOLID_TOKENS / CAT_EVENT / CAT_ACCENT。neutral 非色相,不在 map(consumer 自處理),不檢查。
const MAP_NAMES = ['CAT_SUBTLE', 'CAT_SOLID', 'CAT_INTERACT', 'CAT_SUBTLE_TOKENS', 'CAT_SOLID_TOKENS', 'CAT_EVENT', 'CAT_ACCENT']

function extractMapBlock(name) {
  // 從 `export const NAME` 到該宣告的第一個 top-level `}` 收尾(map 內無巢狀 { 除了 CAT_INTERACT 的 { hover, active })。
  const start = src.indexOf(`export const ${name}`)
  if (start === -1) return null
  // 找該 const 的 `= {` 起點,然後配對大括號
  const eq = src.indexOf('= {', start)
  if (eq === -1) return null
  let depth = 0, i = eq + 2
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return src.slice(eq + 3, i - 1)
}

// 取某 hue 在 map block 內的「該行 / 該 entry」原始字串
function entryFor(block, hue) {
  // key 可能是 `blue:` 或 `'deep-orange':`
  const re = new RegExp(`(?:^|\\n)\\s*(?:'${hue}'|${hue})\\s*:\\s*([^\\n]*)`, 'g')
  const m = re.exec(block)
  return m ? m[1] : null
}

for (const name of MAP_NAMES) {
  const block = extractMapBlock(name)
  if (block === null) { rec('parse', `map ${name} 存在`, false, '找不到 export const'); continue }

  // I2 完整性:12 色相皆在
  for (const h of HUES) {
    const entry = entryFor(block, h)
    rec('I2', `${name} 含色相 ${h}`, entry !== null)
    if (entry === null) continue

    // I1 1:1:該 entry 引用的所有色相 token 都必 === h
    if (name === 'CAT_INTERACT') {
      // 值形如 { hover: 'var(--blue-hover)', active: 'var(--blue-active)' }
      const refs = [...entry.matchAll(/--([a-z-]+)-(hover|active)\b/g)].map((m) => m[1])
      const bad = refs.filter((r) => r !== h)
      rec('I1', `${name}.${h} 互動 token 名實一致`, refs.length === 2 && bad.length === 0,
        bad.length ? `引用了 ${bad.join(',')} 的 hover/active(應為 ${h})` : `refs=${refs.length}(應 2)`)
    } else {
      // bg/border/text class 或 token:抓所有 --color-XXX-N,每個 XXX 必 === h
      const refs = [...entry.matchAll(/--color-([a-z-]+)-\d/g)].map((m) => m[1])
      const bad = refs.filter((r) => r !== h)
      rec('I1', `${name}.${h} 色相 token 名實一致(零 offset)`, refs.length >= 1 && bad.length === 0,
        bad.length ? `引用了 --color-${bad.join(',')}-*(應為 --color-${h}-*)` : `無 --color-${h}-* 引用`)
    }
  }
}

// ── I3 Token 存在性:SSOT 引用的每個 var(--token) 都必在 CSS 定義 ──
const cssDefs = new Set()
for (const f of [PRIMITIVES, SEMANTIC]) {
  const css = readFileSync(f, 'utf8')
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) cssDefs.add(m[1])
}
const referenced = new Set([...src.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))
// neutral / 通用 semantic token(--secondary 等)亦在 CSS;若有不在 CSS 的 → 漏定義
for (const tok of referenced) {
  rec('I3', `引用 token ${tok} 已在 CSS 定義`, cssDefs.has(tok), '未在 primitives.css / semantic.css 找到定義')
}

// ── I4 Solid 文字對比:CAT_SOLID 每個 hue 的 on-solid 文字(白/深)實測對比必 ≥3:1(大粗字門檻)──
//    2026-06-04 user「以最低為原則」= WCAG large/bold 3:1。white=--on-emphasis(Y=1),
//    dark=--on-emphasis-dark(=black-a85,15% 底色合成)。green 為 documented exception(知情違反,exempt)。
//    機械驗 = oklch→相對亮度→contrast,禁肉眼。新增亮色 hue 配白字 → 此 gate 自動攔。
const SOLID_TEXT_EXEMPT = new Set(['green']) // ★ user 拍板維持白字的知情例外
const prim = readFileSync(PRIMITIVES, 'utf8')
const oklchToLinear = (L, C, H) => {
  const hr = (H * Math.PI) / 180, a = C * Math.cos(hr), b = C * Math.sin(hr)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map((v) => Math.min(1, Math.max(0, v)))
}
const lin2srgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
const srgb2lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const relLum = ([R, G, B]) => 0.2126 * R + 0.7152 * G + 0.0722 * B
const contrast = (y1, y2) => { const a = Math.max(y1, y2), b = Math.min(y1, y2); return (a + 0.05) / (b + 0.05) }
const solidBlock = extractMapBlock('CAT_SOLID')
for (const h of HUES) {
  const oklchs = [...prim.matchAll(new RegExp(`--color-${h}-6:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`, 'g'))].map((m) => [+m[1], +m[2], +m[3]])
  const entry = entryFor(solidBlock, h) || ''
  const isDark = /on-emphasis-dark/.test(entry) // 深字桶
  if (SOLID_TEXT_EXEMPT.has(h)) { rec('I4', `CAT_SOLID.${h} 對比(documented exception,exempt)`, true); continue }
  let worst = Infinity
  for (const o of oklchs) {
    const linBg = oklchToLinear(...o), Ybg = relLum(linBg)
    let c
    if (isDark) { const txt = linBg.map(lin2srgb).map((x) => 0.15 * x); c = contrast(relLum(txt.map(srgb2lin)), Ybg) } // black-a85 over bg
    else c = contrast(1, Ybg) // white
    worst = Math.min(worst, c)
  }
  rec('I4', `CAT_SOLID.${h} on-solid ${isDark ? '深字' : '白字'} 對比 ≥3:1`, worst >= 3.0, `實測最差 ${worst.toFixed(2)}(<3:1 → 應換${isDark ? '白' : '深'}字)`)
}

// ── I5 色階順序(2026-09-26):號碼 = 離所在底色多遠 ──────────────────────────────────────────
//    淺色號碼越大越深、深色號碼越大越亮(Adobe Spectrum 同派,color.spec.md「Dark mode subtle」)。
//    直接解析 primitives.css 的每一行公式(淺色 = `:root, [data-theme]` 區、深色 = `[data-theme="dark"]` 區),
//    算出每一階疊在各種底上的實際顏色 → 與底的 WCAG 對比必須隨號碼嚴格上升;深色每一階都必須比底亮。
//    底色 = 實測值(淺:白 #FFFFFF、滑過中的格 #FAFAFA;深:頁面 #0A0A0A、卡片 #1E1E1E、浮層 #1F1F1F、滑過中的格 #272727)。
//    半透明照瀏覽器在 sRGB 空間混色。2026-09-26 前深色 step-2..4 往純黑退 → 12 色全紅;改成淡底公式後全綠。
const LADDER_BGS = {
  light: { '白': [255, 255, 255], '滑過中的格': [250, 250, 250] },
  dark: { '頁面': [10, 10, 10], '卡片': [30, 30, 30], '浮層': [31, 31, 31], '滑過中的格': [39, 39, 39] },
}
const lightStart = prim.indexOf(':root, [data-theme] {')
const darkStart = prim.indexOf('[data-theme="dark"] {')
const THEME_SRC = { light: prim.slice(lightStart, darkStart), dark: prim.slice(darkStart) }
const oklchToSrgb255 = (L, C, H) => oklchToLinear(L, C, H).map(lin2srgb).map((v) => v * 255)
function stepColor(block, hue, n, base) {
  const m = block.match(new RegExp(`--color-${hue}-${n}:\\s*oklch\\(from var\\(--color-${hue}-6\\) ([^;]+)\\);`))
  if (!m) return null
  const [L, C, H] = base
  const expr = m[1].trim()
  let t
  if ((t = expr.match(/^l c h \/ calc\(([\d.]+) \/ l\)$/))) return { rgb: oklchToSrgb255(L, C, H), alpha: Math.min(1, +t[1] / L) }
  if ((t = expr.match(/^calc\(l \* ([\d.]+)\) calc\(c \* ([\d.]+)\) h$/))) return { rgb: oklchToSrgb255(L * +t[1], C * +t[2], H), alpha: 1 }
  if ((t = expr.match(/^calc\(l \+ \(1 - l\) \* ([\d.]+)\) calc\(c \* ([\d.]+)\) h$/))) return { rgb: oklchToSrgb255(L + (1 - L) * +t[1], C * +t[2], H), alpha: 1 }
  return { unparsed: expr }
}
const lumOf255 = (rgb) => relLum(rgb.map((v) => srgb2lin(v / 255)))
for (const theme of ['light', 'dark']) {
  const block = THEME_SRC[theme]
  for (const h of HUES) {
    const bm = block.match(new RegExp(`--color-${h}-6:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`))
    if (!bm) { rec('I5', `${theme} ${h} 找得到基準色 step-6`, false, '解析失敗'); continue }
    const base = [+bm[1], +bm[2], +bm[3]]
    for (const [bgName, bg] of Object.entries(LADDER_BGS[theme])) {
      const yBg = lumOf255(bg)
      const seq = []
      let parseProblem = ''
      for (let n = 1; n <= 10; n++) {
        const s = n === 6 ? { rgb: oklchToSrgb255(...base), alpha: 1 } : stepColor(block, h, n, base)
        if (!s || s.unparsed) { parseProblem = `step-${n} 公式無法解析:${s ? s.unparsed : '找不到'}`; break }
        const shown = s.rgb.map((v, i) => s.alpha * v + (1 - s.alpha) * bg[i])
        const y = lumOf255(shown)
        seq.push({ n, y, c: contrast(y, yBg) })
      }
      if (parseProblem) { rec('I5', `${theme} ${h} @${bgName} 公式可解析`, false, parseProblem); continue }
      const bad = []
      for (let i = 1; i < seq.length; i++) {
        if (!(seq[i].c > seq[i - 1].c)) bad.push(`step-${seq[i].n}(${seq[i].c.toFixed(2)}) 沒有比 step-${seq[i - 1].n}(${seq[i - 1].c.toFixed(2)}) 離底更遠`)
      }
      if (theme === 'dark') for (const s of seq) if (!(s.y > yBg)) bad.push(`step-${s.n} 比底暗`)
      rec('I5', `${theme} ${h} @${bgName}:號碼越大、與底色對比越高${theme === 'dark' ? '、每一階都比底亮' : ''}`, bad.length === 0, bad.join(';'))
    }
  }
}

// ── Output ──
console.log('\n=== Categorical Color SSOT Invariants ===')
console.log(`PASS: ${passes.length}   FAIL: ${failures.length}\n`)
if (failures.length) {
  console.log(failures.join('\n'))
  console.error(`\n✗ ${failures.length} invariant(s) failed — categorical 色相 SSOT 偏移 / 漏色相 / 漏 token。Block.`)
  process.exit(1)
}
console.log(`✓ All ${passes.length} categorical-color invariants pass(12 色相 × 7 map,1:1 零 offset + token 存在性).`)
process.exit(0)
