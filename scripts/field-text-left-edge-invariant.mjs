#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Field control 裡第一段看得見的字,左緣落在「邊框 + --field-px」(field-controls.spec.md「Select 顯示模式」;純顯示 view × default 是 0,見同檔「軸一 view mode」),而且每一則 story 量到的受管欄位個數不少於覆蓋清單記的數
 *   紅: 把受管欄位的左內距推 6px 必須紅;在欄位最前面塞一個畫得出來的小方塊、讓欄位被當成「前面有東西」而不量,覆蓋清單必須點名掉了的 story 並紅
 *   綠: 現況必須綠;在欄位裡塞讀屏專用、畫面上看不見的播報區(sr-only:空的、與 Select / Combobox「已移除『X』」同形,以及帶字的兩種裁法)時,量到的個數一個都不少、零偏離
 *
 * 不變式:**Field control 的水平內距是標準 `--field-px`,除非欄位裡真的有 Tag;純顯示(view × default 外殼)左側是 0**。
 *
 * 依據(逐字):
 *   `components/Field/field-controls.spec.md`「Select 顯示模式」
 *     「tagPadding 只在有 Tag 時才套用。Placeholder/空值狀態使用 fieldWrapper 的標準
 *       `--field-px`(`px-[var(--field-px)]`)padding,確保文字與邊框有足夠間距。」
 *   同檔 `:21` —— field 的水平內距走 `--field-px`,與選單列的 `--item-px: var(--field-px)` 連續一致
 *     (Consumers:Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker)。
 *   同檔 `:279` —— tag 模式特例:左側內距改用四邊等距公式,理由是**讓 Tag 四邊等距**
 *     (`components/Tag/tag.spec.md`「圓角與間距」,2026-09-15 df463144)。
 *
 * 量法:因為沒辦法直接量「內距」是不是被別的規則覆寫掉,改量**結果** —— 欄位裡第一段文字的左緣
 * 應該落在 `邊框 + --field-px`。只在「這段文字前面沒有別的東西」時才成立,所以下面三種一律跳過。
 *
 * **為什麼需要一支閘**(2026-09-18 user 抓到):只選「不限」時欄位不渲 Tag、渲純文字,
 * 按 :298 就該用標準 `--field-px`,但當時「要不要縮內距」與「要不要渲 Tag」是**兩個各自寫的
 * 判斷式**(readonly 路徑看 `hasTags`、可編輯路徑看 `value.length > 0`),新增「值非空但不渲 Tag」
 * 這第三種狀態時只改到渲染那一側 → 字從 13px 掉到 4px。眼睛看得出來,但沒有任何閘在守。
 *
 * **只量「欄位自己那段字」**,三種東西不算,各有自己的幾何、不歸這條規則管:
 *   (a) **Tag 裡的字** —— Tag 的幾何歸「四邊等距」那條公式管(`tag-field-vertical-inset.mjs` I4)。
 *       注意:四邊等距管的是 **Tag 這個盒子**,不是它裡面的字;lg 的 Tag 內文字因此落在 15px 而不是
 *       13px,那是公式的正常結果,**不是 bug**(2026-09-18 我一度誤判成「兩條規範打架」,查證後撤回)。
 *   (b) **頭像裡的縮寫字母**(`[data-avatar-size]`)—— 有自己的圓。
 *   (c) **前面還站著別的東西的字**(國碼 addon、起始圖示…)。判準是通則不是白名單:欄位裡只要有
 *       任何**畫面上畫得出來**、且不是這段文字祖先的元素左緣比它更左,就跳過。
 *
 * **「畫得出來」量的是畫面,不是「元素存在」**(2026-10-14,待辦總帳 G12):`0464ba54` 在 Select / Combobox 欄位裡
 * 加了讀屏播報區「已移除『X』」(`SelectMenu/select-menu-removal-status.tsx`,sr-only:1×1、`clip-path: inset(50%)`、
 * `margin: -1px`)。它在畫面上什麼都沒有,但它的盒子落在內容區起點左邊 1px —— 舊判準只問「有沒有矩形、不是 hidden、
 * 透明度不是 0、寬高不是 0」,於是把它當成「前面站著東西」,**133 個欄位從此被跳過**(每輪 264 → 140),
 * 而地板 `MIN_FIELDS = 40` 照樣放行,零訊號,一共九天(10-07 → 10-14)。根因是用「元素有盒子」代替「畫面上有東西」(M37)。
 * 現在的判準:元素(或字)的盒子 ∩ 自己與一路往上到欄位為止每一層的裁切(`clip-path: inset()`、`clip: rect()`、
 * 祖先的 overflow)∩ 祖先透明度不是 0,剩下的面積 > 0 才算畫得出來。第一段字也用同一個判準挑(讀屏專用的字不算)。
 * 已知簡化:祖先的 overflow 一律當成會裁到它(絕對定位的子孫其實可能逃出非定位祖先的 overflow)—— 這個偏差只會讓
 * 「前面有東西」判少、多量一個欄位,結果是紅得出聲,不會靜默放行。其他形狀的 clip-path(polygon / url)不猜、整個盒子算畫得到,
 * 並在結尾印出出現過幾次。
 *
 * **覆蓋清單取代固定地板**(2026-10-14,待辦總帳 G12):地板 40 是手寫的常數,實際 264 個欄位掉到 140 還高於它。
 * 現在每一則 story 量到幾個受管欄位,記在 `scripts/field-text-left-edge-inventory.json`(由這支閘從建置好的
 * Storybook 量出來寫入:`--write-inventory`,不是手寫)。每次全掃:
 *   - 任一則 story 量到的個數**少於**清單記的 → 紅,點名該則、記多少 / 這次多少、這次沒量的欄位各自是被哪一條規則跳過(含前置元素長相);
 *   - 清單裡的 story 不在這份建置裡(改名 / 刪除)→ 紅(那些欄位這次一個都沒量到);
 *   - 比清單多(新 story、新欄位)→ 印出「清單還沒記」,不紅;跑 `--write-inventory` 收進清單。
 * 個數真的該變少(例如 story 改成有起始圖示)時,重寫清單 —— 清單的差異會出現在 PR 的 diff 裡,有人看得到。
 *
 * **不管表格 cell 裡的 naked 欄位**:`field-controls.spec.md:66`「`view×naked` = bare(host TD 給
 * padding)」—— 那種欄位 `!px-0 !py-0`、邊框透明,內距由 cell 自己給(實測 AgentPanel FAB 的表格:
 * 欄位內距 0、cell 內距 12)。判準是「它住在 `[role=cell]` / `<td>` 裡」這個語意邊界。
 * ⚠️ **不可以用「邊框透明」當判準**:readonly / disabled / view 三個模式的邊框本來就是透明的,
 * readonly / disabled 照樣吃 `--field-px`(2026-09-18 第一版這樣寫,250 支 story 只量到 2 個欄位 = 幾乎空綠)。
 * **純顯示(view × default)應為 0**:2026-10-21 user 在確認頁 C1 留言:視覺上全部對齊標籤是肯定且必須的〔UD-U1021-13〕——
 * `field-controls.spec.md`「軸一 view mode」:左內距與左邊框歸 0、值的第一個可見元素齊控件左緣 = 標籤左緣。
 *
 * 量的是像素(`--field-px` 丟量尺進去解析成真實 px —— `getPropertyValue` 回的是 token 原文
 * `0.75rem`,直接 parseFloat 會拿到 0.75,第一版就是這樣誤判了 21 個)。全 story 掃,不抽樣。
 *
 * 對照組 `--selftest`(四組,全部只開清單記著有受管欄位的 story,缺一組就不算過):
 *   ① 把每個受管欄位的左內距推 6px → 必須抓到偏離(遇到就收工);
 *   ② 在每個受管欄位最前面塞一個 4×4 畫得出來的方塊 → 每一則被抽到的 story 都必須被覆蓋清單點名「掉了」;
 *   ③ 在每個受管欄位最後面塞一個空的讀屏播報區(`<span role="status" class="sr-only"><span></span></span>`,
 *      與 select-menu-removal-status.tsx 同形同位置 = G12 本尊)→ 量到的個數必須與清單一樣、零偏離;
 *   ④ 在每個受管欄位最前面塞兩個**帶字**的讀屏播報區(產品的 `sr-only` = `clip-path: inset(50%)`,與舊式 `clip: rect(0 0 0 0)`),
 *      兩個都往左挪 6px(`margin-left: -6px`)→ 個數一樣、零偏離(讀屏專用的字不得被當成「第一段看得見的字」去量)。
 *      為什麼要挪:不挪的話,舊判準拿它當第一段字去量,幾乎每個欄位都只差不到容許值 1px —— 這一組就考不到「挑字」那一半
 *      (2026-10-14 實跑:不挪時抽到的 8 則 story 只有 1 個欄位差超過 1px)。
 * ②–④ 每組抽 CONTROL_STORIES 則,沿清單均勻取(不是只取開頭幾則同一個元件)。
 * 兩面對照(2026-10-14 實跑):把「畫得出來」換回舊判準、其餘一字不改,③ 每一則都被點名掉了、④ 量到讀屏專用的字而偏離 ——
 * 這兩組在舊判準下會紅、在新判準下綠,證明它們量得到這次修的東西。
 * ③ ④ 每一趟還要**自己證明有作用**:塞進去的播報區,至少要在一個欄位上騙得過「有盒子就算畫得出來」的舊判準
 * (③ 空的:盒子落在那條線(邊框 + --field-px)的左邊 = 舊判準會當成前置元素、整欄跳過;④ 帶字:字的盒子離那條線超過 1px =
 * 舊判準拿它去量就偏離)。比的是那條線、不是這次挑到的字:判準本身壞掉時挑到的字也跟著錯,拿它當基準會把真紅說成「沒有作用」。
 * 一個都騙不到 = 這一組的綠是零證據(例如之後版面改了、播報區不再落在線的左邊)→ 判「對照組沒有作用」紅,不當通過;
 * 每趟印「考得到的欄位 / 有塞到的欄位」,強度每次都看得到。
 *
 * **沒量到 = 儀器失效(exit 1),不是通過**(2026-09-25,M37):每則 story 經 lib/launch-browser.mjs 的 openStory
 * (全部瀏覽器閘共用的唯一實作)開啟 —— 等 Storybook 回報這則渲染完成(含 play)、通過 render-health、字型載完、
 * 版面連續靜止 SETTLE_FRAMES 個影格,才量第一段文字左緣。取代原本的 domcontentloaded + 等根節點有子元素(等不到還 `.catch` 吞掉)+ 固定睡 110ms。
 * 原本任何一則載入失敗只記進「載入失敗 N 支」、照樣 exit 0;Storybook 錯誤頁也被當成「渲染好了」去量(量到 0 個欄位
 * = 沒有偏離)。現在逐則點名、附同源 404 帳本,兩種跑法都 exit 1(不用 exit 2:gate-selftest-meta 在 2026-09-25 修正前把 2 讀成「略過」)。
 *
 * 用法:node scripts/field-text-left-edge-invariant.mjs [--selftest] [--write-inventory] [--only=<story id 片段>] [--limit=N] [--lanes=N] [--build=<dir>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, settleAfterInteraction, StoryRenderInstrumentError, requireStorybookBuild } from './lib/launch-browser.mjs'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const WRITE_INVENTORY = process.argv.includes('--write-inventory')
