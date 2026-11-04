#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 多選選單底部全選按鈕的字跟「是不是已經全選」綁死、是可 Tab 的真 <button>、不帶 aria-pressed、左緣貼齊列前緣;
 *         而且覆蓋清單(scripts/select-all-footer-inventory.json,由本閘 --write-inventory 全掃量出)裡每一則 story 這次開到的全選 footer
 *         面板不少於清單記的數 —— 少量就紅,不再「開到 1 個也算綠」。
 *   紅: 標籤 / 狀態脫鉤、不是真按鈕、不在 Tab 序、帶 aria-pressed、左緣差超過 1px → 指名 story 與第幾個觸發點;
 *       清單裡任一則少量或不在建置裡 → 指名記幾個、這次幾個;缺清單 / 格式不對 / 空清單 → 紅;任一則沒量到 → 儀器失效(exit 1)。
 *   綠: 全掃量完、0 筆不符、清單逐則不少量時綠;--selftest 兩組都要成立:①把按鈕的字釘死 + footer 推 12px → 必紅;
 *       ②清單排序前 2 則,把 footer 的 data-slot 記號拿掉(探針認不出)→ 覆蓋比對必須點名那 2 則,而且破壞至少讓一則真的少量;
 *       --selftest-unrestricted:拔掉「不限」列的記號 → 排除那條必紅。
 *
 * 不變式:**多選選單底部那顆全選按鈕,它的字必須跟「是不是已經全選」綁死**。
 *
 * owner:`packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md`
 * 「底部區域:按鈕列 vs 列式」+ `components/SelectMenu/select-menu.spec.md` 全選 footer 段。
 *
 * 2026-09-17 user 拍板 A 案:原本底部那一列三態勾選列(`aria-checked="mixed"`)換成
 * `SurfaceFooter` + 一顆兩態按鈕(全選 / 取消全選)。W3C 按鈕規範
 * (https://www.w3.org/WAI/ARIA/apg/patterns/button/)逐字:「it is critical the label on a
 * toggle does not change when its state changes」—— 標籤會變與 `aria-pressed` 互斥,本 DS 選
 * 「標籤會變」那條路。**既然選了那條路,標籤就是唯一的狀態出口**:它一旦跟實際勾選狀態脫鉤,
 * 使用者看到「全選」按下去卻什麼都沒發生(因為早就全選了),而且沒有任何其他線索可以察覺。
 *
 * 這支驗的是**對應關係**,不是特定字串(`selectAllLabel` / `deselectAllLabel` 是 prop,
 * story 可以換成任何語言):開面板 → 量(是否全選, 標籤)→ 按一下 → 再量一次。
 *   - 全選狀態翻面了 → 兩次的標籤必須不同
 *   - 全選狀態沒翻面 → 兩次的標籤必須相同
 *   - 按下去勾選數必須真的變(死按鈕也算紅)
 * 另驗三件 a11y(換成按鈕的理由):是真的 `<button>`、在 Tab 序裡、不帶 `aria-pressed`。
 *
 * 再驗一條幾何:**按鈕左緣必須貼齊列的前緣**。SelectMenu 不渲染 header,所以 footer 唯一能對齊的
 * 是它上面那些列(owner:`overlay-surface.spec.md`「SurfaceFooter 的左右內距要對齊誰」)。
 * 2026-09-17 錨:一開始沿用 SurfaceFooter 預設的 `px-loose`,在沒有 header 的一般下拉選單裡
 * 按鈕左緣 33px、列前緣 29px,差 4px;改讀列在用的同一個 `--item-px` 之後兩邊永遠同步。
 *
 * 量的是勾選框的 `data-state` 與按鈕文字,不是 class 字串(M32)。全 story 掃,不抽樣。
 *
 * **「不限」那列不算選項**(2026-09-18):多選選單可以由消費端打開一列「不限」,它表達的是「不設限」,
 * 不是一個可被全選涵蓋的選項(select-menu-unrestricted.spec.md「「不限」選項」段)。所以「有幾個選項 / 是不是
 * 全選了」一律把它排除掉;判準用它身上的結構記號 `data-unrestricted`,**不是**比對值字串
 *(`unrestrictedValue` 是消費端可改的 prop,拿它當判準等於把判準交給呼叫端)。
 * 不排除的話這支會誤判:按下全選後勾選數 1→5、選項數 6,`已全選` 恆 false,於是判成
 *「全選狀態沒變標籤卻變了」—— 實測過(不限 story 未修版當場紅)。
 *
 * 對照組(兩組,都必須紅才算這支的綠燈有意義):
 *   `--selftest`              把按鈕的字釘死不讓它跟著狀態變 → 標籤/狀態那條必須紅。
 *   `--selftest-unrestricted` 把「不限」列的記號拔掉(等同回到沒排除的舊版)→ 排除那條必須紅。
 * 兩者都是抓到 = exit 0,沒抓到 = exit 1。
 *
 * **沒量到 = 儀器失效(exit 1),不是通過**(2026-09-25,M37):每則 story 經 lib/launch-browser.mjs 的 openStory
 * (全部瀏覽器閘共用的唯一實作)開啟 —— 等 Storybook 回報這則渲染完成(含 play)、通過 render-health、版面連續靜止
 * SETTLE_FRAMES 個影格,才開始找觸發點。取代原本的 domcontentloaded + 等根節點有子元素(等不到還 `.catch` 吞掉)
 * + 固定睡 120ms —— 那種寫法在 story 還沒畫完時就數 `[role=combobox]`,數到 0 個 = 這支 story「沒有要量的東西」。
 * 原本任何一則載入失敗只記進「載入失敗 N 支」、照樣 exit 0;現在逐則點名、附同源 404 帳本,三種跑法都 exit 1
 * (不用 exit 2:gate-selftest-meta 在 2026-09-25 修正前把 2 讀成「略過」)。點開觸發點之後那幾段固定等待是等浮層開 / 關的轉場,不是等
 * story 渲染,原樣保留(各自註明等的是什麼)。
 *
 * **覆蓋清單**(2026-10-28,總帳 G13;做法同 field-text-left-edge 的 G12):原本的地板是「整輪開到 0 個 footer 才紅」——
 * 全庫實際開到幾十個,探針只要漏認一大半(被遮罩蓋住、觸發點換了 role、footer 換了記號)照樣綠(M37:「量到幾個」不是「該量的都量到了」)。
 * 現在逐則記數:清單由本閘 `--write-inventory` 全掃量出(那一趟有不符或儀器失效就拒寫;CI 永不寫),之後任一則少量就紅並點名;
 * 變多不紅、印「清單還沒記」。`--only` / `--limit` 跑法只比這次真的掃到的那幾則。
 */
import { join, dirname, resolve } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, ownSurfacePosition, parkPointer, StoryRenderInstrumentError, requireStorybookBuild, settleAfterInteraction } from './lib/launch-browser.mjs'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
// 「不限」排除那條的專屬對照組:拔掉記號,這支必須紅。只掃有「不限」的那幾支就夠了
//(對照組要證明的是「弄壞會紅」,不是覆蓋率),不然為了走到 Combobox 要先掃幾百支。
const SELFTEST_UNRESTRICTED = process.argv.includes('--selftest-unrestricted')
const ONLY = arg('only', SELFTEST_UNRESTRICTED ? 'unrestricted' : '')
const LIMIT = Number(arg('limit', '0'))
const WRITE_INVENTORY = process.argv.includes('--write-inventory')
const INVENTORY = join(ROOT, 'scripts/select-all-footer-inventory.json')
// selftest ②:清單排序後取前幾則做覆蓋對照(一則就足以證明比對分得開,兩則防單一則剛好失效)
const COVERAGE_CONTROL_SAMPLES = 2
// 覆蓋對照組的破壞開關:網址帶這個參數時,初始化腳本把 footer 的 data-slot 記號拿掉(PROBE 認不出全選 footer)。只在這個網址生效
const BREAK_PARAM = 'g13break=1'
const EDGE_TOLERANCE_PX = 1
// 開 story 後要求版面連續靜止幾個影格才開始找觸發點(量的是幾何:要等排版與進場動畫跑完)
const SETTLE_FRAMES = 10
// 儀器失效累積到這麼多支就停掃:那時建置整體壞了(例如預覽腳本缺檔),每支都要等到逾時,掃完 1000 多支沒有意義
const MAX_INSTRUMENT_FAILURES = 25

