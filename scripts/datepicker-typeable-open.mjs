#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 可輸入 DatePicker 的開啟行為 —— 滑鼠留在輸入框、鍵盤進日曆
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`components/DatePicker/date-picker.spec.md`「可輸入模式的開啟行為」
//
// 兩條路各自成立,**少驗一條就會把另一條弄壞**:
//   滑鼠:點欄位任何地方 → 日曆開、**焦點留在輸入框**、可繼續打字、日曆不關
//         (Ant 官方文件「By clicking the input box, you can select a date from a popup calendar」)
//   鍵盤:ArrowDown / Alt+ArrowDown → 日曆開、**焦點進日曆**、方向鍵能走日期格
//         (W3C APG date-picker combobox 明文;焦點不進去就走不了格子)
//
// 2026-09-07 修之前的狀態:點文字區只聚焦不開日曆(input 上有 `stopPropagation` 吞掉點擊);
// 而日曆一開焦點就被搬進去、**之後完全打不了字** —— `typeable` 的賣點在日曆開啟後就失效。
//
// 實作註記:焦點是用「開啟後下一幀 refocus」拿回來的,不是靠攔 `onOpenAutoFocus` ——
// 實測那個事件在本組合下根本沒被派發(探針顯示 handler 從未執行,焦點卻仍被移走)。
// 不依賴第三方內部行為,才驗得到也守得住。
//
// C / D 段(2026-11-26,TIME-12H-PANEL(定)):12 小時語系的下拉時間面板 —— DatePicker showTime 與 TimePicker 的面板欄、選中格、
// 欄寬、標題與空白提示字;判定是純函式 judgePanel,主判定先跑兩個對照組(12 小時語系仍是 00–23 一欄、拿掉上下午欄),判不紅 = exit 2。
//
// Run: `node scripts/datepicker-typeable-open.mjs`