const ONLY = arg('only', '')
const LIMIT = Number(arg('limit', '0'))
const LANES = Number(arg('lanes', '4'))
const TOLERANCE_PX = 1
// 覆蓋清單:每則 story 量到幾個受管欄位(由 --write-inventory 從建置量出來寫入;取代原本手寫的地板 MIN_FIELDS = 40)
const INVENTORY = join(ROOT, 'scripts/field-text-left-edge-inventory.json')
const INVENTORY_REL = relative(ROOT, INVENTORY)
// 對照組 ②–④ 各抽幾則 story(沿清單均勻取)
const CONTROL_STORIES = 8
// 開 story 後要求版面連續靜止幾個影格才量(量的是幾何:要等排版、量寬後重畫與進場動畫跑完)
const SETTLE_FRAMES = 10
// 儀器失效累積到這麼多支就停掃:那時建置整體壞了(例如預覽腳本缺檔),每支都要等到逾時,掃完 1000 多支沒有意義
const MAX_INSTRUMENT_FAILURES = 25

if (WRITE_INVENTORY && (SELFTEST || ONLY || LIMIT)) {
  console.error('✗ --write-inventory 只能全掃(不能搭 --selftest / --only / --limit):清單要記的是整份建置')
  process.exit(1)
}

/** 讀覆蓋清單;格式不對 = 錯誤字串(呼叫端決定要不要紅)。 */
function readInventory() {
  if (!existsSync(INVENTORY)) return { error: `找不到 ${INVENTORY_REL}` }
  let data
  try { data = JSON.parse(readFileSync(INVENTORY, 'utf8')) } catch (error) { return { error: `${INVENTORY_REL} 解析不了:${error.message}` } }
  const stories = data?.stories
  if (!stories || typeof stories !== 'object' || Array.isArray(stories)) return { error: `${INVENTORY_REL} 沒有 stories 物件` }
  const malformed = Object.entries(stories).filter(([, n]) => !Number.isInteger(n) || n < 1)
  if (malformed.length) return { error: `${INVENTORY_REL} 有 ${malformed.length} 筆不是正整數(例:${malformed.slice(0, 3).map(([k, v]) => `${k}=${v}`).join('、')})` }
  if (Object.keys(stories).length === 0) return { error: `${INVENTORY_REL} 是空的 —— 空清單等於什麼都不守` }
  return { stories }
}

