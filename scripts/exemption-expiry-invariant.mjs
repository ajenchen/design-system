#!/usr/bin/env node
/**
 * 豁免標記到期複查 —— exemption-expiry-invariant(2026-09-27,待辦總帳 OE23;
 * 來源 governance/planning/2026-07-31-outstanding-work-inventory.md §3 :296
 * 「`code-quality-allow`、`as any`/`as unknown as`、`eslint-disable` 尚無到期複查機制」)
 *
 * ## 為什麼需要
 *
 * 每一個豁免標記都是「這裡先不照規矩來」的一筆債:寫的時候有理由,半年後沒人記得理由還成不成立。
 * 既有的 `check_escape_marker_abuse.sh`(write-time hook)只管兩件事:標記後面要有理由(非空)、同檔 / 全 repo
 * 的數量上限。它**不管時間** —— 一個 2026-05 寫下的 `@benchmark-unverified-blanket` 到 2027 年還是同一句話,
 * 沒有任何機制會把它翻出來問「還要不要」。這支閘補的就是那個時鐘。
 *
 * ## 判準(要保證的性質,逐字):每個豁免標記都說得出「什麼時候有人看過它」或「誰在管它」
 *
 *   1. 標記帶 **日期**(ISO `YYYY-MM-DD`,取該標記窗格裡最新的一個)= 上次複查日 → 時鐘從那天起算,
 *      超過 REVIEW_AFTER_DAYS 天 → **過期**(kind = expired)。複查後把日期改成複查日(或在後面補一個新日期)即歸零。
 *   2. 標記只有 **指標**、沒有日期 = 有主無鐘(kind = pointer-only):由指標的主人負責複查
 *      (M-rule 由 /knowledge-prune 季檢、spec 由其 owner、待辦總帳項由總帳)。**不紅**,但 --report 會列出數量,讓債看得見。
 *   3. 既沒日期也沒指標 = **無主**(kind = unanchored)→ 紅:沒人說得出這個豁免是誰、何時、憑什麼給的。
 *
 *   指標(anchor)的判準 —— 每一種都要能「點得過去」,不接受單純的文字說明:
 *   | 種類 | 判準 | 真實命中(本 repo) |
 *   |---|---|---|
 *   | M-rule | `M1`〜`M39`,前面不是 `Material`(Material M3 是設計語言版本,不是規則) | `@benchmark-unverified-blanket: … per M22 (d)`(141 處) |
 *   | 檔案路徑 | 帶副檔名(spec.md / md / tsx / ts / mjs / sh / json / css)且**在 repo 裡真的存在**;只有檔名時用全 repo 檔名索引找;指向自己不算 | `@hover-transition-allow: …(清單見 motion.spec.md「唯一的例外」)`、`@placeholder-vocabulary-allow: 2026-07-04 Q4 完成 field-controls.spec.md …` |
 *   | 待辦總帳項 | 同一窗格有「總帳」/「待辦」字樣 + 項號(如 `C5`、`OE23`) | 本閘自己的檔頭(OE23);產品標記現況 0 筆 |
 *   | PR / issue | `#` + 2〜5 位數字(前面是空白或括號;後面不是十六進位字母,避免色碼) | 現況 0 筆(對照組驗) |
 *   | commit | 7〜40 位十六進位、含至少一個字母與一個數字 | 現況 0 筆(對照組驗) |
 *   | URL | `http(s)://…`、`www.…`、`github.com/…` | field-control-group.tsx:1 的 `github.com/ant-design/…/compact-item.ts` |
 *
 * ## 掃哪些標記(2026-09-27 盤點:repo 內實際存在的格式;數字 = 產品 + apps + scripts 的命中,盤點命令在檔尾)
 *
 *   | 家族 | 形狀 | 掃描範圍 | 2026-09-27 |
 *   |---|---|---|---|
 *   | escape | `@<名>-allow / -exempt(-next) / -skip / -rationale / -ok / -unverified(-blanket) / -customized / -exception`、`@no-layout-family`,**只認註解開頭**(`//`、`/*`、`{/*`、` *`、md 的 `<!-- … -->`)| 產品 + apps 的 ts / tsx / md / css | 348(其中 @benchmark-unverified-blanket 141、@anatomy-rationale 45…)|
 *   | cq | `code-quality-allow: long-function / dead-export / file-size …`、`any-allow: …`(沒有 `@`;code-quality-audit.mjs 與 check_consumer_code_quality.sh 消費)| 產品 + apps 的 ts / tsx | 130(0 筆有日期)|
 *   | eslint | `eslint-disable(-next-line / -line)` 註解 | 產品 + apps + scripts | 24 |
 *   | ts | `@ts-ignore / @ts-expect-error / @ts-nocheck` 註解 | 同上 | 0 |
 *   | cast | 程式碼裡的 `as any`、`as unknown as`(註解與字串裡的不算;窗格 = 同行尾註解 + 上方緊接的註解行;窗格已有 any-allow 的歸 cq,不重複)| 產品 + apps + scripts 的 ts / tsx | 56(其中 12 筆有 any-allow 註解)|
 *   | allowlist | scripts 裡 `const ALLOWLIST = { KEY: '理由' }` 的每一筆(物件形;陣列形是「要納入什麼」的清單,不是豁免,不掃)| scripts/**\/*.mjs | 2 |
 *   | registry | 登記型豁免檔的 reason 欄(下方 REGISTRIES 明列;每一筆是「把某支閘 / 某支腳本排除在某個機制外」)| 4 個 JSON | 6 |
 *
 *   **不在範圍、而且為什麼**:
 *   · scripts 裡的 `@…-allow` 家族 37 筆全是偵測器的定義 / 說明文字 / selftest 注入的字串(逐筆看過),沒有任何檢查器會在 scripts 裡認這些標記 → 不掃。
 *   · `GOVERNANCE_BYPASS_*`(75 筆)是 commit 當下的環境變數,hook 會寫進 governance-bypass.jsonl 稽核帳,程式碼裡沒有殘留可以到期 → 不是本閘的對象。
 *   · `skip-worktree` 是 git index 的位元,不是程式碼標記。
 *   · `@benchmark-cited` / `@benchmark-verified` 是「已有證據」的標記,不是豁免。
 *   · md 裡寫在反引號 / 程式碼區塊的標記(`\`// @item-gap-exempt: <reason>\``)是教學文字,不是豁免 → md 只認 `<!-- @… -->`。
 *
 * ## N = REVIEW_AFTER_DAYS = 180 天;DUE_SOON_DAYS = 30 天(只在 --report 提醒)
 *
 *   理由:豁免是治理債,repo 對同類東西已經有一套退役窗 ——
 *   packages/design-system/ds-canonical/skills/knowledge-prune/SKILL.md :230「Hook | 6 月 0 fire」、:233「Memory file | 6 月未更新」、
 *   :231「Skill | 3 月 0 invoke」、:20「季度健檢(每 3 個月跑 1 次)」;
 *   packages/design-system/ds-canonical/hooks/session_start_governance_check.sh :103(knowledge-prune HARD THRESHOLD 180 天)/ :105(target ≤ 90 天)。
 *   一個半年沒人看過的豁免,和半年沒 fire 的 hook 是同一種狀態;季檢(90 天)只當「快到期」提醒,不紅。
 *   世界級對照:eslint-plugin-unicorn `expiring-todo-comments`(`// TODO [2026-12-01]: …` 過期即 lint 紅)—— 到期紅是設計,不是誤報。
 *
 * ## 棘輪(baseline),不是一次到位
 *
 *   現況有一批既有的無主 / 過期標記(2026-09-27 --report 的數字寫在 baseline 檔),一次全紅沒有人能評估落點。
 *   所以鎖 `scripts/exemption-expiry-baseline.json`:**新增的無主 / 新過期的 = 紅**;既有的每次都印,修掉之後閘會提示 --update-baseline。
 *   數字只准往下。**key 是「家族 | 檔案 | 標記名 | 窗格內容雜湊」**,不含行號(行號會漂)——
 *   代價是:改了那個標記的字卻仍沒補日期 / 指標,它會以新 key 出現而變紅。這是刻意的:碰到它的那一刻就是補的時候。
 *
 * ## 時間是輸入,不是被驗的性質(M37 第九個形狀)
 *
 *   `--now=YYYY-MM-DD` 釘住「今天」。--selftest 的合成日期一律**相對於 now 推導**(now−181 天過期、now−180 天不過期),
 *   任何一天跑結果都一樣;meta-test 用 baseline 的 recordedAt 當 now,證明的是「儀器會紅」,不是「今天有沒有東西到期」。
 *   真正的到期警報在本閘自己的執行(CI lane 由主代理決定);沒接之前只有 --report / 手動跑會講。
 *
 * ## 用法
 *
 *   node scripts/exemption-expiry-invariant.mjs                     現況(套 baseline):新增無主 / 新過期 → exit 1
 *   node scripts/exemption-expiry-invariant.mjs --report            全貌數字(家族 × 種類、快到期、最多的檔),恆 exit 0
 *   node scripts/exemption-expiry-invariant.mjs --list              逐筆列出違規(含 baseline 裡的)
 *   node scripts/exemption-expiry-invariant.mjs --selftest          對照組:合成的無主 / 過期必抓、合法 / 有主的必放、長得像的必不算
 *   node scripts/exemption-expiry-invariant.mjs --update-baseline   清掉既有債之後重記
 *   node scripts/exemption-expiry-invariant.mjs --now=2026-09-27    釘住今天(以上任一模式都可加)
 *
 * ## M32 四問(寫完閘立刻答)
 *   1. 弄壞它會紅嗎 —— --selftest 注入 11 筆該紅(無主 9 / 過期 2)+ 14 筆該放 + 5 筆長得像的;test-exemption-expiry-invariant.mjs 再把合成違規檔塞進真實掃描證明 fresh 會紅。
 *   2. 誰呼叫它 —— scripts/test-exemption-expiry-invariant.mjs(gate-meta lane);接 PR CI 由主代理決定。
 *   3. 受不受時序影響 —— 「今天」是唯一的時間輸入,用 --now 釘住;沒有瀏覽器、沒有計時器。
 *   4. 機器慢還綠嗎 —— 純讀檔 + 正規表示式,沒有任何等待或門檻與速度有關。
 *
 * 盤點命令(2026-09-27):`grep -rnoE '@[a-z][a-z0-9-]*-(allow|exempt|…)' packages/design-system/src apps scripts | sort | uniq -c`,
 * 逐筆分類的結果寫在待辦總帳 OE23 的回報裡。
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const REVIEW_AFTER_DAYS = 180
export const DUE_SOON_DAYS = 30
export const BASELINE = join(REPO, 'scripts/exemption-expiry-baseline.json')
// 量具自己與它的 meta-test 是合成違規的家(--selftest 的 fixture 裡就有 `as any`、eslint-disable 的字樣),
// 不當被掃對象 —— 同 gate-reachability-invariant「量具自己不當呼叫者」的處理。
const SELF_FILES = new Set(['scripts/exemption-expiry-invariant.mjs', 'scripts/test-exemption-expiry-invariant.mjs'])

// ── 掃描範圍 ────────────────────────────────────────────────────────────────
const CONTENT_ROOTS = ['packages/design-system/src', 'apps']          // escape + eslint + ts + cast
const SCRIPT_ROOTS = ['scripts']                                        // eslint + ts + cast + allowlist
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'tmp', 'coverage', 'storybook-static', 'storybook-static-dev',
  'storybook-static-baseline', 'snapshots', 'snapshots-baseline', 'snapshots-devmode', 'story-screenshots', 'empty-home',
  '.ringtest', '.tw-probe', '.playwright-mcp', '.gate-bundles', 'test-fixtures', 'ref', 'reference', 'figma-plugin'])
const CONTENT_EXT = new Set(['.ts', '.tsx', '.md', '.mdx', '.css'])
const SCRIPT_EXT = new Set(['.mjs', '.cjs', '.js', '.ts', '.tsx'])

/** 登記型豁免檔:reason 欄就是理由;每一筆是「把某支閘 / 腳本排除在某個機制外」。 */
export const REGISTRIES = [
  { file: 'scripts/gate-meta-test-exclusions.json', pick: (j) => (j.entries || []).map((e) => ({ label: e.stem, reason: e.reason })) },
  { file: 'scripts/gate-reachability-baseline.json', pick: (j) => Object.entries(j.manualOnly || {}).map(([k, v]) => ({ label: k, reason: v })) },
  { file: 'scripts/hover-own-pair-baseline.json', pick: (j) => (j.entries || []).map((e) => ({ label: `${e.file}|${e.hover}|${e.rest}`, reason: e.reason })) },
  { file: 'infra/governance/providers/harness-non-governance-exclusions.json', pick: (j) => (j.entries || []).map((e) => ({ label: e.path, reason: e.reason })) },
]

