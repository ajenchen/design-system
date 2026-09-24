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
// Run: `node scripts/datepicker-typeable-open.mjs`

import { chromium } from 'playwright'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
const S=join(process.cwd(),'storybook-static')
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv=await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const B=sv.origin
let br
try { br = await chromium.launch({headless:true,args:['--single-process','--no-sandbox']}) }
catch (e) { await sv.stop(); console.error('⚠️  SKIPPED-ENV: 無法啟動 Chromium(' + String(e.message).split('\n')[0] + ')'); process.exit(0) }
const pg=await br.newPage({viewport:{width:1280,height:900}})
const ID='design-system-components-datepicker-展示--typed-input'
const st=()=>pg.evaluate(()=>({日曆:!!document.querySelector('[data-radix-popper-content-wrapper]'),焦點:document.activeElement?.tagName,值:document.querySelector('input')?.value}))
const reload=async()=>{await pg.goto(`${B}/iframe.html?id=${ID}&viewMode=story`,{waitUntil:'networkidle'});await pg.waitForTimeout(500)}
const out=[];let fail=0
const ck=(t,p,d='')=>{out.push(`${p?'✓':'✗'} ${t}${d?' | '+d:''}`);if(!p)fail++}

// A) 滑鼠點文字區
await reload()
const inp=await pg.$('input'); const b=await inp.boundingBox()
await pg.mouse.click(b.x+40, b.y+b.height/2); await pg.waitForTimeout(500)
const a=await st()
ck('點文字區 → 日曆打開', a.日曆, JSON.stringify(a))
ck('點文字區 → 焦點留在輸入框', a.焦點==='INPUT', a.焦點)
await pg.keyboard.press('End'); await pg.keyboard.type('9'); await pg.waitForTimeout(300)
const a2=await st()
ck('日曆開著時仍可打字', a2.值 !== a.值, `${a.值} → ${a2.值}`)
ck('打字後日曆仍開著(不會被打字關掉)', a2.日曆)

// B) 鍵盤 ArrowDown
await reload()
await pg.evaluate(()=>document.querySelector('input')?.focus())
await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(500)
const c=await st()
ck('鍵盤 ArrowDown → 日曆打開', c.日曆, JSON.stringify(c))
ck('鍵盤開啟 → 焦點進日曆(APG 要求,才 navigate 得了)', c.焦點!=='INPUT', c.焦點)
// 方向鍵能不能在日曆內走
const before=await pg.evaluate(()=>document.activeElement?.textContent?.trim())
await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(250)
const after=await pg.evaluate(()=>document.activeElement?.textContent?.trim())
ck('鍵盤開啟後方向鍵能在日曆內移動', before!==after, `${before} → ${after}`)
console.log(out.join('\n')); console.log(fail?`\n✗ ${fail} 項未通過`:'\n✓ 全部通過')
await br.close(); await sv.stop(); process.exit(fail?1:0)