requireStorybookBuild(join(BUILD, 'index.json'))
const inventory = readInventory()
// 只有「第一次寫清單」可以沒有清單;其餘任何跑法缺清單 / 清單壞了 = 這一趟沒有比對基準,不能算通過
if (inventory.error && !(WRITE_INVENTORY && !existsSync(INVENTORY))) {
  console.error(`✗ 覆蓋清單不能用:${inventory.error}。先跑 \`node scripts/field-text-left-edge-invariant.mjs --write-inventory\`(全掃一次、從建置量出來寫入)`)
  process.exit(1)
}
const recorded = inventory.stories ?? {}

// story 清單讀**正在服務的那一份**建置(快照),不讀活目錄 —— 清單與頁面必須出自同一份建置
//(2026-09-25,待辦總帳 C5;lib/a11y-static-server.mjs 的 readServedStorybookIndex)
const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const index = readServedStorybookIndex(server)
const allStories = Object.values(index.entries || index.stories).filter((e) => e.type !== 'docs').map((e) => ({ id: e.id, name: e.name }))
let stories = allStories
// 對照組只開清單記著有受管欄位的 story:對照組要有欄位可以動手腳(原本照 index 順序掃,0464ba54 之後要掃到第 170 支才遇到第一個)
if (SELFTEST) stories = stories.filter((s) => recorded[s.id])
if (ONLY) stories = stories.filter((s) => s.id.includes(ONLY))
if (LIMIT) stories = stories.slice(0, LIMIT)
if (stories.length === 0) { console.error(`✗ 一支 story 都沒對到${SELFTEST ? '(對照組只開覆蓋清單記著的 story)' : ''}`); process.exit(2) }

