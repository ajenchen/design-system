#!/usr/bin/env node
/**
 * 「+N」溢出指示器不得溢出容器(2026-09-08 建)
 *
 * 由來:user 截圖抓到 Reviewers 的「+2」跑出容器(總帳 E2)。量測基準已修
 * (量自己 → 量被分配到的空間),但**猜不到 user 那張截圖的觸發時機**。
 * 溢出是幾何問題,與其猜時機不如**把寬度窮舉一遍** —— 每個有「+N」的 story
 * 都在 6 個容器寬度下量一次,任何一次超出容器右緣就是紅燈。
 *
 * 判準:`+N` 元素的 right 不得超過**最近的裁切祖先**的 right(容差 0.5px 給次像素)。
 * 量的是「有沒有超出可見範圍」,不是「有沒有 overflow:hidden 幫忙藏起來」——
 * 被藏起來的溢出對使用者一樣是壞的(數字看不到)。
 *
 * 結束碼:0 = 全部在容器內 / 1 = 有「+N」溢出(被測元件的問題)/ 2 = **儀器失效**
 * (story 沒載入、沒渲染完、版面一直沒靜止、一個候選都沒找到、或兩段結果互相矛盾)。
 * 儀器沒看到不等於「沒有 +N」,更不等於「+N 沒溢出」(M37)—— 以前這些情況全被當成「沒有 +N」靜默跳過。
 *
 * ── 2026-09-25:第一段找到的候選數每次跑都不一樣 ──────────────────────────────────────
 * 症狀:同一份建置,舊寫法第一段找到的候選數每次不同(先前回報 6 / 8 / 9 / 10;本次本機連跑 4 次:8、11、11、11;
 * CPU 降速 4 倍:10,而且第二段只確認到 9 則 —— 兩段矛盾,結論照樣綠)。
 * 根因:舊寫法每則 story 在 `load` 事件後**固定睡 320ms** 就去找「+N」。`load` 只代表 iframe.html 與入口腳本
 * 到齊;之後 Storybook 才動態載入那則 story 的模組、React 才渲染、元件才在 effect → rAF → ResizeObserver
 * 裡量寬度、算出要收幾個進「+N」。逐則觀察 3 秒(診斷當時機器另有負載):有「+N」的 story 共 11 則,
 * 「+N」出現在 load 後約 150–1230ms,DataTable roadmap 兩則最慢 —— 趕不趕得上 320ms,取決於那一刻 CPU 忙不忙。
 * 第一段沒找到的 story 第二段根本不量:拿「過了 320ms」代替「畫面已經畫完」,結果是靜默地少掃(M37)。
 * 修法:不睡固定時間,改等**被測狀態本身**的兩個訊號(lib/launch-browser.mjs 的 openStory —— 全部瀏覽器閘共用的
 * 唯一實作;2026-09-25 收斂前本檔有自己的一份 settleAndProbe):
 *   (1) Storybook 自己的渲染生命週期走到 `finished`(模組載入、渲染、play function 全跑完),且通過 render-health
 *       (不是錯誤頁、根節點有內容、無關鍵資源 404 / 頁面例外);
 *   (2) 字型載入完,且**連續 QUIET_FRAMES 個影格**沒有任何 DOM 變動、也沒有進行中的有限長度動畫。
 *       元件「量寬 → setState → 重畫」是一格一格推進的,所以用**影格數**而不是毫秒 —— 機器慢只是等久一點,
 *       不會提早取樣。「+N」在最後一個靜止影格的同一個 task 裡數(openStory 的 probe)。
 *       每次執行都印「等待實績」(渲染完成後還在變的有幾次、中途最長靜止幾格),門檻的餘裕看得見。
 *   第二段也改用同一個等待(量幾何本來就該量畫完的狀態),並核對「第一段找到的,第二段都看得到」。
 * 等不到 → 那一則記為儀器失效(exit 2)。docs 條目(`--docs`)渲染進 #storybook-docs,
 * 這支量的 #storybook-root 在那種頁面永遠是空的 —— 以前算進「掃了 111 則」其實從沒量到東西,現在明確排除並印出。
 *
 * --selftest(CI 必跑,與機器速度無關的對照組):
 *   A. 把一個真的「+N」硬推出去 → 必須紅(原本就有)
 *   D. 結論表:零候選、有儀器失效、兩段矛盾 → 都必須是 exit 2
 *   E. 真實 story 在 CPU 降速 6 倍下,完整等待仍找得到「+N」
 *   (原本的 B「晚到的 +N:固定睡眠 / 只等渲染完成都抓不到、完整等待抓得到」與 C「永遠渲染不完 / 永遠不靜止 →
 *    儀器失效」測的是等待本身;等待收斂成共用的 openStory 之後,這兩組對照跟著它搬到 scripts/test-open-story.mjs,
 *    每個 PR 都跑 —— 一份實作、一份對照組,不在各閘各留一份。)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const STATIC = join(process.cwd(), 'storybook-static')
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
// 失敗(非零結束或拋錯)一律附上同源 404 帳本:「儀器沒拿到檔」不得被讀成「沒有 +N / +N 溢出」
process.on('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })

const SELFTEST = process.argv.includes('--selftest')
const WIDTHS = [1440, 1100, 900, 720, 560, 420]
// 版面要連續靜止幾個影格才算畫完。實測值(中途最長靜止幾格)每次執行都印在「等待實績」那一行,不在這裡寫死。
const QUIET_FRAMES = 10
const LOAD_TIMEOUT_MS = 30000
const RENDER_CAP_MS = 30000   // 渲染生命週期走完的上限(正常 < 2 秒;只在真的卡住時才用到)
const QUIET_CAP_MS = 10000    // 渲染完之後版面靜止的上限(同上)
// story 清單也讀**正在供檔的那份建置**(快照),不讀活目錄 —— 清單與頁面必須出自同一次建置
const index = JSON.parse(readFileSync(join(sv.snapshot?.dir ?? STATIC, 'index.json'), 'utf8'))
// 自動推導:凡是可能出現「+N」的元件全掃,不挑幾個代表(NO-SAMPLE)
const MATCHED = Object.keys(index.entries).filter((i) => /avatar|peoplepicker|tag|chip|overflow|datatable/i.test(i) && /展示|設計規格/.test(i))
// 只掃 story 條目:docs 條目的內容渲染在 #storybook-docs,#storybook-root 永遠是空的(量了等於沒量)
const IDS = MATCHED.filter((i) => index.entries[i].type === 'story')
const DOCS_SKIPPED = MATCHED.length - IDS.length
const storyUrl = (id) => `${sv.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
const short = (id) => id.replace('design-system-components-', '').replace('design-system-internal-', '')

/**
 * 在頁面內執行(openStory 的 probe:在最後一個靜止影格的同一個 task 裡跑,序列化傳入,不得引用外部變數)。
 * 數 #storybook-root 裡文字剛好是「+數字」的葉節點。
 */
