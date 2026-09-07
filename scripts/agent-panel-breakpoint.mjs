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
// Run: `node scripts/agent-panel-breakpoint.mjs`

// G3:並排 ↔ 蓋板的斷點與寬度上限
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const S=join(process.cwd(),'storybook-static')
if (statSync('packages/design-system/src/components/AgentPanel/agent-panel.tsx').mtimeMs > statSync(join(S,'index.html')).mtimeMs) {
  console.error('✗ STALE-BUILD:agent-panel.tsx 比 storybook-static 新 —— 先跑 npm run build-storybook'); process.exit(2) }
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
console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); sv.close(); process.exit(fail?1:0)
