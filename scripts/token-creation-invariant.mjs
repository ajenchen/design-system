#!/usr/bin/env node
/**
 * Token 建立不變式(2026-09-11 立;2026-11-11 擴成「分類表」九條檢查裡的八條)
 *
 * user 原話(2026-09-11):「為何你他媽又不照規範來建立 token?要講幾次?而且這個部分我們之前也有特別提醒每次建立必檢查吧?
 * 你他媽要如何永遠在各種環境下都能避免這個問題?」
 *
 * **2026-11-11 為什麼要擴**:342 顆 token 裡 194 顆,`tokens/README.md` 那張「公開 / 內部」表與
 * `token-system.spec.md` 那張「誰可以讀」表說法相反 —— 分類只寫在兩張給人看的表裡,沒有任何檢查看得到。
 * 這支舊版只管兩件事(前綴不跨家族、新 token 要出現在家族規格裡),只掃 `tokens/`,而且拿不到 main 的清單就跳過。
 * 現在改成:分類只住一份給機器讀的表 `packages/design-system/src/tokens/token-registry.json`,這支拿它驗每一次改動
 * (原則見 `token-system.spec.md`「三類 / 三題 / 三條規則」)。
 *
 * 檢查(編號沿用 user 2026-11-10 拍板的落地計畫 (d) 節;第 8 條住在 `scripts/token-twin-invariant.mjs`):
 *   C1 有登記:整頁生效的名字(`:root` / 密度 / 主題 / Tailwind `@theme` 段)恰好對到分類表一列(最長吻合;對不到或兩列一樣長都算錯);
 *      被「宣告它的資料夾以外」讀到的名字也要登記;Tailwind 轉接名(`@theme` 裡 `--x: var(--y)`)不登記,只驗它指向的本尊有登記;
 *      分類表每一列欄位合法、沒有對不到任何名字的死列。
 *      2026-11-15 補(稽核 P23 第 4 個盲點):同一個名字在 ≥2 個資料夾有宣告(轉接名不算)、設計系統又有人讀 = 跨元件傳值,
 *      也要登記 —— 每個讀者資料夾自己也有宣告時,「資料夾以外被讀」那條看不到(錨:--item-prefix-slot)。
 *   C2 新名字逐顆登記、要有理由:相對 main 新增、需要登記的名字,分類表必須有它完整名字的一列,`why` 不可空;
 *      類別是共用刻度的,要寫出它屬於哪一組既有刻度(`scale`)或第二個讀者(`secondReader`,那個檔必須真的讀它)。
 *      2026-11-16 補(token-system.spec.md 規則 1、「命名」元件的值;每條在 --selftest 都有該紅 / 該綠):
 *        新名字那一列的 `home` 不得是 null(規則 1:一定要有住處;沒有預設宣告、靠讀的地方各帶後備值 = 同一個值好幾份);
 *        新的元件的值:說明它的規格(`spec`)要在主人的資料夾(`components/<owner>` 或 `patterns/<owner>`,資料夾要真的存在);
 *        名字的第一段要是同主人其他列已經在用的第一段(例:DataTable 的 `--table-`;不讀 main —— main 上還沒有分類表),
 *        同主人沒有其他列時,名字要以 `--<主人名字的 kebab 寫法>-` 開頭。跟別的主人撞開頭不查(規格「機器擋不住」那一條)。
 *   C3 宣告的檔案 = 登記的住處:整頁生效的宣告只准出現在該列 `home`;`home` 列的每個檔都真的宣告了它(住處不准過期)。
 *      2026-11-16 補:原料 / 共用刻度的 `home` 與 `target` 每一個路徑都在 `tokens/` 底下(全部列都查,token-system.spec.md「擺放」);
 *      同一顆登記的名字,讀的地方寫後備值 `var(--x, 預設)` 的設計系統執行期檔(去掉註解、不含 stories)有兩個以上 → 紅
 *      (規則 2「同一個值只有一個住處」;補這條時已存在的副本在 `known.fallbackCopies`,以 `名字|檔` 為單位登記,只能變短 ——
 *      2026-11-16 審查 S1:原本以名字為單位,已登記的名字在第 6 個檔多一份也不紅)。
 *      元件的值的 `home` 要在主人的資料夾(2026-11-16 審查 M1;全部列都查,token-system.spec.md 規則 1)。不在主人資料夾的只放行兩種:
 *      搬家中(`target` 每一個都在主人資料夾)、執行期寫值(`home` 全是寫它的程式檔、設計系統沒有任何 CSS 宣告它)。
 *      執行期寫值這種另驗反方向(審查 S2):設計系統執行期檔裡每一個寫它的檔都要列在 `home`(字串拼出來的名字看不到)。
 *      預定住處 `target`(2026-11-11 審查補:原本完全沒人驗,卻被 C9 當成「主人的資料夾」放行):元件的值的 `target` 必須在
 *      主人的資料夾(`components/<owner>` 或 `patterns/<owner>`,資料夾要真的存在;檔本身可以還沒建 —— 寄住共用檔、
 *      還沒搬的就是這樣。第二階段的 14 顆 2026-11-11 已全部搬完,這條改由 --selftest 的夾具 --fixture-parked-gap 守著);
 *      原料 / 共用刻度不搬家,`target` 只能等於 `home`。
 *   C4 新名字完整出現在登記的那份規格裡(整個名字比對);既有在規格裡完全找不到的,列已知名單 `known.missingSpec`,只能變短。
 *   C5 有大密度覆寫就要有回復,而且覆寫、回復、預設值同一個檔;深色主題覆寫也跟預設值同檔。已知名單 `known.missingRestore`。
 *   C6 元件樣式檔有進對外彙總檔(`styles/tokens.css`)或被設計系統程式匯入 —— 2026-05-26 事故(產品拿不到值、版面跑掉)。
 *      原本另有一支本機收工(Stop)時提醒的 hook `check_orphan_ds_css.sh`,2026-11-18 退場(knowledge-prune H-R3),
 *      這條只剩本閘負責(CI verify-static 必跑)。跟那支比:較嚴 —— 只認真的 import / @import(彙總檔註解裡寫了路徑不算)、
 *      只被 stories 匯入不算(stories 不出貨);較窄 —— 範例專用資料夾(stories-helpers / story-governance)與測試不掃,
 *      那裡的樣式檔不是產品執行期會載入的。--selftest 的 C6 格涵蓋那支 hook 測試的情境(事故原型、只寫在彙總檔註解、樣式檔串接)。
 *   C7 誰可以讀:(甲)產品端程式(本 repo `apps/`)不得讀 `product: "no"` 的名字、不得寫任何登記的名字
 *      (2026-11-16:產品不寫任何 token —— 依據 user 2026-11-11 決策頁「主題:甲」;甲原文沒有限定範圍,讀成所有 token 是
 *      AI 推導 ①(token-system.spec.md「誰可以讀」,原話與選項原文也住那裡);分類表 `product` 因此只有 no / read,原本的 read-write 這個值拿掉);
 *      (乙)設計系統 `components/` / `patterns/` / `styles/` 讀原料,資料夾必須在該列 `dsReaders`。兩邊都是已知名單以外的才擋。
 *      (丙)元件的值「主人規格點名才可讀」(user 2026-11-10 token 第 4 題甲):分類表 `product` 不是 no 的元件的值,
 *      主人規格(該列 `spec`)要有點名句;規格點名的名字,分類表那一列也要是「元件的值、主人規格是這份、product 不是 no」。
 *      點名句 = 一行裡從「主人規格點名・產品可讀」到第一個句號為止的那一段。閘只比對兩邊,不另存第二份名單。
 *   C9 只有主人自己在讀、又不切換的值,不該有全系統的名字。第一階段只對相對 main 新增的名字開;2026-11-11 第三階段
 *      收完 6 顆之後全面打開:「元件的值」不分新舊全查(主人 = 該列 home 與 target 的資料夾),其他類別仍只查新名字
 *      (既有的原料 / 共用刻度以「一組」為單位判,不逐顆問)。
 *      2026-11-15 補三條(稽核 P23 第 1–3 個盲點,每條在 --selftest 都有該紅 / 該綠):
 *        「會不會切換」改成連 var() 衍生的也算(衍生值段選擇器沒有 `=`,舊版當成 :root);
 *        (甲)讀者全在同一個非主人資料夾、而且只在程式裡量值(沒有 var() 讀取)→ 收成那個讀者的常數(錨:--sidebar-width-min);
 *        (乙)只被同檔別的名字的 var() 公式讀 = 中間值,分類表 why 要寫「中間值」(有密度段的也查;錨:--sidebar-menu-icon-size);
 *        (丙)沒有任何執行期讀者(轉接名自己那一行不算、字串拼出的開頭吻合算讀、known.productExternal 算讀):元件的值直接紅;
 *            共用刻度照 token-system.spec.md「一組」窄讀法,最後一段是級距 / 狀態而且同組有人讀才放行;
 *            閘補上當下已存在的列在 known.unread,只能變短(錨:--motion-easing-swell)。
 *            分類表該列寫了保留類別 `retain` 的不算沒人讀(錨:--brand = reservation,產品層預留;2026-11-15 曾被這條
 *            當成孤兒誤刪,user 沒說過要刪,同日還原)。
 *      2026-11-16 補(審查 M2;第 0 題 (c)「設計系統裡別的元件要寫它」):主人資料夾以外的設計系統執行期檔寫它(style 物件、
 *        setProperty、`[--x:…]` class、別的資料夾的 CSS 局部宣告)也算主人以外的參與者 —— 原本只看讀者,照規格開的值會被叫回去
 *        寫成常數;(甲)只在沒有這種寫入者時才判(有人寫就不是常數)。
 *   C1(保留類別,2026-11-15):分類表 `retention` 的每一類 key ↔ `retention.spec`(tokens/orphan-tokens.spec.md)每類標題
 *      `### N. \`key\` — …` ↔ 各列 `retain`,三方一致(保留分類原本住兩處、腳本另內建一份,`--brand` 因此被當孤兒)。
 *   C10 產品可讀的名字不得悄悄消失(2026-11-15;理由 = 決策權:產品可讀名字的退場由 user 逐字決定):對照基準(與 main 的分岔點、HEAD),分類表登記產品可讀(product 不是 no)的
 *      名字、或指向這種名字的 Tailwind 轉接名,在基準有宣告、工作樹不再宣告 → 紅;除非它登記在分類表 `retired`
 *      (user 原話逐字、日期;改名加 renamedTo 且新名字要有宣告)。基準沒有分類表時用工作樹的。
 *      要不要「先保留一版」讀相容政策 scripts/lib/compat-policy.mjs(2026-11-15 user:「我認為還是 beta 的狀況下都不要再顧及所有向後相容的部分」):
 *      0.x / 預發布版同一版刪、不要求版本欄;1.0 以後的正式版 deprecatedIn / removedIn 必填且不同。讀不到政策 = 紅。
 *      user 原話(2026-11-15):「沒人用只是因為現在你的視角看不到消費者，但這個 token 真的是沒有意義的存在？」
 *   C11 用詞(2026-11-15):顏色的稱呼只在 `tokens/color/color.spec.md`「用詞」定義;那一段「不用的說法」行裡反引號的字
 *      (主題色 / 主操作色 / brand swap …)在設計系統原始碼與規格(`packages/design-system/src`、`packages/design-system/ds-canonical`,
 *      退役封存除外)出現就紅 —— 清單只讀那一行,本檔不另存一份;讀不到清單也紅。
 * 三件跨條的事:拿不到 main → **紅**(INSTRUMENT-FAIL,不是跳過);讀者一律去掉註解(程式檔用 TypeScript 語法樹只取字串);
 * 已知名單「只能變短」= 比 main 的那份多一筆就紅、修好了還留著也紅。
 *
 * 跑法:
 *   node scripts/token-creation-invariant.mjs              現況(要綠)
 *   node scripts/token-creation-invariant.mjs --selftest   對照組:每一條各自注入違規、確認紅的是它而且指名;每條也有一筆該綠的
 *   node scripts/token-creation-invariant.mjs --inventory  列出需要登記的名字、它對到的列、宣告處與讀者資料夾(搬家時用)
 * 純讀檔比對,不開瀏覽器、不量時間;機器快慢不影響結果。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { compatPolicyFor, readCompatPolicy, POLICY_DOC } from './lib/compat-policy.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
/** C10 的相容政策(唯一判斷住 scripts/lib/compat-policy.mjs);讀不到回 error,由 C10 判紅 */
function loadCompatPolicy() {
  try { return { compatPolicy: readCompatPolicy(REPO), compatPolicyError: null } } catch (e) { return { compatPolicy: null, compatPolicyError: String(e.message) } }
}
export const DS_ROOT = 'packages/design-system/src'
export const REGISTRY_PATH = `${DS_ROOT}/tokens/token-registry.json`
const AGGREGATOR = 'styles/tokens.css'
/** 主人規格的點名句開頭(C7 丙;寫法定義住 token-system.spec.md「誰可以讀」) */
export const NAMED = '主人規格點名・產品可讀'

// ── 掃描範圍 ──────────────────────────────────────────────────────────────
// 執行期程式 = 設計系統 src 與產品 apps/*/src 的 .css / .ts / .tsx;範例(stories、stories-helpers、story-governance)與測試不算。
const SCANNABLE = /\.(css|ts|tsx)$/
const EXCLUDED = /(\.stories\.tsx$|story-helpers\.tsx?$|\/_demo-helpers\.tsx?$|\.test\.[jt]sx?$|\.d\.ts$|\/__tests__\/|\/node_modules\/|\/stories-helpers\/|\/story-governance\/)/
export const isScannable = (p) => SCANNABLE.test(p) && !EXCLUDED.test(p) &&
  (p.startsWith(`${DS_ROOT}/`) || /^apps\/[^/]+\/src\//.test(p))

function walk(dir, out = []) {
  for (const n of readdirSync(join(REPO, dir))) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = `${dir}/${n}`
    if (statSync(join(REPO, p)).isDirectory()) walk(p, out)
    else if (isScannable(p)) out.push(p)
  }
  return out
}
export function readWorkingFiles() {
  const files = new Map()
  const roots = [DS_ROOT, ...readdirSync(join(REPO, 'apps')).map((a) => `apps/${a}/src`).filter((d) => { try { return statSync(join(REPO, d)).isDirectory() } catch { return false } })]
  for (const r of roots) for (const p of walk(r)) files.set(p, readFileSync(join(REPO, p), 'utf8'))
  return files
}

const git = (args, opts = {}) => execFileSync('git', args, { cwd: REPO, maxBuffer: 512 * 1024 * 1024, ...opts })
/** main 的檔案快照(一次 cat-file --batch);拿不到 ref → 丟例外(呼叫端判紅)。 */
export function readFilesAt(ref) {
  const list = git(['ls-tree', '-r', '--name-only', ref, '--', DS_ROOT, 'apps'], { encoding: 'utf8' }).split('\n').filter(isScannable)
  const out = git(['cat-file', '--batch'], { input: list.map((p) => `${ref}:${p}`).join('\n') + '\n' })
  const files = new Map()
  let off = 0, i = 0
  while (off < out.length && i < list.length) {
    const nl = out.indexOf(10, off)
    const header = out.toString('utf8', off, nl)
    if (header.endsWith(' missing')) { off = nl + 1; i++; continue }
    const size = Number(header.split(' ')[2])
    files.set(list[i], out.toString('utf8', nl + 1, nl + 1 + size))
    off = nl + 1 + size + 1; i++
  }
  if (files.size !== list.length) throw new Error(`cat-file 只讀回 ${files.size}/${list.length} 個檔`)
  return files
}
export function resolveBaseRef() {
  for (const ref of ['origin/main', 'main']) {
    try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'pipe' }); return ref } catch { /* 下一個 */ }
  }
  return null
}

