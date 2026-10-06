#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 的 story 三層(packages/design-system/src/**\/*.stories.tsx;story-rules.md「三層定位」:展示 / 設計規格 / 設計原則,
 *         不含標 tags:['test-only'] 的自動化夾具 story)不會「新增」Rating 送出評分範例曾有的四種漂移,每檔每條規則的命中數不得高於
 *         scripts/story-layer-drift-baseline.json(棘輪;新檔任何一筆都算新增)。各層適用的規則(2026-10-01 起;理由見下方「範圍」):
 *         展示層 / 設計原則層 = 四條全收;設計規格層(*.anatomy)= (a)(c)(d),(b) 不收(量測矩陣 / Inspector 的版面本身就是固定幾何)。
 *         設計原則層裡「刻意示範的 ❌ 寫法本身」可在該行或正上方只有註解的一行寫 `@story-counter-example: 理由`(≥ 6 字)放行;
 *         同一個標記寫在展示層 / 設計規格層不算數(那兩層的範例會被照抄),理由太短也不算數;放行的反例標記本身也進棘輪
 *         (每檔只准往下,新增一個要隨基準檔一起送審);`@layout-space-magic-ok:` 放行的寫死間距同樣進棘輪(2026-10-06 起,每個被放行的字一筆,
 *         分類器本來就放行的 micro 行不算)。標記與逃生口都只認**註解裡**的字(TypeScript 註解範圍,不是整行字串比對),理由數 code point:
 *         字串屬性裡的標記不算、「{/* 標記 *\/}<div …>」只放行自己那一行(不連帶下一行)、`@layout-space-magic-ok:` 沒寫理由(< 6 字)不算:
 *         (a) 新建表單的主送出鈕被停用 —— 表單的送出鈕(`type="submit"`、在 `<form>` 裡,或停用條件讀的正是某個控件 `value=` 綁的值)
 *             寫成 `<Button variant="primary" disabled={條件}>`,且條件不是 useFormValidation 自己的送出狀態;
 *             spec 明文的兩種例外(更新類 / 對話輸入盒)要逐行或整檔寫 `@submit-intent: update|composer — 理由`;
 *         (b) 寫死的間距(gap / p / m 家族的任何數字刻度、[Npx|rem|em] 任意值、inline style 的 gap / padding* / margin* 字面值),
 *             判法與 check_layout_space_magic_numbers.sh 同一套:utility-registry 的 micro 幾何分類器(直接呼叫 hooks/lib/_micro_geometry.sh)、
 *             分隔線與 `@layout-space-magic-ok:` 照舊放行;
 *         (c) 用 <div> / <p> 做標題(標題字級 + 加粗字重、只有文字、沒被截斷,而且後面接著它要當標題的區塊;不論排成幾行),
 *             typography.spec.md:43「視覺標題 ≠ 語義標題(一律用 h1–h6)」;
 *         (d) DS 字級 token 裡沒有的 text-* 字級 class —— 允許集合從 typography.css 的 @utility 讀,Tailwind 預設字級從 tailwindcss/theme.css 讀。
 *   紅: 任一檔任一規則的命中數高於基準、或新檔有命中 → 印出新增命中的 file:line 並 exit 1;基準本身比 merge-base 寬
 *       (用同一支儀器量 base 那棵樹,任一檔任一規則基準記的數字高於 base 實測:數字一致的手改加額度、替新檔預留)→ exit 1;
 *       基準格式不合(count ≠ hits、指紋不是 12 碼十六進位、替不在範圍的檔記數字)→ exit 1;CI 找不到可比對的 base → 儀器失效;
 *       CI 裡任一格比基準少而基準沒在同一個 PR 收緊 → exit 1(2026-10-06:否則合併後下一個無關 PR 會因「基準比 base 寬」誤紅、指名錯的 PR);
 *       --selftest 以 82f24938 原版
 *       rating.stories.tsx(fixture 以 git blob id 驗明正身)證明 (a)(b)(c) 各自在原本那幾行紅,以合成新檔證明四條規則各在指定 file:line 紅;
 *       註記不合法(未知 intent、沒寫理由、檔案根本沒呼叫 useFormValidation 卻用 hook 狀態當理由)必須仍紅;基準檔被手改成數字對不上 → 紅;
 *       同一顆鈕 / 同一行標題的兩面對照:加上 type="submit" / 包進 <form> / 停用條件讀控件的 value → (a) 紅;後面接元件 → (c) 紅;
 *       同一段漂移從 test-only story 搬到給人看的 story → 紅;
 *       分層兩面:同一段漂移放進設計原則層 → 四條紅、放進設計規格層 → (a)(c)(d) 紅((b) 不收);
 *       `@story-counter-example:` 搬到展示層 / 設計規格層、理由太短、與命中行之間隔了一行非註解 → 仍紅並說明;
 *       2026-10-01 掃除前的真檔(a89b6610 的 command.principles / hover-card.anatomy,fixture 以 git blob id 驗明正身)
 *       在原本那幾行紅((b) :21 :25 :39 :60 + (d) :74;(c) :38 :96),對已提交的基準比都是新增;
 *       `@story-counter-example` 綁的兩句 canonical 原文(story-rules.md:17 三層定位、category-templates.md:168 do/don't 只住 principles)
 *       任一句不見了 → 儀器失效;helper 的 `<div 標題字級 加粗>{title}</div>{children}` → (c) 紅(後面接 `{note}` 文字 → 0 筆)。
 *   綠: 命中數不高於基準時綠(數字變少允許,會提示收緊基準);乾淨的合成檔(用 token、h1–h6、hook 送出狀態、合法註記、
 *        側欄 chrome 的 workspace brand span(sidebar.spec.md:264)、列裡的名稱 + 說明、截斷的列標籤、批次操作鈕)0 筆;
 *        test-only story(與只被它用到的模組層小元件)裡的同一段漂移 0 筆;設計規格層的寫死間距 0 筆;
 *        設計原則層四條漂移各自帶合法 `@story-counter-example:`(正上方或同一行)0 筆;
 *        重建後的 Rating 展示檔 (a)(c)(d) 0 筆、(b) 最多只剩與 field.stories.tsx CreateProjectForm 逐字相同的那一行表單底列(待拍板,見待辦總帳);
 *        掃到 0 檔、任一層 0 檔、字級集合讀不到、分類器叫不起來 = 儀器失效(exit 2),不讀成通過。純靜態(TypeScript AST + 既有 bash/python 分類器),
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
// 範圍 = story 三層(story-rules.md:15-17「三層定位」)裡給人看的 story,各層收的規則不同(層由檔名決定,見 LAYERS):
//   · 展示層(*.stories.tsx,:15)四條全收:展示層是「真實業務場景的產品範例」—— 消費者照抄的是這一層
//     (story-rules.md「範例最高準則」「Production-grade composition fidelity」)。
//   · 設計原則層(*.principles.stories.tsx,:17)四條全收(2026-10-01 起;第一版不收):一則 UsageGuidance 的 ✅ / ❌ 範例組合
//     本身就是產品樣貌、同樣會被照抄;外框的 Rule / Section / Label 教學框跟展示層 patterns/action-bar.stories.tsx 的同一個 helper,
//     原則層不收就等於同一個 helper 有兩套間距語言。第一版不收的理由是「❌ 反例本身就可能是寫死的間距 / 停用的送出鈕」——
//     那種情形改由 `@story-counter-example: 理由` 逐行放行(只在本層有效),不再整層豁免:2026-10-01 掃除時原則層 906 筆命中裡
//     只有 4 筆是真正的反例本身,其餘全是教材外框與 ✅ 範例裡的漂移。
//   · 設計規格層(*.anatomy.stories.tsx,:16)收 (a)(c)(d)、不收 (b):這一層是 6-canonical 版面(Overview 藍圖 / Inspector /
//     Color-Size-State 矩陣 / A11y),2026-10-01 逐筆盤過 2517 筆 (b) 命中全落在這些量測版面或 spec helper(Th / Td / TkVal / PropRow),
//     子節點有 ≥ 2 個 DS 元件的 36 行全是變體 / 狀態 / 尺寸矩陣列 —— 量測鷹架的固定幾何,不是產品組合;同一個切法已有先例:
//     check_story_invariants.sh R1(含 A.5 原生控件)2026-06-11 起豁免 anatomy。但「用 div 當標題」「不存在的字級」
//     「新建表單停用送出鈕」在規格頁一樣是錯的(盤到 hover-card.anatomy :38 :96、time-picker.anatomy :60 :121 四筆 div 標題)。
//   · Tokens / Patterns 只有單檔展示(story-rules.md「Title canonical 4-part exemption」),它們就是展示層,在範圍內。
//   · 標 tags:['test-only'] 的 story 不在範圍(連同只被它們用到的模組層小元件):story-rules.md「Technical probe visibility」
//     說它們只服務自動化、不進側欄與 Autodocs —— 讀者看不到、消費者不會照抄,掃進來只會逼閘的夾具去貼豁免(2026-10-01 收斂)。
//   · `@story-counter-example:` 為什麼只在設計原則層有效:只有原則層的本分是對照「❌ 錯的寫法」;展示層與規格層的範例會被照抄,
//     在那兩層標反例等於替漂移開後門 —— 那裡的標記照樣紅,並說明原因。
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
//       (className 屬性、cn/clsx/cva 呼叫、名字帶 class 的變數或屬性),說明文字裡提到 `gap-2` 不算。2026-10-01 審查補洞:
//       任何位數的刻度(gap-100)、[Nrem] / [Nem] 任意值、inline style 的 gap / padding* / margin* 字面值、名字不帶 class 但字串
//       本身是一串版面 utility 的變數 / 物件值、任意值裡含中文的 class 字串。刻意不收(會誤判或另屬他題):text-[13px] 任意字級、
//       p-[12px_8px] 多值任意值、calc()、style={{ margin: '0 auto' }}。
//       2026-10-06 再補:`2xl:` 這類數字開頭的響應式前綴、className 裡夾一個中文字(直接的 class 位置不再看字串形狀)、
//       被 cn() / className 拿去用的單字常數(const pad = 'p-6')、[gap:12px] 任意屬性、style 物件的 as / satisfies / 括號、
//       放在常數裡或展開進來的 style 物件、樣板字串 `${24}px`、token 夾字面值 'var(--x) 24px'。
//       放行順序:分隔線元件(Separator / ButtonDivider)**自己的** class → 放行(2026-10-06 前是整行有這個字就整行放行,同一行
//       別的元素的 gap、分隔線上手寫的 mx-1 / h-6 都看不到;action-bar.spec.md「分隔線幾何」禁的正是後者);同行或正上方
//       「只有註解的一行」寫 @layout-space-magic-ok: → 放行(記進棘輪);該行所有間距字都在 utility-registry 的 gap_utilities 裡
//       → 交給 _micro_geometry.sh 分類器判,分類器說是 micro 才放行。
//       分類器不在這裡重寫一份:兩份一定會漂。設計規格層不收本條(見上方「範圍」)。
//   (c) <div> / <p>,className 同時有「標題級字級」(typography.css 裡字級 ≥ --font-body-size 的 @utility,不寫死清單)與加粗字重
//       (font-medium / semibold / bold / extrabold / black),內容只有文字或 {運算式}(沒有子元素;排成幾行都一樣 —— 2026-10-06 起
//       不再要求開頭結尾同一行,prettier 把文字放到自己那一行的寫法原本看不到)、沒有 role / aria-level。
//       標題是「替後面那一塊命名」的字,所以還要同時成立:
//         · 沒被截斷(truncate / line-clamp-* / text-ellipsis)—— 截斷的是塞在固定寬列槽裡的名稱(商品名、人名),是列的標籤;
//         · 同一層後面至少接一個「不是純文字」的兄弟(元件、控件、含子元素的區塊、helper 的 `{children}`),或它是 <section> 的第一個子節點 ——
//           後面只接說明文字、又不是區段開頭的是「名稱 + 說明」(item-anatomy 的 label / description:人名 + 職稱、
//           商品名 + 價格),不是標題。
//       不收 <span>:span 是行內文字槽 —— chrome 的 workspace brand / user name 明文用 span + text-body-lg font-medium
//       (sidebar.spec.md:264),列裡的成員名、欄位標籤也是 span;<strong> 是強調語意,同樣不在範圍
//       (2026-10-01 收斂:第一版連 div / span 的列標籤與 chrome brand 都當標題,擋到 DS 自己的 canonical)。
//       <p> 2026-10-06 起收:段落語意的 p 不會同時是「標題字級 + 加粗 + 只有文字 + 後面接著它命名的區塊」,四個條件都成立的
//       p 就是畫成標題的段落(審查實例:field-control-group.principles 的「FieldGroup(垂直堆疊)」卡片標題);全樹實測只多 1 筆,當場修。
//   (d) class 字串裡的 text-<名> 若「長得像字級」卻不在 typography.css 的 @utility text-* 裡 → 命中。「長得像字級」= 名字以 DS 字級的
//       字幹開頭(h<數字> / body / caption / footnote,從 @utility 名字推出來)或是 Tailwind 預設字級(tailwindcss/theme.css 的 --text-*)。
//       顏色(text-fg-muted)、對齊(text-left)等不是字級,不會被誤判。
//   反例標記(設計原則層):四條規則的命中都先看「該行,或正上方只有註解的一行」有沒有 `@story-counter-example: 理由`
//       (與 @layout-space-magic-ok 同一種位置語意;理由 ≥ 6 字)。原則層 + 合法 → 不算命中(統計列為「放行的反例」);
//       不在原則層、或理由太短 → 照算命中,並在說明裡講為什麼標記不算數。
//
// 棘輪:scripts/story-layer-drift-baseline.json 記每檔每條規則的命中數(count)與每筆命中的指紋(hits,只拿來指出「哪一行是新的」),
//   外加兩格「被標記放行」的數字:設計原則層的反例標記、@layout-space-magic-ok 逃生口(2026-10-06 起;兩格比 base 多不算放寬,列進 review)。
//   判定只看 count:目前 > 基準 → 紅;新檔 = 基準 0。數字變少:本機只提示,**CI 裡紅**(同一個 PR 要跑 --write-baseline 收緊,
//   否則鬆的基準合併後,下一個無關 PR 的 base 比對會誤紅 —— 2026-10-06 審查「延遲誤紅」)。`--write-baseline` —— **CI 永遠不跑它**
//   (2026-10-01 審查:數字彼此一致的手改原本整套放行 → 現在另外對 merge-base 實測:PR 用 origin/<GITHUB_BASE_REF>、main 上的 push 用 HEAD^,
//   `--base=<ref>` 可明確指定;比的是「同一支儀器量 base 那棵樹」而不是 base 的基準檔,偵測規則變寬時兩邊一起變,不會誤紅)
//   (meta-test 斷言 ci.yml 與 package.json 都沒有這個旗標)。指紋 = sha256(規則 + 該行去頭尾空白 + 命中字)前 12 碼;行被改寫過
//   但數字沒增加時照樣綠,只在數字增加時拿來把新增的那幾行挑出來(被改寫過的舊行也會一起列出,標「以下含改寫過的舊行」)。
//
//   node scripts/story-layer-drift-invariant.mjs                  判定(exit 0 綠 / 1 新增漂移 / 2 儀器失效)
//   node scripts/story-layer-drift-invariant.mjs --selftest       對照組(見 @gate-contract)
//   node scripts/story-layer-drift-invariant.mjs --list           列出目前全部命中(給下一批修漂移用),不判定
//   node scripts/story-layer-drift-invariant.mjs --write-baseline 重寫基準(只在人工確認後本機執行;CI 永不執行)
//   判定邏輯在 runCli({ repo, argv, env }) —— meta-test 在臨時 git repo 裡端到端呼叫它,再真的 `node` 一次驗進入點。
import ts from 'typescript'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, globSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
/**
 * 2026-10-01 擴大範圍的對照組:掃除前(a89b6610)的兩支真檔,逐位元組 = 各自的 git blob。
 * 以真實路徑分析時必須在原本那幾行紅(設計原則層四條全收、設計規格層不收 (b)),對已提交的基準比都是新增。
 */
export const LAYER_BEFORE_FIXTURES = Object.freeze([
  {
    story: 'packages/design-system/src/components/Command/command.principles.stories.tsx',
    fixture: 'scripts/test-fixtures/story-layer-drift/command.principles.a89b6610.tsx.txt',
    blob: 'a65c58f38eed3769be5e723be3e9e77c1d2ae232',
    expected: ['hardcoded-spacing@21:gap-12', 'hardcoded-spacing@25:space-y-1', 'hardcoded-spacing@39:mt-3', 'hardcoded-spacing@60:gap-12', 'unknown-typography@74:text-xs'],
  },
  {
    story: 'packages/design-system/src/components/HoverCard/hover-card.anatomy.stories.tsx',
    fixture: 'scripts/test-fixtures/story-layer-drift/hover-card.anatomy.a89b6610.tsx.txt',
    blob: 'f2e3badfd6604a21ad5dafecd95928882a2c6bbb',
    expected: ['div-heading@38:<div text-body font-medium>', 'div-heading@96:<div text-body font-medium>'],
  },
])

export const RULE_IDS = Object.freeze(['primary-submit-disabled', 'hardcoded-spacing', 'div-heading', 'unknown-typography'])
export const RULES = Object.freeze({
  'primary-submit-disabled': {
    label: '(a) 新建表單的主送出鈕被停用',
    owner: 'packages/design-system/src/components/Field/form-validation.spec.md:15「新建(Create)| 永遠 enabled」+ :142「❌ 對 Create form 用 disabled-until-dirty Submit button」',
    fix: '送出鈕永遠可按,按下時由 useFormValidation 驗證並把焦點帶到第一個錯誤(同 field.stories.tsx CreateProjectForm);真的是更新類 / 對話輸入盒,在該行正上方寫 {/* @submit-intent: update|composer — 理由 */}',
  },
  'hardcoded-spacing': {
    label: '(b) 寫死的間距',
    owner: 'packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md:306「❌ 元素間 gap 硬寫」+ :159-178「該用 token vs 刻意固定」(設計規格層不收)',
    fix: '改用 gap-/p-/m-[var(--layout-space-tight|loose|bottom)];刻意固定的 micro 值在該行正上方寫 {/* @layout-space-magic-ok: 理由 */}(同 check_layout_space_magic_numbers.sh)',
  },
  'div-heading': {
    label: '(c) 用 div / p 做標題',
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

/**
 * `@story-counter-example:` 只在設計原則層有效 —— 這條例外綁兩句 canonical 原文(同 SUBMIT_INTENTS):
 * 三層定位裡「設計原則層 = *.principles.stories.tsx」,以及「do/don't 對照只住在 principles、不放 showcase」。
 * 原文不見了 = 「只有原則層可以標反例」沒有出處 → 儀器失效(例外沒有出處就不再是例外)。
 */
export const COUNTER_EXAMPLE_SOURCES = Object.freeze([
  {
    spec: 'packages/design-system/ds-canonical/rules/story-rules.md',
    quote: '| 3 設計原則 | `*.principles.stories.tsx`',
    meaning: 'story 三層定位(:17):設計原則層 = *.principles.stories.tsx',
  },
  {
    spec: 'packages/design-system/ds-canonical/skills/story-writing/references/category-templates.md',
    quote: "do/don't 對照放 showcase(屬 principles)",
    meaning: '✅ / ❌ 對照只住在設計原則層,不放展示層(:168「禁止」)',
  },
])

export class InstrumentError extends Error {}

const TEXT_WEIGHTS = new Set(['font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'])
/** (c) 收的元素:div,以及 2026-10-06 起的 p(審查:FieldControlGroup 用 <p className="text-body font-bold"> 當卡片標題,只認 div 看不到) */
const HEADING_SHAPED_TAGS = new Set(['div', 'p'])
const CLASS_CALLEES = new Set(['cn', 'clsx', 'cx', 'cva', 'twMerge', 'classNames'])
const CLASS_BINDING = /class|cls|styles?$/i
const SPACING_PREFIX = '(?:p|px|py|pt|pb|pl|pr|ps|pe|gap|gap-x|gap-y|space-x|space-y|m|mx|my|mt|mb|ml|mr|ms|me)'
// 數字刻度不限位數(gap-100 在 Tailwind v4 一樣產生 CSS)、任意值收 px / rem / em(2026-10-01 審查:gap-[1rem]、gap-100 原本看不到)
const SPACING_WORD = new RegExp(`^-?${SPACING_PREFIX}-(?:0\\.5|[1-9][0-9]*(?:\\.[0-9])?|\\[[0-9]*\\.?[0-9]+(?:px|rem|em)\\])$`)
/** inline style 裡的間距屬性(React style 物件的 key);值是非 0 的數字或帶長度單位的字串、而且沒讀 var(--…) → 寫死的間距 */
const STYLE_SPACING_PROP = /^(?:gap|rowGap|columnGap|padding|margin)(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?$/
/** Tailwind 任意屬性 [gap:12px] / [padding-top:1rem](2026-10-06 審查:原本整個看不到);讀 var(--…) 的不算 */
const ARBITRARY_SPACING_PROPERTY = /^\[(?:gap|row-gap|column-gap|padding|margin)(?:-[a-z]+)*:(?![^\]]*var\()[^\]]*[0-9](?:px|rem|em)[^\]]*\]$/
/** 名字不帶 class 的變數 / 屬性裡的字串,至少兩個字、而且有一個是版面 utility,才當 class 字串(一般資料字串不會這樣長) */
const LAYOUT_UTILITY = /^(?:[a-z0-9-]+:)*!?(?:flex|inline-flex|grid|inline-grid|block|inline-block|hidden|items-|justify-|content-|self-|place-|gap-|space-[xy]-|-?p[xytblrse]?-|-?m[xytblrse]?-|rounded|border|bg-|text-|font-|w-|h-|size-|min-|max-|overflow|relative|absolute|sticky|shrink|grow|basis-)/
const COUNTER_KEY = 'story-counter-example'
/** 基準裡「被 @layout-space-magic-ok 放行的寫死間距」那一格(2026-10-06 審查:逃生口原本無上限、不進棘輪,6 個字的理由就能放行任何新間距) */
const ESCAPE_KEY = 'layout-space-magic-ok'
const FINGERPRINT = /^[0-9a-f]{12}$/
const LAYOUT_ESCAPE = '@layout-space-magic-ok:'
/** (b) 的分隔線放行只認分隔線元件**自己的** class(2026-10-06 審查:原本整行有 Separator 字樣就整行跳過,同一行的 mx-1 / h-6、別的元素的 gap 都看不到) */
const DIVIDER_TAG = /^(?:Separator|ButtonDivider)$/
const COMMENT_ONLY = /^\s*(\/\/|\{?\/\*|\*)/ // 檔頭註記與 @submit-intent 用;反例標記 / 逃生口改看 TypeScript 的註解範圍(commentIndex)
const SUBMIT_MARKER = /@submit-intent:\s*([A-Za-z-]*)\s*(?:[—–]+|-{1,2})?\s*(.*)$/
const HOOK_STATE_TERM = /^(?:[A-Za-z_$][\w$]*\.)?(?:submitDisabled|isSubmitting)$/
const CLIPPED_TEXT = /^(?:truncate|text-ellipsis|line-clamp-\d+)$/
const COUNTER_MARKER = /@story-counter-example:\s*(.*)$/

/**
 * story 三層(story-rules.md:15-17「三層定位」)與各層收的規則。層由檔名決定;理由見檔頭「範圍」。
 * 改這張表 = 改閘的範圍:selftest 的分層兩面對照與 meta-test 會跟著驗。
 */
export const LAYERS = Object.freeze({
  showcase: Object.freeze({ label: '展示層', rules: RULE_IDS, counterExample: false }),
  principles: Object.freeze({ label: '設計原則層', rules: RULE_IDS, counterExample: true }),
  anatomy: Object.freeze({ label: '設計規格層', rules: Object.freeze(RULE_IDS.filter((r) => r !== 'hardcoded-spacing')), counterExample: false }),
})
export const layerOf = (rel) => (/\.anatomy\.stories\.tsx$/.test(rel) ? 'anatomy' : /\.principles\.stories\.tsx$/.test(rel) ? 'principles' : 'showcase')
export const ruleApplies = (rel, rule) => LAYERS[layerOf(rel)].rules.includes(rule)

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
// CJK 只在任意值 [...] 外才算「不是 class」:after:content-['註'] 是合法 class(2026-10-01 審查:一個這種字就讓整串 class 隱形)。
// 字首可以是數字:`2xl:gap-16` 是 Tailwind 的響應式前綴(2026-10-06 審查:一個 2xl: 字就讓整串 class 隱形)。
// 只用在「名字推出來的」綁定(class 名的變數 / 長得像 utility 的資料字串);直接的 class 位置(className 屬性、cn() 參數、
// 被拿去當 class 用的常數)不靠形狀判斷 —— 那裡的每個字都是 class,夾一個中文字也不該讓整串隱形。
const looksLikeClassList = (s) => {
  const words = s.trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((w) => /^[!-]?[a-z0-9[@*]/i.test(w) && !/[　-鿿＀-￯]/.test(w.replace(/\[[^\]]*\]/g, '')))
}
const looksLikeUtilityList = (s) => {
  const words = s.trim().split(/\s+/).filter(Boolean)
  return words.length >= 2 && words.some((w) => LAYOUT_UTILITY.test(w))
}
const isClassAttribute = (attr) => /class/i.test(attr.name.getText())
const isClassCall = (call) => CLASS_CALLEES.has(call.expression.getText())
/**
 * 被拿去當 class 用的識別字:出現在 className 屬性運算式裡、或 cn()/clsx()/cva() 參數裡的識別字(2026-10-06 審查:
 * `const pad = 'p-6'` 再 `cn('flex', pad)` 原本看不到 —— 名字不帶 class、字串只有一個字,兩個名字規則都不收)。
 */
function classIdentifiers(sf) {
  const names = new Set()
  const collectIds = (n) => {
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) names.add(n.text)
    ts.forEachChild(n, collectIds)
  }
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && isClassAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) collectIds(n.initializer.expression)
    if (ts.isCallExpression(n) && isClassCall(n)) for (const a of n.arguments) collectIds(a)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return names
}
/** 字串所在的 class 位置:'direct'(className 屬性 / cn() 參數 / 被當 class 用的常數)、'named'(名字推出來的綁定)、null(不是 class) */
function classContextOf(node, classIds) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return isClassAttribute(p) ? 'direct' : null
    if (ts.isCallExpression(p) && isClassCall(p)) return 'direct'
    if ((ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name) {
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && classIds.has(p.name.text)) return 'direct'
      if (CLASS_BINDING.test(p.name.getText())) return 'named'
      // 名字不帶 class 的變數 / 屬性(const rowLayout = 'flex flex-col gap-12'):字串本身長得像一串版面 utility 才算(2026-10-01 審查)
      return looksLikeUtilityList(node.text ?? '') ? 'named' : null
    }
    if (ts.isBlock(p) || ts.isSourceFile(p)) return null
  }
  return null
}
/** 字串屬於哪個元素的 class 屬性:分隔線元件自己的 class 由分隔線的幾何擁有(見 (b) 放行順序) */
function ownerTagOf(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) {
      const opening = p.parent?.parent
      return opening && (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) ? opening.tagName.getText() : null
    }
    if (ts.isBlock(p) || ts.isSourceFile(p)) return null
  }
  return null
}

