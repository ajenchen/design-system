#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 拖曳的執行期契約 —— 真滑鼠、真播報
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`lib/drag-announcements.ts`(播報)+ `lib/drag-visual.ts`(啟動門檻)
//        + `ds-canonical/references/drag-canonical.md` 共同 invariant 2「無意圖不得 commit」
//
// 這支閘用**真的滑鼠事件**驗三件先前只能靠靜態掃描的事:
//
//   (C4) **零位移不得啟動拖曳**。按下不動就啟動的話,使用者只想點一下核取方塊,
//        卻會收到 aria-pressed=true 與兩則 assertive 播報。
//        根因是那兩個面板的 DndContext 從來沒傳 `sensors`,吃了 dnd-kit 的零距離預設。
//        **同時驗反面**:超過門檻後拖曳仍要能啟動 —— 否則「修好」只是把功能鎖死。
//
//   (C1) **放回原位必須說「未變更順序」**。dnd-kit 從自己的生命週期播報,
//        不知道我們的守衛已經 return、根本沒重排 —— 那會對螢幕閱讀器宣稱假結果。
//        這是整組拖曳播報最關鍵的一條,而且**只有跑起來才驗得到**。
//
//   (C5) **拖曳中的 ghost 不得進無障礙樹**。overlay 是 source 的 outerHTML 完整複製,
//        連 role 一起複製 → 7 欄的表格在拖曳中會查到 8 個 columnheader。
//
//   (C3) **鍵盤一次按鍵跨一格**,而且**播報要跟真實順序一致**。
//        dnd-kit 預設每按一次只移 25px,欄寬 100–240px → 移一格要按 11 次。
//        第二條抓的是「說已移動但其實沒動」——受控 columnOrder 漏列某一欄時就會這樣。
//
// 為什麼用「播報有沒有出現」當拖曳啟動的證明,而不用 `aria-pressed`:
// 那個屬性在拖曳結束後就被清掉,拿它做事後斷言會量到 null 而誤判(2026-09-07 踩過)。
//
// 抓拖曳目標時注意:DataTable 第一顆表頭是**鎖定欄**(`data-column-locked`,不可拖),
// 必須抓有 `aria-roledescription` 的那種,否則「拖了沒事」會被誤判成通過(也踩過)。
//
// Run: `node scripts/drag-runtime-contract.mjs`