// ── C10 / C11 的輸入(2026-11-15)────────────────────────────────────────────
/** C11 掃的檔:設計系統原始碼與規格(原始碼、範例、規格、hook、參考檔);退役封存與 node_modules 不算。 */
const TERM_ROOTS = [DS_ROOT, 'packages/design-system/ds-canonical']
const TERM_EXT = /\.(md|css|tsx?|mjs|cjs|js|json|sh|ya?ml|txt)$/
const TERM_SKIP_DIR = new Set(['node_modules', 'retired', 'dist'])
export function readTermFiles() {
  const out = new Map()
  const go = (dir) => {
    for (const n of readdirSync(join(REPO, dir))) {
      if (n.startsWith('.') || TERM_SKIP_DIR.has(n)) continue
      const p = `${dir}/${n}`
      if (statSync(join(REPO, p)).isDirectory()) go(p)
      else if (TERM_EXT.test(n)) out.set(p, readFileSync(join(REPO, p), 'utf8'))
    }
  }
  for (const r of TERM_ROOTS) go(r)
  return out
}
/** 用詞的唯一住處 = color.spec.md「用詞」段;「不用的說法」那一行反引號裡的字就是清單(C11 只讀這一行)。 */
export const TERM_SPEC = `${DS_ROOT}/tokens/color/color.spec.md`
const TERM_SECTION = /^## 用詞\s*$/
export function termBanned(specText) {
  if (typeof specText !== 'string') return []
  let inSection = false
  for (const line of specText.split('\n')) {
    if (/^## /.test(line)) inSection = TERM_SECTION.test(line)
    if (inSection && line.startsWith('**不用的說法**')) return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((w) => w.trim())
  }
  return []
}
/** orphan-tokens.spec.md 每一類標題 `### N. \`key\` — …` 的 key(C1 保留類別三方一致) */
export function retentionSpecKeys(specText) {
  if (typeof specText !== 'string') return null
  return new Set([...specText.matchAll(/^###\s+\d+\.\s+`([a-z][a-z0-9-]*)`/gm)].map((m) => m[1]))
}
/** C10 的對照基準:與 main 的分岔點 + HEAD(同一個 commit 只算一次)。每個基準帶它自己的分類表(沒有就 null)。 */
export function baseContexts(mainRef) {
  const refs = []
  try { refs.push({ ref: git(['merge-base', 'HEAD', mainRef], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), label: `與 ${mainRef} 的分岔點` }) } catch (e) {
    return { error: `算不出 HEAD 與 ${mainRef} 的分岔點(簽出要 fetch-depth: 0):${String(e.stderr ?? e.message).split('\n')[0].slice(0, 120)}` }
  }
  refs.push({ ref: 'HEAD', label: 'HEAD' })
  const out = [], seen = new Set()
  for (const { ref, label } of refs) {
    let sha
    try { sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return { error: `讀不到 ${label}(${ref})` } }
    if (seen.has(sha)) continue
    seen.add(sha)
    let registry = null
    try { registry = JSON.parse(git(['show', `${sha}:${REGISTRY_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) } catch (e) {
      if (!/does not exist|exists on disk, but not in/.test(String(e.stderr ?? e.message))) return { error: `讀不到 ${label} 的分類表:${String(e.message).split('\n')[0].slice(0, 120)}` }
    }
    try { out.push({ label: `${label} ${sha.slice(0, 8)}`, files: readFilesAt(sha), registry }) } catch (e) { return { error: `讀不到 ${label} 的檔案:${String(e.message).split('\n')[0].slice(0, 120)}` } }
  }
  return { bases: out }
}

// ── 解析 ─────────────────────────────────────────────────────────────────
const NAME = '--[A-Za-z0-9_-]+'
// 尾端可帶 `:not([data-ui-size])` / `:not([data-layout-space])`:便捷屬性那一半讓明寫的單軸屬性勝出(density.spec.md「同一個元素帶兩種屬性」)
const GLOBAL_PART = /^(?::root|html)?(?:\[data-(?:theme|density|ui-size|layout-space)(?:=["']?[\w-]+["']?)?\])*(?::not\(\[data-(?:ui-size|layout-space)\]\))?$/
const AT_TRANSPARENT = /^@(media|supports|layer|container)\b/

function blockOf(stack) {
  const sel = [...stack].reverse().find((s) => !AT_TRANSPARENT.test(s))
  if (sel == null) return { scope: 'top' }
  if (/^@theme\b/.test(sel)) return { scope: 'theme-tw' }
  const parts = sel.split(',').map((s) => s.replace(/\s+/g, ''))
  if (!parts.every((p) => p && GLOBAL_PART.test(p))) return { scope: 'local', selector: sel }
  const txt = parts.join(',')
  const block = /data-(density|ui-size)=["']?lg/.test(txt) ? 'density-lg'
    : /data-(density|ui-size)=["']?md/.test(txt) ? 'density-md'
      : /data-theme=["']?dark/.test(txt) ? 'theme-dark'
        : /data-[\w-]+=/.test(txt) ? `variant:${txt}` : 'root'
  return { scope: 'global', block, selector: sel }
}

function scanCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const lineAt = (i) => src.slice(0, i).split('\n').length
  const decls = [], reads = [], utilities = new Map()
  // fallback:`var(--x, 預設)` 這種讀法自帶一份預設值(C3 後備值不分家,2026-11-16)
  for (const m of src.matchAll(new RegExp(`var\\(\\s*(${NAME})(\\s*,)?`, 'g'))) if (!/[-_]$/.test(m[1])) reads.push({ name: m[1], line: lineAt(m.index), how: 'var', fallback: m[2] != null })
  for (const m of src.matchAll(/@utility\s+([\w-]+)\s*\{([^}]*)\}/g)) {
    utilities.set(m[1], [...m[2].matchAll(new RegExp(`var\\(\\s*(${NAME})`, 'g'))].map((x) => x[1]))
  }
  const stack = []
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '{') { stack.push(src.slice(start, i).trim()); start = i + 1; continue }
    if (c !== ';' && c !== '}') continue
    const seg = src.slice(start, i)
    const m = seg.match(new RegExp(`^\\s*(${NAME})\\s*:([\\s\\S]*)$`))
    if (m) {
      const b = blockOf(stack)
      const value = m[2].trim()
      const line = lineAt(start + seg.indexOf(m[1]))
      if (b.scope === 'theme-tw') {
        const alias = value.match(new RegExp(`^var\\(\\s*(${NAME})\\s*\\)$`))
        decls.push(alias ? { name: m[1], kind: 'alias', aliasOf: alias[1], line } : { name: m[1], kind: 'global', block: 'root', tw: true, line, value })
      } else if (b.scope === 'global') decls.push({ name: m[1], kind: 'global', block: b.block, line, value })
      else decls.push({ name: m[1], kind: 'local', line, value })
    }
    if (c === '}') stack.pop()
    start = i + 1
  }
  return { decls, reads, utilities, words: new Set(), imports: cssImports(src), prefixReads: [] }
}
function cssImports(src) {
  return [...src.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+\.css)['"]/g)].map((m) => m[1])
}

/** 程式檔:用 TypeScript 語法樹只取字串(註解自然被排除),在字串裡找讀取 / 宣告 / class 名。 */
function scanCode(text, path) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const decls = [], reads = [], words = new Set(), imports = [], prefixReads = []
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  const up = (n) => { let p = n.parent; while (p && (ts.isAsExpression(p) || ts.isParenthesizedExpression(p) || ts.isSatisfiesExpression?.(p))) { n = p; p = p.parent } return { node: n, parent: p } }
  const onLiteral = (node, t) => {
    // 字串拼出來的名字只拿得到開頭(`var(--table-row-${size})`、`'--table-row-' + size`):不算任何一個名字的讀者,
    // 但記下開頭 —— C9(丙)判「沒有任何讀者」時,開頭吻合的名字算有人讀(2026-11-15)
    for (const m of t.matchAll(new RegExp(`var\\(\\s*(${NAME})`, 'g'))) if (/[-_]$/.test(m[1])) prefixReads.push(m[1])
    if (new RegExp(`^${NAME}$`).test(t) && /[-_]$/.test(t)) prefixReads.push(t)
    if (new RegExp(`^${NAME}$`).test(t)) {
      if (/[-_]$/.test(t)) return // `'--table-row-' + size`:字串拼出來的名字只拿得到開頭
      const { node: self, parent } = up(node)
      if (parent && ts.isComputedPropertyName(parent)) { decls.push({ name: t, kind: 'code', line: lineOf(node) }); return }
      if (parent && ts.isPropertyAssignment(parent) && parent.name === self) { decls.push({ name: t, kind: 'code', line: lineOf(node) }); return }
      if (parent && ts.isCallExpression(parent) && parent.arguments[0] === self && ts.isPropertyAccessExpression(parent.expression)) {
        const fn = parent.expression.name.text
        if (fn === 'setProperty') { decls.push({ name: t, kind: 'code', line: lineOf(node) }); return }
        if (fn === 'removeProperty') return
      }
      reads.push({ name: t, line: lineOf(node), how: 'quoted' })
      return
    }
    // 字串拼出來的名字(`var(--table-row-${size})`)只拿得到開頭 —— 結尾是 `-` / `_` 的不算一個名字
    for (const m of t.matchAll(new RegExp(`var\\(\\s*(${NAME})(\\s*,)?`, 'g'))) if (!/[-_]$/.test(m[1])) reads.push({ name: m[1], line: lineOf(node), how: 'var', fallback: m[2] != null })
    for (const m of t.matchAll(new RegExp(`[A-Za-z0-9]-\\((${NAME})\\)`, 'g'))) reads.push({ name: m[1], line: lineOf(node), how: 'tw-shorthand' })
    for (const m of t.matchAll(new RegExp(`\\[(${NAME}):`, 'g'))) decls.push({ name: m[1], kind: 'code', line: lineOf(node) })
    for (const w of t.split(/[\s"'`,]+/)) {
      if (!w) continue
      const u = w.split(':').pop().replace(/^!/, '').replace(/!$/, '').replace(/\/[\w.[\]]+$/, '')
      if (u) words.add(u)
    }
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
    else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) onLiteral(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { decls, reads, utilities: new Map(), words, imports, prefixReads }
}

// ── 模型 ─────────────────────────────────────────────────────────────────
const dsRel = (p) => p.slice(DS_ROOT.length + 1)
export function folderOf(p) {
  if (!p.startsWith(`${DS_ROOT}/`)) { const m = p.match(/^apps\/([^/]+)\//); return m ? `product:${m[1]}` : p }
  const s = dsRel(p).split('/')
  if (['components', 'patterns', 'tokens'].includes(s[0])) return s.length > 2 ? `${s[0]}/${s[1]}` : s[0]
  return s.length > 1 ? s[0] : '.'
}
const parseCache = new Map()
function parse(path, text) {
  const key = `${path}\0${text}`
  if (!parseCache.has(key)) parseCache.set(key, path.endsWith('.css') ? scanCss(text) : scanCode(text, path))
  return parseCache.get(key)
}

// Tailwind @theme 名字 → 產生的 class(只收本 DS 用得到的幾種命名空間)
const NS_UTILS = {
  spacing: ['h', 'w', 'size', 'min-h', 'min-w', 'max-h', 'max-w', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'ps', 'pe', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'ms', 'me', '-m', '-mx', '-my', '-mt', '-mb', '-ml', '-mr', 'gap', 'gap-x', 'gap-y', 'space-x', 'space-y', '-space-x', '-space-y', 'inset', 'inset-x', 'inset-y', 'top', 'bottom', 'left', 'right', 'start', 'end', 'basis', 'indent', 'scroll-m', 'scroll-p', 'translate-x', 'translate-y'],
  color: ['bg', 'text', 'border', 'border-t', 'border-b', 'border-l', 'border-r', 'border-x', 'border-y', 'border-s', 'border-e', 'ring', 'ring-offset', 'outline', 'fill', 'stroke', 'divide', 'from', 'via', 'to', 'caret', 'accent', 'decoration', 'shadow', 'placeholder', 'inset-ring'],
  radius: ['rounded', 'rounded-t', 'rounded-b', 'rounded-l', 'rounded-r', 'rounded-s', 'rounded-e', 'rounded-tl', 'rounded-tr', 'rounded-bl', 'rounded-br', 'rounded-ss', 'rounded-se', 'rounded-es', 'rounded-ee'],
  font: ['font'], text: ['text'], opacity: ['opacity'], shadow: ['shadow'], ease: ['ease'], animate: ['animate'],
}

export function buildModel(files) {
  const entries = []
  for (const [path, text] of files) entries.push({ path, folder: folderOf(path), isDs: path.startsWith(`${DS_ROOT}/`), ...parse(path, text) })
  const globalDecls = new Map(), aliases = new Map(), declFolders = new Map(), allDecls = new Map()
  // 宣告它的資料夾,不算 Tailwind 轉接名(`@theme` 的 `--color-border: var(--border)`):C1 跨元件傳值的判準用(2026-11-15)
  const valueDeclFolders = new Map()
  const prefixReads = [] // { prefix, path, folder, isDs }
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v) }
  const utilToNames = new Map()
  for (const e of entries) {
    for (const d of e.decls) {
      const at = { ...d, path: e.path, folder: e.folder }
      if (e.isDs) push(allDecls, d.name, at)
      if (!e.isDs) continue
      if (d.kind === 'alias') aliases.set(d.name, at)
      if (d.kind === 'global') push(globalDecls, d.name, at)
      if (!declFolders.has(d.name)) declFolders.set(d.name, new Set())
      declFolders.get(d.name).add(e.folder)
      if (d.kind !== 'alias') { if (!valueDeclFolders.has(d.name)) valueDeclFolders.set(d.name, new Set()); valueDeclFolders.get(d.name).add(e.folder) }
    }
    for (const p of e.prefixReads ?? []) prefixReads.push({ prefix: p, path: e.path, folder: e.folder, isDs: e.isDs })
    for (const [u, names] of e.utilities) for (const n of names) push(utilToNames, u, n)
  }
  // @theme 名字(轉接名與 @theme 裡直接給值的)對應的 class
  for (const [name, list] of [...[...aliases].map(([n, a]) => [n, [a]]), ...globalDecls]) {
    if (!list.some((d) => d.kind === 'alias' || d.tw)) continue
    const m = name.match(/^--([a-z]+)-(.+)$/)
    if (!m || !NS_UTILS[m[1]]) continue
    for (const pre of NS_UTILS[m[1]]) push(utilToNames, `${pre}-${m[2]}`, name)
  }
  const resolve = (n) => { const seen = new Set(); while (aliases.has(n) && !seen.has(n)) { seen.add(n); n = aliases.get(n).aliasOf } return n }
  // (names:這份快照裡出現過的名字 = 設計系統裡任何宣告 + 設計系統執行期讀到的;「相對 main 新增」拿它當基準)
  const reads = [] // { name(本尊), raw(字面), path, folder, isDs, line, how }
  for (const e of entries) {
    for (const r of e.reads) reads.push({ name: resolve(r.name), raw: r.name, path: e.path, folder: e.folder, isDs: e.isDs, line: r.line, how: r.how, fallback: r.fallback === true })
    for (const w of e.words) for (const n of utilToNames.get(w) ?? []) reads.push({ name: resolve(n), raw: n, path: e.path, folder: e.folder, isDs: e.isDs, line: 0, how: `class ${w}` })
  }
  const names = new Set([...allDecls.keys(), ...reads.filter((r) => r.isDs).map((r) => r.name)])
  // 轉接名自己那一行的 var():`@theme inline { --color-brand: var(--brand) }` 不是 --brand 的執行期讀者(沒人用 bg-brand 就不產生任何 CSS)
  const aliasLines = new Set([...aliases.values()].map((a) => `${a.path}\0${a.line}\0${a.aliasOf}`))
  const aliasSelfRead = (r) => r.how === 'var' && aliasLines.has(`${r.path}\0${r.line}\0${r.raw}`)
  return { entries, globalDecls, aliases, declFolders, valueDeclFolders, allDecls, reads, resolve, names, prefixReads, aliasSelfRead }
}

// ── 分類表 ───────────────────────────────────────────────────────────────
const CLASSES = ['raw', 'shared', 'component', 'ignore']
// 產品不寫任何 token(2026-11-16,主題甲;範圍讀成「任何」是 AI 推導 ①,見 token-system.spec.md「誰可以讀」)→ 沒有「可讀也可覆寫」這個值
const PRODUCT = ['no', 'read']
export const isPrefixRow = (r) => r.match.endsWith('-') || r.match.endsWith('_')
export function lookup(rows, name) {
  let best = [], len = -1
  for (const r of rows) {
    if (!(isPrefixRow(r) ? name.startsWith(r.match) : name === r.match)) continue
    if (r.match.length > len) { best = [r]; len = r.match.length } else if (r.match.length === len) best.push(r)
  }
  return best
}
const homesOf = (r) => (r.home == null ? [] : Array.isArray(r.home) ? r.home : [r.home]).map((h) => `${DS_ROOT}/${h}`)
const targetsOf = (r) => (r.target == null ? [] : Array.isArray(r.target) ? r.target : [r.target]).map((h) => `${DS_ROOT}/${h}`)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const specHasWhole = (spec, name) => new RegExp(`(?<![\\w-])${esc(name)}(?![\\w-])`).test(spec)
/** 規格裡的萬用寫法(`--color-{hue}-{1~10}`、`--field-height-*`、`--x-<size>`)涵蓋到它也算「找得到」—— 只用在既有名字的已知名單。 */
export function specCovers(spec, name) {
  if (specHasWhole(spec, name)) return true
  for (const m of spec.matchAll(/--[A-Za-z0-9_-]*(?:\{[^}\s]*\}|\*|<[^>\s]*>)[A-Za-z0-9_{}<>*~-]*/g)) {
    const pat = m[0]
    if (pat.replace(/\{[^}]*\}|\*|<[^>]*>/g, '').replace(/^--/, '').replace(/-/g, '').length < 3) continue
    const re = new RegExp(`^${pat.split(/(\{[^}]*\}|\*|<[^>]*>)/).map((s, i) => (i % 2 ? '[A-Za-z0-9_-]+' : esc(s))).join('')}$`)
    if (re.test(name)) return true
  }
  return false
}

// ── 判定 ─────────────────────────────────────────────────────────────────
/**
 * @param {object} ctx { files: Map, registry, mainNames: Set|null(null = 拿不到 main), mainRegistry: object|null|undefined(undefined = main 上沒有分類表), readSpec(path)→text|null }
 * @returns {{ problems: Record<string,string[]>, info: object }}
 */
export function runChecks(ctx) {
  const P = { C1: [], C2: [], C3: [], C4: [], C5: [], C6: [], C7: [], C9: [], C10: [], C11: [] }
  const reg = ctx.registry
  const rows = Array.isArray(reg?.rows) ? reg.rows : []
  const known = reg?.known ?? {}
  const m = buildModel(ctx.files)
  const look = (n) => lookup(rows, n)
  const real = (r) => r && r.class !== 'ignore'
  const specCache = new Map()
  const specText = (p) => { if (!specCache.has(p)) specCache.set(p, ctx.readSpec(`${DS_ROOT}/${p}`)); return specCache.get(p) }

  // C1-0 分類表本身
  if (!Array.isArray(reg?.rows)) P.C1.push(`分類表 ${REGISTRY_PATH} 讀不到或沒有 rows`)
  const seen = new Map()
  for (const r of rows) {
    const id = r?.match ?? JSON.stringify(r)
    if (typeof r?.match !== 'string' || !r.match.startsWith('--')) { P.C1.push(`分類表一列沒有合法的 match:${id}`); continue }
    if (seen.has(r.match)) P.C1.push(`分類表有兩列 match 相同(${r.match})—— 同一個名字兩列一樣長都吻合`)
    seen.set(r.match, r)
    if (!CLASSES.includes(r.class)) P.C1.push(`${r.match}:class 必須是 ${CLASSES.join(' / ')}`)
    if (typeof r.why !== 'string' || !r.why.trim()) P.C1.push(`${r.match}:why 不可空`)
    if (r.class === 'ignore') continue
    if (typeof r.owner !== 'string' || !r.owner) P.C1.push(`${r.match}:owner 不可空`)
    if (!(r.home === null || typeof r.home === 'string' || (Array.isArray(r.home) && r.home.length))) P.C1.push(`${r.match}:home 必須是路徑、路徑陣列或 null`)
    if (!(r.target === undefined || r.target === null || typeof r.target === 'string' || (Array.isArray(r.target) && r.target.length && r.target.every((t) => typeof t === 'string')))) P.C1.push(`${r.match}:target 必須是路徑、路徑陣列或 null`)
    if (typeof r.spec !== 'string') P.C1.push(`${r.match}:spec 必須是路徑`)
    if (!PRODUCT.includes(r.product)) P.C1.push(`${r.match}:product 必須是 ${PRODUCT.join(' / ')}`)
    if (!(r.dsReaders === 'any' || Array.isArray(r.dsReaders))) P.C1.push(`${r.match}:dsReaders 必須是 "any" 或資料夾陣列`)
  }

  // C1(保留類別,2026-11-15):分類表 retention ↔ orphan-tokens.spec.md 每類標題的 key ↔ 各列 retain,三方一致。
  // 保留分類原本住兩處(orphan-tokens.spec.md 與 ds-canonical/references/structural-token-retention.md)、腳本另內建一份 regex,
  // --brand 只列在其中一處 → 被當成孤兒誤刪。現在機器清單只住分類表,理由只住規格,這裡比兩邊的 key。
  const retention = reg?.retention
  const catKeys = new Set()
  if (!retention || typeof retention.spec !== 'string' || !Array.isArray(retention.categories) || !retention.categories.length) {
    P.C1.push('分類表沒有合法的 retention(spec 路徑 + 非空 categories 陣列)—— 保留類別的機器清單只住這裡')
  } else {
    for (const c of retention.categories) {
      if (typeof c?.key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c.key)) { P.C1.push(`retention 有一類的 key 不合法:${JSON.stringify(c?.key)}`); continue }
      if (catKeys.has(c.key)) P.C1.push(`retention 有兩類 key 相同(${c.key})`)
      catKeys.add(c.key)
      if (!(c.pattern === null || typeof c.pattern === 'string')) P.C1.push(`retention ${c.key}:pattern 必須是字串(按名字歸類)或 null(成員由列的 retain 指名)`)
      else if (c.pattern) { try { new RegExp(c.pattern) } catch { P.C1.push(`retention ${c.key}:pattern 不是合法的正規式`) } }
    }
    const specKeys = retentionSpecKeys(specText(retention.spec))
    if (specKeys == null) P.C1.push(`保留類別的規格 ${retention.spec} 讀不到`)
    else {
      for (const k of catKeys) if (!specKeys.has(k)) P.C1.push(`retention 的 ${k} 在 ${retention.spec} 沒有對應的一類(標題寫成「### N. \`${k}\` — …」並寫理由)`)
      for (const k of specKeys) if (!catKeys.has(k)) P.C1.push(`${retention.spec} 有一類 \`${k}\`,分類表 retention 沒有 —— 規格與分類表兩邊要一致`)
    }
  }
  for (const r of rows) {
    if (r?.retain === undefined) continue
    if (typeof r.retain !== 'string' || !catKeys.has(r.retain)) P.C1.push(`${r.match}:retain「${r.retain}」不是分類表 retention 的任何一類`)
  }

  // 需要登記的名字
  const need = new Map() // name → 原因
  for (const n of m.globalDecls.keys()) need.set(n, '整頁生效的宣告')
  for (const r of m.reads) {
    if (!r.isDs || m.aliases.has(r.raw) || m.globalDecls.has(r.name)) continue
    const df = m.declFolders.get(r.name)
    if (!df || !df.has(r.folder)) need.set(r.name, need.get(r.name) ?? `在宣告它的資料夾以外被讀(${r.folder})`)
  }
  // C1(跨元件傳值,2026-11-15 稽核 P23 第 4 個盲點):每個讀者資料夾自己也有宣告時,上面那條看不到 ——
  // 同一個名字在 ≥2 個資料夾有宣告(轉接名不算)、設計系統又有人讀,就是跨元件傳值,要登記(錨:--item-prefix-slot)
  for (const [n, fs] of m.valueDeclFolders) {
    if (fs.size < 2 || need.has(n)) continue
    if (m.reads.some((r) => r.isDs && r.name === n)) need.set(n, `宣告在 ${fs.size} 個資料夾(${[...fs].sort().join(' / ')})、設計系統有人讀 —— 跨元件傳值`)
  }
  for (const [n, why] of need) {
    const hit = look(n)
    if (hit.length === 0) P.C1.push(`${n} 沒有登記(${why})—— 在分類表加一列`)
    else if (hit.length > 1) P.C1.push(`${n} 同時吻合 ${hit.length} 列一樣長的 match(${hit.map((h) => h.match).join(' / ')})`)
  }
  for (const [a, at] of m.aliases) {
    const target = m.resolve(a)
    const hit = look(target)
    if (!(hit.length === 1 && real(hit[0]))) P.C1.push(`轉接名 ${a}(${dsRel(at.path)}:${at.line})指向 ${target},但 ${target} 沒有登記`)
  }
  const usedRows = new Set()
  for (const n of need.keys()) for (const h of look(n)) usedRows.add(h)
  for (const r of rows) if (typeof r?.match === 'string' && r.class !== 'ignore' && !usedRows.has(r)) P.C1.push(`分類表的 ${r.match} 對不到任何需要登記的名字(死列;名字退場就刪這一列)`)

  // 相對 main 新增
  const mainNames = ctx.mainNames
  const isNew = (n) => mainNames != null && !mainNames.has(n)
  const ownRow = (n) => { const h = look(n); return h.length === 1 ? h[0] : null }
  // 設計系統裡真的存在的資料夾(C2 主人資料夾、C3 target 用)
  const dsFolders = new Set([...ctx.files.keys()].filter((p) => p.startsWith(`${DS_ROOT}/`)).map(folderOf))
  const ownerDirs = (owner) => [`components/${owner}`, `patterns/${owner}`].filter((f) => dsFolders.has(f))
  /** 名字的第一段:`--table-row-sm` → `table`(token-system.spec.md「命名」元件的值的「主人的開頭」) */
  const headOf = (name) => name.replace(/^--/, '').split(/[-_]/)[0]
  const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

  // C2
  for (const n of need.keys()) {
    if (!isNew(n)) continue
    const r = ownRow(n)
    if (r && r.class === 'ignore' && isPrefixRow(r)) continue
    if (!r || r.match !== n) { P.C2.push(`${n} 是新名字,分類表要有它完整名字的一列(現在${r ? `只靠開頭 ${r.match} 那列` : '沒有任何一列'}對到)`); continue }
    if (typeof r.why !== 'string' || !r.why.trim()) { P.C2.push(`${n} 是新名字,why 不可空`); continue }
    if (r.class === 'shared') {
      const scaleOk = typeof r.scale === 'string' && rows.some((x) => x !== r && x.match === r.scale && x.class === 'shared')
      let readerOk = false
      if (typeof r.secondReader === 'string') {
        const t = ctx.files.get(`${DS_ROOT}/${r.secondReader}`)
        readerOk = t != null && m.reads.some((x) => x.path === `${DS_ROOT}/${r.secondReader}` && x.name === n)
      }
      if (!scaleOk && !readerOk) P.C2.push(`${n} 登記成共用刻度,要寫出它屬於哪一組既有刻度(scale = 另一列共用刻度的 match)或第二個讀者(secondReader = 真的讀它的檔)`)
    }
    // 2026-11-16 規則 1:新名字一定要有住處。home 是 null = 沒有預設宣告,讀的地方只能各自帶後備值 = 同一個值好幾份(規則 2)
    if (r.class !== 'ignore' && r.home == null) P.C2.push(`${n} 是新名字,分類表該列沒有住處(home 是 null)—— 規則 1:預設宣告要有一個住處;沒有預設宣告、靠讀的地方各帶後備值 = 同一個值好幾份(token-system.spec.md「三條規則」)`)
    // 2026-11-16「命名」元件的值:規格住主人資料夾、名字用主人的開頭(分類表裡同主人其他列的第一段;沒有其他列 → 主人名字的 kebab 寫法)
    if (r.class === 'component') {
      const own = ownerDirs(r.owner)
      const specFolder = typeof r.spec === 'string' ? folderOf(`${DS_ROOT}/${r.spec}`) : null
      if (!own.length) P.C2.push(`${n} 是新的元件的值,主人 ${r.owner} 對不到任何資料夾(components/${r.owner} 或 patterns/${r.owner})`)
      else if (!own.includes(specFolder)) P.C2.push(`${n} 是新的元件的值,說明它的規格 ${r.spec} 不在主人 ${r.owner} 的資料夾(${own.join(' / ')})—— token-system.spec.md「命名」元件的值`)
      const others = rows.filter((x) => x !== r && typeof x?.match === 'string' && x.class !== 'ignore' && x.owner === r.owner)
      if (others.length) {
        const heads = [...new Set(others.map((x) => headOf(x.match)))]
        if (!heads.includes(headOf(n))) P.C2.push(`${n} 是新的元件的值,開頭 --${headOf(n)}- 不是主人 ${r.owner} 在分類表已經在用的開頭(${heads.map((h) => `--${h}-`).join(' / ')})—— token-system.spec.md「命名」元件的值`)
      } else if (!n.startsWith(`--${kebab(r.owner)}-`)) {
        P.C2.push(`${n} 是新的元件的值,主人 ${r.owner} 在分類表還沒有其他列 —— 名字要以 --${kebab(r.owner)}- 開頭(主人名字的 kebab 寫法;token-system.spec.md「命名」元件的值)`)
      }
    }
  }

  // C3
  for (const [n, list] of m.globalDecls) {
    const r = ownRow(n)
    if (!real(r)) continue
    const homes = homesOf(r)
    for (const d of list) if (!homes.includes(d.path)) P.C3.push(`${n} 宣告在 ${dsRel(d.path)}:${d.line},分類表登記的住處是 ${homes.map(dsRel).join(' / ') || '(無預設宣告)'}`)
  }
  for (const r of rows) {
    if (!real(r) || !usedRows.has(r)) continue
    const names = [...need.keys()].filter((n) => ownRow(n) === r)
    for (const h of homesOf(r)) {
      if (!ctx.files.has(h)) { P.C3.push(`${r.match} 登記的住處 ${dsRel(h)} 不存在`); continue }
      if (!names.some((n) => (m.allDecls.get(n) ?? []).some((d) => d.path === h))) P.C3.push(`${r.match} 登記的住處 ${dsRel(h)} 沒有宣告它(住處過期)`)
    }
  }
  // C3(原料 / 共用刻度住 tokens/,2026-11-16;token-system.spec.md「擺放」):全部列都查,home 與 target 每一個路徑
  for (const r of rows) {
    if (!real(r) || typeof r?.match !== 'string' || (r.class !== 'raw' && r.class !== 'shared')) continue
    for (const p of new Set([...homesOf(r), ...targetsOf(r)])) {
      if (!dsRel(p).startsWith('tokens/')) P.C3.push(`${r.match} 是${r.class === 'raw' ? '原料' : '共用刻度'},住處 ${dsRel(p)} 不在 tokens/ 底下 —— 原料、共用刻度住 tokens/<類別>/(token-system.spec.md「擺放」)`)
    }
  }
  // C3(後備值不分家,2026-11-16;token-system.spec.md 規則 2):同一顆登記的名字,讀的地方寫 var(--x, 預設) 的設計系統執行期檔
  // (CSS 去掉註解、程式只看字串、不含 stories)有兩個以上 → 同一個值好幾份。補這條時已存在的副本在 known.fallbackCopies,只能變短。
  // 單位是 `名字|檔`(同 productWrites;2026-11-16 審查 S1):以名字為單位時,已登記的名字在新的檔多一份後備值也不紅。
  const fallbackFiles = new Map()
  for (const r of m.reads) {
    if (!r.isDs || !r.fallback || !need.has(r.name) || !real(ownRow(r.name))) continue
    if (!fallbackFiles.has(r.name)) fallbackFiles.set(r.name, new Set())
    fallbackFiles.get(r.name).add(r.path)
  }
  const fallbackCopies = [...fallbackFiles].filter(([, fs]) => fs.size >= 2).flatMap(([n, fs]) => [...fs].map((p) => `${n}|${dsRel(p)}`)).sort()
  ratchet(P.C3, 'fallbackCopies', fallbackCopies, known.fallbackCopies, ctx.mainRegistry?.known?.fallbackCopies, ctx.mainRegistry, (k) => {
    const [n, p] = k.split('|')
    const all = [...(fallbackFiles.get(n) ?? [])].map(dsRel).sort()
    return `${n} 的後備值 var(${n}, …) 寫在 ${p}(這個名字共 ${all.length} 個檔寫後備值:${all.join(' / ')})—— 同一個值好幾份(規則 2):預設在住處宣告一次,讀的地方不帶後備值`
  })
  // C3(target):預定住處只能在主人的資料夾 —— C9 拿 home 與 target 的資料夾當「主人」,target 指錯資料夾就會把別人當主人而放行
  for (const r of rows) {
    if (!real(r) || typeof r?.match !== 'string') continue
    const targets = targetsOf(r)
    if (!targets.length) continue
    if (r.class === 'component') {
      const own = ownerDirs(r.owner)
      if (!own.length) { P.C3.push(`${r.match} 有 target,但主人 ${r.owner} 對不到任何資料夾(components/${r.owner} 或 patterns/${r.owner})`); continue }
      for (const t of targets) if (!own.includes(folderOf(t))) P.C3.push(`${r.match} 的 target ${dsRel(t)} 不在主人 ${r.owner} 的資料夾(${own.join(' / ')})`)
    } else {
      const homes = homesOf(r)
      for (const t of targets) if (!homes.includes(t)) P.C3.push(`${r.match} 是${r.class === 'raw' ? '原料' : '共用刻度'},不搬家:target ${dsRel(t)} 必須等於 home(${homes.map(dsRel).join(' / ') || '無'})`)
    }
  }
  // C3(元件的值住主人資料夾,2026-11-16 審查 M1;token-system.spec.md 規則 1 / 「擺放」):全部列都查。
  // home 不在主人資料夾的只放行兩種:搬家中(target 每一個都在主人資料夾,搬完改 home;--selftest 的 --fixture-parked-gap)、
  // 執行期寫值(home 全是寫它的程式檔、設計系統沒有任何 CSS 宣告它;例 --tag-max-inline-size 由裝 Tag 的元件量出可用寬後寫入)。
  // 原本只驗 target,home 寄住在共用檔、target 留 null 的新元件的值照樣全綠(審查實測 B7)。
  // 執行期寫值這種另驗反方向(審查 S2):home 就是「寫它的檔」的清單,設計系統執行期檔裡每一個寫它的檔都要列在 home
  // (原本只驗「列出的檔真的寫了它」,第三個元件寫它、沒列進 home 也綠 —— 審查實測 B8)。
  const isCodeFile = (p) => /\.(ts|tsx)$/.test(p)
  for (const r of rows) {
    if (!real(r) || typeof r?.match !== 'string' || r.class !== 'component') continue
    const homes = homesOf(r)
    const own = ownerDirs(r.owner)
    const away = homes.filter((h) => !own.includes(folderOf(h)))
    if (!away.length) continue
    const targets = targetsOf(r)
    const moving = targets.length > 0 && targets.every((t) => own.includes(folderOf(t)))
    const decls = [...need.keys()].filter((n) => ownRow(n) === r).flatMap((n) => m.allDecls.get(n) ?? [])
    const runtime = homes.every(isCodeFile) && !decls.some((d) => d.path.endsWith('.css'))
    if (!moving && !runtime) {
      P.C3.push(`${r.match} 是元件的值,住處 ${away.map(dsRel).join(' / ')} 不在主人 ${r.owner} 的資料夾(${own.join(' / ') || '對不到任何資料夾'}),也不是可以不在主人那裡的兩種:搬家中(target 指向主人資料夾)、執行期才由別的元件寫值(home 全是寫它的程式檔、沒有 CSS 預設宣告)—— token-system.spec.md 規則 1`)
      continue
    }
    if (!runtime) continue
    const unlisted = new Map()
    for (const d of decls) if (d.kind === 'code' && !homes.includes(d.path) && !unlisted.has(d.path)) unlisted.set(d.path, d)
    for (const [p, d] of unlisted) P.C3.push(`${d.name} 由 ${dsRel(p)}:${d.line} 寫入,但 ${r.match} 是執行期寫值的元件的值,分類表 home 沒列這個檔 —— 住處 = 每一個寫它的檔(token-system.spec.md「擺放」)`)
  }

  // C4
  const missingSpec = []
  for (const n of need.keys()) {
    const r = ownRow(n)
    if (!real(r)) continue
    const t = specText(r.spec)
    if (t == null) { P.C4.push(`${n} 登記的規格 ${r.spec} 不存在`); continue }
    if (isNew(n)) { if (!specHasWhole(t, n)) P.C4.push(`${n} 是新名字,登記的規格 ${r.spec} 裡找不到它完整的名字`) }
    else if (!specCovers(t, n)) missingSpec.push(n)
  }
  ratchet(P.C4, 'missingSpec', missingSpec, known.missingSpec, ctx.mainRegistry?.known?.missingSpec, ctx.mainRegistry, (n) => `${n} 在登記的規格裡完全找不到(新的缺漏;補進規格)`)

  // C5
  const missingRestore = []
  for (const [n, list] of m.globalDecls) {
    const roots = new Set(list.filter((d) => d.block === 'root').map((d) => d.path))
    for (const d of list.filter((x) => x.block === 'density-lg' || x.block === 'theme-dark')) {
      if (!roots.has(d.path)) P.C5.push(`${n} 的${d.block === 'theme-dark' ? '深色主題' : '大密度'}覆寫在 ${dsRel(d.path)}:${d.line},預設值不在同一個檔`)
    }
    for (const d of list.filter((x) => x.block === 'density-lg')) {
      if (!list.some((x) => x.block === 'density-md' && x.path === d.path)) missingRestore.push(n)
    }
  }
  ratchet(P.C5, 'missingRestore', [...new Set(missingRestore)], known.missingRestore, ctx.mainRegistry?.known?.missingRestore, ctx.mainRegistry, (n) => `${n} 有大密度覆寫,但同一個檔的「鎖回一般密度」段沒有它`)

  // C6
  const importedBy = new Map()
  for (const e of m.entries) {
    if (!e.isDs) continue
    for (const spec of e.imports) {
      if (!spec.startsWith('.')) continue
      const target = posix.normalize(posix.join(posix.dirname(e.path), spec))
      if (target !== e.path) { if (!importedBy.has(target)) importedBy.set(target, []); importedBy.get(target).push(e.path) }
    }
  }
  for (const p of ctx.files.keys()) {
    if (!p.startsWith(`${DS_ROOT}/`) || !p.endsWith('.css') || dsRel(p) === AGGREGATOR) continue
    if (!importedBy.has(p)) P.C6.push(`${dsRel(p)} 沒進 ${AGGREGATOR},也沒有任何設計系統程式匯入它 —— 產品拿不到(2026-05-26 事故);跑 node scripts/gen-figma-make-artifacts.mjs 或在元件程式 import`)
  }

  // C7
  const productRead = [], productWrite = [], dsRaw = []
  const productDeclared = new Set(m.entries.filter((e) => !e.isDs).flatMap((e) => e.decls.map((d) => d.name)))
  for (const r of m.reads) {
    // 只看 token:設計系統這邊 = 整頁生效 / 跨資料夾被讀的名字(元件自己宣告自己讀的區域變數,例:圖表的 --color-bg,不是 token);
    // 產品這邊 = 上述名字,加上產品自己沒宣告、卻吻合分類表某列的名字(例:讀一個根本不存在的 --color-teal-6 也是讀原料的寫法)
    if (r.isDs ? !need.has(r.name) : !(need.has(r.name) || (!productDeclared.has(r.name) && look(r.name).length))) continue
    const row = ownRow(r.name)
    if (!real(row)) continue
    if (!r.isDs && row.product === 'no') productRead.push(`${r.path}|${r.name}`)
    if (r.isDs && row.class === 'raw' && /^(components|patterns|styles)(\/|$)/.test(r.folder) && !(Array.isArray(row.dsReaders) ? row.dsReaders.includes(r.folder) : row.dsReaders === 'any')) dsRaw.push(`${dsRel(r.path)}|${r.name}`)
  }
  for (const e of m.entries) {
    if (e.isDs) continue
    for (const d of e.decls) {
      if (d.kind === 'alias' || !need.has(m.resolve(d.name))) continue
      const row = ownRow(m.resolve(d.name))
      // 產品不寫任何 token(2026-11-16,主題甲;範圍讀成「任何」是 AI 推導 ①,見 token-system.spec.md「誰可以讀」):登記的名字一律不准寫,不再看 product 欄
      if (real(row)) productWrite.push(`${e.path}|${d.name}`)
    }
  }
  // C7(丙)主人規格點名 ↔ 分類表 product(兩個方向都比)
  const namedCache = new Map()
  const namedIn = (spec) => {
    if (!namedCache.has(spec)) {
      const out = new Set()
      for (const line of (specText(spec) ?? '').split('\n')) {
        for (let i = line.indexOf(NAMED); i >= 0; i = line.indexOf(NAMED, i + NAMED.length)) {
          for (const mm of line.slice(i + NAMED.length).split('。')[0].matchAll(/--[A-Za-z0-9_-]+/g)) out.add(mm[0])
        }
      }
      namedCache.set(spec, out)
    }
    return namedCache.get(spec)
  }
  for (const sp of new Set(rows.filter((r) => r?.class === 'component' && typeof r.spec === 'string').map((r) => r.spec))) {
    for (const n of namedIn(sp)) {
      const r = ownRow(n)
      const why = !r ? '分類表沒有這個名字' : r.class !== 'component' ? `分類表登記成 ${r.class}(點名只給元件的值)` : r.spec !== sp ? `分類表登記的主人規格是 ${r.spec}` : r.product === 'no' ? '分類表該列 product 是 no' : null
      if (why) P.C7.push(`${sp} 點名 ${n} 產品可讀,但${why} —— 兩邊要一致`)
    }
  }
  for (const n of need.keys()) {
    const r = ownRow(n)
    if (!real(r) || r.class !== 'component' || r.product === 'no') continue
    if (!namedIn(r.spec).has(n)) P.C7.push(`${n} 分類表寫產品可讀(${r.product}),但主人規格 ${r.spec} 沒有點名(一句以「${NAMED}」開頭、到句號為止、寫完整名字)`)
  }
  ratchet(P.C7, 'productReads', [...new Set(productRead)], known.productReads, ctx.mainRegistry?.known?.productReads, ctx.mainRegistry, (k) => `產品端讀了不開放給產品的名字:${k.replace('|', ' 讀 ')}`)
  ratchet(P.C7, 'productWrites', [...new Set(productWrite)], known.productWrites, ctx.mainRegistry?.known?.productWrites, ctx.mainRegistry, (k) => `產品端寫了登記的 token(產品不寫任何 token:依據主題甲,範圍的讀法見 token-system.spec.md「誰可以讀」AI 推導 ①):${k.replace('|', ' 寫 ')}`)
  ratchet(P.C7, 'dsRawColorReads', [...new Set(dsRaw)], known.dsRawColorReads, ctx.mainRegistry?.known?.dsRawColorReads, ctx.mainRegistry, (k) => `設計系統元件直接讀原料:${k.replace('|', ' 讀 ')}(改用語意色,或在該列 dsReaders 點名)`)

  // C9 只有主人自己在讀、又不切換的值,不該有全系統的名字(token-system.spec.md 判斷流程第 0 題)。
  // 2026-11-11 第三階段收完 6 顆之後全面打開:分類表登記成「元件的值」的名字,不分新舊全部查;
  // 其他類別照第一階段只查相對 main 新增的名字 —— 既有的原料 / 共用刻度「以一組為單位判」(token-system.spec.md
  // 判斷流程「讓答案唯一的兩個補充規定」),一組裡某一顆目前只有同組的人讀(色票被語意色讀)或暫時沒人讀,
  // 仍是那組刻度的一員,不逐顆問「只有誰在讀」。
  // 「主人」= 該列 home 與 target 所在的資料夾:寄住在共用檔(home = tokens/uiSize)、只有主人元件(target 那個資料夾)
  // 在讀的,一樣算只有主人在讀 —— 第三階段收回的 6 顆正是這種(只看 home 會把主人元件當成「別人」而放行)。
  //
  // 「會不會切換」(2026-11-15 補):有密度 / 主題段的算;只有 :root 一段、但值是用 var() 由會切換的名字組出來的也算
  // (衍生值段 `:root, [data-density], … { --tab-height-lg: var(--chrome-header-height) }` 選擇器裡沒有 `=`,
  // 會被當成一般 :root 段 —— 不補這條,依定義跟著標頭高切換的 lg 分頁高會被誤判成「不切換」)。
  const switchMemo = new Map()
  const switches = (n, depth = 0) => {
    if (switchMemo.has(n)) return switchMemo.get(n)
    const list = m.globalDecls.get(n) ?? []
    let s = list.some((d) => d.block !== 'root')
    if (!s && depth < 8) s = list.some((d) => [...String(d.value ?? '').matchAll(new RegExp(`var\\(\\s*(${NAME})`, 'g'))].some((x) => x[1] !== n && switches(x[1], depth + 1)))
    switchMemo.set(n, s)
    return s
  }
  // 執行期讀者:轉接名自己那一行不算;字串拼出來的開頭(`var(--table-row-${size})`)吻合的算(C9 丙用)
  const realReads = (n) => m.reads.filter((x) => x.name === n && !m.aliasSelfRead(x))
  const prefixRead = (n) => m.prefixReads.some((p) => n.startsWith(p.prefix))
  for (const [n, list] of m.globalDecls) {
    const r = ownRow(n)
    if (!real(r)) continue
    const fresh = isNew(n)
    if (!fresh && r.class !== 'component') continue
    if (switches(n)) continue
    const ownerFolders = new Set([...homesOf(r), ...targetsOf(r)].map(folderOf))
    const reads = m.reads.filter((x) => x.name === n)
    const readerFolders = new Set(reads.map((x) => x.folder))
    // 2026-11-16 審查 M2:第 0 題 (c) 含「設計系統裡別的元件要寫它」。主人資料夾以外的設計系統執行期檔寫它
    // (程式寫值 / 別的資料夾的 CSS 局部宣告;整頁生效的宣告歸 C3 管)也是主人以外的參與者 —— 原本只看讀者,
    // 照規格開了 token 的值會被這裡叫回去寫成常數,而別的元件要寫它就不可能是常數(審查實測 B9)。
    const writerFolders = new Set((m.allDecls.get(n) ?? []).filter((d) => d.kind === 'code' || d.kind === 'local').map((d) => d.folder).filter((f) => !ownerFolders.has(f)))
    if (![...readerFolders, ...writerFolders].some((f) => !ownerFolders.has(f))) {
      P.C9.push(`${n}${fresh ? ' 是新名字,' : ' '}只有 ${[...readerFolders].join(' / ') || '(沒有人)'} 在讀、主人以外沒有設計系統程式寫它(主人:${[...ownerFolders].join(' / ')})、也不隨密度或主題切換 —— 寫成元件自己的常數,不開全系統的名字`)
      continue
    }
    // 主人以外有人寫它 → 值不是常數,(甲)「收成讀者自己的常數」不成立
    if (writerFolders.size) continue
    // (甲)2026-11-15(稽核 P23 第 1 個盲點,照反查更正收窄):讀者全在同一個「非主人」資料夾,而且那裡只在程式裡量它的值
    // (字串寫名字、getPropertyValue 這類,沒有任何 var() 讀取)→ 它其實是那個讀者自己的常數,只是借主人的名字寄放。
    // 錨:--sidebar-width-min(只有 AppShell 用 JS 量值探針讀,2026-11-13 收成 AppShell 的常數)。
    // 讀者用 var() 讀、或讀者不只一個資料夾 → 第 0 題 (c) 成立,放行。
    if (readerFolders.size === 1 && !ownerFolders.has([...readerFolders][0]) && reads.every((x) => x.how === 'quoted')) {
      P.C9.push(`${n} 唯一的讀者 ${[...readerFolders][0]} 只在程式裡量它的值(沒有任何 var() 讀取)、也不隨密度或主題切換 —— 收成那個讀者自己的常數(甲)`)
    }
  }
  // (乙)2026-11-15(稽核 P23 第 2 個盲點):只被同一個檔裡別的名字的 var() 公式讀 = 公式的中間值。名字不寫明它是輸入,
  // 讀者會以為它決定了別的東西(錨:--sidebar-menu-icon-size 叫「選單圖示尺寸」,其實只是收合寬公式的一格,畫出來的圖示不讀它)。
  // 要求分類表該列 why 寫出「中間值」;共用刻度與元件的值都查(有密度段的也查 —— 舊版 C9 一律跳過的正是這種)。
  const formulaReader = (x, n) => {
    if (x.how !== 'var' || !x.path.endsWith('.css')) return false
    const declsHere = (m.allDecls.get(n) ?? []).some((d) => d.path === x.path)
    if (!declsHere) return false
    const e = m.entries.find((en) => en.path === x.path)
    return (e?.decls ?? []).some((d) => d.kind !== 'alias' && d.name !== n && d.line === x.line && new RegExp(`var\\(\\s*${esc(n)}\\s*[,)]`).test(String(d.value ?? '')))
  }
  for (const n of need.keys()) {
    const r = ownRow(n)
    if (!real(r) || r.class === 'raw' || !m.globalDecls.has(n)) continue
    const reads = realReads(n)
    if (!reads.length || prefixRead(n)) continue
    if (reads.every((x) => formulaReader(x, n)) && !/中間值/.test(r.why ?? '')) {
      P.C9.push(`${n} 只被同檔的 var() 公式讀(${[...new Set(reads.map((x) => `${dsRel(x.path)}:${x.line}`))].join(' / ')})—— 它是公式的中間值:名字或分類表該列 why 要寫明「中間值」(乙)`)
    }
  }
  // (丙)2026-11-15(稽核 P23 第 3 個盲點):既有名字沒有任何執行期讀者(轉接名自己那一行不算、字串拼出的開頭吻合算讀)。
  // 元件的值:零讀者就紅。共用刻度:照 token-system.spec.md「一組」的窄讀法 —— 名字最後一段是級距或狀態
  // (xs / sm / md / lg / 數字 / hover / active / …)、而且同一組有別的名字被讀,算組員放行;否則紅。
  // 原料不查(以一組為單位,色階整組保留)。設計系統以外的產品 repo 看不到 → 登記在 known.productExternal 的名字算有人讀。
  const external = new Set((known.productExternal ?? []).flatMap((x) => String(x?.name ?? '').split('/').map((s) => s.trim())).filter(Boolean))
  const GROUP_STEP = /^(?:xs|sm|md|lg|xl|2xl|\d+|hover|active|focus|subtle|emphasis|disabled|text|foreground)$/
  const readBy = (n) => realReads(n).length > 0 || prefixRead(n) || external.has(n)
  // 既有的零讀者共用刻度(閘補上這條時就已存在的)列在 known.unread,只能變短;新長出來的直接紅。
  // 分類表該列寫了保留類別 retain 的不算(2026-11-15:--brand 是產品層預留,設計系統本來就不讀;理由住 orphan-tokens.spec.md)。
  const reportedC9 = new Set(P.C9.map((p) => p.split(' ')[0]))
  const unread = []
  for (const n of need.keys()) {
    const r = ownRow(n)
    // 產品可讀的名字不進(丙)(2026-11-15 審查):產品可讀名字的退場由 user 逐字決定(決策權,AGENTS.md「自主執行 canonical」把 token 列為產品決策),
    // 讀者數不是 AI 自己退場的依據(orphan-tokens.spec.md「退場流程」(一)、C10)
    if (!real(r) || r.class === 'raw' || r.retain || (r.product && r.product !== 'no') || !m.globalDecls.has(n) || readBy(n) || reportedC9.has(n)) continue
    if (r.class === 'shared') {
      const cut = n.lastIndexOf('-')
      const step = n.slice(cut + 1), stem = n.slice(0, cut)
      const siblingRead = [...need.keys()].some((x) => x !== n && (x === stem || x.startsWith(`${stem}-`)) && readBy(x))
      if (GROUP_STEP.test(step) && siblingRead) continue
    }
    unread.push(n)
  }
  ratchet(P.C9, 'unread', unread, known.unread, ctx.mainRegistry?.known?.unread, ctx.mainRegistry, (n) => `${n} 沒有任何執行期讀者(設計系統、apps/ 都沒有;轉接名自己那一行不算)${ownRow(n)?.class === 'shared' ? '、也不是一組級距 / 狀態裡有人讀的組員' : ''} —— 退場(刪宣告與分類表那一列),或產品端真的在讀就登記 known.productExternal(丙)`)

  // C10 產品可讀的名字不得悄悄消失(2026-11-15)。理由是決策權:產品可讀名字的退場由 user 逐字決定(AGENTS.md「自主執行 canonical」
  // 把 token / 視覺規範列為產品決策),AI 不自己判斷「沒人用」就刪。退場本身不留舊名(相容政策),登記在變更帳本。
  // 對照每個基準(與 main 的分岔點、HEAD):基準有宣告(整頁生效的宣告或 Tailwind 轉接名)、分類表登記產品可讀,
  // 工作樹不再宣告 → 紅;登記在分類表 retired(user 原話)的放行。基準沒有分類表 → 用工作樹的分類表查 product。
  // 要不要「先保留一版」由相容政策決定(scripts/lib/compat-policy.mjs,讀 packages/design-system/package.json 的版本;
  // 規則文字 props-naming.md「相容政策」):0.x / 預發布版同一版刪,不要求 deprecatedIn / removedIn;1.0 以後兩個版本必填且不同。
  // 讀不到政策 = 紅(不得當成某一種政策放行)。
  const policy = ctx.compatPolicy
  if (!policy || (policy.mode !== 'no-compat' && policy.mode !== 'alias-one-release')) P.C10.push(`讀不到相容政策(${ctx.compatPolicyError ?? '沒有傳入'})—— 不知道退場要不要先保留一版,不是放行(${POLICY_DOC})`)
  const retiredOk = new Set()
  if (reg?.retired !== undefined && !Array.isArray(reg.retired)) P.C10.push('分類表 retired 必須是陣列')
  for (const e of Array.isArray(reg?.retired) ? reg.retired : []) {
    const required = ['name', 'quote', 'quoteDate', ...(policy?.keepOldNames ? ['deprecatedIn', 'removedIn'] : [])]
    const missing = required.filter((k) => typeof e?.[k] !== 'string' || !e[k].trim())
    if (missing.length) { P.C10.push(`retired 有一筆缺欄位(${missing.join(' / ')}):${JSON.stringify(e?.name ?? e)} —— 要 user 原話(逐字)與日期${policy?.keepOldNames ? '、標 deprecated 的版本、刪掉的版本(1.0 以後的正式版先保留一版)' : ''}`); continue }
    if (policy?.keepOldNames && e.deprecatedIn.trim() === e.removedIn.trim()) { P.C10.push(`retired ${e.name}:deprecatedIn 與 removedIn 是同一版 —— ${policy.version} 是正式版,相容政策要先保留一版標 deprecated,下一版才刪(${POLICY_DOC})`); continue }
    if (e.renamedTo !== undefined && (typeof e.renamedTo !== 'string' || !e.renamedTo.trim())) { P.C10.push(`retired ${e.name}:renamedTo 是空的 —— 改名要寫新名字,刪除就不寫這一欄`); continue }
    if (typeof e.renamedTo === 'string' && !m.allDecls.has(e.renamedTo.trim())) { P.C10.push(`retired ${e.name}:登記改名成 ${e.renamedTo},但工作樹沒有宣告 ${e.renamedTo} —— 新名字要同一版加上`); continue }
    retiredOk.add(e.name)
  }
  const goneReported = new Set()
  for (const base of ctx.bases ?? []) {
    const bm = buildModel(base.files)
    // 查「產品可讀嗎」:每一份拿得到的分類表(這個基準、其他基準、工作樹)都查,任一份說產品可讀就算可讀(取最保守)。
    // 2026-11-15 審查:只用工作樹的分類表時,把名字連同分類表那一列一起刪(或改成 product: no)就會被放行。
    // 剩下的洞:所有基準都沒有分類表、工作樹又刪了那一列 —— 只發生在分類表第一次進 main 的這個 PR;本機跑時 HEAD 有分類表擋得住。
    const allRowSets = [base.registry?.rows, ...(ctx.bases ?? []).map((b) => b.registry?.rows), rows].filter(Array.isArray)
    const rowOf = (n) => {
      const hits = allRowSets.map((rs) => lookup(rs, n)).filter((h) => h.length === 1).map((h) => h[0])
      return hits.find((h) => real(h) && h.product !== 'no') ?? hits[0] ?? null
    }
    for (const [n, list] of bm.allDecls) {
      if (m.allDecls.has(n) || retiredOk.has(n) || goneReported.has(n)) continue
      const alias = list.some((d) => d.kind === 'alias')
      if (!alias && !list.some((d) => d.kind === 'global')) continue
      const target = alias ? bm.resolve(n) : n
      const row = rowOf(target)
      if (!real(row) || row.product === 'no') continue
      goneReported.add(n)
      P.C10.push(`${n}${alias ? `(${target} 的 Tailwind 轉接名)` : ''} 在基準「${base.label}」有宣告、分類表登記產品可讀(${row.match} 列 product: ${row.product}),工作樹不再宣告 —— 產品可讀名字的退場由 user 逐字決定(決策權):在分類表 retired 登記原話(改名加 renamedTo;版本欄看相容政策),並寫進變更帳本 packages/design-system/ds-changes.json(orphan-tokens.spec.md「退場流程」)`)
    }
  }

  // C11 用詞(2026-11-15):清單只讀 color.spec.md「用詞」段「不用的說法」那一行;那一段本身是唯一可以寫出這些字的地方。
  if (ctx.termFiles) {
    const specT = ctx.termFiles.get(TERM_SPEC) ?? ctx.readSpec(TERM_SPEC)
    const banned = termBanned(specT)
    if (!banned.length) P.C11.push(`讀不到 ${dsRel(TERM_SPEC)}「用詞」段「不用的說法」那一行的反引號字 —— 沒有清單就不能判(INSTRUMENT,不是放行)`)
    for (const [p, text] of ctx.termFiles) {
      let inTerm = false
      text.split('\n').forEach((line, i) => {
        if (p === TERM_SPEC && /^## /.test(line)) inTerm = TERM_SECTION.test(line)
        if (inTerm) return
        // 「…」裡是別人的原話(user 原話、外部文件引文),一律逐字(M36(a)),不算 DS 自己的用詞(2026-11-15 審查)
        const low = line.replace(/「[^」]*」/g, ' ').toLowerCase()
        for (const w of banned) {
          if (low.includes(w.toLowerCase())) P.C11.push(`${p}:${i + 1} 用了「${w}」—— 品牌色(--brand)、互動色(--primary)、主題(亮 / 暗)是三件事,照 ${dsRel(TERM_SPEC)}「用詞」改寫`)
        }
      })
    }
  }

  return { problems: P, info: { need, model: m, missingSpec, missingRestore: [...new Set(missingRestore)], productReads: [...new Set(productRead)], productWrites: [...new Set(productWrite)], dsRawColorReads: [...new Set(dsRaw)], unread } }
}

/** 已知名單:現況違規 ⊆ 名單;名單裡的都還是違規(修好就刪);main 有分類表時,名單不得比 main 多。 */
function ratchet(out, key, current, listed, mainListed, mainRegistry, describe) {
  const L = new Set((listed ?? []).map(String))
  const cur = new Set(current)
  for (const k of cur) if (!L.has(k)) out.push(describe(k))
  for (const k of L) if (!cur.has(k)) out.push(`已知名單 known.${key} 裡的 ${k} 已經不是違規了 —— 從名單刪掉(名單只能變短)`)
  if (mainRegistry) {
    const M = new Set((mainListed ?? []).map(String))
    for (const k of L) if (!M.has(k)) out.push(`已知名單 known.${key} 比 main 多了 ${k} —— 名單只能變短,新違規要修,不能登記`)
  }
}

// ── 執行 ─────────────────────────────────────────────────────────────────
const readSpecFromDisk = (p) => { try { return readFileSync(join(REPO, p), 'utf8') } catch { return null } }
const readRegistry = (text) => JSON.parse(text)

function mainContext() {
  const ref = resolveBaseRef()
  if (!ref) return { error: '拿不到 origin/main 或 main(簽出要 fetch-depth: 0)' }
  try {
    const mainFiles = readFilesAt(ref)
    const mainNames = buildModel(mainFiles).names
    let mainRegistry
    try { mainRegistry = readRegistry(git(['show', `${ref}:${REGISTRY_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) } catch (e) {
      const msg = String(e.stderr ?? e.message)
      if (/does not exist|exists on disk, but not in/.test(msg)) mainRegistry = undefined
      else throw e
    }
    return { ref, mainNames, mainRegistry }
  } catch (e) { return { error: String(e.message).split('\n')[0].slice(0, 160) } }
}

const LABEL = {
  C1: 'C1 有登記(整頁生效 / 跨資料夾被讀 / 跨元件傳值的名字恰好對到一列;轉接名指向已登記本尊;表本身合法;保留類別 規格 ↔ 分類表 ↔ 各列 retain 一致)',
  C2: 'C2 新名字有自己的一列、理由、住處;元件的值的開頭與規格住處',
  C3: 'C3 宣告的檔案 = 登記的住處;原料 / 共用刻度住 tokens/;元件的值住主人資料夾(搬家中 / 執行期寫值除外,後者每個寫它的檔都在 home);後備值不分家',
  C4: 'C4 新名字完整出現在登記的規格裡;既有缺漏只能變短',
  C5: 'C5 大密度覆寫有回復、覆寫與預設同檔',
  C6: 'C6 樣式檔有進對外彙總檔或被程式匯入',
  C7: 'C7 誰可以讀(產品讀 / 產品不寫 / 設計系統讀原料 / 元件的值主人規格點名 ↔ 分類表)',
  C9: 'C9 不該有全系統的名字:只有主人自己在讀、主人以外沒有人寫、又不切換(含甲:唯一讀者只在程式裡量值)/ 只當同檔公式的中間值卻沒寫明(乙)/ 沒有任何讀者(丙;寫了保留類別 retain 的不算)',
  C10: 'C10 產品可讀的名字(含它的 Tailwind 轉接名)不得悄悄消失:不再宣告就要在分類表 retired 登記 user 原話(版本欄看相容政策)',
  C11: 'C11 用詞:品牌色 / 互動色 / 主題不混用(清單住 color.spec.md「用詞」)',
}

function main() {
  const files = readWorkingFiles()
  let registry
  try { registry = readRegistry(readFileSync(join(REPO, REGISTRY_PATH), 'utf8')) } catch (e) { registry = null; console.log(`✗ 分類表讀不到:${String(e.message).split('\n')[0]}`) }
  const base = mainContext()
  if (base.error) {
    console.log(`✗ INSTRUMENT-FAIL 拿不到 main 的 token 清單:${base.error} —— 不是跳過,是紅(「新增」沒有基準就無從判定)`)
    process.exit(1)
  }
  const bc = baseContexts(base.ref)
  if (bc.error) {
    console.log(`✗ INSTRUMENT-FAIL C10 的對照基準:${bc.error} —— 不是跳過,是紅(沒有基準就看不到哪些名字消失)`)
    process.exit(1)
  }
  const termFiles = readTermFiles()
  const { compatPolicy, compatPolicyError } = loadCompatPolicy()
  const { problems, info } = runChecks({ files, registry, mainNames: base.mainNames, mainRegistry: base.mainRegistry, readSpec: readSpecFromDisk, bases: bc.bases, termFiles, compatPolicy, compatPolicyError })
  if (process.argv.includes('--inventory')) {
    for (const [n, why] of [...info.need].sort()) {
      const h = lookup(registry?.rows ?? [], n)
      const decl = (info.model.allDecls.get(n) ?? []).map((d) => `${dsRel(d.path)}:${d.line}${d.block ? `[${d.block}]` : ''}`).slice(0, 4).join(' ')
      const readers = [...new Set(info.model.reads.filter((r) => r.name === n).map((r) => r.folder))].join(' ')
      console.log(`${n}\t${h.map((x) => x.match).join('|') || '-'}\t${why}\t${decl}\t${readers}`)
    }
    return
  }
  let fail = 0
  for (const [k, list] of Object.entries(problems)) {
    console.log(`${list.length ? '✗' : '✓'} ${LABEL[k]}${list.length ? '' : ''}`)
    for (const p of list) console.log(`    ${p}`)
    fail += list.length
  }
  console.log(`\n基準 ${base.ref}${base.mainRegistry === undefined ? '(main 上還沒有分類表 —— 已知名單從這一版開始只能變短)' : ''};C10 對照 ${bc.bases.map((b) => `${b.label}${b.registry ? '' : '(沒有分類表,用工作樹的)'}`).join(' / ')};C10 相容政策 ${compatPolicy ? `${compatPolicy.mode}(${compatPolicy.version})` : '讀不到'};C11 掃了 ${termFiles.size} 個檔`)
  console.log(`需要登記的名字 ${info.need.size} 個 / 分類表 ${registry?.rows?.length ?? 0} 列 / 已知缺規格 ${info.missingSpec.length} / 已知缺回復 ${info.missingRestore.length} / 掃了 ${files.size} 個檔`)
  console.log(fail ? `✗ ${fail} 項未通過` : '✓ Token 建立不變式:全通過')
  process.exit(fail ? 1 : 0)
}

// ── 對照組 ───────────────────────────────────────────────────────────────
function selftest() {
  const files = readWorkingFiles()
  const registry = readRegistry(readFileSync(join(REPO, REGISTRY_PATH), 'utf8'))
  const mainNames = buildModel(files).names
  const clone = (o) => JSON.parse(JSON.stringify(o))
  const UI = `${DS_ROOT}/tokens/uiSize/uiSize.css`
  const DT = `${DS_ROOT}/components/DataTable/data-table.css`
  const AGG_FILE = `${DS_ROOT}/${AGGREGATOR}`
  const withFiles = (extra, drop = []) => { const f = new Map(files); for (const d of drop) f.delete(d); for (const [k, v] of Object.entries(extra)) f.set(k, v); return f }
  const addRows = (...rows) => { const r = clone(registry); r.rows.push(...rows); return r }
  const appendRoot = (decl) => withFiles({ [UI]: `${files.get(UI)}\n:root { ${decl} }\n` })
  const row = (o) => ({ class: 'component', owner: 'Fixture', home: 'tokens/uiSize/uiSize.css', spec: 'tokens/uiSize/uiSize.spec.md', product: 'no', dsReaders: 'any', why: '對照組', ...o })
  // C10 的基準 = 工作樹本身(現況比自己 → 0 個消失);C11 掃現況的設計系統原始碼與規格
  const termFiles = readTermFiles()
  const selfBase = [{ label: '對照基準(工作樹本身)', files, registry }]
  // 相容政策:每一格明確傳入固定政策 —— 預設 compatPolicyFor('0.1.0-beta.148')(0.x),C10 的正式版格另外傳 compatPolicyFor('1.0.0');
  // 不讀 repo 現在的版本(版號一變,標成「0.x」的格子不能跟著變意思;M37)。讀 repo 的那條路由迴圈後「量具」一格單獨證明。
  const fixedBetaPolicy = compatPolicyFor('0.1.0-beta.148')
  const run = (over) => runChecks({ files, registry, mainNames, mainRegistry: registry, readSpec: readSpecFromDisk, bases: selfBase, termFiles, compatPolicy: fixedBetaPolicy, compatPolicyError: null, ...over })
  const BTN = `${DS_ROOT}/components/Button/fixture-raw.tsx`
  const cases = [
    // C1
    ['C1', true, '--fixture-unregistered', '整頁宣告一個沒登記的名字', () => run({ files: appendRoot('--fixture-unregistered: 1px;') })],
    ['C1', true, '--fixture-tie-a', '兩列一樣長都吻合', () => run({ files: appendRoot('--fixture-tie-a: 1px;'), registry: addRows(row({ match: '--fixture-tie-' }), row({ match: '--fixture-tie-' })) })],
    ['C1', true, '--fixture-code-var', '別的資料夾讀元件程式裡宣告、沒登記的變數', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureA/a.tsx`]: "export const s = { '--fixture-code-var': '1px' }\n", [`${DS_ROOT}/components/FixtureB/b.tsx`]: "export const c = 'w-[var(--fixture-code-var)]'\n" }) })],
    ['C1', false, '--fixture-own-var', '同一個變數只在自己資料夾讀', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureA/a.tsx`]: "export const s = { '--fixture-own-var': '1px' }\n", [`${DS_ROOT}/components/FixtureA/a2.tsx`]: "export const c = 'w-[var(--fixture-own-var)]'\n" }) })],
    ['C1', false, '--spacing-fixture-alias', '轉接名指向已登記本尊', () => run({ files: withFiles({ [UI]: `${files.get(UI)}\n@theme inline { --spacing-fixture-alias: var(--field-height-md); }\n` }) })],
    ['C1', true, '--spacing-fixture-alias', '轉接名指向沒登記的名字', () => run({ files: withFiles({ [UI]: `${files.get(UI)}\n@theme inline { --spacing-fixture-alias: var(--fixture-nobody); }\n` }) })],
    // C2(審查案例 A:在共用尺寸檔加 --field-label-gap,只有一個元件讀)
    ['C2', true, '--tab-height-xl', '開頭已登記、沒有自己那一列(不得靠開頭自動繼承分類)', () => run({ files: appendRoot('--tab-height-xl: 4rem;') })],
    ['C2', true, '--field-label-gap', '有自己那一列但 why 空白', () => run({ files: appendRoot('--field-label-gap: 4px;'), registry: addRows(row({ match: '--field-label-gap', class: 'shared', why: ' ' })) })],
    ['C2', true, '--field-label-gap', '共用刻度沒寫所屬刻度或第二個讀者', () => run({ files: appendRoot('--field-label-gap: 4px;'), registry: addRows(row({ match: '--field-label-gap', class: 'shared', why: '欄位標籤間距' })) })],
    ['C2', false, '--field-label-gap', '寫了理由與所屬刻度', () => run({ files: appendRoot('--field-label-gap: 4px;'), registry: addRows(row({ match: '--field-label-gap', class: 'shared', why: '欄位標籤間距', scale: '--field-height-' })) })],
    // C3(審查案例 D:在按鈕樣式檔加 --field-height-xl)
    ['C3', true, '--field-height-xl', '共用刻度被宣告在元件樣式檔', () => run({ files: withFiles({ [`${DS_ROOT}/components/Button/fixture.css`]: ':root { --field-height-xl: 40px; }\n' }) })],
    ['C3', true, '--sidebar-width', '登記在別處的值被宣告在別的檔', () => run({ files: withFiles({ [`${DS_ROOT}/components/Button/fixture.css`]: ':root { --sidebar-width: 1px; }\n' }) })],
    ['C3', true, '--table-cell-px', '登記的住處過期(住處檔不再宣告它)', () => run({ registry: (() => { const r = clone(registry); r.rows.find((x) => x.match === '--table-cell-px').home = 'components/DataTable/data-table.tsx'; return r })() })],
    ['C3', false, '--sidebar-width', '現況', () => run({})],
    // C3(target)—— 審查 2026-11-11:target 原本沒人驗,C9 卻拿它的資料夾當主人
    ['C3', true, '--tag-height-', '元件的值 target 指到別的元件資料夾', () => run({ registry: (() => { const r = clone(registry); r.rows.find((x) => x.match === '--tag-height-').target = 'components/Avatar/tag.css'; return r })() })],
    ['C3', true, '--field-px', '共用刻度 target ≠ home(共用刻度不搬家)', () => run({ registry: (() => { const r = clone(registry); r.rows.find((x) => x.match === '--field-px').target = 'components/Field/field.css'; return r })() })],
    ['C3', true, '--tag-height-', '主人對不到任何資料夾', () => run({ registry: (() => { const r = clone(registry); r.rows.find((x) => x.match === '--tag-height-').owner = 'NoSuchOwner'; return r })() })],
    ['C3', false, '--tag-height-', '現況:已搬到主人資料夾(home = target = components/Tag/tag.css)', () => run({})],
    // 「檔可以還沒建」這條規則原本拿現況的標籤高當綠的那一筆;標籤高 2026-11-11 搬完(token「2甲」第二批)之後改用夾具,
    // 免得規則還在、卻再也沒有任何一筆在驗它
    ['C3', false, '--fixture-parked-gap', '寄住共用檔、target 在主人資料夾但檔還沒建(還沒搬的就是這樣)', () => run({ files: appendRoot('--fixture-parked-gap: 1px;'), registry: addRows(row({ match: '--fixture-parked-gap', owner: 'Tag', target: 'components/Tag/fixture-not-yet.css' })) })],
    ['C1', true, '--tag-height-', 'target 不是路徑', () => run({ registry: (() => { const r = clone(registry); r.rows.find((x) => x.match === '--tag-height-').target = 5; return r })() })],
    // C4
    ['C4', true, '--fixture-spec-elsewhere', '新名字只出現在別份規格', () => run({ files: appendRoot('--fixture-spec-elsewhere: 1px;'), registry: addRows(row({ match: '--fixture-spec-elsewhere', spec: 'tokens/color/color.spec.md' })) })],
    ['C4', true, '--fixture-half', '新名字剛好是規格裡另一顆的前半段', () => run({ files: appendRoot('--fixture-half: 1px;'), registry: addRows(row({ match: '--fixture-half', spec: 'tokens/fixture.spec.md' })), readSpec: (p) => (p.endsWith('tokens/fixture.spec.md') ? '| `--fixture-half-md` | 1px |' : readSpecFromDisk(p)) })],
    ['C4', false, '--fixture-whole', '新名字完整出現在登記的規格', () => run({ files: appendRoot('--fixture-whole: 1px;'), registry: addRows(row({ match: '--fixture-whole', spec: 'tokens/fixture.spec.md' })), readSpec: (p) => (p.endsWith('tokens/fixture.spec.md') ? '| `--fixture-whole` | 1px |' : readSpecFromDisk(p)) })],
    ['C4', true, '--fixture-listed', '已知名單多出一筆(比 main 長)', () => run({ registry: (() => { const r = clone(registry); r.known.missingSpec.push('--fixture-listed'); return r })() })],
    ['C4', false, String(registry.known?.missingSpec?.[0] ?? '--none'), '已知名單裡的舊名字', () => run({})],
    // C5
    // 列高 2026-11-11 搬到 data-table.css(token「2甲」第四批);注入點跟著住處走(住處搬了還注入舊檔 = 沒改到東西,這條會變成假綠)
    ['C5', true, '--table-row-sm', '拿掉一顆的回復', () => run({ files: withFiles({ [DT]: files.get(DT).replace(/(\[data-density="md"\][^{]*\{[\s\S]*?)--table-row-sm:[^;]*;/, '$1') }) })],
    ['C5', true, '--tab-height-sm', '把覆寫放到另一個檔', () => run({ files: withFiles({ [`${DS_ROOT}/tokens/layoutSpace/layoutSpace.css`]: `${files.get(`${DS_ROOT}/tokens/layoutSpace/layoutSpace.css`)}\n[data-density="lg"] { --tab-height-sm: 2.5rem; }\n` }) })],
    ['C5', false, '--table-row-sm', '現況', () => run({})],
    // C6
    ['C6', true, 'components/FixtureOrphan/orphan.css', '假造一個沒被匯入的元件樣式檔', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/orphan.css`]: '.x { color: red; }\n' }) })],
    ['C6', false, 'components/FixtureOrphan/orphan.css', '同一個檔被元件程式匯入', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/orphan.css`]: '.x { color: red; }\n', [`${DS_ROOT}/components/FixtureOrphan/orphan.tsx`]: "import './orphan.css'\nexport const x = 1\n" }) })],
    // 2026-11-18:Stop hook check_orphan_ds_css 退場,它測試裡 C6 原本沒有的情境搬來這裡(那支的測試檔同 commit 刪掉)
    ['C6', true, 'patterns/header-canonical/header-canonical.css', '彙總檔漏收一支既有樣式檔(2026-05-26 事故原型)', () => { const t = files.get(AGG_FILE); const cut = t.replace("@import './../patterns/header-canonical/header-canonical.css';\n", ''); return run({ files: withFiles({ [AGG_FILE]: cut === t ? `${t}\n/* 注入失敗:彙總檔裡找不到那一行 */\n` : cut }) }) }],
    ['C6', true, 'components/FixtureOrphan/orphan.css', '只在彙總檔的註解裡寫了路徑(舊 hook 用字串比對,這種會放行)', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/orphan.css`]: '.x { color: red; }\n', [AGG_FILE]: `${files.get(AGG_FILE)}\n/* @import './../components/FixtureOrphan/orphan.css'; */\n` }) })],
    ['C6', false, 'components/FixtureOrphan/', '樣式檔被另一支樣式檔 @import,那一支在彙總檔裡(串接)', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/sub.css`]: '.x { color: red; }\n', [`${DS_ROOT}/components/FixtureOrphan/index.css`]: "@import './sub.css';\n", [AGG_FILE]: `${files.get(AGG_FILE)}\n@import './../components/FixtureOrphan/index.css';\n` }) })],
    ['C6', true, 'components/FixtureOrphan/index.css', '同一條串接,串頭沒進彙總檔 → 串頭紅', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/sub.css`]: '.x { color: red; }\n', [`${DS_ROOT}/components/FixtureOrphan/index.css`]: "@import './sub.css';\n" }) })],
    ['C6', false, 'components/FixtureOrphan/sub.css', '同上,被串頭 @import 的那支不重複報', () => run({ files: withFiles({ [`${DS_ROOT}/components/FixtureOrphan/sub.css`]: '.x { color: red; }\n', [`${DS_ROOT}/components/FixtureOrphan/index.css`]: "@import './sub.css';\n" }) })],
    // C7(審查案例 C:按鈕裡寫 --color-teal-6)
    ['C7', true, '--color-teal-6', '產品讀原料色', () => run({ files: withFiles({ 'apps/template/src/fixture-read.tsx': "export const c = 'text-[var(--color-teal-6)]'\n" }) })],
    ['C7', false, '--primary', '產品讀語意色', () => run({ files: withFiles({ 'apps/template/src/fixture-read.tsx': "export const c = 'text-[var(--primary)]'\n" }) })],
    ['C7', true, '--color-teal-6', '按鈕元件讀原料色', () => run({ files: withFiles({ [BTN]: "export const c = 'bg-[var(--color-teal-6)]'\n" }) })],
    ['C7', false, '--color-blue-6', '標籤(已點名)讀分類色', () => run({ files: withFiles({ [`${DS_ROOT}/components/Tag/fixture-raw.tsx`]: "export const c = 'bg-[var(--color-blue-6)]'\n" }) })],
    ['C7', true, '--field-height-md', '產品覆寫只開放讀的名字', () => run({ files: withFiles({ 'apps/template/src/fixture-write.tsx': "export const c = '[--field-height-md:40px]'\n" }) })],
    // C7(丙)主人規格點名 ↔ 分類表 product(user 2026-11-10 token 第 4 題甲)
    ...(() => {
      const DTS = 'components/DataTable/data-table.spec.md'
      const dtSpec = (edit) => (p) => (p.endsWith(DTS) ? edit(readSpecFromDisk(p)) : readSpecFromDisk(p))
      const tabRead = (() => { const r = clone(registry); r.rows.find((x) => x.match === '--tab-height-').product = 'read'; return r })()
      return [
        ['C7', true, '--tab-height-sm', '分類表把分頁高改成產品可讀、分頁規格沒有點名', () => run({ registry: tabRead })],
        ['C7', true, '--table-cell-py', '表格規格點名一顆分類表寫 no 的', () => run({ readSpec: dtSpec((t) => t.replace('`--table-cell-px`(儲存格左右內距)', '`--table-cell-px`、`--table-cell-py`(儲存格內距)')) })],
        ['C7', true, '--table-cell-px', '表格規格拿掉點名句(分類表仍寫可讀)', () => run({ readSpec: dtSpec((t) => t.split(NAMED).join('點名已拿掉')) })],
        ['C7', false, '--table-row-sm', '現況:表格規格點名 4 顆、分類表 4 顆可讀', () => run({})],
      ]
    })(),
    // C9(審查案例 E:在側欄加只有側欄自己讀的 --sidebar-section-gap)
    ...(() => {
      const css = `${DS_ROOT}/components/Sidebar/fixture.css`
      const reg = addRows(row({ match: '--sidebar-section-gap', owner: 'Sidebar', home: 'components/Sidebar/fixture.css', spec: 'components/Sidebar/sidebar.spec.md' }))
      const base = { [css]: ':root { --sidebar-section-gap: 8px; }\n', [`${DS_ROOT}/components/Sidebar/fixture.tsx`]: "import './fixture.css'\nexport const c = 'gap-[var(--sidebar-section-gap)]'\n" }
      return [
        ['C9', true, '--sidebar-section-gap', '只有主人自己讀、不切換的新值', () => run({ files: withFiles(base), registry: reg })],
        ['C9', true, '--sidebar-section-gap', '別的檔只在註解裡提到 → 仍然紅', () => run({ files: withFiles({ ...base, [`${DS_ROOT}/components/AppShell/fixture.tsx`]: '// 對齊 var(--sidebar-section-gap)\nexport const z = 1\n' }), registry: reg })],
        ['C9', false, '--sidebar-section-gap', '真的被別的資料夾讀', () => run({ files: withFiles({ ...base, [`${DS_ROOT}/components/AppShell/fixture.tsx`]: "export const z = 'gap-[var(--sidebar-section-gap)]'\n" }), registry: reg })],
      ]
    })(),
    // C9 全面打開(2026-11-11 第三階段收完 6 顆之後):既有的名字也查。基準換成「main 上已經有它」(mainNames 含它 = 不是新名字);
    // 第一條在舊寫法(只查新名字、主人只看 home)下兩個原因都會放行 —— 它是這次打開的對照組
    ...(() => {
      const owner = `${DS_ROOT}/components/FixtureOwner/owner.tsx`
      const parked = { [UI]: `${files.get(UI)}\n:root { --fixture-parked-width: 30rem; }\n`, [owner]: "export const c = 'w-[var(--fixture-parked-width)]'\n" }
      const reg = addRows(row({ match: '--fixture-parked-width', owner: 'FixtureOwner', target: 'components/FixtureOwner/owner.tsx' }))
      // 一組級距:sm 有元件在讀、lg 暫時沒人讀(2026-11-15 起「一組」採窄讀法:最後一段是級距 / 狀態、同組有人讀才算組員)
      const scale = { [UI]: `${files.get(UI)}\n:root { --fixture-scale-sm: 1px; --fixture-scale-lg: 2px; }\n`, [`${DS_ROOT}/components/FixtureUser/user.tsx`]: "export const c = 'h-[var(--fixture-scale-sm)]'\n" }
      const regScale = addRows(row({ match: '--fixture-scale-', class: 'shared', owner: 'uiSize', scale: '--field-height-' }))
      const onMain = (extra, r) => { const f = withFiles(extra); return run({ files: f, registry: r, mainNames: buildModel(f).names }) }
      return [
        ['C9', true, '--fixture-parked-width', '既有的元件的值寄住在共用檔、只有主人元件(target 的資料夾)在讀 —— 第三階段收回的 6 顆就是這種', () => onMain(parked, reg)],
        ['C9', false, '--fixture-parked-width', '同一顆有第二個元件在讀', () => onMain({ ...parked, [`${DS_ROOT}/components/FixtureOther/other.tsx`]: "export const d = 'w-[var(--fixture-parked-width)]'\n" }, reg)],
        ['C9', false, '--fixture-scale-lg', '既有的共用刻度級距沒人讀、同組有人讀 —— 以一組為單位判,不逐顆問', () => onMain(scale, regScale)],
        ['C9', true, '--fixture-scale-lg', '同一顆共用刻度若是新名字,照樣要有主人以外的讀者(第一階段的範圍不縮)', () => run({ files: withFiles(scale), registry: regScale })],
      ]
    })(),
    // ── 2026-11-15 稽核 P23:閘的四個盲點各補一條,每條都有該紅與該綠 ──
    ...(() => {
      const onMain = (extra, r) => { const f = withFiles(extra); return run({ files: f, registry: r, mainNames: buildModel(f).names }) }
      const FX = (dir, name) => `${DS_ROOT}/components/${dir}/${name}`
      // (甲)唯一讀者在非主人資料夾、只在程式裡量值(錨 --sidebar-width-min 被 AppShell 的 JS 量值探針讀)
      const jsMin = { [FX('FixtureHost', 'host.css')]: ':root { --fixture-js-min: 240px; }\n' }
      const regJs = addRows(row({ match: '--fixture-js-min', owner: 'FixtureHost', home: 'components/FixtureHost/host.css', target: 'components/FixtureHost/host.css', spec: 'components/Sidebar/sidebar.spec.md' }))
      const jsReader = { [FX('FixtureProbe', 'probe.tsx')]: "export const w = (el: Element) => getComputedStyle(el).getPropertyValue('--fixture-js-min')\n" }
      const cssReader = { [FX('FixtureProbe', 'probe.tsx')]: "export const c = 'min-w-[var(--fixture-js-min)]'\n" }
      // (乙)只當同檔公式的輸入(會切換,舊版 C9 一律跳過)
      const slotCss = (why) => ({
        css: { [FX('FixtureRail', 'rail.css')]: ':root { --fixture-rail-in: 16px; --fixture-rail-out: calc(2 * 8px + var(--fixture-rail-in)); }\n[data-density="lg"] { --fixture-rail-in: 20px; }\n[data-density="md"] { --fixture-rail-in: 16px; }\n',
          [FX('FixtureRail', 'rail.tsx')]: "import './rail.css'\nexport const c = 'w-[var(--fixture-rail-out)]'\n" },
        reg: addRows(
          row({ match: '--fixture-rail-in', owner: 'FixtureRail', home: 'components/FixtureRail/rail.css', target: 'components/FixtureRail/rail.css', why }),
          row({ match: '--fixture-rail-out', owner: 'FixtureRail', home: 'components/FixtureRail/rail.css', target: 'components/FixtureRail/rail.css', why: '收合寬' })),
      })
      const slotBad = slotCss('選單圖示尺寸'), slotOk = slotCss('收合寬公式的中間值(圖示欄),畫出來的圖示不讀它')
      // (丙)沒有任何讀者
      const orphan = { [UI]: `${files.get(UI)}\n:root { --fixture-orphan-thing: 4px; }\n` }
      const regOrphan = addRows(row({ match: '--fixture-orphan-thing', class: 'shared', owner: 'uiSize', scale: '--field-height-' }))
      const compSwitch = { [FX('FixtureComp', 'comp.css')]: ':root { --fixture-comp-h: 2rem; }\n[data-density="lg"] { --fixture-comp-h: 2.5rem; }\n[data-density="md"] { --fixture-comp-h: 2rem; }\n' }
      const regComp = addRows(row({ match: '--fixture-comp-h', owner: 'FixtureComp', home: 'components/FixtureComp/comp.css', target: 'components/FixtureComp/comp.css' }))
      const alias = { [UI]: `${files.get(UI)}\n:root { --fixture-alias-only: 4px; }\n@theme inline { --spacing-fixture-alias-only: var(--fixture-alias-only); }\n` }
      const regAlias = addRows(row({ match: '--fixture-alias-only', class: 'shared', owner: 'uiSize', scale: '--field-height-' }))
      // 跨元件傳值(每個讀者資料夾自己也有宣告;錨 --item-prefix-slot)
      const pass = { [FX('FixtureA', 'a.tsx')]: "export const s = { '--fixture-pass': '16px' }\nexport const c = 'min-w-[var(--fixture-pass,auto)]'\n", [FX('FixtureB', 'b.tsx')]: "export const t = { '--fixture-pass': '20px' }\n" }
      return [
        ['C9', true, '--fixture-js-min', '(甲)唯一讀者在非主人資料夾、只用 getPropertyValue 量值', () => onMain({ ...jsMin, ...jsReader }, regJs)],
        ['C9', false, '--fixture-js-min', '(甲)對照:同一個讀者改用 var() 讀 → 第 0 題 (c) 成立', () => onMain({ ...jsMin, ...cssReader }, regJs)],
        ['C9', true, '--fixture-rail-in', '(乙)只被同檔公式讀、why 沒寫明是中間值(會切換也要查)', () => onMain(slotBad.css, slotBad.reg)],
        ['C9', false, '--fixture-rail-in', '(乙)對照:why 寫明「中間值」', () => onMain(slotOk.css, slotOk.reg)],
        ['C9', true, '--fixture-orphan-thing', '(丙)既有共用刻度沒有任何讀者、也不是有人讀的一組級距', () => onMain(orphan, regOrphan)],
        ['C9', true, '--fixture-alias-only', '(丙)唯一的「讀者」是它自己的 Tailwind 轉接名那一行(沒有人用那個 class)', () => onMain(alias, regAlias)],
        ['C9', false, '--fixture-alias-only', '(丙)對照:有元件用了那個 class', () => onMain({ ...alias, [FX('FixtureUser', 'user.tsx')]: "export const c = 'h-fixture-alias-only'\n" }, regAlias)],
        ['C9', true, '--fixture-comp-h', '(丙)會切換的元件的值沒有任何讀者(舊版 C9 一律跳過有密度段的)', () => onMain(compSwitch, regComp)],
        ['C9', false, '--fixture-comp-h', '(丙)對照:字串拼出的開頭 var(--fixture-comp-${size}) 吻合 → 算有人讀', () => onMain({ ...compSwitch, [FX('FixtureComp', 'comp.tsx')]: "import './comp.css'\nexport const h = (size: string) => `h-[var(--fixture-comp-${size})]`\n" }, regComp)],
        ['C1', true, '--fixture-pass', '跨元件傳值:兩個資料夾各自宣告、其中一個讀 → 要登記', () => run({ files: withFiles(pass) })],
        ['C1', false, '--fixture-pass', '對照:兩個資料夾各自宣告、沒有人讀 → 不是 token', () => run({ files: withFiles({ ...pass, [FX('FixtureA', 'a.tsx')]: "export const s = { '--fixture-pass': '16px' }\n" }) })],
      ]
    })(),
    // ── 2026-11-15:--brand 誤刪的防線(保留類別三方一致 / retain 不算沒人讀 / 產品可讀的名字不得悄悄消失)與用詞 ──
    ...(() => {
      const SEM = `${DS_ROOT}/tokens/color/semantic.css`
      const MO = `${DS_ROOT}/tokens/motion/motion.css`
      const RAD = `${DS_ROOT}/tokens/radius/radius.css`
      // 注入點找不到就丟例外(對照組本身失效,不得默默變成「沒改到東西」的假綠)
      const drop = (text, path, re) => { const out = text.replace(re, ''); if (out === text) throw new Error(`對照組注入失敗:${path} 找不到 ${re}`); return out }
      const line = (name) => new RegExp(`^[ \\t]*${name}:[^\\n]*\\n`, 'm')
      const dropDecl = (path, ...names) => withFiles({ [path]: names.reduce((t, n) => drop(t, path, line(n)), files.get(path)) })
      const noBrand = dropDecl(SEM, '--brand')
      const noBrandBoth = dropDecl(SEM, '--brand', '--color-brand')
      const entry = (name, o = {}) => ({ name, quote: '(對照組用的假原話)', quoteDate: '2026-11-15', ...o })
      const versions = { deprecatedIn: '1.0.0', removedIn: '1.1.0' }
      const stable = compatPolicyFor('1.0.0')
      // 改名:--brand 刪掉、同一版加上新名字 --brand-renamed(只看 C10;新名字沒登記分類表的 C1 / C2 不在這幾格判)
      const renamedFiles = new Map(noBrandBoth)
      renamedFiles.set(SEM, `${noBrandBoth.get(SEM)}\n:root { --brand-renamed: #df3232; }\n`)
      const withRetired = (list) => { const r = clone(registry); r.retired = list; return r }
      const regEdit = (fn) => { const r = clone(registry); fn(r); return r }
      const ORPHAN = `${DS_ROOT}/tokens/orphan-tokens.spec.md`
      const withTerm = (extra) => { const t = new Map(termFiles); for (const [k, v] of Object.entries(extra)) t.set(k, v); return t }
      return [
        // C10:產品可讀的名字(含轉接名)不得悄悄消失
        ['C10', true, '--brand', '刪掉產品可讀的 --brand(設計系統沒有讀者也一樣)', () => run({ files: noBrand })],
        ['C10', true, '--brand', '刪 --brand 時連分類表那一列一起改成 product: no → 基準的分類表仍說產品可讀,照樣紅(2026-11-15 審查)', () => run({ files: noBrand, registry: regEdit((r) => { r.rows.find((x) => x.match === '--brand').product = 'no' }) })],
        ['C10', true, '--color-brand', '刪掉指向產品可讀本尊的 Tailwind 轉接名(bg-brand)', () => run({ files: dropDecl(SEM, '--color-brand') })],
        ['C10', true, '--spacing-tree-indent-md', '刪掉樹狀縮排的轉接名(本尊 --tree-indent-* 產品可讀)', () => run({ files: dropDecl(UI, '--spacing-tree-indent-md') })],
        ['C10', true, '--radius-sm', '刪掉產品可讀的圓角刻度(@theme 裡直接給值的那種)', () => run({ files: dropDecl(RAD, '--radius-sm') })],
        ['C10', false, '--motion-duration-surface', '刪掉 product: no 的動畫時長(產品不讀,刪是設計系統內部的事)', () => run({ files: dropDecl(MO, '--motion-duration-surface') })],
        // 相容政策(scripts/lib/compat-policy.mjs):0.x 同一版刪、不要求版本欄;1.0 以後兩個版本必填且不同
        ['C10', false, '--brand', '0.x:同樣刪掉兩顆,分類表 retired 登記了原話(不要求版本欄,同一版刪)', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand'), entry('--color-brand')]) })],
        ['C10', false, '--brand', '0.x:寫了 deprecatedIn = removedIn(同一版刪)也綠 —— 2026-11-15 前這格是紅', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand', { deprecatedIn: '0.1.0-beta.149', removedIn: '0.1.0-beta.149' }), entry('--color-brand')]) })],
        ['C10', true, '--brand', 'retired 那一筆沒有 user 原話', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand', { quote: ' ' }), entry('--color-brand')]) })],
        ['C10', true, '--brand', '1.0 正式版政策:retired 沒寫兩個版本 → 紅(政策真的被讀到)', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand'), entry('--color-brand', versions)]), compatPolicy: stable })],
        ['C10', true, '--brand', '1.0 正式版政策:deprecatedIn = removedIn(沒有先保留一版)→ 紅', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand', { deprecatedIn: '1.0.0', removedIn: '1.0.0' }), entry('--color-brand', versions)]), compatPolicy: stable })],
        ['C10', false, '--brand', '1.0 正式版政策:兩個版本不同 → 綠', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand', versions), entry('--color-brand', versions)]), compatPolicy: stable })],
        ['C10', true, '相容政策', '讀不到相容政策 → 紅(不得當成某一種政策放行)', () => run({ compatPolicy: null, compatPolicyError: '對照組:沒有版本號' })],
        ['C10', true, '--brand', '改名:renamedTo 指向工作樹沒有宣告的名字 → 紅', () => run({ files: noBrandBoth, registry: withRetired([entry('--brand', { renamedTo: '--brand-renamed' }), entry('--color-brand')]) })],
        ['C10', false, '--brand', '改名:renamedTo 指向同一版加上的新名字 → 綠', () => run({ files: renamedFiles, registry: withRetired([entry('--brand', { renamedTo: '--brand-renamed' }), entry('--color-brand')]) })],
        // C1:保留類別 規格 ↔ 分類表 ↔ 各列 retain
        ['C1', true, 'type-scale', '分類表 retention 拿掉一類、規格還寫著', () => run({ registry: regEdit((r) => { r.retention.categories = r.retention.categories.filter((c) => c.key !== 'type-scale') }) })],
        ['C1', true, 'reservation', '規格拿掉一類的標題、分類表還有', () => run({ readSpec: (p) => (p.endsWith(ORPHAN) ? drop(readSpecFromDisk(p), ORPHAN, /^### 9\. `reservation` — [^\n]*\n/m) : readSpecFromDisk(p)) })],
        ['C1', true, '--brand', '列的 retain 指到不存在的類別', () => run({ registry: regEdit((r) => { r.rows.find((x) => x.match === '--brand').retain = 'no-such-category' }) })],
        ['C1', false, 'reservation', '現況:規格每類標題 ↔ 分類表 retention 一致', () => run({})],
        // C9(丙):retain 寫明保留類別的不算沒人讀
        ['C9', false, '--brand', '拿掉 --brand 的 retain → 仍不報:產品可讀的名字不進(丙),退場由 user 決定、不由讀者數決定', () => run({ registry: regEdit((r) => { delete r.rows.find((x) => x.match === '--brand').retain }) })],
        ['C9', true, '--brand', '把 --brand 改成 product: no 又拿掉 retain → 設計系統沒有任何讀者(丙)', () => run({ registry: regEdit((r) => { const b = r.rows.find((x) => x.match === '--brand'); delete b.retain; b.product = 'no' }) })],
        ['C9', false, '--brand', '現況:--brand 寫了 retain = reservation(產品層預留)', () => run({})],
        // C11:用詞
        ['C11', true, '主操作色', '範例裡寫「品牌主操作色」', () => run({ termFiles: withTerm({ [`${DS_ROOT}/components/FixtureTerm/fixture.stories.tsx`]: "export const note = '這顆是品牌主操作色'\n" }) })],
        ['C11', true, 'brand swap', '規格英文寫 Brand Swap(大小寫不同也算)', () => run({ termFiles: withTerm({ [`${DS_ROOT}/components/FixtureTerm/fixture.spec.md`]: 'Avoid Brand Swap drift.\n' }) })],
        ['C11', true, '不用的說法', '用詞段少了「不用的說法」那一行 → 讀不到清單(INSTRUMENT,不是放行)', () => run({ termFiles: withTerm({ [TERM_SPEC]: drop(termFiles.get(TERM_SPEC), TERM_SPEC, /^\*\*不用的說法\*\*[^\n]*\n/m) }) })],
        ['C11', false, 'FixtureTerm/ok.md', '正確用法:「品牌色 --brand 固定不隨主題;互動色換色」', () => run({ termFiles: withTerm({ [`${DS_ROOT}/components/FixtureTerm/ok.md`]: '品牌色 --brand 固定、不隨主題切換;按鈕那顆藍是互動色,互動色換色時圖表不受影響。\n' }) })],
        ['C11', false, 'color.spec.md', '現況:color.spec.md「用詞」段本身列出這些字 → 不算', () => run({})],
        ['C11', false, 'FixtureTerm/quote.md', '逐字引文:「…」裡的 user 原話含「主題色」→ 不算(M36(a) 引文一律逐字)', () => run({ termFiles: withTerm({ [`${DS_ROOT}/components/FixtureTerm/quote.md`]: 'user 原話:「所以主操作色就是主題色的意思嗎？」\n' }) })],
        ['C11', true, 'FixtureTerm/mixed.md', '引號外自己寫「主題色」→ 紅(引號只豁免引文本身)', () => run({ termFiles: withTerm({ [`${DS_ROOT}/components/FixtureTerm/mixed.md`]: 'user 說「好」,所以這顆主題色要換。\n' }) })],
      ]
    })(),
    // ── 2026-11-16:產品不寫任何 token(主題甲;範圍讀法 AI 推導 ①)/ 新名字要有住處 / 元件的值的開頭與規格住處 / 原料與共用刻度住 tokens/ / 後備值不分家 ──
    ...(() => {
      const regEdit = (fn) => { const r = clone(registry); fn(r); return r }
      const FX = (dir, name) => `${DS_ROOT}/components/${dir}/${name}`
      const ownerFile = { [FX('FixtureOwner', 'owner.tsx')]: 'export const x = 1\n' }
      const rootPlus = (decl, extra = {}) => withFiles({ [UI]: `${files.get(UI)}\n:root { ${decl} }\n`, ...extra })
      const readWrite = regEdit((r) => { r.rows.find((x) => x.match === '--field-px').product = 'read-write' })
      // 只被讀、沒有任何宣告的新名字(讀者在別的資料夾 → 需要登記)
      const readOnly = { [FX('FixtureA', 'a.tsx')]: "export const c = 'p-[var(--fixture-no-home,4px)]'\n" }
      const sharedRow = (o) => row({ class: 'shared', owner: 'uiSize', scale: '--field-height-', ...o })
      const fbA = { [FX('FixtureA', 'a.tsx')]: "export const c = 'p-[var(--field-px,0.75rem)]'\n" }
      const fbB = { [FX('FixtureB', 'b.tsx')]: "export const c = 'px-[var(--field-px,_0.75rem)]'\n" }
      const fbCss = { [FX('FixtureB', 'b.css')]: '.x { padding-inline: var(--field-px , 12px); }\n' }
      const fbComments = { [FX('FixtureA', 'a.tsx')]: '// 舊寫法 var(--field-px, 0.75rem)\nexport const x = 1\n', [FX('FixtureB', 'b.css')]: '/* var(--field-px, 12px) */\n.x { color: red; }\n' }
      return [
        // C1 / C7:分類表沒有「可讀也可覆寫」這個值;產品寫任何登記的名字都紅,不看 product 欄
        ['C1', true, '--field-px', '分類表把一列的 product 寫成 read-write(產品不寫任何 token,沒有這個值)', () => run({ registry: readWrite })],
        ['C7', true, '--field-px', '那一列寫成 read-write、產品寫它 → C7 照樣紅(不再看 product 欄)', () => run({ registry: readWrite, files: withFiles({ 'apps/template/src/fixture-write.tsx': "export const c = '[--field-px:16px]'\n" }) })],
        ['C7', false, '--field-px', '產品只讀 --field-px(可讀來對齊)', () => run({ files: withFiles({ 'apps/template/src/fixture-read.tsx': "export const c = 'px-[var(--field-px)]'\n" }) })],
        // C2:新名字一定要有住處(規則 1)
        ['C2', true, '--fixture-no-home', '新名字的住處是 null、只被讀(讀的地方各帶後備值)', () => run({ files: withFiles(readOnly), registry: addRows(sharedRow({ match: '--fixture-no-home', home: null, target: null })) })],
        ['C2', false, '--fixture-no-home', '同一列住處指向真的宣告它的檔', () => run({ files: rootPlus('--fixture-no-home: 4px;', readOnly), registry: addRows(sharedRow({ match: '--fixture-no-home' })) })],
        // C2:新的元件的值 —— 開頭是主人的、規格在主人資料夾(token-system.spec.md「命名」)
        ['C2', true, '--foo-bar', '開頭不是主人的(主人 Tabs 在分類表用的是 --tab-)', () => run({ files: rootPlus('--foo-bar: 1px;'), registry: addRows(row({ match: '--foo-bar', owner: 'Tabs', spec: 'components/Tabs/tabs.spec.md' })) })],
        ['C2', true, '--tab-fixture-x', '開頭對、規格指到別的元件(主人 Tabs、規格在 Tag)', () => run({ files: rootPlus('--tab-fixture-x: 1px;'), registry: addRows(row({ match: '--tab-fixture-x', owner: 'Tabs', spec: 'components/Tag/tag.spec.md' })) })],
        ['C2', true, '--fixture-x', '主人在分類表沒有其他列、名字不是主人名字的 kebab 開頭', () => run({ files: rootPlus('--fixture-x: 1px;', ownerFile), registry: addRows(row({ match: '--fixture-x', owner: 'FixtureOwner', spec: 'components/FixtureOwner/owner.spec.md' })) })],
        ['C2', true, '--fixture-ghost-x', '新的元件的值,主人對不到任何資料夾', () => run({ files: rootPlus('--fixture-ghost-x: 1px;'), registry: addRows(row({ match: '--fixture-ghost-x', owner: 'FixtureGhost', spec: 'components/FixtureGhost/ghost.spec.md' })) })],
        ['C2', false, '--tab-height-xl', '開頭是主人的、規格在主人資料夾', () => run({ files: rootPlus('--tab-height-xl: 4rem;'), registry: addRows(row({ match: '--tab-height-xl', owner: 'Tabs', spec: 'components/Tabs/tabs.spec.md' })) })],
        ['C2', false, '--fixture-owner-gap', '主人沒有其他列、名字用主人名字的 kebab 開頭(FixtureOwner → --fixture-owner-)', () => run({ files: rootPlus('--fixture-owner-gap: 1px;', ownerFile), registry: addRows(row({ match: '--fixture-owner-gap', owner: 'FixtureOwner', spec: 'components/FixtureOwner/owner.spec.md' })) })],
        // C3:原料 / 共用刻度住 tokens/(全部列都查)
        ['C3', true, '--fixture-shared-elsewhere', '新的共用刻度住在元件資料夾', () => run({ files: withFiles({ [FX('Button', 'fixture.css')]: ':root { --fixture-shared-elsewhere: 1px; }\n' }), registry: addRows(sharedRow({ match: '--fixture-shared-elsewhere', home: 'components/Button/fixture.css', target: 'components/Button/fixture.css' })) })],
        ['C3', true, '--elevation- 是共用刻度,住處 components/Button/fixture.css 不在 tokens/', '既有的列也查:把陰影的住處改到元件資料夾', () => run({ registry: regEdit((r) => { const e = r.rows.find((x) => x.match === '--elevation-'); e.home = 'components/Button/fixture.css'; e.target = 'components/Button/fixture.css' }) })],
        ['C3', false, '--fixture-shared-elsewhere', '同一顆住在 tokens/uiSize/uiSize.css', () => run({ files: rootPlus('--fixture-shared-elsewhere: 1px;'), registry: addRows(sharedRow({ match: '--fixture-shared-elsewhere' })) })],
        // C3:後備值不分家(規則 2)
        ['C3', true, '--field-px', '兩個程式檔各寫一份後備值 var(--field-px, 0.75rem)', () => run({ files: withFiles({ ...fbA, ...fbB }) })],
        ['C3', true, '--field-px', '一個程式檔、一個 CSS 檔各寫一份後備值', () => run({ files: withFiles({ ...fbA, ...fbCss }) })],
        ['C3', false, '--field-px', '只有一個檔寫後備值', () => run({ files: withFiles(fbA) })],
        ['C3', false, '--field-px', '兩個檔只在註解裡寫 var(--field-px, …)(註解不算)', () => run({ files: withFiles(fbComments) })],
        ['C3', true, '--item-px', '把 --item-px 的副本從 known.fallbackCopies 拿掉 → 現況每個檔各一份後備值,紅', () => run({ registry: regEdit((r) => { r.known.fallbackCopies = r.known.fallbackCopies.filter((x) => !x.startsWith('--item-px|')) }) })],
        ['C3', true, '--field-px', 'known.fallbackCopies 多一筆不是違規的副本(名單只能變短)', () => run({ registry: regEdit((r) => { r.known.fallbackCopies.push('--field-px|components/Field/field.tsx') }) })],
        // 審查 S1(實測 B2):已知名單原本以名字為單位,已登記的 --item-px 在新的檔多一份後備值也綠;改成 `名字|檔` 後紅,而且指名那個檔
        ['C3', true, '寫在 components/FixtureA/a.tsx', '已登記的 --item-px 在新的檔多一份後備值(第 6 份)', () => run({ files: withFiles({ [FX('FixtureA', 'a.tsx')]: "export const c = 'px-[var(--item-px,0.75rem)]'\n" }) })],
        ['C3', false, '--item-px', '現況:--item-px 的每一份副本逐檔登記在 known.fallbackCopies(待修)', () => run({})],
      ]
    })(),
    // ── 2026-11-16 審查:M1 元件的值住主人資料夾 / S2 執行期寫值的 home 反向 / M2 C9 把主人以外的寫入者算參與者 ──
    ...(() => {
      const FX = (dir, name) => `${DS_ROOT}/components/${dir}/${name}`
      const TABS_CSS = `${DS_ROOT}/components/Tabs/tabs.css`
      const tabsRow = (o) => row({ owner: 'Tabs', spec: 'components/Tabs/tabs.spec.md', ...o })
      const regEdit = (fn) => { const r = clone(registry); fn(r); return r }
      // M1(實測 B7):主人 Tabs 的新值,:root 預設寫在共用尺寸檔、target 留 null —— 不是陰影、不是執行期寫值、也不是搬家中
      const b7files = appendRoot('--tab-fixture-home: 3px;')
      // S2(實測 B8):第三個元件寫執行期寫值的 --tag-max-inline-size,分類表 home 沒列它
      const b8 = { [FX('FixtureWriter', 'w.tsx')]: "export const s = { '--tag-max-inline-size': '120px' }\n" }
      // M2(實測 B9):Tabs 的值照「擺放」預設寫在 tabs.css,只有 Tabs 自己讀,別的元件用 style 物件寫它
      const b9 = (writerDir) => withFiles({
        [TABS_CSS]: `${files.get(TABS_CSS)}\n:root { --tab-fixture-w: 3px; }\n`,
        [FX('Tabs', 'fixture-reader.tsx')]: "export const c = 'w-[var(--tab-fixture-w)]'\n",
        [FX(writerDir, 'fixture-writer.tsx')]: "export const s = { '--tab-fixture-w': '9px' }\n",
      })
      const b9reg = addRows(tabsRow({ match: '--tab-fixture-w', home: 'components/Tabs/tabs.css', target: 'components/Tabs/tabs.css' }))
      // (甲)的形狀(唯一讀者在非主人資料夾、只用 getPropertyValue 量值),但另有主人以外的元件寫它 → 不是常數
      const jsMin = { [FX('FixtureHost', 'host.css')]: ':root { --fixture-js-min: 240px; }\n', [FX('FixtureProbe', 'probe.tsx')]: "export const w = (el: Element) => getComputedStyle(el).getPropertyValue('--fixture-js-min')\n" }
      const regJs = addRows(row({ match: '--fixture-js-min', owner: 'FixtureHost', home: 'components/FixtureHost/host.css', target: 'components/FixtureHost/host.css', spec: 'components/Sidebar/sidebar.spec.md' }))
      const onMain = (f, r) => run({ files: f, registry: r, mainNames: buildModel(f).names })
      return [
        // M1
        ['C3', true, '--tab-fixture-home 是元件的值,住處 tokens/uiSize/uiSize.css 不在主人 Tabs', '元件的值的預設寫在共用尺寸檔、target 留 null(不是三種例外)', () => run({ files: b7files, registry: addRows(tabsRow({ match: '--tab-fixture-home' })) })],
        ['C3', false, '--tab-fixture-home', '同一顆 target 指向主人資料夾(搬家中)', () => run({ files: b7files, registry: addRows(tabsRow({ match: '--tab-fixture-home', target: 'components/Tabs/tabs.css' })) })],
        ['C3', false, '--tag-max-inline-size', '現況:執行期寫值(home = 寫它的兩個程式檔、沒有 CSS 預設宣告)', () => run({})],
        // S2
        ['C3', true, '由 components/FixtureWriter/w.tsx', '執行期寫值的名字多一個寫它的檔、分類表 home 沒列', () => run({ files: withFiles(b8) })],
        ['C3', false, 'components/FixtureWriter/w.tsx', '同一個寫它的檔列進 home', () => run({ files: withFiles(b8), registry: regEdit((r) => { const x = r.rows.find((y) => y.match === '--tag-max-inline-size'); x.home = [...x.home, 'components/FixtureWriter/w.tsx'] }) })],
        // M2
        ['C9', false, '--tab-fixture-w', '只有主人讀、主人以外的元件寫它(第 0 題 (c))', () => run({ files: b9('FixtureWriter'), registry: b9reg })],
        ['C9', true, '--tab-fixture-w', '寫它的檔也在主人資料夾 → 只有主人在讀寫,收成常數', () => run({ files: b9('Tabs'), registry: b9reg })],
        ['C9', false, '--fixture-js-min', '(甲)的形狀,但另有主人以外的元件寫它 → 不是常數,不叫它收成讀者的常數', () => onMain(withFiles({ ...jsMin, [FX('FixtureWriter', 'js-writer.tsx')]: "export const s = { '--fixture-js-min': '300px' }\n" }), regJs)],
      ]
    })(),
  ]
  let ok = true
  const baseline = run({})
  const baseCount = Object.values(baseline.problems).flat().length
  console.log(`${baseCount === 0 ? '✓' : '✗'} selftest 基準:現況 ${baseCount} 個問題(要 0)`)
  if (baseCount) { ok = false; for (const p of Object.values(baseline.problems).flat()) console.log(`    ${p}`) }
  for (const [check, expectRed, name, label, fn] of cases) {
    const { problems } = fn()
    const hits = problems[check].filter((p) => p.includes(name))
    const pass = expectRed ? hits.length > 0 : hits.length === 0
    console.log(`${pass ? '✓' : '✗'} ${check} ${expectRed ? '該紅' : '該綠'}:${label}(${name})${pass ? '' : ` —— 實得 ${problems[check].join(' / ') || '沒有問題'}`}`)
    if (!pass) ok = false
  }
  // 量具:正式掃描(main)用的 loadCompatPolicy() 讀得到 repo 的版本,判出來的政策 = package.json 版本號直接判的。
  // 用途只有證明讀版本那條路沒壞;不斷言 repo 是哪一版(版號改成 1.0.0 這一格照樣綠)。
  {
    const live = loadCompatPolicy()
    const pkgVersion = JSON.parse(readFileSync(join(REPO, 'packages/design-system/package.json'), 'utf8')).version
    const pass = live.compatPolicy !== null && live.compatPolicy.version === pkgVersion && live.compatPolicy.mode === compatPolicyFor(pkgVersion).mode
    console.log(`${pass ? '✓' : '✗'} 量具:正式掃描讀到的相容政策 = package.json 的 ${pkgVersion} 判出來的${pass ? `(${live.compatPolicy.mode})` : ` —— 實得 ${live.compatPolicy ? `${live.compatPolicy.version} / ${live.compatPolicy.mode}` : live.compatPolicyError}`}`)
    if (!pass) ok = false
  }
  for (const k of Object.keys(LABEL)) {
    const reds = cases.filter((c) => c[0] === k && c[1]).length, greens = cases.filter((c) => c[0] === k && !c[1]).length
    if (!reds || !greens) { console.log(`✗ ${k} 對照組不完整(該紅 ${reds} 筆 / 該綠 ${greens} 筆;兩種都要有)`); ok = false }
  }
  console.log(ok ? '✓ 對照組:每一條各自在該紅的時候紅、該綠的時候綠(儀器有效)' : '✗ 對照組有一條沒照預期 —— 儀器無效')
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest()
  else main()
}