/**
 * 檔內所有註解的 [起, 迄) 位置(TypeScript 的註解範圍;JSX 的 {/* … *\/} 也算)。
 * 標記只認寫在註解裡的:字串屬性 title="@story-counter-example: …" 不算(2026-10-01 審查)。
 * JSX 文字裡的 // 不是註解,與 JsxText 重疊的範圍丟掉。
 */
function commentIndex(sf, text) {
  const seen = new Map()
  const jsxText = []
  const add = (ranges) => { for (const r of ranges ?? []) if (!seen.has(r.pos)) seen.set(r.pos, [r.pos, r.end]) }
  const visit = (n) => {
    if (ts.isJsxText(n)) { if (n.getText(sf).trim()) jsxText.push([n.getStart(sf), n.getEnd()]); return }
    add(ts.getLeadingCommentRanges(text, n.pos))
    add(ts.getTrailingCommentRanges(text, n.end))
    // {/* … *\/}:大括號後同一行的註解是「尾隨」註解(TypeScript 的 leading 只收換行之後的),兩種都收
    if (ts.isJsxExpression(n) && !n.expression) { add(ts.getTrailingCommentRanges(text, n.getStart(sf) + 1)); add(ts.getLeadingCommentRanges(text, n.getStart(sf) + 1)) }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const ranges = [...seen.values()].filter(([a, b]) => !jsxText.some(([x, y]) => a < y && b > x)).sort((a, b) => a[0] - b[0])
  const lineStarts = sf.getLineStarts()
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1
  /** 第 n 行(1-based)上,落在註解裡的標記文字(含標記本身之後到註解結尾的內容) */
  const markersOn = (n, marker) => {
    const out = []
    for (const [a, b] of ranges) {
      if (lineOf(b - 1) < n || lineOf(a) > n) continue
      const body = text.slice(a, b)
      const at = body.indexOf(marker)
      if (at >= 0) out.push(body.slice(at))
    }
    return out
  }
  /** 第 n 行除了註解(與 JSX 註解的大括號)之外什麼都沒有 */
  const commentOnly = (n) => {
    const start = lineStarts[n - 1]
    const end = n < lineStarts.length ? lineStarts[n] : text.length
    const original = text.slice(start, end)
    if (original.trim() === '') return false
    let rest = original
    for (const [a, b] of ranges) {
      const x = Math.max(a, start)
      const y = Math.min(b, end)
      if (x < y) rest = rest.slice(0, x - start) + ' '.repeat(y - x) + rest.slice(y - start)
    }
    return rest.replace(/[{}\s]/g, '') === ''
  }
  /**
   * 標記對第 n 行有效:寫在第 n 行的註解裡(只管這一行),或第 n-1 行「只有註解」且那一行的註解帶標記(管下一行)。
   * 「{/* 標記 *\/}<div …>」那一行不是只有註解 —— 它只放行自己,不再連帶放行下一行(2026-10-01 審查)。
   */
  const markersFor = (n, marker) => [...markersOn(n, marker), ...(n > 1 && commentOnly(n - 1) ? markersOn(n - 1, marker) : [])]
  return { ranges, markersFor }
}
function lineStartingAt(sf, pos) { return sf.getLineAndCharacterOfPosition(pos).line + 1 }

/** class 字串裡的每個字(含所在行號、是否屬於分隔線元件自己的 class);落在 test-only 範圍裡的不收。 */
function classWords(sf, text, excluded = () => false) {
  const words = []
  let strings = 0
  const classIds = classIdentifiers(sf)
  const visit = (n) => {
    const isStr = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
    const kind = isStr ? classContextOf(n, classIds) : null
    if (kind && (kind === 'direct' || looksLikeClassList(n.text)) && !excluded(n.getStart(sf))) {
      strings++
      const start = n.getStart(sf)
      const raw = text.slice(start, n.getEnd())
      const divider = DIVIDER_TAG.test(ownerTagOf(n) ?? '')
      for (const m of raw.matchAll(/[^\s'"`{}$]+/g)) words.push({ word: m[0], base: utilityBase(m[0]), line: lineStartingAt(sf, start + m.index), divider })
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

/**
 * (c):`{children}` / `{props.children}` 渲染的是一整塊(helper 的內容區),不是文字 —— 2026-10-01 審查的盲點:
 * Rule helper 的 `<div className="text-body font-medium">{title}</div>{children}` 原本因為後面「只接 {運算式}」被當成名稱 + 說明。
 */
const rendersChildren = (expr) => Boolean(expr) && ((ts.isIdentifier(expr) && expr.text === 'children') || (ts.isPropertyAccessExpression(expr) && expr.name.text === 'children'))
/** (c):某個 JSX 子節點是不是「純文字」(文字、不含 JSX 的 {運算式}、只含純文字的小寫原生元素、<br/>)。`{children}` 不是。 */
function isPlainText(child) {
  if (ts.isJsxText(child)) return true
  if (ts.isJsxExpression(child)) return !child.expression || (!containsJsx(child.expression) && !rendersChildren(child.expression))
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

const unwrapExpression = (e) => {
  let x = e
  while (x && (ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression(x))) x = x.expression
  return x
}
/**
 * inline style 間距屬性的值裡寫死的長度(回傳原文,沒有就回 null):非 0 的數字;字串 / 樣板字串拿掉 var(…) 之後還剩非 0 的長度字面值
 * (樣板字串裡的 ${數字} 代回成數字,其他運算式當未知)。calc() 照舊不收(檔頭「刻意不收」),'0 auto' 這種只有 0 的不收。
 */
export function styleLengthLiteral(value) {
  const v = unwrapExpression(value)
  if (!v) return null
  if (ts.isNumericLiteral(v)) return Number(v.text) !== 0 ? v.text : null
  if (ts.isPrefixUnaryExpression(v) && ts.isNumericLiteral(v.operand)) return Number(v.operand.text) !== 0 ? `-${v.operand.text}` : null
  let text = null
  if (ts.isStringLiteralLike(v)) text = v.text
  else if (ts.isTemplateExpression(v)) {
    text = v.head.text + v.templateSpans.map((sp) => {
      const inner = unwrapExpression(sp.expression)
      return (inner && ts.isNumericLiteral(inner) ? inner.text : ' ? ') + sp.literal.text
    }).join('')
  }
  if (text === null || text.includes('calc(')) return null
  const rest = text.replace(/var\((?:[^()]|\([^()]*\))*\)/g, ' ')
  const lengths = [...rest.matchAll(/(?:^|[\s,])(-?(?:[0-9]*\.)?[0-9]+)(?:px|rem|em)?(?=[\s,]|$)/g)]
  return lengths.some((m) => Number(m[1]) !== 0) ? text : null
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

export function parseLayoutEscape(markerText) {
  const reason = markerText.slice(LAYOUT_ESCAPE.length).replace(/\*\/\s*\}?\s*$/, '').trim()
  // 數的是字(code point),不是 UTF-16 單位:3 個 emoji 不是 6 個字(2026-10-06 審查)
  if ([...reason].length < 6) return { ok: false, why: '@layout-space-magic-ok 沒寫理由(至少一句話說明為什麼這個值刻意固定,引 layoutSpace.spec.md 對應的那一列)' }
  return { ok: true, reason }
}

export function parseCounterExample(commentLine) {
  const m = commentLine.match(COUNTER_MARKER)
  if (!m) return null
  const reason = m[1].replace(/\*\/\s*\}?\s*$/, '').trim()
  if ([...reason].length < 6) return { ok: false, why: '@story-counter-example 沒寫理由(至少一句話說明這一行為什麼正是本則要示範的 ❌ 寫法)' }
  return { ok: true, reason }
}

/**
 * 反例標記的定案(四條規則共用):該行,或正上方只有註解的一行(與 @layout-space-magic-ok 同一種位置語意)。
 * 設計原則層 + 理由合法 → 拿掉該命中;其他層 / 理由太短 → 照算,並在 note 說明標記為什麼不算數。
 */
function applyCounterExamples(hits, comments, layer, stats) {
  const kept = []
  for (const h of hits) {
    const near = comments.markersFor(h.line, '@story-counter-example:')
    if (near.length === 0) { kept.push(h); continue }
    if (!LAYERS[layer].counterExample) {
      kept.push({ ...h, note: `@story-counter-example 只在設計原則層(*.principles.stories.tsx)有效 —— ${LAYERS[layer].label}的範例會被照抄,不能標成反例` })
      continue
    }
    const verdicts = near.map(parseCounterExample)
    if (verdicts.some((v) => v.ok)) { stats.counterExamples++; stats.counterExampleHits.push(h); continue }
    kept.push({ ...h, note: verdicts[0].why })
  }
  return kept
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
  const layer = layerOf(rel)
  const hits = []
  const stats = { buttons: 0, classStrings: 0, classWords: 0, headingCandidates: 0, testOnlyRanges: 0, counterExamples: 0, counterExampleHits: [], styleSpacing: 0 }
  const comments = commentIndex(sf, text)
  const hit = (rule, line, token, note) => {
    if (!LAYERS[layer].rules.includes(rule)) return
    hits.push({ rule, file: rel, line, token, text: (lines[line - 1] ?? '').trim(), ...(note ? { note } : {}) })
  }
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

  // (b) 的 inline style 那一半:style={{ gap: 16, paddingBottom: '24px' }}(2026-10-01 審查:class 以外的寫死間距原本看不到)。
  // 2026-10-06 審查補洞:`{…} as React.CSSProperties` / satisfies / 括號、style 物件放在常數裡(style={cardStyle})、
  // 展開的常數(...base)、樣板字串(`${24}px`)、token 夾字面值('var(--x) 24px')。
  const styleSpacing = []
  const declarations = new Map()
  const collectDecls = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !declarations.has(n.name.text)) declarations.set(n.name.text, n.initializer)
    ts.forEachChild(n, collectDecls)
  }
  collectDecls(sf)
  const seenStyleProps = new Set()
  const styleObjects = (expr, seen = new Set()) => {
    const e = unwrapExpression(expr)
    if (!e) return []
    if (ts.isObjectLiteralExpression(e)) return [e, ...e.properties.filter(ts.isSpreadAssignment).flatMap((sp) => styleObjects(sp.expression, seen))]
    if (ts.isIdentifier(e) && declarations.has(e.text) && !seen.has(e.text)) { seen.add(e.text); return styleObjects(declarations.get(e.text), seen) }
    if (ts.isConditionalExpression(e)) return [...styleObjects(e.whenTrue, seen), ...styleObjects(e.whenFalse, seen)]
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) return [...styleObjects(e.left, seen), ...styleObjects(e.right, seen)]
    return []
  }
  // (a) + (c):走 JSX
  const visit = (node) => {
    if (isElement(node) && excluded(node.getStart(sf))) return
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === 'style' && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && !excluded(node.getStart(sf))) {
      for (const obj of styleObjects(node.initializer.expression)) {
        for (const prop of obj.properties) {
          if (!ts.isPropertyAssignment(prop) || !STYLE_SPACING_PROP.test(prop.name.getText(sf)) || seenStyleProps.has(prop) || excluded(prop.getStart(sf))) continue
          seenStyleProps.add(prop)
          const literal = styleLengthLiteral(prop.initializer)
          if (literal !== null) styleSpacing.push({ line: lineStartingAt(sf, prop.getStart(sf)), token: `style.${prop.name.getText(sf)}:${literal}` })
        }
      }
    }
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
      if (HEADING_SHAPED_TAGS.has(tag) && ts.isJsxElement(node)) {
        const cls = attribute(node, 'className')
        const tokens = stringPieces(cls?.initializer).flatMap((s) => s.split(/\s+/)).filter((w) => w && !w.includes(':'))
        const size = tokens.find((w) => typography.headingSizes.has(w))
        const weight = tokens.find((w) => TEXT_WEIGHTS.has(w))
        if (size && weight && !attribute(node, 'role') && !attribute(node, 'aria-level')) {
          stats.headingCandidates++
          const startLine = lineStartingAt(sf, node.getStart(sf))
          const kids = node.children.filter((c) => !(ts.isJsxText(c) && c.getText().trim() === ''))
          const plain = kids.length > 0 && kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && !containsJsx(c.expression)))
          const clipped = tokens.some((w) => CLIPPED_TEXT.test(w))
          // 看的是元素的形狀(只有文字、沒截斷、後面接著它命名的區塊),不看它排成幾行:prettier 把文字放到自己那一行的
          // `<div className="text-h6 font-semibold">\n  本月營收\n</div>` 一樣是標題(2026-10-06 審查:原本只認同一行開頭結尾)
          if (plain && !clipped && titlesFollowingBlock(node)) hit('div-heading', startLine, `<${tag} ${size} ${weight}>`)
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
  const spacingInScope = LAYERS[layer].rules.includes('hardcoded-spacing')
  for (const w of words) {
    // 分隔線元件自己的 class(<Separator className="my-2" /> 的 my-2)是分隔線的幾何,照 hook 放行;同一行別的元素的字照算
    if (spacingInScope && !w.divider && (SPACING_WORD.test(w.base) || ARBITRARY_SPACING_PROPERTY.test(w.base))) {
      if (!spacingByLine.has(w.line)) spacingByLine.set(w.line, [])
      spacingByLine.get(w.line).push(w.base)
    }
    if (w.base.startsWith('text-') && typography.isTypographyShaped(w.base) && !typography.allowed.has(w.base)) hit('unknown-typography', w.line, w.base)
  }
  if (spacingInScope) {
    for (const st of styleSpacing) {
      stats.styleSpacing++
      if (!spacingByLine.has(st.line)) spacingByLine.set(st.line, [])
      spacingByLine.get(st.line).push(st.token)
    }
  }
  const microCandidates = []
  const survivors = []
  for (const [line, tokens] of spacingByLine) {
    // 逃生口只認寫在註解裡、而且有理由的(與 @story-counter-example 同一套位置語意;2026-10-01 審查:
    // 字串屬性裡的「@layout-space-magic-ok:」、空理由、「{/* 標記 *\/}<div>」連帶放行下一行,原本都算數)
    const escapes = comments.markersFor(line, LAYOUT_ESCAPE).map(parseLayoutEscape)
    if (tokens.every((t) => micro.gaps.has(t))) microCandidates.push(line)
    survivors.push([line, tokens, escapes.some((e) => e.ok), escapes.find((e) => !e.ok)?.why])
  }
  return { rel, text, lines, layer, hits, stats, microCandidates, survivors, hit, comments }
}

/**
 * @param {Set<number>} notMicro 分類器判為「不是 canonical micro」的候選行
 * 逃生口放行的寫死間距(stats.escapeHits)也進棘輪:分類器本來就會放行的 micro 行不算(與 check_escape_marker_abuse.sh 的
 * countable_markers 同一個判法 —— 已被結構證明的 micro 不消耗額度),其餘每個被放行的字一筆。
 */
function finalize({ rel, lines, layer, hits, stats, microCandidates, survivors, hit, comments }, notMicro) {
  stats.escapeHits = []
  for (const [line, tokens, escaped, why] of survivors) {
    if (microCandidates.includes(line) && !notMicro.has(line)) continue
    if (escaped) {
      for (const t of tokens) stats.escapeHits.push({ rule: 'hardcoded-spacing', file: rel, line, token: t, text: (lines[line - 1] ?? '').trim() })
      continue
    }
    for (const t of tokens) hit('hardcoded-spacing', line, t, why)
  }
  const kept = applyCounterExamples(hits, comments, layer, stats)
  kept.sort((x, y) => x.line - y.line || RULE_IDS.indexOf(x.rule) - RULE_IDS.indexOf(y.rule) || x.token.localeCompare(y.token))
  return { hits: kept, stats }
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

/**
 * 例外標記綁的出處原文(純函式,read(rel) 回檔案原文或 null):@submit-intent 兩種 + @story-counter-example 一種。
 * 任一句不見了 = 儀器失效 —— 例外沒有出處就不再是例外。
 */
export function verifyMarkerSources(read) {
  for (const [intent, doc] of Object.entries(SUBMIT_INTENTS)) {
    const text = read(doc.spec)
    if (typeof text !== 'string' || !text.includes(doc.quote)) {
      throw new InstrumentError(`@submit-intent: ${intent} 綁的 spec 原文不見了(${doc.spec}「${doc.quote}」)—— 例外沒有出處就不再是例外`)
    }
  }
  for (const doc of COUNTER_EXAMPLE_SOURCES) {
    const text = read(doc.spec)
    if (typeof text !== 'string' || !text.includes(doc.quote)) {
      throw new InstrumentError(`@story-counter-example 綁的出處原文不見了(${doc.spec}「${doc.quote}」)—— 「只有設計原則層可以標反例」沒有出處,就不再是例外`)
    }
  }
}

export function loadInstruments(repo = REPO) {
  verifyMarkerSources((rel) => { const at = join(repo, rel); return existsSync(at) ? readFileSync(at, 'utf8') : null })
  return { typography: loadTypography(repo), micro: loadMicroPolicy(repo), classify: microClassifier(repo) }
}

export function listScope(repo = REPO) {
  return globSync(SCOPE_GLOB, { cwd: repo }).map((f) => f.split('\\').join('/')).sort()
}

export function scanTree({ repo = REPO, instruments = loadInstruments(repo), files = listScope(repo), read = (rel) => readFileSync(join(repo, rel), 'utf8') } = {}) {
  const perFile = new Map()
  const counterPerFile = new Map()
  const escapePerFile = new Map()
  const layers = Object.fromEntries(Object.keys(LAYERS).map((l) => [l, 0]))
  for (const rel of files) layers[layerOf(rel)]++
  const stats = { files: files.length, layers, buttons: 0, classStrings: 0, classWords: 0, headingCandidates: 0, testOnlyRanges: 0, counterExamples: 0, styleSpacing: 0, escapes: 0 }
  const collected = files.map((rel) => collect(rel, read(rel), instruments))
  const notMicro = classifyBatch(collected, instruments)
  for (const c of collected) {
    const r = finalize(c, notMicro.get(c))
    for (const k of Object.keys(stats)) if (typeof r.stats[k] === 'number' && k !== 'files') stats[k] += r.stats[k]
    if (r.hits.length) perFile.set(c.rel, r.hits)
    if (r.stats.counterExampleHits.length) counterPerFile.set(c.rel, r.stats.counterExampleHits)
    if (r.stats.escapeHits.length) escapePerFile.set(c.rel, r.stats.escapeHits)
    stats.escapes += r.stats.escapeHits.length
  }
  return { perFile, counterPerFile, escapePerFile, stats }
}

export const fingerprint = (h) => createHash('sha256').update(`${h.rule}\0${h.text.replace(/\s+/g, ' ')}\0${h.token}`).digest('hex').slice(0, 12)

/**
 * 基準裡的每一種計數:四條規則 + 兩種被標記放行的命中 —— 設計原則層的反例標記、@layout-space-magic-ok 逃生口。
 * 兩種放行都只准往下;多一筆 = 要隨基準檔一起送審(本機 --write-baseline,PR 裡看得到基準檔的 diff)。
 */
export const LEDGER_KEYS = Object.freeze([...RULE_IDS, COUNTER_KEY, ESCAPE_KEY])
/** 放行類的計數:比 base 多不算「基準放寬」(它本來就要隨基準檔送審),列進 review */
const RELEASE_KEYS = new Set([COUNTER_KEY, ESCAPE_KEY])
export { COUNTER_KEY, ESCAPE_KEY }
const keyApplies = (rel, key) => (key === COUNTER_KEY ? LAYERS[layerOf(rel)].counterExample : key === ESCAPE_KEY ? ruleApplies(rel, 'hardcoded-spacing') : ruleApplies(rel, key))
/** 某檔某格的命中清單;released = { counter: 反例標記放行的, escape: 逃生口放行的 }(各是 Map<file, hits[]>) */
const hitsFor = (perFile, released, rel, key) => (key === COUNTER_KEY ? released.counter?.get(rel) ?? []
  : key === ESCAPE_KEY ? released.escape?.get(rel) ?? []
    : (perFile.get(rel) ?? []).filter((h) => h.rule === key))
const releasedOf = (counterPerFile, escapePerFile) => ({ counter: counterPerFile ?? new Map(), escape: escapePerFile ?? new Map() })

export function buildBaseline(perFile, counterPerFile = new Map(), escapePerFile = new Map()) {
  const files = {}
  const totals = Object.fromEntries(LEDGER_KEYS.map((r) => [r, 0]))
  const released = releasedOf(counterPerFile, escapePerFile)
  for (const rel of [...new Set([...perFile.keys(), ...counterPerFile.keys(), ...escapePerFile.keys()])].sort()) {
    const entry = {}
    for (const key of LEDGER_KEYS) {
      const hs = hitsFor(perFile, released, rel, key)
      if (!hs.length) continue
      entry[key] = { count: hs.length, hits: hs.map(fingerprint).sort() }
      totals[key] += hs.length
    }
    files[rel] = entry
  }
  return {
    note: 'story 漂移棘輪(scripts/story-layer-drift-invariant.mjs)的基準。每檔每條規則的 count 只准往下:高於這裡 = 新增漂移 → 紅;新檔 = 0。hits 是每筆命中的指紋,只用來指出「哪一行是新的」。數字變少後由人在本機跑 --write-baseline 收緊;CI 永遠不跑 --write-baseline。2026-09-30 首次建閘只收展示層;2026-10-01 全 DS 掃除後範圍擴到設計原則層(四條)與設計規格層((a)(c)(d)),同時收緊到掃除後的現況 —— 剩下的數字全在當時另有工作進行、留待下一輪的 Field / Rating / TreeView / Steps / AgentPanel / Dialog / Sheet / Toast / Button 九個資料夾,逐條清單用 --list 看,修法排在待辦總帳。',
    generatedBy: `node ${SELF} --write-baseline`,
    scope: `${SCOPE_GLOB}(展示層 / 設計原則層:四條;設計規格層 *.anatomy.stories.tsx:(a)(c)(d);標 test-only 的 story 不收)`,
    rules: RULE_IDS,
    counterExamples: `${COUNTER_KEY}:設計原則層放行的 ❌ 反例標記(只准往下;新增一個要隨基準檔一起送審)`,
    escapes: `${ESCAPE_KEY}:被 @layout-space-magic-ok 逃生口放行的寫死間距(每個字一筆;分類器本來就放行的 micro 不算;只准往下,新增要隨基準檔一起送審)`,
    totals,
    files,
  }
}

/**
 * 基準檔格式驗證:count 必須 = hits 數、每個指紋都是 12 碼十六進位、totals 必須 = 各檔加總;
 * 傳了 scope(目前的 story 清單)時,替不在清單裡的檔記數字也拒收(2026-10-01 審查:可以替還沒存在的檔預留額度)。
 * 數字彼此一致的手改(多記一筆 + totals 跟著加)格式驗不出來 —— 那一半由 auditBaselineAgainstBase 對 base 實測擋。
 */
export function validateBaseline(doc, { scope = null } = {}) {
  const problems = []
  if (!doc || typeof doc !== 'object' || !doc.files || typeof doc.files !== 'object') return ['基準檔缺 files']
  const inScope = scope ? new Set(scope) : null
  const sums = Object.fromEntries(LEDGER_KEYS.map((r) => [r, 0]))
  for (const [rel, entry] of Object.entries(doc.files)) {
    if (inScope && !inScope.has(rel)) problems.push(`${rel}:不在目前的 story 範圍(${SCOPE_GLOB})—— 基準不得替不存在的檔預留數字`)
    for (const [rule, v] of Object.entries(entry ?? {})) {
      if (!LEDGER_KEYS.includes(rule)) { problems.push(`${rel}:未知規則 ${rule}`); continue }
      if (!keyApplies(rel, rule)) problems.push(`${rel}:${LAYERS[layerOf(rel)].label}不收 ${rule}(基準不得替不在範圍的規則記數字)`)
      if (!Number.isInteger(v?.count) || v.count < 0 || !Array.isArray(v.hits) || v.hits.length !== v.count) problems.push(`${rel} ${rule}:count ${v?.count} 與 hits ${v?.hits?.length} 對不上`)
      else {
        const bad = v.hits.filter((fp) => typeof fp !== 'string' || !FINGERPRINT.test(fp))
        if (bad.length) problems.push(`${rel} ${rule}:指紋格式不對(要 12 碼十六進位):${bad.slice(0, 3).join(', ')}`)
        sums[rule] += v.count
      }
    }
  }
  for (const rule of LEDGER_KEYS) if ((doc.totals?.[rule] ?? (RELEASE_KEYS.has(rule) ? 0 : undefined)) !== sums[rule]) problems.push(`totals.${rule}=${doc.totals?.[rule]} ≠ 各檔加總 ${sums[rule]}`)
  return problems
}

/**
 * 基準不得比 base 寬(純函式):committed 是這次要提交的基準,baseMeasured 是**用同一支儀器**量 merge-base 那棵樹的結果。
 * 任一檔任一規則,基準記的數字 > base 實測 → 擋(手改加額度、替新檔預留、把別處的漂移搬進來都在這裡紅)。
 * 用實測而不是 base 的基準檔比:偵測規則變寬時兩邊一起變,不會把「儀器看得更清楚」誤當成新增(M37 同一支儀器)。
 * 反例標記比 base 多不擋,列進 review —— 它本來就要經人看過的基準更新(數字已由 compareWithBaseline 鎖住)。
 */
export function auditBaselineAgainstBase(committed, baseMeasured) {
  const problems = []
  const review = []
  const released = releasedOf(baseMeasured.counterPerFile, baseMeasured.escapePerFile)
  for (const [rel, entry] of Object.entries(committed?.files ?? {})) {
    for (const [key, v] of Object.entries(entry ?? {})) {
      const at = hitsFor(baseMeasured.perFile, released, rel, key).length
      if (!(v?.count > at)) continue
      if (RELEASE_KEYS.has(key)) review.push({ file: rel, key, base: at, committed: v.count })
      else problems.push({ file: rel, key, base: at, committed: v.count })
    }
  }
  return { problems, review }
}

/**
 * 棘輪判定(純函式)。counterPerFile:設計原則層被反例標記放行的命中;escapePerFile:被 @layout-space-magic-ok 放行的命中
 * (兩者也只准往下)。
 */
export function compareWithBaseline(perFile, baseline, counterPerFile = new Map(), escapePerFile = new Map()) {
  const increases = []
  const decreases = []
  const baseFiles = baseline?.files ?? {}
  const released = releasedOf(counterPerFile, escapePerFile)
  for (const rel of new Set([...perFile.keys(), ...counterPerFile.keys(), ...escapePerFile.keys()])) {
    for (const rule of LEDGER_KEYS) {
      const hs = hitsFor(perFile, released, rel, rule)
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
    if (perFile.has(rel) || counterPerFile.has(rel) || escapePerFile.has(rel)) continue
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
  const layer = layerOf(h.file)
  const counter = LAYERS[layer].counterExample
    ? '\n      反例:這一行若正是本則要示範的 ❌ 寫法本身,在該行正上方寫 {/* @story-counter-example: 理由 */}(只在設計原則層有效)'
    : ''
  return `${h.file}:${h.line}  [${LAYERS[layer].label}] ${RULES[h.rule].label}  ${h.token}${h.note ? `  —— ${h.note}` : ''}\n      > ${h.text.slice(0, 140)}\n      規則:${RULES[h.rule].owner}\n      修法:${fix}${counter}`
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
 * 同一段四條漂移,每條正上方都寫合法的 `@story-counter-example:`(設計原則層 ❌ 反例本身的寫法)。
 * 行號:(b)=8 (c)=10 (d)=12 (a)=15。
 */
export const SYNTHETIC_COUNTER_SOURCE = [
  "import { useState } from 'react'",
  "import { Button } from '@/design-system/components/Button/button'",
  "import { Input } from '@/design-system/components/Input/input'",
  'export const SignupCardWrong = () => {',
  "  const [email, setEmail] = useState('')",
  '  return (<>',
  '    {/* @story-counter-example: ❌ 反例:手刻卡片寫死 16px 間距,本則教的正是不要這樣排 */}',
  '    <div className="flex flex-col gap-4">',
  '      {/* @story-counter-example: ❌ 反例:用 div 當標題,本則教的正是要用 h1–h6 */}',
  '      <div className="text-body font-semibold">建立帳號</div>',
  '      {/* @story-counter-example: ❌ 反例:DS 沒有的字級 class,本則教的正是它不產生任何 CSS */}',
  '      <p className="text-body-sm text-fg-muted">完成後寄送確認信到你的信箱</p>',
  '      <Input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />',
  '      {/* @story-counter-example: ❌ 反例:新建表單在填完前停用送出鈕,本則教的正是不要這樣做 */}',
  '      <Button variant="primary" disabled={!email}>建立帳號</Button>',
  '    </div>',
  '  </>)',
  '}',
  '',
].join('\n')
export const SYNTHETIC_COUNTER_EXPECTED = [
  'hardcoded-spacing@8:gap-4',
  'div-heading@10:<div text-body font-semibold>',
  'unknown-typography@12:text-body-sm',
  'primary-submit-disabled@15:disabled={!email}',
]
/**
 * 乾淨的寫法:token 間距、h3 標題、hook 送出狀態、合法 @submit-intent、micro 行內群、逃生口、分隔線、靜態停用示範;
 * 另有 (c)(d) 的邊界反例:12px 標籤加粗(不是標題級字級)、有子元素(含跨行的)、顏色 / 對齊 / 帶 variant 前綴的 DS 字級;
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
  '        <Badge /> 跨行、而且有子元素(不是單純標題文字)',
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
  // 6b. 手改基準的三種形狀(2026-10-01 審查):指紋不是 12 碼十六進位 → 拒收;替不在範圍的檔預留 → 傳 scope 時拒收;
  //     數字彼此一致的手改(多記一筆 + totals 跟著加)格式驗不出來 → 對 base 實測(auditBaselineAgainstBase)紅
  const badFp = structuredClone(fakeBase)
  badFp.files[SYNTHETIC_DRIFT]['hardcoded-spacing'].hits[0] = 'deadbeef'
  expect(validateBaseline(badFp).some((m) => m.includes('指紋格式')), '指紋不是 12 碼十六進位應拒收')
  expect(validateBaseline(fakeBase, { scope: [SYNTHETIC_DRIFT] }).some((m) => m.includes('gone.stories.tsx') && m.includes('不在目前的 story 範圍')), '傳了 scope 時,替不存在的檔記數字應拒收')
  expect(validateBaseline(fakeBase, { scope: [SYNTHETIC_DRIFT, 'packages/design-system/src/gone.stories.tsx'] }).length === 0, '檔都在範圍內時同一份基準應合法')
  const measuredBase = { perFile: new Map([[SYNTHETIC_DRIFT, two]]), counterPerFile: new Map() }
  const loosened = structuredClone(fakeBase)
  loosened.files[SYNTHETIC_DRIFT]['hardcoded-spacing'].count = 3
  loosened.files[SYNTHETIC_DRIFT]['hardcoded-spacing'].hits.push('0123456789ab')
  loosened.totals['hardcoded-spacing'] += 1
  expect(validateBaseline(loosened).length === 0, '數字一致的手改格式上合法(所以才需要對 base 實測)')
  const audit = auditBaselineAgainstBase(loosened, measuredBase)
  const plusOne = audit.problems.filter((pr) => pr.file === SYNTHETIC_DRIFT)
  expect(plusOne.length === 1 && plusOne[0].base === 2 && plusOne[0].committed === 3 && audit.problems.some((pr) => pr.file.endsWith('gone.stories.tsx') && pr.base === 0),
    `基準比 base 實測多一筆、替 base 沒有的檔記數字都應紅,實得 ${JSON.stringify(audit.problems)}`)
  const reserved = auditBaselineAgainstBase(buildBaseline(new Map([['packages/design-system/src/components/Future/future.stories.tsx', [drift[0]]]])), measuredBase)
  expect(reserved.problems.length === 1 && reserved.problems[0].base === 0, '替 base 沒有的檔預留額度應紅')
  expect(auditBaselineAgainstBase(buildBaseline(new Map([[SYNTHETIC_DRIFT, two]])), measuredBase).problems.length === 0, '與 base 實測一樣的基準不該紅')
  // 6c. 反例標記也進棘輪:基準記 0、目前 1 → 紅(要隨基準檔一起送審);記 1 → 綠;比 base 多只列 review、不擋
  const SYN_P = SYNTHETIC_DRIFT.replace(/\.stories\.tsx$/, '.principles.stories.tsx')
  const counterHit = { ...drift[0], file: SYN_P }
  const counterNow = new Map([[SYN_P, [counterHit]]])
  const counterNew = compareWithBaseline(new Map(), buildBaseline(new Map()), counterNow)
  expect(counterNew.increases.length === 1 && counterNew.increases[0].rule === COUNTER_KEY, `新增的反例標記應紅,實得 ${JSON.stringify(counterNew.increases.map((i) => i.rule))}`)
  const counterBase = buildBaseline(new Map(), counterNow)
  expect(validateBaseline(counterBase).length === 0 && compareWithBaseline(new Map(), counterBase, counterNow).increases.length === 0, '基準已記這個反例標記 → 綠')
  const counterAudit = auditBaselineAgainstBase(counterBase, { perFile: new Map(), counterPerFile: new Map() })
  expect(counterAudit.problems.length === 0 && counterAudit.review.length === 1, '反例標記比 base 多只列進 review,不擋(它本來就要人審)')
  expect(validateBaseline(buildBaseline(new Map(), new Map([[SYNTHETIC_DRIFT, [drift[0]]]]))).some((m) => m.includes('不收')), '展示層的檔不該有反例標記的數字')

  // 7. 掃到 0 檔 = 儀器失效(CLI 據此 exit 2);分層計數照檔名分(任一層 0 檔也是儀器失效)
  expect(scanTree({ repo, instruments, files: [] }).stats.files === 0, '空範圍應回 0 檔')
  const layerCount = scanTree({ repo, instruments, files: [RATING_STORY, LAYER_BEFORE_FIXTURES[0].story, LAYER_BEFORE_FIXTURES[1].story] }).stats.layers
  expect(layerCount.showcase === 1 && layerCount.principles === 1 && layerCount.anatomy === 1, `分層計數應各 1,實得 ${JSON.stringify(layerCount)}`)

  // 8. 分層兩面:同一段四條漂移 —— 設計原則層四條全紅;設計規格層 (a)(c)(d) 紅、(b) 不收;對基準比都是新檔新增
  const SYNTHETIC_PRINCIPLES = SYNTHETIC_DRIFT.replace(/\.stories\.tsx$/, '.principles.stories.tsx')
  const SYNTHETIC_ANATOMY = SYNTHETIC_DRIFT.replace(/\.stories\.tsx$/, '.anatomy.stories.tsx')
  const noSpacing = SYNTHETIC_DRIFT_EXPECTED.filter((k) => !k.startsWith('hardcoded-spacing'))
  const inPrinciples = analyzeSource(SYNTHETIC_PRINCIPLES, SYNTHETIC_DRIFT_SOURCE, instruments).hits
  const inAnatomy = analyzeSource(SYNTHETIC_ANATOMY, SYNTHETIC_DRIFT_SOURCE, instruments).hits
  expect(keysOf(inPrinciples).join() === SYNTHETIC_DRIFT_EXPECTED.join(), `設計原則層應四條全紅(${SYNTHETIC_DRIFT_EXPECTED.join(' / ')}),實得 ${keysOf(inPrinciples).join(' / ')}`)
  expect(keysOf(inAnatomy).join() === noSpacing.join(), `設計規格層應只紅 (a)(c)(d)(${noSpacing.join(' / ')}),實得 ${keysOf(inAnatomy).join(' / ')}`)
  const layerCmp = compareWithBaseline(new Map([[SYNTHETIC_PRINCIPLES, inPrinciples], [SYNTHETIC_ANATOMY, inAnatomy]]), baseline)
  expect(layerCmp.increases.filter((i) => i.newFile && i.file === SYNTHETIC_PRINCIPLES).length === 4 && layerCmp.increases.filter((i) => i.newFile && i.file === SYNTHETIC_ANATOMY).length === 3,
    `新的原則層檔應 4 條新增、新的規格層檔應 3 條新增,實得 ${JSON.stringify(layerCmp.increases.map((i) => [i.file.split('/').pop(), i.rule]))}`)
  const fakeAnatomyBase = buildBaseline(new Map([[SYNTHETIC_ANATOMY, [{ ...drift[0], file: SYNTHETIC_ANATOMY }]]]))
  expect(validateBaseline(fakeAnatomyBase).some((p) => p.includes('設計規格層不收')), '基準替設計規格層記 (b) 的數字應拒收')

  // 9. 反例標記兩面:同一段四條漂移,每條正上方都有合法 @story-counter-example —— 設計原則層 0 筆(放行 4);
  //    同一份搬到展示層 4 筆、設計規格層 3 筆(都說明標記只在原則層有效);理由太短 → 4 筆說明理由;
  //    標記與命中行之間隔一行非註解 → 仍紅;標記寫在命中的同一行 → 放行
  const counterOk = analyzeSource(SYNTHETIC_PRINCIPLES, SYNTHETIC_COUNTER_SOURCE, instruments)
  expect(counterOk.hits.length === 0 && counterOk.stats.counterExamples === 4, `原則層合法反例標記應全放行(0 筆、放行 4),實得 ${keysOf(counterOk.hits).join(' / ')}、放行 ${counterOk.stats.counterExamples}`)
  const counterShow = analyzeSource(SYNTHETIC_DRIFT, SYNTHETIC_COUNTER_SOURCE, instruments).hits
  const counterAnat = analyzeSource(SYNTHETIC_ANATOMY, SYNTHETIC_COUNTER_SOURCE, instruments).hits
  expect(keysOf(counterShow).join() === SYNTHETIC_COUNTER_EXPECTED.join() && counterShow.every((h) => h.note?.includes('只在設計原則層')),
    `反例標記搬到展示層應仍 4 筆並說明,實得 ${keysOf(counterShow).join(' / ')}`)
  expect(keysOf(counterAnat).join() === SYNTHETIC_COUNTER_EXPECTED.filter((k) => !k.startsWith('hardcoded-spacing')).join() && counterAnat.every((h) => h.note?.includes('只在設計原則層')),
    `反例標記搬到設計規格層應仍 3 筆並說明,實得 ${keysOf(counterAnat).join(' / ')}`)
  const shortReason = analyzeSource(SYNTHETIC_PRINCIPLES, SYNTHETIC_COUNTER_SOURCE.replace(/@story-counter-example: [^*]*\*\//g, '@story-counter-example: ❌ */'), instruments).hits
  expect(keysOf(shortReason).join() === SYNTHETIC_COUNTER_EXPECTED.join() && shortReason.every((h) => h.note?.includes('理由')), `反例標記理由太短應仍 4 筆並說明,實得 ${keysOf(shortReason).join(' / ')}`)
  const gapped = [
    'export const Card = () => (<div>',
    '  {/* @story-counter-example: ❌ 反例:隔了一行非註解就不算數 */}',
    '  <span className="text-caption">說明</span>',
    '  <div className="flex flex-col p-4">內容</div>',
    '  <div className="flex flex-col p-4">{/* @story-counter-example: ❌ 反例:寫在同一行照樣算數 */}內容</div>',
    '</div>)',
    '',
  ].join('\n')
  const gappedKeys = analyzeSource(SYNTHETIC_PRINCIPLES, gapped, instruments).hits.map((h) => `${h.rule}@${h.line}`).join()
  expect(gappedKeys === 'hardcoded-spacing@4', `隔一行非註解的反例標記不算數(:4 紅)、同一行的算數(:5 不紅),實得 ${gappedKeys}`)

  // 10. 2026-10-01 掃除前的真檔(a89b6610):以真實路徑分析,在原本那幾行紅;對已提交的基準比都是新增
  for (const fx of LAYER_BEFORE_FIXTURES) {
    const raw = readFileSync(join(repo, fx.fixture))
    expect(gitBlobId(raw) === fx.blob, `對照組 fixture ${fx.fixture} 不是掃除前的原檔(blob ${gitBlobId(raw)} ≠ ${fx.blob})`)
    const got = analyzeSource(fx.story, raw.toString('utf8'), instruments).hits
    expect(keysOf(got).join() === fx.expected.join(), `掃除前的 ${fx.story.split('/').pop()} 應恰好 ${fx.expected.join(' / ')},實得 ${keysOf(got).join(' / ')}`)
    const cmp = compareWithBaseline(new Map([[fx.story, got]]), baseline)
    const wantRules = [...new Set(fx.expected.map((k) => k.slice(0, k.indexOf('@'))))].sort()
    expect(JSON.stringify(cmp.increases.map((i) => i.rule).sort()) === JSON.stringify(wantRules), `掃除前的 ${fx.story.split('/').pop()} 對基準比應在 ${wantRules.join(' / ')} 紅,實得 ${cmp.increases.map((i) => i.rule).join(' / ')}`)
    if (layerOf(fx.story) === 'anatomy') {
      // 同一份原文當展示層看,寫死間距一大把 —— 證明規格層的 0 筆 (b) 是範圍,不是儀器瞎了
      const asShowcase = analyzeSource(SYNTHETIC_DRIFT, raw.toString('utf8'), instruments).hits.filter((h) => h.rule === 'hardcoded-spacing')
      expect(asShowcase.length >= 10, `同一份規格層原文當展示層看應有 ≥ 10 筆寫死間距,實得 ${asShowcase.length}`)
    }
  }

  // 11. 偵測面(2026-10-01 審查的漏洞,兩面對照):每格「漏洞寫法 → 紅」配一格「合法寫法 → 0 筆」
  const one = (rel, body) => analyzeSource(rel, ['export const X = () => (<div>', ...body, '</div>)', ''].join('\n'), instruments).hits
  const holeKeys = (rel, body) => keysOf(one(rel, body)).join()
  expect(holeKeys(SYNTHETIC_DRIFT, ['  <div className="flex flex-col" style={{ gap: 16, paddingBottom: \'24px\' }}>x</div>']) === 'hardcoded-spacing@2:style.gap:16,hardcoded-spacing@2:style.paddingBottom:24px',
    `inline style 寫死的間距應紅,實得 ${holeKeys(SYNTHETIC_DRIFT, ['  <div className="flex flex-col" style={{ gap: 16, paddingBottom: \'24px\' }}>x</div>'])}`)
  expect(holeKeys(SYNTHETIC_DRIFT, ['  <div style={{ gap: \'var(--layout-space-loose)\', padding: 0, width: 280, gridTemplateColumns: \'44px 1fr\' }}>x</div>']) === '',
    'inline style 讀 token、0、非間距屬性不該紅')
  expect(holeKeys(SYNTHETIC_DRIFT, ['  <div className="flex flex-col gap-[1rem] p-[1.5rem] m-100">x</div>']) === 'hardcoded-spacing@2:gap-[1rem],hardcoded-spacing@2:m-100,hardcoded-spacing@2:p-[1.5rem]',
    `rem 任意值與三位數刻度應紅,實得 ${holeKeys(SYNTHETIC_DRIFT, ['  <div className="flex flex-col gap-[1rem] p-[1.5rem] m-100">x</div>'])}`)
  const varSrc = (name, value) => [`const ${name} = '${value}'`, `export const X = () => (<div className={${name}}>x</div>)`, ''].join('\n')
  expect(keysOf(analyzeSource(SYNTHETIC_DRIFT, varSrc('rowLayout', 'flex flex-col gap-12'), instruments).hits).join() === 'hardcoded-spacing@1:gap-12', '名字不帶 class 的變數裡的一串 utility 應紅')
  // 只有一個字的常數:當資料用(畫成文字)→ 不是 class;被拿去當 class 用(className / cn() 參數)→ 是 class(2026-10-06 審查的洞)
  const dataConst = ["const tokenName = 'gap-2'", 'export const X = () => (<code>{tokenName}</code>)', ''].join('\n')
  expect(analyzeSource(SYNTHETIC_DRIFT, dataConst, instruments).hits.length === 0, '變數裡只有一個字、當資料畫出來(token 名)不當 class 字串')
  const padConst = ["const pad = 'p-6'", "export const X = () => (<div className={cn('flex flex-col', pad)}>x</div>)", ''].join('\n')
  expect(keysOf(analyzeSource(SYNTHETIC_DRIFT, padConst, instruments).hits).join() === 'hardcoded-spacing@1:p-6', `被 cn() 拿去當 class 的單字常數應紅,實得 ${keysOf(analyzeSource(SYNTHETIC_DRIFT, padConst, instruments).hits).join()}`)
  expect(keysOf(analyzeSource(SYNTHETIC_DRIFT, varSrc('rowGap', 'gap-12'), instruments).hits).join() === 'hardcoded-spacing@1:gap-12', '被 className={…} 拿去用的單字常數應紅')
  expect(holeKeys(SYNTHETIC_DRIFT, ['  <div className="flex flex-col gap-12 after:content-[\'註\']">x</div>']) === 'hardcoded-spacing@2:gap-12', '任意值裡的中文不該讓整串 class 隱形')
  // 12. 標記只認註解(2026-10-01 審查):寫在字串屬性裡不算;「{/* 標記 */}<div>」只放行自己那一行;逃生口沒寫理由不算;多行註解的最後一行在正上方 → 算
  expect(holeKeys(SYN_P, ['  <div className="flex flex-col gap-12" title="@story-counter-example: 看起來像理由的字">x</div>']) === 'hardcoded-spacing@2:gap-12', '字串屬性裡的反例標記不算數')
  expect(holeKeys(SYNTHETIC_DRIFT, ['  <div className="flex flex-col gap-12" data-x="@layout-space-magic-ok: 看起來像理由的字">x</div>']) === 'hardcoded-spacing@2:gap-12', '字串屬性裡的逃生口不算數')
  const sameLine = one(SYN_P, ['  {/* @story-counter-example: ❌ 反例:一個標記只管自己這一行 */}<div className="flex flex-col gap-12">x</div>', '  <div className="flex flex-col gap-8">x</div>'])
  expect(keysOf(sameLine).join() === 'hardcoded-spacing@3:gap-8', `「標記 + 程式碼」同一行只放行自己,下一行仍紅,實得 ${keysOf(sameLine).join()}`)
  const escSameLine = one(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: 一個逃生口只管自己這一行 */}<div className="flex flex-col gap-12">x</div>', '  <div className="flex flex-col gap-8">x</div>'])
  expect(keysOf(escSameLine).join() === 'hardcoded-spacing@3:gap-8', `逃生口同一行只放行自己,下一行仍紅,實得 ${keysOf(escSameLine).join()}`)
  const emptyEsc = one(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: */}', '  <div className="flex flex-col gap-12">x</div>'])
  expect(keysOf(emptyEsc).join() === 'hardcoded-spacing@3:gap-12' && emptyEsc[0].note?.includes('理由'), `沒寫理由的逃生口應紅並說明,實得 ${keysOf(emptyEsc).join()}`)
  expect(holeKeys(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: 跨兩行的註解,', '      最後一行在正上方 */}', '  <div className="flex flex-col gap-12">x</div>']) === '', '多行註解最後一行在正上方 → 逃生口有效')
  expect(holeKeys(SYNTHETIC_DRIFT, ['  {/* JSX 文字裡的 // 不是註解 */}', '  <p>網址 https://example.com // @layout-space-magic-ok: 文字不是註解</p>', '  <div className="flex flex-col gap-12">x</div>']) === 'hardcoded-spacing@4:gap-12', 'JSX 文字裡的「// 標記」不算註解')

  // 13. 反例標記的真實形狀(設計原則層手刻 flex label/value 列 py-1):沒標 → 1 筆;正上方標反例 → 0 筆(放行 1);
  //     空理由 → 1 筆並說明理由;同一份標好的原文搬到展示層 → 1 筆並說明「只在設計原則層」
  const kvRow = (marker) => [
    'export const KvWrong = () => (<dl className="flex flex-col">',
    ...(marker === null ? [] : [`  {/* @story-counter-example:${marker} */}`]),
    '  <div className="flex justify-between py-1"><dt>負責人</dt><dd>陳美惠</dd></div>',
    '</dl>)',
    '',
  ].join('\n')
  const kvBare = analyzeSource(SYN_P, kvRow(null), instruments)
  const kvMarked = analyzeSource(SYN_P, kvRow(' 反例:手刻 flex label/value 列,本則教的正是改用 DescriptionList'), instruments)
  const kvEmpty = analyzeSource(SYN_P, kvRow(' '), instruments).hits
  const kvShowcase = analyzeSource(SYNTHETIC_DRIFT, kvRow(' 反例:手刻 flex label/value 列,本則教的正是改用 DescriptionList'), instruments).hits
  expect(keysOf(kvBare.hits).join() === 'hardcoded-spacing@2:py-1', `手刻 label/value 列沒標反例應 1 筆(:2 py-1),實得 ${keysOf(kvBare.hits).join()}`)
  expect(kvMarked.hits.length === 0 && kvMarked.stats.counterExamples === 1, `正上方合法反例標記應放行(0 筆、放行 1),實得 ${keysOf(kvMarked.hits).join()} / 放行 ${kvMarked.stats.counterExamples}`)
  expect(keysOf(kvEmpty).join() === 'hardcoded-spacing@3:py-1' && kvEmpty[0].note?.includes('理由'), `空理由的反例標記應仍 1 筆並說明,實得 ${keysOf(kvEmpty).join()}`)
  expect(keysOf(kvShowcase).join() === 'hardcoded-spacing@3:py-1' && kvShowcase[0].note?.includes('只在設計原則層'), `同一份搬到展示層應仍 1 筆並說明層,實得 ${keysOf(kvShowcase).join()}`)

  // 14. @layout-space-magic-ok 兩面(508 個標記靠的「正上方一行」契約):正上方 → 0 筆;隔一行程式碼 → 1 筆;理由「短」→ 1 筆
  const escAbove = holeKeys(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: 夾具 —— 刻意固定的 16px 卡片內距 */}', '  <div className="flex flex-col p-4">x</div>'])
  const escGapped = holeKeys(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: 夾具 —— 刻意固定的 16px 卡片內距 */}', '  <span className="text-caption">中間隔了一行程式碼</span>', '  <div className="flex flex-col p-4">x</div>'])
  const escShort = holeKeys(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: 短 */}', '  <div className="flex flex-col p-4">x</div>'])
  expect(escAbove === '', `逃生口在正上方應放行,實得 ${escAbove}`)
  expect(escGapped === 'hardcoded-spacing@4:p-4', `逃生口與命中行之間隔一行程式碼不算數(:4 紅),實得 ${escGapped}`)
  expect(escShort === 'hardcoded-spacing@3:p-4', `逃生口理由太短(「短」)不算數(:3 紅),實得 ${escShort}`)

  // 14b. (c) 收 <p>(2026-10-06):同一行加粗標題級 p 後接區塊 → 1 筆;後面只接說明文字 → 0 筆
  expect(cKeys(nameRow('p', '', component)) === 'div-heading@3', `<p> 畫成標題(後接元件)應算標題,實得 ${cKeys(nameRow('p', '', component))}`)
  expect(cKeys(nameRow('p', '', caption)) === '', `<p> 名稱 + 說明(後面只接文字)不該算標題,實得 ${cKeys(nameRow('p', '', caption))}`)

  // 15. (c) 盲點兩面:helper 的 <div 標題字級 加粗>{title}</div> 後面接 {children}(或 props.children)→ 1 筆;只接 {note} 文字 → 0 筆
  const ruleHelper = (follower) => [
    'export const Rule = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (',
    '  <div className="mb-[var(--layout-space-loose)]">',
    '    <div className="text-body font-medium">{title}</div>',
    `    ${follower}`,
    '  </div>',
    ')',
    '',
  ].join('\n')
  expect(cKeys(ruleHelper('{children}')) === 'div-heading@3', `標題 div 後面接 {children} 應算標題,實得 ${cKeys(ruleHelper('{children}'))}`)
  expect(cKeys(ruleHelper('{props.children}')) === 'div-heading@3', `標題 div 後面接 {props.children} 應算標題,實得 ${cKeys(ruleHelper('{props.children}'))}`)
  expect(cKeys(ruleHelper('{note}')) === '', `標題 div 後面只接 {note} 文字是名稱 + 說明,不該算,實得 ${cKeys(ruleHelper('{note}'))}`)

  // 16. 例外標記綁的出處:@story-counter-example 的原文不見了 → 儀器失效;原文都在 → 不擲
  const realRead = (rel) => { const at = join(repo, rel); return existsSync(at) ? readFileSync(at, 'utf8') : null }
  const quoteThrows = (read) => { try { verifyMarkerSources(read); return null } catch (error) { return error } }
  expect(quoteThrows(realRead) === null, `目前的出處原文應都在,實得 ${quoteThrows(realRead)?.message}`)
  for (const doc of COUNTER_EXAMPLE_SOURCES) {
    const gone = quoteThrows((rel) => (rel === doc.spec ? realRead(rel).split(doc.quote).join('') : realRead(rel)))
    expect(gone instanceof InstrumentError && gone.message.includes('@story-counter-example'), `${doc.spec} 拿掉「${doc.quote}」應儀器失效,實得 ${gone?.message ?? '沒擲'}`)
  }

  // 17. 2026-10-06 審查的偵測洞(兩面對照:每格「漏洞寫法 → 紅」配「合法寫法 → 0 筆」)
  const holes = [
    ['2xl: 響應式前綴不讓整串隱形', ['  <div className="flex flex-col gap-12 2xl:gap-16">x</div>'], 'hardcoded-spacing@2:gap-12,hardcoded-spacing@2:gap-16'],
    ['className 夾一個中文字不讓整串隱形', ['  <div className="flex flex-col gap-12 卡片">x</div>'], 'hardcoded-spacing@2:gap-12'],
    ['style 物件 as CSSProperties', ['  <div style={{ gap: 16, padding: 24 } as React.CSSProperties}>x</div>'], 'hardcoded-spacing@2:style.gap:16,hardcoded-spacing@2:style.padding:24'],
    ['style 樣板字串 `${24}px`', ['  <div style={{ padding: `${24}px` }}>x</div>'], 'hardcoded-spacing@2:style.padding:24px'],
    ['style token 夾字面值', ["  <div style={{ padding: 'var(--layout-space-tight) 24px' }}>x</div>"], 'hardcoded-spacing@2:style.padding:var(--layout-space-tight) 24px'],
    ['任意屬性 [gap:12px]', ['  <div className="flex flex-col [gap:12px]">x</div>'], 'hardcoded-spacing@2:[gap:12px]'],
    ['跨三行的 div 標題(文字自己一行)', ['  <div className="text-h6 font-semibold">', '    本月營收', '  </div>', '  <Chart data={[]} />'], 'div-heading@2:<div text-h6 font-semibold>'],
    ['同一行有 Separator,別的元素的間距照算;分隔線自己的 class 不算', ['  <div className="flex items-center gap-3"><Separator orientation="vertical" className="h-6 mx-1" /></div>'], 'hardcoded-spacing@2:gap-3'],
  ]
  for (const [why, body, want] of holes) expect(holeKeys(SYNTHETIC_DRIFT, body) === want, `${why}:應 ${want},實得 ${holeKeys(SYNTHETIC_DRIFT, body)}`)
  const holeControls = [
    ['style 讀 token / calc() / 只有 0', ["  <div style={{ padding: 'var(--layout-space-loose)', margin: '0 auto', gap: 'calc(var(--x) * 2)' }}>x</div>"]],
    ['任意屬性讀 token', ['  <div className="flex flex-col [gap:var(--layout-space-tight)]">x</div>']],
    ['分隔線元件自己的 class', ['  <Separator className="my-2" />']],
    ['跨行、只接說明文字(名稱 + 說明)', ['  <div className="flex flex-col">', '    <div className="text-body font-medium">', '      陳美惠', '    </div>', '    <div className="text-caption">產品設計師</div>', '  </div>']],
  ]
  for (const [why, body] of holeControls) expect(holeKeys(SYNTHETIC_DRIFT, body) === '', `${why}:應 0 筆,實得 ${holeKeys(SYNTHETIC_DRIFT, body)}`)
  // cn() / cva() 參數本身就是 class 位置:結果交給名字不帶 class、也不在 className 裡的屬性時,只有 cn() 能證明它是 class(2026-10-06 突變 W9)
  const cnOnly = ["const surface = cn('flex flex-col', 'gap-12')", 'export const X = () => (<Panel surfaceProps={{ tone: surface }} />)', ''].join('\n')
  expect(keysOf(analyzeSource(SYNTHETIC_DRIFT, cnOnly, instruments).hits).join() === 'hardcoded-spacing@1:gap-12', `只有 cn() 證明是 class 的單字也要紅,實得 ${keysOf(analyzeSource(SYNTHETIC_DRIFT, cnOnly, instruments).hits).join()}`)
  const constStyle = ['const cardStyle = { padding: 24 }', 'const base = { gap: 16 }', 'export const X = () => (<div style={{ ...base, ...cardStyle }}>x</div>)', 'export const Y = () => (<div style={cardStyle}>y</div>)', ''].join('\n')
  expect(keysOf(analyzeSource(SYNTHETIC_DRIFT, constStyle, instruments).hits).join() === 'hardcoded-spacing@1:style.padding:24,hardcoded-spacing@2:style.gap:16',
    `style 物件放在常數 / 展開進來 → 在常數那一行紅、同一個常數用兩次只算一筆,實得 ${keysOf(analyzeSource(SYNTHETIC_DRIFT, constStyle, instruments).hits).join()}`)
  // 2xl: 前綴也要走「名字推出來的」路徑(class 名的變數 / 資料欄位)—— 上面 holes 第一格是直接 className,
  // 不經 looksLikeClassList,拿掉 2xl: 修正它照樣綠(2026-10-07 複驗突變 D1);這兩格才綁得住那個修正。
  for (const [why, src] of [
    ['class 名的變數', ["const rowClasses = 'flex flex-col gap-12 2xl:gap-16'", 'export const X = () => (<div>x</div>)', '']],
    ['資料欄位的 className', ["const rows = [{ className: 'flex flex-col gap-12 2xl:gap-16' }]", 'export const X = () => (<div>x</div>)', '']],
  ]) {
    const got = keysOf(analyzeSource(SYNTHETIC_DRIFT, src.join('\n'), instruments).hits).join()
    expect(got === 'hardcoded-spacing@1:gap-12,hardcoded-spacing@1:gap-16', `2xl: 前綴經${why}也要紅,實得 ${got}`)
  }

  // 18. @layout-space-magic-ok 進棘輪(2026-10-06 審查:逃生口原本無上限):放行的字記進 stats.escapeHits;基準記 0、目前 1 → 紅;
  //     基準記 1 → 綠;比 base 多只列 review(要隨基準檔送審);分類器本來就放行的 micro 行不算;設計規格層不收;理由數 code point
  const escOne = analyzeSource(SYNTHETIC_DRIFT, ['export const X = () => (<div>', '  {/* @layout-space-magic-ok: 夾具 —— 刻意固定的 16px 卡片內距 */}', '  <div className="flex flex-col p-4">x</div>', '</div>)', ''].join('\n'), instruments)
  expect(escOne.hits.length === 0 && escOne.stats.escapeHits.length === 1 && escOne.stats.escapeHits[0].token === 'p-4', `逃生口放行的字應記一筆(p-4),實得 ${JSON.stringify(escOne.stats.escapeHits.map((h) => h.token))}`)
  const escMicro = analyzeSource(SYNTHETIC_DRIFT, ['export const X = () => (<div>', '  {/* @layout-space-magic-ok: 夾具 —— 行內 micro 本來就會被分類器放行 */}', '  <span className="inline-flex items-center gap-1">3 位成員</span>', '</div>)', ''].join('\n'), instruments)
  expect(escMicro.hits.length === 0 && escMicro.stats.escapeHits.length === 0, `分類器本來就放行的 micro 行,逃生口不消耗額度,實得 ${escMicro.stats.escapeHits.length}`)
  const escNow = new Map([[SYNTHETIC_DRIFT, escOne.stats.escapeHits]])
  const escNew = compareWithBaseline(new Map(), buildBaseline(new Map()), new Map(), escNow)
  expect(escNew.increases.length === 1 && escNew.increases[0].rule === ESCAPE_KEY, `新增的逃生口放行應紅,實得 ${JSON.stringify(escNew.increases.map((i) => i.rule))}`)
  const escBase = buildBaseline(new Map(), new Map(), escNow)
  expect(validateBaseline(escBase).length === 0 && compareWithBaseline(new Map(), escBase, new Map(), escNow).increases.length === 0, '基準已記這個逃生口 → 綠')
  const escAudit = auditBaselineAgainstBase(escBase, { perFile: new Map(), counterPerFile: new Map(), escapePerFile: new Map() })
  expect(escAudit.problems.length === 0 && escAudit.review.length === 1 && escAudit.review[0].key === ESCAPE_KEY, '逃生口比 base 多只列 review(隨基準檔送審),不擋')
  expect(validateBaseline(buildBaseline(new Map(), new Map(), new Map([[SYNTHETIC_ANATOMY, escOne.stats.escapeHits]]))).some((m) => m.includes('不收')), '設計規格層不收 (b),也不該有逃生口的數字')
  const emojiEsc = holeKeys(SYNTHETIC_DRIFT, ['  {/* @layout-space-magic-ok: 😀😀😀 */}', '  <div className="flex flex-col p-4">x</div>'])
  expect(emojiEsc === 'hardcoded-spacing@3:p-4', `理由數的是字(3 個 emoji 不是 6 個字),實得 ${emojiEsc}`)

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
  log('  · 棘輪:變少綠、手改基準拒收(含替設計規格層記 (b))、同檔多一筆只指出新的那行;空範圍 = 儀器失效;分層計數照檔名分')
  log('  · 分層兩面:同一段漂移在設計原則層四條紅、在設計規格層只紅 (a)(c)(d);對基準比各是 4 / 3 條新增')
  log('  · 反例標記:原則層合法 → 4 筆全放行;搬到展示層 / 規格層、理由太短、隔一行非註解 → 仍紅並說明;同一行 → 放行')
  log('  · 手改基準:指紋格式、替不在範圍的檔預留 → 拒收;數字一致的加額度 / 替新檔預留 → 對 base 實測紅;反例標記進棘輪(新增要送審、比 base 多列 review)')
  log('  · 偵測面兩面:inline style 間距 / rem 任意值 / 三位數刻度 / 名字不帶 class 的變數 / 任意值裡的中文 → 紅;token、0、非間距屬性、單字資料 → 0 筆')
  log('  · 標記只認註解:字串屬性裡的標記、「標記 + 程式碼」連帶下一行、沒理由的逃生口、JSX 文字裡的 // → 不算;多行註解最後一行在正上方 → 算')
  log('  · 反例標記真形狀:原則層手刻 label/value 列 py-1 沒標 1 筆 / 標了 0 筆 / 空理由 1 筆 / 搬到展示層 1 筆;逃生口正上方 0 筆 / 隔一行程式碼 1 筆 / 理由「短」1 筆')
  log('  · (c) 盲點:標題 div 後接 {children} / {props.children} 1 筆、只接 {note} 0 筆;反例標記綁的兩句出處原文任一句不見 → 儀器失效')
  log('  · 2026-10-06 偵測洞兩面:2xl: 前綴 / className 夾中文 / style as / 樣板字串 / token 夾字面值 / 常數與展開 / [gap:12px] / 跨行 div 標題 / Separator 同行別元素 → 紅;token、calc、0、分隔線自己的 class、名稱 + 說明 → 0 筆')
  log('  · 逃生口進棘輪:放行的字記帳(micro 行不算)、新增紅、基準記了綠、比 base 多只列 review、規格層不收;理由數 code point(3 個 emoji 不算 6 字)')
  log(`  · 掃除前真檔(a89b6610):${LAYER_BEFORE_FIXTURES.map((fx) => `${fx.story.split('/').pop()} ${fx.expected.map((k) => k.slice(0, k.indexOf(':'))).join(' ')}`).join(';')} 全紅,對基準比都是新增`)
  log(`  · 重建後 Rating:(a)(c)(d) 0 筆;(b) ${spacing.length} 筆${spacing.length ? ` = ${RATING_STORY}:${spacing[0].line} gap-2,與 CreateProjectForm 表單底列逐字相同(待拍板)` : ''}`)
  return true
}

// ── base 對照(基準不得比 merge-base 寬)────────────────────────────────────────

function git(repo, args, input) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 })
  return { ok: !r.error && r.status === 0, out: String(r.stdout ?? ''), err: String(r.stderr ?? r.error?.message ?? '') }
}

/**
 * 要拿來比的 base:`--base=<ref>` 明確指定(打錯 = 儀器失效,不退回別的 ref);否則 PR 用 origin/<GITHUB_BASE_REF>、
 * CI 上的 push 用 HEAD^(合併進 main 的那一筆之前)、本機依序試 origin/main → main → HEAD(HEAD = 跟已提交的那一份比,抓工作樹裡的手改)。
 * CI 找不到任何 base = 儀器失效(沒比到不是通過,M37);本機找不到只印出來。
 */
export function resolveBase(repo, argv, env) {
  const explicit = argv.find((a) => a.startsWith('--base='))?.slice('--base='.length)
  const ci = Boolean(env.CI)
  const candidates = explicit
    ? [explicit]
    : [env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : null, ci && !env.GITHUB_BASE_REF ? 'HEAD^' : null, 'origin/main', 'main', ci ? null : 'HEAD'].filter(Boolean)
  for (const ref of candidates) {
    const mb = git(repo, ['merge-base', 'HEAD', ref])
    if (mb.ok && mb.out.trim()) return { ref, mergeBase: mb.out.trim() }
    if (explicit) throw new InstrumentError(`--base=${explicit} 找不到共同祖先(git merge-base HEAD ${explicit} 失敗:${mb.err.trim().slice(0, 160)})`)
  }
  if (ci) throw new InstrumentError(`CI 找不到可比對的 base(試過 ${candidates.join(', ')})—— 沒比到不是通過`)
  return null
}

/** 某個 commit 那棵樹裡、範圍內的 story(路徑 + 原文);一次 git cat-file --batch 讀完。 */
export function treeAtCommit(repo, commit) {
  const ls = git(repo, ['ls-tree', '-r', '--name-only', commit, '--', 'packages/design-system/src'])
  if (!ls.ok) throw new InstrumentError(`讀不到 ${commit} 的檔案清單:${ls.err.trim().slice(0, 160)}`)
  const files = ls.out.split('\n').filter((f) => /\.stories\.tsx$/.test(f)).sort()
  const batch = spawnSync('git', ['cat-file', '--batch'], { cwd: repo, input: files.map((f) => `${commit}:${f}`).join('\n') + '\n', maxBuffer: 256 * 1024 * 1024 })
  if (batch.error || batch.status !== 0) throw new InstrumentError(`讀不到 ${commit} 的 story 原文(git cat-file --batch)`)
  const buf = batch.stdout
  const texts = new Map()
  let at = 0
  for (const f of files) {
    const nl = buf.indexOf(0x0a, at)
    const header = buf.subarray(at, nl).toString('utf8').split(' ')
    const size = Number(header[2])
    if (header[1] !== 'blob' || !Number.isInteger(size)) throw new InstrumentError(`${commit}:${f} 不是檔案(${header.join(' ')})`)
    texts.set(f, buf.subarray(nl + 1, nl + 1 + size).toString('utf8'))
    at = nl + 1 + size + 1
  }
  const hasGate = git(repo, ['cat-file', '-e', `${commit}:${SELF}`]).ok
  return { files, read: (rel) => texts.get(rel), hasGate }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const layerSummary = (stats) => Object.entries(stats.layers).map(([l, n]) => `${LAYERS[l].label} ${n}`).join(' / ')
const keyLabel = (key) => (key === COUNTER_KEY ? '設計原則層放行的反例標記(@story-counter-example)'
  : key === ESCAPE_KEY ? '被逃生口放行的寫死間距(@layout-space-magic-ok)' : RULES[key].label)
const sumOf = (byFile) => [...byFile.values()].reduce((n, hs) => n + hs.length, 0)

/**
 * CLI 判定(exit 0 綠 / 1 紅 / 2 儀器失效)。抽成可注入 repo / argv / env 的函式,meta-test 才能在臨時 git repo 裡
 * 端到端跑過每一條接線(2026-10-06 審查:13 個突變只碰純函式,把「有新增就紅」那一行改成 if (false) 沒有任何檢查發現)。
 * @returns {number} exit code
 */
export function runCli({ repo = REPO, argv = [], env = process.env, out = console.log, err = console.error } = {}) {
  try {
    if (argv.includes('--selftest')) return selftest(out, repo) ? 0 : 1
    const instruments = loadInstruments(repo)
    const scope = listScope(repo)
    const { perFile, counterPerFile, escapePerFile, stats } = scanTree({ repo, instruments, files: scope })
    const emptyLayers = Object.entries(stats.layers).filter(([, n]) => n === 0).map(([l]) => LAYERS[l].label)
    if (stats.files === 0 || emptyLayers.length || stats.buttons === 0 || stats.classStrings === 0) {
      throw new InstrumentError(`掃到 ${stats.files} 個 story(${layerSummary(stats)})、${stats.buttons} 顆 Button、${stats.classStrings} 段 class 字串${emptyLayers.length ? `;${emptyLayers.join(' / ')} 0 檔` : ''} —— 沒量到不是通過(M37)`)
    }
    const totals = totalsOf(perFile)
    const counterTotal = sumOf(counterPerFile)
    const escapeTotal = sumOf(escapePerFile)
    if (argv.includes('--list')) {
      for (const hits of perFile.values()) for (const h of hits) out(`${h.file}:${h.line}\t${h.rule}\t${h.token}`)
      for (const hits of counterPerFile.values()) for (const h of hits) out(`${h.file}:${h.line}\t${COUNTER_KEY}(放行 ${h.rule})\t${h.token}`)
      for (const hits of escapePerFile.values()) for (const h of hits) out(`${h.file}:${h.line}\t${ESCAPE_KEY}(放行 ${h.rule})\t${h.token}`)
      out(`\n共 ${Object.entries(totals).map(([r, n]) => `${r} ${n}`).join(' / ')};放行的反例標記 ${counterTotal};逃生口放行 ${escapeTotal}`)
      return 0
    }
    if (argv.includes('--write-baseline')) {
      writeFileSync(join(repo, BASELINE_PATH), `${JSON.stringify(buildBaseline(perFile, counterPerFile, escapePerFile), null, 2)}\n`)
      out(`已寫入 ${BASELINE_PATH}:${Object.entries(totals).map(([r, n]) => `${r} ${n}`).join(' / ')};反例標記 ${counterTotal};逃生口放行 ${escapeTotal}`)
      return 0
    }
    const baseline = readBaseline(repo)
    if (!baseline) { err(`✗ 找不到 ${BASELINE_PATH}`); return 1 }
    const malformed = validateBaseline(baseline, { scope })
    if (malformed.length) {
      err(`✗ ${BASELINE_PATH} 格式不合(被手改過?):`)
      for (const m of malformed) err(`  · ${m}`)
      return 1
    }
    // 基準不得比 merge-base 寬:同一支儀器量 base 那棵樹,基準任一格高於 base 實測 = 手改加額度 / 替新檔預留 → 紅
    const base = resolveBase(repo, argv, env)
    let baseLine = '(本機沒有可比對的 base,略過「基準不得比 base 寬」;CI 一定會比)'
    if (base) {
      const tree = treeAtCommit(repo, base.mergeBase)
      if (!tree.hasGate) baseLine = `base ${base.ref}(${base.mergeBase.slice(0, 8)})還沒有這支閘 —— 本次變更引入它,沒有更早的基準可比`
      else {
        const measured = scanTree({ repo, instruments, files: tree.files, read: tree.read })
        const audit = auditBaselineAgainstBase(baseline, measured)
        baseLine = `基準對 base ${base.ref}(${base.mergeBase.slice(0, 8)},同一支儀器實測 ${measured.stats.files} 個 story)沒有放寬`
        if (audit.review.length) {
          out(`\n⚠ ${audit.review.length} 格「被標記放行」的數字比 base 多(已隨基準檔更新;請審查這幾行是否真是本則要示範的 ❌ / 真是刻意固定的值):`)
          for (const r of audit.review) out(`  ${r.file}  ${keyLabel(r.key)}  base ${r.base} → 基準 ${r.committed}`)
        }
        if (audit.problems.length) {
          err(`\n✗ ${BASELINE_PATH} 比 base(${base.ref} ${base.mergeBase.slice(0, 8)})寬 —— 基準只准往下,不得替新增的漂移加額度:`)
          for (const pr of audit.problems) err(`  · ${pr.file}  ${keyLabel(pr.key)}:base 實測 ${pr.base} 筆,基準卻記 ${pr.committed} 筆`)
          return 1
        }
      }
    }
    const { increases, decreases } = compareWithBaseline(perFile, baseline, counterPerFile, escapePerFile)
    out(`=== story 漂移棘輪 ===  掃了 ${stats.files} 個 story(${layerSummary(stats)})/ ${stats.buttons} 顆 Button / ${stats.classStrings} 段 class 字串(${stats.classWords} 個字)/ ${stats.styleSpacing} 個 inline style 間距;略過 ${stats.testOnlyRanges} 段 test-only;放行 ${stats.counterExamples} 處設計原則層反例、${stats.escapes} 個逃生口放行的字`)
    for (const rule of RULE_IDS) out(`  ${RULES[rule].label}:目前 ${totals[rule]} / 基準 ${baseline.totals[rule]}`)
    out(`  ${keyLabel(COUNTER_KEY)}:目前 ${counterTotal} / 基準 ${baseline.totals[COUNTER_KEY] ?? 0}`)
    out(`  ${keyLabel(ESCAPE_KEY)}:目前 ${escapeTotal} / 基準 ${baseline.totals[ESCAPE_KEY] ?? 0}`)
    out(`  ${baseLine}`)
    if (increases.length) {
      err(`\n✗ ${increases.length} 處新增(該檔該格的數字高於基準;新檔基準 = 0;新增的反例標記 / 逃生口要隨基準檔一起送審):`)
      for (const inc of increases) {
        err(`\n  ${inc.file}  ${keyLabel(inc.rule)}  ${inc.before} → ${inc.after}${inc.newFile ? '(新檔)' : ''}${inc.hits.length > inc.after - inc.before ? '(以下含改寫過的舊行)' : ''}`)
        for (const h of inc.hits) {
          err(`    ${RELEASE_KEYS.has(inc.rule) ? `[被${inc.rule === COUNTER_KEY ? '反例標記' : '逃生口'}放行] ${h.file}:${h.line} ${RULES[h.rule].label} ${h.token}\n      > ${h.text.slice(0, 140)}` : describeHit(h, instruments.typography)}`)
        }
      }
      return 1
    }
    if (decreases.length) {
      // CI 不准留鬆的基準(2026-10-06 審查「延遲誤紅」:減少漂移卻沒收緊基準的 PR 綠燈合併後,下一個無關 PR 的「基準不得比 base 寬」
      // 會紅、而且指名錯的 PR)。在 CI 裡數字變少 = 這個 PR 自己要跑 --write-baseline 收緊;本機只提示
      const ci = Boolean(env.CI)
      ;(ci ? err : out)(`\n${ci ? '✗' : '✓'} ${decreases.length} 處比基準少${ci ? ' —— 在這個 PR 裡本機跑 node scripts/story-layer-drift-invariant.mjs --write-baseline 收緊基準再提交(CI 不准留鬆的基準:合併後下一個無關的 PR 會因「基準比 base 寬」誤紅)' : '(可在本機跑 --write-baseline 收緊;CI 裡數字變少而基準沒收緊會紅)'}:`)
      for (const d of decreases) (ci ? err : out)(`  ${d.file}  ${keyLabel(d.rule)}  ${d.before} → ${d.after}`)
      if (ci) return 1
    }
    out('\n✓ 沒有新增漂移')
    return 0
  } catch (error) {
    if (error instanceof InstrumentError) { err(`✗ INSTRUMENT-FAIL:${error.message}`); return 2 }
    throw error
  }
}

// 進入點比對用真實路徑:經過 symlink 的路徑(macOS 的 /var → /private/var、tmpdir 裡的 repo)直接比字串會不相等,
// 閘就一行都不跑、exit 0 —— 2026-10-06 meta-test 在臨時 repo 真的跑 `node 閘` 時抓到的(乾淨的那一次綠燈其實什麼都沒量)
const isEntryPoint = () => {
  if (!process.argv[1]) return false
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}
if (isEntryPoint()) process.exitCode = runCli({ argv: process.argv.slice(2) })