import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireStorybookBuild, settleAfterInteraction } from './lib/launch-browser.mjs'
const S=join(process.cwd(),'storybook-static')
// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記)。原本直接 ENOENT 崩掉(2026-09-25,待辦總帳 C5)
requireStorybookBuild(join(S,'index.json'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv=await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const B=sv.origin
// 起不了 Chromium:一般環境 SKIPPED-ENV exit 0;GOVERNANCE_BROWSER_REQUIRED=1 的 CI 瀏覽器 job → exit 1(lib/launch-browser.mjs)
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const pg=await br.newPage({viewport:{width:1280,height:900}})
const ID='design-system-components-datepicker-展示--typed-input'
const st=()=>pg.evaluate(()=>({日曆:!!document.querySelector('[data-radix-popper-content-wrapper]'),焦點:document.activeElement?.tagName,值:document.querySelector('input')?.value}))
// 開 story:原本 networkidle + 固定睡 500ms 當「已渲染」的代理(缺 story 檔時只會在 pg.$('input') 拿到 null 而炸 TypeError)。
// 改由共用的 openStory:Storybook 回報渲染完成 → 被量的 input 出現 → 連續 10 影格靜止(接著就要量 input 的框)。
// 等不到 = 儀器失效:exit 1、點名 story、附 404 —— 不是產品裁決,也不准當通過。
const reload=async()=>{
  try { await openStory(pg,`${B}/iframe.html?id=${ID}&viewMode=story`,{waitFor:'input',settleFrames:10,notFound:sv.notFound}) }
  catch (e) {
    if (!(e instanceof StoryRenderInstrumentError)) throw e
    console.error(`✗ ${e.message}`); await br.close(); await sv.stop(); process.exit(1)
  }
}
const out=[];let fail=0
// 互動之後等「版面真的停了」(2026-09-25,待辦總帳 C5):lib/launch-browser.mjs 的 settleAfterInteraction ——
// 連續 10 個影格沒有 DOM 變動、沒有進行中的有限長度動畫(浮層開啟動畫、roving focus 的重畫都算)。取代原本
// 點擊 / 按鍵後固定睡 500 / 300 / 250ms:那是「浮層已開、焦點已落定」的代理(M37),慢的機器上會在開啟動畫中途量。
// 等不到靜止 = 儀器失效 exit 1,不是產品裁決。
const settle=async(what)=>{
  const r=await settleAfterInteraction(pg,{frames:10})
  if(r.ok)return
  console.log(out.join('\n'))
  console.error(`✗ INSTRUMENT-FAIL ${what}:互動之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)—— 儀器失效,不是產品裁決`)
  await br.close(); await sv.stop(); process.exit(1)
}
const ck=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`);if(!p)fail++}

// A) 滑鼠點文字區
await reload()
const inp=await pg.$('input'); const b=await inp.boundingBox()
await pg.mouse.click(b.x+40, b.y+b.height/2); await settle('點文字區') // 等日曆浮層開啟動畫 + 開啟後下一幀把焦點拿回輸入框
const a=await st()
ck('點文字區 → 日曆打開', a.日曆, JSON.stringify(a))
ck('點文字區 → 焦點留在輸入框', a.焦點==='INPUT', a.焦點)
await pg.keyboard.press('End'); await pg.keyboard.type('9'); await settle('打字') // 等打字後的受控值回寫與浮層(若會被關)的關閉
const a2=await st()
ck('日曆開著時仍可打字', a2.值 !== a.值, `${a.值} → ${a2.值}`)
ck('打字後日曆仍開著(不會被打字關掉)', a2.日曆)

// B) 鍵盤 ArrowDown
await reload()
await pg.evaluate(()=>document.querySelector('input')?.focus())
await pg.keyboard.press('ArrowDown'); await settle('ArrowDown') // 等日曆浮層開啟動畫 + 焦點搬進日曆格
const c=await st()
ck('鍵盤 ArrowDown → 日曆打開', c.日曆, JSON.stringify(c))
ck('鍵盤開啟 → 焦點進日曆(APG 要求,才 navigate 得了)', c.焦點!=='INPUT', c.焦點)
// 方向鍵能不能在日曆內走
const before=await pg.evaluate(()=>document.activeElement?.textContent?.trim())
await pg.keyboard.press('ArrowRight'); await settle('ArrowRight') // 等方向鍵把焦點移到下一格(roving focus 的重畫)
const after=await pg.evaluate(()=>document.activeElement?.textContent?.trim())
ck('鍵盤開啟後方向鍵能在日曆內移動', before!==after, `${before} → ${after}`)

// ── C / D) 下拉時間面板的 12 / 24 小時(TIME-12H-PANEL(定)2026-11-26)──────────────────────────────
// SSOT:time-picker.spec.md「顯示格式化」的面板 12 / 24 小時、「Panel 寬度」;date-picker.spec.md「showTime」。
// user 第三輪決策卡點選「A:12 小時語系時,面板加一欄「上午 / 下午」,時欄改成 1–12;面板標題和空白提示字也用 12 小時」;24 小時語系不變。
// 量的是開著的浮層裡真的畫出來的欄:每欄讀屏名稱、格子的字、選中的格、欄寬(像素)與面板標題 —— 判定是下方純函式 judgePanel,
// 主判定也先拿兩份假資料(12 小時語系仍是 00–23 一欄、拿掉上下午欄)跑同一支,抓不到 = 儀器失效 exit 2。
const H12=['12','01','02','03','04','05','06','07','08','09','10','11']
const H24=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'))
/** 每欄約 80px(time-picker.spec.md「Panel 寬度」);容許次像素與捲軸 */
const COLUMN_PX=[70,90]
/** 純函式:實量的面板 vs 期望;回不符的那幾條 */
function judgePanel(snap, want){
  const bad=[]
  if(!snap){ bad.push('浮層沒開 / 量不到時間面板'); return bad }
  const labels=snap.columns.map(c=>c.label)
  if(JSON.stringify(labels)!==JSON.stringify(want.labels)) bad.push(`欄的讀屏名稱 ${JSON.stringify(labels)} ≠ ${JSON.stringify(want.labels)}`)
  const hour=snap.columns.find(c=>c.label==='時')
  if(!hour||JSON.stringify(hour.options)!==JSON.stringify(want.hours)) bad.push(`時欄的字 ${JSON.stringify(hour?.options)} ≠ ${JSON.stringify(want.hours)}`)
  if(hour&&hour.selected!==want.selectedHour) bad.push(`時欄選中「${hour.selected}」≠「${want.selectedHour}」`)
  const period=snap.columns.find(c=>c.label==='上下午')
  if(want.periods){
    if(!period||JSON.stringify(period.options)!==JSON.stringify(want.periods)) bad.push(`上下午欄的字 ${JSON.stringify(period?.options)} ≠ ${JSON.stringify(want.periods)}`)
    if(period&&period.selected!==want.selectedPeriod) bad.push(`上下午欄選中「${period.selected}」≠「${want.selectedPeriod}」`)
    if(period&&snap.columns.at(-1)!==period) bad.push('上下午欄不是最後一欄')
  } else if(period) bad.push('24 小時語系不該有上下午欄')
  for(const c of snap.columns) if(!(c.width>=COLUMN_PX[0]&&c.width<=COLUMN_PX[1])) bad.push(`「${c.label}」欄寬 ${c.width.toFixed(1)}px 不在 ${COLUMN_PX.join('–')}`)
  if(want.title!==undefined&&snap.title!==want.title) bad.push(`面板標題「${snap.title}」≠「${want.title}」`)
  return bad
}
// 對照組:同一支判定吃兩份假資料,必須各自判紅 —— 判不紅 = 這支判定量不到它要量的東西
const fakeCol=(label,options,selected)=>({label,options,selected,width:80})
const WANT_ZH={labels:['時','分','上下午'],hours:H12,selectedHour:'02',periods:['上午','下午'],selectedPeriod:'下午'}
const CONTROLS=[
  ['12 小時語系仍是 00–23 一欄(改前的面板)',{columns:[fakeCol('時',H24,'14'),fakeCol('分',['30'],'30')],title:'14:30'}],
  ['拿掉上下午欄(時欄已是 12、01…11)',{columns:[fakeCol('時',H12,'02'),fakeCol('分',['30'],'30')],title:'下午2:30'}],
]
for(const [name,snap] of CONTROLS){
  if(judgePanel(snap,WANT_ZH).length===0){ console.error(`✗ INSTRUMENT-FAIL 對照組「${name}」沒被 judgePanel 判紅 —— 量不到 12 小時面板`); await br.close(); await sv.stop(); process.exit(2) }
  out.push(`✓ 對照組「${name}」被判紅`)
}
const readPanel=()=>pg.evaluate(()=>{
  const pop=document.querySelector('[data-radix-popper-content-wrapper]')
  if(!pop) return null
  const boxes=[...pop.querySelectorAll('[role="listbox"]')]
  if(!boxes.length) return null
  return {
    columns:boxes.map(b=>{
      // 欄寬量 ScrollArea 的根(listbox → 內層 → viewport → 根),即面板裡真正等分的那一欄
      const root=b.closest('[data-radix-scroll-area-viewport]')?.parentElement??b
      return {label:b.getAttribute('aria-label'),options:[...b.querySelectorAll('[role="option"]')].map(o=>o.textContent.trim()),selected:b.querySelector('[role="option"][aria-selected="true"]')?.textContent.trim()??null,width:root.getBoundingClientRect().width}
    }),
    // DatePicker showTime 的面板標題 = 緊接在時間欄前面的那一列(月曆的年月列也是同高,所以認「下一個兄弟裡有 listbox」);
    // TimePicker 的面板沒有標題 → null
    title:[...pop.querySelectorAll('.h-field-xs')].find(el=>el.nextElementSibling?.querySelector('[role="listbox"]'))?.textContent.trim()??null,
  }
})
const report=(t,bad)=>ck(t,bad.length===0,bad.join(';'))

// C) DatePicker typeable showTime(預設 zh-TW):值 2026-04-02 14:30 → 面板 時 / 分 / 上下午、時欄 12 / 01…11、選在「下午」「02」、標題「下午2:30」;
//    點「上午」→ 框裡的字跟著變成上午
await reload()
const inputs=await pg.$$('input')
if(inputs.length<2){ console.error('✗ INSTRUMENT-FAIL TypedInput 範例找不到第二個(showTime)輸入框 —— 範例改了,這段要跟著改'); await br.close(); await sv.stop(); process.exit(1) }
const tb=await inputs[1].boundingBox()
await pg.mouse.click(tb.x+40, tb.y+tb.height/2); await settle('點 showTime 欄位')
const c1=await readPanel()
report('DatePicker showTime(zh-TW)面板:時 / 分 / 上下午、時欄 12、01…11、選在下午 02、標題「下午2:30」、每欄約 80px', judgePanel(c1,{...WANT_ZH,title:'下午2:30'}))
const am=await pg.$('[data-radix-popper-content-wrapper] [role="listbox"][aria-label="上下午"] [role="option"]')
if(am){ await am.click(); await settle('點上午') }
const c2=await readPanel()
const v2=await pg.evaluate(()=>document.querySelectorAll('input')[1]?.value)
ck('點「上午」→ 上下午欄選在上午、時留在 02、標題與框裡的字都變上午', !!am&&judgePanel(c2,{...WANT_ZH,selectedPeriod:'上午',title:'上午2:30'}).length===0&&/上午2:30/.test(v2??''), `${JSON.stringify(c2?.columns?.map(c=>c.selected))} 標題「${c2?.title}」框「${v2}」`)

// D) TimePicker 精度對照(設計規格頁):zh-TW / en-US 有上下午欄、en-GB 沒有;三個語系的空白提示字
const TP_ID='design-system-components-timepicker-設計規格--precision-matrix'
try { await openStory(pg,`${B}/iframe.html?id=${TP_ID}&viewMode=story`,{waitFor:'[role="combobox"][aria-label="倫敦辦公室週會結束時間"]',settleFrames:10,notFound:sv.notFound}) }
catch (e) {
  if (!(e instanceof StoryRenderInstrumentError)) throw e
  console.error(`✗ ${e.message}`); await br.close(); await sv.stop(); process.exit(1)
}
const TP=[
  ['台北辦公室週會開始時間','zh-TW',{...WANT_ZH}],
  ['紐約辦公室週會開始時間','en-US',{...WANT_ZH,periods:['AM','PM'],selectedPeriod:'PM'}],
  ['倫敦辦公室週會開始時間','en-GB',{labels:['時','分'],hours:H24,selectedHour:'14'}],
]
for(const [label,locale,want] of TP){
  await pg.click(`[role="combobox"][aria-label="${label}"]`); await settle(`開 ${locale} 面板`)
  report(`TimePicker(${locale})面板:${want.periods?'時 / 分 / 上下午、時欄 12、01…11':'時 / 分、時欄 00–23、沒有上下午欄'}、每欄約 80px`, judgePanel(await readPanel(),{...want,title:null}))
  await pg.keyboard.press('Escape'); await settle(`關 ${locale} 面板`)
}
const ph=await pg.evaluate(()=>Object.fromEntries(['台北','紐約','倫敦'].map(c=>[c,document.querySelector(`[role="combobox"][aria-label="${c}辦公室週會結束時間"]`)?.textContent.trim()??null])))
ck('空白提示字跟 12 / 24:zh-TW「上午/下午HH:MM」、en-US「HH:MM AM/PM」、en-GB「HH:MM」', ph.台北==='上午/下午HH:MM'&&ph.紐約==='HH:MM AM/PM'&&ph.倫敦==='HH:MM', JSON.stringify(ph))

console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); await sv.stop(); process.exit(fail?1:0)
