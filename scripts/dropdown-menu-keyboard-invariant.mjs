#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 選單開著時真按鍵的結果符合待辦總帳 B10 / B11 —— 子選單 Esc 每按一次只少一層、焦點回上一層打開它的那一項;
 *         按 Tab / Shift+Tab 收起全部層、焦點落在「選單關著時在觸發鈕上按同一鍵」的落點;AI 浮鈕選單只有 Esc 把焦點還給浮鈕、點外面不搶
 *   紅: --selftest 以 capture 監聽把 Radix 舊行為造回來(Tab 被吞、Esc 一次全關、點外面後搶回浮鈕),每個情境(E / Q / T / S / F1–F3)都必須判紅;
 *       story 開不起來或層數 / 焦點量不到 = INSTRUMENT-FAIL,不算通過也不算對照組抓到
 *   綠: 沒弄壞時必須綠;「下一站」的正確答案由瀏覽器在選單關著時實按一次得出(不由本閘自算),每個情境重開 story,
 *       層數與焦點身分以 waitForFunction 逐影格等到再判,判定式是純函式(判定表 scripts/test-dropdown-menu-keyboard-invariant.mjs,含量不到那幾格)
 *
 * 選單鍵盤不變條件(2026-09-25 user 拍板;待辦總帳 governance/planning/2026-09-25-interaction-and-hover-remediation.md B10 / B11)。
 *
 * SSOT:ds-canonical/references/keyboard-model-canonical.md「彈出框開著時的 Tab 與 Esc」+ dropdown-menu.spec.md「鍵盤操作」。
 *   B10 子選單 Esc:一次只關焦點所在的那一層,焦點回上一層打開它的那一項(= ←);每按一次少一層。
 *   B11 選單開著按 Tab / Shift+Tab:收起全部層,焦點從觸發鈕往下 / 往上走一站(= 在觸發鈕上按 Tab);
 *       AI 浮鈕的右鍵選單:只有 Esc / 選了項目才把焦點還給浮鈕,點外面不搶。
 * 舊行為(Radix 預設):子選單 Esc 一次全關;Tab 被擋掉、選單不動;浮鈕選單關閉一律搶回焦點。
 *
 * 「下一站」的正確答案**不由本閘自己算**(那會是跟元件平行的第二份實作,M37):先在選單**關著**時,
 * 在觸發鈕上按一次真的 Tab / Shift+Tab,記下瀏覽器自己走到哪 —— 那就是答案;再開選單按 Tab 比對。
 *
 * 情境(每個都重開 story;開不起來 = INSTRUMENT-FAIL,不是產品裁決,也絕不算通過):
 *   E  「多層子選單」:鍵盤開到第三層 → Esc ×3,每次等開著的層數降一層,再比對焦點(待辦 → 行動 App 改版 → 移動到 → 更多動作)
 *   Q  同上但 Esc 連按三下不等(第二、三下落在前一層的收合動畫中)→ 最後 0 層、焦點在「更多動作」
 *   T  第三層按 Tab → 0 層、焦點 = 關著時在觸發鈕上按 Tab 的落點(「分享」)
 *   S  第一層按 Shift+Tab → 0 層、焦點 = 關著時在觸發鈕上按 Shift+Tab 的落點(「指派給我」)
 *   F1 AI 浮鈕 Shift+F10 開選單:浮鈕 aria-controls = 選單 id;按 Tab → 選單關、焦點 = 關著時在浮鈕上按 Tab 的落點
 *      (浮鈕是頁面最後一站時,關著按 Tab 會離開文件 → 正本「頁面上已經沒有下一站時,焦點留在觸發點」,答案 = 浮鈕本身;judgeTabOut)
 *   F2 浮鈕選單按 Esc → 焦點回浮鈕
 *   F3 浮鈕選單開著點外面 → 選單關、焦點**不在**浮鈕上(舊版會搶回)
 * 對照組(--selftest):在頁面上掛 capture 監聽把舊行為造回來 ——
 *   Tab 被吞(= Radix 擋 Tab)、Esc 改成「點外面」(= 一次全關)、浮鈕選單**卸載後**下一個 macrotask 把焦點搶回浮鈕
 *   (= 舊 onCloseAutoFocus 的真實時序,不是閘自己睡完再 .focus())—— 每個情境都必須被判紅,儀器才算有效。
 * F3 的「沒被搶回」是負向主張(2026-09-27,M37):不睡固定 400ms,而是等卸載的證據 → 版面靜止 → 焦點連續 10 影格不動才讀。
 *
 * 用法:node scripts/dropdown-menu-keyboard-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 純判定(scripts/test-dropdown-menu-keyboard-invariant.mjs 用判定表測這幾支,含「沒量到」那幾格)──

