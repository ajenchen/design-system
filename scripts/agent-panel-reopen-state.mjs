#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AgentPanel 關閉後再打開:狀態必須還在(spec E 條「閱讀位置保存」/ F 條「初始化為關閉」)
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`components/AgentPanel/agent-panel-fab.spec.md`「放置與互斥」段(2026-09-27 自 agent-panel.spec.md 拆出)。
//
// 2026-09-07 之前 `AgentPanelDock` 是 `if (open) return children` —— 關閉的瞬間整個面板
// 連同它的 state 一起卸載。改成一直渲染、關閉時 `display:none` 之後,又發現第二層問題:
// **祖先被 display:none 時瀏覽器會把捲動位置歸零**,而且 ResizeObserver 會以 0×0 觸發一次,
// 那一刻量到的數字全是 0,拿去更新「使用者剛剛在哪」就會被洗成「貼在底部」。
//
// 兩個測試設計上的坑,都踩過,寫在這裡免得下次再踩:
//
//   1. **不要拿受控的草稿當證據**。`AgentPromptInput` 是完全受控的,值住在消費端的 state,
//      面板卸載也不會掉 —— 它測的是 story 不是面板。第一版拿它當證據,結果注入舊行為
//      測試照樣全綠。
//   2. **不要捲到底**。聊天會自動捲到底,所以「捲到底 → 關 → 開」在有沒有保存的兩種
//      實作下都會得到同一個數字。必須捲到中間,而且捲動範圍要夠大(第一版 max=60 太小)。
//      本檔用「前提斷言」把這兩件事鎖住:範圍不夠或停在最底就當場 FAIL,不會靜靜空轉。
//
// 對抗驗證:把 `AgentPanelDock` 改回 `{open && children}` 後,本檔實測
// 「關前 63 → 開回 180」而失敗;改回來則 63 → 63 通過。
//
// 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
// Storybook 回報渲染完成(含 play)+ render-health + 字型 + 版面連續 10 影格靜止,才開始造狀態。
// 取代原本的「networkidle + 固定睡 800ms」(那只是「已渲染」的代理,M37)。story 開不起來(不存在的 id、
// story 檔 404、錯誤頁、空畫面、頁面例外)= 儀器失效:點名 story、附同源 404、exit 2 —— 不是產品裁決;
// 舊寫法在這種情況下會落到「G2 前提:這個 story 有面板」並 exit 1,把「沒量到」讀成「story 沒有面板」。
//
// Run: `node scripts/agent-panel-reopen-state.mjs`

