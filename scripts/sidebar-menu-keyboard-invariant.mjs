#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 側欄每一串看得見的 SidebarMenu 在 Tab 路上剛好一站、捲動區與列上的動作鈕不在 Tab 路上,
 *         串內 ↑↓ / Home End / → ← 照 sidebar.spec.md「鍵盤:一串 SidebarMenu = 一個 Tab 停靠點」的按鍵表走。
 *   紅: 任一串多於 / 少於一站、viewport 或動作鈕進了 Tab 路、任一按鍵結果不符 → 印出該條與實際焦點並 exit 1;
 *        --selftest 在 document capture 吞掉 keydown 並把每顆都改回 tabindex=0(舊的每項一站),S1/S2/S3 必紅;
 *        並把動作鈕容器改回接指標(2026-09-26 前的形狀),S9 必紅。
 *        story 開不起來 = 儀器失效 exit 1(不是產品裁決)。
 *   綠: 四則 story(混合內容 / 完整佈局 / 動作懸停 / AppShell 主側欄)全部斷言成立,且至少量到一串 SidebarMenu。
 *
 * sidebar-menu-keyboard-invariant.mjs — 側欄「一串 SidebarMenu = 一個 Tab 停靠點」鍵盤不變條件(2026-09-25)
 *
 * 決策出處:governance/planning/2026-09-25-interaction-and-hover-remediation.md B9(user 選乙,逐字:
 * 「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」)。規格 SSOT = components/Sidebar/sidebar.spec.md
 * 「鍵盤:一串 SidebarMenu = 一個 Tab 停靠點」;本閘只量真按鍵的結果,不讀 class。
 *
 * 量的東西(每一條都是真的按鍵、讀 document.activeElement):
 *   S1 每一串看得見的 SidebarMenu 在 Tab 路上**剛好一站**;捲動區 viewport 不是停靠點;列上的動作鈕
 *      (menu-inline-actions 裡的鈕 / menu-action)不在 Tab 路上。印出「離開整個側欄要按幾下 Tab」。
 *   S2 ↑↓ 換項、不繞回、跳過 disabled;Home / End 第一 / 最後一項。
 *   S3 → 進這一列自己的第一顆動作鈕、再 → 下一顆、最後一顆停住;← 上一顆、第一顆 ← 回到列。
 *   S4 動作鈕上 ↑↓ 直接換到上 / 下一項的列。
 *   S5 Tab / Shift+Tab 一下離開這一串(從列或從動作鈕都一樣);Shift+Tab 回來落在上次停的那一項。
 *   S6 只在滑過時出現的動作鈕(actionsReveal="hover"),焦點在這一列(列或它的動作鈕)時 opacity = 1。
 *   S7 當前頁(aria-current="page")在這一串時,Tab 進來落在它。
 *   S8 列本身是選單觸發鈕(帳號列):↓ 不開選單、焦點不動;Enter 開得了(同一個觀測器看得到選單 → 證明 ↓ 那一格的「0 個選單」不是沒看到)。
 *   S9(指標,2026-09-26 待辦總帳 N53 ①)兩顆動作鈕之間的空隙歸列:命中列鈕、點下去列成為當前頁;對照點(按鈕懸停底色內)命中按鈕。
 *
 * 對照組(--selftest):在 document 的 capture 階段吞掉 keydown(React 收不到方向鍵),並把每串所有列與動作鈕
 * 改回 tabindex=0(= 舊的「每項一站」)→ S1 / S2 / S3 必須紅。
 *
 * 儀器:openStory(lib/launch-browser.mjs)—— Storybook 回報渲染完成 + render-health + 等到 [data-sidebar="menu"] 本身。
 * story 開不起來 = 儀器失效(exit 1,不是產品裁決)。
 *
 * 用法:node scripts/sidebar-menu-keyboard-invariant.mjs [--static=<dir>] [--selftest]
 * 其他頁面(例:本閘的 scratch 探針)可 import 下方匯出的 runSidebarKeyboardChecks,對已渲染好的頁面跑同一份檢查。
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STORY_IDS = {
  mixed: 'design-system-components-sidebar-展示--mixed-content',
  iconCollapse: 'design-system-components-sidebar-展示--icon-collapse',
  actionHover: 'design-system-components-sidebar-展示--action-hover-state',
  appShellPrimarySidebar: 'design-system-components-appshell-展示--primary-sidebar',
}