const PROBE = () => {
  const out = { measured: [], skipped: [], unknownClips: [], fooled: 0, reached: 0 }
  // 畫得出來的範圍(待辦總帳 G12):起始盒 ∩ 從 node 往上到 stopAt(含)每一層的裁切;任一層透明度 0 = 什麼都畫不出來。
  // ownOverflow:node 自己的 overflow 會不會裁到這個盒子 —— 字是 node 的內容,會;元素自己的盒子,不會(overflow 只裁子孫)。
  const paintedRect = (rect, node, stopAt, ownOverflow) => {
    let r = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    const cut = (l, t, rr, bb) => { r = { left: Math.max(r.left, l), top: Math.max(r.top, t), right: Math.min(r.right, rr), bottom: Math.min(r.bottom, bb) } }
    for (let n = node; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.opacity === '0') return null
      const b = n.getBoundingClientRect()
      if (cs.clipPath && cs.clipPath !== 'none') {
        const m = /^inset\(([^)]*)\)/.exec(cs.clipPath)
        if (m) {
          const [t, ri = t, bo = t, le = ri] = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/)
          const len = (v, ref) => (v.endsWith('%') ? (parseFloat(v) / 100) * ref : parseFloat(v))
          cut(b.left + len(le, b.width), b.top + len(t, b.height), b.right - len(ri, b.width), b.bottom - len(bo, b.height))
        } else if (!out.unknownClips.includes(cs.clipPath.slice(0, 60))) out.unknownClips.push(cs.clipPath.slice(0, 60))
      }
      // clip: rect(上, 右, 下, 左)只作用在 absolute / fixed;座標從邊框盒左上角起算,auto = 那一邊不裁
      if ((cs.position === 'absolute' || cs.position === 'fixed') && cs.clip && cs.clip !== 'auto') {
        const m = /^rect\(([^)]*)\)/.exec(cs.clip)
        if (m) {
          const v = m[1].split(/[\s,]+/).filter(Boolean)
          const at = (i, auto) => (v[i] === 'auto' || v[i] === undefined ? auto : parseFloat(v[i]))
          cut(b.left + at(3, 0), b.top + at(0, 0), b.left + at(1, b.width), b.top + at(2, b.height))
        }
      }
      if (n !== node || ownOverflow) {
        if (cs.overflowX !== 'visible') cut(b.left + (parseFloat(cs.borderLeftWidth) || 0), -Infinity, b.right - (parseFloat(cs.borderRightWidth) || 0), Infinity)
        if (cs.overflowY !== 'visible') cut(-Infinity, b.top + (parseFloat(cs.borderTopWidth) || 0), Infinity, b.bottom - (parseFloat(cs.borderBottomWidth) || 0))
      }
      if (n === stopAt) break
    }
    return r.right - r.left > 0 && r.bottom - r.top > 0 ? r : null
  }
  // `data-field-mode` **同時掛在外層 Field 容器與控件本身**;外層那顆帶 `data-field-orientation`,
  // 裡面第一個文字是 <label>(2026-09-18 第一版量到它,得出「量到 0px 應為 12px」的假陽性)。
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    const 模式 = el.getAttribute('data-field-mode') || '?'
    if (el.getClientRects().length === 0) { out.skipped.push({ 模式, 原因: '沒有渲染' }); continue }
    // 表格 cell 裡的 naked 欄位不在這條線上(見檔頭)
    if (el.closest('td,[role="cell"],[role="gridcell"]')) { out.skipped.push({ 模式, 原因: '表格 cell' }); continue }
    const cs = getComputedStyle(el)
    const bl = parseFloat(cs.borderLeftWidth || '0')
    // 第一段**畫得出來**的字(讀屏專用的 sr-only 字不算:畫面上沒有它)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n, first = null, tb = null
    while ((n = walker.nextNode())) {
      if (!(n.nodeValue || '').trim()) continue
      const pe = n.parentElement
      if (!pe || pe.getClientRects().length === 0) continue
      if (getComputedStyle(pe).visibility === 'hidden') continue
      const range = document.createRange(); range.selectNodeContents(n)
      const rect = range.getBoundingClientRect()
      if (!paintedRect(rect, pe, el, true)) continue
      first = n; tb = rect; break
    }
    if (!first) { out.skipped.push({ 模式, 原因: '沒有看得見的字' }); continue }
    // Tag 裡的字歸「四邊等距」公式管(那條管的是 Tag 盒子,不是盒裡的字);頭像縮寫有自己的圓
    if (first.parentElement.closest('[data-tag-root],[data-tag-text],[data-avatar-size]')) { out.skipped.push({ 模式, 原因: 'Tag / 頭像裡的字' }); continue }
    // `--field-px` 要真的解析成像素,不能 parseFloat token 原文
    const ruler = document.createElement('div')
    ruler.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--field-px)'
    el.appendChild(ruler)
    const fieldPx = parseFloat(getComputedStyle(ruler).width)
    ruler.remove()
    const fb = el.getBoundingClientRect()
    // 對照組 ③ ④ 有沒有作用:塞進去的讀屏播報區(`data-selftest-hidden`)用「有盒子 = 畫得出來」的舊判準看,會不會騙到這個欄位。
    // 比的是**那條線**(邊框 + --field-px),不是這次挑到的字 —— 判準本身壞掉時挑到的字也跟著錯,拿它當基準會把真紅說成「對照組沒有作用」。
    // 空的:盒子落在線的左邊(舊判準當成前置元素、整欄跳過);帶字:字的盒子離線超過 1px(= TOLERANCE_PX;舊判準拿它去量就偏離)
    // 純顯示(view × default;表格裡的 naked 已在上面排除)左側 0,其餘 = 邊框 + --field-px
    const expectLeft = 模式 === 'view' ? 0 : bl + fieldPx
    const line = fb.left + expectLeft
    if (el.querySelector('[data-selftest-hidden]')) out.reached += 1
    for (const p of el.querySelectorAll('[data-selftest-hidden]')) {
      const said = (p.textContent || '').trim()
      let pr = p.getBoundingClientRect()
      if (said) { const rg = document.createRange(); rg.selectNodeContents(p); pr = rg.getBoundingClientRect() }
      if (!(pr.width > 0 && pr.height > 0)) continue
      if (said ? Math.abs(pr.left - line) > 1 : pr.left < line - 0.5) { out.fooled += 1; break }
    }
    // 前面還站著**畫得出來**的東西(國碼 addon / 起始圖示 / 頭像…)→ 這條線管的不是這段字
    let leading = null
    for (const kid of el.querySelectorAll('*')) {
      if (kid.contains(first)) continue                   // 這段字的祖先不算
      if (kid.getClientRects().length === 0) continue
      if (getComputedStyle(kid).visibility === 'hidden') continue
      const painted = paintedRect(kid.getBoundingClientRect(), kid, el, false)
      if (!painted) continue                              // 畫面上什麼都沒有(sr-only 播報區等)
      if (painted.left < tb.left - 0.5) {
        const role = kid.getAttribute('role')
        const cls = String(kid.getAttribute('class') || '').trim().split(/\s+/).slice(0, 2).join('.')
        leading = `${kid.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}${cls ? `.${cls}` : ''} ${Math.round(painted.right - painted.left)}×${Math.round(painted.bottom - painted.top)}`
        break
      }
    }
    if (leading) { out.skipped.push({ 模式, 原因: '前面有畫得出來的東西', 前置: leading }); continue }
    out.measured.push({
      模式,
      文字: (first.nodeValue || '').trim().slice(0, 14),
      量到: +(tb.left - fb.left).toFixed(2),
      應為: +expectLeft.toFixed(2),
      標籤: el.getAttribute('aria-label') || '',
    })
  }
  return out
}