requireStorybookBuild(join(BUILD, 'index.json'))

// story 清單讀**正在服務的那一份**建置(快照),不讀活目錄 —— 清單與頁面必須出自同一份建置
//(2026-09-25,待辦總帳 C5;lib/a11y-static-server.mjs 的 readServedStorybookIndex)
const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const index = readServedStorybookIndex(server)
let stories = Object.values(index.entries || index.stories)
  .filter((e) => e.type !== 'docs')
  .map((e) => ({ id: e.id, name: e.name }))
// 建置裡全部的 story(--only / --limit 之前):覆蓋清單「不在建置裡」要對整份建置判
const buildIds = new Set(stories.map((s) => s.id))
const allStories = stories
if (ONLY) stories = stories.filter((s) => s.id.includes(ONLY))
if (LIMIT) stories = stories.slice(0, LIMIT)
if (stories.length === 0) {
  console.error(`✗ --only=${ONLY} 一支 story 都沒對到 —— 這支等於沒跑`)
  process.exit(2)
}

// 面板 = 開著的 popper 裡,**選單根(cmdk)底下**帶 surface-footer 的那一個。
// 2026-09-17:一開始只找 `[data-radix-popper-content-wrapper] [data-slot="surface-footer"]`,
// 把 TimePicker 的「此刻」footer 也撈進來了(它同樣是 SurfaceFooter + 一顆按鈕 + 一堆 role=option 的時間欄)。
// 全選 footer 的定義是「SelectMenu 的多選 footer」,SelectMenu 的身分證是 cmdk 根,先收進去再找。
const PROBE = () => {
  const wrappers = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')]
  for (const w of wrappers) {
    const root = w.querySelector('[cmdk-root]')
    if (!root) continue
    const footer = root.querySelector('[data-slot="surface-footer"]')
    if (!footer) continue
    const button = footer.querySelector('button')
    if (!button) continue
    const rows = [...root.querySelectorAll('[role="option"]')]
    if (!rows.length) continue
    // 「不限」那列表達「不設限」,不是可被全選涵蓋的選項 → 踢出分母(檔頭「不限那列不算選項」)
    const options = rows.filter((o) => !o.hasAttribute('data-unrestricted'))
    if (!options.length) continue
    const checked = options.filter((o) => o.querySelector('[data-state="checked"]')).length
    // 幾何:按鈕左緣必須貼齊列的前緣。列的前緣 = 外層 border-box 左 + border + padding + 內層 padding
    //(CommandItem 是兩層,外層恆 p-0、內層 MenuItem 帶 --item-px)。
    const r1 = (n) => Math.round(n * 10) / 10
    // 幾何對齊的參照是「列的前緣」,所以用**畫面上最上面那一列**(含「不限」列 —— 它跟一般列
    // 同樣是 CommandItem,內距一致),不是排除後的 options[0]。
    const first = rows[0]
    const fcs = getComputedStyle(first)
    const fbox = first.getBoundingClientRect()
    const finner = first.firstElementChild
    const 列前緣 = fbox.left
      + parseFloat(fcs.borderLeftWidth || '0')
      + parseFloat(fcs.paddingLeft || '0')
      + (finner ? parseFloat(getComputedStyle(finner).paddingLeft || '0') : 0)
    return {
      列前緣: r1(列前緣),
      按鈕左緣: r1(button.getBoundingClientRect().left),
      標籤: (button.textContent || '').trim(),
      已全選: checked === options.length,
      勾選數: checked,
      選項數: options.length,
      不限列: rows.length - options.length,
      是真按鈕: button.tagName.toLowerCase() === 'button',
      在Tab序: button.tabIndex >= 0 && !button.disabled,
      有aria_pressed: button.hasAttribute('aria-pressed'),
    }
  }
  return null
}

