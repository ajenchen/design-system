#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 12 色相的 categorical map 名實一致、無漏色相、引用的 token 都存在;實心底字色照「實心底字色原則」分桶
 *         (白字對比不低於綠色 → 白、低於 → 深,門檻由 primitives 現算,CAT_SOLID / CAT_SOLID_TOKENS / 檔頭實測表 / tag.spec.md 色彩對照表四處一致,
 *         深字桶深字對比 ≥ 3:1),沒有元件自己寫死實心底的字色;而且色階號碼 = 離所在底色多遠
 *         (淺色號碼越大越深、深色號碼越大越亮,每一種底上都成立,深色每一階都比底亮)。
 *   紅: 把某色相偷換成別的色相 → I1 指名該 map 與色相並紅;把深色 step-2 退回往純黑退的舊公式 → I5 指名色相、底與哪兩階並紅;
 *       turquoise 放回深字 / amber 改白字 → I4 指名該 map 與色相並紅;綠色調暗到比橘色暗 → 門檻跟著上移、I4 指名 orange 換桶並紅;
 *       amber 調暗跨過門檻 → I4 換桶格紅並寫明「需 user 確認」;寫死 orange-6 底配 text-white → I6 指名檔:行並紅
 *       (test-categorical-color-invariants.mjs 全部對照都跑)。
 *   綠: 現行色票全綠。不是抽籤 —— 純靜態解析 primitives.css / semantic.css / categorical-color.ts / tag.spec.md 並用固定公式算色,
 *       掃描是檔案系統走訪,沒有瀏覽器、沒有時間相依,同一份 worktree 重複跑結果恆等。
 */
// categorical-color-invariants.mjs — 守 categorical 色相 SSOT 的不變條件:
//   (I1) 1:1 名實一致(零 offset):map 的 key X 的值只能引用 X 的色相 token
//        ——`--color-X-*`(bg/border/text)或 `--X-hover` / `--X-active`(互動)。
//        根治「red variant 接 --color-deep-orange」這類 categorical-vs-semantic 混淆。
//   (I2) 完整性:全 12 色相(CATEGORICAL_HUES)都必出現在每個 map(無漏色相)。
//   (I3) Token 存在性:categorical-color.ts 引用的每個 `var(--token)` 都必在
//        primitives.css / semantic.css 真實定義(catch typo / 不存在的 token,如 lime-hover scare)。
//   (I4) 實心底字色原則(2026-11-26 user 決定):白字對比不低於綠色 → 白字、低於 → 深字,兩個模式各自比,
//        門檻由 primitives 現算;詳見下方 I4 段。
//   (I5) 色階順序:號碼 = 離所在底色多遠。
//   (I6) 類別色實心底的字色不得寫死:元件 / 範例同一行自己配 step-6 底與字色 → 紅(改用 CAT_SOLID / CAT_SOLID_TOKENS)。
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
// 8 個 categorical map:CAT_SUBTLE / CAT_SOLID / CAT_INTERACT / CAT_SUBTLE_TOKENS /
// CAT_SOLID_TOKENS / CAT_EVENT / CAT_EVENT_OPEN(Calendar 詳情開著的那一段維持滑過色,2026-11-26 加)/ CAT_ACCENT。neutral 非色相,不在 map(consumer 自處理),不檢查。
const MAP_NAMES = ['CAT_SUBTLE', 'CAT_SOLID', 'CAT_INTERACT', 'CAT_SUBTLE_TOKENS', 'CAT_SOLID_TOKENS', 'CAT_EVENT', 'CAT_EVENT_OPEN', 'CAT_ACCENT']

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