// 對照組 ①:把每個受管欄位的左內距推 6px
const SHIFT = () => {
  let n = 0
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    if (el.closest('td,[role="cell"],[role="gridcell"]')) continue
    const cs = getComputedStyle(el)
    el.style.paddingLeft = `${parseFloat(cs.paddingLeft || '0') + 6}px`
    n += 1
  }
  return n
}

// 對照組 ②:每個受管欄位最前面塞一個 4×4、畫得出來的方塊(真的站在字前面的東西)
const INJECT_PAINTED_LEADING = () => {
  let n = 0
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    if (el.closest('td,[role="cell"],[role="gridcell"]')) continue
    const box = document.createElement('span')
    box.setAttribute('data-selftest-leading', '')
    box.style.cssText = 'display:inline-block;flex:none;width:4px;height:4px;background:rgb(255,0,0)'
    el.prepend(box)
    n += 1
  }
  return n
}

// 對照組 ③:每個受管欄位最後面塞一個空的讀屏播報區 —— 與 SelectMenu/select-menu-removal-status.tsx 的 RemovalStatus
// 同一份標記、同一個位置(觸發欄位的最後一個子元素;用產品自己的 `sr-only`:1×1、margin -1px、clip-path: inset(50%))。G12 本尊
const INJECT_HIDDEN_EMPTY = () => {
  let n = 0
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    if (el.closest('td,[role="cell"],[role="gridcell"]')) continue
    const status = document.createElement('span')
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.className = 'sr-only'
    status.setAttribute('data-selftest-hidden', '')
    status.append(document.createElement('span'))
    el.append(status)
    n += 1
  }
  return n
}

// 對照組 ④:每個受管欄位最前面塞兩個**帶字**的讀屏播報區 —— 產品的 `sr-only`(clip-path: inset(50%))與舊式 `clip: rect(0 0 0 0)`,都往左挪 6px
const INJECT_HIDDEN_TEXT = () => {
  let n = 0
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    if (el.closest('td,[role="cell"],[role="gridcell"]')) continue
    const modern = document.createElement('span')
    modern.setAttribute('role', 'status'); modern.className = 'sr-only'; modern.textContent = '已移除「對照組」'
    const legacy = document.createElement('span')
    legacy.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'
    legacy.textContent = '已移除「對照組」'
    // 往左挪 6px:舊判準若拿它當第一段字去量,一定偏離(不挪的話幾乎都落在容許值 1px 以內,考不到)
    for (const s of [modern, legacy]) { s.style.marginLeft = '-6px'; s.setAttribute('data-selftest-hidden', '') }
    el.prepend(modern, legacy)
    n += 1
  }
  return n
}

const INJECT = { shift: SHIFT, 'painted-leading': INJECT_PAINTED_LEADING, 'hidden-empty': INJECT_HIDDEN_EMPTY, 'hidden-text': INJECT_HIDDEN_TEXT }