const countPlus = () => {
  const root = document.querySelector('#storybook-root')
  if (!root) return 0
  return [...root.querySelectorAll('*')].filter((e) => !e.children.length && /^\+\s*\d+$/.test((e.textContent || '').trim())).length
}

/**
 * 整次執行的結論(純函式;selftest D 逐格驗它,正式結論也只走它 —— 不得有第二份平行判斷)。
 * 儀器失效優先於產品結論:有任何一則沒量到,綠燈與紅燈都不可信。
 */
function verdict({ selftest, candidates, broken, withPlus, bad }) {
  if (broken.length) return { code: 2, why: `${broken.length} 次載入沒量到(儀器失效,不是「沒有 +N」)` }
  if (candidates.length === 0) return { code: 2, why: '第一段一個有「+N」的 story 都沒找到 —— 儀器失效,不當綠燈' }
  if (!selftest && withPlus !== candidates.length) {
    return { code: 2, why: `第一段找到 ${candidates.length} 則有「+N」,第二段只在 ${withPlus} 則看到 —— 兩段矛盾,取樣不確定` }
  }
  if (bad.length) return { code: 1, why: `${bad.length} 處「+N」溢出容器` }
  return { code: 0, why: '所有「+N」指示器都在容器內' }
}

const browser = await launchBrowser()
const page = await browser.newPage()
const bad = []
const broken = []
let scanned = 0, withPlus = 0
// 等待的實績:讓「門檻離實際多遠」每次執行都看得見
const wait = { settled: 0, withLateChanges: 0, maxFramesWaited: 0, longestBrokenQuiet: 0 }

