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
//   (F3) **虛擬焦點元件:容器不畫、目前那一列必須畫**(TreeView)。
//        DOM 焦點永遠停在 role=tree 容器,指示器畫在 aria-activedescendant 指到的列上。
//        兩個都畫 = 兩個指示器;兩個都不畫 = 聚焦了卻看不見(APG 明文要求作者自己畫)。
//        **量的是 Tab 進場的當下** —— 這正是 2026-09-07 抓到的缺口:
//        `isKeyboardRef` 只在樹內 keydown 才變 true,而 Tab 的 keydown 發生在上一個元素上。
//
//   (F4) **宣稱的上限必須等於真正生效的上限**(AgentPanel 寬度)。
//        `aria-valuemax` 與 clamp 若不同源,螢幕閱讀器念的數字就是假的
//        (視窗 900 時念 640、實際停 450)。跨三個視窗寬度驗。
//
// 為什麼用真瀏覽器:F1 的「差異集合」與 F2 的「有幾個框」都只有 computed style 答得出來。
// 起不了 Chromium 的受限環境回報 SKIPPED-ENV(同 data-table-invariants 先例),不假綠也不假紅。
//
// Run: `node scripts/focus-indicator-invariants.mjs`

import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const STATIC = join(process.cwd(),'storybook-static')
// stale-build 守衛:build 產物必須比任何被驗證的原始碼新,否則驗到的是舊 CSS/JS(假綠)
const SRCS = ['packages/design-system/src/components/FileViewer/file-viewer.tsx','packages/design-system/src/components/FileItem/file-item.tsx','packages/design-system/src/components/TreeView/tree-view.tsx','packages/design-system/src/components/RadioGroup/radio-group.tsx','packages/design-system/src/components/AgentPanel/agent-panel.tsx']
const buildMtime = statSync(join(STATIC,'index.html')).mtimeMs
for (const f of SRCS) { const m = statSync(f).mtimeMs; if (m > buildMtime) { console.error(`✗ STALE-BUILD:${f} 比 storybook-static 新 —— 先跑 npm run build-storybook`); process.exit(2) } }

const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'}
const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=join(STATIC,p);if(!existsSync(f)||statSync(f).isDirectory()){s.writeHead(404);s.end();return}
 s.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});s.end(readFileSync(f))})
await new Promise(r=>server.listen(0,r))
const B=`http://localhost:${server.address().port}`
let br; try{br=await chromium.launch({headless:true,args:['--single-process','--no-sandbox']})}
catch(e){server.close();console.error('SKIPPED-ENV',String(e.message).split('\n')[0]);process.exit(0)}
const pg=await br.newPage({viewport:{width:1280,height:800}})
const go=async id=>{await pg.goto(`${B}/iframe.html?id=${id}&viewMode=story`,{waitUntil:'networkidle'});await pg.waitForTimeout(500)}
const out=[];let fails=0
const check=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`);if(!p)fails++}

// ══ J2d / C14 FileViewer 縮圖 ══
let opened=false
for (const sid of ['design-system-components-fileviewer-設計規格--inspector','design-system-components-fileviewer-設計原則--filmstrip-rule','design-system-components-fileviewer-展示--notion-gallery','design-system-components-fileviewer-展示--event-photos-collection']) {
  await go(sid)
  // story 的觸發鈕位置不固定(Inspector 有 3 顆 control 鈕在前),逐顆試到縮圖出現為止
  const cands = await pg.$$('button')
  for (let i = 0; i < Math.min(cands.length, 8); i++) {
    try { await cands[i].click({ timeout: 1200 }); await pg.waitForTimeout(700) } catch {}
    if (await pg.$('[data-thumb-index]')) break
  }
  if (await pg.$('[data-thumb-index]')) { opened = true; out.push(`… FileViewer 用 story: ${sid.split('--')[1]}`); break }
}
if (!opened) check('J2d FileViewer', false, '所有候選 story 都開不出縮圖列')
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
  await pg.waitForTimeout(150)
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
await go('design-system-components-fileitem-展示--clickable')
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
await go('design-system-components-treeview-展示--file-browser')
await pg.keyboard.press('Tab')
await pg.waitForTimeout(250)
const tv=await pg.evaluate(()=>{
  const root=document.querySelector('[role="tree"]')
  if(document.activeElement!==root)return{err:'Tab 沒停在 tree 上,停在 '+document.activeElement?.tagName}
  const rs=getComputedStyle(root); const ad=root.getAttribute('aria-activedescendant')
  const li=ad?document.getElementById(ad):null
  const rowEl=li?li.querySelector('[data-tree-row]'):null
  const c=rowEl?getComputedStyle(rowEl):null
  // 通道無關:outline 或 box-shadow 任一有畫就算有游標
  const drawn=c?((c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0)?`outline ${c.outlineWidth}@${c.outlineOffset}`:(c.boxShadow!=='none'&&!/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(c.boxShadow)?'shadow':'')):''
  return{rootOutline:`${rs.outlineStyle} ${rs.outlineWidth}`,ad,liFound:!!li,rowIndicator:drawn}})
if(tv.err)check('H1f TreeView',false,tv.err)
else{
  check('H1f 根容器不再被全域框畫一圈',tv.rootOutline.startsWith('none'),tv.rootOutline)
  check('H1f aria-activedescendant 指到真實的列',tv.liFound,String(tv.ad))
  check('H1f **Tab 進場當下**那列就有可見的鍵盤游標(APG 要求)',!!tv.rowIndicator,tv.rowIndicator||'(什麼都沒畫)')}

// ══ J2g AgentPanel ══
for(const vw of [1280,900,700]){
  await pg.setViewportSize({width:vw,height:800})
  await go('design-system-components-agentpanel-展示--task-assistant')
  const ap=await pg.evaluate(()=>{const h=document.querySelector('[role="separator"][aria-orientation="vertical"]')
    return h?{max:+h.getAttribute('aria-valuemax'),now:+h.getAttribute('aria-valuenow'),w:innerWidth}:{err:'無 handle'}})
  if(ap.err){check(`J2g @${vw}`,false,ap.err);continue}
  const exp=Math.min(640,Math.max(Math.floor(ap.w/2),360))
  check(`J2g @視窗${vw} aria-valuemax=${ap.max} 等於真正上限 ${exp}`,ap.max===exp,`now=${ap.now}`)}

console.log(out.join('\n')); console.log(fails?`\n✗ ${fails} 項未通過`:'\n✓ 全部通過')
await br.close(); server.close(); process.exit(fails?1:0)