// 對照組:把按鈕的字釘死,讓它跟狀態脫鉤
const FREEZE_LABEL = () => {
  const footer = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root] [data-slot="surface-footer"]')
  const button = footer?.querySelector('button')
  if (!button) return false
  const frozen = (button.textContent || '').trim()
  setInterval(() => { if (button.textContent !== frozen) button.textContent = frozen }, 10)
  return true
}

// 「不限」排除那條的對照組:把記號拔掉,等同回到沒排除的舊版 —— 那時候按下全選後
//「已全選」恆 false 但標籤變了,這支必須判成「全選狀態沒變標籤卻變了」。
const STRIP_UNRESTRICTED_MARK = () => {
  const marks = [...document.querySelectorAll('[cmdk-root] [role="option"][data-unrestricted]')]
  for (const m of marks) m.removeAttribute('data-unrestricted')
  return marks.length > 0
}

// 幾何那條的對照組:把 footer 的左內距多推 12px(當初 px-loose 差 4px,推 12px 是同一種病放大)
const SHIFT_FOOTER = () => {
  const footer = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root] [data-slot="surface-footer"]')
  if (!footer) return false
  footer.style.paddingLeft = `${parseFloat(getComputedStyle(footer).paddingLeft) + 12}px`
  return true
}


/**
 * 掃一則 story:開它、逐一點開看得見的下拉、量全選 footer。回傳這一則開到幾個帶全選 footer 的面板(覆蓋記數)。
 * 不符的寫進 bad、沒量到的寫進 instrumentFailures(與原本 lane 內聯時同一份邏輯,2026-10-28 抽出來給覆蓋對照組重用)。
 * @param {{ urlExtra?: string, sabotage?: boolean }} [opts] urlExtra = 網址後綴(覆蓋對照組帶 BREAK_PARAM);sabotage = 套 --selftest 的破壞(覆蓋對照組不套)
 */
