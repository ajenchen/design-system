#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AgentPanel 並排 ↔ 蓋板:斷點與寬度上限都是**推導值**,不是挑出來的
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`components/AgentPanel/agent-panel.spec.md`「與 app 的推擠與斷點」段。
//
// 三個已定的量互鎖:
//     面板 ≥ 360(PANEL_WIDTH_MIN)
//     面板 ≤ 舞台的一半(user 2026-09-07 裁示 #5「50% 基準由視窗改舞台」)
//     並排時 舞台 = 容器 − 面板
// ⇒ 面板 ≤ 容器/3 ⇒ **並排只在容器 ≥ 1080 時成立**,更窄就蓋滿舞台。
// 1080 不是挑的數字,是這三條逼出來的唯一解;所以這支閘直接驗那三條,
// 而不是驗「有沒有等於 1080」——數字若哪天因為 MIN 改變而變,閘會自動跟著對。
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

// G3:並排 ↔ 蓋板的斷點與寬度上限
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(process.cwd(), staticArg)) : join(process.cwd(),'storybook-static')
if (statSync('packages/design-system/src/components/AgentPanel/agent-panel.tsx').mtimeMs > statSync(join(S,'index.html')).mtimeMs) {
  console.error(`✗ STALE-BUILD:agent-panel.tsx 比 ${S} 新 —— 先重建該 storybook build`); process.exit(2) }
const M={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}
const sv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=join(S,p);if(!existsSync(f)||statSync(f).isDirectory()){s.writeHead(404);s.end();return}
 s.writeHead(200,{'content-type':M[extname(f)]||'application/octet-stream'});s.end(readFileSync(f))})