/** 對照組:React 收不到鍵盤 + 每一顆都回到 Tab 路上(舊行為)。 */
export const SABOTAGE = () => {
  document.addEventListener('keydown', (e) => { e.stopImmediatePropagation() }, true)
  const apply = () => {
    for (const el of document.querySelectorAll('ul[data-sidebar="menu"] [data-sidebar="menu-button"], ul[data-sidebar="menu"] [data-sidebar="menu-inline-actions"] button, ul[data-sidebar="menu"] [data-sidebar="menu-action"]')) {
      // 只在值不同時才寫:同值 setAttribute 也會產生 mutation record,會讓下面的 observer 無限自我觸發
      if (el.getAttribute('tabindex') !== '0') el.setAttribute('tabindex', '0')
    }
  }
  apply()
  new MutationObserver(apply).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['tabindex'] })
  // S9 的舊形狀:動作鈕的容器接指標(2026-09-26 前),空隙點下去落在容器、列不導覽
  const style = document.createElement('style')
  style.textContent = '[data-sidebar="menu-inline-actions"]{pointer-events:auto !important}'
  document.head.appendChild(style)
}

// ── 頁面端的描述函式(page.evaluate 用;不得引用外部變數)──
const DESCRIBE_ACTIVE = () => {
  const a = document.activeElement
  if (!a || a === document.body) return { tag: 'body' }
  const menus = [...document.querySelectorAll('ul[data-sidebar="menu"]')]
  const menu = a.closest('ul[data-sidebar="menu"]')
  const li = a.closest('li')
  const kind = a.matches('[data-radix-scroll-area-viewport]') ? 'viewport'
    : a.matches('[data-sidebar="menu-button"]') ? 'row'
      : a.closest('[data-sidebar="menu-inline-actions"]') || a.matches('[data-sidebar="menu-action"]') ? 'action'
        : 'other'
  const label = (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const rowLabel = li ? (li.querySelector('[data-sidebar="menu-button"]')?.getAttribute('aria-label')
    || li.querySelector('[data-sidebar="menu-button"]')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) : null
  const reveal = li?.querySelector('[data-sidebar="menu-inline-actions"]')
  return {
    tag: a.tagName.toLowerCase(), kind, label, rowLabel,
    menuIndex: menu ? menus.indexOf(menu) : -1,
    inSidebar: !!a.closest('[data-sidebar="sidebar"]'),
    ariaCurrent: a.getAttribute('aria-current'),
    revealOpacity: reveal ? getComputedStyle(reveal).opacity : null,
  }
}

const RENDERED_MENUS = () => {
  const menus = [...document.querySelectorAll('ul[data-sidebar="menu"]')]
  return menus.map((m, i) => ({ index: i, rendered: m.getClientRects().length > 0, inSidebar: !!m.closest('[data-sidebar="sidebar"]'),
    firstLabel: (m.querySelector('[data-sidebar="menu-button"]')?.getAttribute('aria-label') || m.querySelector('[data-sidebar="menu-button"]')?.textContent || '').trim().slice(0, 30) }))
}

async function active(page) { return page.evaluate(DESCRIBE_ACTIVE) }
async function press(page, key) { await page.keyboard.press(key); return active(page) }

/**
 * 把「下一次 Tab 從哪裡開始」放回文件最前面。只 blur() 不夠:瀏覽器會記住上一次的循序焦點起點,
 * blur 之後按 Tab 是從剛才那顆往後走(scratch 探針實際踩到:收合後第一下 Tab 直接跑到側欄後面)。
 * 做法:在 body 最前面放一顆 tabindex=-1 的哨兵並聚焦它 —— 它自己不在 Tab 路上,Tab 會走到它後面的第一站。
 */
export async function focusDocumentStart(page) {
  await page.evaluate(() => {
    let s = document.getElementById('__sidebar_kbd_start')
    if (!s) { s = document.createElement('span'); s.id = '__sidebar_kbd_start'; s.tabIndex = -1; document.body.prepend(s) }
    s.focus()
  })
}

/**
 * 從頁首一路 Tab,收集「落在 scope 裡」的停靠點,直到離開 scope。scope = 側欄容器,沒有側欄容器的 story 用整串 menu。
 * 回傳 stops(依序)與 leftTo(離開後落在哪)。
 */
export async function walkStops(page, { scopeSelector = '[data-sidebar="sidebar"]', max = 80 } = {}) {
  await focusDocumentStart(page)
  const stops = []
  let entered = false
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const d = await page.evaluate((sel) => {
      const a = document.activeElement
      return { inScope: !!(a && a !== document.body && a.closest(sel)) }
    }, scopeSelector)
    const desc = await active(page)
    if (d.inScope) { entered = true; stops.push(desc); continue }
    if (entered) return { stops, leftTo: desc }
  }
  return { stops, leftTo: null, exhausted: true }
}

