#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每一則 import Steps 的 story 裡,每一條步驟條都遵守 `steps.spec.md`「內容跟著目前那一步」——
 *         (1) 內容區只出現在 `aria-current="step"` 的那一步;若同一條裡有任何一步畫出內容,目前那一步也必須有
 *             (內容區 = `li[data-state]` 裡 header 之後、不是連接線 `[data-steps-connector]` 的直接子元素 —— 退役前後兩版 DOM 都是這個結構,
 *              對照組才量得到);
 *         (2) 步驟的 header(`li[data-state]` 的第一個子元素,含其子樹、不含內容區)沒有 `aria-expanded` / `aria-controls`——
 *             header 是「跳到那一步」,不是開合鈕(2026-09-30 退役「可同時打開多步」模式;2026-07-05 `7e69aad7` 加的 ARIA 一併拿掉)。
 *         載入後先量一次;第一輪依序點每個當下可點的 header(`role="button"`,點之前現場再確認一次);按一次目前那一步內容區裡的
 *         第一顆按鈕(精靈的「下一步」);按過之後再跑第二輪 header(例:預設精靈剛完成的那一步此時才可點 —— 點回去,內容必須跟著回來)。
 *         每次互動等版面靜止後重量重判。
 *   紅: 任一步在不是目前那一步時仍畫出內容(content-not-current)/ 目前那一步沒畫內容而別步有(current-without-content)/
 *       任一 header 帶 aria-expanded 或 aria-controls → 指名 story、步驟條、第幾步、哪一種並 exit 1。
 *       退役前的建置(多重展開模式 story 全部展開、預設精靈已完成那一步帶 aria-expanded="false")四種都紅 —— `--selftest --control-static=<舊建置>` 證明。
 *       零則 story / 零條步驟條 / 零次點擊 / 零次「目前那一步移動」/ 零處內容 / 零次「點 header 讓有內容區的步驟條換了目前那一步」
 *       = 儀器失效(INSTRUMENT-FAIL,exit 1),不當綠燈 —— 最後一項沒發生過,「點 header → 內容跟著走」這條就從沒被量到。
 *   綠: 退役後的建置全部 story 零違規;同一份 storybook-static 重複跑結果恆等(點擊順序固定、等靜止用影格不用固定睡眠)。
 *   量法: 讀 storybook-static/index.json,挑 importPath 檔案 import 了 Steps 的 story(純文字判定 `importsSteps`,selftest 兩面);
 *         `requireFreshStorybookBuild` 守建置不比原始碼舊;每則 story 用共用 openStory 開到真正渲染完成,
 *         `settleAfterInteraction` 等連續靜止影格;判定抽成純函式 `judge`。selftest:判定表;真實建置上每一則有步驟條的 story 注入
 *         `aria-expanded`、每一則有內容區的 story 把內容複製到別步,必被抓到;再注入「點 header 後 aria-current 移走、舊內容留在原步」
 *         跑一次完整掃描,必在預設精靈被抓到(只點載入當下可點的 header、不跑第二輪就抓不到 —— 預設精靈載入時沒有可點的 header)。
 *
 * Run: node scripts/steps-content-follows-current-invariant.mjs [--static=<dir>] [--selftest [--control-static=<舊建置>]]
 */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, requireStorybookBuild,
  settleAfterInteraction, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const arg = (name) => { const hit = ARGS.find((a) => a.startsWith(`${name}=`)); return hit ? hit.slice(name.length + 1) : null }
const STATIC = path.resolve(arg('--static') ?? path.join(REPO, 'storybook-static'))
const CONTROL_STATIC = arg('--control-static') ? path.resolve(arg('--control-static')) : null
const STEPS_SOURCE = 'packages/design-system/src/components/Steps/steps.tsx'
const VIEWPORT = { width: 1280, height: 900 }