// ── I4 實心底字色原則(2026-11-26 user 決定;原則全文與原話 → categorical-color.ts「實心底字色原則」)──
//    白字對比不低於綠色 → 白字(--on-emphasis);低於綠色 → 深字(--on-emphasis-dark = black-a85,15% 底色合成)。
//    淺色、深色兩個模式各自比較;門檻 = 綠色 step-6 在該模式的白字對比,**每次由 primitives 現算,不寫死數字**
//    (綠色亮度一動,門檻跟著動)。兩個方向都驗:≥ 門檻卻是深字、< 門檻卻是白字都紅;綠色本身恆白(它就是門檻)。
//    逐格:
//      門檻         —— 綠色兩個模式的白字對比(每次都印出來,對照組靠它看出門檻是現算的)
//      分桶         —— 兩個模式答案不同(一個 ≥ 門檻、一個 <)= 原則無法決定 → 紅,交 user 決定
//      檔頭登記     —— categorical-color.ts 檔頭實測表的字色 = 現算的桶;不同 = primitives 讓它換桶 = 畫面變化,需 user 確認(閘不自動換)
//                      檔頭表的數值 = 現算值(±0.005);不同 = 檔頭內容過期
//      實作         —— CAT_SOLID 與 CAT_SOLID_TOKENS 的字色 = 現算的桶(兩張 map 都驗)
//      深字對比     —— 深字桶的深字對比 ≥ 3:1(2026-06-04 user「以最低為原則」的大粗字門檻,深字桶照舊)
//      規格表       —— tag.spec.md「Subtle vs Solid 色彩對照」solid 文字欄 = 現算的桶(2026-07-16 起規格寫白、程式寫深,兩邊對不上沒人發現)
//    根因(2026-11-26):舊 I4 是固定 3:1 + green 白名單,失敗訊息叫人「換深字 / 白字」—— 2026-07-16 turquoise 就是照這句被 AI
//    自行換成深字(那次 user 核准的只有深色 turquoise 色相修正)。新訊息一律寫明:字色分桶是 user 決定的原則,原則要改是產品決策。
const prim = readFileSync(PRIMITIVES, 'utf8')
const lightStart = prim.indexOf(':root, [data-theme] {')
const darkStart = prim.indexOf('[data-theme="dark"] {')
const THEME_SRC = { light: prim.slice(lightStart, darkStart), dark: prim.slice(darkStart) }
const MODE_LABEL = { light: '淺', dark: '深' }
const SOLID_TEXT_REFERENCE = 'green' // 原則的基準色相(user 接受的最低白字對比);不是例外清單
const TAG_SPEC = join(ROOT, 'packages/design-system/src/components/Tag/tag.spec.md')
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
/** 某模式某色相 step-6 上的白字 / 深字(black-a85 疊在底上)對比;解析不到 = null */
function solidContrasts(mode, h) {
  const m = THEME_SRC[mode].match(new RegExp(`--color-${h}-6:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`))
  if (!m) return null
  const linBg = oklchToLinear(+m[1], +m[2], +m[3]), Ybg = relLum(linBg)
  const txt = linBg.map(lin2srgb).map((x) => 0.15 * x)
  return { white: contrast(1, Ybg), dark: contrast(relLum(txt.map(srgb2lin)), Ybg) }
}
const MODES = ['light', 'dark']
const measured = Object.fromEntries(MODES.map((mode) => [mode, Object.fromEntries(HUES.map((h) => [h, solidContrasts(mode, h)]))]))
const threshold = Object.fromEntries(MODES.map((mode) => [mode, measured[mode][SOLID_TEXT_REFERENCE]?.white ?? NaN]))
const fmtPair = (pair) => MODES.map((mode) => `${MODE_LABEL[mode]} ${Number.isFinite(pair[mode]) ? pair[mode].toFixed(2) : '?'}`).join(' / ')
const thresholdText = `綠色白字對比 ${fmtPair(threshold)}`
rec('I4', `門檻(${thresholdText},由 primitives 現算)`, MODES.every((mode) => Number.isFinite(threshold[mode])), `解析不到 --color-${SOLID_TEXT_REFERENCE}-6`)
const PRINCIPLE_NOTE = '字色分桶是 user 決定的原則(categorical-color.ts「實心底字色原則」,2026-11-26),不是本閘可調的門檻;原則本身要改 = 產品／UI／UX 決策(AGENTS.md#canonical-decision-authority),先問 user'
const BUCKET_CHANGE_NOTE = '換桶 = 畫面變化,需 user 確認後才同時改檔頭表、CAT_SOLID 與 CAT_SOLID_TOKENS(閘不自動換,確認前不得改字色)'
const bucketWord = (b) => (b === 'white' ? '白' : '深')
const textBucket = (entry) => (/on-emphasis-dark/.test(entry) ? 'dark' : /on-emphasis\b/.test(entry) ? 'white' : 'unknown')

