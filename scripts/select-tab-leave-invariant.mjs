#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 下拉開著時按 Tab / Shift+Tab 的走法等於 select-menu.spec.md「A11y 預設」寫的那一條(來源 = 待辦總帳
 *        governance/planning/2026-09-25-interaction-and-hover-remediation.md B11):
 *        (S) 單選(Select 不可打字 / 可打字、PeoplePicker 單選、放在對話框型面板裡的 Select):選定反白那一項 + 收起 +
 *            焦點落在「選單關著時從觸發欄位按同一個鍵會到的那一格」,800ms 後焦點沒被搶回觸發欄位;
 *            觸發欄位在對話框型面板裡時,那個面板不得被一起關掉、焦點留在面板裡;
 *        (M) 多選(焦點會進到面板的那幾種):開著按 Shift+Tab / Tab 焦點留在面板裡、面板不關;
 *        (D) 觸發欄位宣告的彈出型別 = Tab 的走法:Tab 收起往下走 → listbox(或不寫,combobox 隱含 listbox);
 *            Tab 在面板裡繞圈 → dialog(W3C combobox-pattern.html#L410-L411)。
 *   紅: 任一條不符 → 逐則點名 exit 1。`--selftest` 注入兩種已知的舊行為,三條都必須紅才算量具有效(抓到 = exit 0):
 *        在 window 捕獲階段把 Tab 的 keydown 整個攔掉(元件的 handler 收不到 = 回到 2026-09-25 前的瀏覽器預設走法)→ (S)(M) 必紅;
 *        把多選觸發欄位的 aria-haspopup 改回 listbox(= 修正前的宣告)→ (D) 必紅。
 *   綠: 全部 case 都量到且符合。story 開不起來 / 找不到觸發欄位 / 開不了浮層 = 儀器失效(INSTRUMENT-FAIL,exit 1),
 *        不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-09-25 新增。修正前的建置跑這支是紅的(當天實測:不可打字 Tab 落到 BODY、Shift+Tab 留在浮層、可打字不選定、
 *        PeoplePicker 單選 Shift+Tab 停在觸發欄位且浮層不關、多選從程式落點 Shift+Tab 跳到頁尾並關掉面板、多選宣告 listbox)
 *        —— 那就是它的天然對照組。
 *        oracle 刻意不寫死「下一格是誰」:開著按完、選定生效之後,再從觸發欄位(這時關著)按同一個鍵,兩次必須落在同一格。
 *        選定可能改變觸發欄位後面的 DOM(例:篩選列換了欄位就長出運算子欄),所以比的是「選定之後」的頁面順序;
 *        清除鈕、對話框邊緣繞回、頁面順序怎麼排都不用這支閘知道。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
// 關閉動畫 + Radix「關閉後把焦點還給觸發欄位」(FocusScope 卸載的 setTimeout 0)都跑完才量落點;
// 沒擋掉那一步的話,焦點會在這段時間內被搶回觸發欄位 —— 量得太早會把搶焦點的 bug 量成綠燈。
const AFTER_KEY_MS = 800
// 開啟浮層後等進場與 cmdk 初始反白(layout effect)落定
const AFTER_OPEN_MS = 350
// 點開外層面板(篩選浮層)後等它進場、焦點落定
const AFTER_PANEL_MS = 500

requireStorybookBuild(join(BUILD, 'index.json'))

const story = (slug) => `design-system-components-${slug}`
// 單選:取 scope 內第一個可編輯的觸發欄位(data-field-mode="edit"),Tab 與 Shift+Tab 各跑一趟(每趟重開 story,互不污染)。
// `panel`:先點開一個對話框型浮層,觸發欄位在它裡面 —— 驗「外層面板正被本浮層暫停 Tab 繞圈」那條路(select-menu-keyboard.ts 檔頭 (b))。
const SINGLE = [
  { name: 'Select 不可打字', id: story('select-展示--modes') },
  // 同一支再跑一次「開了不動方向鍵就按」:焦點停在開啟時的程式落點(cmdk 殼)—— R15 量到 Shift+Tab 跳頁尾的正是這一格
  { name: 'Select 不可打字(開了直接按)', id: story('select-展示--modes'), noMove: true },
  { name: 'Select 可打字', id: story('select-展示--searchable') },
  { name: 'PeoplePicker 單選', id: story('peoplepicker-展示--single') },
  { name: 'DataTable 篩選浮層裡的欄位 Select', id: story('datatable-展示--with-bulk-actions'), panel: 'button[aria-label="篩選"]' },
]
// 多選:每支 story 的每一個可編輯觸發欄位都驗(D);焦點進到面板的那幾個再驗(M)
const MULTI = [
  { name: 'Combobox 多選', id: story('combobox-展示--modes') },
  { name: 'Combobox 可搜尋(浮層內 / 欄位內)', id: story('combobox-展示--searchable') },
  { name: 'PeoplePicker 多選', id: story('peoplepicker-展示--multi') },
]

// ── 頁面內的量測函式 ─────────────────────────────────────────────────────────────────────
// 以 addInitScript 在每份新文件裝一次 `window.__tabgate`(Playwright 傳的是函式原始碼,不做字串求值),
// 之後各步 page.evaluate 只呼叫它 —— 同一組判準只有一份,不在每個 evaluate 裡各抄一次。
const INSTALL_PROBES = () => {
  const describe = (el) => {
    if (!el) return 'null'
    if (el === document.body) return 'BODY'
    const role = el.getAttribute('role')
    const name = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24)
    return `${el.tagName.toLowerCase()}${role ? `[${role}]` : ''}${el.id ? `#${el.id}` : ''}「${name}」`
  }
  // 開著的下拉浮層 = 裝著 cmdk 根的那個 popper(SelectMenu 的身分證是 cmdk 根,同 select-all-footer-invariant 的判準)
  const popup = () => {
    const root = [...document.querySelectorAll('[data-radix-popper-content-wrapper] [cmdk-root]')].find((r) => r.getClientRects().length > 0)
    return root ? root.closest('[data-radix-popper-content-wrapper]') : null
  }
  const trigger = () => document.querySelector('[data-tabgate="trigger"]')
  const panel = () => document.querySelector('[data-tabgate="panel"]')
  // 落點的身分:元素本身帶記號,或「在不在觸發欄位內 + 描述」相同 —— 觸發欄位內的東西(清除鈕、已選人員的頭像)
  // 會在開關選單時被 React 重新掛上,記號跟著消失,只比元素本身會把同一格量成「不同格」(2026-09-25 首跑踩到)
  const keyOf = (el) => `${trigger()?.contains(el) ? 'T' : 'P'}:${describe(el)}`
  // Select 的已選值鏡射在觸發欄位內的隱藏 input(select.tsx hiddenInputEl:aria-hidden + tabIndex -1)
  const value = (t) => { const m = t?.querySelector('input[aria-hidden="true"][tabindex="-1"]'); return m ? m.value.trim() : null }
  window.__tabgate = {
    // 頁首 / 頁尾哨兵:story 裡觸發欄位常是唯一可 Tab 的東西,沒有哨兵時按 Tab 會落到瀏覽器外(BODY),量不到落點
    addSentinels() {
      const root = document.querySelector('#storybook-root')
      if (!root || root.querySelector('[data-tabgate-sentinel]')) return
      const mk = (where) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = `哨兵-${where}`
        b.setAttribute('data-tabgate-sentinel', where)
        return b
      }
      root.prepend(mk('before'))
      root.append(mk('after'))
    },
    // 對話框型外層面板 = 最後一個開著、且不是下拉浮層的 role=dialog
    markPanel() {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].filter((d) => !d.querySelector('[cmdk-root]') && d.getClientRects().length > 0).at(-1)
      if (!dlg) return false
      dlg.setAttribute('data-tabgate', 'panel')
      return true
    },
    markTrigger([index, inPanel]) {
      const scope = inPanel ? panel() : document.querySelector('#storybook-root')
      const list = scope ? [...scope.querySelectorAll('[role="combobox"][data-field-mode="edit"]')]
        .filter((el) => el.tabIndex >= 0 && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0) : []
      for (const el of document.querySelectorAll('[data-tabgate="trigger"]')) el.removeAttribute('data-tabgate')
      const t = list[index]
      if (!t) return { count: list.length, ok: false }
      t.setAttribute('data-tabgate', 'trigger')
      return { count: list.length, ok: true }
    },
    focusTrigger() { const t = trigger(); t?.focus(); return !!t && document.activeElement === t },
    markLanded() {
      for (const el of document.querySelectorAll('[data-tabgate-expect]')) el.removeAttribute('data-tabgate-expect')
      const a = document.activeElement
      window.__tabgateExpectedKey = null
      if (!a || a === document.body) return { ok: false, desc: describe(a) }
      a.setAttribute('data-tabgate-expect', '')
      window.__tabgateExpectedKey = keyOf(a)
      return { ok: true, desc: describe(a) }
    },
    read() {
      const p = popup(); const t = trigger(); const pn = panel(); const a = document.activeElement
      const hi = p?.querySelector('[cmdk-item][data-selected="true"]')
      return {
        open: !!p,
        focusInPopup: !!p && p.contains(a),
        focusInTrigger: !!t && t.contains(a),
        landedOnTrigger: !!t && a === t,
        sameAsMarked: !!a && a !== document.body && (a.hasAttribute('data-tabgate-expect') || keyOf(a) === window.__tabgateExpectedKey),
        active: describe(a),
        value: value(t),
        highlighted: hi ? hi.getAttribute('data-value') : null,
        highlightedDisabled: hi?.getAttribute('data-disabled') === 'true',
        haspopup: t?.getAttribute('aria-haspopup') ?? null,
        panelOpen: !!pn && pn.isConnected && pn.getAttribute('data-state') !== 'closed',
        focusInPanel: !!pn && pn.contains(a),
      }
    },
  }
}

