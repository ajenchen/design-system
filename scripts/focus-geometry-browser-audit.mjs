#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點框幾何實測閘 —— 「這個框會不會被裁 / 會不會撞到鄰居」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/ds-canonical/references/focus-canonical.md`「問題二」
//
// `focus-geometry-invariant.mjs` 是靜態的(守「只准兩種幾何」),這一支是動態的
// (守「每一站選對了那一種」)。兩支合起來才完整:靜態掃不出「這個元素四周有沒有空間」。
//
// 判準只有一句(user 2026-09-07 逐字):**預設往外;只有當元素可能合法地被塞在四周
// 沒有足夠視覺空間的地方,才往內。** 機械化就是:真的畫出來,量框有沒有越界。
//
// 三類豁免(不是放水,是判準本來就不涵蓋):
//   (a) 已經是內描邊(grow ≤ 0)—— 框畫在元素裡面,任何越界都是**元素自己**早就越界
//   (b) 行內元素 —— 瀏覽器原生焦點框壓到相鄰文字是全網慣例
//   (c) 浮層(fixed / absolute)—— 它本來就疊在別的東西上面
//
// 為什麼要真瀏覽器:「四周有沒有 2px」這件事只有排版跑完才知道,原始碼看不出來。
// 2026-09-07 第一版量法把「祖先的內容邊」一律當障礙,結果全 DS 每一站都判成 0 —— 錯在
// **不裁切的祖先根本不會切到框**。修正後 72 站往外、1 站往內,才是合理分佈。
//
// 起不了 Chromium 的受限環境回報 SKIPPED-ENV(同 data-table-invariants 先例)。
//
// Run: `node scripts/focus-geometry-browser-audit.mjs`

// 焦點框「會不會被裁 / 會不會撞到鄰居」偵測器
// 決定每一站該用外描邊(全域)還是內描邊(focus-ring-inset)。判準 SSOT:focus-canonical 問題二。
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'

const STATIC=join(process.cwd(),'storybook-static')
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'}
const sv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html'
 const f=join(STATIC,p);if(!existsSync(f)||statSync(f).isDirectory()){s.writeHead(404);s.end();return}
 s.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});s.end(readFileSync(f))})
await new Promise(r=>sv.listen(0,r))
const B=`http://localhost:${sv.address().port}`
let br
try { br = await chromium.launch({headless:true,args:['--single-process','--no-sandbox']}) }
catch (e) { sv.close(); console.error('⚠️  SKIPPED-ENV: 無法啟動 Chromium(' + String(e.message).split('\n')[0] + ')'); process.exit(0) }

const DETECT = `(() => {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) return null
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  const cs = getComputedStyle(el)
  const desc = el.tagName.toLowerCase() + (el.getAttribute('role')?'['+el.getAttribute('role')+']':'') + '.' + String(el.className).split(/\\s+/).filter(Boolean).slice(0,2).join('.')
  const off = parseFloat(cs.outlineOffset) || 0
  const w = parseFloat(cs.outlineWidth) || 0
  const drawn = cs.outlineStyle !== 'none' && w > 0
  // 框實際佔到的外框(往外為正)
  const grow = off + w
  const box = { top: r.top - grow, right: r.right + grow, bottom: r.bottom + grow, left: r.left - grow }
  const EPS = 0.5
  const problems = []
  // 三類不算「框的問題」:
  //  (a) grow <= 0 —— 框完全畫在元素內,任何超出都是**元素自己**早就超出去,與焦點框無關
  //  (b) 行內元素 —— 瀏覽器原生焦點框壓到相鄰文字是全網慣例,不視為碰撞
  //  (c) 浮層(fixed / absolute 且脫離文件流)—— 它本來就疊在別的東西上面
  const inline = cs.display === 'inline'
  const floating = cs.position === 'fixed' || cs.position === 'absolute'
  const exempt = grow <= 0 || inline || floating
  if (exempt) return { desc, drawn, style: cs.outlineStyle+' '+cs.outlineWidth+' @'+cs.outlineOffset,
    color: cs.outlineColor, size: r.width.toFixed(0)+'x'+r.height.toFixed(0), problems: [],
    exempt: grow<=0?'已內描邊':inline?'行內':'浮層', boxShadow: cs.boxShadow==='none'?'':'有' }
  // (1) 會裁切的祖先:框有沒有超出它的 padding box
  let p = el.parentElement
  while (p && p !== document.documentElement) {
    const pcs = getComputedStyle(p)
    if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') {
      const pr = p.getBoundingClientRect()
      const inner = {
        top: pr.top + parseFloat(pcs.borderTopWidth), bottom: pr.bottom - parseFloat(pcs.borderBottomWidth),
        left: pr.left + parseFloat(pcs.borderLeftWidth), right: pr.right - parseFloat(pcs.borderRightWidth) }
      const clipX = pcs.overflowX !== 'visible', clipY = pcs.overflowY !== 'visible'
      const cut = []
      if (clipY && box.top < inner.top - EPS) cut.push('上' + (inner.top - box.top).toFixed(1))
      if (clipY && box.bottom > inner.bottom + EPS) cut.push('下' + (box.bottom - inner.bottom).toFixed(1))
      if (clipX && box.left < inner.left - EPS) cut.push('左' + (inner.left - box.left).toFixed(1))
      if (clipX && box.right > inner.right + EPS) cut.push('右' + (box.right - inner.right).toFixed(1))
      if (cut.length) problems.push({ kind: '被裁', by: p.tagName.toLowerCase()+'.'+String(p.className).split(/\\s+/).filter(Boolean).slice(0,2).join('.'), detail: cut.join(' ') })
    }
    p = p.parentElement
  }
  // (2) 鄰居碰撞:框有沒有壓到不重疊的可見鄰居
  for (const o of document.querySelectorAll('*')) {
    if (o === el || el.contains(o) || o.contains(el)) continue
    const ocs = getComputedStyle(o)
    if (ocs.display==='none' || ocs.visibility==='hidden' || parseFloat(ocs.opacity)===0) continue
    const b = o.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    // 疊層的不算鄰居(user 2026-09-07:疊起來的徽章不算)
    const already = b.left < r.right-EPS && b.right > r.left+EPS && b.top < r.bottom-EPS && b.bottom > r.top+EPS
    if (already) continue
    const hit = b.left < box.right-EPS && b.right > box.left+EPS && b.top < box.bottom-EPS && b.bottom > box.top+EPS
    if (hit) { problems.push({ kind: '撞鄰居', by: o.tagName.toLowerCase()+'.'+String(o.className).split(/\\s+/).filter(Boolean).slice(0,2).join('.'), detail: '' }); break }
  }
  return { desc, drawn, style: cs.outlineStyle+' '+cs.outlineWidth+' @'+cs.outlineOffset, color: cs.outlineColor,
    size: r.width.toFixed(0)+'x'+r.height.toFixed(0), problems, boxShadow: cs.boxShadow==='none'?'':'有' }
})()`

