#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AgentPanel 並排 ↔ 蓋板:斷點與寬度上限都是**推導值**,不是挑出來的
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`components/AgentPanel/agent-panel.spec.md`「與 app 的推擠與斷點」段。
//
// 三個已定的量互鎖:
//     面板 ≥ 360(PANEL_WIDTH_MIN)
//     面板 ≤ 舞台的 3/5(user 2026-09-07 裁示 #5「50% 基準由視窗改舞台」定了「一半」;2026-09-09 user 拍板 960 → 放寬到 3/5)
//     並排時 舞台 = 容器 − 面板
// ⇒ 面板 ≤ 容器 × 3/8 ⇒ **並排只在容器 ≥ 960 時成立**,更窄就翻成蓋板(2026-09-09 user 拍板 960:「一半」放寬到 3/5;
//    2026-09-16 user 裁示蓋板不再蓋滿:左留 --layout-space-viewport-inset、右貼齊容器、底下鋪遮罩;
//    遮罩點擊行為 2026-09-17 改為「點了關閉面板」,取代 09-16 的「點了不關」)。
// 960 不是挑的數字,是這三條逼出來的唯一解;所以這支閘直接驗那三條,
// 而不是驗「有沒有等於 960」——數字若哪天因為 MIN 或比例改變而變,閘會自動跟著對。
//
// 為什麼要量容器不是視窗:面板住在容器裡。視窗 1920 但容器只有 800 的版面
// (側欄 + 主內容 + 面板)用視窗算會給出 640 的上限,面板一寬舞台就被擠爆。
//
// 一個踩過的坑寫在這裡:量容器時**不能直接抓 parentElement** ——
// AgentPanelDock 為了「關閉時不卸載」在外面包了一層 `display: contents`(它刻意沒有盒子),
// 量它會得到 clientWidth = 0,於是上限永遠是 640、蓋板永遠不觸發。要往上找到第一個有盒子的祖先。
//
// Run: `node scripts/agent-panel-breakpoint.mjs [--static=<dir>]`(預設讀 `storybook-static`;
//      並行工作者用 `npx storybook build --output-dir <dir>` 自己的 build 時以 `--static` 指定,不覆蓋主 build)
//
// 「story 已經畫好」的判定(2026-09-25 起)一律走 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作):
// Storybook 回報這則 story 渲染完成(含 play)、通過 render-health、被量的元素出現、版面連續靜止 N 個影格
// (進場的 slide-in / fade-in 與 CSS 過渡都是有限長度動畫,靜止判定會等它們跑完)。原本是 `networkidle` + 固定睡 500 / 400ms,
// --selftest 注入破壞 CSS 後再睡 100ms —— 那是「已渲染 / 已套用」的代理:實測(2026-09-25)舊版 --selftest 量到
// 「面板左 − 容器左 = 15.2 / 8 / 2.2」,當下面板上正跑著注入 `left:0` 觸發的 250ms `left` 過渡(量到時才走了 100–183ms),
// 量到的是過渡中間值不是終值;對照組碰巧仍是紅的,所以沒人發現。新版等過渡走完,量到 0。
// story 開不起來(id 不存在、chunk 404、渲染拋錯、等不到被量的元素)→ **儀器失效**:點名 story、附 Storybook 錯誤原文與
// 同源 404 帳本,exit 1 —— 不是產品裁決,也絕不當成通過。(不用 exit 2:lib/gate-selftest-meta.mjs 在 2026-09-25 修正前把 2 讀成「缺前置 → 略過」。)

