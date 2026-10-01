#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 展示層 story(packages/design-system/src/**\/*.stories.tsx,不含 .anatomy / .principles,也不含標 tags:['test-only'] 的
 *         自動化夾具 story)不會「新增」Rating 送出評分範例曾有的四種漂移,每檔每條規則的命中數不得高於
 *         scripts/story-layer-drift-baseline.json(棘輪;新檔任何一筆都算新增):
 *         (a) 新建表單的主送出鈕被停用 —— 表單的送出鈕(`type="submit"`、在 `<form>` 裡,或停用條件讀的正是某個控件 `value=` 綁的值)
 *             寫成 `<Button variant="primary" disabled={條件}>`,且條件不是 useFormValidation 自己的送出狀態;
 *             spec 明文的兩種例外(更新類 / 對話輸入盒)要逐行或整檔寫 `@submit-intent: update|composer — 理由`;
 *         (b) 寫死的間距(gap / p / m 家族的數字或 [Npx]),判法與 check_layout_space_magic_numbers.sh 同一套:
 *             utility-registry 的 micro 幾何分類器(直接呼叫 hooks/lib/_micro_geometry.sh)、分隔線與 `@layout-space-magic-ok:` 照舊放行;
 *         (c) 用 <div> 做單行標題(標題字級 + 加粗字重、沒被截斷,而且後面接著它要當標題的區塊),
 *             typography.spec.md:43「視覺標題 ≠ 語義標題(一律用 h1–h6)」;
 *         (d) DS 字級 token 裡沒有的 text-* 字級 class —— 允許集合從 typography.css 的 @utility 讀,Tailwind 預設字級從 tailwindcss/theme.css 讀。
 *   紅: 任一檔任一規則的命中數高於基準、或新檔有命中 → 印出新增命中的 file:line 並 exit 1;--selftest 以 82f24938 原版
 *       rating.stories.tsx(fixture 以 git blob id 驗明正身)證明 (a)(b)(c) 各自在原本那幾行紅,以合成新檔證明四條規則各在指定 file:line 紅;
 *       註記不合法(未知 intent、沒寫理由、檔案根本沒呼叫 useFormValidation 卻用 hook 狀態當理由)必須仍紅;基準檔被手改成數字對不上 → 紅;
 *       同一顆鈕 / 同一行標題的兩面對照:加上 type="submit" / 包進 <form> / 停用條件讀控件的 value → (a) 紅;後面接元件 → (c) 紅;
 *       同一段漂移從 test-only story 搬到給人看的 story → 紅。
 *   綠: 命中數不高於基準時綠(數字變少允許,會提示收緊基準);乾淨的合成檔(用 token、h1–h6、hook 送出狀態、合法註記、
 *        側欄 chrome 的 workspace brand span(sidebar.spec.md:264)、列裡的名稱 + 說明、截斷的列標籤、批次操作鈕)0 筆;
 *        test-only story(與只被它用到的模組層小元件)裡的同一段漂移 0 筆;
 *        重建後的 Rating 展示檔 (a)(c)(d) 0 筆、(b) 最多只剩與 field.stories.tsx CreateProjectForm 逐字相同的那一行表單底列(待拍板,見待辦總帳);
 *        掃到 0 檔、字級集合讀不到、分類器叫不起來 = 儀器失效(exit 2),不讀成通過。純靜態(TypeScript AST + 既有 bash/python 分類器),
 *        不讀時間、不開瀏覽器,同一份工作樹重複跑結果相同。
 */
// ═══════════════════════════════════════════════════════════════════════════
// 展示層 story 漂移棘輪 —— 「Rating 送出評分流程」那一則範例的四種病,不准再長新的
// ═══════════════════════════════════════════════════════════════════════════
//
// 為什麼有這支(2026-09-30):Rating 的「送出評分流程」範例(82f24938 rating.stories.tsx:53-87)同時有:
//   新建情境卻把「送出評分」停用到給分為止(:78)、手刻卡片的寫死間距(:61 / :66 / :77)、用 <div className="text-body font-semibold">
//   當標題(:62);同檔「商品列表平均分」的手刻卡片也是同樣兩種(間距 :28 / :35 / :43,商品名 :37)。三件事各有 spec 明文,
//   卻沒有任何機械面看得到展示層 story:
//   check_layout_space_magic_numbers.sh 整個跳過 packages/design-system/src/;story hook 只認一串具名的壞形狀;
//   不存在的字級 class(text-body-sm)不會產生 CSS,畫面上靜默變成繼承字級。
//
// 範圍只取展示層(story-rules.md「三層定位」第 1 層)裡給人看的 story,理由:
//   · 展示層是「真實業務場景的產品範例」—— 消費者照抄的是這一層(story-rules.md「範例最高準則」「Production-grade composition fidelity」);
//   · 設計原則層(*.principles.stories.tsx)的本分是對照「❌ 錯的寫法」—— 停用的送出鈕、寫死的間距本來就可能是反例本身,
//     掃進來只會逼人在教材上貼豁免;設計規格層(*.anatomy.stories.tsx)是量測矩陣 / Inspector 的 6-canonical 版面。
//     同一個切法已有先例:check_story_invariants.sh R1(含 A.5 原生控件)2026-06-11 起豁免這兩層,audit-story-quality.mjs 的
//     placeholder / jargon 掃描同樣只掃展示層。
//   · Tokens / Patterns 只有單檔展示(story-rules.md「Title canonical 4-part exemption」),它們就是展示層,在範圍內。
//   · 標 tags:['test-only'] 的 story 不在範圍(連同只被它們用到的模組層小元件):story-rules.md「Technical probe visibility」
//     說它們只服務自動化、不進側欄與 Autodocs —— 讀者看不到、消費者不會照抄,掃進來只會逼閘的夾具去貼豁免(2026-10-01 收斂)。
//
// 各條規則的判法(寫在這裡,不寫在別處):
//   (a) 只看「條件式」停用:`disabled={運算式}`。裸的 `disabled` / `disabled={true}` 是停用狀態的靜態示範(例:Button 自己的狀態表),
//       不是「表單的送出條件」,不在本條範圍。而且只看**表單的送出鈕**(form-validation.spec.md:15 那張表管的就是它),三種認法任一成立:
//       `type="submit"`;在 `<form>` 裡;停用條件讀的值正是某個控件 `value=` 綁的值(例:原版 Rating `value={rating}` +
//       `disabled={rating === 0}` —— 沒有 <form> 的假表單)。批次操作鈕「沒選東西時停用」(`disabled={selected.length === 0}`,
//       selected 不是任何控件的 value)不是表單送出,不算(2026-10-01 收斂:第一版把所有條件停用的主鈕都算進來)。
//       hook 送出狀態 = 運算式只由 `<x>.submitDisabled` / `<x>.isSubmitting`
//       (或解構出來的同名識別字)以 || 組成,**而且同一檔真的呼叫了 useFormValidation(** —— 只看名字就放行是代理(M37)。
//       例外只收 spec 明文的兩種,每種綁一句 spec 原文,原文不見了本閘當場儀器失效(例外沒有出處就不再是例外)。
//   (b) 偵測家族與 check_layout_space_magic_numbers.sh 的間距那一半相同(p/px/py/pt/pb/pl/pr/ps/pe/gap/space-x/space-y/m* 的數字
//       或 [Npx];另補 gap-x-N / gap-y-N —— 同一種寫死、hook 的 \b 切法看不到它們,分類器也永遠不會放行)。只數「class 字串」裡的字
//       (className 屬性、cn/clsx/cva 呼叫、名字帶 class 的變數或屬性),說明文字裡提到 `gap-2` 不算。
//       放行順序與 hook 相同:同行有 Separator / ButtonDivider → 放行;同行或正上方「只有註解的一行」寫 @layout-space-magic-ok: → 放行;
//       該行所有間距字都在 utility-registry 的 gap_utilities 裡 → 交給 _micro_geometry.sh 分類器判,分類器說是 micro 才放行。
//       分類器不在這裡重寫一份:兩份一定會漂。
//   (c) <div>,className 同時有「標題級字級」(typography.css 裡字級 ≥ --font-body-size 的 @utility,不寫死清單)與加粗字重
//       (font-medium / semibold / bold / extrabold / black),開頭與結尾在同一行、內容只有文字或 {運算式}(沒有子元素)、
//       沒有 role / aria-level。標題是「替後面那一塊命名」的字,所以還要同時成立:
//         · 沒被截斷(truncate / line-clamp-* / text-ellipsis)—— 截斷的是塞在固定寬列槽裡的名稱(商品名、人名),是列的標籤;
//         · 同一層後面至少接一個「不是純文字」的兄弟(元件、控件、含子元素的區塊),或它是 <section> 的第一個子節點 ——
//           後面只接說明文字、又不是區段開頭的是「名稱 + 說明」(item-anatomy 的 label / description:人名 + 職稱、
//           商品名 + 價格),不是標題。
//       不收 <span>:span 是行內文字槽 —— chrome 的 workspace brand / user name 明文用 span + text-body-lg font-medium
//       (sidebar.spec.md:264),列裡的成員名、欄位標籤也是 span;<p> 是段落語意、<strong> 是強調語意,同樣不在範圍
//       (2026-10-01 收斂:第一版連 div / span 的列標籤與 chrome brand 都當標題,擋到 DS 自己的 canonical)。
//   (d) class 字串裡的 text-<名> 若「長得像字級」卻不在 typography.css 的 @utility text-* 裡 → 命中。「長得像字級」= 名字以 DS 字級的
//       字幹開頭(h<數字> / body / caption / footnote,從 @utility 名字推出來)或是 Tailwind 預設字級(tailwindcss/theme.css 的 --text-*)。
//       顏色(text-fg-muted)、對齊(text-left)等不是字級,不會被誤判。
//
// 棘輪:scripts/story-layer-drift-baseline.json 記每檔每條規則的命中數(count)與每筆命中的指紋(hits,只拿來指出「哪一行是新的」)。
//   判定只看 count:目前 > 基準 → 紅;新檔 = 基準 0。數字變少允許(會印出可收緊的檔),`--write-baseline` 收緊 —— **CI 永遠不跑它**
//   (meta-test 斷言 ci.yml 與 package.json 都沒有這個旗標)。指紋 = sha256(規則 + 該行去頭尾空白 + 命中字)前 12 碼;行被改寫過
//   但數字沒增加時照樣綠,只在數字增加時拿來把新增的那幾行挑出來(被改寫過的舊行也會一起列出,標「以下含改寫過的舊行」)。
//
//   node scripts/story-layer-drift-invariant.mjs                  判定(exit 0 綠 / 1 新增漂移 / 2 儀器失效)
//   node scripts/story-layer-drift-invariant.mjs --selftest       對照組(見 @gate-contract)
//   node scripts/story-layer-drift-invariant.mjs --list           列出目前全部命中(給下一批修漂移用),不判定
//   node scripts/story-layer-drift-invariant.mjs --write-baseline 重寫基準(只在人工確認後本機執行;CI 永不執行)
import ts from 'typescript'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SELF = 'scripts/story-layer-drift-invariant.mjs'
export const BASELINE_PATH = 'scripts/story-layer-drift-baseline.json'
export const SCOPE_GLOB = 'packages/design-system/src/**/*.stories.tsx'
export const RATING_STORY = 'packages/design-system/src/components/Rating/rating.stories.tsx'
/** 82f24938 的原版 rating.stories.tsx(「送出評分流程」還在的那一版),逐位元組 = git blob 2ace2c8f。 */
export const RATING_BEFORE_FIXTURE = 'scripts/test-fixtures/story-layer-drift/rating.stories.82f24938.tsx.txt'
export const RATING_BEFORE_BLOB = '2ace2c8f1a8710c8d215f7602c7feb7a3ff518d7'
/** 重建後 Rating 唯一剩下的 (b) 命中:與 CreateProjectForm 逐字相同的表單底列(待拍板,見待辦總帳)。 */
export const CANONICAL_FORM_FOOTER = 'packages/design-system/src/components/Field/field.stories.tsx'