await new Promise(r=>sv.listen(0,r))
const B=`http://localhost:${sv.address().port}`
let br
try { br = await chromium.launch({headless:true,args:['--single-process','--no-sandbox']}) }
catch (e) { sv.close(); console.error('⚠️  SKIPPED-ENV: 無法啟動 Chromium(' + String(e.message).split('\n')[0] + ')'); process.exit(0) }
const pg=await br.newPage({viewport:{width:1600,height:800}})
const out=[]; let fail=0
const ck=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`); if(!p)fail++}
for (const W of [1920, 1600, 1280, 1080, 1000, 800]) {
  await pg.setViewportSize({width:W,height:800})
  await pg.goto(`${B}/iframe.html?id=design-system-components-agentpanel-展示--task-assistant&viewMode=story`,{waitUntil:'networkidle'})
  await pg.waitForTimeout(500)
  const r = await pg.evaluate(()=>{
    const p=document.querySelector('[role="complementary"]')
    if(!p) return {err:'找不到面板'}
    let host=p.parentElement
    while(host && getComputedStyle(host).display==='contents') host=host.parentElement
    const cs=getComputedStyle(p)
    const handle=p.querySelector('[role="separator"][aria-orientation="vertical"]')
    return { mode:p.dataset.agentPanelMode, container:host.clientWidth,
      panelW:Math.round(p.getBoundingClientRect().width),
      pos:cs.position, valuemax:handle?+handle.getAttribute('aria-valuemax'):null,
      hasHandle:!!handle,
      // 舞台 = 容器 − 面板(並排時);蓋板時舞台就是整個容器
      stage: host.clientWidth - (cs.position==='absolute'?0:Math.round(p.getBoundingClientRect().width)) }
  })
  if(r.err){ ck(`G3 @${W}`, false, r.err); continue }
  const expectOverlay = r.container < 1080
  ck(`G3 @視窗${W}(容器${r.container}) 形態應為 ${expectOverlay?'蓋板':'並排'}`,
     r.mode === (expectOverlay?'overlay':'side-by-side'), `實得 ${r.mode} / position=${r.pos} / 面板寬 ${r.panelW}`)
  if (!expectOverlay) {
    const expMax = Math.min(640, Math.max(Math.floor(r.container/3), 360))
    ck(`G3 @${W} 寬上限 = min(640, 容器/3) = ${expMax}`, r.valuemax === expMax, `aria-valuemax=${r.valuemax}`)
    ck(`G3 @${W} 面板不超過舞台的一半(面板 ${r.panelW} ≤ 舞台 ${r.stage} / 2)`, r.panelW <= r.stage/2 + 1, `舞台 ${r.stage}`)
  } else {
    ck(`G3 @${W} 蓋板蓋滿舞台`, r.panelW >= r.container - 1, `面板 ${r.panelW} / 容器 ${r.container}`)
    ck(`G3 @${W} 蓋板態不渲染拖曳把手(寬度不再是可選的)`, !r.hasHandle, `hasHandle=${r.hasHandle}`)
  }
}

// ── 初始關閉 → 打開:量測必須跟著重綁(2026-09-08,跨模型審查抓到)────────────
// 根因:面板往上找「有盒子的祖先」時只跳過 `display: contents`,
// 但 Dock 為了「關閉時不卸載」在關閉態是 `display: none` —— 迴圈不跳它,
// 於是量到 clientWidth = 0、`if (w > 0)` 永不觸發、containerPx 卡在 0
// → 上限永遠 640、蓋板永不觸發。而且 useLayoutEffect 空依賴,打開後不會重綁。
// 這是 G2(keep-mounted)與 G3(容器斷點)互相踩到:兩支閘各自都綠,合起來才壞。
for (const W of [800, 1600]) {
  await pg.setViewportSize({width:W,height:800})
  await pg.goto(`${B}/iframe.html?id=design-system-components-agentpanel-展示--fab&viewMode=story`,{waitUntil:'networkidle'})
  await pg.waitForTimeout(400)
  const opened = await pg.evaluate(async () => {
    const fab = [...document.querySelectorAll('button')].find((b) => /代理|agent/i.test(b.getAttribute('aria-label') || ''))
    if (!fab) return { err: '找不到入口鈕' }
    fab.click()
    await new Promise((r) => setTimeout(r, 600))
    const p = document.querySelector('[role="complementary"]')
    if (!p) return { err: '點了入口鈕但面板沒出現' }
    let host = p.parentElement
    while (host && ['contents', 'none'].includes(getComputedStyle(host).display)) host = host.parentElement
    const handle = p.querySelector('[role="separator"][aria-orientation="vertical"]')
    return { mode: p.dataset.agentPanelMode, container: host.clientWidth,
             panelW: Math.round(p.getBoundingClientRect().width),
             valuemax: handle ? +handle.getAttribute('aria-valuemax') : null }
  })
  if (opened.err) { ck(`G3 初始關閉 @${W}`, false, opened.err); continue }
  const expectOverlay = opened.container < 1080
  ck(`G3 初始關閉後打開 @視窗${W}(容器${opened.container}) 形態應為 ${expectOverlay?'蓋板':'並排'}`,
     opened.mode === (expectOverlay ? 'overlay' : 'side-by-side'),
     `實得 ${opened.mode} / 面板寬 ${opened.panelW} / aria-valuemax=${opened.valuemax}`)
  if (!expectOverlay) {
    const expMax = Math.min(640, Math.max(Math.floor(opened.container/3), 360))
    ck(`G3 初始關閉後打開 @${W} 寬上限 = ${expMax}`, opened.valuemax === expMax, `aria-valuemax=${opened.valuemax}`)
  }
}


// ── 蓋板態:宿主必須真的不可操作(v14 條 B)────────────────────────────────
// 「窄螢幕以抽屜蓋滿宿主,**宿主暫不可操作**」——「蓋滿」是視覺,「不可操作」是行為,
// 兩件事。實測(2026-09-08 跨模型審查)真 Tab 走得進被蓋住的宿主按鈕並且 Enter 會執行。
// 視覺上蓋住不等於鍵盤到不了 —— 這正是 M32「宣稱 ≠ 真實」的同一種病。
await pg.setViewportSize({width:800,height:800})
// 用 Fab story:宿主是一張 DataTable,有大量可聚焦控件 ——
// 拿沒有控件的 story 來驗「宿主不可操作」會得到 0/0 的空過(2026-09-08 當場踩到)。
await pg.goto(`${B}/iframe.html?id=design-system-components-agentpanel-展示--fab&viewMode=story`,{waitUntil:'networkidle'})
await pg.waitForTimeout(400)
await pg.evaluate(async () => {
  const fab = [...document.querySelectorAll('button')].find((b) => /代理|agent/i.test(b.getAttribute('aria-label') || ''))
  fab?.click()
  await new Promise((r) => setTimeout(r, 600))
})
const reach = await pg.evaluate(() => {
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
})
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
await br.close(); sv.close(); process.exit(fail?1:0)