// G3:並排 ↔ 蓋板的斷點與寬度上限
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip } from './lib/launch-browser.mjs'
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(process.cwd(), staticArg)) : join(process.cwd(),'storybook-static')
if (statSync('packages/design-system/src/components/AgentPanel/agent-panel.tsx').mtimeMs > statSync(join(S,'index.html')).mtimeMs) {
  console.error(`✗ STALE-BUILD:agent-panel.tsx 比 ${S} 新 —— 先重建該 storybook build`); process.exit(2) }
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const B=sv.origin
// 起不了 Chromium:一般環境 SKIPPED-ENV exit 0;GOVERNANCE_BROWSER_REQUIRED=1 的 CI 瀏覽器 job → exit 1(lib/launch-browser.mjs)
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const pg=await br.newPage({viewport:{width:1600,height:800}})
const out=[]; let fail=0
const ck=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`); if(!p)fail++}
// 版面連續靜止幾個影格才量(與 overflow-indicator-containment 等閘同值)
const SETTLE_FRAMES = 10
/** 開 story 並等到真的畫完(openStory);證明不了 → 儀器失效,點名 story、印 404 帳本,exit 1。 */
const open = async (url, options) => {
  try {
    return await openStory(pg, url, { settleFrames: SETTLE_FRAMES, notFound: sv.notFound, ...options })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    if (out.length) console.log(out.join('\n'))
    console.error(`\n✗ ${error.message}`)
    await br.close(); await sv.stop(); process.exit(1)
  }
}
const TASK_ASSISTANT = `${B}/iframe.html?id=design-system-components-agentpanel-展示--task-assistant&viewMode=story`
const FAB_STORY = `${B}/iframe.html?id=design-system-components-agentpanel-展示--fab&viewMode=story`
// 頁面端:Fab story 的入口鈕(等的與點的是同一顆)
const hasFab = () => [...document.querySelectorAll('button')].some((b) => /代理|agent/i.test(b.getAttribute('aria-label') || ''))
/** openStory 的 beforeSettle:點入口鈕,再等面板本身變成可見(原本在頁面裡固定睡 600ms)。
 *  面板出現之後「量容器 → setState → 重畫」與進場動畫,交給 openStory 的靜止判定;等不到面板 = 下方 probe 回報「沒出現」(產品裁決,紅)。 */
const openPanelViaFab = async (page) => {
  const clicked = await page.evaluate(() => {
    const fab = [...document.querySelectorAll('button')].find((b) => /代理|agent/i.test(b.getAttribute('aria-label') || ''))
    fab?.click()
    return Boolean(fab)
  })
  if (clicked) await page.waitForSelector('[role="complementary"]', { state: 'visible', timeout: 15000 }).catch(() => {})
}
// 對照組(M32「儀器要先有對照組」):--selftest 把蓋板的左內距硬設 0、把遮罩藏起來(= 2026-09-16 之前的樣子),
// 「蓋板左留內距」「蓋板底下有遮罩」兩條在每個蓋板寬度都必須紅,否則量具無效。
const SELFTEST = process.argv.includes('--selftest')
const SABOTAGE = '[role="complementary"][data-agent-panel-mode="overlay"]{left:0!important} [data-agent-panel-scrim]{display:none!important}'
for (const W of [1920, 1600, 1280, 1080, 1000, 960, 959, 800]) {
  await pg.setViewportSize({width:W,height:800})
  // 對照組的破壞 CSS 在靜止判定之前注入(原本注入後另睡 100ms):它觸發的 250ms `left` 過渡由同一個靜止判定等完
  const { probe: r } = await open(TASK_ASSISTANT, {
    waitFor: '[role="complementary"]',
    beforeSettle: SELFTEST ? (page) => page.addStyleTag({ content: SABOTAGE }) : null,
    probe: ()=>{
    const p=document.querySelector('[role="complementary"]')
    if(!p) return {err:'找不到面板'}
    let host=p.parentElement
    while(host && getComputedStyle(host).display==='contents') host=host.parentElement
    const cs=getComputedStyle(p)
    const handle=p.querySelector('[role="separator"][aria-orientation="vertical"]')
    const H=host.getBoundingClientRect(), P=p.getBoundingClientRect()
    // 蓋板態:左留 --layout-space-viewport-inset(讀 CSS 變數的實際值,不寫死 48)、右貼齊容器、底下鋪遮罩(點了關閉面板,2026-09-17)
    const inset=parseFloat(getComputedStyle(host).getPropertyValue('--layout-space-viewport-inset'))
    const scrim=document.querySelector('[data-agent-panel-scrim]')
    const S=scrim?scrim.getBoundingClientRect():null, scs=scrim?getComputedStyle(scrim):null
    const probe=document.createElement('div'); probe.className='bg-overlay'; document.body.appendChild(probe)
    const overlayBg=getComputedStyle(probe).backgroundColor; probe.remove()
    const near=(a,b)=>Math.abs(a-b)<=1
    return { mode:p.dataset.agentPanelMode, container:host.clientWidth,
      panelW:Math.round(P.width),
      pos:cs.position, valuemax:handle?+handle.getAttribute('aria-valuemax'):null,
      hasHandle:!!handle,
      // 舞台 = 容器 − 面板(並排時);蓋板時舞台就是整個容器
      stage: host.clientWidth - (cs.position==='absolute'?0:Math.round(P.width)),
      inset, gapLeft: Math.round((P.left-H.left)*10)/10, gapRight: Math.round((H.right-P.right)*10)/10,
      scrim: !!scrim, scrimCoversHost: !!S && near(S.left,H.left) && near(S.right,H.right) && near(S.top,H.top) && near(S.bottom,H.bottom),
      scrimBg: scs?.backgroundColor ?? null, overlayBg, scrimZ: scs?.zIndex ?? null,
      // 留白處命中的必須是遮罩本身(它接住指標);穿透到底下 = 會打到並存 modal 的外部點擊偵測(2026-09-16 user 第二次回報)
      stripHitsScrim: !!scrim && Number.isFinite(inset) && document.elementFromPoint(H.left + inset/2, H.top + H.height/2) === scrim,
      // 留白正中一點:點下去要關閉面板(2026-09-17)
      strip: Number.isFinite(inset) ? { x: H.left + inset/2, y: H.top + H.height/2 } : null }
    },
  })
  if(r.err){ ck(`G3 @${W}`, false, r.err); continue }
  const expectOverlay = r.container < 960
  ck(`G3 @視窗${W}(容器${r.container}) 形態應為 ${expectOverlay?'蓋板':'並排'}`,
     r.mode === (expectOverlay?'overlay':'side-by-side'), `實得 ${r.mode} / position=${r.pos} / 面板寬 ${r.panelW}`)
  if (!expectOverlay) {
    const expMax = Math.min(640, Math.max(Math.floor(r.container*3/8), 360))
    ck(`G3 @${W} 寬上限 = min(640, 容器 × 3/8) = ${expMax}`, r.valuemax === expMax, `aria-valuemax=${r.valuemax}`)
    ck(`G3 @${W} 面板不超過舞台的 3/5(面板 ${r.panelW} ≤ 舞台 ${r.stage} × 3/5)`, r.panelW <= r.stage*3/5 + 1, `舞台 ${r.stage}`)
    ck(`G3 @${W} 並排態不畫蓋板遮罩`, !r.scrim, `scrim=${r.scrim}`)
  } else {
    // 2026-09-16 user 裁示(v14 來源總帳):蓋板不再蓋滿 —— 左留 Dialog 同一顆 --layout-space-viewport-inset、右貼齊容器、
    // 底下鋪 CoexistenceMask(z-30、--overlay、接住指標)。2026-09-17 user 改裁示:點遮罩**關閉面板**(並存 modal 留著)。
    ck(`G3 @${W} 蓋板左留 --layout-space-viewport-inset(token 實值 ${r.inset}px)`, Number.isFinite(r.inset) && r.inset > 0 && Math.abs(r.gapLeft - r.inset) <= 1, `面板左 − 容器左 = ${r.gapLeft}`)
    ck(`G3 @${W} 蓋板右緣貼齊容器`, Math.abs(r.gapRight) <= 1, `容器右 − 面板右 = ${r.gapRight}`)
    ck(`G3 @${W} 蓋板底下有遮罩(data-agent-panel-scrim:覆蓋容器、底色 = --overlay、z-30、留白處命中的是遮罩本身)`,
       r.scrim && r.scrimCoversHost && r.scrimBg === r.overlayBg && r.scrimZ === '30' && r.stripHitsScrim,
       JSON.stringify({ scrim: r.scrim, covers: r.scrimCoversHost, bg: r.scrimBg, overlay: r.overlayBg, z: r.scrimZ, stripHitsScrim: r.stripHitsScrim }))
    // 對照組把遮罩藏起來了,點「留白處」點不到遮罩 —— 這條在 --selftest 沒有意義,也不在對照組的判定裡,略過不點
    if (r.strip && !SELFTEST) {
      await pg.mouse.click(r.strip.x, r.strip.y)
      // 等「面板真的關了」這件事本身(原本固定睡 400ms):關了就立刻往下;15 秒還開著 = 點了沒關(產品裁決,紅)
      const panelState = ()=>{ const p=document.querySelector('[role="complementary"]'); return { open: !!p && getComputedStyle(p).display!=='none' && p.getBoundingClientRect().width>0, mode: p?.dataset.agentPanelMode } }
      await pg.waitForFunction(()=>{ const p=document.querySelector('[role="complementary"]'); return !(p && getComputedStyle(p).display!=='none' && p.getBoundingClientRect().width>0) }, null, { timeout: 15000, polling: 'raf' }).catch(() => {})
      const after = await pg.evaluate(panelState)
      ck(`G3 @${W} 點遮罩(留白處)關閉面板`, !after.open, JSON.stringify(after))
    }
    ck(`G3 @${W} 蓋板態不渲染拖曳把手(寬度不再是可選的)`, !r.hasHandle, `hasHandle=${r.hasHandle}`)
  }
}
if (SELFTEST) {
  const sab = out.filter((l) => /蓋板左留|蓋板底下有遮罩/.test(l))
  const ok = sab.length === 4 && sab.every((l) => l.startsWith('✗'))
  console.log(sab.map((l) => '  ' + l).join('\n'))
  console.log(ok ? `✓ selftest:對照組(左內距設 0 + 藏遮罩)讓 ${sab.length} 條蓋板斷言全紅,量具會紅` : `✗ selftest:對照組沒讓每一條蓋板斷言紅(${sab.filter((l) => l.startsWith('✗')).length}/${sab.length})—— 量具無效`)
  await br.close(); await sv.stop(); process.exit(ok ? 0 : 1)
}

// ── 初始關閉 → 打開:量測必須跟著重綁(2026-09-08,跨模型審查抓到)────────────
// 根因:面板往上找「有盒子的祖先」時只跳過 `display: contents`,
// 但 Dock 為了「關閉時不卸載」在關閉態是 `display: none` —— 迴圈不跳它,
// 於是量到 clientWidth = 0、`if (w > 0)` 永不觸發、containerPx 卡在 0
// → 上限永遠 640、蓋板永不觸發。而且 useLayoutEffect 空依賴,打開後不會重綁。
// 這是 G2(keep-mounted)與 G3(容器斷點)互相踩到:兩支閘各自都綠,合起來才壞。
for (const W of [800, 1600]) {
  await pg.setViewportSize({width:W,height:800})
  // 入口鈕出現才點(waitFor);點完等面板本身出現,再等版面靜止才量(openStory 的 beforeSettle + settleFrames)
  const { probe: opened } = await open(FAB_STORY, { waitFor: hasFab, beforeSettle: openPanelViaFab, probe: () => {
    const p = document.querySelector('[role="complementary"]')
    if (!p || getComputedStyle(p).display === 'none' || p.getBoundingClientRect().width === 0) return { err: '點了入口鈕但面板沒出現' }
    let host = p.parentElement
    while (host && ['contents', 'none'].includes(getComputedStyle(host).display)) host = host.parentElement
    const handle = p.querySelector('[role="separator"][aria-orientation="vertical"]')
    return { mode: p.dataset.agentPanelMode, container: host.clientWidth,
             panelW: Math.round(p.getBoundingClientRect().width),
             valuemax: handle ? +handle.getAttribute('aria-valuemax') : null }
  } })
  if (opened.err) { ck(`G3 初始關閉 @${W}`, false, opened.err); continue }
  const expectOverlay = opened.container < 960
  ck(`G3 初始關閉後打開 @視窗${W}(容器${opened.container}) 形態應為 ${expectOverlay?'蓋板':'並排'}`,
     opened.mode === (expectOverlay ? 'overlay' : 'side-by-side'),
     `實得 ${opened.mode} / 面板寬 ${opened.panelW} / aria-valuemax=${opened.valuemax}`)
  if (!expectOverlay) {
    const expMax = Math.min(640, Math.max(Math.floor(opened.container*3/8), 360))
    ck(`G3 初始關閉後打開 @${W} 寬上限 = ${expMax}`, opened.valuemax === expMax, `aria-valuemax=${opened.valuemax}`)
  }
}


// ── 蓋板態:宿主必須真的不可操作(v14 條 B)────────────────────────────────
// 「窄螢幕以抽屜覆蓋宿主(左留視窗內距、底下鋪遮罩),**宿主暫不可操作**」——「覆蓋 + 遮罩」是視覺,「不可操作」是行為,
// 兩件事。實測(2026-09-08 跨模型審查)真 Tab 走得進被蓋住的宿主按鈕並且 Enter 會執行。
// 視覺上蓋住不等於鍵盤到不了 —— 這正是 M32「宣稱 ≠ 真實」的同一種病。
await pg.setViewportSize({width:800,height:800})
// 用 Fab story:宿主是一張 DataTable,有大量可聚焦控件 ——
// 拿沒有控件的 story 來驗「宿主不可操作」會得到 0/0 的空過(2026-09-08 當場踩到)。
const { probe: reach } = await open(FAB_STORY, { waitFor: hasFab, beforeSettle: openPanelViaFab, probe: () => {
  const panel = document.querySelector('[role="complementary"]')
  if (!panel) return { skip: '面板沒出現' }
  if (panel.dataset.agentPanelMode !== 'overlay') return { skip: `此視窗不是蓋板態(${panel.dataset.agentPanelMode})` }
  // 宿主 = 面板的定位祖先裡,面板以外的那些內容
  const root = document.querySelector('#storybook-root') || document.body
  const outside = [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !panel.contains(el))
  const focusable = outside.filter((el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (el.closest('[inert]')) return false
    return !el.hasAttribute('disabled')
  })
  return { total: outside.length, stillFocusable: focusable.length,
           sample: focusable.slice(0, 3).map((e) => e.tagName + '.' + String(e.className).split(' ')[0]) }
} })
if (reach.skip) ck('B 蓋板態宿主不可操作', false, reach.skip)
else ck('B 蓋板態:被蓋住的宿主不得留下可聚焦控件(v14 條 B「宿主暫不可操作」)',
        reach.stillFocusable === 0,
        `宿主可聚焦控件 ${reach.stillFocusable}/${reach.total} 個${reach.sample.length?':'+reach.sample.join(', '):''}`)


// ── 蓋板層級:並存面 < agent 蓋板 < 一般確認框(v14 條 A + 推導第 4 題)────────────
// 第 4 題:窄螢幕「URL Modal 在被蓋住的宿主區」→ 並存面(persistentElements,z-40)在 agent 後方;
// 條 A:「沒有 URL 的 Modal 阻擋其餘介面,包含 agent」→ 一般確認框(z-50)在 agent 前方。
// 第一版只守「agent > Dialog」,把確認框也壓到面板底下(R3 實測),那是把第 4 題錯推成「所有 Dialog 在後方」。
{
  const panelSrc = readFileSync(join(process.cwd(),'packages/design-system/src/components/AgentPanel/agent-panel.tsx'),'utf8')
  const dialogSrc = readFileSync(join(process.cwd(),'packages/design-system/src/components/Dialog/dialog.tsx'),'utf8')
  const pz = +(panelSrc.match(/isOverlay && '[^']*?z-\[?(\d+)\]?/)?.[1] ?? NaN)
  const coexist = +(dialogSrc.match(/persistentElements \? "fixed[^"]*?z-\[?(\d+)\]?/)?.[1] ?? NaN)
  const stock = +(dialogSrc.match(/: "fixed left-1\/2 top-1\/2 z-\[?(\d+)\]?/)?.[1] ?? NaN)
  ck('B 層級:並存面 < agent 蓋板 < 一般確認框', coexist < pz && pz < stock, `並存面 z=${coexist} / agent z=${pz} / 確認框 z=${stock}`)
}

console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); await sv.stop(); process.exit(fail?1:0)