// ── 純函式:這個 story 檔有沒有 import Steps ─────────────────────────────────
// 認三種寫法:元件自己的 story(`./steps`)、路徑指到 Steps 目錄、或從 barrel(`@qijenchen/design-system` / `@/design-system`)
// 的 import 子句裡點名 `Steps`。只看 import 語句,說明文字裡出現「Steps」不算。
export function importsSteps(source) {
  const importRe = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = importRe.exec(source))) {
    const [, clause, specifier] = m
    if (/^\.\/steps$/.test(specifier) || /(^|\/)components\/Steps(\/steps)?$/.test(specifier)) return true
    if (/^(@qijenchen\/design-system|@\/design-system)(\/index)?$/.test(specifier) && /\bSteps\b/.test(clause)) return true
  }
  return false
}

// ── 純函式:一次量測 → 違規清單 ──────────────────────────────────────────────
// snapshot = { lists: [{ items: [{ current, hasContent, headerExpanded, headerControls }] }] }
export function judge(snapshot, label = '') {
  const violations = []
  snapshot.lists.forEach((list, li) => {
    const anyContent = list.items.some((it) => it.hasContent)
    list.items.forEach((it, ii) => {
      const where = `${label}步驟條 ${li + 1} 第 ${ii + 1} 步`
      if (it.hasContent && !it.current) violations.push({ kind: 'content-not-current', where, text: `${where}:不是目前那一步卻畫出內容區` })
      if (it.current && anyContent && !it.hasContent) violations.push({ kind: 'current-without-content', where, text: `${where}:是目前那一步卻沒有內容區(同一條別的步有)` })
      if (it.headerExpanded) violations.push({ kind: 'aria-expanded', where, text: `${where}:header 帶 aria-expanded(header 不是開合鈕)` })
      if (it.headerControls) violations.push({ kind: 'aria-controls', where, text: `${where}:header 帶 aria-controls(header 不是開合鈕)` })
    })
  })
  return violations
}

// ── 頁面端量測(以原始碼序列化傳進頁面:不得引用外部變數)─────────────────────
const measureInPage = () => {
  const lists = [...document.querySelectorAll('ol[data-orientation][data-size]')]
    .filter((ol) => ol.querySelector(':scope > li[data-state]'))
  return {
    lists: lists.map((ol) => ({
      items: [...ol.querySelectorAll(':scope > li[data-state]')].map((li) => {
        const header = li.firstElementChild
        const inHeader = header ? [header, ...header.querySelectorAll('*')] : []
        // 內容區 = header 之後、不是連接線的直接子元素(VerticalLayout 的 fragment:header / content? / connector?)
        const extras = [...li.children].slice(1).filter((el) => !el.hasAttribute('data-steps-connector'))
        return {
          current: li.getAttribute('aria-current') === 'step',
          hasContent: extras.length > 0,
          clickable: !!header && header.getAttribute('role') === 'button',
          headerExpanded: inHeader.some((el) => el.hasAttribute('aria-expanded')),
          headerControls: inHeader.some((el) => el.hasAttribute('aria-controls')),
        }
      }),
    })),
  }
}

// ── selftest 注入:點 header 之後,若目前那一步真的換了,就把舊內容的複本留在原本那一步 ───────────
// 在 document 的捕獲階段先記下「點之前的目前那一步」與它的內容;React 處理完這次點擊(微任務內 commit)後的下一個 task 再判斷。
// 以原始碼序列化傳進頁面:不得引用外部變數。
const injectStaleContentOnHeaderClick = () => {
  if (window.__stepsStaleContentInjected) return
  window.__stepsStaleContentInjected = true
  document.addEventListener('click', (event) => {
    const header = event.target instanceof Element ? event.target.closest('ol[data-orientation][data-size] > li[data-state] > :first-child') : null
    if (!header) return
    const ol = header.parentElement.parentElement
    const current = ol.querySelector(':scope > li[data-state][aria-current="step"]')
    const content = current ? [...current.children].slice(1).find((el) => !el.hasAttribute('data-steps-connector')) : null
    if (!current || !content) return
    const copy = content.cloneNode(true)
    setTimeout(() => { if (current.isConnected && current.getAttribute('aria-current') !== 'step') current.appendChild(copy) }, 0)
  }, true)
}