// ── 對照組:注入修正前的行為 ───────────────────────────────────────────────────────────
const INJECT_OLD_TAB = () => {
  // 捕獲階段最先執行:Tab 的 keydown 到不了 React root,元件的 handler 全部收不到 = 瀏覽器預設走法
  window.addEventListener('keydown', (e) => { if (e.key === 'Tab') e.stopImmediatePropagation() }, true)
}
const INJECT_OLD_DECLARATION = () => {
  for (const t of document.querySelectorAll('#storybook-root [role="combobox"][aria-haspopup="dialog"]')) t.setAttribute('aria-haspopup', 'listbox')
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.addInitScript(INSTALL_PROBES)
if (SELFTEST) await page.addInitScript(INJECT_OLD_TAB)
const probe = (method, arg) => page.evaluate(([m, a]) => window.__tabgate[m](a), [method, arg ?? null])

const bad = [] // { family: 'S'|'M'|'D', where, 問題, 細節 }
const instrumentFailures = []
const measured = { S: 0, M: 0, D: 0, panel: 0 }

async function load(s) {
  await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, {
    settleFrames: 6, notFound: server.notFound, navigationTimeoutMs: 30_000, timeoutMs: 30_000,
    waitFor: s.panel ?? '#storybook-root [role="combobox"][data-field-mode="edit"]',
  })
  await probe('addSentinels')
  await page.mouse.move(2, 2) // 指標移開:反白只由鍵盤搬
  if (s.panel) {
    await page.click(s.panel)
    await page.waitForTimeout(AFTER_PANEL_MS) // 等外層面板進場、焦點落定
    if (!(await probe('markPanel'))) throw new Error(`點了 ${s.panel} 卻沒有開出對話框型面板`)
    await page.mouse.move(2, 2) // 同上
  }
}
const popupOpen = async () => (await probe('read')).open