// ── 標記的形狀 ──────────────────────────────────────────────────────────────
const ESCAPE_TOKEN = '@[a-z][a-z0-9-]*-(?:allow|exempt-next|exempt|skip|rationale|ok|unverified-blanket|unverified|customized|exception)\\b|@no-layout-family\\b'
const ESLINT_TOKEN = 'eslint-disable(?:-next-line|-line)?\\b'
const TS_TOKEN = '@ts-(?:ignore|expect-error|nocheck)\\b'
// 沒有 `@` 的 allow 註解:`// code-quality-allow: long-function|dead-export|file-size …`(scripts/code-quality-audit.mjs :114、
// hooks/check_consumer_code_quality.sh 消費)與 `// any-allow: …`(code-quality-audit.mjs :82 消費;它就是那個 `as any` 的豁免記錄)。
const CQ_TOKEN = '(?:code-quality|any)-allow\\b'
const CQ_RE = new RegExp(CQ_TOKEN)
// 註解開頭:`//`、`{/*`、`/*`、`/**`、block 註解的續行 ` *`。前一個字不能是字 / `@` / `$`(排除 URL 的 `//`、識別字裡的 `*`)。
const CODE_OPENER = '(?:^|[^\\w@$])(?:\\/\\/|\\{\\/\\*|\\/\\*\\*?|\\*)[ \\t]*'
const CODE_MARKER_RE = new RegExp(`${CODE_OPENER}(${ESCAPE_TOKEN}|${ESLINT_TOKEN}|${TS_TOKEN}|${CQ_TOKEN})`, 'g')
const SCRIPT_MARKER_RE = new RegExp(`${CODE_OPENER}(${ESLINT_TOKEN}|${TS_TOKEN})`, 'g')
const MD_MARKER_RE = new RegExp(`<!--[ \\t]*(${ESCAPE_TOKEN})`, 'g')
const CSS_MARKER_RE = new RegExp(`\\/\\*[ \\t]*(${ESCAPE_TOKEN})`, 'g')
const CAST_RE = /(?:^|[^\w$])(as any|as unknown as)\b/g