/** 量不到(null / undefined / NaN)不是「沒發生」:一律回 'instrument',由呼叫端以儀器失效紅(M37 第八個形狀) */
const unmeasured = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))

/**
 * Esc 一步:開著的層數必須剛好少一層,焦點落在預期那一項。
 * @returns {'pass'|'fail'|'instrument'}
 */
export function judgeEscStep({ openBefore, openAfter, activeText, expectedText }) {
  if (unmeasured(openBefore) || unmeasured(openAfter) || unmeasured(activeText)) return 'instrument'
  return openAfter === openBefore - 1 && activeText === expectedText ? 'pass' : 'fail'
}

/**
 * Tab / Shift+Tab 離開:全部層都關、焦點落在「關著時在開啟者上按同一個鍵的落點」。
 * 落點本身量不到(關著時按 Tab 沒有落到任何元素)→ 儀器失效:沒有答案就不能宣稱對或錯。
 *
 * **頁面邊緣**(2026-09-26 補):關著時按同一鍵會離開整份文件(瀏覽器把焦點交給網址列,文件裡量到 'BODY')=
 * 頁面上已經沒有下一站。程式碼沒辦法把焦點交給瀏覽器外框,正本對這一格另有明文 ——
 * `ds-canonical/references/keyboard-model-canonical.md`「彈出框開著時按 Tab」:「頁面上已經沒有下一站時,焦點留在觸發點」
 *(待辦總帳 X20,user 2026-09-26 同意清單)。所以這一格的正確答案是**開啟者本身**(triggerKey),不是 'BODY';
 * 焦點掉到 body 在這一格同樣是失敗(焦點遺失)。開啟者身分量不到 → instrument。
 * 舊版本閘把 'BODY' 當答案,AI 浮鈕(頁面最後一個可聚焦元素)那格就要求「焦點遺失」,產品照正本做反而判紅。
 */
export function judgeTabOut({ openAfter, activeKey, expectedKey, triggerKey }) {
  if (unmeasured(openAfter) || unmeasured(activeKey) || unmeasured(expectedKey)) return 'instrument'
  const pageEdge = expectedKey === 'BODY'
  if (pageEdge && (unmeasured(triggerKey) || triggerKey === 'BODY')) return 'instrument'
  const want = pageEdge ? triggerKey : expectedKey
  return openAfter === 0 && activeKey === want ? 'pass' : 'fail'
}

/** 浮鈕選單關閉後焦點:Esc → 必須回浮鈕;點外面 → 必須不在浮鈕上 */
export function judgeFabReturn({ how, openAfter, focusOnFab }) {
  if (unmeasured(openAfter) || typeof focusOnFab !== 'boolean') return 'instrument'
  if (openAfter !== 0) return 'fail'
  if (how === 'escape') return focusOnFab ? 'pass' : 'fail'
  if (how === 'outside') return focusOnFab ? 'fail' : 'pass'
  throw new TypeError(`judgeFabReturn:未知的關法 ${how}`)
}

// ── 瀏覽器量測 ──
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await main()