async function openTrigger() {
  if (!(await probe('focusTrigger'))) return false
  await page.keyboard.press('Enter')
  await page.waitForTimeout(AFTER_OPEN_MS) // 等浮層進場與 cmdk 初始反白落定
  if (await popupOpen()) return true
  await page.keyboard.press('ArrowDown') // 有的觸發欄位 Enter 被別的 handler 用掉 → 用 APG 展開鍵再試一次
  await page.waitForTimeout(AFTER_OPEN_MS) // 同上
  return popupOpen()
}
const recordInstrument = (where, error) => instrumentFailures.push({
  where, detail: error instanceof StoryRenderInstrumentError ? error.detail : String(error?.message || error).split('\n')[0],
})

try {
  // ── (S) 單選 ──
  for (const s of SINGLE) {
    for (const key of ['Tab', 'Shift+Tab']) {
      const where = `${s.name}(${s.id})按 ${key}`
      try {
        await load(s)
        const m = await probe('markTrigger', [0, !!s.panel])
        if (!m.ok) throw new Error('找不到可編輯的觸發欄位')
        // 1. 開選單,把反白搬到「不是目前值」的那一項(才看得出有沒有選定)
        if (!(await openTrigger())) throw new Error('鍵盤開不了浮層')
        let before = await probe('read')
        if (s.noMove) {
          // 不動反白:落在已選項(cmdk defaultValue)或第一項;按下去之後的值必須等於這一項
          if (before.highlighted == null) throw new Error('開啟後沒有任何反白項')
        } else {
          await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120) // 等 cmdk 反白移動
          before = await probe('read')
          if (before.highlighted == null || before.highlighted === before.value) {
            await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(120) // 同上
            before = await probe('read')
          }
          if (before.highlighted == null || before.highlighted === before.value || before.highlightedDisabled) {
            throw new Error(`反白搬不到另一個可選項(反白=${before.highlighted} 目前值=${before.value})`)
          }
        }
        // 2. 開著按鍵
        await page.keyboard.press(key)
        await page.waitForTimeout(AFTER_KEY_MS)
        const after = await probe('read')
        const landed = await probe('markLanded')
        // 3. oracle:選定生效後,從觸發欄位(這時關著)按同一個鍵,必須落在同一格
        let oracle = { active: '(沒量:觸發欄位拿不到焦點)', sameAsMarked: false }
        if (await probe('focusTrigger')) {
          await page.keyboard.press(key)
          await page.waitForTimeout(150) // 等焦點移動與可能的 tooltip 開關
          oracle = await probe('read')
        }
        measured.S += 1
        const 細節 = { 開著按的落點: after.active, 關著按的落點: oracle.active, 反白: before.highlighted, 之前的值: before.value, 之後的值: after.value, 浮層還開著: after.open }
        if (after.landedOnTrigger) bad.push({ family: 'S', where, 問題: '焦點停在 / 被搶回觸發欄位(應走到下一格)', 細節 })
        else if (!landed.ok) bad.push({ family: 'S', where, 問題: `焦點落到 ${landed.desc}(離開了頁面)`, 細節 })
        else if (!oracle.sameAsMarked) bad.push({ family: 'S', where, 問題: `焦點沒落在「關著時從觸發欄位按 ${key} 會到的那一格」`, 細節 })
        if (after.open) bad.push({ family: 'S', where, 問題: '浮層沒收起', 細節 })
        if (after.value !== before.highlighted) bad.push({ family: 'S', where, 問題: '沒有選定反白那一項', 細節 })
        if (s.panel) {
          measured.panel += 1
          if (!after.panelOpen) bad.push({ family: 'S', where, 問題: '外層對話框型面板被一起關掉了', 細節 })
          else if (!after.focusInPanel) bad.push({ family: 'S', where, 問題: '焦點跑出外層對話框型面板(那一層的 Tab 應留在裡面)', 細節 })
        }
        // (D) 單選:Tab 收起往下走 → 宣告 listbox(或不寫)
        measured.D += 1
        if (after.haspopup !== null && after.haspopup !== 'listbox') {
          bad.push({ family: 'D', where, 問題: `Tab 收起往下走,觸發欄位卻宣告 aria-haspopup="${after.haspopup}"`, 細節 })
        }
      } catch (error) {
        recordInstrument(where, error)
      }
    }
  }

  // ── (M)(D) 多選 ──
  for (const s of MULTI) {
    const where0 = `${s.name}(${s.id})`
    try {
      await load(s)
      const { count } = await probe('markTrigger', [0, false])
      if (!count) throw new Error('找不到可編輯的觸發欄位')
      for (let i = 0; i < count; i += 1) {
        const where = `${where0} 第 ${i + 1} 個觸發欄位`
        if (i > 0) await load(s) // 每個觸發欄位重開 story,互不污染
        await probe('markTrigger', [i, false])
        if (SELFTEST) await page.evaluate(INJECT_OLD_DECLARATION)
        if (!(await openTrigger())) { instrumentFailures.push({ where, detail: '鍵盤開不了浮層' }); continue }
        const opened = await probe('read')
        measured.D += 1
        if (opened.focusInPopup) {
          // 焦點進到面板 = 對話框型:宣告必須是 dialog;Tab / Shift+Tab 留在面板裡(先從開啟時的程式落點按 Shift+Tab —— 舊 bug 就在這一格)
          if (opened.haspopup !== 'dialog') bad.push({ family: 'D', where, 問題: `焦點進到面板、Tab 在面板裡繞圈,觸發欄位卻宣告 aria-haspopup="${opened.haspopup}"`, 細節: opened })
          const trail = []
          for (const k of ['Shift+Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
            await page.keyboard.press(k)
            await page.waitForTimeout(150) // 等焦點移動(不等關閉動畫:面板本來就不該關)
            const r = await probe('read')
            trail.push(`${k}→${r.active}${r.open ? '' : '(面板已關)'}`)
            if (!r.open || !r.focusInPopup) {
              bad.push({ family: 'M', where, 問題: `多選面板開著按 ${k} 焦點離開了面板(應在面板裡繞圈)`, 細節: { 路徑: trail } })
              break
            }
          }
          measured.M += 1
        } else if (opened.focusInTrigger) {
          // 焦點留在觸發欄位(searchIn='trigger')= 清單型:宣告 listbox(或不寫)
          if (opened.haspopup !== null && opened.haspopup !== 'listbox') bad.push({ family: 'D', where, 問題: `焦點留在觸發欄位(清單型),卻宣告 aria-haspopup="${opened.haspopup}"`, 細節: opened })
        } else {
          instrumentFailures.push({ where, detail: '開啟後焦點既不在面板也不在觸發欄位 —— 量不出是哪一型' })
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(200) // 等關閉動畫,不擋下一個觸發欄位
      }
    } catch (error) {
      recordInstrument(where0, error)
    }
  }
} finally {
  await page.close().catch(() => null)
  await browser.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

console.log(`量到:單選 ${measured.S} 趟(其中在對話框型面板裡 ${measured.panel} 趟)/ 多選面板 ${measured.M} 個 / 宣告 ${measured.D} 個`)
for (const b of bad) {
  console.log(`  ✗ [${b.family}] ${b.where} — ${b.問題}`)
  console.log(`      ${JSON.stringify(b.細節)}`)
}
// 儀器失效優先於任何裁決:沒量到的不能讀成「符合」,也不能讀成「對照組抓到了」
if (instrumentFailures.length) {
  console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFailures.length} 處沒量到 —— 不是產品裁決,但這一趟不能算通過:`)
  for (const f of instrumentFailures) console.error(`  - ${f.where}:${f.detail}`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  process.exit(1)
}
if (SELFTEST) {
  const caught = ['S', 'M', 'D'].filter((f) => bad.some((b) => b.family === f))
  if (caught.length === 3) { console.log('\n✓ selftest:注入舊行為後 (S)(M)(D) 三條都紅了,量具會紅'); process.exit(0) }
  console.log(`\n✗ selftest:注入舊行為後只有 ${caught.join('/') || '0 條'} 紅了 —— 其餘那幾條是假綠,不能當證據`)
  process.exit(1)
}
if (measured.S === 0 || measured.M === 0 || measured.D === 0 || measured.panel === 0) {
  console.log('\n✗ 有一整類一次都沒量到 —— 這支等於沒跑那一類,不能當綠燈')
  process.exit(1)
}
if (bad.length) process.exit(1)
console.log('\n✓ 單選開著按 Tab / Shift+Tab = 選定 + 收起 + 落在關著時的同一格(外層面板不被關);多選面板 Tab 留在裡面;宣告與走法一致')
process.exit(0)