export const RULE_IDS = Object.freeze(['primary-submit-disabled', 'hardcoded-spacing', 'div-heading', 'unknown-typography'])
export const RULES = Object.freeze({
  'primary-submit-disabled': {
    label: '(a) 新建表單的主送出鈕被停用',
    owner: 'packages/design-system/src/components/Field/form-validation.spec.md:15「新建(Create)| 永遠 enabled」+ :142「❌ 對 Create form 用 disabled-until-dirty Submit button」',
    fix: '送出鈕永遠可按,按下時由 useFormValidation 驗證並把焦點帶到第一個錯誤(同 field.stories.tsx CreateProjectForm);真的是更新類 / 對話輸入盒,在該行正上方寫 {/* @submit-intent: update|composer — 理由 */}',
  },
  'hardcoded-spacing': {
    label: '(b) 寫死的間距',
    owner: 'packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md:306「❌ 元素間 gap 硬寫」+ :159-178「該用 token vs 刻意固定」',
    fix: '改用 gap-/p-/m-[var(--layout-space-tight|loose|bottom)];刻意固定的 micro 值在該行正上方寫 {/* @layout-space-magic-ok: 理由 */}(同 check_layout_space_magic_numbers.sh)',
  },
  'div-heading': {
    label: '(c) 用 div 做標題',
    owner: 'packages/design-system/src/tokens/typography/typography.spec.md:43「視覺標題 ≠ 語義標題(一律用 h1–h6)」',
    fix: '改用 <h1>–<h6>,字級與字重 class 照舊(它若其實是列的名稱 / chrome 的文字,就用 span 或對應的 DS 元件,不是標題)',
  },
  'unknown-typography': {
    label: '(d) DS 沒有的字級 class',
    owner: 'packages/design-system/src/tokens/typography/typography.css(@utility text-*)',
    fix: null, // 由載入的字級集合動態產生(不手寫清單)
  },
})

/**
 * (a) 的兩種明文例外。每種綁一句 spec 原文:原文不見了 = 例外沒有出處 → 儀器失效(不默默繼續放行)。
 */
export const SUBMIT_INTENTS = Object.freeze({
  update: {
    spec: 'packages/design-system/src/components/Field/form-validation.spec.md',
    quote: '| **更新**(Update) | **disabled** | 使用者變更任何欄位(dirty) | 變更被還原回原值(pristine) |',
    meaning: '更新類表單:沒改就不用存,有變更才亮起來',
  },
  composer: {
    spec: 'packages/design-system/src/components/AgentPanel/agent-panel.spec.md',
    quote: 'AgentPromptInput 空值時送出鈕不可按',
    meaning: '對話輸入盒:空白時送出鈕不可按',
  },
})

export class InstrumentError extends Error {}

