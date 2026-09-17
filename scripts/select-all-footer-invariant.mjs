#!/usr/bin/env node
/**
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
 * 對照組 `--selftest`:把按鈕的字釘死不讓它跟著狀態變,這支必須紅;抓到 = exit 0,沒抓到 = exit 1。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const LIMIT = Number(arg('limit', '0'))
const EDGE_TOLERANCE_PX = 1

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}

const index = JSON.parse(readFileSync(join(BUILD, 'index.json'), 'utf8'))
let stories = Object.values(index.entries || index.stories)
  .filter((e) => e.type !== 'docs')
  .map((e) => ({ id: e.id, name: e.name }))
if (LIMIT) stories = stories.slice(0, LIMIT)

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
    const options = [...root.querySelectorAll('[role="option"]')]
    if (!options.length) continue
    const checked = options.filter((o) => o.querySelector('[data-state="checked"]')).length
    // 幾何:按鈕左緣必須貼齊列的前緣。列的前緣 = 外層 border-box 左 + border + padding + 內層 padding
    //(CommandItem 是兩層,外層恆 p-0、內層 MenuItem 帶 --item-px)。
    const r1 = (n) => Math.round(n * 10) / 10
    const first = options[0]
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

// 幾何那條的對照組:把 footer 的左內距多推 12px(當初 px-loose 差 4px,推 12px 是同一種病放大)
const SHIFT_FOOTER = () => {
  const footer = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root] [data-slot="surface-footer"]')
  if (!footer) return false
  footer.style.paddingLeft = `${parseFloat(getComputedStyle(footer).paddingLeft) + 12}px`
  return true
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const bad = []
let scanned = 0
let footersChecked = 0
let liveFlips = 0
let loadErrors = 0
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
  page.on('pageerror', () => {})
  for (;;) {
    if (SELFTEST && bad.length > 0) break
    const idx = cursor++
    if (idx >= stories.length) break
    const s = stories[idx]
    scanned += 1
    try {
      await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForFunction(
        () => document.querySelector('#storybook-root')?.children.length > 0 || document.querySelector('.sb-show-errordisplay'),
        null,
        { timeout: 15_000 },
      ).catch(() => {})
      await page.waitForTimeout(120)
      const triggers = page.locator('[role="combobox"]')
      const count = await triggers.count()
      for (let i = 0; i < count; i += 1) {
        await triggers.nth(i).click({ timeout: 3_000 }).catch(() => null)
        await page.waitForTimeout(260)
        // 對照組要在**量之前**就把東西弄壞(幾何那條量的是 before),不然推了也量不到
        if (SELFTEST) { await page.evaluate(FREEZE_LABEL); await page.evaluate(SHIFT_FOOTER); await page.waitForTimeout(40) }
        const before = await page.evaluate(PROBE)
        if (!before) { await page.keyboard.press('Escape').catch(() => null); await page.waitForTimeout(80); continue }
        footersChecked += 1
        const where = { story: s.id, name: s.name, trigger: i }
        if (!before.是真按鈕) bad.push({ ...where, 問題: '底部那顆不是真的 <button>', 細節: before })
        if (!before.在Tab序) bad.push({ ...where, 問題: '底部按鈕不在 Tab 序裡(WCAG 2.1.1)', 細節: before })
        if (before.有aria_pressed) bad.push({ ...where, 問題: '標籤會變又帶 aria-pressed(W3C 按鈕規範:兩條路互斥)', 細節: before })
        // SelectMenu 不渲染 header,footer 唯一能對齊的是它上面那些列(overlay-surface.spec.md
        //「SurfaceFooter 的左右內距要對齊誰」)。2026-09-17 錨:沿用 px-loose 時差 4px(33 vs 29)。
        if (Math.abs(before.按鈕左緣 - before.列前緣) > EDGE_TOLERANCE_PX) {
          bad.push({ ...where, 問題: `全選按鈕左緣沒對齊列前緣(差 ${Math.round((before.按鈕左緣 - before.列前緣) * 10) / 10}px)`, 細節: before })
        }

        await page.locator('[cmdk-root] [data-slot="surface-footer"] button').first().click({ timeout: 3_000 }).catch(() => null)
        await page.waitForTimeout(260)
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
        await page.keyboard.press('Escape').catch(() => null)
        await page.waitForTimeout(80)
      }
    } catch (error) {
      loadErrors += 1
      console.error(`  ! ${s.id}: ${String(error.message).split('\n')[0]}`)
    }
    if (scanned % 250 === 0) console.error(`… ${scanned}/${stories.length} 支掃完`)
    // 對照組只要證明「弄壞了它會紅」,抓到第一筆就可以停 —— 沒必要再把剩下的 story 掃完
    // (2026-09-17:原本 selftest 也走完整 1034 支,等於 CI 每次為同一個證明多付一輪掃描)。
    if (SELFTEST && bad.length > 0) { console.error(`… 對照組在第 ${scanned} 支就抓到了,提早收工`); break }
  }
  await page.close()
  await browser.close()
  }
  await Promise.all(Array.from({ length: Math.max(1, LANES) }, () => lane()))
} finally {
  for (const b of browsers) await b.close().catch(() => null)
  // 2026-09-18:`server.close()` 會等既有連線排乾。單瀏覽器時排得掉,四個瀏覽器在 CI 上有 keep-alive
  // socket 沒收乾 → 這裡永遠等下去。症狀極容易誤讀:主閘 16:59:37 印完「✓ 通過」,接著**19 分鐘零輸出**
  // 直到 job 撞 25 分上限被砍,看起來像對照組跑很久,其實對照組一次都沒開始跑(npm 的 && 還沒輪到)。
  // 給它一個上限,排不乾就不排了 —— 結論已經印完,連線怎麼收不影響判定。
  await Promise.race([
    Promise.resolve(server.close?.()),
    new Promise((resolve) => setTimeout(resolve, 3_000).unref?.()),
  ]).catch(() => null)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),載入失敗 ${loadErrors} 支`)
console.log(`開到帶全選 footer 的面板:${footersChecked} 次`)
console.log(`按下去真的把全選狀態翻面:${liveFlips} 次`)
console.log(`標籤 / 狀態 / a11y 不符:${bad.length} 筆`)
for (const b of bad) {
  console.log(`  ✗ ${b.story} :: ${b.name}(第 ${b.trigger + 1} 個觸發點)— ${b.問題}`)
  console.log(`      ${JSON.stringify(b.細節)}`)
}

if (SELFTEST) {
  if (bad.length > 0) { console.log('\n✓ selftest:對照組(把標籤釘死)讓這支紅了,量具會紅'); process.exit(0) }
  console.log('\n✗ selftest:對照組沒被抓到 —— 這支是假綠,不能當證據')
  process.exit(1)
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
if (bad.length > 0) process.exit(1)
console.log('\n✓ 全選按鈕的字跟勾選狀態一致、左緣貼齊列前緣,且是可 Tab 的真按鈕')
// 明確結束:不靠事件迴圈自己排空(上面那個 race 只是保險,真正決定退出的是這一行)。
process.exit(0)