import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const S=join(process.cwd(),'storybook-static')
// stale-build 守衛:量到舊 DOM = 假綠
for (const f of ['packages/design-system/src/lib/drag-announcements.ts','packages/design-system/src/lib/drag-visual.ts',
                 'packages/design-system/src/components/DataTable/data-table.tsx',
                 'packages/design-system/src/components/DataTable/data-table-column-visibility-panel.tsx']) {
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
const pg=await br.newPage({viewport:{width:1600,height:1000}})
const out=[]; let fail=0
const ck=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`); if(!p)fail++}
const live = () => pg.evaluate(()=>[...document.querySelectorAll('[aria-live]')].map(n=>({l:n.getAttribute('aria-live'),t:(n.textContent||'').trim()})).filter(x=>x.t))

for (const [panel, label] of [['欄位顯示','欄位顯示面板'], ['排序','排序面板']]) {
  await pg.goto(`${B}/iframe.html?id=design-system-components-datatable-展示--with-bulk-actions&viewMode=story`,{waitUntil:'networkidle'})
  await pg.waitForTimeout(600)
  const trigger = await pg.$(`button[aria-label="${panel}"]`)
  if(!trigger){ ck(`C4 ${label}:找得到觸發鈕`, false); continue }
  await trigger.click(); await pg.waitForTimeout(500)
  const handle = await pg.$('[aria-label="拖曳重排"]')
  if(!handle){ out.push(`… ${label} 沒有拖曳把手,略過`); continue }
  const box = await handle.boundingBox()
  const cx = box.x+box.width/2, cy = box.y+box.height/2

  // (1) 零位移:按下、不動、放開 → 不得啟動拖曳、不得播報
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.waitForTimeout(250)
  const zeroPressed = await pg.evaluate(()=>document.querySelector('[aria-label="拖曳重排"]')?.getAttribute('aria-pressed'))
  const zeroLive = await live()
  await pg.mouse.up(); await pg.waitForTimeout(150)
  ck(`C4 ${label}:零位移不得啟動拖曳`, zeroPressed !== 'true', `aria-pressed=${zeroPressed}`)
  ck(`C4 ${label}:零位移不得播報`, zeroLive.length === 0, JSON.stringify(zeroLive))

  // (2) 超過門檻(移 20px)→ 必須啟動,證明門檻不是把功能鎖死
  await pg.mouse.move(cx, cy); await pg.mouse.down()
  for (const dy of [3, 10, 20, 40]) { await pg.mouse.move(cx, cy+dy, {steps:3}); await pg.waitForTimeout(70) }
  const movedLive = await live()
  // 用「播報有沒有出現」當拖曳啟動的證明,不用 aria-pressed —— 那個屬性在拖曳結束後就被清掉,
  // 拿它當事後斷言會量到 null 而誤判(2026-09-07 踩過)。
  ck(`C4 ${label}:超過門檻後拖曳仍可啟動(門檻沒把功能鎖死)`,
     movedLive.some(x=>/提起|移到|不在可放置/.test(x.t)), JSON.stringify(movedLive).slice(0,140))
  ck(`C4 ${label}:播報是繁中`, movedLive.length>0 && movedLive.every(x=>/[\u4e00-\u9fff]/.test(x.t)), JSON.stringify(movedLive).slice(0,140))
  await pg.mouse.up(); await pg.waitForTimeout(250)
  const endLive = await live()
  ck(`C4 ${label}:放開後有結果播報`, endLive.some(x=>/已移動|未變更/.test(x.t)), JSON.stringify(endLive).slice(0,140))

  // (3) C1 的核心:拉起來又放回原位 → 必須說「未變更順序」,不得謊稱成功
  await pg.mouse.move(cx, cy); await pg.mouse.down()
  for (const dy of [3, 10, 20]) { await pg.mouse.move(cx, cy+dy, {steps:3}); await pg.waitForTimeout(60) }
  await pg.mouse.move(cx, cy, {steps:5}); await pg.waitForTimeout(120)
  await pg.mouse.up(); await pg.waitForTimeout(300)
  const noopLive = await live()
  ck(`C1 ${label}:放回原位必須說「未變更順序」,不得謊稱已移動`,
     noopLive.some(x=>/未變更順序/.test(x.t)), JSON.stringify(noopLive).slice(0,140))
}

// ── C5:拖曳中的 ghost 不得進無障礙樹 ──
await pg.goto(`${B}/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story`,{waitUntil:'networkidle'})
await pg.waitForTimeout(600)
const beforeN = await pg.evaluate(()=>document.querySelectorAll('[role="columnheader"]').length)
// 第一顆是鎖定欄,要抓有 aria-roledescription 的
const dragHdr = await pg.$('[role="columnheader"][data-column-id][aria-roledescription]')
if (!dragHdr) ck('C5 找得到可拖曳表頭', false)
else {
  const hb = await dragHdr.boundingBox()
  await pg.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2); await pg.mouse.down()
  for (const dx of [3,12,30,80,140]) { await pg.mouse.move(hb.x+hb.width/2+dx, hb.y+hb.height/2, {steps:4}); await pg.waitForTimeout(60) }
  const during = await pg.evaluate(()=>{
    const ov=document.querySelector('[class*="bg-surface-raised"][class*="pointer-events-none"]')
    return { started: !!ov, ah: ov?ov.getAttribute('aria-hidden'):null,
      dom: document.querySelectorAll('[role="columnheader"]').length,
      at: [...document.querySelectorAll('[role="columnheader"]')].filter(e=>!e.closest('[aria-hidden="true"]')).length }
  })
  await pg.mouse.up(); await pg.waitForTimeout(200)
  ck('C5 前提:拖曳真的啟動了(否則以下數字是假綠)', during.started, JSON.stringify(during))
  ck('C5 ghost 掛了 aria-hidden', during.ah==='true', String(during.ah))
  ck('C5 AT 看得見的 columnheader 數量不變', during.at===beforeN, `平常 ${beforeN} / 拖曳中 AT 可見 ${during.at}(DOM 含 ghost ${during.dom})`)
}

// ── C3:鍵盤重排 —— 一次一格,而且播報要跟真實順序一致 ──
{
  const order = () => pg.evaluate(() => [...document.querySelectorAll('[role="columnheader"][data-column-id]')]
    .filter(h => !h.closest('[aria-hidden="true"]'))   // 排除 DragOverlay 的 ghost,否則會多算一欄
    .map(h => h.dataset.columnId).join(','))
  for (const n of [1, 3]) {
    await pg.goto(`${B}/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story`,{waitUntil:'networkidle'})
    await pg.waitForTimeout(500)
    const before = await order()
    const focused = await pg.evaluate(() => {
      // 第一顆是鎖定欄,要抓有 aria-roledescription 的
      const h = document.querySelector('[role="columnheader"][data-column-id][aria-roledescription]')
      if (!h) return null; h.focus(); return h.dataset.columnId })
    if (!focused) { ck('C3 找得到可用鍵盤拖曳的表頭', false); break }
    await pg.keyboard.press('Space'); await pg.waitForTimeout(200)
    for (let i = 0; i < n; i++) { await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(140) }
    await pg.keyboard.press('Space'); await pg.waitForTimeout(400)
    const after = await order()
    const endLive = await live()
    const beforeArr = before.split(','), afterArr = after.split(',')
    const moved = afterArr.indexOf(focused) - beforeArr.indexOf(focused)
    // 一次按鍵 = 跨一格。沒有這條的話,dnd-kit 預設每次只移 25px,欄寬 100–240px
    // 意味著「移一格要按 11 次」—— 能操作但沒人會用(2026-09-07 實測)。
    ck(`C3 ArrowRight×${n} 應該正好移動 ${n} 格`, moved === n, `『${focused}』移了 ${moved} 格:${after}`)
    // 播報必須與真實順序一致 —— 「說已移動但其實沒動」正是 C1 那類謊報
    const claimsMoved = endLive.some(x => /已移動/.test(x.t))
    ck(`C3 ArrowRight×${n} 播報與真實順序一致`, claimsMoved === (after !== before), JSON.stringify(endLive))
  }
}

console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); sv.close(); process.exit(fail?1:0)
