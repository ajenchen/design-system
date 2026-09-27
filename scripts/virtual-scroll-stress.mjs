#!/usr/bin/env node
/**
 * 虛擬捲動壓力測試(2026-09-08 建)
 *
 * 由來:user 報過「50 筆虛擬表捲一捲就會出錯」(總帳 E1)。三種假設都複現不出 ——
 *   (1) 純捲動 12 次全高來回  (2) 拖曳中大幅捲動 10 次  (3) 捲到各位置後改資料集(排序)+ 捲動中改視窗高度
 * 複現不出就不能宣稱修好,但可以留下「再發生會被抓到」的機制,這支就是。
 *
 * 判準兩條(缺一不可):
 *   - 沒有 JS 例外(網路資源載入失敗要排除 —— 沙箱擋外部頭像,那不是元件的錯,
 *     不濾掉的話會固定收到 84 個假錯,把真錯淹掉)
 *   - **畫面不能空掉**:user 說的「出錯」也可能是空白而不是例外,所以量可見列數,
 *     而不是只聽 console。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
// 靜態 import(舊版以 process.cwd() 拼路徑動態載入 —— 不在 repo 根目錄執行就載到別處或載不到)
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
// `--static-dir <目錄>`:改壓另一份 Storybook 建置(預設 <repo>/storybook-static;對照組用刪掉 story 檔的副本)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const staticDirArg = process.argv.find((a) => a.startsWith('--static-dir='))?.slice('--static-dir='.length)
  ?? (process.argv.includes('--static-dir') ? process.argv[process.argv.indexOf('--static-dir') + 1] : null)
const STATIC = resolve(staticDirArg ?? join(ROOT, 'storybook-static'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv=await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
// 失敗(非零結束或拋錯)一律附上同源 404 帳本:下面的 console 過濾會吞掉「Failed to load resource」,缺檔只看得到這裡
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const b=await launchBrowser(); const p=await b.newPage()
const errs=[]
let blankSeen = 0
// 沒壓到 ≠ 沒出錯:story 開不起來(儀器失效)或找不到可捲動容器(什麼都沒壓到)都要紅,不得當成通過
const notExercised = []
// 對照組:綠燈要能證明它「該紅的時候會紅」(M32 sub-invariant)。
// --selftest 會在頁面裡丟一個真的例外,這支必須抓到並以 exit 1 收場。
const SELFTEST = process.argv.includes('--selftest')
p.on('pageerror', e=>errs.push('pageerror: '+String(e).split('\n')[0].slice(0,160)))
p.on('console', m=>{ if(m.type()==='error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text())) errs.push('console: '+m.text().slice(0,160)) })

for (const id of ['design-system-components-datatable-展示--virtual-scroll','design-system-components-datatable-展示--row-drag-with-virtualization']) {
  console.log('\n▶ ' + id.replace('design-system-components-',''))
  // 等 Storybook 回報渲染完成、畫面健康、表格列出現、版面連續靜止 10 個影格(虛擬列量測收斂)才開始壓
  // (取代舊的 load + 固定睡 1800ms —— 那只是「已渲染」的代理)。開不起來 → 儀器失效,點名 story、列 404。
  try {
    await openStory(p, `${sv.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
      waitFor: '[role="row"]', settleFrames: 10, notFound: sv.notFound,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.log(`  ✗ ${error.message}`)
    notExercised.push(`${id}:儀器失效 —— ${error.detail}`)
    continue
  }
  if (SELFTEST) await p.evaluate(() => { setTimeout(() => { throw new Error('selftest 故意丟的例外') }, 10) })
  const before = errs.length

  // 假設:捲動中「資料集改變」會讓虛擬化的量測快取對不上。
  // 用真實使用者做得到的手段去改資料集:排序、篩選、切換欄位顯示。
  const scroller = await p.evaluate(() => {
    const els=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+50)
    if(!els.length) return null
    els.sort((a,b)=>b.scrollHeight-a.scrollHeight)
    els[0].setAttribute('data-vs','1'); return { h: els[0].scrollHeight, c: els[0].clientHeight }
  })
  if(!scroller){ console.log('  ✗ 找不到可捲動容器 —— 這則 story 什麼都沒壓到'); notExercised.push(`${id}:story 已渲染完成,但找不到可捲動容器(什麼都沒壓到,不算通過)`); continue }
  console.log(`  捲動容器 ${scroller.c}px 視窗 / ${scroller.h}px 內容`)

  // 1) 捲到中段後立刻排序(資料重排,虛擬列全部換人)
  for (const frac of [0.5, 0.8, 0.2, 0.95, 0.35]) {
    await p.evaluate((f) => { const e=document.querySelector('[data-vs]'); e.scrollTop = e.scrollHeight*f }, frac)
    // 刻意的短間隔(壓力手法本身):捲動後虛擬列還在重畫時就排序,不是「已渲染」的代理
    await p.waitForTimeout(90)
    const sorted = await p.evaluate(() => {
      const h=[...document.querySelectorAll('[role="columnheader"] button, [role="columnheader"]')].find(x=>x.textContent?.trim())
      if(h){ h.click(); return h.textContent.trim().slice(0,12) } return null
    })
    // 給排序後的重排一小段時間再取樣(量的是「重排中/剛重排完」會不會空掉,刻意不等到完全靜止)
    await p.waitForTimeout(220)
    if (sorted) process.stdout.write(`  捲到 ${Math.round(frac*100)}% 後點欄頭「${sorted}」`)
    const st = await p.evaluate(() => {
      const sc=document.querySelector('[data-vs]')
      const rows=[...document.querySelectorAll('[role="row"]')]
      const vis=rows.filter(r=>{const b=r.getBoundingClientRect();return b.height>0 && b.bottom>0 && b.top<innerHeight})
      return { total: rows.length, visible: vis.length, scrollTop: Math.round(sc.scrollTop), h: sc.scrollHeight,
               firstText: (vis[1]||vis[0])?.textContent?.trim().slice(0,18) || '(空)' }
    })
    const nowErrs = errs.length - before
    const blank = st.visible <= 1
    if (blank) blankSeen++
    console.log(` → 列 ${st.total}/可見 ${st.visible} @${st.scrollTop}px「${st.firstText}」${blank ? '  ⚠️ 畫面空掉' : ''}${nowErrs ? `  ⚠️ ${nowErrs} 個 JS 錯` : ''}`)
  }

  // 2) 捲動中同時大幅改變視窗高度(重新量測)
  for (const h of [400, 900, 300, 1000]) {
    await p.setViewportSize({ width: 1280, height: h })
    await p.evaluate(() => { const e=document.querySelector('[data-vs]'); e.scrollTop = e.scrollHeight*0.7 })
    // 刻意的短間隔(壓力手法本身):視窗高度改變的重新量測還沒收斂就下一次改變
    await p.waitForTimeout(200)
  }
  console.log(`  視窗高度 400→900→300→1000 捲動中改變 → 累計錯誤 ${errs.length - before}`)
}
await b.close(); await sv.stop()

if (notExercised.length) {
  // 儀器失效 / 沒壓到:不是產品裁決,也不是通過(selftest 亦同 —— 沒壓到的對照組證明不了任何事)
  console.log(`\n✗ 虛擬捲動壓力測試有 ${notExercised.length} 則 story 沒壓到(exit 2,不是產品裁決,也不算通過):`)
  notExercised.forEach((e) => console.log('  ' + e))
  process.exit(2)
}
if (SELFTEST) {
  const caught = errs.some((e) => /selftest 故意丟的例外/.test(e))
  console.log(caught ? '\n✓ selftest:注入例外時這支確實會紅' : '\n✗ selftest:注入了例外卻沒抓到 —— 這支的綠燈不算證據')
  process.exit(caught ? 0 : 1)
}
if (errs.length || blankSeen) {
  console.log(`\n✗ 虛擬捲動壓力測試失敗:${errs.length} 個 JS 錯、${blankSeen} 次畫面空掉`)
  errs.slice(0, 8).forEach((e) => console.log('  ' + e))
  process.exit(1)
}
console.log('\n✓ 虛擬捲動壓力測試通過(排序、捲動、視窗高度變化交錯下無例外且畫面不空)')