export const FAMILY_LABEL = {
  escape: 'escape 標記(@…-allow 家族)', cq: 'code-quality-allow / any-allow', eslint: 'eslint-disable', ts: '@ts-ignore 家族',
  cast: 'as any / as unknown as(無 allow 註解)', allowlist: 'scripts 的 ALLOWLIST 條目', registry: '登記型豁免檔',
}
export const KIND_LABEL = { ok: '有日期、未過期', 'pointer-only': '有主無鐘(只有指標)', unanchored: '無主(無日期無指標)', expired: '過期' }

// ── 日期與指標 ──────────────────────────────────────────────────────────────
const DAY = 86_400_000
const DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g

/** 窗格裡所有合法的 ISO 日期(UTC 午夜)。 */
export function datesIn(text) {
  const out = []
  for (const m of text.matchAll(DATE_RE)) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    const date = new Date(Date.UTC(y, mo - 1, d))
    if (date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) out.push(date)
  }
  return out
}

const MRULE_RE = /(?<!Material\s*)(?<![\w-])M(?:[1-9]|[1-3]\d)\b(?![-.]\d)/
const LEDGER_WORD_RE = /待辦總帳|總帳|待辦/
const LEDGER_ITEM_RE = /\b(?:OE|OD|FD|CB|INV|[A-Z])\d{1,3}(?:[-.]\d{1,2})?\b/
const PR_RE = /(?:^|[\s(（])#\d{2,5}\b(?![0-9a-fA-F])/
const URL_RE = /\b(?:https?:\/\/|www\.|github\.com\/)[^\s)）>」]+/
const SHA_RE = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/
const PATH_RE = /(?<![\w@./-])[\w@][\w@./-]*\.(?:spec\.md|md|mdx|tsx|ts|mjs|cjs|js|sh|json|css)\b/g
const PATH_BASES = ['', 'packages/design-system/src', 'packages/design-system/ds-canonical', 'scripts', 'packages/design-system']