/** 開一則頁面並等到畫完;失敗回 { ok:false, why },絕不回「沒有 +N」。 */
const visit = async (url, w) => {
  await page.setViewportSize({ width: w, height: 900 })
  let r
  try {
    const opened = await openStory(page, url, {
      settleFrames: QUIET_FRAMES, probe: countPlus, notFound: sv.notFound,
      navigationTimeoutMs: LOAD_TIMEOUT_MS, timeoutMs: RENDER_CAP_MS, settleTimeoutMs: QUIET_CAP_MS,
    })
    r = { ok: true, plus: opened.probe, ms: opened.ms, ...opened.settle }
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    return { ok: false, why: error.detail }
  }
  wait.settled++
  if (r.lateChanges) wait.withLateChanges++
  wait.maxFramesWaited = Math.max(wait.maxFramesWaited, r.framesWaited)
  wait.longestBrokenQuiet = Math.max(wait.longestBrokenQuiet, r.longestBrokenQuiet)
  return r
}

// 兩段式:106 則 story × 6 個寬度 = 636 次載入,在 CI 上就是好幾分鐘(本機也慢)。
// 但實測只有 11 則會出現「+N」—— 其餘 95 則量六次是純粹浪費。
// 先用**兩端寬度**掃一遍找出哪些 story 有「+N」,再只對那些跑滿全部寬度。
// 覆蓋率不變(有「+N」的都掃過全部寬度),前提是第一段**不會漏找** —— 那正是上面 visit(openStory)保證的事。
// 探測用**兩端**而不是只有最窄:窄的時候比較容易擠出「+N」,但響應式 story 也可能
// 反過來(窄版少渲染幾個 item 就不溢出,寬版塞得多才出現)。只掃一端會漏掉那一類。
const PROBE_WIDTHS = [WIDTHS[0], WIDTHS[WIDTHS.length - 1]]
const CANDIDATES = []
for (const id of IDS) {
  let found = false
  for (const w of PROBE_WIDTHS) {
    scanned++
    const r = await visit(storyUrl(id), w)
    if (!r.ok) { broken.push(`${short(id)} @${w}px:${r.why}`); continue }
    if (r.plus > 0) { found = true; break }
  }
  if (found) CANDIDATES.push(id)
  // 對照組只要一個有「+N」的 story 就證得出來,不必把 106 則探測完(省 CI 一分鐘)。
  if (SELFTEST && CANDIDATES.length) break
}
console.log(`第一段:${IDS.length} 則 story 在 ${PROBE_WIDTHS.join(' / ')}px 探測(另有 ${DOCS_SKIPPED} 則 docs 條目不適用,已排除),找到 ${CANDIDATES.length} 則有「+N」:`)
CANDIDATES.forEach((id) => console.log('  · ' + short(id)))

for (const id of CANDIDATES) {
  if (SELFTEST && bad.length) break
  let sawPlus = false
  for (const w of WIDTHS) {
    scanned++
    const r = await visit(storyUrl(id), w)
    if (!r.ok) { broken.push(`${short(id)} @${w}px:${r.why}`); continue }
    const hits = await page.evaluate((selftest) => {
      const root = document.querySelector('#storybook-root') || document.body
      // 「+N」的載體:文字剛好是 +數字
      const plus = [...root.querySelectorAll('*')].filter((e) => {
        if (e.children.length) return false
        return /^\+\s*\d+$/.test((e.textContent || '').trim())
      })
      if (selftest && plus.length) plus[0].style.transform = 'translateX(400px)'  // 對照組:硬推出去
      const clippingAncestor = (el) => {
        let p = el.parentElement
        while (p && p !== document.documentElement) {
          const cs = getComputedStyle(p)
          if (/hidden|auto|scroll|clip/.test(cs.overflowX + cs.overflowY)) return p
          p = p.parentElement
        }
        return null
      }
      return plus.map((el) => {
        const anc = clippingAncestor(el)
        const target = anc || el.offsetParent || root
        const a = el.getBoundingClientRect(), b = target.getBoundingClientRect()
        return { text: (el.textContent || '').trim(), overRight: +(a.right - b.right).toFixed(1), overLeft: +(b.left - a.left).toFixed(1),
                 host: anc ? 'clip祖先' : '版面祖先', tag: el.tagName + '.' + (el.className || '').toString().split(' ')[0] }
      })
    }, SELFTEST)
    if (hits.length) { sawPlus = true }
    for (const h of hits) {
      if (h.overRight > 0.5 || h.overLeft > 0.5) {
        bad.push(`${short(id)} @${w}px  「${h.text}」超出${h.host} 右${h.overRight}px 左${h.overLeft}px  (${h.tag})`)
      }
    }
    // 對照組只需要證明「該紅的時候會紅」,抓到一筆就夠 —— 掃完全部只是讓 CI 多等一分鐘。
    if (SELFTEST && bad.length) break
  }
  if (sawPlus) withPlus++
  else if (!SELFTEST) console.log(`  ✗ ${short(id)}:第一段看到「+N」,第二段六個寬度全沒看到`)
}