/**
 * 掃一批 story。
 * @param {{id: string, name: string}[]} list
 * @param {{ inject?: keyof typeof INJECT, stopOnBad?: boolean }} [opts]
 */
async function scan(list, { inject = null, stopOnBad = false } = {}) {
  const result = { scanned: 0, bad: [], perStory: new Map(), instrumentFailures: [], unknownClips: new Set() }
  let cursor = 0
  const browsers = []
  try {
    const lane = async () => {
      const browser = await launchBrowser(); browsers.push(browser)
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      for (;;) {
        if (stopOnBad && result.bad.length > 0) break
        if (result.instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) break
        const idx = cursor++
        if (idx >= list.length) break
        const s = list[idx]; result.scanned += 1
        try {
          try {
            await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, {
              settleFrames: SETTLE_FRAMES, notFound: server.notFound, navigationTimeoutMs: 30_000, timeoutMs: 30_000,
            })
          } catch (error) {
            if (!(error instanceof StoryRenderInstrumentError)) throw error
            result.instrumentFailures.push({ story: s.id, detail: error.detail })
            console.error(`  ! 儀器失效 ${s.id}(${error.kind})—— 詳情見結尾清單`)
            continue
          }
          // 2026-09-29 CI(run 5ade7355):AgentPanel 兩支 story 的欄位量到 19px(應 13px),本機同一份程式 264 個欄位全綠 ——
          // 那兩支 story 掛載後才開對話框 / 面板,openStory 的版面靜止在動畫**開始前**就過了,慢的 runner 上量到縮放進場的中間值
          // (M32 第四題「機器慢的時候還會綠嗎」)。量之前先等頁面上所有**有限次**的動畫 / 過渡結束(無限循環的 spinner /
          // skeleton 永遠不會 finished,第一版沒濾掉、閘在第一支有 spinner 的 story 就卡死;另設 5 秒上限當儀器保險),再等版面靜止。
          await page.evaluate(() => Promise.race([
            Promise.allSettled(document.getAnimations()
              .filter((a) => { const t = a.effect?.getTiming?.(); return !t || Number.isFinite(t.iterations) })
              .map((a) => a.finished)),
            new Promise((resolve) => setTimeout(resolve, 5_000)),
          ]))
          const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
          if (!settled.ok) { result.instrumentFailures.push({ story: s.id, detail: `動畫結束後 ${settled.framesWaited} 格內版面沒有靜止(變動 ${settled.lateChanges} 次)` }); continue }
          // 對照組:動手腳後等 30ms 讓樣式生效(量測本身的 getBoundingClientRect 也會強制同步排版,這步只是保險)
          if (inject) { await page.evaluate(INJECT[inject]); await page.waitForTimeout(30) }
          const probed = await page.evaluate(PROBE)
          result.perStory.set(s.id, probed)
          for (const c of probed.unknownClips) result.unknownClips.add(c)
          for (const r of probed.measured) {
            if (Math.abs(r.量到 - r.應為) > TOLERANCE_PX) result.bad.push({ story: s.id, name: s.name, ...r })
          }
        } catch (error) {
          // 量測途中丟例外 = 這則沒量完 → 儀器失效(原本只記一行「載入失敗」、照樣 exit 0)
          result.instrumentFailures.push({ story: s.id, detail: `量測途中丟例外:${String(error?.message || error).split('\n')[0]}` })
          console.error(`  ! ${s.id}: 量測途中丟例外:${String(error?.message || error).split('\n')[0]}`)
        }
        if (result.scanned % 250 === 0) console.error(`… ${result.scanned}/${list.length} 支掃完`)
      }
      await page.close(); await browser.close()
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(LANES, list.length)) }, () => lane()))
  } finally {
    for (const b of browsers) await b.close().catch(() => null)
  }
  return result
}

/** 跟覆蓋清單比:掉了(量到的 < 清單記的)/ 清單還沒記(多出來的)。只比這一趟真的量到的 story。 */
function compareWithInventory(perStory) {
  const dropped = []
  const unrecorded = []
  for (const [id, probed] of perStory) {
    const now = probed.measured.length
    const was = recorded[id] ?? 0
    if (now < was) dropped.push({ id, was, now, skipped: probed.skipped })
    else if (now > was) unrecorded.push({ id, was, now })
  }
  return { dropped, unrecorded }
}

/** 一則 story 裡沒量的欄位,依「被哪條規則跳過」聚合成一行(前置元素附長相)。 */
const skipSummary = (skipped) => {
  const counts = new Map()
  for (const s of skipped) {
    const key = s.前置 ? `${s.原因}:${s.前置}` : s.原因
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([k, v]) => `${k} ×${v}`).join(';')
}