/**
 * 在已渲染好的頁面上跑全部檢查。`story` 決定跑哪幾條(mixed / iconCollapse / actionHover / appShell)。
 * 回傳 { results: [{ ok, id, msg }], metrics }。
 */
export async function runSidebarKeyboardChecks(page, story) {
  const results = []
  const metrics = {}
  const rec = (ok, id, msg) => results.push({ ok: !!ok, id, msg })

  const scopeSelector = story === 'actionHover' ? 'ul[data-sidebar="menu"]' : '[data-sidebar="sidebar"]'
  const walk = await walkStops(page, { scopeSelector })
  const menus = await page.evaluate(RENDERED_MENUS)
  const scopedMenus = menus.filter((m) => m.rendered && (story === 'actionHover' || m.inSidebar))
  metrics.stops = walk.stops.length
  metrics.path = walk.stops.map((s) => `${s.kind}:${s.label}`)
  rec(!walk.exhausted && walk.stops.length > 0, 'S1', `${story}:從頁首 Tab 進得去也出得來(停靠點 ${walk.stops.length} 個,離開後落在 ${walk.leftTo?.label ?? walk.leftTo?.tag ?? '?'})`)
  rec(!walk.stops.some((s) => s.kind === 'viewport'), 'S1', `${story}:捲動區 viewport 不是停靠點(路徑:${metrics.path.join(' → ')})`)
  rec(!walk.stops.some((s) => s.kind === 'action'), 'S1', `${story}:列上的動作鈕不在 Tab 路上`)
  // 取樣不得為空:一串都沒量到時,下面的「每串剛好一站」會變成零條斷言的假綠(M37「沒量到 ≠ 通過」)
  rec(scopedMenus.length > 0, 'S1', `${story}:量到 ${scopedMenus.length} 串看得見的 SidebarMenu(需 ≥ 1)`)
  for (const m of scopedMenus) {
    const n = walk.stops.filter((s) => s.menuIndex === m.index).length
    rec(n === 1, 'S1', `${story}:第 ${m.index} 串(首項「${m.firstLabel}」)在 Tab 路上 ${n} 站(需剛好 1)`)
  }

  if (story === 'iconCollapse') {
    const first = walk.stops.find((s) => s.kind === 'row')
    rec(first?.ariaCurrent === 'page', 'S7', `iconCollapse:Tab 進主導覽落在當前頁(實得「${first?.label}」aria-current=${first?.ariaCurrent})`)
  }

  if (story === 'actionHover') {
    // 回到那一列:Tab 進來
    await focusDocumentStart(page)
    let d = await press(page, 'Tab')
    for (let i = 0; i < 10 && d.kind !== 'row'; i++) d = await press(page, 'Tab')
    rec(d.kind === 'row', 'S3', `actionHover:Tab 進到列(實得 ${d.kind}「${d.label}」)`)
    d = await press(page, 'ArrowRight')
    rec(d.kind === 'action' && /更多/.test(d.label), 'S3', `actionHover:→ 進 SidebarMenuAction(實得 ${d.kind}「${d.label}」)`)
    d = await press(page, 'ArrowLeft')
    rec(d.kind === 'row', 'S3', `actionHover:← 回到列(實得 ${d.kind}「${d.label}」)`)
  }

  if (story === 'mixed') {
    // 找「我的最愛」那一串:Tab 走到首項是 alpha 的那一串
    await focusDocumentStart(page)
    let d = { kind: 'none' }
    for (let i = 0; i < 20; i++) { d = await press(page, 'Tab'); if (d.kind === 'row' && d.rowLabel === 'alpha') break }
    rec(d.rowLabel === 'alpha', 'S5', `mixed:Tab 進「我的最愛」落在第一項 alpha(實得「${d.label}」)`)
    const favIndex = d.menuIndex
    const revealed = await page.waitForFunction(() => {
      const li = document.activeElement?.closest('li'); const r = li?.querySelector('[data-sidebar="menu-inline-actions"]')
      return r && getComputedStyle(r).opacity === '1'
    }, null, { timeout: 2000 }).then(() => true, () => false)
    rec(revealed, 'S6', 'mixed:焦點在 alpha 列 → 它的滑過才出現鈕 opacity 1')

    d = await press(page, 'ArrowRight')
    rec(d.kind === 'action' && d.label === '更多動作' && d.rowLabel === 'alpha', 'S3', `mixed:→ 進 alpha 的第一顆動作鈕「更多動作」(實得 ${d.kind}「${d.label}」/列「${d.rowLabel}」)`)
    const revealedOnAction = await page.waitForFunction(() => {
      const li = document.activeElement?.closest('li'); const r = li?.querySelector('[data-sidebar="menu-inline-actions"]')
      return r && getComputedStyle(r).opacity === '1'
    }, null, { timeout: 2000 }).then(() => true, () => false)
    rec(revealedOnAction, 'S6', 'mixed:焦點在動作鈕上 → 同列的滑過才出現鈕仍 opacity 1')
    d = await press(page, 'ArrowRight')
    rec(d.label === '新增' && d.rowLabel === 'alpha', 'S3', `mixed:再 → 到「新增」(實得「${d.label}」)`)
    d = await press(page, 'ArrowRight')
    rec(d.label === '新增' && d.rowLabel === 'alpha', 'S3', `mixed:最後一顆再 → 停住(實得「${d.label}」)`)
    d = await press(page, 'ArrowLeft')
    rec(d.label === '更多動作', 'S3', `mixed:← 回上一顆「更多動作」(實得「${d.label}」)`)
    d = await press(page, 'ArrowLeft')
    rec(d.kind === 'row' && d.rowLabel === 'alpha', 'S3', `mixed:第一顆 ← 回到列 alpha(實得 ${d.kind}「${d.label}」)`)

    d = await press(page, 'ArrowDown')
    rec(d.kind === 'row' && d.rowLabel === 'beta', 'S2', `mixed:↓ → beta(實得「${d.label}」)`)
    d = await press(page, 'ArrowDown')
    rec(d.rowLabel === 'gamma', 'S2', `mixed:↓ → gamma(實得「${d.label}」)`)
    d = await press(page, 'ArrowDown')
    rec(d.rowLabel === 'gamma', 'S2', `mixed:最後一個可用項再 ↓ 停住(delta 已封存 = disabled 被跳過、不繞回;實得「${d.label}」)`)
    d = await press(page, 'Home')
    rec(d.rowLabel === 'alpha', 'S2', `mixed:Home → alpha(實得「${d.label}」)`)
    d = await press(page, 'ArrowUp')
    rec(d.rowLabel === 'alpha', 'S2', `mixed:第一項再 ↑ 停住(實得「${d.label}」)`)
    d = await press(page, 'End')
    rec(d.rowLabel === 'gamma', 'S2', `mixed:End → gamma(實得「${d.label}」)`)
    d = await press(page, 'ArrowUp')
    rec(d.rowLabel === 'beta', 'S2', `mixed:↑ → beta(實得「${d.label}」)`)

    d = await press(page, 'ArrowRight')
    d = await press(page, 'ArrowDown')
    rec(d.kind === 'row' && d.rowLabel === 'gamma', 'S4', `mixed:beta 的動作鈕上 ↓ → gamma 列(實得 ${d.kind}「${d.label}」)`)
    d = await press(page, 'ArrowRight')
    d = await press(page, 'ArrowUp')
    rec(d.kind === 'row' && d.rowLabel === 'beta', 'S4', `mixed:gamma 的動作鈕上 ↑ → beta 列(實得 ${d.kind}「${d.label}」)`)

    // S5:從動作鈕 Tab 一下離開這一串;Shift+Tab 回來落在上次那一項(beta)
    d = await press(page, 'ArrowRight')
    d = await press(page, 'Tab')
    rec(d.menuIndex !== favIndex, 'S5', `mixed:動作鈕上 Tab 一下離開「我的最愛」(落在「${d.label}」)`)
    d = await press(page, 'Shift+Tab')
    rec(d.menuIndex === favIndex && d.kind === 'row' && d.rowLabel === 'beta', 'S5', `mixed:Shift+Tab 回來落在上次那一項 beta(實得 ${d.kind}「${d.label}」)`)
    d = await press(page, 'ArrowRight')
    d = await press(page, 'Shift+Tab')
    rec(d.menuIndex !== favIndex, 'S5', `mixed:動作鈕上 Shift+Tab 一下往前離開「我的最愛」(落在「${d.label}」)`)
    d = await press(page, 'Tab')
    rec(d.menuIndex === favIndex && d.rowLabel === 'beta', 'S5', `mixed:再 Tab 回來仍是 beta(實得「${d.label}」)`)
    d = await press(page, 'Tab')
    rec(d.menuIndex !== favIndex, 'S5', `mixed:列上 Tab 一下離開「我的最愛」(落在「${d.label}」)`)

    // S8:帳號列 = DropdownMenuTrigger asChild。上一步 Tab 離開「我的最愛」後正好落在它(若不是,走到它為止)
    for (let i = 0; i < 5 && d.label !== '帳號與設定'; i++) d = await press(page, 'Tab')
    if (d.label !== '帳號與設定') rec(false, 'S8', `mixed:走不到帳號列(實得「${d.label}」)`)
    else {
      d = await press(page, 'ArrowDown')
      await page.waitForTimeout(400)
      const menusAfterDown = await page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].filter((m) => m.getClientRects().length > 0).length)
      rec(menusAfterDown === 0 && d.label === '帳號與設定', 'S8', `mixed:帳號列上 ↓ 不開選單、焦點不動(開著的選單 ${menusAfterDown} 個,焦點「${d.label}」)`)
      await page.keyboard.press('Enter')
      const opened = await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 3000 }).then(() => true, () => false)
      rec(opened, 'S8', 'mixed:帳號列上 Enter 開得了選單(同一個觀測器看得到選單)')
      await page.keyboard.press('Escape')
      await page.waitForSelector('[role="menu"]', { state: 'detached', timeout: 3000 }).catch(() => {})
    }

    // S9(指標):兩顆動作鈕之間的空隙歸列 —— 滑過時列亮著,點下去就要導覽(待辦總帳 N53 ①,2026-09-26;
    // sidebar.spec.md「Inline actions」、hit-area-canonical.md「看到亮起來卻點不到」)。對照點:空隙旁 1px 進到按鈕的懸停底色裡 = 按鈕自己。
    const gap = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-sidebar="menu-button"]')].find((b) => b.textContent?.trim() === 'alpha')
      const li = btn?.closest('li')
      const acts = li ? [...li.querySelectorAll('[data-sidebar="menu-inline-actions"] button')] : []
      if (!btn || acts.length < 2) return null
      const a = acts[0].getBoundingClientRect(); const b = acts[1].getBoundingClientRect()
      return { x: (a.right + b.left) / 2, y: (a.top + a.bottom) / 2, inBtnX: a.right, gapWidth: b.left - a.right }
    })
    if (!gap || !(gap.gapWidth > 2)) rec(false, 'S9', `mixed:量不到 alpha 兩顆動作鈕之間的空隙(${JSON.stringify(gap)})—— 儀器失效,不是通過`)
    else {
      await page.mouse.move(gap.x, gap.y)
      const hit = await page.evaluate(({ x, y, inBtnX }) => {
        const who = (el) => el?.closest('[data-sidebar="menu-inline-actions"] button') ? `action:${el.closest('button').getAttribute('aria-label')}`
          : el?.closest('[data-sidebar="menu-button"]') ? `row:${el.closest('[data-sidebar="menu-button"]').textContent.trim()}` : `other:${el?.tagName}`
        return { gap: who(document.elementFromPoint(x, y)), control: who(document.elementFromPoint(inBtnX, y)) }
      }, gap)
      await page.mouse.click(gap.x, gap.y)
      const active = await page.evaluate(() => [...document.querySelectorAll('[data-sidebar="menu-button"]')].find((b) => b.textContent?.trim() === 'alpha')?.getAttribute('aria-current'))
      rec(hit.gap === 'row:alpha' && hit.control === 'action:更多動作' && active === 'page', 'S9',
        `mixed:alpha 兩顆動作鈕之間的空隙點下去 = 列(命中 ${hit.gap};對照點按鈕底色內 → ${hit.control};點後 aria-current=${active})`)
      await page.mouse.move(0, 0)
    }
  }
  return { results, metrics }
}

