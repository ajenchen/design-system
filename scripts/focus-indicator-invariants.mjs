#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點指示器不變條件(跨元件)
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/ds-canonical/references/focus-canonical.md`
//
// 這支閘守的是**焦點指示器實際畫出來的樣子**,不是 class 字面值 —— DS 已經被同一類
// 「寫了但沒畫」的靜默失效咬過三次(steps.tsx 的 outline-none 吃掉自己的 outline、
// chart.tsx 抑制掉可 Tab 的圖表、FileViewer 選中與聚焦同色),
// 這些用 grep class 一個都抓不到(M32:pixel-quantified verify ≠ attribute existence)。
//
// 四條:
//
//   (F1) **聚焦前後的 computed style 差異集合必須非空**(FileViewer 縮圖)。
//        這條直接抓 C14 那類「已選中的東西被聚焦時 0 像素變化」——
//        選中用 `ring-primary`、聚焦用 `ring-ring`,而 `--ring: var(--primary)`
//        是全 repo 唯一定義,兩者計算值相同。違反 W3C APG「selected 必須與 focus 可區分」。
//        同時驗它**往內**畫:縮圖列是 `overflow-x-auto` 捲動容器,往外會被裁
//        (focus-canonical 問題二)。
//
//   (F2) **一次互動只能有一個指示器**(FileItem)。
//        列上的框只能由那顆隱形的整列鈕觸發;trailing 的 <Button> 自帶 ring,
//        它被聚焦時列**不得**再畫一個。原本裸寫 `has-[:focus-visible]` 不分對象就是兩個框。
//
//   (F3) **單一停靠點的組合元件:容器不畫、目前那一列必須畫**(TreeView)。
//        2026-09-25 起(待辦總帳 B9 路線乙;tree-view.spec.md「A11y 預設」)TreeView 是 role=treegrid + 列上的 roving tabindex:
//        真 DOM 焦點落在列上、容器不可聚焦,列用 `focus-visible:focus-ring-inset` 自己畫框。
//        性質不變:容器與別列都不畫(一次一個指示器),**Tab 進場的當下**那一列就看得到 ——
//        2026-09-07 抓到的缺口是舊虛擬焦點時代「Tab 的 keydown 發生在上一個元素上,樹內的鍵盤旗標沒亮 → 進場不畫」,這條繼續守。
//
//   (F4) **宣稱的上限必須等於真正生效的上限**(AgentPanel 寬度)。
//        `aria-valuemax` 與 clamp 若不同源,螢幕閱讀器念的數字就是假的
//        (視窗 900 時念 640、實際停 450)。跨三個視窗寬度驗。
//
// 為什麼用真瀏覽器:F1 的「差異集合」與 F2 的「有幾個框」都只有 computed style 答得出來。
// 起不了 Chromium 的受限環境回報 SKIPPED-ENV(同 data-table-invariants 先例),不假綠也不假紅。
//
// 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
// Storybook 回報渲染完成(含 play)+ render-health + 被量的元件本身出現 + 版面連續 10 影格靜止,才開始 Tab / 量。
// 取代原本「networkidle + 固定睡 500ms」:舊寫法在 story 開不起來(chunk 缺檔 / 錯誤頁)時照樣往下量 ——
// FileViewer 那段逐一試候選 story,第一支開不起來就**靜靜換下一支**,紅燈永遠不會出現(M37:沒量到被當成沒這回事)。
// 現在任何一支開不起來 = 儀器失效:點名 story、附同源 404、exit 2 —— 不是產品裁決,`--selftest` 下也不算「對照組如預期紅」。
// 「元件是否畫出某個零件」本身是產品裁決的地方(AgentPanel 並排態的調寬把手)不拿來當 waitFor,只等面板本身 + 版面靜止,
// 缺把手照舊是那一條紅,不會被改寫成儀器失效。
//
// Run: `node scripts/focus-indicator-invariants.mjs`(讀 `<cwd>/storybook-static`)

import { statSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowserOrSkip, openStory, requireStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const SELFTEST = process.argv.includes('--selftest')
const STATIC = join(process.cwd(),'storybook-static')
// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記)。原本下一行 statSync 直接 ENOENT 崩掉。
requireStorybookBuild(join(STATIC,'index.json'))
// stale-build 守衛:build 產物必須比任何被驗證的原始碼新,否則驗到的是舊 CSS/JS(假綠)
// lib/roving-list-keyboard.ts:TreeView 的按鍵判定(2026-09-25 B9 拆出、2026-09-26 併入四宿主共用零件);只改判定時也要擋住舊建置
const SRCS = ['packages/design-system/src/components/FileViewer/file-viewer.tsx','packages/design-system/src/components/FileItem/file-item.tsx','packages/design-system/src/components/TreeView/tree-view.tsx','packages/design-system/src/lib/roving-list-keyboard.ts','packages/design-system/src/components/RadioGroup/radio-group.tsx','packages/design-system/src/components/AgentPanel/agent-panel.tsx']
const buildMtime = statSync(join(STATIC,'index.html')).mtimeMs
for (const f of SRCS) { const m = statSync(f).mtimeMs; if (m > buildMtime) { console.error(`✗ STALE-BUILD:${f} 比 storybook-static 新 —— 先跑 npm run build-storybook`); process.exit(2) } }

// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server=await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
// 失敗(非零結束或拋錯)一律附上同源 404 帳本:「儀器沒拿到檔」不得被讀成「元件沒畫框」
process.on('exit',code=>{if(code&&server.notFound.length)console.error('同源 404:',[...new Set(server.notFound)].join(', '))})
const B=server.origin
// 起不了 Chromium → SKIPPED-ENV exit 0(沙箱參數與這條政策都由 lib/launch-browser.mjs 統一給)
const br=await launchBrowserOrSkip()
const pg=await br.newPage({viewport:{width:1280,height:800}})
if (SELFTEST) {
  // 對照組:把焦點指示器整個抹掉 —— 這正是 DS 被咬過三次的那個形狀
  // (steps.tsx 的 outline-none 吃掉自己的 outline、chart.tsx 抑制掉可 Tab 的圖表、
  //  FileViewer 選中與聚焦同色)。addInitScript 才會跟著每一次 go() 重新套用。
  await pg.addInitScript(() => {
    const apply = () => {
      if (document.getElementById('__selftest_kill_focus')) return
      const style = document.createElement('style')
      style.id = '__selftest_kill_focus'
      style.textContent = '*:focus,*:focus-visible{outline:none !important;box-shadow:none !important;}'
      ;(document.head || document.documentElement).appendChild(style)
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply)
    else apply()
  })
}
const out=[];let fails=0
/** 開 story 並證明它真的渲染完成(openStory);開不起來 = 儀器失效:印出已量到的條目、點名 story、exit 2(exit 時附同源 404)。 */
const go=async(id,{waitFor=null}={})=>{
  try{await openStory(pg,`${B}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,{waitFor,settleFrames:10,notFound:server.notFound})}
  catch(error){
    if(!(error instanceof StoryRenderInstrumentError))throw error
    console.log(out.join('\n'))
    console.error(`✗ ${error.message}`)
    console.error('✗ focus-indicator-invariants:儀器失效 —— 這不是產品裁決,也不算通過(--selftest 下不算對照組如預期紅)')
    await br.close();await server.stop();process.exit(2)
  }
}
const check=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`);if(!p)fails++}
// 互動之後等「版面真的停了」(2026-09-25,待辦總帳 C5):lib/launch-browser.mjs 的 settleAfterInteraction ——
// 連續 N 個影格沒有 DOM 變動、沒有進行中的有限長度動畫 / 過渡(與 openStory 同一份判定)。取代本檔原本的固定睡眠
// (點開檢視器 700ms、Tab 後 150 / 250 / 300ms、End 後 350ms):那些是「浮層已開 / 過渡已跑完」的代理(M37),
// 慢的機器上會量到開啟中或過渡中途的值。等不到靜止 = 儀器失效(與開不起來同一條路:exit 2,不是產品裁決)。
const settle=async(label)=>{
  const r=await settleAfterInteraction(pg,{frames:10})
  if(r.ok)return
  console.log(out.join('\n'))
  console.error(`✗ INSTRUMENT-FAIL ${label}:互動之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)—— 儀器失效,不是產品裁決`)
  await br.close();await server.stop();process.exit(2)
}

// ══ J2d / C14 FileViewer 縮圖 ══
let opened=false
const clickMisses=[]
for (const sid of ['design-system-components-fileviewer-設計規格--inspector','design-system-components-fileviewer-設計原則--filmstrip-rule','design-system-components-fileviewer-展示--notion-gallery','design-system-components-fileviewer-展示--event-photos-collection']) {
  // 候選 story 本身開不起來 = 儀器失效(go 內 exit 2);只有「渲染完成、但點不出縮圖列」才換下一支
  await go(sid)
  // story 的觸發鈕位置不固定(Inspector 有 3 顆 control 鈕在前),逐顆試到縮圖出現為止。
  // 點錯鈕時什麼都不會出現,所以不能改成等元素;改成**點完等版面靜止**(settle,用影格不用毫秒)再看縮圖列 ——
  // 原本固定睡 700ms,慢的機器上檢視器還沒開完就判「這顆不是」、換下一顆,最後假紅「開不出縮圖列」(待辦總帳 C5)。
  // 只點看得見、沒停用的鈕;點不到的(被剛開的東西蓋住等)記下原因,全部試完仍沒有縮圖列時一起印出。
  const cands = await pg.$$('button:visible:not([disabled]):not([aria-disabled="true"])')
  for (let i = 0; i < Math.min(cands.length, 8); i++) {
    try { await cands[i].click({ timeout: 5000 }) } catch (error) { clickMisses.push(`${sid.split('--')[1]} 第 ${i + 1} 顆:${String(error?.message||error).split('\n')[0].slice(0,80)}`); continue }
    await settle(`FileViewer ${sid} 點第 ${i + 1} 顆鈕`)
    if (await pg.$('[data-thumb-index]')) break
  }
  if (await pg.$('[data-thumb-index]')) { opened = true; out.push(`… FileViewer 用 story: ${sid.split('--')[1]}`); break }
}
if (!opened) check('J2d FileViewer', false, `所有候選 story 都開不出縮圖列${clickMisses.length ? `(點不到的鈕:${clickMisses.join(';')})` : ''}`)
else {
  // 用真 Tab 走到縮圖(讓 :focus-visible 真的成立,不用程式 focus())
  const res = await pg.evaluate(async () => {
    const snap=el=>{const s=getComputedStyle(el);return{outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,outlineOffset:s.outlineOffset,boxShadow:s.boxShadow}}
    const thumbs=[...document.querySelectorAll('[data-thumb-index]')]
    const active=thumbs.find(t=>t.getAttribute('aria-current')==='true')||thumbs[0]
    const before=snap(active)
    let host=active.parentElement, scrollHost=null
    while(host){const o=getComputedStyle(host);if(o.overflowX!=='visible'||o.overflowY!=='visible'){scrollHost={cls:String(host.className).slice(0,50),ox:o.overflowX};break}host=host.parentElement}
    return {before, scrollHost, idx:thumbs.indexOf(active), total:thumbs.length}
  })
  // Playwright 的 keyboard.press 是真按鍵 → :focus-visible 會成立
  await pg.evaluate(i=>{const t=[...document.querySelectorAll('[data-thumb-index]')];(t[Math.max(0,i-1)]||t[0]).focus()}, res.idx)
  await pg.keyboard.press('Tab')
  // 等 Tab 之後 :focus-visible 的樣式套上、過渡跑完(量的是 outline 樣式 / 寬度 / offset)
  await settle('J2d Tab 到縮圖')
  const after = await pg.evaluate(() => {
    const el=document.activeElement
    if(!el||!el.hasAttribute('data-thumb-index')) return {err:'Tab 沒停在縮圖上,停在 '+el?.tagName}
    const s=getComputedStyle(el)
    return {fvis:el.matches(':focus-visible'), current:el.getAttribute('aria-current'),
      outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineOffset:s.outlineOffset,outlineColor:s.outlineColor,boxShadow:s.boxShadow}
  })
  if (after.err) check('J2d FileViewer', false, after.err)
  else {
    check('J2d 聚焦時 outline 真的畫出來(不是被 outline-none 靜默吃掉)', after.outlineStyle!=='none'&&after.outlineWidth!=='0px', `${after.outlineStyle} ${after.outlineWidth} ${after.outlineColor}`)
    check('J2d 往內畫(縮圖列是捲動容器)', after.outlineOffset==='-2px', after.outlineOffset)
    check('J2d 選中的 ring 與焦點的 outline 走不同通道、可同時看見', after.boxShadow!=='none'&&after.outlineStyle!=='none', `shadow=${after.boxShadow.slice(0,45)} outline=${after.outlineStyle}`)
    check('J2d :focus-visible 真的成立(不是我用程式硬 focus)', after.fvis===true, String(after.fvis))
    check('J2d 前提複驗:縮圖確實在捲動容器內', !!res.scrollHost, JSON.stringify(res.scrollHost))
  }
}

// ══ H1g FileItem ══
await go('design-system-components-fileitem-展示--clickable',{waitFor:'[data-row-focus-target]'})
const fi=await pg.evaluate(()=>{
  // 指示器要**通道無關**地量:DS 兩種幾何都走 outline,但列上的框歷史上是 box-shadow,
  // 而且未來還可能改。寫死通道的測試會在遷移時假紅(2026-09-07 就發生過)。
  const ind=el=>{const c=getComputedStyle(el);return (c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0?`outline:${c.outlineWidth}@${c.outlineOffset}`:'')+(c.boxShadow!=='none'?'|shadow':'')}
  const row=[...document.querySelectorAll('.group\\/row')].find(r=>r.querySelector('[data-row-focus-target]'))
  if(!row)return{err:'找不到列'}
  const base=ind(row); const prim=row.querySelector('[data-row-focus-target]')
  const trail=[...row.querySelectorAll('button')].filter(b=>b!==prim)
  prim.focus(); const onP=ind(row); prim.blur()
  let onT=null,tOwn=null
  if(trail.length){trail[0].focus();onT=ind(row);tOwn=ind(trail[0])}
  return{base,onP,onT,tOwn,n:trail.length}})
if(fi.err)check('H1g FileItem',false,fi.err)
else{
  check('H1g 隱形整列鈕聚焦 → 列上出現框',fi.onP!==fi.base)
  if(fi.n){check('H1g trailing <Button> 聚焦 → 列上不再多畫一個框',fi.onT===fi.base,`列=${String(fi.onT).slice(0,30)}`)
    check('H1g trailing <Button> 自己的框仍在',!!fi.tOwn,fi.tOwn||'(無)')}
  else out.push('… H1g 該 story 無 trailing action')}

// ══ H1f TreeView:Tab 進場 ══
// 2026-09-25 待辦總帳 B9(路線乙):容器由 role=tree + aria-activedescendant 改為 role=treegrid + 列上的 roving tabindex。
// 量的仍是 Tab 進場的當下(F3):焦點真的落在一列上、那一列畫框;容器與其他列都不畫(一次一個指示器)。
// 「整棵樹只有一個 Tab 停靠點、按鍵怎麼走」不在這裡驗 —— 那條的唯一住所是 tree-view-keyboard-route-invariant(一條規則一個閘)。
const TREE_ROW='[role="treegrid"] [data-tree-row]'
await go('design-system-components-treeview-展示--file-browser',{waitFor:TREE_ROW})
await pg.keyboard.press('Tab')
// 等 Tab 進場後 :focus-visible 的框套上、過渡跑完(settle:用影格等版面靜止,不用固定睡眠 —— 待辦總帳 C5)
await settle('H1f Tab 進 TreeView')
const tv=await pg.evaluate((rowSel)=>{
  const root=document.querySelector('[role="treegrid"]')
  if(!root)return{err:'找不到 [role="treegrid"]'}
  const a=document.activeElement
  if(!a||!a.matches(rowSel))return{err:'Tab 沒停在樹的列上,停在 '+(a?.tagName||'null')+(a?.getAttribute?.('role')?`[${a.getAttribute('role')}]`:'')}
  // 通道無關:outline 或 box-shadow 任一有畫就算有游標
  const drawnOf=el=>{const c=getComputedStyle(el);return (c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0)?`outline ${c.outlineWidth}@${c.outlineOffset}`:(c.boxShadow!=='none'&&!/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(c.boxShadow)?'shadow':'')}
  const others=[...root.querySelectorAll('[data-tree-row]')].filter(r=>r!==a&&drawnOf(r)).map(r=>r.dataset.treeRow)
  return{rootIndicator:drawnOf(root),rootTabIndex:root.tabIndex,row:a.dataset.treeRow,rowIndicator:drawnOf(a),others}},TREE_ROW)
if(tv.err)check('H1f TreeView',false,tv.err)
else{
  check('H1f 根容器不可聚焦、也不畫框(框在列上)',tv.rootTabIndex<0&&!tv.rootIndicator,`tabIndex=${tv.rootTabIndex} 容器框=${tv.rootIndicator||'無'}`)
  check('H1f **Tab 進場當下**那列就有可見的鍵盤游標(APG 要求)',!!tv.rowIndicator,`列=${tv.row} ${tv.rowIndicator||'(什麼都沒畫)'}`)
  check('H1f 一次只有一個指示器:其他列都不畫框',tv.others.length===0,tv.others.join(',')||'(無)')}

// ══ J2g AgentPanel ══
// F4 的正確測法:**不重抄公式**,而是驗「宣稱的上限」與「按 End 真正停的位置」一致。
// 先前這裡抄了一份 `min(640, ⌊視窗/2⌋)`,G3 把幾何改成由容器推導之後就整組假紅 ——
// **閘不該複製被測對象的公式**,那等於把同一件事寫兩遍,改一邊就壞。
// 上限本身怎麼算由 `scripts/agent-panel-breakpoint.mjs` 負責。
for(const vw of [1600,1280,1080]){
  await pg.setViewportSize({width:vw,height:800})
  // 等面板本身(量的是它的寬度);調寬把手在不在是這一條的產品裁決,不拿來當 waitFor
  await go('design-system-components-agentpanel-展示--task-assistant',{waitFor:'[role="complementary"]'})
  const h = await pg.$('[role="separator"][aria-orientation="vertical"]')
  if(!h){ check(`J2g @視窗${vw} 有可調寬把手(並排態應該要有)`, false, '找不到 handle'); continue }
  await h.focus()
  await pg.keyboard.press('End')
  // 先等 **End 真的套用**(now 追上 max),再獨立量渲染出來的寬度。
  // 兩個踩過的坑:
  //   固定 sleep 200ms → 量到中途值(實測 527 vs 宣稱 533,看起來像 bug 其實是量太早);
  //   「等寬度不再變」→ 值還沒開始變時就判定成穩定,量到改變**之前**的 400。
  // 等狀態、量結果,兩件事分開,才不會拿自己要斷言的東西當等待條件。
  await pg.waitForFunction(() => {
    const x = document.querySelector('[role="separator"][aria-orientation="vertical"]')
    return x && x.getAttribute('aria-valuenow') === x.getAttribute('aria-valuemax')
  }, null, { timeout: 3000 }).catch(() => {})
  // 等寬度過渡走完再量實寬(End 沒套用的話,下面 now===max 那一條會紅,不是被吞掉)
  await settle(`J2g @視窗${vw} 按 End`)
  const ap = await pg.evaluate(()=>{const x=document.querySelector('[role="separator"][aria-orientation="vertical"]')
    const panel=document.querySelector('[role="complementary"]')
    return {max:+x.getAttribute('aria-valuemax'), now:+x.getAttribute('aria-valuenow'),
      realW:Math.round(panel.getBoundingClientRect().width)}})
  check(`J2g @視窗${vw} 按 End 之後 aria-valuenow 等於宣稱的上限`, ap.now===ap.max, `now=${ap.now} max=${ap.max}`)
  check(`J2g @視窗${vw} 而且面板真的變成那麼寬(宣稱 = 真實)`, Math.abs(ap.realW-ap.max)<=1, `實寬=${ap.realW} 宣稱=${ap.max}`)}

// ══ F5:可操作的元件必須 Tab 得到,而且要畫框(Slider 錨例)══
// 2026-09-07 抓到:全 DS 每一個 slider thumb 的 tabIndex 都是 -1,連按 15 次 Tab 焦點
// 始終停在 body —— **滑桿完全不能用鍵盤操作**(WCAG 2.1.1,Level A)。
// 根因是 `tabIndex={readonly ? -1 : undefined}`:Radix 是 `tabIndex: 0` **之後**才 spread
// 我們的 props(react-slider/dist/index.mjs:440-441 實查),`undefined` 是把它覆蓋掉。
// 「傳 undefined = 不干預」是錯的直覺,所以這條要有閘守著。
await go('design-system-components-slider-設計規格--overview',{waitFor:'[role="slider"]'})
{
  const before = await pg.evaluate(()=>({
    total: document.querySelectorAll('[role="slider"]').length,
    tabbable: [...document.querySelectorAll('[role="slider"]')].filter(t=>t.tabIndex>=0).length }))
  check('F5 前提:這個 story 有 slider(沒有的話以下空轉)', before.total>0, JSON.stringify(before))
  check('F5 每個 slider thumb 都可 Tab(WCAG 2.1.1)', before.total>0 && before.tabbable===before.total,
        `${before.tabbable}/${before.total} 可 Tab`)
  let landed=false
  // 每次 Tab 後稍等再讀 activeElement(只是節奏,判準是「焦點落在 slider 上」本身)
  for(let i=0;i<20;i++){ await pg.keyboard.press('Tab'); await pg.waitForTimeout(70)
    if(await pg.evaluate(()=>document.activeElement?.getAttribute('role')==='slider')){landed=true;break} }
  check('F5 真的用 Tab 走得到 slider', landed)
  // thumb 有 `transition-all duration-150`,連 outline-offset 也一起過渡 ——
  // 太早量會拿到中途值(實測 70ms 時是 1px,看起來像多出第三種幾何,其實是動畫中途)→ 等過渡跑完(settle 會等進行中的過渡)
  await settle('F5 Tab 到 slider')
  if (landed) {
    const st = await pg.evaluate(()=>{const t=document.activeElement; const c=getComputedStyle(t)
      return { fv:t.matches(':focus-visible'), outline:`${c.outlineStyle} ${c.outlineWidth}@${c.outlineOffset}`,
        drawn: c.outlineStyle!=='none' && parseFloat(c.outlineWidth)>0 }})
    check('F5 聚焦時真的畫出框(不是只換一個看不出來的顏色)', st.drawn, st.outline)
  }
}

// ══ F6:單獨的表單控件不得 Tab 不到(WCAG 2.1.1)══
// Slider 那件的 M10 延伸掃描。**刻意只挑「不走 roving tabindex」的三種 role** ——
// option / treeitem / tab / radio / menuitem 在 APG 就是 roving(整組只有一個可 Tab),
// 把它們一起掃只會產生大量合法噪音,閘一吵就沒人看。
// 唯一合法的 tabIndex < 0 是「唯讀或停用」:那時它本來就不該在 Tab 順序裡。
// 2026-09-07 全 DS 465 個 story 掃過一次,除 Slider 外沒有第二處違規。
for (const story of ['design-system-components-switch-展示--modes',
                     'design-system-components-checkbox-展示--modes',
                     'design-system-components-slider-設計規格--overview']) {
  await go(story,{waitFor:'[role="switch"],[role="checkbox"],[role="slider"]'})
  const rows = await pg.evaluate(()=>[...document.querySelectorAll('[role="switch"],[role="checkbox"],[role="slider"]')]
    .map(x=>({ role:x.getAttribute('role'), tab:x.tabIndex,
      excused: x.getAttribute('aria-readonly')==='true' || x.getAttribute('aria-disabled')==='true' || x.hasAttribute('disabled') })))
  const violations = rows.filter(r=>r.tab<0 && !r.excused)
  check(`F6 ${story.split('--')[0].replace('design-system-components-','')}:控件都在 Tab 順序裡(唯讀/停用除外)`,
        rows.length>0 && violations.length===0,
        `${rows.length} 個控件,違規 ${violations.length} 個${violations.length?' → '+JSON.stringify(violations.slice(0,3)):''}`)
}

console.log(out.join('\n'))

if (SELFTEST) {
  // 抹掉焦點框之後,守「焦點畫得出來」的那幾條必須紅;只有「紅了幾條」不夠 ——
  // 要紅在對的地方,否則注入的形狀不對,對照組就沒證明到東西。
  // 2026-09-26:原本的 /J2d|F2|F3|F5/ 對不上 FileItem / TreeView 兩段的條目名(它們叫 H1g / H1f,不含 F2 / F3),
  // 那兩段紅了也不會被點名。改成按條目名比對,並**指定** H1f 的「Tab 進場當下」那條必紅 ——
  // 它是 B9 改寫過的量法,要證明新量法在框被抹掉時真的會紅(M32「儀器要先有對照組」)。
  const focusFails = out.filter((line) => line.startsWith('✗') && /J2d|H1g|H1f|F5/.test(line))
  const treeEntryRed = focusFails.some((line) => line.startsWith('✗ H1f **Tab 進場當下**'))
  await br.close(); await server.stop()
  if (focusFails.length && treeEntryRed) {
    console.log(`\n✓ selftest:抹掉焦點指示器後 ${focusFails.length} 條焦點條目變紅,量具會紅\n${focusFails.join('\n')}`)
    process.exit(0)
  }
  console.log(!focusFails.length
    ? `\n✗ selftest:焦點框被抹掉卻沒有任何焦點條目變紅 —— 這支閘是假綠(總失敗 ${fails})`
    : `\n✗ selftest:焦點框被抹掉,TreeView「Tab 進場當下」那條卻沒紅 —— H1f 量的不是框(焦點條目紅了 ${focusFails.length} 條,總失敗 ${fails})`)
  process.exit(1)
}

console.log(fails?`\n✗ ${fails} 項未通過`:'\n✓ 全部通過')
await br.close(); await server.stop(); process.exit(fails?1:0)