const printInstrumentFailures = (failures, scanned, total) => {
  console.error(`\n✗ 儀器失效:${failures.length} 支 story 沒量到 —— 這不是產品裁決(元件不一定有問題),但這一趟不能算通過:`)
  for (const f of failures) console.error(`  - ${f.story}:${f.detail}`)
  if (failures.length >= MAX_INSTRUMENT_FAILURES) console.error(`  已達 ${MAX_INSTRUMENT_FAILURES} 支,停止掃描(還有 ${total - scanned} 支沒掃)—— 建置很可能整體壞了`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
}

/** 沿清單均勻取 k 則(不是只取開頭同一個元件的幾則) */
const spread = (list, k) => {
  if (list.length <= k) return list
  const step = list.length / k
  return Array.from({ length: k }, (_, i) => list[Math.floor(i * step)])
}

let exitCode = 0
try {
  if (SELFTEST) {
    const verdicts = []
    // ① 左內距推 6px → 必須抓到偏離(遇到就收工)
    const shifted = await scan(stories, { inject: 'shift', stopOnBad: true })
    if (shifted.instrumentFailures.length) { printInstrumentFailures(shifted.instrumentFailures, shifted.scanned, stories.length); exitCode = 1 }
    else {
      const ok = shifted.bad.length > 0
      if (ok) console.log(`… 對照組 ① 在第 ${shifted.scanned} 支就抓到了,提早收工`)
      verdicts.push([ok, `① 把左內距推 6px → ${ok ? `抓到偏離(例:${shifted.bad[0].story}「${shifted.bad[0].文字}」量到 ${shifted.bad[0].量到}px,應為 ${shifted.bad[0].應為}px)` : '沒抓到'}`])
    }
    const sample = spread(stories, CONTROL_STORIES)
    // ② 塞畫得出來的前置方塊 → 每一則抽到的 story 都必須被覆蓋清單點名「掉了」
    if (!exitCode) {
      const painted = await scan(sample, { inject: 'painted-leading' })
      if (painted.instrumentFailures.length) { printInstrumentFailures(painted.instrumentFailures, painted.scanned, sample.length); exitCode = 1 }
      else {
        const { dropped } = compareWithInventory(painted.perStory)
        const missed = sample.filter((s) => !dropped.some((d) => d.id === s.id))
        verdicts.push([missed.length === 0, `② 每個欄位最前面塞 4×4 方塊 → 覆蓋清單點名掉了 ${dropped.length}/${sample.length} 則${missed.length ? `(沒點名:${missed.map((s) => s.id).join('、')})` : ''}`])
      }
    }
    // ③ ④ 塞畫面上看不見的播報區 → 量到的個數一個都不能少、零偏離
    for (const [inject, label] of [['hidden-empty', '③ 每個欄位最後面塞空的 sr-only 播報區(G12 本尊)'], ['hidden-text', '④ 每個欄位最前面塞兩個帶字的 sr-only 播報區']]) {
      if (exitCode) break
      const hidden = await scan(sample, { inject })
      if (hidden.instrumentFailures.length) { printInstrumentFailures(hidden.instrumentFailures, hidden.scanned, sample.length); exitCode = 1; break }
      const { dropped } = compareWithInventory(hidden.perStory)
      // 對照組自己有沒有作用:塞進去的播報區至少要在一個欄位上騙得過舊判準(見 PROBE 的 fooled),否則這一組的綠是零證據
      // 印「考得到的欄位 / 有塞到的欄位」,讓這一組的強度每次都看得到(只要求至少一個:一個就足以證明判準分得開)
      const fooled = [...hidden.perStory.values()].reduce((sum, p) => sum + p.fooled, 0)
      const reached = [...hidden.perStory.values()].reduce((sum, p) => sum + p.reached, 0)
      const ok = fooled > 0 && dropped.length === 0 && hidden.bad.length === 0
      verdicts.push([ok, `${label} → ${fooled > 0 ? `騙得過「有盒子 = 畫得出來」舊判準的欄位 ${fooled} / ${reached} 個;` : `對照組沒有作用:有塞到的 ${reached} 個欄位裡,播報區一個都騙不過「有盒子 = 畫得出來」的舊判準,這一組的綠不能當證據;`}個數少了的 story ${dropped.length} 則、偏離 ${hidden.bad.length} 個${dropped.length ? `(${dropped.map((d) => `${d.id} ${d.was}→${d.now}:${skipSummary(d.skipped)}`).join(' | ')})` : ''}${hidden.bad.length ? `(${hidden.bad.slice(0, 3).map((b) => `${b.story}「${b.文字}」${b.量到}/${b.應為}`).join('、')})` : ''}`])
    }
    if (!exitCode) {
      for (const [ok, line] of verdicts) console.log(`${ok ? '✓' : '✗'} ${line}`)
      if (verdicts.length === 4 && verdicts.every(([ok]) => ok)) console.log('\n✓ selftest:四組對照組都照預期 —— 偏離會紅、覆蓋掉了會紅、看不見的播報區不會讓覆蓋掉也不會被當成字去量')
      else { console.log('\n✗ selftest:有對照組沒照預期 —— 這支的綠燈不能當證據'); exitCode = 1 }
    }
  } else {
    const run = await scan(stories)
    const fieldsChecked = [...run.perStory.values()].reduce((sum, p) => sum + p.measured.length, 0)
    const skippedAll = [...run.perStory.values()].flatMap((p) => p.skipped)
    console.log(`\n掃描 ${run.scanned} 支 story(不抽樣),儀器失效(沒量到)${run.instrumentFailures.length} 支`)
    console.log(`量到受管欄位(非表格 cell、字不在 Tag 裡):${fieldsChecked} 個`)
    console.log(`沒量的欄位(依跳過原因):${skipSummary(skippedAll) || '無'}`)
    if (run.unknownClips.size) console.log(`· 判不了裁切範圍、整個盒子算畫得到的 clip-path:${[...run.unknownClips].join('、')}`)
    console.log(`偏離那條線:${run.bad.length} 個`)
    const shown = new Set()
    for (const b of run.bad) {
      const k = `${b.story}|${b.模式}|${b.量到}`
      if (shown.has(k)) continue
      shown.add(k)
      console.log(`  ✗ ${b.story}(${b.模式}${b.標籤 ? ' / ' + b.標籤 : ''})「${b.文字}」量到 ${b.量到}px,應為 ${b.應為}px`)
    }

    // 儀器失效優先於任何裁決:沒量到的 story 不得被讀成「內距都對」,也不得被拿去比覆蓋清單(那會被讀成「覆蓋掉了」)
    if (run.instrumentFailures.length) {
      printInstrumentFailures(run.instrumentFailures, run.scanned, stories.length)
      exitCode = 1
    } else if (WRITE_INVENTORY) {
      if (run.bad.length) {
        console.error('\n✗ 有欄位偏離那條線,不寫覆蓋清單 —— 從紅的那一趟寫清單,等於把錯的狀態鎖成基準')
        exitCode = 1
      } else {
        const next = Object.fromEntries([...run.perStory].filter(([, p]) => p.measured.length > 0)
          .map(([id, p]) => [id, p.measured.length]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        const { dropped, unrecorded } = compareWithInventory(run.perStory)
        const gone = Object.keys(recorded).filter((id) => !run.perStory.has(id))
        writeFileSync(INVENTORY, `${JSON.stringify({
          note: 'field-text-left-edge-invariant 的覆蓋清單:每則 story 量到幾個受管欄位。由 `node scripts/field-text-left-edge-invariant.mjs --write-inventory` 從建置好的 Storybook 全掃量出來寫入,不要手改。任一則量到的比這裡少 = 紅(有欄位被跳過了,點名原因);變多不紅,重寫收進來。',
          generatedBy: 'scripts/field-text-left-edge-invariant.mjs --write-inventory',
          stories: next,
        }, null, 2)}\n`)
        console.log(`\n已寫入 ${INVENTORY_REL}:${Object.keys(next).length} 則 story、${fieldsChecked} 個受管欄位`)
        if (dropped.length || gone.length) {
          console.log(`⚠️ 這次寫入讓 ${dropped.length + gone.length} 則 story 的記數變少 —— 請在 commit 說明為什麼(這正是清單要擋的事):`)
          for (const d of dropped) console.log(`  - ${d.id}:${d.was} → ${d.now}(${skipSummary(d.skipped)})`)
          for (const id of gone) console.log(`  - ${id}:${recorded[id]} → 不在這份建置裡`)
        }
        if (unrecorded.length) console.log(`· 新收進清單 / 變多:${unrecorded.length} 則`)
      }
    } else {
      const { dropped, unrecorded } = compareWithInventory(run.perStory)
      // 清單裡的 story 不在這份建置(改名 / 刪除)—— 只有全掃才判得了
      const partial = Boolean(ONLY || LIMIT)
      const gone = partial ? [] : Object.keys(recorded).filter((id) => !allStories.some((s) => s.id === id))
      const recordedTotal = Object.entries(recorded).filter(([id]) => run.perStory.has(id)).reduce((sum, [, n]) => sum + n, 0)
      console.log(`覆蓋清單(${INVENTORY_REL}):這次掃到的 story 清單記 ${recordedTotal} 個,這次量到 ${fieldsChecked} 個`)
      if (unrecorded.length) {
        console.log(`· 清單還沒記的覆蓋:${unrecorded.length} 則 story、多 ${unrecorded.reduce((s, u) => s + u.now - u.was, 0)} 個欄位(不紅;跑 --write-inventory 收進清單,之後掉了才擋得到)`)
      }
      if (dropped.length || gone.length) {
        console.log(`\n✗ 覆蓋掉了:${dropped.length} 則 story 量到的受管欄位比清單少${gone.length ? `,${gone.length} 則清單記著的 story 不在這份建置裡` : ''} —— 那些欄位這次沒被檢查,綠燈不能代表它們:`)
        for (const d of dropped) console.log(`  ✗ ${d.id}:清單 ${d.was} 個 → 這次 ${d.now} 個;沒量的:${skipSummary(d.skipped) || '(欄位不見了)'}`)
        for (const id of gone) console.log(`  ✗ ${id}:清單 ${recorded[id]} 個 → 這份建置沒有這則 story(改名 / 刪除?)`)
        console.log(`  是量具把欄位誤判成「不歸它管」→ 修量具;欄位真的該變少 → 跑 --write-inventory 重寫清單,並在 commit 說明`)
        exitCode = 1
      }
      if (run.bad.length > 0) exitCode = 1
      if (!exitCode) console.log('\n✓ 每個欄位的水平內距都是標準 --field-px(量的是沒有 Tag / 頭像 / 前置元素時的第一段文字),覆蓋不少於清單')
    }
  }
} finally {
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}
process.exit(exitCode)