console.log(`第二段:${CANDIDATES.length} 個候選 × ${WIDTHS.length} 個寬度;合計載入 ${scanned} 次,${withPlus} 則確認有「+N」`)
console.log(`等待實績:${wait.settled} 次載入中 ${wait.withLateChanges} 次在渲染完成後版面還在變,等到停(最多等了 ${wait.maxFramesWaited} 格);`
  + `中途最長靜止 ${wait.longestBrokenQuiet} 格後又再變動(門檻 ${QUIET_FRAMES} 格,逼近門檻就要調高)`)
if (broken.length) {
  console.log(`\n✗ 儀器失效 ${broken.length} 次:`)
  broken.slice(0, 20).forEach((b) => console.log('  ' + b))
}

if (SELFTEST) {
  const checks = []
  const check = (ok, text) => { checks.push(ok); console.log(`${ok ? '✓' : '✗'} selftest ${text}`) }

  // ── A. 硬推出去必須紅 ────────────────────────────────────────────────
  check(bad.length > 0, bad.length
    ? `A:把「+N」硬推出去時這支確實會紅(${bad.length} 筆)`
    : 'A:推出去了卻沒抓到 —— 這支的綠燈不算證據')

  // ── D. 結論表(正式結論走的同一支純函式)──────────────────────────────
  const rows = [
    [{ selftest: false, candidates: [], broken: [], withPlus: 0, bad: [] }, 2, '零候選'],
    [{ selftest: false, candidates: ['x'], broken: ['y @420px:載入失敗'], withPlus: 1, bad: [] }, 2, '有一次沒量到'],
    [{ selftest: false, candidates: ['x', 'y'], broken: [], withPlus: 1, bad: [] }, 2, '兩段矛盾'],
    [{ selftest: false, candidates: ['x'], broken: ['y'], withPlus: 1, bad: ['z'] }, 2, '有溢出但也有沒量到'],
    [{ selftest: false, candidates: ['x'], broken: [], withPlus: 1, bad: ['z'] }, 1, '有溢出'],
    [{ selftest: false, candidates: ['x'], broken: [], withPlus: 1, bad: [] }, 0, '全部在容器內'],
  ]
  const wrongRows = rows.filter(([input, want]) => verdict(input).code !== want).map(([, want, name]) => `${name}(需 ${want})`)
  check(wrongRows.length === 0, `D:結論表 ${rows.length} 格${wrongRows.length ? ',錯:' + wrongRows.join('、') : '全對(零候選 / 沒量到 / 兩段矛盾 → 2)'}`)

  // ── E. 真實 story 在 CPU 降速 6 倍下仍找得到 ──────────────────────────
  if (CANDIDATES.length) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
    const slow = []
    for (const w of PROBE_WIDTHS) slow.push(await visit(storyUrl(CANDIDATES[0]), w))
    await page.goto(storyUrl(CANDIDATES[0]), { waitUntil: 'load' }); await page.waitForTimeout(320)
    const oldWay = await page.evaluate(countPlus)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    check(slow.some((r) => r.ok && r.plus > 0) && slow.every((r) => r.ok),
      `E:${short(CANDIDATES[0])} 在 CPU 降速 6 倍下 —— 完整等待 ${slow.map((r) => r.ok ? `${r.plus} 個(${r.ms}ms)` : r.why).join(' / ')};舊寫法(load + 320ms)抓到 ${oldWay} 個(僅供對照)`)
  } else check(false, 'E:第一段沒有任何候選,無法驗降速')

  await browser.close(); await sv.stop()
  const ok = checks.every(Boolean) && broken.length === 0
  console.log(ok ? '\n✓ selftest 全部成立' : '\n✗ selftest 有對照組不成立 —— 這支的綠燈不算證據')
  process.exit(ok ? 0 : 1)
}

await browser.close(); await sv.stop()
const v = verdict({ selftest: false, candidates: CANDIDATES, broken, withPlus, bad })
if (v.code === 1) {
  console.log(`\n✗ ${v.why}:`)
  bad.slice(0, 20).forEach((b) => console.log('  ' + b))
} else console.log(`\n${v.code === 0 ? '✓' : '✗'} ${v.why}`)
process.exit(v.code)