const TEXT_WEIGHTS = new Set(['font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'])
const CLASS_CALLEES = new Set(['cn', 'clsx', 'cx', 'cva', 'twMerge', 'classNames'])
const CLASS_BINDING = /class|cls|styles?$/i
const SPACING_PREFIX = '(?:p|px|py|pt|pb|pl|pr|ps|pe|gap|gap-x|gap-y|space-x|space-y|m|mx|my|mt|mb|ml|mr|ms|me)'
const SPACING_WORD = new RegExp(`^-?${SPACING_PREFIX}-(?:0\\.5|[1-9][0-9]?(?:\\.[0-9])?|\\[[0-9]+(?:\\.[0-9]+)?px\\])$`)
const LAYOUT_ESCAPE = '@layout-space-magic-ok:'
const DIVIDER_LINE = /(Separator|ButtonDivider)/
const COMMENT_ONLY = /^\s*(\/\/|\{?\/\*|\*)/
const SUBMIT_MARKER = /@submit-intent:\s*([A-Za-z-]*)\s*(?:[—–]+|-{1,2})?\s*(.*)$/
const HOOK_STATE_TERM = /^(?:[A-Za-z_$][\w$]*\.)?(?:submitDisabled|isSubmitting)$/
const CLIPPED_TEXT = /^(?:truncate|text-ellipsis|line-clamp-\d+)$/

export const isShowcaseStory = (rel) => /\.stories\.tsx$/.test(rel) && !/\.(anatomy|principles)\.stories\.tsx$/.test(rel)

// ── 字級集合(從 token 來源讀,不寫死)────────────────────────────────────────

export function loadTypography(repo = REPO) {
  const cssPath = join(repo, 'packages/design-system/src/tokens/typography/typography.css')
  if (!existsSync(cssPath)) throw new InstrumentError(`讀不到字級 token 來源 ${cssPath}`)
  const css = readFileSync(cssPath, 'utf8')
  const sizePx = new Map([...css.matchAll(/--font-([a-z0-9-]+)-size:\s*([0-9.]+)px/g)].map((m) => [m[1], Number(m[2])]))
  const utilityVar = new Map([...css.matchAll(/@utility\s+(text-[a-z0-9-]+)\s*\{\s*font-size:\s*var\(--font-([a-z0-9-]+)-size\)/g)].map((m) => [m[1], m[2]]))
  const body = sizePx.get('body')
  if (!body || utilityVar.size < 4 || [...utilityVar.values()].some((v) => !sizePx.has(v))) {
    throw new InstrumentError(`typography.css 解析失敗:--font-body-size=${body} / @utility text-* ${utilityVar.size} 個`)
  }
  const allowed = new Set(utilityVar.keys())
  const headingSizes = new Set([...utilityVar].filter(([, v]) => sizePx.get(v) >= body).map(([u]) => u))
  const stems = [...new Set([...allowed].map((u) => u.slice('text-'.length).replace(/-[a-z0-9]+$/, '').replace(/\d+$/, '\\d+')))]
  let themePath
  try { themePath = createRequire(join(repo, 'package.json')).resolve('tailwindcss/theme.css') } catch { throw new InstrumentError('讀不到 tailwindcss/theme.css(Tailwind 預設字級的來源)') }
  const tailwindScale = new Set([...readFileSync(themePath, 'utf8').matchAll(/--text-([a-z0-9]+):/g)].map((m) => `text-${m[1]}`))
  if (tailwindScale.size === 0) throw new InstrumentError('tailwindcss/theme.css 裡沒有任何 --text-* 字級')
  const shape = new RegExp(`^text-(?:${stems.join('|')})(?:-[a-z0-9]+)*$`)
  return {
    allowed,
    headingSizes,
    tailwindScale,
    stems,
    isTypographyShaped: (word) => shape.test(word) || tailwindScale.has(word),
  }
}

// ── micro 幾何:直接呼叫 hook 用的那一支分類器(不重寫第二份)──────────────────

const MICRO_SCRIPT = 'set -eo pipefail\n'
  + 'lib="$GOVERNANCE_CORPUS_ROOT/packages/design-system/ds-canonical/hooks/lib"\n'
  + 'source "$lib/_provider_paths.sh"\n'
  + 'source "$lib/_micro_geometry.sh"\n'
  + 'governance_filter_canonical_micro_geometry "$(cat "$1")" "$(cat "$2")"\n'

export function loadMicroPolicy(repo = REPO) {
  const registryPath = join(repo, 'packages/design-system/src/tokens/utility-registry.json')
  const policy = JSON.parse(readFileSync(registryPath, 'utf8'))?.spacing?.canonical_micro_geometry
  const gaps = policy?.gap_utilities
  if (!Array.isArray(gaps) || gaps.length === 0 || !Number.isInteger(policy?.nearby_line_limit)) {
    throw new InstrumentError('utility-registry.json 讀不到 spacing.canonical_micro_geometry(gap_utilities / nearby_line_limit)')
  }
  return { gaps: new Set(gaps), nearbyLineLimit: policy.nearby_line_limit }
}

/**
 * 回傳「分類器判為**不是** canonical micro」的行號集合。分類器叫不起來 = 儀器失效(不是全放行、也不是全擋)。
 * @param {string} text 整份檔案原文(分類器要看上下文)
 * @param {number[]} lines 1-based 候選行號
 */
export function microClassifier(repo = REPO) {
  return (text, lines) => {
    if (lines.length === 0) return new Set()
    const dir = mkdtempSync(join(tmpdir(), 'story-layer-drift-'))
    try {
      const all = text.split('\n')
      writeFileSync(join(dir, 'payload'), text)
      writeFileSync(join(dir, 'candidates'), lines.map((n) => `${n}:${all[n - 1]}`).join('\n'))
      const r = spawnSync('bash', ['-c', MICRO_SCRIPT, 'story-layer-drift', join(dir, 'payload'), join(dir, 'candidates')], {
        encoding: 'utf8',
        env: { ...process.env, GOVERNANCE_CORPUS_ROOT: repo },
        maxBuffer: 16 * 1024 * 1024,
      })
      if (r.error || r.status !== 0) throw new InstrumentError(`micro 幾何分類器(_micro_geometry.sh)失敗:${r.error?.message ?? `exit ${r.status}`} ${String(r.stderr ?? '').trim().slice(0, 300)}`)
      return new Set(String(r.stdout).split('\n').filter(Boolean).map((row) => Number(row.slice(0, row.indexOf(':')))))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

// ── 分析器(純函式:給檔名 + 原文 + 儀器,回命中)────────────────────────────

const isElement = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)
const openingOf = (n) => (ts.isJsxElement(n) ? n.openingElement : n)
const tagOf = (n) => openingOf(n).tagName.getText()
function attribute(node, name) {
  for (const a of openingOf(node).attributes.properties) if (ts.isJsxAttribute(a) && a.name.getText() === name) return a
  return null
}
function stringPieces(node) {
  const out = []
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push(n.text)
    ts.forEachChild(n, visit)
  }
  if (node) visit(node)
  return out
}
/** 去掉 `!` 與 variant 前綴(md: / hover: / [&>*]:),回 utility 本體。 */
function utilityBase(word) {
  let depth = 0
  let cut = 0
  for (let i = 0; i < word.length; i++) {
    if (word[i] === '[') depth++
    else if (word[i] === ']') depth--
    else if (word[i] === ':' && depth === 0) cut = i + 1
  }
  return word.slice(cut).replace(/^!/, '')
}
const looksLikeClassList = (s) => {
  const words = s.trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((w) => /^[!-]?[a-z[@*]/i.test(w) && !/[\u3000-\u9fff\uff00-\uffef]/.test(w))
}
function inClassContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return /class/i.test(p.name.getText())
    if (ts.isCallExpression(p) && CLASS_CALLEES.has(p.expression.getText())) return true
    if ((ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name && CLASS_BINDING.test(p.name.getText())) return true
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false
  }
  return false
}
function lineStartingAt(sf, pos) { return sf.getLineAndCharacterOfPosition(pos).line + 1 }

/** class 字串裡的每個字(含所在行號);落在 test-only 範圍裡的不收。 */
function classWords(sf, text, excluded = () => false) {
  const words = []
  let strings = 0
  const visit = (n) => {
    const isStr = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
    if (isStr && looksLikeClassList(n.text) && inClassContext(n) && !excluded(n.getStart(sf))) {
      strings++
      const start = n.getStart(sf)
      const raw = text.slice(start, n.getEnd())
      for (const m of raw.matchAll(/[^\s'"`{}$]+/g)) words.push({ word: m[0], base: utilityBase(m[0]), line: lineStartingAt(sf, start + m.index) })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { words, strings }
}

/** 某行(1-based)的註解是否帶某標記:同一行,或正上方連續的「只有註解」的行。 */
function markerNear(lines, lineNo, pattern, { contiguousAbove = true } = {}) {
  const found = []
  if (pattern.test(lines[lineNo - 1] ?? '')) found.push(lines[lineNo - 1])
  for (let i = lineNo - 2; i >= 0 && COMMENT_ONLY.test(lines[i]); i--) {
    if (pattern.test(lines[i])) found.push(lines[i])
    if (!contiguousAbove) break
  }
  return found
}
/** 檔頭(第一個非註解、非空白行之前)的註解行。 */
function headerLines(lines) {
  const out = []
  for (const l of lines) { if (l.trim() === '') continue; if (!COMMENT_ONLY.test(l)) break; out.push(l) }
  return out
}

/**
 * 運算式裡每條「識別字起頭的屬性存取路徑」:`!draft.title.trim()` → ['draft.title.trim'];`rating === 0` → ['rating']。
 * (a) 用它判斷「停用條件讀的是不是某個控件 value= 綁的值」。
 */
export function accessPaths(root) {
  const out = []
  const visit = (n) => {
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
      let path = n.text
      let cur = n
      while (cur.parent && ts.isPropertyAccessExpression(cur.parent) && cur.parent.expression === cur) { cur = cur.parent; path += `.${cur.name.text}` }
      out.push(path)
    }
    ts.forEachChild(n, visit)
  }
  if (root) visit(root)
  return out
}
const readsPath = (path, bound) => path === bound || path.startsWith(`${bound}.`)
function hasAncestorTag(node, tag) {
  for (let p = node.parent; p; p = p.parent) if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === tag) return true
  return false
}

/** (c):某個 JSX 子節點是不是「純文字」(文字、不含 JSX 的 {運算式}、只含純文字的小寫原生元素、<br/>)。 */
function isPlainText(child) {
  if (ts.isJsxText(child)) return true
  if (ts.isJsxExpression(child)) return !child.expression || !containsJsx(child.expression)
  if (ts.isJsxSelfClosingElement(child)) return child.tagName.getText() === 'br'
  if (ts.isJsxElement(child)) return /^[a-z]/.test(tagOf(child)) && child.children.every(isPlainText)
  return false
}
const meaningfulChildren = (children) => children.filter((c) => !(ts.isJsxText(c) && c.getText().trim() === '') && !(ts.isJsxExpression(c) && !c.expression))
/**
 * (c):它是不是在替後面那一塊命名 —— 同一層後面有「不是純文字」的兄弟;或它是 <section> 的第一個子節點(區段的標題,
 * 後面只接說明段落也算)。只接說明文字、又不是區段開頭的,是「名稱 + 說明」。
 */
function titlesFollowingBlock(node) {
  const parent = node.parent
  if (!parent || !(ts.isJsxElement(parent) || ts.isJsxFragment(parent))) return false
  const siblings = meaningfulChildren([...parent.children])
  const at = siblings.indexOf(node)
  if (at === 0 && ts.isJsxElement(parent) && tagOf(parent) === 'section' && siblings.length > 1) return true
  return siblings.slice(at + 1).some((c) => !isPlainText(c))
}

/**
 * test-only 範圍(story-rules.md「Technical probe visibility」):標 tags:['test-only'] 的 story 物件,
 * 加上「只被 test-only 範圍用到」的模組層宣告(不動點迭代;export 出去的東西只看它自己有沒有標,不會被牽連)。回傳 [start, end) 區段。
 */
export function testOnlyRanges(sf) {
  const stmts = [...sf.statements]
  const unwrap = (e) => { let x = e; while (x && (ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isParenthesizedExpression(x))) x = x.expression; return x }
  const isExported = (st) => Boolean(st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
  const isTestOnlyStory = (st) => ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => {
    const init = unwrap(d.initializer)
    return init && ts.isObjectLiteralExpression(init) && init.properties.some((prop) => ts.isPropertyAssignment(prop)
      && prop.name.getText(sf) === 'tags' && ts.isArrayLiteralExpression(prop.initializer)
      && prop.initializer.elements.some((e) => ts.isStringLiteralLike(e) && e.text === 'test-only'))
  })
  const names = (st) => {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) return [st.name.text]
    if (ts.isVariableStatement(st)) return st.declarationList.declarations.filter((d) => ts.isIdentifier(d.name)).map((d) => d.name.text)
    return []
  }
  const owner = new Map()
  stmts.forEach((st, i) => { for (const n of names(st)) owner.set(n, i) })
  const usedBy = new Map(stmts.map((_, i) => [i, new Set()]))
  stmts.forEach((st, i) => {
    const visit = (n) => {
      if (ts.isIdentifier(n) && owner.has(n.text) && owner.get(n.text) !== i) usedBy.get(owner.get(n.text)).add(i)
      ts.forEachChild(n, visit)
    }
    visit(st)
  })
  const testOnly = new Set(stmts.flatMap((st, i) => (isTestOnlyStory(st) ? [i] : [])))
  for (let changed = true; changed;) {
    changed = false
    stmts.forEach((st, i) => {
      if (testOnly.has(i) || isExported(st) || names(st).length === 0) return
      const users = usedBy.get(i)
      if (users.size > 0 && [...users].every((u) => testOnly.has(u))) { testOnly.add(i); changed = true }
    })
  }
  return [...testOnly].sort((a, b) => a - b).map((i) => [stmts[i].getStart(sf), stmts[i].getEnd()])
}

export function parseSubmitIntent(commentLine) {
  const m = commentLine.match(SUBMIT_MARKER)
  if (!m) return null
  const intent = m[1]
  const reason = m[2].replace(/\*\/\s*\}?\s*$/, '').trim()
  if (!Object.hasOwn(SUBMIT_INTENTS, intent)) return { ok: false, why: `@submit-intent 的「${intent || '(空白)'}」不是 spec 明文的例外(只收 ${Object.keys(SUBMIT_INTENTS).join(' / ')})` }
  if (reason.length < 6) return { ok: false, why: '@submit-intent 沒寫理由(至少一句話說明為什麼這顆鈕是這種例外)' }
  return { ok: true, intent, reason }
}

function isHookSubmitState(expr, callsHook) {
  if (!callsHook) return false
  const terms = expr.getText().replace(/[()\s]/g, '').split('||')
  return terms.length > 0 && terms.every((t) => HOOK_STATE_TERM.test(t))
}

/**
 * 單檔分析 = 收集 + 分類器 + 定案。全樹掃描走 scanTree(同一套 collect / finalize,分類器一次叫完)。
 * @param {string} rel  repo 相對路徑
 * @param {string} text 原文
 * @param {{ typography: ReturnType<typeof loadTypography>, micro: ReturnType<typeof loadMicroPolicy>, classify: (text: string, lines: number[]) => Set<number> }} instruments
 */
export function analyzeSource(rel, text, instruments) {
  const collected = collect(rel, text, instruments)
  return finalize(collected, instruments.classify(text, collected.microCandidates))
}

function collect(rel, text, instruments) {
  const { typography, micro } = instruments
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lines = text.split('\n')
  const hits = []
  const stats = { buttons: 0, classStrings: 0, classWords: 0, headingCandidates: 0, testOnlyRanges: 0 }
  const hit = (rule, line, token, note) => hits.push({ rule, file: rel, line, token, text: (lines[line - 1] ?? '').trim(), ...(note ? { note } : {}) })
  const callsHook = /\buseFormValidation\s*\(/.test(text)
  const fileIntents = headerLines(lines).filter((l) => SUBMIT_MARKER.test(l)).map(parseSubmitIntent)
  const ranges = testOnlyRanges(sf)
  stats.testOnlyRanges = ranges.length
  const excluded = (pos) => ranges.some(([a, b]) => pos >= a && pos < b)
  // (a) 的第三種認法:控件 value= 綁的值(整檔收一次)
  const valuePaths = []
  const collectValues = (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText() === 'value' && n.initializer && ts.isJsxExpression(n.initializer)) valuePaths.push(...accessPaths(n.initializer.expression))
    ts.forEachChild(n, collectValues)
  }
  collectValues(sf)

  // (a) + (c):走 JSX
  const visit = (node) => {
    if (isElement(node) && excluded(node.getStart(sf))) return
    if (isElement(node)) {
      const tag = tagOf(node)
      if (tag === 'Button') {
        stats.buttons++
        const variant = attribute(node, 'variant')
        const disabled = attribute(node, 'disabled')
        const primary = variant?.initializer && stringPieces(variant.initializer).includes('primary')
        const expr = disabled?.initializer && ts.isJsxExpression(disabled.initializer) ? disabled.initializer.expression : null
        const conditional = expr && expr.kind !== ts.SyntaxKind.TrueKeyword && expr.kind !== ts.SyntaxKind.FalseKeyword
        const submitType = stringPieces(attribute(node, 'type')?.initializer).includes('submit')
        const formSubmit = submitType || hasAncestorTag(node, 'form') || (expr && accessPaths(expr).some((p) => valuePaths.some((v) => readsPath(p, v))))
        if (primary && conditional && formSubmit && !isHookSubmitState(expr, callsHook)) {
          const line = lineStartingAt(sf, node.getStart(sf))
          const tagEnd = lineStartingAt(sf, openingOf(node).getEnd())
          const near = [...markerNear(lines, line, /@submit-intent:/), ...lines.slice(line, tagEnd).filter((l) => /@submit-intent:/.test(l))]
          const verdicts = [...near.map(parseSubmitIntent), ...fileIntents]
          if (!verdicts.some((v) => v?.ok)) {
            const bad = verdicts.find((v) => v && !v.ok)
            hit('primary-submit-disabled', line, `disabled={${expr.getText().replace(/\s+/g, ' ').slice(0, 60)}}`, bad?.why)
          }
        }
      }
      if (tag === 'div' && ts.isJsxElement(node)) {
        const cls = attribute(node, 'className')
        const tokens = stringPieces(cls?.initializer).flatMap((s) => s.split(/\s+/)).filter((w) => w && !w.includes(':'))
        const size = tokens.find((w) => typography.headingSizes.has(w))
        const weight = tokens.find((w) => TEXT_WEIGHTS.has(w))
        if (size && weight && !attribute(node, 'role') && !attribute(node, 'aria-level')) {
          stats.headingCandidates++
          const startLine = lineStartingAt(sf, node.getStart(sf))
          const endLine = lineStartingAt(sf, node.getEnd())
          const kids = node.children.filter((c) => !(ts.isJsxText(c) && c.getText().trim() === ''))
          const plain = kids.length > 0 && kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && !containsJsx(c.expression)))
          const clipped = tokens.some((w) => CLIPPED_TEXT.test(w))
          if (startLine === endLine && plain && !clipped && titlesFollowingBlock(node)) hit('div-heading', startLine, `<${tag} ${size} ${weight}>`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // (b) + (d):走 class 字串
  const { words, strings } = classWords(sf, text, excluded)
  stats.classStrings = strings
  stats.classWords = words.length
  const spacingByLine = new Map()
  for (const w of words) {
    if (SPACING_WORD.test(w.base)) {
      if (!spacingByLine.has(w.line)) spacingByLine.set(w.line, [])
      spacingByLine.get(w.line).push(w.base)
    }
    if (w.base.startsWith('text-') && typography.isTypographyShaped(w.base) && !typography.allowed.has(w.base)) hit('unknown-typography', w.line, w.base)
  }
  const microCandidates = []
  const survivors = []
  for (const [line, tokens] of spacingByLine) {
    const src = lines[line - 1] ?? ''
    if (DIVIDER_LINE.test(src)) continue
    if (src.includes(LAYOUT_ESCAPE)) continue
    const prev = lines[line - 2] ?? ''
    if (prev.includes(LAYOUT_ESCAPE) && COMMENT_ONLY.test(prev)) continue
    if (tokens.every((t) => micro.gaps.has(t))) microCandidates.push(line)
    survivors.push([line, tokens])
  }
  return { rel, text, hits, stats, microCandidates, survivors, hit }
}

/** @param {Set<number>} notMicro 分類器判為「不是 canonical micro」的候選行 */
function finalize({ hits, stats, microCandidates, survivors, hit }, notMicro) {
  for (const [line, tokens] of survivors) {
    if (microCandidates.includes(line) && !notMicro.has(line)) continue
    for (const t of tokens) hit('hardcoded-spacing', line, t)
  }
  hits.sort((x, y) => x.line - y.line || RULE_IDS.indexOf(x.rule) - RULE_IDS.indexOf(y.rule) || x.token.localeCompare(y.token))
  return { hits, stats }
}

/**
 * 全樹一次叫分類器:把各檔原文接成一份,檔與檔之間墊 nearby_line_limit + 1 行空白。
 * 分類器只看「該行 + 往下 nearby_line_limit 行」(_micro_geometry.sh nearby_window),空白行不含任何元素,
 * 所以接起來判與逐檔判結果相同(meta-test 以真實檔案兩種方式各判一次比對);逐檔叫要 45 次 bash + python。
 */
export function classifyBatch(collectedList, instruments) {
  const pad = '\n'.repeat(instruments.micro.nearbyLineLimit + 1)
  let offset = 0
  const parts = []
  const owners = []
  for (const c of collectedList) {
    parts.push(c.text)
    for (const line of c.microCandidates) owners.push([offset + line, c, line])
    offset += c.text.split('\n').length + instruments.micro.nearbyLineLimit
  }
  const joined = parts.join(pad)
  const flagged = instruments.classify(joined, owners.map(([global]) => global))
  const perFile = new Map(collectedList.map((c) => [c, new Set()]))
  for (const [global, c, line] of owners) if (flagged.has(global)) perFile.get(c).add(line)
  return perFile
}
function containsJsx(expr) {
  let found = false
  const visit = (n) => { if (found) return; if (isElement(n) || ts.isJsxFragment(n)) { found = true; return } ts.forEachChild(n, visit) }
  visit(expr)
  return found
}

// ── 全樹掃描 / 棘輪 ─────────────────────────────────────────────────────────────

export function loadInstruments(repo = REPO) {
  for (const [intent, doc] of Object.entries(SUBMIT_INTENTS)) {
    const specPath = join(repo, doc.spec)
    if (!existsSync(specPath) || !readFileSync(specPath, 'utf8').includes(doc.quote)) {
      throw new InstrumentError(`@submit-intent: ${intent} 綁的 spec 原文不見了(${doc.spec}「${doc.quote}」)—— 例外沒有出處就不再是例外`)
    }
  }
  return { typography: loadTypography(repo), micro: loadMicroPolicy(repo), classify: microClassifier(repo) }
}

export function listScope(repo = REPO) {
  return globSync(SCOPE_GLOB, { cwd: repo }).map((f) => f.split('\\').join('/')).filter(isShowcaseStory).sort()
}

export function scanTree({ repo = REPO, instruments = loadInstruments(repo), files = listScope(repo) } = {}) {
  const perFile = new Map()
  const stats = { files: files.length, buttons: 0, classStrings: 0, classWords: 0, headingCandidates: 0, testOnlyRanges: 0 }
  const collected = files.map((rel) => collect(rel, readFileSync(join(repo, rel), 'utf8'), instruments))
  const notMicro = classifyBatch(collected, instruments)
  for (const c of collected) {
    const r = finalize(c, notMicro.get(c))
    for (const k of Object.keys(r.stats)) stats[k] += r.stats[k]
    if (r.hits.length) perFile.set(c.rel, r.hits)
  }
  return { perFile, stats }
}

export const fingerprint = (h) => createHash('sha256').update(`${h.rule}\0${h.text.replace(/\s+/g, ' ')}\0${h.token}`).digest('hex').slice(0, 12)

export function buildBaseline(perFile) {
  const files = {}
  const totals = Object.fromEntries(RULE_IDS.map((r) => [r, 0]))
  for (const rel of [...perFile.keys()].sort()) {
    const entry = {}
    for (const rule of RULE_IDS) {
      const hs = perFile.get(rel).filter((h) => h.rule === rule)
      if (!hs.length) continue
      entry[rule] = { count: hs.length, hits: hs.map(fingerprint).sort() }
      totals[rule] += hs.length
    }
    files[rel] = entry
  }
  return {
    note: '展示層 story 漂移棘輪(scripts/story-layer-drift-invariant.mjs)的基準。每檔每條規則的 count 只准往下:高於這裡 = 新增漂移 → 紅;新檔 = 0。hits 是每筆命中的指紋,只用來指出「哪一行是新的」。數字變少後由人在本機跑 --write-baseline 收緊;CI 永遠不跑 --write-baseline。既有數字是 2026-09-30 首次建閘時的現況(不在本批修),逐條清單用 --list 看,修法排在待辦總帳。',
    generatedBy: `node ${SELF} --write-baseline`,
    scope: `${SCOPE_GLOB}(不含 *.anatomy.stories.tsx / *.principles.stories.tsx)`,
    rules: RULE_IDS,
    totals,
    files,
  }
}

/** 基準檔格式驗證:count 必須 = hits 數、totals 必須 = 各檔加總;不合 = 被手改過,拒收。 */
export function validateBaseline(doc) {
  const problems = []
  if (!doc || typeof doc !== 'object' || !doc.files || typeof doc.files !== 'object') return ['基準檔缺 files']
  const sums = Object.fromEntries(RULE_IDS.map((r) => [r, 0]))
  for (const [rel, entry] of Object.entries(doc.files)) {
    for (const [rule, v] of Object.entries(entry ?? {})) {
      if (!RULE_IDS.includes(rule)) { problems.push(`${rel}:未知規則 ${rule}`); continue }
      if (!Number.isInteger(v?.count) || v.count < 0 || !Array.isArray(v.hits) || v.hits.length !== v.count) problems.push(`${rel} ${rule}:count ${v?.count} 與 hits ${v?.hits?.length} 對不上`)
      else sums[rule] += v.count
    }
  }
  for (const rule of RULE_IDS) if (doc.totals?.[rule] !== sums[rule]) problems.push(`totals.${rule}=${doc.totals?.[rule]} ≠ 各檔加總 ${sums[rule]}`)
  return problems
}

/** 棘輪判定(純函式)。 */
export function compareWithBaseline(perFile, baseline) {
  const increases = []
  const decreases = []
  const baseFiles = baseline?.files ?? {}
  for (const [rel, hits] of perFile) {
    for (const rule of RULE_IDS) {
      const hs = hits.filter((h) => h.rule === rule)
      const base = baseFiles[rel]?.[rule]
      const before = base?.count ?? 0
      if (hs.length > before) {
        const pool = new Map()
        for (const fp of base?.hits ?? []) pool.set(fp, (pool.get(fp) ?? 0) + 1)
        const fresh = hs.filter((h) => { const fp = fingerprint(h); const n = pool.get(fp) ?? 0; if (n > 0) { pool.set(fp, n - 1); return false } return true })
        increases.push({ file: rel, rule, before, after: hs.length, newFile: !Object.hasOwn(baseFiles, rel), hits: fresh.length ? fresh : hs })
      } else if (hs.length < before) decreases.push({ file: rel, rule, before, after: hs.length })
    }
  }
  for (const [rel, entry] of Object.entries(baseFiles)) {
    if (perFile.has(rel)) continue
    for (const [rule, v] of Object.entries(entry)) decreases.push({ file: rel, rule, before: v.count, after: 0 })
  }
  return { increases, decreases }
}

export const totalsOf = (perFile) => {
  const t = Object.fromEntries(RULE_IDS.map((r) => [r, 0]))
  for (const hits of perFile.values()) for (const h of hits) t[h.rule]++
  return t
}

export function readBaseline(repo = REPO) {
  const p = join(repo, BASELINE_PATH)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}

export function gitBlobId(buffer) {
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer])).digest('hex')
}

function typographyFix(typography) {
  return `改用 DS 字級:${[...typography.allowed].join(' / ')}(typography.css @utility)`
}
const describeHit = (h, typography) => {
  const fix = RULES[h.rule].fix ?? typographyFix(typography)
  return `${h.file}:${h.line}  ${RULES[h.rule].label}  ${h.token}${h.note ? `  —— ${h.note}` : ''}\n      > ${h.text.slice(0, 140)}\n      規則:${RULES[h.rule].owner}\n      修法:${fix}`
}

// ── selftest ─────────────────────────────────────────────────────────────────

const SYNTHETIC_DRIFT = 'packages/design-system/src/components/SelftestDrift/selftest-drift.stories.tsx'
const SYNTHETIC_CLEAN = 'packages/design-system/src/components/SelftestClean/selftest-clean.stories.tsx'
/** 每條規則恰好一筆:(b)=6 (c)=7 (d)=8 (a)=10(送出鈕沒有 <form> / type,但停用條件讀的正是輸入框 value 綁的 email)。 */
export const SYNTHETIC_DRIFT_SOURCE = [
  "import { useState } from 'react'",
  "import { Button } from '@/design-system/components/Button/button'",
  "import { Input } from '@/design-system/components/Input/input'",
  'export const SignupCard = () => {',
  "  const [email, setEmail] = useState('')",
  '  return (<div className="flex flex-col gap-4">',
  '    <div className="text-body font-semibold">建立帳號</div>',
  '    <p className="text-body-sm text-fg-muted">完成後寄送確認信到你的信箱</p>',
  '    <Input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />',
  '    <Button variant="primary" disabled={!email}>建立帳號</Button>',
  '  </div>)',
  '}',
  '',
].join('\n')
export const SYNTHETIC_DRIFT_EXPECTED = [
  'hardcoded-spacing@6:gap-4',
  'div-heading@7:<div text-body font-semibold>',
  'unknown-typography@8:text-body-sm',
  'primary-submit-disabled@10:disabled={!email}',
]
/**
 * 乾淨的寫法:token 間距、h3 標題、hook 送出狀態、合法 @submit-intent、micro 行內群、逃生口、分隔線、靜態停用示範;
 * 另有 (c)(d) 的邊界反例:12px 標籤加粗(不是標題級字級)、有子元素、跨行、顏色 / 對齊 / 帶 variant 前綴的 DS 字級;
 * 以及第一版誤擋的 DS 寫法:側欄 chrome 的 workspace brand(sidebar.stories.tsx WorkspaceBrand;sidebar.spec.md:264
 * 明文 chrome 文字用 `text-body-lg font-medium`)、列裡的「名稱 + 說明」、截斷的列標籤後接元件、批次操作鈕「沒選東西時停用」。
 */
export const SYNTHETIC_CLEAN_SOURCE = [
  "import { Button } from '@/design-system/components/Button/button'",
  "import { Separator } from '@/design-system/components/Separator/separator'",
  "import { useFormValidation } from '@/design-system/components/Field/field'",
  'export function WorkspaceForm({ dirty, selected }: { dirty: boolean; selected: string[] }) {',
  "  const form = useFormValidation({ initialValues: { name: '' }, intent: 'create', onSubmit: () => {} })",
  '  return (<>',
  '    <form onSubmit={form.handleSubmit} className="flex flex-col gap-[var(--layout-space-loose)]">',
  '      <h3 className="text-body font-semibold">建立工作區</h3>',
  '      <span className="inline-flex items-center gap-1">3 位成員</span>',
  '      {/* @layout-space-magic-ok: 夾具 —— 刻意固定的 8px 行內群 */}',
  '      <div className="flex gap-2">已選 2 項</div>',
  '      <Separator className="my-2" />',
  '      <p className="text-caption text-fg-muted text-left md:text-body-lg">名稱之後可以再改</p>',
  '      <div className="text-caption text-fg-secondary font-medium">欄位說明(12px 標籤,不是標題級字級)</div>',
  '      <span className="text-body font-medium"><Badge /> 有子元素的不是單純標題文字</span>',
  '      <div className="text-body font-semibold">',
  '        跨行的區塊(開頭與結尾不在同一行)',
  '      </div>',
  '      <Button type="submit" variant="primary" disabled={form.submitDisabled || form.isSubmitting}>建立工作區</Button>',
  '      {/* @submit-intent: update — 夾具:更新類表單沒改就不用存 */}',
  '      <Button variant="primary" disabled={!dirty}>儲存變更</Button>',
  '      <Button variant="primary" disabled>停用狀態示範</Button>',
  '      <Button variant="primary" disabled={true}>停用狀態示範(寫成字面值)</Button>',
  '      <Button variant="tertiary" disabled={!dirty}>還原</Button>',
  '    </form>',
  '    <div className="flex items-center gap-[var(--layout-space-tight)]">',
  '      <Avatar name="Acme Inc" size="sm" />',
  '      <span className="text-body-lg font-medium truncate">Acme Inc</span>',
  '    </div>',
  '    <div className="flex flex-col">',
  '      <div className="text-body font-medium text-foreground">陳美惠</div>',
  '      <div className="text-caption text-fg-secondary">產品設計師 · Design Platform</div>',
  '    </div>',
  '    <div className="flex items-center">',
  '      <div className="text-body font-medium truncate">AirPods Pro(第二代)</div>',
  '      <Badge count={3} />',
  '    </div>',
  '    <div className="flex items-center gap-[var(--layout-space-tight)]">',
  '      <Button variant="primary" disabled={selected.length === 0}>封存選取的 {selected.length} 張工單</Button>',
  '    </div>',
  '  </>)',
  '}',
  '',
].join('\n')
/**
 * 註記不合法 / 名字對了但出處不對 → 必須仍紅(行號 4 / 6 / 7 / 9)。
 * 第 8 行是反面:逃生口寫在**同一行**照 hook 的語意放行;第 9 行的上一行(第 8 行)不是「只有註解的一行」,所以不放行。
 */
export const SYNTHETIC_BAD_ANNOTATIONS_SOURCE = [
  "import { Button } from '@/design-system/components/Button/button'",
  'export const Bad = ({ form, dirty, empty }: any) => (<form>',
  '  {/* @submit-intent: create — 夾具:新建不是 spec 明文的例外 */}',
  '  <Button variant="primary" disabled={!dirty}>建立</Button>',
  '  {/* @submit-intent: update — */}',
  '  <Button variant="primary" disabled={!dirty}>儲存</Button>',
  '  <Button variant="primary" disabled={form.submitDisabled}>送出(這檔沒有呼叫 hook)</Button>',
  '  <div className="p-4">{/* @layout-space-magic-ok: 不是只有註解的一行,不算數 */}</div>',
  '  <div className="gap-3">{empty}</div>',
  '</form>)',
  '',
].join('\n')

/**
 * @param {(line: string) => void} [log]
 * @param {string} [repo]
 * @param {object} [instruments] 只給 meta-test 換掉儀器用(證明 selftest 在儀器壞掉時自己會紅,不是恆綠)
 */
export function selftest(log = console.log, repo = REPO, instruments = loadInstruments(repo)) {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }
  const { typography, classify } = instruments
  const keysOf = (hits) => hits.map((h) => `${h.rule}@${h.line}:${h.token}`)

  // 0. 儀器本身兩面:字級集合讀得到且分得出標題級;分類器「放行 micro、留下 macro」兩面都看得到
  expect(typography.allowed.has('text-body') && typography.allowed.has('text-caption'), `字級集合應含 text-body / text-caption,實得 ${[...typography.allowed]}`)
  expect(typography.headingSizes.has('text-h1') && typography.headingSizes.has('text-body') && !typography.headingSizes.has('text-caption'), `標題級字級應含 h1 / body、不含 caption,實得 ${[...typography.headingSizes]}`)
  expect(typography.isTypographyShaped('text-body-sm') && typography.isTypographyShaped('text-xs') && !typography.isTypographyShaped('text-fg-muted') && !typography.isTypographyShaped('text-left'), '字級形狀判斷應抓 text-body-sm / text-xs、不抓顏色與對齊')
  const probe = ['<span className="inline-flex items-center gap-1">a</span>', '<div className="flex flex-col gap-2">', '<li className="x"/>'].join('\n')
  const notMicro = classify(probe, [1, 2])
  expect(!notMicro.has(1) && notMicro.has(2), `分類器應放行第 1 行(inline-flex micro)、留下第 2 行(flex-col macro),實得留下 ${[...notMicro]}`)

  // 1. 原版 Rating(82f24938):(a)(b)(c) 都在原本那幾行紅;以真實路徑對目前基準比,三條都是「新增」
  const fixture = readFileSync(join(repo, RATING_BEFORE_FIXTURE))
  expect(gitBlobId(fixture) === RATING_BEFORE_BLOB, `對照組 fixture 不是 82f24938 的原版(blob ${gitBlobId(fixture)} ≠ ${RATING_BEFORE_BLOB})`)
  const before = analyzeSource(RATING_STORY, fixture.toString('utf8'), instruments).hits
  const lineSet = (rule) => [...new Set(before.filter((h) => h.rule === rule).map((h) => h.line))].join(',')
  expect(lineSet('primary-submit-disabled') === '78', `原版 (a) 應只在 :78(disabled={rating === 0}),實得 ${lineSet('primary-submit-disabled')}`)
  // :37 的商品名(truncate、塞在卡片列裡)是列的標籤,不是標題 —— 那一段的病是手刻卡片(:28 / :35 的間距),由 (b) 抓
  expect(lineSet('div-heading') === '62', `原版 (c) 應只在 :62(「為這次服務評分」卡片標題),實得 ${lineSet('div-heading')}`)
  expect(lineSet('hardcoded-spacing') === '28,35,43,61,66,77', `原版 (b) 應在 :28 / :35 / :43 / :61 / :66 / :77,實得 ${lineSet('hardcoded-spacing')}`)
  expect(lineSet('unknown-typography') === '', `原版沒有不存在的字級 class,實得 ${lineSet('unknown-typography')}`)
  const baseline = readBaseline(repo)
  const revert = compareWithBaseline(new Map([[RATING_STORY, before]]), baseline)
  const revertRules = new Set(revert.increases.map((i) => i.rule))
  for (const rule of ['primary-submit-disabled', 'hardcoded-spacing', 'div-heading']) expect(revertRules.has(rule), `把 Rating 改回原版,棘輪應在 ${rule} 紅(對基準比)`)

  // 2. 合成新檔:四條規則各一筆,指到正確的 file:line
  const drift = analyzeSource(SYNTHETIC_DRIFT, SYNTHETIC_DRIFT_SOURCE, instruments).hits
  expect(JSON.stringify(keysOf(drift)) === JSON.stringify(SYNTHETIC_DRIFT_EXPECTED), `合成新檔應恰好 ${SYNTHETIC_DRIFT_EXPECTED.join(' / ')},實得 ${keysOf(drift).join(' / ')}`)
  const driftCmp = compareWithBaseline(new Map([[SYNTHETIC_DRIFT, drift]]), baseline)
  expect(driftCmp.increases.length === 4 && driftCmp.increases.every((i) => i.newFile && i.before === 0 && i.hits.length === 1 && i.hits[0].file === SYNTHETIC_DRIFT), `合成新檔對基準比應是 4 條新增、每條 1 筆,實得 ${JSON.stringify(driftCmp.increases.map((i) => [i.rule, i.before, i.after]))}`)

  // 3. 乾淨的合成檔 0 筆
  const clean = analyzeSource(SYNTHETIC_CLEAN, SYNTHETIC_CLEAN_SOURCE, instruments).hits
  expect(clean.length === 0, `乾淨合成檔應 0 筆,實得 ${keysOf(clean).join(' / ')}`)

  // 4. 註記 / 出處不合法 → 仍紅
  const bad = analyzeSource(SYNTHETIC_DRIFT, SYNTHETIC_BAD_ANNOTATIONS_SOURCE, instruments).hits
  const badKeys = bad.map((h) => `${h.rule}@${h.line}`)
  const wantBad = ['primary-submit-disabled@4', 'primary-submit-disabled@6', 'primary-submit-disabled@7', 'hardcoded-spacing@9']
  expect(JSON.stringify(badKeys) === JSON.stringify(wantBad), `不合法註記應全紅(${wantBad.join(' / ')}),實得 ${badKeys.join(' / ')}`)
  expect(bad.find((h) => h.line === 4)?.note?.includes('create') && bad.find((h) => h.line === 6)?.note?.includes('理由'), '未知 intent / 沒寫理由應各自說明原因')

  // 4b. 整檔註記:檔頭寫合法 intent → 整檔放行;檔頭寫不合法 intent → 仍紅;寫在檔中間(不是檔頭)→ 不算整檔
  const composerBody = "import { Button } from '@/design-system/components/Button/button'\nexport const Reply = ({ text, setText }: { text: string; setText: (v: string) => void }) => (<div>\n  <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label=\"回覆\" />\n  <Button variant=\"primary\" disabled={!text.trim()}>送出</Button>\n</div>)\n"
  const fileOk = analyzeSource(SYNTHETIC_DRIFT, `// @submit-intent: composer — 夾具:整檔都是對話輸入盒,空白時送出鈕不可按\n${composerBody}`, instruments).hits
  const fileBad = analyzeSource(SYNTHETIC_DRIFT, `// @submit-intent: chat — 夾具:不是 spec 明文的例外名稱\n${composerBody}`, instruments).hits
  const fileMid = analyzeSource(SYNTHETIC_DRIFT, `${composerBody}// @submit-intent: composer — 夾具:寫在檔尾不是檔頭\n`, instruments).hits
  expect(fileOk.length === 0, `檔頭合法的 @submit-intent 應整檔放行,實得 ${keysOf(fileOk).join(' / ')}`)
  expect(keysOf(fileBad).join() === 'primary-submit-disabled@5:disabled={!text.trim()}' && fileBad[0].note?.includes('chat'), `檔頭不合法的 intent 應仍紅並說明,實得 ${keysOf(fileBad).join(' / ')}`)
  expect(keysOf(fileMid).join() === 'primary-submit-disabled@4:disabled={!text.trim()}', `寫在檔尾的註記不算整檔,實得 ${keysOf(fileMid).join(' / ')}`)

  // 4c. (a) 兩面對照:同一顆「沒選東西時停用」的主鈕 —— 批次操作(不是表單送出)0 筆;
  //     加 type="submit" / 包進 <form> / 停用條件讀的 selected 是控件 value= 綁的值 → 各自 1 筆
  const bulk = (wrapOpen, wrapClose, extra, typeAttr) => [
    "import { Button } from '@/design-system/components/Button/button'",
    "export const Bulk = ({ selected, setSelected }: { selected: string[]; setSelected: (v: string[]) => void }) => (",
    `  ${wrapOpen}`,
    `    ${extra}`,
    `    <Button variant="primary"${typeAttr} disabled={selected.length === 0}>封存選取的 {selected.length} 張工單</Button>`,
    `  ${wrapClose}`,
    ')',
    '',
  ].join('\n')
  const aKeys = (src) => keysOf(analyzeSource(SYNTHETIC_DRIFT, src, instruments).hits.filter((h) => h.rule === 'primary-submit-disabled')).join()
  const hitAt5 = 'primary-submit-disabled@5:disabled={selected.length === 0}'
  expect(aKeys(bulk('<div>', '</div>', '{/* 批次操作列 */}', '')) === '', `批次操作鈕(不是表單送出)不該紅,實得 ${aKeys(bulk('<div>', '</div>', '{/* 批次操作列 */}', ''))}`)
  expect(aKeys(bulk('<div>', '</div>', '{/* 批次操作列 */}', ' type="submit"')) === hitAt5, '同一顆鈕加 type="submit" 應紅')
  expect(aKeys(bulk('<form>', '</form>', '{/* 表單 */}', '')) === hitAt5, '同一顆鈕包進 <form> 應紅')
  expect(aKeys(bulk('<div>', '</div>', '<CheckboxGroup value={selected} onValueChange={setSelected} options={[]} />', '')) === hitAt5, '停用條件讀的 selected 是控件 value 綁的值 → 應紅')

  // 4d. (c) 兩面對照:同一行加粗 body 字 —— 後面只接說明文字(名稱 + 說明)0 筆;後面接元件 / 是 <section> 開頭 → 1 筆;
  //     換成 span、加 truncate → 0 筆
  const nameRow = (tag, cls, follower, wrap = 'div') => [
    'export const Person = () => (',
    `  <${wrap} className="flex flex-col">`,
    `    <${tag} className="text-body font-medium${cls}">陳美惠</${tag}>`,
    `    ${follower}`,
    `  </${wrap}>`,
    ')',
    '',
  ].join('\n')
  const cKeys = (src) => analyzeSource(SYNTHETIC_DRIFT, src, instruments).hits.filter((h) => h.rule === 'div-heading').map((h) => `${h.rule}@${h.line}`).join()
  const caption = '<div className="text-caption text-fg-secondary">產品設計師 · Design Platform</div>'
  const component = '<DescriptionList items={[]} />'
  expect(cKeys(nameRow('div', '', caption)) === '', '名稱 + 說明(後面只接文字)不該算標題')
  expect(cKeys(nameRow('div', '', component)) === 'div-heading@3', '同一行後面接元件 → 應算標題')
  expect(cKeys(nameRow('div', '', caption, 'section')) === 'div-heading@3', '<section> 的第一個子節點 → 應算標題')
  expect(cKeys(nameRow('span', '', component)) === '', 'span(行內文字槽,chrome brand / 列標籤)不在範圍')
  expect(cKeys(nameRow('div', ' truncate', component)) === '', '截斷的列標籤不在範圍')

  // 4e. test-only 兩面對照:同一段四條漂移放在 test-only story(含只被它用到的模組層小元件)→ 0 筆;
  //     拿掉標記 → 4 筆;test-only 之外還有給人看的 story 也用到那個小元件 → 4 筆
  const probeStory = (tags, extraStory = '') => [
    "import type { StoryObj } from '@storybook/react'",
    "import { useState } from 'react'",
    "import { Button } from '@/design-system/components/Button/button'",
    "import { Input } from '@/design-system/components/Input/input'",
    'function ProbeForm() {',
    "  const [email, setEmail] = useState('')",
    '  return (<div className="flex flex-col gap-4">',
    '    <div className="text-body font-semibold">建立帳號</div>',
    '    <p className="text-body-sm text-fg-muted">量測用夾具</p>',
    '    <Input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />',
    '    <Button variant="primary" disabled={!email}>建立帳號</Button>',
    '  </div>)',
    '}',
    `export const Probe: StoryObj = { name: '測試夾具', ${tags}render: () => <ProbeForm /> }`,
    extraStory,
    '',
  ].join('\n')
  const probeHits = (src) => analyzeSource(SYNTHETIC_DRIFT, src, instruments).hits.map((h) => `${h.rule}@${h.line}`).join()
  const probeAll = 'hardcoded-spacing@7,div-heading@8,unknown-typography@9,primary-submit-disabled@11'
  expect(probeHits(probeStory("tags: ['test-only'], ")) === '', `test-only story 與只被它用到的小元件應 0 筆,實得 ${probeHits(probeStory("tags: ['test-only'], "))}`)
  expect(probeHits(probeStory('')) === probeAll, `拿掉 test-only 標記應回到 4 筆,實得 ${probeHits(probeStory(''))}`)
  expect(probeHits(probeStory("tags: ['test-only'], ", "export const Reader: StoryObj = { name: '給人看', render: () => <ProbeForm /> }")) === probeAll,
    '小元件也被給人看的 story 用到 → 不算 test-only,應 4 筆')

  // 5. 重建後的 Rating:(a)(c)(d) 0 筆;(b) 只剩與 CreateProjectForm 逐字相同的表單底列(待拍板)
  const ratingNow = analyzeSource(RATING_STORY, readFileSync(join(repo, RATING_STORY), 'utf8'), instruments).hits
  const nonSpacing = ratingNow.filter((h) => h.rule !== 'hardcoded-spacing')
  expect(nonSpacing.length === 0, `重建後的 Rating (a)(c)(d) 應 0 筆,實得 ${keysOf(nonSpacing).join(' / ')}`)
  const spacing = ratingNow.filter((h) => h.rule === 'hardcoded-spacing')
  const canonicalFooters = readFileSync(join(repo, CANONICAL_FORM_FOOTER), 'utf8').split('\n').map((l) => l.trim())
  // 允許 0 筆:待決那題不論定成「刻意固定 8px(補逃生口)」或「改 token」,Rating 那一行都會消失,不必改本 selftest;
  // 只要多出任何一筆不是那行表單底列,就紅。
  expect(spacing.length <= 1 && spacing.every((h) => h.token === 'gap-2' && canonicalFooters.includes(h.text)),
    `重建後的 Rating (b) 最多只能剩與 ${CANONICAL_FORM_FOOTER} 表單底列逐字相同的那 1 筆,實得 ${keysOf(spacing).join(' / ')}`)

  // 6. 棘輪本身:數字變少允許;基準被手改(count ≠ hits)拒收;基準裡的檔不見了只提示
  const two = [{ ...drift[0] }, { ...drift[0], line: 9 }]
  const fakeBase = buildBaseline(new Map([[SYNTHETIC_DRIFT, two], ['packages/design-system/src/gone.stories.tsx', [{ ...drift[1], file: 'gone' }]]]))
  const lower = compareWithBaseline(new Map([[SYNTHETIC_DRIFT, [drift[0]]]]), fakeBase)
  expect(lower.increases.length === 0 && lower.decreases.length === 2, `數字變少應綠並列出 2 處可收緊,實得 +${lower.increases.length} / -${lower.decreases.length}`)
  expect(validateBaseline(fakeBase).length === 0, `buildBaseline 產出的基準應合法:${validateBaseline(fakeBase).join(';')}`)
  const tampered = structuredClone(fakeBase)
  tampered.files[SYNTHETIC_DRIFT]['hardcoded-spacing'].count = 5
  expect(validateBaseline(tampered).length > 0, '基準 count 被手改成與 hits 對不上時應拒收')
  const moved = compareWithBaseline(new Map([[SYNTHETIC_DRIFT, [...two, { ...drift[0], line: 10, text: '<div className="gap-4">' }]]]), fakeBase)
  expect(moved.increases.length === 1 && moved.increases[0].hits.length === 1 && moved.increases[0].hits[0].line === 10, `同檔多一筆時應只指出新增那一行(:10),實得 ${JSON.stringify(moved.increases.map((i) => i.hits.map((h) => h.line)))}`)

  // 7. 掃到 0 檔 = 儀器失效(CLI 據此 exit 2)
  expect(scanTree({ repo, instruments, files: [] }).stats.files === 0, '空範圍應回 0 檔')

  if (problems.length) {
    log('✗ story-layer-drift-invariant --selftest 失敗:')
    for (const p of problems) log(`  · ${p}`)
    return false
  }
  log('✓ story-layer-drift-invariant --selftest:')
  log(`  · 儀器:字級集合 ${typography.allowed.size} 個(標題級 ${typography.headingSizes.size})、Tailwind 預設字級 ${typography.tailwindScale.size} 個;分類器兩面(micro 放行 / macro 留下)`)
  log(`  · 原版 Rating(blob ${RATING_BEFORE_BLOB.slice(0, 8)}):(a) :78 / (b) :28 :35 :43 :61 :66 :77 / (c) :62 全紅,對基準比三條都是新增`)
  log(`  · 合成新檔四條各一筆:${SYNTHETIC_DRIFT_EXPECTED.join(' / ')}`)
  log('  · 乾淨合成檔 0 筆(含 chrome brand span、名稱 + 說明、截斷列標籤、批次操作鈕);不合法註記 4 筆全紅(同行逃生口照 hook 語意放行);整檔註記:檔頭合法放行、不合法仍紅、檔尾不算')
  log('  · 兩面對照:(a) 批次操作鈕 0 筆 / 加 type=submit、包 <form>、讀控件 value 各 1 筆;(c) 名稱 + 說明、span、truncate 0 筆 / 後接元件、<section> 開頭各 1 筆;test-only 0 筆 / 拿掉標記、被給人看的 story 共用 各 4 筆')
  log('  · 棘輪:變少綠、手改基準拒收、同檔多一筆只指出新的那行;空範圍 = 儀器失效')
  log(`  · 重建後 Rating:(a)(c)(d) 0 筆;(b) ${spacing.length} 筆${spacing.length ? ` = ${RATING_STORY}:${spacing[0].line} gap-2,與 CreateProjectForm 表單底列逐字相同(待拍板)` : ''}`)
  return true
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  try {
    if (argv.includes('--selftest')) { process.exitCode = selftest() ? 0 : 1; return }
    const instruments = loadInstruments()
    const { perFile, stats } = scanTree({ instruments })
    if (stats.files === 0 || stats.buttons === 0 || stats.classStrings === 0) {
      throw new InstrumentError(`掃到 ${stats.files} 個展示層 story、${stats.buttons} 顆 Button、${stats.classStrings} 段 class 字串 —— 沒量到不是通過(M37)`)
    }
    const totals = totalsOf(perFile)
    if (argv.includes('--list')) {
      for (const hits of perFile.values()) for (const h of hits) console.log(`${h.file}:${h.line}\t${h.rule}\t${h.token}`)
      console.log(`\n共 ${Object.entries(totals).map(([r, n]) => `${r} ${n}`).join(' / ')}`)
      return
    }
    if (argv.includes('--write-baseline')) {
      writeFileSync(join(REPO, BASELINE_PATH), `${JSON.stringify(buildBaseline(perFile), null, 2)}\n`)
      console.log(`已寫入 ${BASELINE_PATH}:${Object.entries(totals).map(([r, n]) => `${r} ${n}`).join(' / ')}`)
      return
    }
    const baseline = readBaseline()
    if (!baseline) { console.error(`✗ 找不到 ${BASELINE_PATH}`); process.exitCode = 1; return }
    const malformed = validateBaseline(baseline)
    if (malformed.length) {
      console.error(`✗ ${BASELINE_PATH} 格式不合(被手改過?):`)
      for (const m of malformed) console.error(`  · ${m}`)
      process.exitCode = 1
      return
    }
    const { increases, decreases } = compareWithBaseline(perFile, baseline)
    console.log(`=== 展示層 story 漂移棘輪 ===  掃了 ${stats.files} 個展示層 story / ${stats.buttons} 顆 Button / ${stats.classStrings} 段 class 字串(${stats.classWords} 個字);略過 ${stats.testOnlyRanges} 段 test-only`)
    for (const rule of RULE_IDS) console.log(`  ${RULES[rule].label}:目前 ${totals[rule]} / 基準 ${baseline.totals[rule]}`)
    if (decreases.length) {
      console.log(`\n✓ ${decreases.length} 處比基準少(可在本機跑 --write-baseline 收緊):`)
      for (const d of decreases) console.log(`  ${d.file}  ${d.rule}  ${d.before} → ${d.after}`)
    }
    if (increases.length) {
      console.error(`\n✗ ${increases.length} 處新增漂移(該檔該規則的命中數高於基準;新檔基準 = 0):`)
      for (const inc of increases) {
        console.error(`\n  ${inc.file}  ${RULES[inc.rule].label}  ${inc.before} → ${inc.after}${inc.newFile ? '(新檔)' : ''}${inc.hits.length > inc.after - inc.before ? '(以下含改寫過的舊行)' : ''}`)
        for (const h of inc.hits) console.error(`    ${describeHit(h, instruments.typography)}`)
      }
      process.exitCode = 1
      return
    }
    console.log('\n✓ 沒有新增漂移')
  } catch (error) {
    if (error instanceof InstrumentError) { console.error(`✗ INSTRUMENT-FAIL:${error.message}`); process.exitCode = 2; return }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
