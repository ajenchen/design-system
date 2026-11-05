#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每一個可操作的 RadioGroup(role="radiogroup",至少一個圓沒停用)整組只佔一個 Tab 停留點 ——
 *        從群組前一格按 Tab 只停一次就離開、從後一格按 Shift+Tab 也只停一次就離開;停的那一個是已選的圓,
 *        沒有已選就是第一個可用的圓(radio-group.spec.md「Focus」:「整組只佔一個 Tab 停留點,方向鍵在選項間移動」;
 *        WAI-ARIA APG Radio Group「Keyboard Interaction」https://www.w3.org/WAI/ARIA/apg/patterns/radio/ 逐字:
 *        "Tab and Shift + Tab: Move focus into and out of the radio group. When focus moves into a radio group:
 *        If a radio button is checked, focus is set on the checked button. If none of the radio buttons are checked,
 *        focus is set on the first radio button in the group.")
 *   紅: 任一群組的 Tab / Shift+Tab 停留圓數 ≠ 1(每個圓各一個停留點 = 2026-06-05 409b91da 起的實況;或整組 0 個停留點),
 *        或停的不是已選 / 第一個可用的圓 → 指名 story、第幾組、方向、實際停留序列並 exit 1;
 *        `--selftest` 以頁面層注入三種病(每個圓都 tabindex=0 / 整組拿掉停留點 / 進群組時焦點被搶到非已選的圓)各自必須被指名紅
 *   綠: 每組兩個方向各停一次、停在對的圓上時綠;Tab 次數是真按數出來的,不是從 tabindex 屬性推算
 *
 * ── 為什麼有這支 ──
 *
 * 2026-11-04 n6(決策卡清除選取)審查時實按發現:RadioGroup 每個圓各是一個 Tab 停留點,三個圓 Tab 三下才出得去。
 * 根因在 radio-group.tsx 的 RadioGroupItem 寫 `tabIndex={effectiveReadonly ? -1 : undefined}`:Radix RadioGroup 把
 * 這個 prop 放進 Radio(子元素),外層 RovingFocusGroup.Item 以 asChild(Slot)合併 —— Slot 合併時**子元素的 prop 蓋掉
 * slot 的 prop**,於是 roving 給的 `tabIndex: isCurrentTabStop ? 0 : -1`(@radix-ui/react-roving-focus 1.1.11
 * dist/index.mjs:153)被明寫的 `undefined` 蓋掉,每顆 `<button role="radio">` 回到瀏覽器預設可 Tab。
 * 既有的 composite-role-keyboard 閘只問「同檔有沒有鍵盤證據」(檔頭明說不判斷鍵盤寫得對不對),Radix 的 roving 在檔裡,
 * 所以它綠 —— 證據存在 ≠ 行為成立,這件事只能實按。
 *
 * ── 量法 ──
 *
 * 每則 story 的每個看得見、至少一個圓可用的 role="radiogroup":在它正前方與正後方各插一顆哨兵鈕(只為了有確定的起點,
 * 不改群組本身),焦點放前哨兵 → 連按 Tab,記下每一下落在本組的哪一個圓,直到焦點離開本組的圓為止;再從後哨兵連按
 * Shift+Tab 做一次。上限 = 圓數 + 2 下(超過就是出不去,照實紅)。每則 story 開新文件,群組之間不共用狀態。
 * 開不起來 / 找不到群組 = 儀器失效(exit 2),不是產品裁決,也不當通過。
 *
 * Run: `node scripts/radio-group-tab-stop-invariant.mjs [--selftest] [--static-dir <Storybook 建置>]`
 *      (`npm run test:radio-group-tab-stop` = 主跑 + --selftest;CI:verify-browser-field-dialog-steps)
 */

import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireFreshStorybookBuild } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const staticDirArg = process.argv.find((a) => a.startsWith('--static-dir='))?.slice('--static-dir='.length)
  ?? (process.argv.includes('--static-dir') ? process.argv[process.argv.indexOf('--static-dir') + 1] : null)
