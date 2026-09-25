#!/usr/bin/env node
/**
 * Field 家族 view 模式字級不變條件(2026-09-15,user 抓 RadioGroup 四模式的 view 字比選項大)。
 *
 * @gate-contract
 *   保證: 每一則 Field「四模式」story 裡,view 段值文字的 computed font-size / line-height 等於同一則 story edit 段的值文字(同一顆控件、同一個 size);清單上每一則 story 都必須真的量到,或落在下方 DECLARED 具名豁免且當場確認理由仍成立
 *   紅: view 值文字硬改 16px(RadioGroup 修前的樣子)→ 每一則被量的 story 都指名紅;story 永遠渲染不出來(擋掉它的 story 檔)→ 以「儀器失效」指名紅,不得算成略過
 *   綠: 現況必綠;story 檔故意晚 3 秒才到(舊寫法「load + 固定 600ms」必然看不到)仍必須量到而且綠 —— 等的是被量的元素本身,與機器快慢無關
 *
 * SSOT:field-controls.spec.md「(e) View typography canonical」—— view 路徑**必**消費 size 對應的字級 token
 *(sm/md → text-body 14px、lg → text-body-lg 16px),禁裸 span 吃瀏覽器預設 16px。
 * 量的是像素不是 class:view 段值文字的 computed font-size / line-height 必須等於同一則 story 裡 edit 段的值文字。
 *
 * ── 2026-09-25 修正:「沒看到」不等於「沒有」(M37)──
 * 修前用 `page.goto(load)` + 固定睡 600ms 當「已渲染」的代理。但 Storybook 的 story 檔是 load **之後**才以動態 import
 * 載入的(實測 load 529ms、story 檔請求 1097ms),600ms 只代表「這台機器夠快」。機器慢時 story 還沒掛上,probe 讀到
 * 「沒有 view / edit 段」就印成**略過**、照樣 exit 0 —— 略過理由跟著機器速度變。對照實測:把 RadioGroup 的 story 檔
 * 延遲 3 秒或直接擋掉,修前的閘都印「radiogroup:略過(沒有 view / edit 段)」而**整支綠**(取樣 6 ≥ 4),
 * 當初立這支閘的那一則沒量到,沒有任何訊號。
 * 同一輪查出第二個代理:「段內第一個文字節點」不等於「控件的值文字」。Input 的 view / edit 段第一個文字是 story 自己的
 * 說明 `<p class="text-caption">`(12px = 12px,恆等),值從沒被量過;NumberInput 的 edit 值住在 `<input>` 裡、
 * 不是文字節點,於是每次都「略過」。
 * 現在:
 *  (1) 等被量的元素本身:lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)先等 Storybook 回報這則 story
 *      渲染完成(含 play)並通過 render-health,再等 view / edit 段的值文字本身出現。等不到 = 紅、指名、附同源 404 與
 *      Storybook 錯誤訊息;story 根本沒渲染 = 「儀器失效」,不是略過。
 *  (2) 值文字 = 控件裡(文件順序)第一個自己直接含字的元素,或可見、有值的 `<input>` / `<textarea>`;段內直接一層的
 *      `<p>` 是 story 的說明文字,不量。
 *  (3) 略過只剩下方 DECLARED 具名清單,且在 story 渲染完成後當場確認理由仍成立;理由不成立、或清單項找不到 story → 紅。
 *
 * 對照組(--selftest,三組都要過才 exit 0):
 *  A. 每則被量 story 的 view 值文字硬改 16px → 每一則都必須紅(量具會紅)。
 *  B. RadioGroup 的 story 檔晚 3 秒到 → 舊寫法(load + 固定 600ms)必須看不到(證明延遲有效)、本閘必須等到並量到綠。
 *  C. RadioGroup 的 story 檔被擋掉 → 本閘必須判「儀器失效」並指名 radiogroup,不是略過。
 * 用法:node scripts/field-view-typography-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
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
const ENTRIES = Object.values(index.entries).filter((e) => e.type === 'story' && /^design-system-components-[a-z]+-展示--modes$/u.test(e.id)).sort((a, b) => a.id.localeCompare(b.id))
const STORIES = ENTRIES.map((e) => e.id)
const shortName = (id) => id.replace(/^design-system-components-|-展示--modes$/gu, '')
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
// 等「story 渲染出來」與「值文字出現」各自的上限。慢機器只會等久一點,不會因此改變判定。
const APPEAR_MS = 20000

// 具名豁免:只收「由元件設計決定、每次都一樣」的理由;跑的時候在 story 渲染完成後當場確認(見 classify)。
const DECLARED = new Map([
  ['avatar', { kind: 'no-field-modes', reason: 'Avatar 的「四模式」是內容模式(圖片 / icon / 首字 / 預設 User icon),不是 Field 的 edit / view mode,沒有 edit / view 段' }],
  ['checkbox', { kind: 'icon-view', reason: 'view 是 BooleanValueIcon 的勾 / 叉圖示(SelectionControl/boolean-value.tsx),沒有值文字;圖示尺寸由 booleanIconSize 對齊字級,不屬本閘' }],
  ['switch', { kind: 'icon-view', reason: 'view 是 BooleanValueIcon 的勾 / 叉圖示(同 Checkbox),沒有值文字' }],
])

// 瀏覽器端唯一實作:「等什麼」與「量什麼」共用這一支,不准等 A、量 B。
// wait=true 時只回「被量的元素是否已出現」(給 waitForFunction);否則回完整結果。
const PROBE = ({ kind, wait = false, sabotage = false }) => {
  const heads = [...document.querySelectorAll('#storybook-root h3')]
  // 段落 = <h3>edit|view</h3> 之後、下一個 <h3> 之前的兄弟節點;直接一層的 <p> 是 story 的說明文字,不是控件,不量。
  const section = (label) => {
    const h = heads.find((x) => x.textContent.trim().toLowerCase() === label); if (!h) return null
    const nodes = []; for (let n = h.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) if (n.tagName !== 'P') nodes.push(n)
    return nodes
  }
  // 值文字 = 控件裡(文件順序)第一個自己直接含字的元素,或可見、有值的 <input> / <textarea>(edit 的值住在 input 裡,不是文字節點)。
  const valueCarrier = (nodes) => {
    for (const top of nodes) {
      const walker = document.createTreeWalker(top, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      for (let n = walker.currentNode; n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) { if (n.textContent.trim() && n.parentElement) return { el: n.parentElement, text: n.textContent.trim() }; continue }
        if ((n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') && n.type !== 'hidden' && n.value.trim()
          && n.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return { el: n, text: n.value.trim() }
      }
    }
    return null
  }
  const view = section('view'), edit = section('edit')
  let out
  if (kind === 'no-field-modes') {
    out = { ready: heads.length > 0, missing: '段標題', sections: [view && 'view', edit && 'edit'].filter(Boolean) }
  } else if (kind === 'icon-view') {
    const icon = Boolean(view?.some((n) => n.matches('svg') || n.querySelector('svg')))
    out = { ready: icon, missing: view ? 'view 段的圖示' : 'view 段', viewText: view ? valueCarrier(view)?.text ?? null : null }
  } else {
    const v = view && valueCarrier(view), e = edit && valueCarrier(edit)
    out = { ready: Boolean(v && e), missing: [!view ? 'view 段' : !v ? 'view 段的值文字' : '', !edit ? 'edit 段' : !e ? 'edit 段的值文字' : ''].filter(Boolean).join('、') }
    if (out.ready && !wait) {
      if (sabotage) v.el.style.fontSize = '16px'
      const cs = (c) => { const s = getComputedStyle(c.el); return { font: parseFloat(s.fontSize), line: s.lineHeight, text: c.text.slice(0, 16), tag: c.el.tagName.toLowerCase() } }
      out.view = cs(v); out.edit = cs(e)
    }
  }
  return wait ? (out.ready ? true : null) : out
}

const browser = await launchBrowser(); const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1 }); const page = await ctx.newPage()

/**
 * 開一則 story,等被量的元素出現,再分類。回傳 status:
 *   measured(量到)/ declared-skip(具名豁免且當場確認)/ stale-declaration(豁免理由已不成立)/
 *   not-rendered(儀器失效:story 沒渲染)/ unmeasurable(story 渲染了,但等不到值文字)
 */
