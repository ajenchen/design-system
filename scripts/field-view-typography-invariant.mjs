#!/usr/bin/env node
/**
 * Field 家族 view 模式字級不變條件(2026-09-15,user 抓 RadioGroup 四模式的 view 字比選項大)。
 *
 * SSOT:field-controls.spec.md「(e) View typography canonical」—— view 路徑**必**消費 size 對應的字級 token
 *(sm/md → text-body 14px、lg → text-body-lg 16px),禁裸 span 吃瀏覽器預設 16px。
 * 量的是像素不是 class:每個「四模式」story 裡,view 段第一個文字節點的 computed font-size / line-height
 * 必須等於同一 story 裡 edit 段的文字(同一顆控件、同一個 size,只差 chrome)。view 段沒有文字(Checkbox / Switch 的 ✓ / — 圖示)則略過。
 *
 * 對照組(--selftest):把每個 view 段第一個文字節點硬改 16px,量具必須紅(RadioGroup 修前就是這個樣子:16px/24px vs 14px/21px)。
 * 用法:node scripts/field-view-typography-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
const report404 = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }
// story 清單也從同一份快照讀(沒有 build-info.json 的根目錄沒有快照,照舊讀根目錄)
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
const STORIES = Object.values(index.entries).filter((e) => e.type === 'story' && /^design-system-components-[a-z]+-展示--modes$/u.test(e.id)).map((e) => e.id).sort()
// 段落 = <h3>edit|view|…</h3> 之後、下一個 <h3> 之前的節點;取段裡第一個「自己直接含文字」的元素量字級。
const PROBE = (sabotage) => {
  const heads = [...document.querySelectorAll('h3')]
  const section = (name) => { const h = heads.find((x) => x.textContent.trim().toLowerCase() === name); if (!h) return null; const nodes = []; let n = h.nextElementSibling; while (n && n.tagName !== 'H3') { nodes.push(n); n = n.nextElementSibling } return nodes }
  const firstText = (nodes) => { for (const root of nodes) { const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let t; while ((t = walker.nextNode())) { if (t.textContent.trim() && t.parentElement && t.parentElement.tagName !== 'H3') return t.parentElement } } return null }
  const view = section('view'), edit = section('edit'); if (!view || !edit) return { skip: '沒有 view / edit 段' }
  const v = firstText(view), e = firstText(edit); if (!v) return { skip: 'view 段無文字(圖示型 view)' }; if (!e) return { skip: 'edit 段無文字' }
  if (sabotage) v.style.fontSize = '16px'
  const cs = (el) => { const c = getComputedStyle(el); return { font: parseFloat(c.fontSize), line: parseFloat(c.lineHeight), text: (el.textContent || '').trim().slice(0, 16), cls: String(el.className || '').slice(0, 60) } }
  return { view: cs(v), edit: cs(e) }
}
const browser = await launchBrowser(); const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 }); const page = await ctx.newPage()
let failed = 0, sampled = 0
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
try {
  for (const id of STORIES) {
    await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForTimeout(600)
    const r = await page.evaluate(PROBE, SELFTEST)
    const name = id.replace(/^design-system-components-|-展示--modes$/gu, '')
    if (r.skip) { console.log(`  · ${name}:略過(${r.skip})`); continue }
    sampled++
    rec(r.view.font === r.edit.font, `${name}:view 字級 ${r.view.font}px(「${r.view.text}」)= edit 字級 ${r.edit.font}px(「${r.edit.text}」)`)
  }
} catch (e) { report404(); throw e }
finally { await browser.close(); await server.stop() }
rec(sampled >= 4, `取樣:${sampled} 個有文字 view 的四模式 story(需 ≥ 4)`)
if (SELFTEST) { const ok = failed >= sampled && sampled > 0; console.log(ok ? `✓ selftest:對照組(view 硬改 16px)讓 ${failed} 條紅,量具會紅` : '✗ selftest:對照組沒讓每一條紅 —— 量具無效'); if (!ok) report404(); process.exit(ok ? 0 : 1) }
console.log(failed ? `✗ field-view-typography ${failed} 條失敗(SSOT:field-controls.spec.md (e) View typography canonical)` : `✅ field-view-typography PASS(${sampled} 個 story)`)
if (failed) report404()
process.exit(failed ? 1 : 0)