// G2:關閉面板後再打開,閱讀位置與草稿必須還在
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowserOrSkip, openStory, requireFreshStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
const S=join(process.cwd(),'storybook-static')
// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記)。原本下一段 statSync 直接 ENOENT 崩掉(2026-09-25,待辦總帳 C5)
// 建置存在、且不比被驗的原始碼舊:lib/launch-browser.mjs requireFreshStorybookBuild(全部瀏覽器閘同一份;2026-09-27,待辦總帳 C5)
requireFreshStorybookBuild(S, ['packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx',
                               'packages/design-system/src/components/AgentPanel/agent-panel.tsx'])
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv=await startA11yStaticServer({rootDirectory:S,defaultFile:'iframe.html'})
process.once('exit',(code)=>{ if(code&&sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const B=sv.origin
// 啟動參數與「起不來 → SKIPPED-ENV」行為沿用共用實作(M17:不再各自寫一份 --single-process --no-sandbox)
const br = await launchBrowserOrSkip()
// 視窗壓矮,讓對話一定超出可視高度 —— 否則「閱讀位置保存」這條會空轉
// 視窗壓到很矮,對話才會有足夠的捲動範圍 —— 範圍太小的話「捲到中間」與「自動捲到底」
// 會落在同一個值,測試就分不出有沒有回歸(2026-09-07 踩過:max=60 時兩者都是 60)
const pg=await br.newPage({viewport:{width:1600,height:300}})
// 互動之後等版面真的停了(lib/launch-browser.mjs settleAfterInteraction);等不到 = 儀器失效 exit 2,不是產品裁決
const settle=async(what)=>{
  const r=await settleAfterInteraction(pg,{frames:10})
  if(r.ok)return
  console.error(`✗ INSTRUMENT-FAIL ${what}:互動之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)—— 儀器失效,不是產品裁決`)
  await br.close(); await sv.stop(); process.exit(2)
}
const st={id:'design-system-components-agentpanel-展示--task-assistant'}
console.log('story:', st.id)
try {
  // 聊天捲動範圍是渲染後量寬 / 自動捲到底一格一格長出來的 → 等版面連續靜止再造狀態(量的是穩態,不是過渡中的值)。
  // **不 waitFor 面板**:渲染完成且畫面健康之後仍找不到面板,是 story / 元件層的事實,交給下面「G2 前提」判紅(產品面)。
  await openStory(pg, `${B}/iframe.html?id=${encodeURIComponent(st.id)}&viewMode=story`, { settleFrames: 10, notFound: sv.notFound })
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  // 沒量到 ≠ 沒問題:儀器失效(exit 2),不是產品裁決,也絕不算通過;同源 404 帳本由上方 exit 監聽印出
  console.error(`✗ ${error.message}`)
  console.error('✗ agent-panel-reopen-state:儀器失效 —— 這次什麼都沒量到')
  await br.close(); await sv.stop(); process.exit(2)
}
const out=[]; let fail=0
const ck=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`); if(!p)fail++}
const state = () => pg.evaluate(()=>{
  const panel=document.querySelector('[role="complementary"]')
  const scroller=panel?[...panel.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+4)||null:null
  const ta=panel?.querySelector('textarea')
  return { hasPanel: !!panel, scrollTop: scroller?Math.round(scroller.scrollTop):null,
    scrollable: scroller?scroller.scrollHeight>scroller.clientHeight:false,
    draft: ta?ta.value:null, panelVisible: panel?panel.getBoundingClientRect().width>0:false,
    fab: !!document.querySelector('button[aria-haspopup="menu"]') }
})
const s0 = await state()
if (!s0.hasPanel) { ck('G2 前提:這個 story 有面板(沒有的話以下全部空轉)', false, JSON.stringify(s0)) }
else {
  // 造出可辨識的狀態:捲動 + 打字
  // 用**真鍵盤**打字 —— 直接設 .value 不會進 React state,那樣測到的是我自己的假動作
  const ta = await pg.$('[role="complementary"] textarea')
  if (ta) { await ta.click(); await pg.keyboard.type('寫到一半的草稿') }
  // 捲動也用真的滾輪
  const scrollerBox = await pg.evaluate(()=>{
    const p=document.querySelector('[role="complementary"]')
    const cands=[...p.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+4)
    if(!cands.length) return null
    const e=cands[0]; const max=e.scrollHeight-e.clientHeight
    // **捲到中間,不是捲到底** —— 聊天會自動捲到底,捲到底的話重新掛載後也會是那個值,
    // 兩種行為給出同一個數字,測試就永遠是綠的(假綠)。
    e.scrollTop = Math.round(max * 0.35)
    return { cls:String(e.className).slice(0,40), max, now:Math.round(e.scrollTop) }
  })
  console.log('捲動容器:', JSON.stringify(scrollerBox))
  // 等 scroll 事件派發、面板的捲動處理器記下「使用者剛剛在哪」(元素早已在畫面上,這段等的是事件 → 狀態,不是渲染)。
  // 2026-09-25 起三處都改成「等版面連續 10 影格靜止」(settleAfterInteraction,待辦總帳 C5)取代固定睡 250 / 500 / 600ms ——
  // scroll 事件在下一個影格派發,關閉 / 重開的過渡是有限長度動畫,靜止判定都會等到;慢的機器只會等久一點。
  await settle('捲到中間')
  const before = await state()
  // 按關閉
  const closed = await pg.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/關閉/.test(x.getAttribute('aria-label')||'')); if(b){b.click();return true} return false })
  // 等關閉的過渡走完、入口鈕掛上(祖先 display:none 讓捲動歸零 / ResizeObserver 0×0 那一刻也在這段裡)
  await settle('關閉面板')
  const mid = await state()
  // 再打開
  await pg.evaluate(()=>{ const f=document.querySelector('button[aria-haspopup="menu"]'); f?.click() })
  // 等重新打開的過渡走完、面板把閱讀位置還原(還原發生在重新顯示之後的版面回呼裡)
  await settle('重新打開面板')
  const after = await state()
  ck('G2 找得到關閉鈕', closed)
  ck('G2 關閉後面板不可見', !mid.panelVisible, `寬度>0=${mid.panelVisible}`)
  ck('G2 關閉後入口鈕出現', mid.fab)
  // 前提:捲動範圍要夠大,而且不能停在最底(否則自動捲到底會偽裝成「保住了」)
  ck('G2 前提:捲動範圍足夠且沒停在最底(否則這條測不出東西)',
     !!scrollerBox && scrollerBox.max >= 60 && scrollerBox.now > 4 && scrollerBox.now < scrollerBox.max - 4,
     JSON.stringify(scrollerBox))
  ck('G2 重新打開後**閱讀位置**還在', after.scrollTop === before.scrollTop, `關前 ${before.scrollTop} → 開回 ${after.scrollTop}`)
  // 草稿這條**故意不當作 G2 的證據**:AgentPromptInput 是完全受控的,值住在消費端的 state,
  // 面板卸載也不會掉 —— 它測的是 story 不是面板(2026-09-07 訂正:先前拿它當證據是錯的)。
  ck('G2 附帶:受控草稿當然還在(這條不構成 G2 的證據)', after.draft === before.draft, `「${before.draft}」→「${after.draft}」`)
}
// ── N30(2026-09-29,待辦總帳):面板關回來時入口鈕殼是全新掛載 —— 第一格就要在合法範圍,而且不能靠量測 ──
// SSOT:agent-panel-fab.spec.md「遮擋與貼邊」(貼邊 y 合法範圍 = 中線 … 家頂上方一個 loose)。
// 舊版 `placementStyle` 在舞台高還是 0 的第一次 commit 放行未夾的 y、家的內距用 fallback 16,靠 layout effect 同步重繪蓋掉;
// 改後靜止位置全由 CSS 對舞台的百分比 clamp,任何一格都不依賴量測。
// 量法:殼重掛時用 MutationObserver(attributeOldValue)收下 style 屬性**每一個被覆寫掉的舊值**,逐一套到探針元素上量成像素;
// 舊版第一格會量到 700(舞台 400 高時合法上界 300)→ 紅;另以 rAF 逐格量畫出來的位置。
const FAB_STORY = `${B}/iframe.html?id=design-system-components-agentpanel-展示--fab&viewMode=story`
try {
  await pg.setViewportSize({ width: 1400, height: 800 })
  await openStory(pg, FAB_STORY, { waitFor: 'button[aria-label="開啟智慧代理"]', settleFrames: 10, notFound: sv.notFound })
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  console.error(`✗ ${error.message}`); console.error('✗ agent-panel-reopen-state N30:儀器失效 —— 入口鈕 story 開不起來')
  await br.close(); await sv.stop(); process.exit(2)
}
const FAB = 'button[aria-label="開啟智慧代理"]'
const shellTop = () => pg.evaluate(() => { const s = document.querySelector('[data-placement]'); const st = s?.offsetParent; return s && st ? Math.round((s.getBoundingClientRect().top - st.getBoundingClientRect().top) * 10) / 10 : null })
await pg.focus(FAB); await pg.keyboard.press('ArrowRight'); await settle('鍵盤貼邊')
const docked = await pg.evaluate(() => {
  const s = document.querySelector('[data-placement]'); const st = s.offsetParent; const H = st.clientHeight
  const loose = parseFloat(getComputedStyle(s).getPropertyValue('--layout-space-loose'))
  return { placement: s.dataset.placement, top: s.getBoundingClientRect().top - st.getBoundingClientRect().top, expect: H - 2 * loose - 68, H, loose }
})
ck('N30 前提:鍵盤 → 貼邊停在帶底(y = 舞台高 − 2·loose − 68)', docked.placement === 'dock' && Math.abs(docked.top - docked.expect) <= 1, JSON.stringify(docked))
await pg.click(FAB); await settle('開面板')
await pg.setViewportSize({ width: 1400, height: 400 }); await settle('視窗變矮')
await pg.evaluate(() => {
  const panel = document.querySelector('[role="complementary"]')
  let host = panel.parentElement; while (host && getComputedStyle(host).display === 'contents') host = host.parentElement
  window.__n30 = { old: [], frames: [] }
  new MutationObserver((ms) => { for (const m of ms) if (m.type === 'attributes' && m.target.matches?.('[data-placement]') && m.oldValue != null) window.__n30.old.push(m.oldValue) })
    .observe(host, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style'] })
  const raf = (n) => { if (n <= 0) return; requestAnimationFrame(() => { const s = document.querySelector('[data-placement]'); const st = s?.offsetParent; if (s && st) window.__n30.frames.push(Math.round((s.getBoundingClientRect().top - st.getBoundingClientRect().top) * 10) / 10); raf(n - 1) }) }
  raf(8)
  document.querySelector('[role="complementary"] button[aria-label="關閉面板"]').click()
})
await settle('關面板(殼重掛)')
const n30 = await pg.evaluate(() => {
  const s = document.querySelector('[data-placement]'); const st = s.offsetParent; const H = st.clientHeight
  const loose = parseFloat(getComputedStyle(s).getPropertyValue('--layout-space-loose'))
  const minY = Math.floor(H / 2 - 14), maxY = Math.max(minY, H - 2 * loose - 68)
  const values = [...window.__n30.old, s.getAttribute('style') ?? '']
  const probe = document.createElement('div'); st.appendChild(probe)
  const tops = values.map((v) => { probe.setAttribute('style', `position:absolute;width:1px;height:1px;pointer-events:none;visibility:hidden;${/top:\s*[^;]+/.exec(v)?.[0] ?? ''}`); return Math.round((probe.getBoundingClientRect().top - st.getBoundingClientRect().top) * 10) / 10 })
  probe.remove()
  return { H, loose, minY, maxY, values, tops, frames: window.__n30.frames, finalTop: Math.round((s.getBoundingClientRect().top - st.getBoundingClientRect().top) * 10) / 10, finalStyleTop: s.style.top, finalStyleRight: s.style.right }
})
const inRange = (t) => t >= n30.minY - 1 && t <= n30.maxY + 1
ck('N30 殼重掛後寫進 DOM 的每一個 top(含被覆寫掉的第一格)都在合法範圍(舊版第一格 = 未夾的 700)', n30.values.length > 0 && n30.tops.every(inRange), JSON.stringify({ range: [n30.minY, n30.maxY], tops: n30.tops, values: n30.values }))
ck('N30 畫出來的每一格都在合法範圍', n30.frames.length > 0 && n30.frames.every(inRange), JSON.stringify({ range: [n30.minY, n30.maxY], frames: n30.frames }))
ck('N30 視窗變矮後貼邊 y 被夾到帶底', Math.abs(n30.finalTop - n30.maxY) <= 1, `top ${n30.finalTop} / maxY ${n30.maxY}`)
ck('N30 靜止位置不是量出來的 px 代理:top 是對舞台的 clamp() 表達式', /^clamp\(/.test(n30.finalStyleTop), `top="${n30.finalStyleTop}" right="${n30.finalStyleRight}"`)
// 家 ↔ 貼邊的位置過渡仍在(calc / clamp 之間要能內插):按 Home 回家,100ms 取樣要落在兩端之間
await pg.focus(FAB); const fromTop = await shellTop(); await pg.keyboard.press('Home'); await pg.waitForTimeout(100); const midTop = await shellTop(); await settle('回家')
const homeTop = await shellTop()
const homeExpect = n30.H - n30.loose - 40
ck('N30 貼邊 → 回家:過渡中途(100ms)位置落在兩端之間(calc / clamp 之間仍有內插)', fromTop != null && midTop != null && homeTop != null && midTop > Math.min(fromTop, homeTop) + 2 && midTop < Math.max(fromTop, homeTop) - 2, `貼邊 ${fromTop} → 100ms ${midTop} → 家 ${homeTop}`)
ck('N30 回家後 top = 舞台高 − loose − 40(right / top 都由 CSS 變數錨定,不吃 fallback 16)', homeTop != null && Math.abs(homeTop - homeExpect) <= 1 && (await pg.evaluate(() => document.querySelector('[data-placement]').style.right)) === 'var(--layout-space-loose)', `top ${homeTop} / 應 ${homeExpect}`)

console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); await sv.stop(); process.exit(fail?1:0)