const idx = JSON.parse(readFileSync(join(STATIC,'index.json'),'utf8'))
// **元件清單從 storybook 索引自動推導,不寫死。**
// 2026-09-07:原本是一份手寫的 39 個名字,而 DS 有 67 個元件 —— 漏了 Input / Select /
// Textarea / Dialog / Sheet / Pagination 等 29 個,卻在報告裡宣稱「全 DS」。
// 寫死的清單還有個更糟的性質:**新元件不會自動進來**,漏了也不會有人發現。
const COMPS = [...new Set(
  Object.values(JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries)
    .map((e) => e.title.replace(/\s/g, '').match(/Components\/([^/]+)/)?.[1])
    .filter(Boolean),
)]
console.log(`涵蓋 ${COMPS.length} 個元件(清單自 storybook 索引推導,新元件自動納入)\n`)
const report = {}
const pg = await br.newPage({ viewport:{width:1440,height:900} })
for (const theme of ['light','dark']) {
  for (const comp of COMPS) {
    const cands = Object.values(idx.entries).filter(e=>e.title.replace(/\s/g,'').includes(`/${comp}/`) && !/--docs$/.test(e.id) && !/usage-guidance|inspector|-rule$/.test(e.id))
    const story = cands.find(e=>/展示/.test(e.title)) || cands.find(e=>/state-behavior|overview|accessibility/.test(e.id)) || cands[0]
    if (!story) { if(theme==='light') report[comp]={err:'無 story'}; continue }
    try {
      await pg.goto(`${B}/iframe.html?id=${story.id}&viewMode=story`,{waitUntil:'networkidle',timeout:20000})
      // DS 的主題是 <html data-theme>,不是 prefers-color-scheme(semantic.css:424 / primitives.css:259)
      await pg.evaluate(t => { document.documentElement.dataset.theme = t }, theme)
      await pg.waitForTimeout(400)
      const seen=new Set(), rows=[]
      for (let i=0;i<45;i++) {
        await pg.keyboard.press('Tab')
        const m = await pg.evaluate(DETECT)
        if (!m) continue
        const k = m.desc+'|'+m.size
        if (seen.has(k)) continue
        seen.add(k); rows.push(m)
        if (rows.length>=14) break
      }
      report[comp] = report[comp] || { story: story.id }
      report[comp][theme] = rows
    } catch(e) { report[comp] = { err: String(e.message).split('\n')[0].slice(0,60) } }
  }
}
await pg.close()
writeFileSync(process.env.TMPDIR+'/clipdetect.json', JSON.stringify(report,null,1))

let noFrame=0, clipped=0, ok=0
console.log('══ 沒有畫框的(可能是 WCAG 違規,也可能指示器在別的元素上)══')
for (const [c,v] of Object.entries(report)) {
  if (v.err) { console.log(`  ${c}: ✗ ${v.err}`); continue }
  for (const r of (v.light||[])) if (!r.drawn && !r.boxShadow) { console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,50)} ${r.size}`); noFrame++ }
}
console.log('\n══ 框會被裁 / 會撞到鄰居 → 應改內描邊 ══')
for (const [c,v] of Object.entries(report)) {
  if (v.err) continue
  for (const r of (v.light||[])) if (r.drawn && r.problems.length) {
    console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,44).padEnd(44)} ${r.style.padEnd(20)} ${r.problems.map(p=>p.kind+'('+p.detail+')←'+p.by.slice(0,26)).join(' ')}`); clipped++ }
}
console.log('\n══ 深色主題下有無殘留白間隙(box-shadow 通道)══')
for (const [c,v] of Object.entries(report)) {
  if (v.err) continue
  for (const r of (v.dark||[])) if (r.boxShadow) console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,44)} boxShadow=${r.boxShadow}`)
}
for (const v of Object.values(report)) if(!v.err) for (const r of (v.light||[])) if (r.drawn && !r.problems.length) ok++
console.log(`\n合計:正常外描邊 ${ok} / 需改內描邊 ${clipped} / 無框 ${noFrame}`)
await br.close(); sv.close()
// 基準線:1 站 —— Combobox story 裡那顆與欄位相鄰的 <Button>。它是共用 primitive,
// 外描邊壓到鄰接控件外緣 2px 是各家(Material / Atlassian)都接受的,不是元件缺陷。
const BASELINE = 1
if (clipped > BASELINE) { console.error(`\n✗ 有 ${clipped} 站的焦點框會被裁或撞到鄰居(基準線 ${BASELINE})`); process.exit(1) }
console.log('✓ 焦點框幾何全部正確')