// 檔頭登記表:` *   | 色相 | 淺 白字 | 深 白字 | 字 |` 之下每列 ` *   | orange | 2.51 | 2.24 | 白 |`
const registered = {}
for (const m of src.matchAll(/^\s*\*\s*\|\s*([a-z-]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(白|深)/gm)) {
  registered[m[1]] = { light: +m[2], dark: +m[3], bucket: m[4] === '白' ? 'white' : 'dark' }
}
const solidBlock = extractMapBlock('CAT_SOLID')
const solidTokensBlock = extractMapBlock('CAT_SOLID_TOKENS')
const tagSpec = readFileSync(TAG_SPEC, 'utf8')
const tagTableStart = tagSpec.indexOf('### Subtle vs Solid 色彩對照')
const tagTable = tagTableStart === -1 ? '' : tagSpec.slice(tagTableStart, tagSpec.indexOf('\n\n**', tagTableStart))
rec('I4', 'tag.spec.md 找得到「Subtle vs Solid 色彩對照」表', tagTable.length > 0, '段名改了就同步改本閘的 TAG_SPEC 段名')
const expectedBucket = {}
for (const h of HUES) {
  const pair = Object.fromEntries(MODES.map((mode) => [mode, measured[mode][h]?.white ?? NaN]))
  if (!MODES.every((mode) => Number.isFinite(pair[mode]))) { rec('I4', `${h} 找得到兩個模式的 step-6`, false, '解析 primitives.css 失敗'); continue }
  const whiteModes = MODES.filter((mode) => pair[mode] >= threshold[mode])
  if (whiteModes.length === 1) {
    rec('I4', `${h} 分桶`, false, `兩個模式答案不同:白字對比 ${fmtPair(pair)},門檻(${thresholdText})—— 只有${MODE_LABEL[whiteModes[0]]}色達門檻,原則無法決定。${PRINCIPLE_NOTE}`)
    continue
  }
  const bucket = whiteModes.length === 2 ? 'white' : 'dark'
  expectedBucket[h] = bucket
  const why = `白字對比 ${fmtPair(pair)},門檻(${thresholdText})`
  rec('I4', `${h} 分桶 = ${bucketWord(bucket)}字(${why})`, true)

  // 檔頭登記:字色 = 現算的桶(換桶要 user 確認)、數值 = 現算值
  const reg = registered[h]
  const moved = reg && reg.bucket !== bucket
  rec('I4', `categorical-color.ts 檔頭實測表登記 ${h}`, !!reg, '檔頭「實心底字色原則」實測表少這一列')
  if (reg) {
    rec('I4', `${h} 換桶檢查:檔頭登記 ${bucketWord(reg.bucket)}字 = 現算 ${bucketWord(bucket)}字`, !moved,
      `primitives 讓 ${h} 從${bucketWord(reg.bucket)}字桶換到${bucketWord(bucket)}字桶(${why})。${BUCKET_CHANGE_NOTE}`)
    const stale = MODES.filter((mode) => Math.abs(reg[mode] - pair[mode]) > 0.005)
    rec('I4', `${h} 檔頭實測值 = 現算值`, stale.length === 0,
      `檔頭登記 ${fmtPair(reg)},現算 ${fmtPair(pair)} —— 檔頭內容過期,照現算值更新數字(數字更新不等於換桶;換桶看上一格)`)
  }

  // 實作:兩張 map 的字色 = 現算的桶
  for (const [mapName, block] of [['CAT_SOLID', solidBlock], ['CAT_SOLID_TOKENS', solidTokensBlock]]) {
    const actual = textBucket(entryFor(block ?? '', h) ?? '')
    rec('I4', `${mapName}.${h} 字色 = ${bucketWord(bucket)}字`, actual === bucket,
      moved
        ? `${mapName}.${h} 是${actual === 'unknown' ? '無法辨識的' : bucketWord(actual)}字;現算${bucketWord(bucket)}字,但這是換桶(見同色相換桶格)。${BUCKET_CHANGE_NOTE}`
        : `${mapName}.${h} 是${actual === 'unknown' ? '無法辨識的' : bucketWord(actual)}字,依原則應為${bucketWord(bucket)}字(${why})。${PRINCIPLE_NOTE}`)
  }
  if (h === SOLID_TEXT_REFERENCE) rec('I4', `${h} 是基準色,恆為白字`, bucket === 'white', '基準色自己的白字對比恆等於門檻,不可能落在深字桶 —— 量具壞了')

  // 深字桶:深字對比 ≥ 3:1
  if (bucket === 'dark') {
    const darkPair = Object.fromEntries(MODES.map((mode) => [mode, measured[mode][h].dark]))
    rec('I4', `${h} 深字對比 ≥ 3:1(${fmtPair(darkPair)})`, MODES.every((mode) => darkPair[mode] >= 3), `深字對比 ${fmtPair(darkPair)} 不足 3:1 —— 深字也救不了,底色本身要調,屬產品決策,先問 user`)
  }

  // 規格表:tag.spec.md solid 文字欄
  const row = tagTable.split('\n').find((line) => new RegExp(`^\\|\\s*${h}\\s*\\|`).test(line))
  const cells = row ? row.split('|').map((c) => c.trim()).filter(Boolean) : []
  const specBucket = cells.length ? textBucket(cells[cells.length - 1]) : 'missing'
  rec('I4', `tag.spec.md 色彩對照表 ${h} 的 solid 文字 = ${bucketWord(bucket)}字`, specBucket === bucket,
    specBucket === 'missing' ? '表裡找不到這一列' : `規格寫${specBucket === 'unknown' ? '無法辨識的' : bucketWord(specBucket)}字,現算${bucketWord(bucket)}字 —— 規格與程式要同一份(${moved ? BUCKET_CHANGE_NOTE : PRINCIPLE_NOTE})`)
}

// 每次都印:門檻(對照組靠它看出門檻是現算的)+ 每個色相兩個模式的白字對比與桶
const measurementTable = [
  `I4 門檻 = ${thresholdText}(由 primitives 現算)`,
  ...HUES.map((h) => {
    const pair = Object.fromEntries(MODES.map((mode) => [mode, measured[mode][h]?.white ?? NaN]))
    return `  ${h.padEnd(12)} 白字 ${fmtPair(pair)} → ${expectedBucket[h] ? bucketWord(expectedBucket[h]) + '字' : '無法決定'}`
  }),
].join('\n')

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

// ── I6 類別色實心底的字色不得寫死(2026-11-26,user「請確保整個 ds 此類邏輯配色的地方都按這個 ssot」)──
//    同一行裡出現「類別色 step-6 當底」+「自己寫的字色」= 繞過 CAT_SOLID / CAT_SOLID_TOKENS 自己配字,原則一改它不會跟著改。
//    底:`bg-[var(--color-X-6)]`、`background(Color): 'var(--color-X-6)'`、`bg: 'var(--color-X-6)'`;
//    字:`text-white` / `text-black` / `text-on-emphasis(-dark)` / `text-[var(--…)]`、`color:`、`text:`。
//    掃 DS 原始碼、apps、template(不含 node_modules / dist);categorical-color.ts 本身是 SSOT,不掃。
//    特例 → 同一行 `@cat-solid-ok: <理由>`(與 check_consumer_app_invariants.sh C5 同一個記號)。
//    對照組:CATEGORICAL_COLOR_SCAN_EXTRA 指一個暫存檔(寫死 orange-6 底配 text-white)→ 必紅並指名那一行。
const SCAN_ROOTS = ['packages/design-system/src', 'apps', 'template']
const SCAN_SKIP = new Set(['node_modules', 'dist', 'storybook-static', '.git'])
const HUE_ALT = HUES.map((h) => h.replace('-', '\\-')).join('|')
const SOLID_BG_RE = new RegExp(`bg-\\[var\\(--color-(?:${HUE_ALT})-6\\)\\]|(?:background(?:Color)?|\\bbg)\\s*:\\s*['"\`]var\\(--color-(?:${HUE_ALT})-6\\)`)
const HARD_TEXT_RE = /\btext-(?:white|black|on-emphasis(?:-dark)?|\[var\(--[a-z0-9-]+\)\])(?![\w-])|(?<![A-Za-z])color\s*:|\btext\s*:\s*['"`]/
const { readdirSync, statSync } = await import('node:fs')
function* walk(dir) {
  let names
  try { names = readdirSync(dir) } catch { return }
  for (const name of names) {
    if (SCAN_SKIP.has(name)) continue
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) yield* walk(p)
    else if (/\.(tsx?|jsx?|mjs|css)$/.test(name)) yield p
  }
}
const scanFiles = [...SCAN_ROOTS.flatMap((r) => [...walk(join(ROOT, r))]), ...(process.env.CATEGORICAL_COLOR_SCAN_EXTRA ? [process.env.CATEGORICAL_COLOR_SCAN_EXTRA] : [])]
  .filter((p) => p !== SSOT)
let scannedFiles = 0
const hardcoded = []
for (const file of scanFiles) {
  scannedFiles++
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (SOLID_BG_RE.test(line) && HARD_TEXT_RE.test(line) && !line.includes('@cat-solid-ok:')) hardcoded.push(`${file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file}:${i + 1}`)
  })
}
rec('I6', `類別色實心底的字色不寫死(掃 ${scannedFiles} 個檔)`, scannedFiles > 0 && hardcoded.length === 0,
  scannedFiles === 0 ? '一個檔都沒掃到 = 量具壞了'
    : `${hardcoded.join('、')} 在同一行自己配了實心底的字色 → 改用 CAT_SOLID / CAT_SOLID_TOKENS(字色由 categorical-color.ts「實心底字色原則」決定);真的是特例 → 同一行 @cat-solid-ok: <理由>`)

// ── Output ──
console.log('\n=== Categorical Color SSOT Invariants ===')
console.log(measurementTable + '\n')
console.log(`PASS: ${passes.length}   FAIL: ${failures.length}\n`)
if (failures.length) {
  console.log(failures.join('\n'))
  console.error(`\n✗ ${failures.length} invariant(s) failed — categorical 色相 SSOT 偏移 / 漏色相 / 漏 token。Block.`)
  process.exit(1)
}
console.log(`✓ All ${passes.length} categorical-color invariants pass(${HUES.length} 色相 × ${MAP_NAMES.length} map,1:1 零 offset + token 存在性).`)
process.exit(0)