async function scanStory(page, s, { urlExtra = '', sabotage = true } = {}) {
  let found = 0
  try {
    try {
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story${urlExtra}`, {
        settleFrames: SETTLE_FRAMES, notFound: server.notFound, navigationTimeoutMs: 30_000, timeoutMs: 30_000,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrumentFailures.push({ story: s.id, detail: error.detail })
      console.error(`  ! 儀器失效 ${s.id}(${error.kind})—— 詳情見結尾清單`)
      return found
    }
    // 2026-09-25(待辦總帳 C5,M37「沒觀察到 ≠ 沒發生」):原本「點一下(失敗 .catch 吞掉)→ 固定睡 260ms → 量」——
    // 慢的機器上 260ms 內還沒開,PROBE 回 null 就 continue,那個下拉等於沒驗而且沒有任何訊號(覆蓋率靜默縮水)。
    // 現在:觸發點一開始取定;只點看得見、沒停用的;點擊失敗 = 儀器失效;點完等版面連續 SETTLE_FRAMES 個影格靜止
    // (lib/launch-browser.mjs settleAfterInteraction,與 openStory 同一份判定,用影格不用毫秒)才量;等不到靜止 = 儀器失效。
    const settleOr = async (what) => {
      const r = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      if (!r.ok) throw new Error(`${what}之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)`)
    }
    // 導覽不會移動指標:上一則最後停的位置,在這一則上可能正好是會滑過開卡片的東西 —— 先停到中性位置(lib/launch-browser.mjs parkPointer)
    await parkPointer(page)
    await settleOr('開 story 後把指標移開')
    const handles = await page.locator('[role="combobox"]:visible').elementHandles()
    for (let i = 0; i < handles.length; i += 1) {
      const state = await handles[i].evaluate((el) => {
        if (!el.isConnected || el.getClientRects().length === 0) return 'gone'
        if (el.matches(':disabled, [aria-disabled="true"], [data-disabled], [aria-readonly="true"], [readonly]')) return 'inert'
        return 'ok'
      }).catch(() => 'gone')
      if (state !== 'ok') continue // 停用 / 唯讀不點;被前一個互動收掉(預設開啟的下拉被點關)照常略過
      // 2026-09-29:被 modal 遮罩蓋住的觸發點(例 AgentPanel「未存檔的修改」story 一開場就疊兩層對話框)看得見但點不到,
      // click 會等到逾時 → 整支 story 被記成儀器失效。先用 Playwright 自己的可操作性檢查(trial:捲進視窗、可見、穩定、
      // 點擊點命中自己)試一次,過不了 = 被蓋住,略過並計數(不靜默)。第一版自己算 elementFromPoint 沒先捲進視窗,
      // 把 35 個在視窗外的觸發點誤判成被蓋住(本機重跑抓到),改用與真正點擊同一份判準。
      // 2026-10-01:點「觸發欄位自己的表面」、開關之後把指標停到中性位置(lib/launch-browser.mjs ownSurfacePosition / parkPointer)。
      // 原本點正中央、點完指標停在原地:正中央落在 Tag 頭像 / 「+N」上時開的是名片卡 / 名單卡,卡片蓋住下一個觸發點 →
      // PeoplePicker「多人 × 欄位內搜尋」第 4 格點不到(這支 9 次紅 4 次)、「+N 浮出清單移除驗證」第 2 格被默默算成被蓋住。
      // 找不到自己的表面(被 modal 遮罩蓋住,或整格被 Tag / 頭像佔滿)照「被蓋住」計數、印出,不退回點正中央。
      const at = await ownSurfacePosition(handles[i])
      const covered = !at.ok || await handles[i].click({ trial: true, timeout: 2_000, position: at.position }).then(() => false, () => true)
      if (covered) { coveredSkipped += 1; coveredWhere.push(`${s.id} 第 ${i + 1} 個觸發點${at.ok ? '' : `(${at.why})`}`); continue }
      await handles[i].click({ timeout: 10_000, position: at.position })
      await settleOr(`點開第 ${i + 1} 個下拉`) // 量左緣,不能量到縮放進場的中間值
      await parkPointer(page)
      await settleOr(`點開第 ${i + 1} 個下拉後把指標移開`)
      // 對照組要在**量之前**就把東西弄壞(幾何那條量的是 before),不然推了也量不到
      // 對照組:注入後等 40ms 讓樣式 / 屬性生效(量測本身的 getBoundingClientRect 也會強制同步排版,這步只是保險)
      if (sabotage && SELFTEST) { await page.evaluate(FREEZE_LABEL); await page.evaluate(SHIFT_FOOTER); await page.waitForTimeout(40) }
      if (sabotage && SELFTEST_UNRESTRICTED) { await page.evaluate(STRIP_UNRESTRICTED_MARK); await page.waitForTimeout(40) }
      const before = await page.evaluate(PROBE)
      if (!before) { await page.keyboard.press('Escape'); await settleOr(`關閉第 ${i + 1} 個下拉`); continue }
      footersChecked += 1
      found += 1
      if (before.不限列 > 0) unrestrictedSeen += 1
      const where = { story: s.id, name: s.name, trigger: i }
      if (!before.是真按鈕) bad.push({ ...where, 問題: '底部那顆不是真的 <button>', 細節: before })
      if (!before.在Tab序) bad.push({ ...where, 問題: '底部按鈕不在 Tab 序裡(WCAG 2.1.1)', 細節: before })
      if (before.有aria_pressed) bad.push({ ...where, 問題: '標籤會變又帶 aria-pressed(W3C 按鈕規範:兩條路互斥)', 細節: before })
      // SelectMenu 不渲染 header,footer 唯一能對齊的是它上面那些列(overlay-surface.spec.md
      //「SurfaceFooter 的左右內距要對齊誰」)。2026-09-17 錨:沿用 px-loose 時差 4px(33 vs 29)。
      if (Math.abs(before.按鈕左緣 - before.列前緣) > EDGE_TOLERANCE_PX) {
        bad.push({ ...where, 問題: `全選按鈕左緣沒對齊列前緣(差 ${Math.round((before.按鈕左緣 - before.列前緣) * 10) / 10}px)`, 細節: before })
      }

      await page.locator('[cmdk-root] [data-slot="surface-footer"] button').first().click({ timeout: 10_000 })
      await settleOr('按下全選') // 等勾選狀態與按鈕標籤重畫完再量第二次
      const after = await page.evaluate(PROBE)
      // 面板消失不算這支的紅燈:story 的 render 裡如果定義了元件,任何 setState 都會讓整棵樹重掛,
      // 連點一般選項列都會關掉(2026-09-17 對照實測:點 `Electronics` 跟點全選,popper 都是 1 → 0)。
      // 那是 story 寫法的問題,已於同日把五處搬出 render;這支只管標籤跟狀態的對應。
      if (after) {
        const 狀態翻面 = before.已全選 !== after.已全選
        const 標籤變了 = before.標籤 !== after.標籤
        if (狀態翻面 && !標籤變了) {
          bad.push({ ...where, 問題: '全選狀態翻面了但標籤沒跟著變', 細節: { 前: before, 後: after } })
        }
        if (!狀態翻面 && 標籤變了) {
          bad.push({ ...where, 問題: '全選狀態沒變標籤卻變了', 細節: { 前: before, 後: after } })
        }
        if (狀態翻面) liveFlips += 1
      }
      await page.keyboard.press('Escape')
      await settleOr(`關閉第 ${i + 1} 個下拉`) // 等關閉動畫跑完,不擋下一個觸發點
      await parkPointer(page)
      await settleOr(`關閉第 ${i + 1} 個下拉後把指標移開`)
    }
  } catch (error) {
    // 量測途中丟例外 = 這則沒量完 → 儀器失效(原本只記一行「載入失敗」、照樣 exit 0)
    instrumentFailures.push({ story: s.id, detail: `量測途中丟例外:${String(error?.message || error).split('\n')[0]}` })
    console.error(`  ! ${s.id}: 量測途中丟例外:${String(error?.message || error).split('\n')[0]}`)
  }
  return found
}

const bad = []
/** selftest ②:覆蓋對照組每一則的「清單記 / 原樣 / 破壞後」 */
const coverageControl = []
let scanned = 0
let footersChecked = 0
let coveredSkipped = 0 // 被 modal 遮罩蓋住、點不到的觸發點(2026-09-29;不靜默,印進摘要)
const coveredWhere = [] // 哪幾個(2026-10-01:逐一點名,不只一個數字 —— 數字變了才看得出是哪一格被蓋住)
/** 每則 story 開到幾個帶全選 footer 的面板(覆蓋清單比對 / 重寫用) */
const perStory = {}
const scannedIds = new Set()

/** 讀覆蓋清單:{ ok, stories, why } —— 缺檔、格式不對、空清單都不是 ok */
function readInventory() {
  if (!existsSync(INVENTORY)) return { ok: false, why: '讀不到覆蓋清單 scripts/select-all-footer-inventory.json(先在本機跑 --write-inventory)' }
  try {
    const j = JSON.parse(readFileSync(INVENTORY, 'utf8'))
    const recorded = j && typeof j.stories === 'object' && j.stories ? j.stories : null
    if (!recorded) return { ok: false, why: '覆蓋清單格式不對(缺 stories 物件)' }
    const badRows = Object.entries(recorded).filter(([, n]) => !Number.isInteger(n) || n <= 0)
    if (badRows.length) return { ok: false, why: `覆蓋清單格式不對(記數不是正整數:${badRows.map(([k]) => k).slice(0, 5).join(', ')})` }
    if (!Object.keys(recorded).length) return { ok: false, why: '覆蓋清單是空的' }
    return { ok: true, stories: recorded }
  } catch (error) {
    return { ok: false, why: `覆蓋清單讀不懂:${String(error?.message || error)}` }
  }
}
/** 覆蓋比對(純函式):清單裡的 story 這次少量 / 不在建置裡 → 列出;只比這次真的掃到的 */
function compareCoverage(recorded, measured, { scanned, build }) {
  const missing = []; const fewer = []; const more = []
  for (const [id, n] of Object.entries(recorded)) {
    if (!build.has(id)) { missing.push({ story: id, recorded: n }); continue }
    if (!scanned.has(id)) continue
    const got = measured[id] ?? 0
    if (got < n) fewer.push({ story: id, recorded: n, measured: got })
  }
  for (const [id, n] of Object.entries(measured)) if ((recorded[id] ?? 0) < n) more.push({ story: id, recorded: recorded[id] ?? 0, measured: n })
  return { missing, fewer, more }
}
/** selftest ②:每個瀏覽器的頁面都掛這支初始化腳本 —— 只在網址帶 BREAK_PARAM 時,把 footer 的 data-slot 一出現就拿掉 */
const installCoverageBreak = (page) => page.addInitScript((param) => {
  if (!location.search.includes(param)) return
  const strip = () => { for (const n of document.querySelectorAll('[data-slot="surface-footer"]')) n.removeAttribute('data-slot') }
  new MutationObserver(strip).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-slot'] })
}, BREAK_PARAM)
let liveFlips = 0
let unrestrictedSeen = 0
/** 儀器失效:沒量到的 story(不是產品裁決)。 */
const instrumentFailures = []
// 2026-09-18:CI 上這支跑滿 25 分鐘被取消(本機 6.6 分,runner 慢 ~2.5 倍)。
// **不縮掃描範圍**(1034 支一支不少)—— 改成幾條車道平行跑,每條各自認領下一支 story。
// **每條車道各開一個瀏覽器**,不是同一個瀏覽器開多個分頁 —— `lib/launch-browser.mjs` 檔頭寫得很清楚:
// 本 repo 沙箱必須帶 `--single-process`,而那個參數下同一個 context 開多個 page「不穩」、
// 第二個 context 會當場崩。照它寫的走多瀏覽器(它自己給的解),第一次寫成多分頁當場就爆了。
const LANES = Number(arg('lanes', '4'))
let cursor = 0
const browsers = []
try {
  const lane = async () => {
  const browser = await launchBrowser()
  browsers.push(browser)
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await installCoverageBreak(page)
  for (;;) {
    if ((SELFTEST || SELFTEST_UNRESTRICTED) && bad.length > 0) break
    if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) break
    const idx = cursor++
    if (idx >= stories.length) break
    const s = stories[idx]
    scanned += 1
    scannedIds.add(s.id)
    const found = await scanStory(page, s)
    if (found > 0) perStory[s.id] = found
    if (scanned % 250 === 0) console.error(`… ${scanned}/${stories.length} 支掃完`)
    // 對照組只要證明「弄壞了它會紅」,抓到第一筆就可以停 —— 沒必要再把剩下的 story 掃完
    // (2026-09-17:原本 selftest 也走完整 1034 支,等於 CI 每次為同一個證明多付一輪掃描)。
    if ((SELFTEST || SELFTEST_UNRESTRICTED) && bad.length > 0) { console.error(`… 對照組在第 ${scanned} 支就抓到了,提早收工`); break }
  }
  await page.close()
  await browser.close()
  }
  await Promise.all(Array.from({ length: Math.max(1, LANES) }, () => lane()))
  // selftest ②:覆蓋對照組 —— 清單裡抽幾則,原樣掃一次、再用帶 BREAK_PARAM 的網址(footer 的 data-slot 被拿掉)掃一次;
  // 數到的必須變少,而且覆蓋比對必須點名它們。只在 --selftest 跑(不套 ① 的破壞),抽的是清單裡的 story,不受 --only / --limit 限制。
  if (SELFTEST) {
    const inv = readInventory()
    const sample = inv.ok ? Object.keys(inv.stories).sort().slice(0, COVERAGE_CONTROL_SAMPLES) : []
    if (sample.length) {
      const browser = await launchBrowser()
      browsers.push(browser)
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      await installCoverageBreak(page)
      for (const cid of sample) {
        const s = allStories.find((x) => x.id === cid) ?? { id: cid, name: cid }
        const intact = await scanStory(page, s, { sabotage: false })
        const broken = await scanStory(page, s, { sabotage: false, urlExtra: `&${BREAK_PARAM}` })
        coverageControl.push({ story: cid, recorded: inv.stories[cid], intact, broken })
      }
    }
  }
} finally {
  for (const b of browsers) await b.close().catch(() => null)
  // 2026-09-18:`server.close()` 會等既有連線排乾。單瀏覽器時排得掉,四個瀏覽器在 CI 上有 keep-alive
  // socket 沒收乾 → 這裡永遠等下去。症狀極容易誤讀:主閘 16:59:37 印完「✓ 通過」,接著**19 分鐘零輸出**
  // 直到 job 撞 25 分上限被砍,看起來像對照組跑很久,其實對照組一次都沒開始跑(npm 的 && 還沒輪到)。
  // 給它一個上限,排不乾就不排了 —— 結論已經印完,連線怎麼收不影響判定。
  await Promise.race([
    server.stop(), // 先前是 `server.close?.()` —— 這個 helper 沒有 close,可選鏈讓它變成 no-op(2026-09-18)
    new Promise((resolve) => setTimeout(resolve, 3_000).unref?.()),
  ]).catch(() => null)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),儀器失效(沒量到)${instrumentFailures.length} 支`)
console.log(`開到帶全選 footer 的面板:${footersChecked} 次;被遮罩蓋住而略過的觸發點:${coveredSkipped} 個`)
for (const c of coveredWhere) console.log(`  · 被蓋住:${c}`)
console.log(`按下去真的把全選狀態翻面:${liveFlips} 次`)
console.log(`開到帶「不限」列的面板(那列已排除在分母外):${unrestrictedSeen} 次`)
console.log(`標籤 / 狀態 / a11y 不符:${bad.length} 筆`)
for (const b of bad) {
  console.log(`  ✗ ${b.story} :: ${b.name}(第 ${b.trigger + 1} 個觸發點)— ${b.問題}`)
  console.log(`      ${JSON.stringify(b.細節)}`)
}

// 儀器失效優先於任何裁決(三種跑法都一樣):沒量到的 story 不得被讀成「全選都對」,也不得被讀成「對照組抓到了」
if (instrumentFailures.length) {
  console.error(`\n✗ 儀器失效:${instrumentFailures.length} 支 story 沒量到 —— 這不是產品裁決(元件不一定有問題),但這一趟不能算通過:`)
  for (const f of instrumentFailures) console.error(`  - ${f.story}:${f.detail}`)
  if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) console.error(`  已達 ${MAX_INSTRUMENT_FAILURES} 支,停止掃描(還有 ${stories.length - scanned} 支沒掃)—— 建置很可能整體壞了`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  process.exit(1)
}
if (SELFTEST || SELFTEST_UNRESTRICTED) {
  const which = SELFTEST_UNRESTRICTED ? '把「不限」列的記號拔掉' : '把標籤釘死'
  if (bad.length === 0) {
    console.log(`\n✗ selftest:對照組(${which})沒被抓到 —— 這支是假綠,不能當證據`)
    process.exit(1)
  }
  console.log(`\n✓ selftest:對照組(${which})讓這支紅了,量具會紅`)
  if (SELFTEST_UNRESTRICTED) process.exit(0)
  const inv = readInventory()
  if (!inv.ok) { console.log(`✗ selftest ②:${inv.why}`); process.exit(1) }
  if (!coverageControl.length) { console.log('✗ selftest ②:覆蓋對照組一則都沒量到 —— 對照組沒有作用'); process.exit(1) }
  const ids2 = new Set(coverageControl.map((c) => c.story))
  const { fewer } = compareCoverage(Object.fromEntries(coverageControl.map((c) => [c.story, c.recorded])), Object.fromEntries(coverageControl.map((c) => [c.story, c.broken])), { scanned: ids2, build: buildIds })
  const named = new Set(fewer.map((x) => x.story))
  for (const c of coverageControl) console.log(`  ② ${c.story}:清單記 ${c.recorded},原樣開到 ${c.intact},拿掉 footer 記號後 ${c.broken} → ${named.has(c.story) ? '覆蓋比對點名 ✓' : '覆蓋比對沒點名 ✗'}`)
  if (!coverageControl.some((c) => c.broken < c.intact)) { console.log('✗ selftest ②:破壞沒有讓任何一則真的少量 —— 對照組沒有作用'); process.exit(1) }
  if (!coverageControl.every((c) => named.has(c.story))) { console.log('✗ selftest ②:覆蓋清單少量卻沒被點名 —— 覆蓋比對失效'); process.exit(1) }
  console.log('✓ selftest ②:覆蓋清單少量時點得出是哪一則,量具有效')
  process.exit(0)
}
// --write-inventory:全掃、0 不符、0 儀器失效才寫(儀器失效上面已 exit 1);CI 永不寫
if (WRITE_INVENTORY) {
  if (process.env.CI) { console.log('✗ CI 不准寫覆蓋清單(--write-inventory 只在本機,寫完隨 PR 送審)'); process.exit(1) }
  if (ONLY || LIMIT) { console.log('✗ --write-inventory 要全掃,不能配 --only / --limit'); process.exit(1) }
  if (bad.length) { console.log('✗ 這一趟有不符,拒寫覆蓋清單(先修)'); process.exit(1) }
  const old = readInventory()
  const sorted = Object.fromEntries(Object.entries(perStory).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(INVENTORY, JSON.stringify({
    note: 'select-all-footer-invariant 的覆蓋清單:每則 story 開到幾個帶全選 footer 的面板。只准由本閘 --write-inventory 全掃重寫;少量就紅。',
    generatedBy: 'node scripts/select-all-footer-invariant.mjs --write-inventory',
    storyCount: Object.keys(sorted).length,
    footerCount: footersChecked,
    stories: sorted,
  }, null, 2) + '\n')
  if (old.ok) {
    const { fewer } = compareCoverage(old.stories, sorted, { scanned: scannedIds, build: buildIds })
    for (const x of fewer) console.log(`  ! 重寫讓記數變少:${x.story} ${x.recorded} → ${x.measured}`)
  }
  console.log(`已寫覆蓋清單:${Object.keys(sorted).length} 則 story、${footersChecked} 個面板`)
  process.exit(0)
}
// 覆蓋比對(取代原本「0 個才紅」的地板;--only / --limit 跑法只比這次掃到的那幾則)
{
  const inv = readInventory()
  if (!inv.ok) { console.log(`\n✗ 覆蓋清單:${inv.why} —— 這一趟沒有覆蓋基準,不能當綠燈`); process.exit(1) }
  const { missing, fewer, more } = compareCoverage(inv.stories, perStory, { scanned: scannedIds, build: buildIds })
  const recordedTotal = Object.values(inv.stories).reduce((a, b) => a + b, 0)
  console.log(`覆蓋清單:記 ${Object.keys(inv.stories).length} 則 / ${recordedTotal} 個面板${ONLY || LIMIT ? '(縮範圍跑法,只比這次掃到的)' : ''}`)
  for (const m of more) console.log(`  · 清單還沒記:${m.story} 記 ${m.recorded},這次 ${m.measured}`)
  if (missing.length || fewer.length) {
    for (const m of missing) console.log(`  ✗ 清單裡的 story 不在建置裡:${m.story}(記 ${m.recorded})`)
    for (const x of fewer) console.log(`  ✗ 少量:${x.story} 清單記 ${x.recorded} 個,這次開到 ${x.measured} 個 —— footer 被探針漏掉、觸發點被蓋住或 story 改了;真的少了就跑 --write-inventory 並在 PR 說明`)
    process.exit(1)
  }
}
if (footersChecked === 0) {
  console.log('\n✗ 一個帶全選 footer 的面板都沒開到 —— 這支等於沒跑,不能當綠燈')
  process.exit(1)
}
// 個別 story 不動是合法的(`設計規格` 的色票 / 尺寸對照表刻意傳 `value={[...]} onChange={() => {}}`,
// 它要的是固定畫面不是互動),所以不對單支開罰;但整輪一次都沒翻面就代表這支在驗一個死掉的機制。
if (liveFlips === 0) {
  console.log('\n✗ 整輪掃下來沒有任何一次真的翻面 —— 機制可能已經死了,這支不能當綠燈')
  process.exit(1)
}
// 整輪跑完卻一次都沒遇到「不限」列 = 排除那條程式碼從沒被執行過,它的綠燈是零證據。
// (只在完整掃描時要求;`--only` / `--limit` 是縮範圍的除錯用法。)
if (!ONLY && !LIMIT && unrestrictedSeen === 0) {
  console.log('\n✗ 整輪掃下來沒遇到任何「不限」列 —— 排除那條從沒跑過,不能當綠燈')
  process.exit(1)
}
if (bad.length > 0) process.exit(1)
console.log('\n✓ 全選按鈕的字跟勾選狀態一致、左緣貼齊列前緣,且是可 Tab 的真按鈕')
// 明確結束:不靠事件迴圈自己排空(上面那個 race 只是保險,真正決定退出的是這一行)。
process.exit(0)