let basenameIndex = null
/** 全 repo 檔名索引(只建一次):只有檔名的指標靠它判「存在」。 */
export function fileIndex() {
  if (basenameIndex) return basenameIndex
  basenameIndex = new Map()
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name)); continue }
      basenameIndex.set(e.name, (basenameIndex.get(e.name) || 0) + 1)
    }
  }
  walk(REPO)
  return basenameIndex
}

/**
 * 窗格裡的指標(anchor)種類與斷掉的路徑。
 * @param {string} text 窗格文字
 * @param {{ selfBase?: string, index?: Map<string, number>, exists?: (rel: string) => boolean }} [options]
 */
export function anchorsOf(text, { selfBase = '', index = fileIndex(), exists = (rel) => existsSync(join(REPO, rel)) } = {}) {
  const anchors = []
  const dangling = []
  if (MRULE_RE.test(text)) anchors.push('mrule')
  if (LEDGER_WORD_RE.test(text) && LEDGER_ITEM_RE.test(text)) anchors.push('ledger')
  if (PR_RE.test(text)) anchors.push('pr')
  if (URL_RE.test(text)) anchors.push('url')
  if (SHA_RE.test(text)) anchors.push('sha')
  let pathHit = false
  for (const m of text.matchAll(PATH_RE)) {
    const raw = m[0].replace(/^\.\//, '').replace(/^\/+/, '')
    if (basename(raw) === selfBase) continue
    if (raw.includes('/')) {
      if (PATH_BASES.some((base) => exists(base ? `${base}/${raw}` : raw))) pathHit = true
      else dangling.push(raw)
    } else if (index.has(raw)) pathHit = true
    else dangling.push(raw)
  }
  if (pathHit) anchors.push('path')
  return { anchors, dangling }
}

// ── 窗格:標記那一行 + 緊接的續行(最多 CONTINUATION 行)────────────────────
const CONTINUATION = 8
const ANY_MARKER_RE = new RegExp(`${ESCAPE_TOKEN}|${ESLINT_TOKEN}|${TS_TOKEN}|${CQ_TOKEN}`)

function commentWindow(lines, i, markerCol) {
  const first = lines[i]
  const before = first.slice(0, markerCol)
  const rest = first.slice(markerCol)
  const out = [first]
  let style = 'line'
  if (/<!--[ \t]*$/.test(before)) style = rest.includes('-->') ? 'done' : 'html'
  else if (/(\{\/\*|\/\*\*?)[ \t]*$/.test(before)) style = rest.includes('*/') ? 'done' : 'block'
  else if (/\*[ \t]*$/.test(before)) style = rest.includes('*/') ? 'done' : 'block'
  for (let j = i + 1; style !== 'done' && j < lines.length && j <= i + CONTINUATION; j++) {
    const l = lines[j], t = l.trim()
    if (ANY_MARKER_RE.test(t) && /^(\/\/|\*|\{\/\*|\/\*|<!--)/.test(t)) break        // 下一個標記自己一個窗格
    if (style === 'line') { if (!t.startsWith('//')) break; out.push(l); continue }
    if (style === 'html') { out.push(l); if (l.includes('-->')) break; continue }
    if (style === 'block') { out.push(l); if (l.includes('*/')) break; continue }
  }
  return out.join('\n')
}

// 程式碼行的「註解部分」:同行 `//` 之後;整行是註解時回整行;找不到回空字串
function trailingComment(line) {
  const t = line.trim()
  if (/^(\/\/|\*|\/\*)/.test(t)) return t
  const idx = line.indexOf('//')
  return idx >= 0 ? line.slice(idx) : ''
}
function precedingComments(lines, i, max = 3) {
  const out = []
  for (let j = i - 1; j >= 0 && j >= i - max; j--) {
    const t = lines[j].trim()
    if (!/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) break
    out.unshift(lines[j])
  }
  return out
}

// ── 掃描一份檔案文字 ────────────────────────────────────────────────────────
function ext(rel) { const m = /\.[^./]+$/.exec(rel); return m ? m[0] : '' }
function isMd(rel) { return /\.(md|mdx)$/.test(rel) }
function isCss(rel) { return /\.css$/.test(rel) }
function isTsLike(rel) { return /\.(ts|tsx)$/.test(rel) }

/**
 * @param {string} text
 * @param {string} rel 相對 repo 根的路徑(決定家族與掃法)
 * @param {{ scope?: 'content'|'script' }} [options]
 * @returns {Array<{ family: string, marker: string, file: string, line: number, window: string }>}
 */
export function scanText(text, rel, { scope = 'content' } = {}) {
  const lines = text.split('\n')
  const found = []
  const push = (family, marker, line, window) => found.push({ family, marker, file: rel, line: line + 1, window })

  if (isMd(rel)) {
    let fenced = false
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (/^\s*(```|~~~)/.test(l)) { fenced = !fenced; continue }
      if (fenced) continue
      for (const m of l.matchAll(MD_MARKER_RE)) push('escape', m[1], i, commentWindow(lines, i, m.index + m[0].length - m[1].length))
    }
    return found
  }
  if (isCss(rel)) {
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(CSS_MARKER_RE)) push('escape', m[1], i, commentWindow(lines, i, m.index + m[0].length - m[1].length))
    }
    return found
  }

  const markerRe = scope === 'script' ? SCRIPT_MARKER_RE : CODE_MARKER_RE
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    for (const m of l.matchAll(markerRe)) {
      const marker = m[1]
      const family = marker.startsWith('@ts-') ? 'ts' : marker.startsWith('eslint-disable') ? 'eslint' : marker.startsWith('@') ? 'escape' : 'cq'
      push(family, marker, i, commentWindow(lines, i, m.index + m[0].length - marker.length))
    }
    if (isTsLike(rel)) {
      const t = l.trim()
      if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) continue
      const codePart = l.replace(/\/\/.*$/, '')
      for (const m of codePart.matchAll(CAST_RE)) {
        const window = [...precedingComments(lines, i), trailingComment(l)].filter(Boolean).join('\n')
        if (CQ_RE.test(window)) continue          // 已有 any-allow / code-quality-allow 註解 → 那條註解才是豁免記錄,不重複計
        push('cast', m[1], i, window)
      }
    }
  }

  if (scope === 'script') {
    // `const ALLOWLIST = {` … `}`(物件形)的每一筆:窗格 = 該行 + 上方緊接的註解行
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*(?:export\s+)?const\s+ALLOWLIST\s*=\s*\{\s*$/.test(lines[i])) continue
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]
        if (/^\s*\}/.test(l)) break
        const entry = /^\s*(?:([A-Za-z_$][\w$]*)|'([^']+)'|"([^"]+)")\s*:/.exec(l)
        if (!entry) continue
        const key = entry[1] ?? entry[2] ?? entry[3]
        push('allowlist', `ALLOWLIST.${key}`, j, [...precedingComments(lines, j), l].join('\n'))
      }
    }
  }
  return found
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const hash12 = (s) => createHash('sha1').update(s.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12)

/** 一個標記在 now 這一天的判定。 */
export function classify(marker, now, anchorOptions = {}) {
  const dates = datesIn(marker.window)
  const newest = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
  const ageDays = newest ? Math.floor((now.getTime() - newest.getTime()) / DAY) : null
  const { anchors, dangling } = anchorsOf(marker.window, { selfBase: basename(marker.file), ...anchorOptions })
  let kind
  if (newest) kind = ageDays > REVIEW_AFTER_DAYS ? 'expired' : 'ok'
  else kind = anchors.length ? 'pointer-only' : 'unanchored'
  const dueSoon = kind === 'ok' && ageDays > REVIEW_AFTER_DAYS - DUE_SOON_DAYS
  return { ...marker, newest: newest ? newest.toISOString().slice(0, 10) : null, ageDays, anchors, dangling, kind, dueSoon }
}

function keyOf(m) { return `${m.family}|${m.file}|${m.marker}|${hash12(m.window)}` }

function walkFiles(rootRel, exts) {
  const out = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue }
      const rel = relative(REPO, p)
      if (exts.has(ext(e.name)) && !SELF_FILES.has(rel)) out.push(rel)
    }
  }
  const abs = join(REPO, rootRel)
  if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs)
  return out.sort()
}

/** 預設要掃的檔:[{ rel, scope }] */
export function defaultFiles() {
  return [
    ...CONTENT_ROOTS.flatMap((r) => walkFiles(r, CONTENT_EXT).map((rel) => ({ rel, scope: 'content' }))),
    ...SCRIPT_ROOTS.flatMap((r) => walkFiles(r, SCRIPT_EXT).map((rel) => ({ rel, scope: 'script' }))),
  ]
}

export function registryMarkers(registries = REGISTRIES) {
  const out = []
  for (const r of registries) {
    const abs = join(REPO, r.file)
    if (!existsSync(abs)) continue
    let json
    try { json = JSON.parse(readFileSync(abs, 'utf8')) } catch { continue }
    for (const e of r.pick(json)) out.push({ family: 'registry', marker: e.label, file: r.file, line: 0, window: String(e.reason ?? '') })
  }
  return out
}

export function loadBaseline(path = BASELINE) {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * 全掃描 + 判定 + 套 baseline。
 * @param {{ now: Date, files?: Array<{rel:string, scope?:string, text?:string}>, registries?: Array, baseline?: object|null, anchorOptions?: object }} options
 */
export function evaluate({ now, files = defaultFiles(), registries = REGISTRIES, baseline = loadBaseline(), anchorOptions = {} }) {
  const markers = []
  let scannedFiles = 0
  for (const f of files) {
    const text = f.text ?? (() => { try { return readFileSync(join(REPO, f.rel), 'utf8') } catch { return null } })()
    if (text === null) continue
    scannedFiles++
    markers.push(...scanText(text, f.rel, { scope: f.scope ?? 'content' }))
  }
  markers.push(...registryMarkers(registries))

  const seen = new Map()
  const classified = markers.map((m) => {
    const c = classify(m, now, anchorOptions)
    const base = keyOf(c)
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    c.key = n === 1 ? base : `${base}#${n}`
    return c
  })
  const violations = classified.filter((m) => m.kind === 'unanchored' || m.kind === 'expired')
  const known = new Set((baseline?.entries || []).map((e) => e.key))
  const fresh = violations.filter((v) => !known.has(v.key))
  const stale = [...known].filter((k) => !violations.some((v) => v.key === k))
  const malformed = baseline && baseline.reviewAfterDays !== REVIEW_AFTER_DAYS
    ? [`baseline.reviewAfterDays = ${baseline.reviewAfterDays},本閘 REVIEW_AFTER_DAYS = ${REVIEW_AFTER_DAYS}(改門檻要 --update-baseline 重記)`] : []
  return { now, scannedFiles, markers: classified, violations, fresh, stale, known, malformed, baseline }
}

/** 判定表(純函式):狀態與退出碼。 */
export function verdictOf(r) {
  if (r.scannedFiles === 0 || r.markers.length === 0) return { status: 'INSTRUMENT-FAIL', exitCode: 1 }
  if (r.malformed.length) return { status: 'MALFORMED-BASELINE', exitCode: 1 }
  if (!r.baseline) return { status: 'NO-BASELINE', exitCode: 1 }
  if (r.fresh.length) return { status: 'VIOLATION', exitCode: 1 }
  return { status: 'PASS', exitCode: 0 }
}

// ── 報表 ────────────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10)
const describe = (m) => `${m.file}${m.line ? `:${m.line}` : ''}  ${m.marker}${m.newest ? `(${m.newest},${m.ageDays} 天)` : ''}${m.dangling.length ? `  ⚠ 指到不存在的檔:${m.dangling.join(', ')}` : ''}`

export function report(r, log = console.log) {
  const families = Object.keys(FAMILY_LABEL)
  const kinds = ['ok', 'pointer-only', 'unanchored', 'expired']
  log(`豁免標記到期複查 —— 全貌(now = ${iso(r.now)},N = ${REVIEW_AFTER_DAYS} 天;掃 ${r.scannedFiles} 檔 + ${REGISTRIES.length} 個登記檔)\n`)
  log(`${'家族'.padEnd(28)} 總數  有日期未過期  有主無鐘  無主  過期`)
  for (const f of families) {
    const ms = r.markers.filter((m) => m.family === f)
    const c = Object.fromEntries(kinds.map((k) => [k, ms.filter((m) => m.kind === k).length]))
    log(`${FAMILY_LABEL[f].padEnd(28)} ${String(ms.length).padStart(4)}  ${String(c.ok).padStart(12)}  ${String(c['pointer-only']).padStart(8)}  ${String(c.unanchored).padStart(4)}  ${String(c.expired).padStart(4)}`)
  }
  const total = Object.fromEntries(kinds.map((k) => [k, r.markers.filter((m) => m.kind === k).length]))
  log(`${'合計'.padEnd(28)} ${String(r.markers.length).padStart(4)}  ${String(total.ok).padStart(12)}  ${String(total['pointer-only']).padStart(8)}  ${String(total.unanchored).padStart(4)}  ${String(total.expired).padStart(4)}`)
  const byName = new Map()
  for (const m of r.markers) if (m.family === 'escape') byName.set(m.marker, (byName.get(m.marker) || 0) + 1)
  log(`\nescape 標記名稱(次數):${[...byName.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / ')}`)
  const anchorCount = new Map()
  for (const m of r.markers) for (const a of m.anchors) anchorCount.set(a, (anchorCount.get(a) || 0) + 1)
  log(`指標種類(標記數):${[...anchorCount.entries()].map(([k, v]) => `${k} ${v}`).join(' / ') || '(無)'}`)
  const dangling = r.markers.filter((m) => m.dangling.length)
  if (dangling.length) { log(`\n指到不存在的檔(${dangling.length} 筆,不算指標):`); for (const m of dangling) log(`  ${describe(m)}`) }
  const due = r.markers.filter((m) => m.dueSoon)
  log(`\n快到期(${REVIEW_AFTER_DAYS - DUE_SOON_DAYS} < 天數 ≤ ${REVIEW_AFTER_DAYS}):${due.length} 筆`)
  for (const m of due) log(`  ${describe(m)}`)
  const byFile = new Map()
  for (const m of r.violations) byFile.set(m.file, (byFile.get(m.file) || 0) + 1)
  const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  log(`\n無主 + 過期最多的檔(前 ${top.length}):`)
  for (const [f, n] of top) log(`  ${String(n).padStart(3)}  ${f}`)
  log(`\nbaseline:${r.baseline ? `${r.baseline.count} 筆(recordedAt ${r.baseline.recordedAt})` : '(無)'};本次違規 ${r.violations.length} 筆,其中新增 ${r.fresh.length}、已修 ${r.stale.length}`)
}

// ── 對照組(--selftest):相對於 now 推導的合成檔 ─────────────────────────────
const todayUtc = () => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) }
export function selftest(now = todayUtc(), log = console.log) {
  const d = (k) => iso(new Date(now.getTime() - k * DAY))
  const tsx = [
    `// @alpha-allow: 沒有日期也沒有指標`,                                            // 1 無主
    `// @beta-allow: ${d(181)} 上次看是 181 天前`,                                      // 2 過期(邊界外一天)
    `// @gamma-allow: ${d(180)} 剛好 180 天`,                                           // ok(邊界)
    `// @delta-allow: 見 M22 (d)`,                                                      // 有主無鐘
    `// @epsilon-allow: 見 field-controls.spec.md「共享 contract」`,                     // 有主無鐘(檔名索引)
    `// @zeta-allow: 見 nonexistent-dir/never-there.spec.md`,                           // 3 無主(路徑斷掉)
    `// @eta-allow: Material M3 這樣做`,                                                // 4 無主(Material M3 不是 M-rule)
    `const RE = /@theta-allow/`,                                                        // 長得像:正規表示式,不是註解
    `// 這裡已經不需要 @iota-allow 了`,                                                 // 長得像:註解中段的提及
    `<Body>{/* @kappa-ok: list-as-region canonical,見 M17 */}</Body>`,                  // JSX 註解形,有主
    `// eslint-disable-next-line no-console`,                                           // 5 無主
    `const a = b as any`,                                                               // 6 無主(cast,沒有任何註解)
    `// ${d(10)} 第三方型別缺 export`,
    `const c = e as unknown as F`,                                                      // ok(上一行註解有日期)
    `// @lambda-rationale:`,                                                            // 續行窗格:日期在第二行
    `//   SizeMatrix N/A — ${d(5)} 看過`,
    `// @mu-allow: ${d(200)} 舊,複查 ${d(3)}`,                                          // ok:取最新日期
    `// @nu-allow: 見 (#123) 那次 PR`,                                                  // 有主(PR)
    `// @xi-allow: 由 026d5788 起`,                                                     // 有主(commit)
    `// @omicron-allow: https://example.test/why`,                                      // 有主(URL)
    `// @pi-allow: 待辦總帳 OE23 追蹤`,                                                 // 有主(總帳項)
    `// @rho-allow: 對照 #fff 這個色碼`,                                                // 7 無主(#fff 不是 PR)
    `// code-quality-allow: long-function 沒日期`,                                      // 8 無主(沒有 @ 的 allow)
    `// any-allow: ${d(3)} free-form meta bag`,
    `const q = w as any`,                                                               // ok:歸 any-allow 那條,不另算 cast
  ].join('\n')
  const md = [
    '規則 A <!-- @benchmark-unverified -->',                                            // 8 無主
    `規則 B <!-- @benchmark-unverified: ${d(1)} 補 cite -->`,                          // ok
    '```tsx', '// @sigma-allow: 教學用的程式碼區塊,不是豁免', '```',                     // 長得像:fence 裡
    '文中提到 `// @tau-exempt: <reason>` 的寫法',                                        // 長得像:反引號
  ].join('\n')
  const mjs = [
    'const ALLOWLIST = {',
    `  ONE: '沒有日期',`,                                                               // 9 無主
    `  // ${d(2)} 兩支不相干腳本`,
    `  TWO: '有日期',`,                                                                 // ok
    '}',
    '// @upsilon-allow: scripts 裡的家族標記不掃(偵測器定義)',                             // 長得像:scripts 不掃 escape 家族
  ].join('\n')
  const files = [
    { rel: 'selftest/a.tsx', scope: 'content', text: tsx },
    { rel: 'selftest/b.spec.md', scope: 'content', text: md },
    { rel: 'selftest/c.mjs', scope: 'script', text: mjs },
  ]
  const registries = [{ file: 'scripts/gate-meta-test-exclusions.json', pick: () => [{ label: 'reg-old', reason: `see M10 ${d(400)}` }, { label: 'reg-new', reason: `${d(30)} ok` }] }]
  const r = evaluate({ now, files, registries, baseline: { reviewAfterDays: REVIEW_AFTER_DAYS, entries: [] } })
  const kinds = new Map(r.markers.map((m) => [m.marker, m.kind]))
  const expect = {
    '@alpha-allow': 'unanchored', '@beta-allow': 'expired', '@gamma-allow': 'ok', '@delta-allow': 'pointer-only', '@epsilon-allow': 'pointer-only',
    '@zeta-allow': 'unanchored', '@eta-allow': 'unanchored', '@kappa-ok': 'pointer-only', 'eslint-disable-next-line': 'unanchored',
    'as any': 'unanchored', 'as unknown as': 'ok', '@lambda-rationale': 'ok', '@mu-allow': 'ok', '@nu-allow': 'pointer-only',
    '@xi-allow': 'pointer-only', '@omicron-allow': 'pointer-only', '@pi-allow': 'pointer-only', '@rho-allow': 'unanchored',
    '@benchmark-unverified': null, 'ALLOWLIST.ONE': 'unanchored', 'ALLOWLIST.TWO': 'ok', 'reg-old': 'expired', 'reg-new': 'ok',
    'code-quality-allow': 'unanchored', 'any-allow': 'ok',
  }
  const absent = ['@theta-allow', '@iota-allow', '@sigma-allow', '@tau-exempt', '@upsilon-allow']
  let bad = 0
  const check = (ok, label) => { log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++ }
  for (const [name, kind] of Object.entries(expect)) {
    if (kind === null) continue
    check(kinds.get(name) === kind, `${name} → ${KIND_LABEL[kind]}(實得 ${kinds.has(name) ? KIND_LABEL[kinds.get(name)] : '沒掃到'})`)
  }
  const bu = r.markers.filter((m) => m.marker === '@benchmark-unverified').map((m) => m.kind).sort()
  check(bu.join(',') === 'ok,unanchored', `md 的兩個 <!-- @benchmark-unverified --> → 一個無主、一個 ok(實得 ${bu.join(',') || '沒掃到'})`)
  for (const name of absent) check(!kinds.has(name), `${name} 長得像但不是標記 → 不掃到(實得 ${kinds.has(name) ? '掃到了' : '沒掃到'})`)
  const zeta = r.markers.find((m) => m.marker === '@zeta-allow')
  check(zeta?.dangling.length === 1, `路徑斷掉的指標被列進 dangling(實得 ${JSON.stringify(zeta?.dangling)})`)
  check(r.markers.filter((m) => m.marker === 'as any').length === 1, `有 any-allow 註解的 as any 不另算 cast(cast 家族的 as any 實得 ${r.markers.filter((m) => m.marker === 'as any').length} 筆,應為 1)`)
  const mu = r.markers.find((m) => m.marker === '@mu-allow')
  check(mu?.newest === d(3), `多個日期取最新(實得 ${mu?.newest})`)
  const expectedFresh = Object.entries(expect).filter(([, k]) => k === 'unanchored' || k === 'expired').length + 1 // +1:md 的無主那筆
  check(r.fresh.length === expectedFresh, `違規總數 = ${expectedFresh}(實得 ${r.fresh.length})`)
  check(verdictOf(r).status === 'VIOLATION', `判定 = VIOLATION(實得 ${verdictOf(r).status})`)
  // 棘輪:把這批全部登記後同一份輸入必須 PASS;再塞一筆新的必須 VIOLATION
  const b = { reviewAfterDays: REVIEW_AFTER_DAYS, entries: r.violations.map((v) => ({ key: v.key })) }
  check(verdictOf(evaluate({ now, files, registries, baseline: b })).status === 'PASS', '同一批登記進 baseline 後 → PASS')
  const more = [...files]; more[0] = { ...files[0], text: `${tsx}\n// @chi-allow: 新塞進來的無主` }
  check(verdictOf(evaluate({ now, files: more, registries, baseline: b })).status === 'VIOLATION', '再新增一筆無主 → VIOLATION(棘輪)')
  // 時間是輸入:同一份輸入,now 往前推 2 天,beta(181 天)就變成 179 天 → 不過期
  const earlier = evaluate({ now: new Date(now.getTime() - 2 * DAY), files, registries, baseline: { reviewAfterDays: REVIEW_AFTER_DAYS, entries: [] } })
  check(earlier.markers.find((m) => m.marker === '@beta-allow')?.kind === 'ok', 'now 往前 2 天 → 181 天那筆變 179 天,不過期(時間是輸入)')
  check(evaluate({ now, files: [], registries: [], baseline: b }).markers.length === 0 && verdictOf(evaluate({ now, files: [], registries: [], baseline: b })).status === 'INSTRUMENT-FAIL', '0 檔 0 標記 → INSTRUMENT-FAIL(沒量到 ≠ 沒有)')
  log(bad ? `\n✗ selftest ${bad} 項不符` : '\n✓ selftest:無主 / 過期會紅、合法 / 有主會放、長得像的不算、棘輪與時間輸入都成立')
  return bad === 0
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseNow(argv) {
  const arg = argv.find((a) => a.startsWith('--now='))
  if (!arg) return todayUtc()
  const m = /^--now=(\d{4})-(\d{2})-(\d{2})$/.exec(arg)
  if (!m) throw new TypeError(`--now 只接受 YYYY-MM-DD,實得 ${JSON.stringify(arg)}`)
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (iso(d) !== `${m[1]}-${m[2]}-${m[3]}`) throw new TypeError(`--now 不是合法日期:${arg}`)
  return d
}

function writeBaseline(r) {
  const entries = r.violations.map((v) => ({ key: v.key, family: v.family, file: v.file, marker: v.marker, kind: v.kind, hint: v.window.replace(/\s+/g, ' ').trim().slice(0, 100) }))
  const json = {
    note: '豁免標記到期複查的棘輪。這裡記的是「目前已知的無主(無日期無指標)/ 過期(日期超過 N 天)」標記。數字只准往下 —— 新增的無主、新過期的會讓 exemption-expiry-invariant.mjs 變紅。修好(補日期 / 指標、或拿掉豁免)之後跑 --update-baseline 重記。key 不含行號;改了標記的字仍沒補日期會以新 key 變紅,那是刻意的。',
    generatedBy: 'scripts/exemption-expiry-invariant.mjs --update-baseline',
    reviewAfterDays: REVIEW_AFTER_DAYS,
    recordedAt: iso(r.now),
    count: entries.length,
    byKind: { unanchored: entries.filter((e) => e.kind === 'unanchored').length, expired: entries.filter((e) => e.kind === 'expired').length },
    entries,
  }
  writeFileSync(BASELINE, `${JSON.stringify(json, null, 2)}\n`)
  console.log(`baseline 已更新:${entries.length} 筆(無主 ${json.byKind.unanchored} / 過期 ${json.byKind.expired};recordedAt ${json.recordedAt})→ ${relative(REPO, BASELINE)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const now = parseNow(argv)
  if (argv.includes('--selftest')) process.exit(selftest(now) ? 0 : 1)
  const r = evaluate({ now, baseline: argv.includes('--no-baseline') ? { reviewAfterDays: REVIEW_AFTER_DAYS, entries: [] } : loadBaseline() })
  if (argv.includes('--update-baseline')) { writeBaseline(r); process.exit(0) }
  if (argv.includes('--report')) { report(r); process.exit(0) }
  const v = verdictOf(r)
  console.log(`豁免標記到期複查(now = ${iso(r.now)},N = ${REVIEW_AFTER_DAYS} 天):掃 ${r.scannedFiles} 檔,${r.markers.length} 個標記;違規 ${r.violations.length}(baseline ${r.baseline?.count ?? '無'}),新增 ${r.fresh.length},已修 ${r.stale.length}`)
  if (v.status === 'INSTRUMENT-FAIL') { console.error(`✗ INSTRUMENT-FAIL:掃了 ${r.scannedFiles} 檔卻 0 個標記 —— 掃描器或路徑壞了,不是「沒有豁免」`); process.exit(v.exitCode) }
  if (v.status === 'MALFORMED-BASELINE') { for (const m of r.malformed) console.error(`✗ ${m}`); process.exit(v.exitCode) }
  if (v.status === 'NO-BASELINE') { console.error(`✗ 找不到 ${relative(REPO, BASELINE)} —— 先跑 --update-baseline`); process.exit(v.exitCode) }
  if (argv.includes('--list')) {
    const knownV = r.violations.filter((x) => r.known.has(x.key))
    if (knownV.length) { console.log(`\n· 已知(baseline 內,${knownV.length} 筆,不擋):`); for (const m of knownV) console.log(`  ${KIND_LABEL[m.kind]}  ${describe(m)}`) }
  }
  if (r.stale.length) console.log(`\n↓ baseline 裡有 ${r.stale.length} 筆這次沒出現(已修好或寫法變了)→ 跑 --update-baseline 收緊清單`)
  if (r.fresh.length) {
    console.error(`\n✗ 新增 ${r.fresh.length} 筆無主 / 過期的豁免標記(不在 baseline):`)
    for (const m of r.fresh) console.error(`  ${KIND_LABEL[m.kind]}  ${describe(m)}\n      ${m.window.replace(/\s+/g, ' ').trim().slice(0, 140)}`)
    console.error(`\n  修法:在標記那一行(或緊接的續行)補上複查日期 YYYY-MM-DD,或指到管它的東西(M-rule / spec.md 路徑 / 待辦總帳項 / PR # / commit / URL);`)
    console.error(`  過期的:重新看一次理由還成不成立 —— 成立就把日期改成今天,不成立就把豁免拿掉。`)
    process.exit(v.exitCode)
  }
  console.log(`✓ 沒有新增的無主 / 過期豁免標記`)
  process.exit(0)
}