const STATIC = resolve(staticDirArg ?? join(ROOT, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')

requireFreshStorybookBuild(STATIC, [
  'packages/design-system/src/components/RadioGroup/radio-group.tsx',
  'packages/design-system/src/components/RadioGroup/radio-group.stories.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
])

/**
 * 量測對象 = RadioGroup 自己的全部 story(從建置的 index.json 取,新增 story 自動納入)+ 唯一的 DS 內消費者
 * AgentPanel 決策卡的單選題(必答 / 選填各一則;n6 就是在這裡實按發現的)。
 */
const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'))
const OWN = Object.values(index.entries).filter((e) => e.type === 'story' && e.id.startsWith('design-system-components-radiogroup-')).map((e) => e.id)
const CONSUMERS = ['design-system-components-agentpanel-展示--decision-card-open', 'design-system-components-agentpanel-展示--decision-card-optional']
const STORIES = [...OWN, ...CONSUMERS]
if (OWN.length < 5) { console.error(`✗ INSTRUMENT-FAIL RadioGroup Tab 停留點:index.json 只找到 ${OWN.length} 則 RadioGroup story(建置不完整?)`); process.exit(2) }
for (const id of CONSUMERS) if (!index.entries[id]) { console.error(`✗ INSTRUMENT-FAIL RadioGroup Tab 停留點:index.json 沒有 ${id}`); process.exit(2) }

/** 頁面層注入的病要從安裝那一刻就成立,也要蓋到之後才渲染的群組(先跑一次再觀察之後的變動)。 */
const SICK = (fn) => `(() => { const f = ${fn}; f(); new MutationObserver(f).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex', 'data-state'] }) })()`
/** 對照組(只在 --selftest):不改元件原始碼,在頁面層把病造出來 —— 量具抓不到它們,就抓不到它們回來。 */
const FAULTS = {
  everyStop: {
    expect: ['forward-count', 'backward-count'],
    what: '① 每個圓各一個停留點(修前實況:明寫的 tabIndex 蓋掉 roving)',
    script: SICK(`() => { for (const r of document.querySelectorAll('[role="radiogroup"] [role="radio"]:not([disabled])')) if (r.getAttribute('tabindex') !== '0') r.setAttribute('tabindex', '0') }`),
  },
  noStop: {
    expect: ['forward-count', 'backward-count'],
    what: '② 整組沒有停留點(Tab 直接跳過群組)',
    script: SICK(`() => { for (const g of document.querySelectorAll('[role="radiogroup"]')) { if (g.getAttribute('tabindex') !== '-1') g.setAttribute('tabindex', '-1'); for (const r of g.querySelectorAll('[role="radio"]')) if (r.getAttribute('tabindex') !== '-1') r.setAttribute('tabindex', '-1') } }`),
  },
  wrongTarget: {
    expect: ['forward-target'],
    what: '③ 進群組時焦點落在不是已選的那個圓',
    // 從群組外進來(relatedTarget 不在本組的圓 / 控件上;Radix 的群組根節點先拿到焦點再轉給已選的圓,根節點本身算「外面」)且落在已選的圓 → 改送到本組另一個可用的圓
    script: `document.addEventListener('focusin', (e) => { const t = e.target; const g = t instanceof Element && t.getAttribute('role') === 'radio' && t.closest('[role="radiogroup"]'); if (!g || (e.relatedTarget && e.relatedTarget !== g && g.contains(e.relatedTarget))) return; if (t.getAttribute('aria-checked') !== 'true') return; const other = [...g.querySelectorAll('[role="radio"]:not([disabled])')].find((r) => r !== t); if (other) setTimeout(() => other.focus(), 0) }, true)`,
  },
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
// 全程一個分頁(--single-process 下關掉最後一個分頁會連瀏覽器一起關)
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const flush = () => page.evaluate(() => new Promise((r) => setTimeout(() => setTimeout(r, 0), 0)))

/** 本則 story 裡可量的群組:看得見、至少一個圓沒停用。回傳每組的圓數、已選的是第幾個、第一個可用的是第幾個。 */
const listGroups = () => page.evaluate(() => {
  const groups = [...document.querySelectorAll('#storybook-root [role="radiogroup"]')]
  return groups.map((g, gi) => {
    const radios = [...g.querySelectorAll('[role="radio"]')].filter((r) => r.closest('[role="radiogroup"]') === g)
    const enabled = radios.map((r, i) => (!r.disabled && r.getAttribute('aria-disabled') !== 'true' ? i : -1)).filter((i) => i >= 0)
    const checked = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true' && !r.disabled)
    const visible = g.checkVisibility() && g.getBoundingClientRect().width > 0
    const name = g.getAttribute('aria-label') || (g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby').split(' ')[0])?.textContent?.trim()) || ''
    const otherFocusables = [...g.querySelectorAll('input, textarea, select, button, a[href], [tabindex]')].filter((el) => el.getAttribute('role') !== 'radio' && !el.disabled).length
    return { gi, radios: radios.length, enabled, checked, visible, otherFocusables, name: name.slice(0, 30) }
  })
})

/** 在第 gi 組正前 / 正後插哨兵,焦點放上去;回傳是否成功。 */
const arm = (gi, where) => page.evaluate(({ gi, where }) => {
  for (const s of document.querySelectorAll('[data-tabstop-sentinel]')) s.remove()
  const g = document.querySelectorAll('#storybook-root [role="radiogroup"]')[gi]
  if (!g) return false
  const s = document.createElement('button')
  s.type = 'button'
  s.textContent = `sentinel-${where}`
  s.setAttribute('data-tabstop-sentinel', where)
  g.parentNode.insertBefore(s, where === 'before' ? g : g.nextSibling)
  s.focus()
  return document.activeElement === s
}, { gi, where })

/**
 * 焦點目前在第 gi 組的第幾個圓;不是本組的圓時 radio = -1,inGroup = 焦點仍在本組容器裡(例:決策卡單選題最後的「其他」輸入格 ——
 * 它是另一個控件、各自一個停留點,不算圓的停留點,也不算離開群組)。
 */
const where = (gi) => page.evaluate((gi) => {
  const g = document.querySelectorAll('#storybook-root [role="radiogroup"]')[gi]
  const a = document.activeElement
  const desc = a ? `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''}${a.getAttribute('data-tabstop-sentinel') ? `(${a.getAttribute('data-tabstop-sentinel')})` : ''}` : 'null'
  if (!g || !a || a.getAttribute('role') !== 'radio' || a.closest('[role="radiogroup"]') !== g) return { radio: -1, inGroup: !!(g && a && a !== g && g.contains(a)), el: desc }
  const radios = [...g.querySelectorAll('[role="radio"]')].filter((r) => r.closest('[role="radiogroup"]') === g)
  return { radio: radios.indexOf(a), inGroup: true, el: 'radio' }
}, gi)

/** 從哨兵連按 key,記下每一下停在本組哪個圓(本組裡的其他控件照走不記),直到焦點離開本組。 */
async function walk(gi, key, cap) {
  const stops = []
  let last = null
  for (let i = 0; i < cap; i++) {
    await page.keyboard.press(key)
    await flush()
    const w = await where(gi)
    last = w
    if (w.radio < 0 && !w.inGroup) return { stops, exitedTo: w.el, stuck: false }
    if (w.radio >= 0) stops.push(w.radio)
  }
  return { stops, exitedTo: last?.el ?? null, stuck: true }
}

async function runStory(id, fault) {
  const f = fault ? FAULTS[fault] : null
  const beforeSettle = f ? async (p) => { await p.addScriptTag({ content: f.script }) } : null
  // 有的 story(色彩矩陣、唯讀示範)本來就沒有可操作的 radiogroup:那則記「沒有群組」,不是失敗;
  // 但消費者 story 一定要有,而且全部加起來的群組數有下限(見主迴圈),免得整支閘量到 0 組還說通過
  await openStory(page, storyUrl(id), { settleFrames: 10, notFound: server.notFound, beforeSettle })
  const groups = (await listGroups()).filter((g) => g.visible && g.enabled.length > 0)
  if (!groups.length && CONSUMERS.includes(id)) throw new StoryRenderInstrumentError(`${id}:消費者 story 裡沒有看得見、可操作的 radiogroup`)
  measured.set(id, groups.length)
  const results = []
  for (const g of groups) {
    const expectTarget = g.checked >= 0 ? g.checked : g.enabled[0]
    const cap = g.radios + g.otherFocusables + 2
    const tag = `${id} 第 ${g.gi + 1} 組${g.name ? `「${g.name}」` : ''}(${g.radios} 個圓,已選 ${g.checked >= 0 ? `第 ${g.checked + 1} 個` : '無'})`
    for (const [dir, key, sentinel] of [['forward', 'Tab', 'before'], ['backward', 'Shift+Tab', 'after']]) {
      if (!(await arm(g.gi, sentinel))) throw new StoryRenderInstrumentError(`${tag}:哨兵拿不到焦點`)
      const w = await walk(g.gi, key, cap)
      const label = dir === 'forward' ? 'Tab' : 'Shift+Tab'
      const seq = `停留 ${w.stops.length ? w.stops.map((i) => `第 ${i + 1} 個圓`).join(' → ') : '(沒有停)'}${w.stuck ? `,按 ${cap} 下還在群組裡` : `,之後離開到 ${w.exitedTo}`}`
      results.push({ id: `${dir}-count`, story: id, pass: w.stops.length === 1 && !w.stuck, label: `${tag} ${label} 只停一次`, detail: seq })
      if (dir === 'forward' && w.stops.length >= 1) {
        results.push({ id: 'forward-target', story: id, pass: w.stops[0] === expectTarget, label: `${tag} Tab 進群組停在${g.checked >= 0 ? '已選的圓' : '第一個可用的圓'}(第 ${expectTarget + 1} 個)`, detail: seq })
      }
    }
  }
  return results
}

const runs = SELFTEST ? Object.keys(FAULTS) : [null]
const report = []
/** 每則 story 量到幾組(主跑時印出;總組數低於下限 = 儀器失效)。 */
const measured = new Map()
/** 下限:2026-11-05 在 52ec0b6a 建置實數 RadioGroup 自己的 story 合計 20 組;少於 15 組 = story 被改到量不到,不是通過。 */
const MIN_GROUPS = 15
for (const fault of runs) {
  const results = []
  let error = null
  for (const id of STORIES) {
    try {
      results.push(...await runStory(id, fault))
    } catch (e) {
      const msg = e instanceof StoryRenderInstrumentError ? e.message : (e?.message ?? String(e))
      if (!SELFTEST) {
        console.error(`✗ INSTRUMENT-FAIL RadioGroup Tab 停留點:${id} 量測途中失敗 —— ${msg}`)
        await browser.close(); await server.stop(); process.exit(2)
      }
      error = `${id}:${msg}`
      break
    }
  }
  report.push({ fault, results, error })
}
await browser.close()
await server.stop()

if (SELFTEST) {
  let ok = true
  for (const r of report) {
    const f = FAULTS[r.fault]
    const red = new Set(r.results.filter((x) => !x.pass).map((x) => x.id))
    const caught = !r.error && f.expect.every((id) => red.has(id))
    ok = ok && caught
    console.log(`${caught ? '✓' : '✗'} selftest ${f.what}:${caught ? `被 ${f.expect.join(' / ')} 指名紅(${r.results.filter((x) => !x.pass).length} 格)` : `沒抓到(該紅 ${f.expect.join(' / ')},實際紅 ${[...red].join(' / ') || '無'}${r.error ? `;途中 ${r.error}` : ''})`}`)
  }
  console.log(ok ? `\n✓ selftest:${report.length} 種病都被指名,量具會紅` : '\n✗ selftest:沒抓全(這支閘是假綠)')
  process.exit(ok ? 0 : 1)
}

const { results } = report[0]
const ownGroups = OWN.reduce((n, id) => n + (measured.get(id) ?? 0), 0)
console.log(`量到的群組:${[...measured].map(([id, n]) => `${id.replace(/^design-system-components-/, '')}=${n}`).join('、')}`)
if (ownGroups < MIN_GROUPS) {
  console.error(`✗ INSTRUMENT-FAIL RadioGroup Tab 停留點:RadioGroup 自己的 story 只量到 ${ownGroups} 組(下限 ${MIN_GROUPS})—— story 被改到量不到,不能算通過`)
  process.exit(2)
}
const failed = results.filter((r) => !r.pass)
for (const r of failed) console.log(`✗ ${r.id} | ${r.label} | ${r.detail}`)
if (failed.length) {
  console.error(`\n✗ RadioGroup Tab 停留點:${failed.length} / ${results.length} 格失敗(${new Set(failed.map((r) => r.story)).size} / ${STORIES.length} 則 story)`)
  process.exit(1)
}
console.log(`✓ RadioGroup Tab 停留點全過:${STORIES.length} 則 story、${results.length} 格(每組 Tab / Shift+Tab 各停一次,停在已選 / 第一個可用的圓)`)
