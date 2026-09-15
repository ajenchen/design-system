#!/usr/bin/env node
/**
 * 骨架底畫法的 Skia 光柵成本(合成頁面隔離實驗,2026-09-14;結論收在 data-table.tsx 的骨架底 docblock)。
 * 同一塊 1680×4900(視窗 + 預繪區)DPR2、同樣的視覺結果,四種畫法各量三次取中位:
 *   空層(null control,必須接近 0)/ 純色 / 13 層漸層(現行畫法)/ 實心 <div> 色條(兩種節點數)。
 * 量法:CDP LayerTree.makeSnapshot + profileSnapshot 重放同一份 display list。
 * 這是決策紀錄的可重跑依據,不是 CI 閘;數字會隨 Chromium 版本浮動,看的是倍數關係。
 * 用法:node scripts/probe-skeleton-band-raster.mjs
 */
// 同樣的視覺結果(骨架色條),兩種畫法的 Skia 光柵成本:
//   (a) 13 層漸層(現行骨架底的畫法)
//   (b) 實心 <div> 色條(每 40px 一列 × 每欄一根)
//   (c) 純色(下限對照)
// 量的是「視窗 + 預繪」1680×4900 這塊,DPR2。null control:空層必須接近 0。
import { launchBrowser } from './lib/launch-browser.mjs'
const COLS=[129.6,63.6,45.6,81.6,69.6,105.6,57.6,57.6,45.6,93.6,39.6,45.6,72.6]
const PITCH=40, H=19160, W=1680, CLIP=4900
const gradientStyle=()=>{
  const img=[],size=[],pos=[],rep=[]; let x=0
  for(const w of COLS){
    img.push('linear-gradient(to bottom, transparent 0 14px, rgba(0,0,0,.04) 14px 26px, transparent 26px 100%)')
    size.push(`${w}px ${PITCH}px`); pos.push(`${x}px 0`); rep.push('repeat-y'); x+=w+12
  }
  img.push(`linear-gradient(to bottom, transparent 0 ${PITCH-1}px, rgba(0,0,0,.09) ${PITCH-1}px ${PITCH}px)`)
  size.push(`100% ${PITCH}px`); pos.push('0 0'); rep.push('repeat')
  return {backgroundImage:img.join(','),backgroundSize:size.join(','),backgroundPosition:pos.join(','),backgroundRepeat:rep.join(',')}
}
const run=async(label,mode,rows)=>{
  const b=await launchBrowser(); const ctx=await b.newContext({viewport:{width:W,height:900},deviceScaleFactor:2}); const p=await ctx.newPage()
  const cdp=await ctx.newCDPSession(p)
  await p.setContent(`<body style="margin:0;background:#fff"><div id=band style="position:relative;width:${W}px;height:${H}px"></div></body>`)
  const nodes=await p.evaluate(({mode,cols,pitch,h,w,rows})=>{
    const band=document.getElementById('band')
    if(mode==='solid'){ band.style.backgroundColor='#f6f6f6'; return 0 }
    if(mode==='empty') return 0
    if(mode==='divs'){
      band.style.backgroundColor='#f6f6f6'
      const n=Math.min(rows, Math.ceil(h/pitch)); const frag=document.createDocumentFragment()
      for(let i=0;i<n;i++){ let x=0
        for(const cw of cols){ const d=document.createElement('div')
          d.style.cssText=`position:absolute;left:${x+12}px;top:${i*pitch+14}px;width:${Math.round(cw*0.6)}px;height:12px;background:rgba(0,0,0,.04);border-radius:3px`
          frag.appendChild(d); x+=cw+12 }
        const line=document.createElement('div')
        line.style.cssText=`position:absolute;left:0;top:${i*pitch+pitch-1}px;width:${w}px;height:1px;background:rgba(0,0,0,.09)`
        frag.appendChild(line) }
      band.appendChild(frag); return band.childElementCount
    }
    return 0
  },{mode,cols:COLS,pitch:PITCH,h:H,w:W,rows})
  if(mode==='gradient') await p.evaluate(s=>Object.assign(document.getElementById('band').style,s), gradientStyle())
  await cdp.send('LayerTree.enable')
  // 等圖層樹:光等事件會卡住(套完樣式之後那個事件可能已經發過了),所以自己動一下版面把它逼出來,
  // 並且加逾時 —— 沒有逾時的等待在這裡卡過一次整趟(2026-09-15)。
  let layers=null
  cdp.on('LayerTree.layerTreeDidChange',e=>{if(e.layers&&e.layers.length)layers=e.layers})
  for(let i=0;i<40 && !layers;i++){ await p.evaluate(()=>{document.body.style.zoom=document.body.style.zoom==='1'?'':'1'}); await new Promise(r=>setTimeout(r,250)) }
  if(!layers){ console.log(`  ${label.padEnd(34)}   (拿不到圖層樹,略過)`); await b.close(); return }
  const main=layers.filter(l=>l.width>1000&&l.height>1000).sort((a,b)=>b.height-a.height)[0]||layers.sort((a,b)=>b.height-a.height)[0]
  const {snapshotId}=await cdp.send('LayerTree.makeSnapshot',{layerId:main.layerId})
  const t=[]
  for(let i=0;i<3;i++){const r=await cdp.send('LayerTree.profileSnapshot',{snapshotId,minRepeatCount:1,minDuration:0,clipRect:{x:0,y:0,width:W,height:CLIP}});t.push(r.timings.flat().reduce((a,v)=>a+v,0)*1000)}
  t.sort((a,b)=>a-b)
  console.log(`  ${label.padEnd(34)} ${t[1].toFixed(2).padStart(7)}ms   (DOM 節點 ${nodes})`)
  await b.close()
}
console.log('\n=== 同一塊 1680×4900(DPR2)的光柵成本 ===')
await run('空層(下限對照)','empty',0)
await run('純色','solid',0)
await run('13 層漸層(現行畫法)','gradient',0)
await run('實心 div 色條:覆蓋整個 4900 預繪窗','divs',Math.ceil(CLIP/PITCH))
await run('實心 div 色條:覆蓋整段 19160px','divs',Math.ceil(H/PITCH))