// ── 儀器失效訊息(四個丟出點共用;建構子要的是物件,不是字串 —— 傳字串會把原因整段吞掉)──
export function noStepsStoriesError(reason) {
  return new StoryRenderInstrumentError({ storyId: '(index.json)', kind: 'no-preview', reason })
}
export function notSettledError(storyId, what) {
  return new StoryRenderInstrumentError({ storyId, kind: 'dom-not-settled', reason: `${what}之後版面在上限內沒有靜止` })
}
export function clickFailedError(storyId, what, cause) {
  return new StoryRenderInstrumentError({ storyId, kind: 'wait-for-timeout', reason: `${what}點不下去:${cause?.message ?? cause}`, cause })
}

// ── 挑 story(開瀏覽器之前就做;挑不到 = 儀器失效,不是「沒東西要量」)────────────
export function selectStepsStories(staticDir, repo = REPO) {
  const indexPath = path.join(staticDir, 'index.json')
  if (!existsSync(indexPath)) throw noStepsStoriesError(`${indexPath} 不存在`)
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const stories = Object.values(index.entries ?? {}).filter((e) => e.type === 'story')
  if (stories.length === 0) throw noStepsStoriesError('index.json 裡沒有任何 story')
  const cache = new Map()
  const missing = []
  const picked = []
  for (const story of stories) {
    const file = path.resolve(repo, story.importPath)
    if (!cache.has(file)) {
      if (!existsSync(file)) { missing.push(story.importPath); cache.set(file, false); continue }
      cache.set(file, importsSteps(readFileSync(file, 'utf8')))
    }
    if (cache.get(file)) picked.push(story)
  }
  if (missing.length) throw noStepsStoriesError(`index.json 指到的 story 檔不在工作樹裡(${missing.length} 個):${missing.join(', ')}`)
  if (picked.length === 0) throw noStepsStoriesError('建置裡沒有任何 import Steps 的 story —— 選 story 的推導壞了,或 Steps 的 story 整批不見了')
  return { picked, sources: [STEPS_SOURCE, ...new Set(picked.map((s) => s.importPath.replace(/^\.\//, '')))] }
}

// ── 主量測:每則 story 載入 → 判 → 第一輪點 header → 按內容區第一顆按鈕 → 第二輪點 header ─────
// inject:在每則 story 載入後、量測前於頁面執行的函式(selftest 注入回歸用;正式跑不傳)。only:只掃哪些 story(selftest 用)。
async function scanBuild(staticDir, { fresh = true, log = console.log, inject = null, only = null } = {}) {
  const selected = selectStepsStories(staticDir)
  const picked = only ? selected.picked.filter(only) : selected.picked
  if (fresh) requireFreshStorybookBuild(staticDir, selected.sources)
  const server = await startA11yStaticServer({ rootDirectory: staticDir, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  const totals = { stories: 0, lists: 0, clicks: 0, moves: 0, contents: 0, headerContentMoves: 0 }
  const stillStories = []
  const violations = []
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    for (const story of picked) {
      const url = `${server.origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`
      // 不以 `li[data-state]` 當等待條件:同一個 story 檔裡有純文字的 story(例:設計規格「無障礙與鍵盤」),它們合法地沒有步驟條,
      // 量到 0 條就記 0 條;等渲染完成 + 版面靜止由共用 openStory 保證
      await openStory(page, url, { settleFrames: 10, notFound: server.notFound })
      if (inject) await page.evaluate(inject)
      const settle = async (what) => { const r = await settleAfterInteraction(page); if (!r.ok) throw notSettledError(story.id, what) }
      const lists = () => page.locator('ol[data-orientation][data-size]').filter({ has: page.locator(':scope > li[data-state]') })
      let snap = await page.evaluate(measureInPage)
      totals.stories += 1
      totals.lists += snap.lists.length
      let clicks = 0, moves = 0, headerContentMoves = 0
      const record = (s) => { violations.push(...judge(s, `${story.id} `)); totals.contents += s.lists.reduce((n, l) => n + l.items.filter((it) => it.hasContent).length, 0) }
      // 一次互動之後:重量、計數、判定。回傳這次有沒有讓「有內容區的步驟條」換了目前那一步
      const afterInteraction = async (what, byHeader) => {
        const before = snap
        await settle(what)
        snap = await page.evaluate(measureInPage)
        clicks += 1
        let moved = false, movedWithContent = false
        if (snap.lists.length === before.lists.length) {
          snap.lists.forEach((l, i) => {
            const was = before.lists[i].items.findIndex((it) => it.current)
            const now = l.items.findIndex((it) => it.current)
            if (was === now) return
            moved = true
            if (before.lists[i].items.some((it) => it.hasContent) || l.items.some((it) => it.hasContent)) movedWithContent = true
          })
        }
        if (moved) moves += 1
        if (byHeader && movedWithContent) headerContentMoves += 1
        record(snap)
      }
      // 一輪 header:依序走過每一個位置,點之前現場確認它還是按鈕(上一下可能讓它變成目前那一步、或讓後面的步解鎖)
      const headerPass = async (pass) => {
        const shape = snap.lists.map((l) => l.items.length)
        for (let li = 0; li < shape.length; li += 1) {
          for (let ii = 0; ii < shape[li]; ii += 1) {
            const header = lists().nth(li).locator(':scope > li[data-state]').nth(ii).locator(':scope > :first-child')
            if (await header.count() !== 1 || (await header.getAttribute('role')) !== 'button') continue
            const what = `${pass}點步驟條 ${li + 1} 第 ${ii + 1} 步的 header`
            try { await header.click({ timeout: 5000 }) } catch (cause) { throw clickFailedError(story.id, what, cause) }
            await afterInteraction(what, true)
          }
        }
      }
      record(snap)
      await headerPass('第一輪')
      // 目前那一步內容區裡的第一顆按鈕(精靈的「下一步」):按一次,看目前那一步有沒有跟著走;按過就再跑一輪 header
      const contentButton = page.locator('ol[data-orientation][data-size] > li[data-state][aria-current="step"] > :nth-child(n+2):not([data-steps-connector]) button').first()
      if (await contentButton.count() > 0 && await contentButton.isEnabled()) {
        try { await contentButton.click({ timeout: 5000 }) } catch (cause) { throw clickFailedError(story.id, '目前那一步內容區裡的第一顆按鈕', cause) }
        await afterInteraction('按內容區裡的第一顆按鈕', false)
        await headerPass('第二輪')
      }
      totals.clicks += clicks
      totals.moves += moves
      totals.headerContentMoves += headerContentMoves
      if (clicks > 0 && moves === 0) stillStories.push(story.id)
      log(`  ${story.id}:${snap.lists.length} 條步驟條、點 ${clicks} 下、目前那一步移動 ${moves} 次(其中點 header 讓有內容區的步驟條換步 ${headerContentMoves} 次)`)
    }
  } finally { await browser.close(); await server.stop() }
  // 同一處同一種只報一次(逐次互動重判會重複量到同一個靜態違規)
  const seen = new Set()
  const unique = violations.filter((v) => { const k = `${v.kind}|${v.where}`; if (seen.has(k)) return false; seen.add(k); return true })
  return { totals, violations: unique, stillStories }
}

export function instrumentProblems(totals) {
  const problems = []
  if (totals.stories === 0) problems.push('沒有量到任何 story')
  if (totals.lists === 0) problems.push('沒有量到任何步驟條')
  if (totals.clicks === 0) problems.push('一下都沒點到(可點的 header 與內容區按鈕都沒有)')
  if (totals.moves === 0) problems.push('目前那一步一次都沒移動(互動沒有生效)')
  if (totals.contents === 0) problems.push('沒有量到任何內容區(StepContent 從沒渲染)')
  if (!totals.headerContentMoves) problems.push('沒有任何一次點 header 讓有內容區的步驟條換了目前那一步(「點 header → 內容跟著走」從沒被量到)')
  return problems
}

// ── selftest ───────────────────────────────────────────────────────────────
async function selftest() {
  let ok = true
  const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) ok = false }
  const item = (o) => ({ current: false, hasContent: false, clickable: true, headerExpanded: false, headerControls: false, ...o })
  const kinds = (v) => v.map((x) => x.kind).sort().join(',')
  // 判定表
  check(judge({ lists: [{ items: [item({ current: true, hasContent: true }), item(), item()] }] }).length === 0, '判定表:只有目前那一步有內容 → 綠')
  check(judge({ lists: [{ items: [item(), item({ current: true }), item()] }] }).length === 0, '判定表:水平 / 沒有 StepContent(整條沒內容)→ 綠')
  check(kinds(judge({ lists: [{ items: [item({ hasContent: true }), item({ current: true, hasContent: true }), item({ hasContent: true })] }] })) === 'content-not-current,content-not-current', '判定表:多重展開全開(退役前)→ 兩筆 content-not-current')
  check(kinds(judge({ lists: [{ items: [item({ hasContent: true }), item({ current: true }), item()] }] })) === 'content-not-current,current-without-content', '判定表:目前那一步被收合、別步展開(退役前)→ content-not-current + current-without-content')
  check(kinds(judge({ lists: [{ items: [item({ headerExpanded: true }), item({ current: true, hasContent: true })] }] })) === 'aria-expanded', '判定表:已完成那一步 header 帶 aria-expanded="false"(退役前預設精靈)→ aria-expanded')
  check(kinds(judge({ lists: [{ items: [item({ headerExpanded: true, headerControls: true, hasContent: true }), item({ current: true })] }] })) === 'aria-controls,aria-expanded,content-not-current,current-without-content', '判定表:已完成那一步展開中、header 帶 aria-expanded + aria-controls、目前那一步收合 → 四種一起紅')
  check(judge({ lists: [{ items: [item({ current: true, hasContent: true })] }, { items: [item(), item({ current: true })] }] }).length === 0, '判定表:同一頁兩條步驟條各自乾淨 → 綠')
  // importsSteps 兩面
  check(importsSteps("import { Steps, StepItem } from './steps'\n"), 'importsSteps:元件自己的 story(./steps)→ 是')
  check(importsSteps("import { Steps } from '@/design-system/components/Steps/steps'\n"), 'importsSteps:完整路徑 → 是')
  check(importsSteps("import { Button, Steps } from '@qijenchen/design-system'\n"), 'importsSteps:barrel 子句點名 Steps → 是')
  check(!importsSteps("import { Button } from '@qijenchen/design-system'\n// Steps 只出現在註解\n"), 'importsSteps:barrel 沒點名、只在註解提到 → 否')
  check(!importsSteps("import { TreeView } from './tree-view'\n"), 'importsSteps:別的元件 → 否')
  // 儀器失效訊息印得出原因(四個丟出點各一)
  check(noStepsStoriesError('沒有任何 import Steps 的 story').message.includes('沒有任何 import Steps 的 story'), '儀器失效訊息:選不到 story 時印得出原因')
  check(notSettledError('x', '點 header').message.includes('點 header之後版面在上限內沒有靜止'), '儀器失效訊息:版面不靜止時印得出原因')
  check(clickFailedError('x', 'header', new Error('intercepted')).message.includes('header點不下去:intercepted'), '儀器失效訊息:點不下去時印得出原因與根因')
  check(instrumentProblems({ stories: 0, lists: 0, clicks: 0, moves: 0, contents: 0, headerContentMoves: 0 }).length === 6 && instrumentProblems({ stories: 1, lists: 1, clicks: 1, moves: 1, contents: 1, headerContentMoves: 1 }).length === 0, '儀器失效判定:六個零各自點名、全非零不報')
  check(instrumentProblems({ stories: 17, lists: 22, clicks: 36, moves: 10, contents: 40, headerContentMoves: 0 }).length === 1, '儀器失效判定:其他都非零、只有「點 header 換步」為零(只按「下一步」、沒點回已完成那一步)→ 照樣儀器失效')
  // 端到端:一份沒有任何 Steps story 的假建置,真的跑一次本閘,它必須 exit 1 並印出原因(不開瀏覽器)
  const fake = mkdtempSync(path.join(tmpdir(), 'steps-gate-fake-'))
  try {
    const fakeStory = path.join(REPO, 'packages/design-system/src/components/TreeView/tree-view.stories.tsx')
    writeFileSync(path.join(fake, 'index.json'), JSON.stringify({ v: 5, entries: { a: { type: 'story', id: 'a', importPath: `./${path.relative(REPO, fakeStory)}` } } }))
    writeFileSync(path.join(fake, 'iframe.html'), '<!doctype html><html></html>')
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--static=${fake}`], { encoding: 'utf8' })
    const out = `${run.stdout}\n${run.stderr}`
    check(run.status === 1 && out.includes('建置裡沒有任何 import Steps 的 story'), '端到端:沒有 Steps story 的假建置 → exit 1 且印出原因')
  } finally { rmSync(fake, { recursive: true, force: true }) }
  // 以下要真建置 + 瀏覽器
  requireStorybookBuild(path.join(STATIC, 'index.json'))
  const { picked, sources } = selectStepsStories(STATIC)
  requireFreshStorybookBuild(STATIC, sources)
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return ok }
  const contentStories = []
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    let listStories = 0, injected1 = 0, caught1 = 0, moved2 = 0, caught2 = 0, dirty = []
    for (const story of picked) {
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, { settleFrames: 10, notFound: server.notFound })
      const shape = await page.evaluate(measureInPage)
      if (shape.lists.length === 0) continue
      listStories += 1
      if (judge(shape).length) dirty.push(story.id)
      // 注入 (1):每個 header 加 aria-expanded="false"(退役前預設精靈的樣子)
      const n1 = await page.evaluate(() => {
        const headers = [...document.querySelectorAll('ol[data-orientation][data-size] > li[data-state] > :first-child')]
        headers.forEach((h) => h.setAttribute('aria-expanded', 'false'))
        return headers.length
      })
      injected1 += n1
      caught1 += judge(await page.evaluate(measureInPage)).filter((v) => v.kind === 'aria-expanded').length
      await page.evaluate(() => document.querySelectorAll('ol[data-orientation][data-size] [aria-expanded]').forEach((h) => h.removeAttribute('aria-expanded')))
      if (!shape.lists.some((l) => l.items.some((it) => it.hasContent))) continue
      contentStories.push(story.id)
      // 注入 (2):把內容區複製到不是目前那一步的 li(退役前多重展開的樣子)
      const n2 = await page.evaluate(() => {
        let n = 0
        for (const ol of document.querySelectorAll('ol[data-orientation][data-size]')) {
          const items = [...ol.querySelectorAll(':scope > li[data-state]')]
          const content = ol.querySelector(':scope > li[data-state][aria-current="step"] > :nth-child(n+2):not([data-steps-connector])')
          const other = items.find((li) => li.getAttribute('aria-current') !== 'step')
          if (content && other) { other.appendChild(content.cloneNode(true)); n += 1 }
        }
        return n
      })
      moved2 += n2
      caught2 += judge(await page.evaluate(measureInPage)).filter((v) => v.kind === 'content-not-current').length
    }
    check(dirty.length === 0, `注入前:${listStories} 則有步驟條的 story 全部乾淨${dirty.length ? `(髒:${dirty.join(', ')})` : ''}`)
    check(contentStories.length > 0, `注入前:有內容區的 story ${contentStories.length} 則(${contentStories.join(', ')})—— 注入才有東西可量`)
    check(injected1 > 0 && caught1 === injected1, `注入 aria-expanded(${listStories} 則有步驟條的 story 全部):${injected1} 處注入、${caught1} 處抓到`)
    check(moved2 > 0 && caught2 === moved2, `注入內容放錯步(${contentStories.length} 則有內容區的 story 全部):${moved2} 處注入、${caught2} 處抓到`)
  } finally { await browser.close(); await server.stop() }
  // 注入 (3):點 header 之後 aria-current 移走、舊內容留在原本那一步(「內容沒跟著目前那一步走」的回歸)—— 跑一次完整掃描,
  // 只掃有內容區的 story。這一種只有「點 header 讓有內容區的步驟條換步」時才會發作,所以它同時證明掃描真的走到了那條路
  //(預設精靈載入時沒有可點的 header,只靠第一輪抓不到;要靠按過「下一步」之後的第二輪)。
  const stale = await scanBuild(STATIC, { fresh: false, log: () => {}, inject: injectStaleContentOnHeaderClick, only: (s) => contentStories.includes(s.id) })
  if (stale !== null) {
    const hit = stale.violations.filter((v) => v.kind === 'content-not-current')
    check(stale.totals.headerContentMoves > 0 && hit.some((v) => /展示--default /.test(v.where)), `注入「點 header 後舊內容留在原步」:點 header 讓有內容區的步驟條換步 ${stale.totals.headerContentMoves} 次,抓到 ${hit.length} 筆 content-not-current(含預設精靈:${hit.some((v) => /展示--default /.test(v.where)) ? '是' : '否'})`)
  }
  // 對照組:退役前的建置(有的話)必須兩種毛病都紅
  if (CONTROL_STATIC) {
    const result = await scanBuild(CONTROL_STATIC, { fresh: false, log: () => {} })
    if (result === null) return ok
    const k = new Set(result.violations.map((v) => v.kind))
    check(k.has('aria-expanded') && k.has('content-not-current'), `對照組(退役前建置 ${path.basename(CONTROL_STATIC)}):${result.violations.length} 筆違規,含 aria-expanded 與 content-not-current(種類:${[...k].sort().join(' / ')})`)
    check(result.violations.some((v) => /展示--default /.test(v.where)), '對照組:不只多重展開模式那一則,預設精靈也被抓到')
  } else {
    console.log('  (沒有 --control-static:退役前建置的對照組略過;CI 沒有舊建置,靠判定表與注入兩面)')
  }
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (ARGS.includes('--selftest')) {
      const ok = await selftest()
      console.log(ok ? '✅ steps-content-follows-current selftest PASS' : '❌ steps-content-follows-current selftest FAIL')
      process.exit(ok ? 0 : 1)
    }
    const result = await scanBuild(STATIC)
    if (result === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED 判定
    const problems = instrumentProblems(result.totals)
    if (problems.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${problems.join(';')} —— 儀器失效,不當綠燈`); process.exit(1) }
    if (result.violations.length) {
      console.error(`❌ steps-content-follows-current FAIL(${result.violations.length} 筆):\n  ${result.violations.map((v) => v.text).join('\n  ')}`)
      process.exit(1)
    }
    const t = result.totals
    console.log(`✅ steps-content-follows-current PASS(${t.stories} 則 story、${t.lists} 條步驟條、點 ${t.clicks} 下、目前那一步移動 ${t.moves} 次,其中點 header 讓有內容區的步驟條換步 ${t.headerContentMoves} 次;內容區只跟著 aria-current="step",header 無 aria-expanded / aria-controls)`)
    // 不判紅、只列出:header 長得可點、點了目前那一步卻不動(受控 value 沒接 onValueChange)—— 待辦總帳 N75
    if (result.stillStories.length) console.log(`  ℹ 點了 header、目前那一步一次都沒移動的 story ${result.stillStories.length} 則(待辦總帳 N75,不在本閘判定範圍):${result.stillStories.join(', ')}`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${error.message}`); process.exit(1) }
    throw error
  }
}
