#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AgentPanel 關閉後再打開:狀態必須還在(spec E 條「閱讀位置保存」/ F 條「初始化為關閉」)
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`components/AgentPanel/agent-panel.spec.md`「放置與互斥」段。
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
// Run: `node scripts/agent-panel-reopen-state.mjs`

// G2:關閉面板後再打開,閱讀位置與草稿必須還在
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const S=join(process.cwd(),'storybook-static')
for (const f of ['packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx',
                 'packages/design-system/src/components/AgentPanel/agent-panel.tsx']) {
  if (statSync(f).mtimeMs > statSync(join(S,'index.html')).mtimeMs) {
    console.error(`✗ STALE-BUILD:${f} 比 storybook-static 新 —— 先跑 npm run build-storybook`); process.exit(2) }
}
const M={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}
const sv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=join(S,p);if(!existsSync(f)||statSync(f).isDirectory()){s.writeHead(404);s.end();return}
 s.writeHead(200,{'content-type':M[extname(f)]||'application/octet-stream'});s.end(readFileSync(f))})
await new Promise(r=>sv.listen(0,r))
const B=`http://localhost:${sv.address().port}`
let br
try { br = await chromium.launch({headless:true,args:['--single-process','--no-sandbox']}) }
catch (e) { sv.close(); console.error('⚠️  SKIPPED-ENV: 無法啟動 Chromium(' + String(e.message).split('\n')[0] + ')'); process.exit(0) }
// 視窗壓矮,讓對話一定超出可視高度 —— 否則「閱讀位置保存」這條會空轉
// 視窗壓到很矮,對話才會有足夠的捲動範圍 —— 範圍太小的話「捲到中間」與「自動捲到底」
// 會落在同一個值,測試就分不出有沒有回歸(2026-09-07 踩過:max=60 時兩者都是 60)
const pg=await br.newPage({viewport:{width:1600,height:300}})
const idx=JSON.parse(readFileSync(join(S,'index.json'),'utf8'))
const st={id:'design-system-components-agentpanel-展示--task-assistant'}
console.log('story:', st.id)
await pg.goto(`${B}/iframe.html?id=${st.id}&viewMode=story`,{waitUntil:'networkidle'}); await pg.waitForTimeout(800)
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
  await pg.waitForTimeout(250)
  const before = await state()
  // 按關閉
  const closed = await pg.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/關閉/.test(x.getAttribute('aria-label')||'')); if(b){b.click();return true} return false })
  await pg.waitForTimeout(500)
  const mid = await state()
  // 再打開
  await pg.evaluate(()=>{ const f=document.querySelector('button[aria-haspopup="menu"]'); f?.click() })
  await pg.waitForTimeout(600)
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
console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); sv.close(); process.exit(fail?1:0)