async function inspectStory(id, { sabotage = false, appearTimeout = APPEAR_MS } = {}) {
  const name = shortName(id)
  const declared = DECLARED.get(name)
  const kind = declared?.kind ?? 'measure'
  try {
    // 渲染完成(含 play)+ render-health + 被量的元素本身(值文字 / 圖示 / 段標題)—— 等的與量的是同一支 PROBE。
    await openStory(page, storyUrl(id), {
      waitFor: PROBE, waitForArg: { kind, wait: true }, waitForPolling: 100,
      timeoutMs: appearTimeout, navigationTimeoutMs: 90000, notFound: server.notFound,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    if (error.kind !== 'wait-for-timeout') return { status: 'not-rendered', name, detail: error.detail }
    // story 已渲染完成,但被量的元素沒出現
    const r = await page.evaluate(PROBE, { kind })
    const extra = error.failedRequests.length ? `;同源 404 / 載入失敗:${error.failedRequests.join(', ')}` : ''
    return { status: 'unmeasurable', name, detail: `story 已渲染,但 ${appearTimeout / 1000} 秒內沒等到 ${r.missing}${extra}` }
  }
  const r = await page.evaluate(PROBE, { kind, sabotage })
  if (kind === 'no-field-modes') {
    return r.sections.length
      ? { status: 'stale-declaration', name, detail: `宣告為「沒有 edit / view 段」,但出現了 ${r.sections.join(' / ')} 段 —— 豁免已不成立,移出 DECLARED 改量字級` }
      : { status: 'declared-skip', name, detail: declared.reason }
  }
  if (kind === 'icon-view') {
    return r.viewText
      ? { status: 'stale-declaration', name, detail: `宣告為圖示型 view,但 view 段出現了值文字「${r.viewText.slice(0, 16)}」—— 豁免已不成立,移出 DECLARED 改量字級` }
      : { status: 'declared-skip', name, detail: declared.reason }
  }
  return { status: 'measured', name, ok: r.view.font === r.edit.font && r.view.line === r.edit.line, view: r.view, edit: r.edit }
}

const count = { measured: 0, mismatched: 0, 'declared-skip': 0, 'stale-declaration': 0, 'not-rendered': 0, unmeasurable: 0 }
const report = (r) => {
  if (r.status === 'measured') {
    count.measured++; if (!r.ok) count.mismatched++
    const side = (s) => `${s.font}px / 行高 ${s.line}(「${s.text}」,${s.tag})`
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}:view ${side(r.view)} ${r.ok ? '=' : '≠'} edit ${side(r.edit)}`)
    return
  }
  count[r.status]++
  if (r.status === 'declared-skip') console.log(`  · ${r.name}:略過(具名豁免,已當場確認:${r.detail})`)
  // 標記字(INSTRUMENT-FAIL)讓 lib/gate-selftest-meta.mjs 把這一趟讀成儀器失效,而不是「字級不一致」的產品紅(2026-09-25 前沒印)
  else if (r.status === 'not-rendered') console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${r.name}:儀器失效 —— ${r.detail}(不是略過:沒看到不等於沒有;也不是產品裁決)`)
  else if (r.status === 'unmeasurable') console.log(`✗ ${r.name}:量不到 —— ${r.detail}`)
  else console.log(`✗ ${r.name}:${r.detail}`)
}
const redCount = () => count.mismatched + count['stale-declaration'] + count['not-rendered'] + count.unmeasurable

// ── 對照組 B / C 用:攔這一則 story 自己的 story 檔(assets/<檔名>-<hash>.js)──
const chunkPattern = (entry) => {
  const base = path.basename(entry.importPath).replace(/\.[cm]?[jt]sx?$/u, '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`/assets/${base}-[^/]+\\.js(?:\\?.*)?$`, 'u')
}
async function withChunkRoute(entry, mode, fn) {
  let hits = 0
  const pattern = chunkPattern(entry)
  await page.route(pattern, async (route) => {
    hits++
    if (mode === 'abort') { await route.abort().catch(() => {}); return }
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.continue().catch(() => {}) // 請求可能已隨下一次導覽取消
  })
  try { return { result: await fn(), hits: () => hits } } finally { await page.unroute(pattern) }
}

let selftestOk = true
try {
  for (const id of STORIES) report(await inspectStory(id, { sabotage: SELFTEST }))
  for (const name of DECLARED.keys()) {
    if (!STORIES.some((id) => shortName(id) === name)) { count['stale-declaration']++; console.log(`✗ DECLARED 豁免「${name}」找不到對應的四模式 story —— 清單已腐爛,移除該項`) }
  }

  if (SELFTEST) {
    const A = count.measured > 0 && count.mismatched === count.measured && redCount() === count.mismatched
    console.log(A
      ? `✓ selftest 對照組 A:view 硬改 16px → ${count.mismatched}/${count.measured} 則被量的 story 全紅(量具會紅)`
      : `✗ selftest 對照組 A 失效:被量 ${count.measured} 則、紅 ${count.mismatched} 則、其他紅 ${redCount() - count.mismatched} 則 —— 必須每一則都因字級紅、且沒有別的紅`)

    const target = ENTRIES.find((e) => shortName(e.id) === 'radiogroup')
    let B = false, C = false
    if (!target) {
      console.log('✗ selftest 對照組 B / C:找不到 radiogroup 四模式 story,無法做延遲 / 擋檔對照')
    } else {
      // B-1 延遲有效嗎:用修前的寫法(load + 固定 600ms)必須看不到 —— 否則這組對照不構成證據。
      const b1 = await withChunkRoute(target, 'delay', async () => {
        await page.goto(storyUrl(target.id), { waitUntil: 'load', timeout: 90000 })
        await page.waitForTimeout(600)
        return page.evaluate(PROBE, { kind: 'measure', wait: true })
      })
      // B-2 本閘在同樣的延遲下必須等到、量到、而且綠。
      const b2 = await withChunkRoute(target, 'delay', () => inspectStory(target.id))
      B = b1.hits() > 0 && b1.result === null && b2.hits() > 0 && b2.result.status === 'measured' && b2.result.ok
      console.log(B
        ? `✓ selftest 對照組 B:radiogroup 的 story 檔晚 3 秒到 —— 修前寫法(load + 600ms)看不到;本閘等到並量到 view ${b2.result.view.font}px = edit ${b2.result.edit.font}px(綠,與機器快慢無關)`
        : `✗ selftest 對照組 B 失效:攔到 ${b1.hits()}/${b2.hits()} 次、修前寫法看得到=${b1.result === true}、本閘結果=${JSON.stringify(b2.result).slice(0, 200)}`)
      // C 永遠不渲染:本閘必須判儀器失效並指名,不得略過。上限縮成 5 秒只為了讓對照組快 —— 擋掉的檔永遠不會到。
      const c = await withChunkRoute(target, 'abort', () => inspectStory(target.id, { appearTimeout: 5000 }))
      C = c.hits() > 0 && c.result.status === 'not-rendered' && c.result.name === 'radiogroup'
      console.log(C
        ? `✓ selftest 對照組 C:radiogroup 的 story 檔被擋掉 → 判「儀器失效」並指名(${c.result.detail.slice(0, 120)})`
        : `✗ selftest 對照組 C 失效:攔到 ${c.hits()} 次、結果=${JSON.stringify(c.result).slice(0, 200)} —— 永遠不渲染的 story 沒被判紅`)
    }
    selftestOk = A && B && C
  }
} catch (e) { report404(); throw e }
finally { await browser.close(); await server.stop() }

if (SELFTEST) {
  console.log(selftestOk ? '✓ selftest:三組對照都成立 —— 量具會紅、晚到會等、沒渲染會指名紅' : '✗ selftest:對照組不成立 —— 這支閘的綠燈不算證據')
  if (!selftestOk) report404()
  process.exit(selftestOk ? 0 : 1)
}
const floorOk = count.measured >= 4
console.log(`${floorOk ? '✓' : '✗'} 取樣:${count.measured} 則有值文字的四模式 story 被量到(需 ≥ 4);具名豁免 ${count['declared-skip']} 則;共 ${STORIES.length} 則`)
const failed = redCount() + (floorOk ? 0 : 1)
if (count['not-rendered']) console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${count['not-rendered']} 則 story 沒渲染完成 —— 儀器失效(沒量到),不是產品裁決,也不算通過`)
console.log(failed ? `✗ field-view-typography ${failed} 條失敗(SSOT:field-controls.spec.md (e) View typography canonical)` : `✅ field-view-typography PASS(${count.measured} 則 story)`)
if (failed) report404()
process.exit(failed ? 1 : 0)