// ── CLI:從 storybook 建置開 story 跑 ──
async function main() {
  const { startA11yStaticServer } = await import('./lib/a11y-static-server.mjs')
  const { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireStorybookBuild, StoryRenderInstrumentError } = await import('./lib/launch-browser.mjs')
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
  const SELFTEST = process.argv.includes('--selftest')
  const root = path.resolve(REPO, arg('static', 'storybook-static'))
  // 沒有建置 = 缺前置(MISSING-BUILD,exit 2),gate-meta lane 的拋棄式快照裡本來就沒有;不是產品裁決
  requireStorybookBuild(path.join(root, 'index.json'), '先 build storybook(或用 --static=<dir> 指定)')
  const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
  process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })).newPage()
  const all = []
  const instrumentFails = []
  for (const [story, id] of Object.entries({ mixed: STORY_IDS.mixed, iconCollapse: STORY_IDS.iconCollapse, actionHover: STORY_IDS.actionHover, appShell: STORY_IDS.appShellPrimarySidebar })) {
    try {
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
        waitFor: 'ul[data-sidebar="menu"] [data-sidebar="menu-button"]', settleFrames: 5, navigationTimeoutMs: 90000, notFound: server.notFound,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.log(`✗ ${error.message}`)
      instrumentFails.push(id)
      continue
    }
    if (SELFTEST) await page.evaluate(SABOTAGE)
    const { results, metrics } = await runSidebarKeyboardChecks(page, story)
    console.log(`· ${story}:停靠點 ${metrics.stops} 個 —— ${metrics.path.join(' → ')}`)
    all.push(...results)
  }
  await browser.close(); await server.stop()
  if (instrumentFails.length) {
    console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 則 story 沒量到(${instrumentFails.join(', ')})—— 不是產品裁決,本次不判定${SELFTEST ? ',也不能宣稱對照組紅得對' : ''}`)
    process.exit(1)
  }
  let failed = 0
  for (const r of all) { console.log(`${r.ok ? '✓' : '✗'} ${r.id} ${r.msg}`); if (!r.ok) failed++ }
  if (SELFTEST) {
    const red = new Set(all.filter((r) => !r.ok).map((r) => r.id))
    const ok = ['S1', 'S2', 'S3', 'S9'].every((id) => red.has(id))
    console.log(ok ? `✓ selftest:對照組讓 S1/S2/S3/S9 都紅(共 ${failed} 條),量具會紅` : `✗ selftest:對照組沒讓 S1/S2/S3/S9 全紅(紅了:${[...red].join(',') || '無'})—— 量具無效`)
    process.exit(ok ? 0 : 1)
  }
  console.log(failed ? `✗ sidebar-menu-keyboard-invariant ${failed} 條失敗` : `✅ sidebar-menu-keyboard-invariant PASS(${all.length} 條)`)
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main()