async function main() {
  const { startA11yStaticServer } = await import('./lib/a11y-static-server.mjs')
  const { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError, waitForFocusStable } = await import('./lib/launch-browser.mjs')
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
  const SELFTEST = process.argv.includes('--selftest')
  const root = path.resolve(REPO, arg('static', 'storybook-static'))
  requireStorybookBuild(path.join(root, 'index.json'))
  // dropdown-menu-keyboard.ts / lib/focus-after-trigger.ts:2026-09-26 從 dropdown-menu.tsx 拆出的鍵盤接線與共用落點計算,只改它們時也要擋住舊建置
  for (const src of ['packages/design-system/src/components/DropdownMenu/dropdown-menu.tsx', 'packages/design-system/src/components/DropdownMenu/dropdown-menu-keyboard.ts', 'packages/design-system/src/lib/focus-after-trigger.ts', 'packages/design-system/src/components/DropdownMenu/dropdown-menu.stories.tsx', 'packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx']) {
    if (fs.statSync(path.join(REPO, src)).mtimeMs > fs.statSync(path.join(root, 'index.html')).mtimeMs) {
      console.error(`✗ STALE-BUILD:${src} 比 ${root} 新 —— 先重建該 storybook build`); process.exit(2)
    }
  }
  const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
  process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
  const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  const NESTED = 'design-system-components-dropdownmenu-展示--nested-sub-menu'
  const FAB_STORY = 'design-system-components-agentpanel-展示--fab'
  const TRIGGER = '#storybook-root button:has-text("更多動作")'
  const FAB = 'button[aria-label*="開啟智慧代理"]'
  let failed = 0
  const instrumentFails = []
  /**
   * selftest:被破壞的那幾格判定必須是 fail(舊行為被抓到);沒被破壞的格(`sabotaged: false`)照樣必須 pass(儀器沒瞎)。
   * 正式跑:每一格都必須 pass。
   */
  let sabotagedRed = 0
  const rec = (name, verdict, detail, { sabotaged = true } = {}) => {
    if (verdict === 'instrument') { instrumentFails.push({ scenario: name, detail }); console.log(`✗ ${name}:沒量到(${detail})`); return }
    const expectRed = SELFTEST && sabotaged
    const ok = expectRed ? verdict === 'fail' : verdict === 'pass'
    if (expectRed && ok) sabotagedRed++
    if (!ok) failed++
    console.log(`${ok ? '✓' : '✗'} ${name}${expectRed ? `(對照組,應判紅 → 判成 ${verdict})` : ''}| ${detail}`)
  }

  const open = (id, waitFor) => openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&demoFocus=off`, { waitFor, settleFrames: 10, notFound: server.notFound })
  const scenario = async (name, id, waitFor, body) => {
    try {
      await open(id, waitFor)
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.log(`✗ 情境 ${name}:${error.message}`)
      instrumentFails.push({ scenario: name, detail: error.detail })
      return
    }
    if (SELFTEST) await sabotage()
    try { await body() } catch (error) { rec(name, 'instrument', `量測中斷:${error.message}`) }
  }
  // 對照組:把舊行為造回來(掛在 document capture,先於 Radix 的 Esc 監聽與 React 的事件系統)
  const sabotage = () => page.evaluate(() => {
    document.addEventListener('keydown', (e) => {
      // = Radix 擋 Tab:選單開著時不動(選單關著時不破壞,「關著時按 Tab 的落點」要照樣量得到)
      if (e.key === 'Tab' && document.querySelector('[role="menu"][data-state="open"]')) { e.preventDefault(); e.stopImmediatePropagation() }
      if (e.key === 'Escape' && document.querySelectorAll('[role="menu"][data-state="open"]').length > 1) {
        e.preventDefault(); e.stopImmediatePropagation() // = 子選單 Esc 一次全關(以「點外面」造出)
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }))
      }
    }, true)
    // 浮鈕情境 F3:選單**卸載**後下一個 macrotask 把焦點搶回浮鈕(= 舊 onCloseAutoFocus 的時序:Radix 在 FocusScope 卸載後才還焦點)。
    // 2026-09-27 之前是閘自己在固定睡 400ms 之後 `.focus()` —— 那是閘替對照組動手,證明不了觀測窗蓋得住真正的時序。
    const fab = document.querySelector('button[aria-label*="開啟智慧代理"]')
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.removedNodes) {
        if (n.nodeType === 1 && (n.matches?.('[role="menu"]') || n.querySelector?.('[role="menu"]'))) setTimeout(() => fab?.focus(), 0)
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
  })

  const openCount = () => page.evaluate(() => document.querySelectorAll('[role="menu"][data-state="open"]').length)
  const activeText = () => page.evaluate(() => (document.activeElement?.textContent ?? '').trim() || null)
  /**
   * 焦點的身分:標籤 + 文字 + aria-label(用來跟「關著時按 Tab 的落點」比對)。
   * 焦點掉到 body 是**量到了**的產品結果(焦點遺失),記成 'BODY' 參與判定;null 只留給「量不到」(M37)。
   */
  const activeKey = () => page.evaluate(() => {
    const a = document.activeElement
    if (!a) return null
    if (a === document.body || a === document.documentElement) return 'BODY'
    return `${a.tagName}|${a.getAttribute('aria-label') ?? ''}|${(a.textContent ?? '').trim().slice(0, 40)}`
  })
  const waitFor = async (fn, arg, timeout = 3000) => { try { await page.waitForFunction(fn, arg, { timeout, polling: 'raf' }); return true } catch { return false } }
  const waitOpen = (n, timeout) => waitFor((k) => document.querySelectorAll('[role="menu"][data-state="open"]').length === k, n, timeout)
  const waitActive = (text) => waitFor((t) => (document.activeElement?.textContent ?? '').trim() === t, text)
  /**
   * 關著時在某元素上按一次真的 Tab / Shift+Tab,記下瀏覽器走到哪,再走回來。
   * 同時記下開啟者本身的身分(triggerKey):落點是 'BODY'(頁面邊緣)時,正本要求焦點留在開啟者(見 judgeTabOut)。
   */
  const nativeLanding = async (selector, shift) => {
    await page.locator(selector).first().focus()
    const triggerKey = await activeKey()
    await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab')
    const key = await activeKey()
    await page.locator(selector).first().focus()
    return { key, triggerKey }
  }
  /** 鍵盤開到第三層:更多動作 → 移動到 → 行動 App 改版 → 待辦 */
  const openThreeLevels = async () => {
    await page.locator(TRIGGER).first().focus()
    await page.keyboard.press('Enter')
    if (!(await waitActive('複製連結'))) return `開選單後焦點不在第一項(在「${await activeText()}」)`
    await page.keyboard.press('ArrowDown')
    if (!(await waitActive('移動到'))) return '↓ 走不到「移動到」'
    await page.keyboard.press('ArrowRight')
    if (!(await waitActive('行動 App 改版'))) return '→ 開不了第二層'
    await page.keyboard.press('ArrowRight')
    if (!(await waitActive('待辦'))) return '→ 開不了第三層'
    if (!(await waitOpen(3))) return `開著的層數不是 3(${await openCount()})`
    return null
  }

  // E:每按一次 Esc 少一層
  await scenario('E', NESTED, TRIGGER, async () => {
    const pre = await openThreeLevels()
    if (pre) { rec('E', 'instrument', `前提:${pre}`); return }
    for (const expectedText of ['行動 App 改版', '移動到', '更多動作']) {
      const openBefore = await openCount()
      await page.keyboard.press('Escape')
      await waitOpen(openBefore - 1)
      await waitActive(expectedText)
      const openAfter = await openCount(); const text = await activeText()
      const v = judgeEscStep({ openBefore, openAfter, activeText: text, expectedText })
      rec(`E Esc(${openBefore} 層 → 應剩 ${openBefore - 1} 層,焦點「${expectedText}」)`, v, `剩 ${openAfter} 層,焦點「${text}」`)
      if (v !== 'pass') break
    }
  })
  // Q:連按三下不等動畫
  await scenario('Q', NESTED, TRIGGER, async () => {
    const pre = await openThreeLevels()
    if (pre) { rec('Q', 'instrument', `前提:${pre}`); return }
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await waitOpen(0)
    await waitActive('更多動作')
    const openAfter = await openCount(); const text = await activeText()
    rec('Q Esc 連按三下(不等收合動畫)→ 0 層、焦點「更多動作」', openAfter === 0 && text === '更多動作' ? 'pass' : 'fail', `剩 ${openAfter} 層,焦點「${text}」`)
  })
  // T / S:Tab / Shift+Tab 收起全部、從觸發鈕往下 / 往上
  for (const [name, shift, fromLevel3] of [['T', false, true], ['S', true, false]]) {
    await scenario(name, NESTED, TRIGGER, async () => {
      const { key: expectedKey, triggerKey } = await nativeLanding(TRIGGER, shift)
      if (fromLevel3) {
        const pre = await openThreeLevels()
        if (pre) { rec(name, 'instrument', `前提:${pre}`); return }
      } else {
        await page.locator(TRIGGER).first().focus(); await page.keyboard.press('Enter')
        if (!(await waitOpen(1))) { rec(name, 'instrument', '前提:Enter 開不了選單'); return }
      }
      await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab')
      await waitOpen(0)
      const v = judgeTabOut({ openAfter: await openCount(), activeKey: await activeKey(), expectedKey, triggerKey })
      rec(`${name} ${fromLevel3 ? '第三層' : '第一層'}按 ${shift ? 'Shift+Tab' : 'Tab'} → 0 層、焦點 = 關著時在觸發鈕上按同一鍵的落點`, v, `期望「${expectedKey === 'BODY' ? `${triggerKey}(頁面邊緣:留在觸發鈕)` : expectedKey}」,實際「${await activeKey()}」`)
    })
  }
  // F1–F3:AI 浮鈕右鍵選單
  const fabMenuOpen = async () => {
    await page.locator(FAB).first().focus()
    await page.keyboard.press('Shift+F10')
    return waitOpen(1)
  }
  await scenario('F1', FAB_STORY, FAB, async () => {
    const { key: expectedKey, triggerKey } = await nativeLanding(FAB, false)
    if (!(await fabMenuOpen())) { rec('F1', 'instrument', '前提:Shift+F10 開不了選單'); return }
    const ctl = await page.evaluate((sel) => {
      const menu = document.querySelector('[role="menu"][data-state="open"]'); const fab = document.querySelector(sel)
      return { menuId: menu?.id ?? null, controls: fab?.getAttribute('aria-controls') ?? null }
    }, FAB)
    rec('F1a 浮鈕開著選單時 aria-controls 指向該選單', ctl.menuId && ctl.controls === ctl.menuId ? 'pass' : 'fail', JSON.stringify(ctl), { sabotaged: false })
    await page.keyboard.press('Tab')
    await waitOpen(0)
    const v = judgeTabOut({ openAfter: await openCount(), activeKey: await activeKey(), expectedKey, triggerKey })
    rec('F1b 浮鈕選單按 Tab → 選單關、焦點 = 關著時在浮鈕上按 Tab 的落點(頁面邊緣 = 留在浮鈕)', v, `期望「${expectedKey === 'BODY' ? `${triggerKey}(頁面邊緣:留在浮鈕)` : expectedKey}」,實際「${await activeKey()}」`)
  })
  await scenario('F2', FAB_STORY, FAB, async () => {
    if (!(await fabMenuOpen())) { rec('F2', 'instrument', '前提:Shift+F10 開不了選單'); return }
    await page.keyboard.press('Escape')
    await waitOpen(0)
    await waitFor((sel) => document.activeElement === document.querySelector(sel), FAB)
    const focusOnFab = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), FAB)
    // 對照組不破壞主選單的 Esc(沒有子選單開著),這一格在 selftest 也必須 pass
    rec('F2 浮鈕選單按 Esc → 焦點回浮鈕', judgeFabReturn({ how: 'escape', openAfter: await openCount(), focusOnFab }), `focusOnFab=${focusOnFab}`, { sabotaged: false })
  })
  await scenario('F3', FAB_STORY, FAB, async () => {
    if (!(await fabMenuOpen())) { rec('F3', 'instrument', '前提:Shift+F10 開不了選單'); return }
    // 點外面之前等選單的開啟動畫跑完(M32「量測值受動畫 / 時序影響 → 等穩態再量」):Radix DismissableLayer 的「點外面」
    // 監聽是在選單掛上後的下一個 task(setTimeout 0)才掛到 document —— 刻意不讓「打開它的那一下」把它關掉。
    // data-state=open 一出現就點(開啟動畫 opacity 0–0.47),那一下根本沒有人在聽:選單不關,被讀成「點外面不關選單」,
    // 指控不存在的產品問題(2026-09-26 實測:立刻點 5/6 不關、前後兩份建置都一樣;等動畫停再點 6/6 關、前後都一樣)。
    // 等不到(3 秒內動畫沒停)= 儀器失效,不是產品裁決。
    const settled = await waitFor(() => {
      const m = document.querySelector('[role="menu"][data-state="open"]')
      return !!m && m.getAnimations({ subtree: true }).length === 0
    })
    if (!settled) { rec('F3', 'instrument', '前提:浮鈕選單 3 秒內沒有停在開好的樣子(開啟動畫沒停),點外面量到的不是「開著的選單」'); return }
    await page.mouse.click(4, 4)
    await waitOpen(0)
    // 負向主張「焦點沒被搶回」的觀測窗(2026-09-27,M37;取代固定睡 400ms):舊版是在選單**卸載**(收合動畫結束後)才搶焦點,
    // 所以先等**卸載這個證據**(選單元素離開 DOM;等不到 = 還在收 / 沒關,由下面的 openAfter 判),再等版面靜止
    // (settleAfterInteraction:收合動畫是有限動畫、卸載是 DOM 變動),最後要求焦點連續 10 個影格不動(waitForFocusStable:
    // 焦點搬家不改 DOM,靜止判定看不到它)才讀。固定 400ms 在慢機器上讀在卸載之前 = 假綠;等證據的寫法機器多慢都等得到。
    await waitFor(() => !document.querySelector('[role="menu"]'), null, 5000)
    const quiet = await settleAfterInteraction(page, { frames: 10 })
    const stable = await waitForFocusStable(page, { frames: 10 })
    if (!quiet.ok || !stable.ok) { rec('F3', 'instrument', `點外面之後${quiet.ok ? '' : `版面 ${quiet.framesWaited} 格內沒靜止(變動 ${quiet.lateChanges} 次)`}${!quiet.ok && !stable.ok ? ';' : ''}${stable.ok ? '' : `焦點 ${stable.framesWaited} 格內一直在跳(換 ${stable.changes} 次)`}`); return }
    const focusOnFab = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), FAB)
    rec('F3 浮鈕選單開著點外面 → 選單關、焦點不被搶回浮鈕', judgeFabReturn({ how: 'outside', openAfter: await openCount(), focusOnFab }), `focusOnFab=${focusOnFab},等待期間焦點換了 ${stable.changes} 次`)
  })

  await browser.close(); await server.stop()
  if (instrumentFails.length) {
    console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 個情境沒量到 —— 不是產品裁決,但這次不能宣稱選單鍵盤正確${SELFTEST ? ',也不能宣稱對照組紅得對' : ''}:`)
    for (const f of instrumentFails) console.log(`  · 情境 ${f.scenario}:${f.detail}`)
  }
  // selftest 至少要有一格被破壞的判定真的紅了,否則「全綠」只代表沒量到任何東西
  const red = failed > 0 || instrumentFails.length > 0 || (SELFTEST && sabotagedRed === 0)
  console.log(red ? `✗ dropdown-menu-keyboard ${failed} 條失敗、${instrumentFails.length} 個情境沒量到` : (SELFTEST ? '✓ selftest:舊行為每一格都被判紅,量具有效' : '✅ dropdown-menu-keyboard PASS(子選單 Esc 一次一層、Tab 收起往下走、浮鈕只在 Esc / 選項後回焦點)'))
  process.exit(red ? 1 : 0)
}
