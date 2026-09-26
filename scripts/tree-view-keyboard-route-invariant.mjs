#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: TreeView(設計規格「工程團隊樹」)用真按鍵量時,整棵樹在 Tab 路上只佔一站、列上的按鈕只能用 → / ← 走到、
 *         從列或按鈕上 Tab 一下就離開整棵樹,鍵盤焦點在列上時該列的隱藏按鈕看得到(待辦總帳 B9 路線乙),淺色與深色各一輪
 *   紅: --selftest 注入舊路線的三個形狀(每列主格塞一顆可 Tab 的按鈕、document capture 吞掉 → / ←、動作格釘成 opacity 0),
 *       S1 / T1 / R1 / V1 在兩個主題都必須紅;少一條沒紅 → exit 1;story 開不起來或建置比原始碼舊 = exit 2(不算通過)
 *   綠: 沒弄壞時必須綠;story 經 openStory 等渲染完成 + 版面靜止才量,按鍵後等影格(rAF)再讀焦點,隱藏按鈕的透明度
 *       以 waitForFunction 等到過渡跑完才判(不量過渡中間值);Tab 次數是實按數出來的,不是從 DOM 結構推算
 *
 * 不變式:**TreeView 整棵樹在 Tab 路上只佔一站;列上的按鈕只能用 → / ← 走到;Tab 一下就離開整棵樹。**
 *
 * owner:`packages/design-system/src/components/TreeView/tree-view.spec.md`「鍵盤導覽」。
 * 決定來源:`governance/planning/2026-09-25-interaction-and-hover-remediation.md` B9
 * (user 原話「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」,附條件同意;條件已查證成立)。
 *
 * **為什麼要真瀏覽器實按**:判定表(scripts/test-tree-keyboard-route.mjs)只證明「這個按鍵該做什麼」,
 * 證明不了「DOM 上真的只剩一個 Tab 停靠點」「焦點真的交給了那顆按鈕」「隱藏的按鈕真的出現了」——
 * 改動前的量測(R15 `rf/tree-rerun.json`)是「工程團隊樹」從 Engineering 出發要按 **5** 下 Tab 才出得去,
 * 走過的全是 Alice、Bob 的按鈕;那個數字只有實按量得到。
 *
 * 量什麼(設計規格「狀態行為」的「工程團隊樹」:Engineering ▸ Frontend ▸ Alice / Bob,Alice、Bob 各 2 顆按鈕;
 * 淺色與深色各跑一輪,鍵盤一律用 Playwright 的真按鍵):
 *   S1 樹裡只有一個 tabIndex ≥ 0 的元素,而且是一列;所有動作格裡的按鈕都是 -1;容器不可聚焦
 *   S2 每顆列上按鈕都有可讀名稱
 *   T1 從樹前面按 Tab → 落在一列上;再按 **1** 下就到樹後面(改動前 = 5)
 *   T2 Shift+Tab 從列上 **1** 下就回到樹前面
 *   R1 ↓↓ 到 Alice;→ 進「重新命名」;→「刪除」;→ 不動;← 回「重新命名」;← 回到 Alice 這一列
 *   R2 焦點在 Alice 的按鈕上按 Tab → **1** 下就離開整棵樹;Shift+Tab 回到 Alice 這一列
 *   R3 焦點在 Alice 的按鈕上按 Shift+Tab → **1** 下就回到樹前面(X7,2026-09-26 前要 2 下:先落回本列)
 *   R4 按鈕上 Home → 第一列、End → 最後一列(X4,2026-09-26 前樹不處理;與側欄 / 檔案清單同一份判定 lib/roving-list-keyboard.ts)
 *   V1 焦點(鍵盤)在 Alice 列上 → Alice 的動作格看得到(opacity 1);沒被滑過、焦點不在的 Bob 看不到(opacity 0)
 *   V2 鍵盤焦點在列上 → 列畫出往內的框(outline 實線、offset < 0)
 *   V3 滑鼠點 Bob 這一列 → 焦點在 Bob、**不畫框**(:focus-visible 不成立);之後 Tab 一下就離開
 *   L1 ← 在葉節點 Alice → 回到 Frontend;← 在展開的 Frontend → 收合(aria-expanded=false);→ 再展開、焦點留在 Frontend
 *
 * 對照組 `--selftest`:注入舊路線的三個形狀 —— 在每一列的主格裡塞一顆可 Tab 的按鈕(= 別列的按鈕在 Tab 路上)、
 * 在 document 捕獲階段吞掉 → / ←(= 方向鍵進不了按鈕)、把動作格釘成 opacity 0(= 焦點在列裡時按鈕仍隱藏)。
 * S1 / T1 / R1 / V1 必須都紅;少一條沒紅 = 那條量具沒在量它宣稱的東西 → exit 1。
 *
 * story 開不起來 = 儀器失效(exit 2,點名 story、列同源 404),不是產品裁決,selftest 也不算「對照組抓到了」。
 *
 * Run: `node scripts/tree-view-keyboard-route-invariant.mjs`(讀 `<cwd>/storybook-static`;`--selftest` 跑對照組)
 */
import { existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const STORY = 'design-system-components-treeview-設計規格--state-behavior'
const TREE = '[role="treegrid"][aria-label="工程團隊樹"]'

requireStorybookBuild(join(BUILD, 'index.json'))
// stale-build 守衛:建置比被驗的原始碼舊 = 驗到舊的 JS(假綠 / 假紅都有可能)
const buildMtime = statSync(join(BUILD, 'index.json')).mtimeMs
// 判定住在 lib/roving-list-keyboard.ts(2026-09-26 由 TreeView/tree-keyboard-route.ts 併入四宿主共用零件)
for (const f of ['packages/design-system/src/components/TreeView/tree-view.tsx', 'packages/design-system/src/lib/roving-list-keyboard.ts']) {
  const p = join(ROOT, f)
  if (existsSync(p) && statSync(p).mtimeMs > buildMtime) {
    console.error(`✗ STALE-BUILD:${f} 比 ${BUILD} 新 —— 先重新 build storybook`)
    process.exit(2)
  }
}

// 對照組:舊路線的三個形狀(見檔頭)。addInitScript 會在每次導覽重新套用;
// 主格裡的按鈕不在 TreeItem 的 MutationObserver 範圍(它只管動作格),所以不會被元件改回 -1。
const BREAK_BACK_TO_OLD_ROUTE = () => {
  const apply = () => {
    // init script 在新文件剛建立時就跑,那一刻連 <html> 都還沒有:先不掛,等下面的 MutationObserver 在文件長出來後再呼叫
    //(直接 appendChild 到 null 會丟頁面例外,openStory 的 render-health 把它當成儀器失效 —— 對照組就從來沒量到東西)
    const host = document.head || document.documentElement
    if (!host) return
    if (!document.getElementById('__selftest_tree_route')) {
      const style = document.createElement('style')
      style.id = '__selftest_tree_route'
      style.textContent = '[data-tree-actions]{opacity:0 !important;transition:none !important}'
      host.appendChild(style)
    }
    for (const row of document.querySelectorAll('[data-tree-row]')) {
      const cell = row.querySelector('[role="gridcell"]')
      if (cell && !cell.querySelector('[data-selftest-tab-stop]')) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = '舊路線的按鈕'
        b.setAttribute('data-selftest-tab-stop', '')
        cell.appendChild(b)
      }
    }
  }
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target?.closest?.('[data-tree-row]')) e.stopImmediatePropagation()
  }, true)
  new MutationObserver(apply).observe(document, { childList: true, subtree: true })
  apply()
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
if (SELFTEST) await page.addInitScript(BREAK_BACK_TO_OLD_ROUTE)

let instrumentFailure = null
const results = []
const ck = (名, 通過, 細節 = '') => { results.push({ 名, 通過, 細節 }) }

// 焦點在哪:回傳 'before' / 'after' / 'row:<id>' / 'action:<id>:<aria-label>' / 其他
const where = () => page.evaluate((treeSel) => {
  const a = document.activeElement
  if (!a || a === document.body) return 'body'
  if (a.id === '__tv_before') return 'before'
  if (a.id === '__tv_after') return 'after'
  const tree = document.querySelector(treeSel)
  if (!tree || !tree.contains(a)) return `outside:${a.tagName}`
  const row = a.closest('[data-tree-row]')
  if (a === row) return `row:${row.dataset.treeRow}`
  if (row && a.closest('[data-tree-actions]')) return `action:${row.dataset.treeRow}:${a.getAttribute('aria-label')}`
  return `inside:${a.tagName}:${a.textContent?.trim().slice(0, 12)}`
}, TREE)
const press = async (key, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(key) }
// 焦點移到某處後,等被量的樣式穩定(opacity 有 150ms 過渡;量過渡中間值 = 假紅,見 AGENTS.md 失敗記憶「量 focus 顏色不等 transition」)
const settled = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const cellOpacity = (id) => page.evaluate(({ treeSel, id }) => {
  const cell = document.querySelector(treeSel)?.querySelector(`[data-tree-row="${id}"] > [data-tree-actions]`)
  return cell ? Number(getComputedStyle(cell).opacity) : null
}, { treeSel: TREE, id })
const waitOpacity = async (id, target) => {
  const ok = await page.waitForFunction(({ treeSel, id, target }) => {
    const cell = document.querySelector(treeSel)?.querySelector(`[data-tree-row="${id}"] > [data-tree-actions]`)
    return !!cell && Math.abs(Number(getComputedStyle(cell).opacity) - target) < 0.01 && cell.getAnimations().length === 0
  }, { treeSel: TREE, id, target }, { timeout: 2_000, polling: 'raf' }).then(() => true, () => false)
  return { ok, value: await cellOpacity(id) }
}
const ring = () => page.evaluate(() => {
  const a = document.activeElement
  if (!a) return null
  const c = getComputedStyle(a)
  return { fv: a.matches(':focus-visible'), style: c.outlineStyle, width: parseFloat(c.outlineWidth), offset: parseFloat(c.outlineOffset) }
})

const runTheme = async (theme) => {
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&globals=theme:${theme}`
  await openStory(page, url, { waitFor: `${TREE} [data-tree-row="bob"]`, settleFrames: 10, notFound: server.notFound })
  const tag = `[${theme}]`
  // 樹前後各插一顆哨兵,「離開了」在兩個方向都量得到(同 R15 tree-leave-probe)
  await page.evaluate((treeSel) => {
    const tree = document.querySelector(treeSel)
    for (const [id, where] of [['__tv_before', 'beforebegin'], ['__tv_after', 'afterend']]) {
      if (document.getElementById(id)) continue
      const b = document.createElement('button')
      b.id = id; b.type = 'button'; b.textContent = id
      tree.insertAdjacentElement(where, b)
    }
  }, TREE)
  await page.mouse.move(0, 0)

  // S1 / S2 靜態
  const s = await page.evaluate((treeSel) => {
    const tree = document.querySelector(treeSel)
    const stops = [...tree.querySelectorAll('*')].filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'))
    const actions = [...tree.querySelectorAll('[data-tree-actions] button, [data-tree-actions] a[href], [data-tree-actions] [tabindex]')]
    return {
      containerTab: tree.getAttribute('tabindex'),
      stops: stops.map((el) => el.matches('[data-tree-row]') ? `row:${el.dataset.treeRow}` : `${el.tagName}:${el.textContent?.trim().slice(0, 10)}`),
      actions: actions.length,
      actionTabbable: actions.filter((el) => el.tabIndex >= 0).length,
      unnamed: actions.filter((el) => !(el.getAttribute('aria-label')?.trim() || el.textContent?.trim())).length,
    }
  }, TREE)
  ck(`S1${tag} 樹裡只有一個 Tab 停靠點,而且是一列;動作格按鈕全是 -1;容器不可聚焦`,
    s.stops.length === 1 && s.stops[0].startsWith('row:') && s.actions === 4 && s.actionTabbable === 0 && s.containerTab == null,
    `停靠點 ${JSON.stringify(s.stops)} / 按鈕 ${s.actions} 顆,可 Tab ${s.actionTabbable} / 容器 tabindex=${s.containerTab}`)
  ck(`S2${tag} 每顆列上按鈕都有可讀名稱`, s.actions > 0 && s.unnamed === 0, `${s.unnamed} 顆沒有名稱`)

  // T1 / T2 Tab 進出
  await page.focus('#__tv_before')
  await press('Tab')
  const landed = await where()
  let presses = 0
  const path = [landed]
  while (presses < 12) {
    await press('Tab'); presses++
    const w = await where(); path.push(w)
    if (!w.startsWith('row:') && !w.startsWith('action:') && !w.startsWith('inside:')) break
  }
  ck(`T1${tag} Tab 進樹落在一列,再按 1 下就離開整棵樹(改動前 = 5)`, landed === 'row:eng' && presses === 1 && path.at(-1) === 'after', path.join(' → '))
  await press('Shift+Tab')
  const back = await where()
  await press('Shift+Tab')
  const out = await where()
  ck(`T2${tag} Shift+Tab 回到列,再 1 下就回到樹前面`, back === 'row:eng' && out === 'before', `${back} → ${out}`)

  // R1 方向鍵路線 + V1 / V2
  await press('Tab') // 回到停靠點(Engineering)
  await press('ArrowDown', 2)
  const onAlice = await where()
  await settled()
  const aliceRing = await ring()
  const aliceShown = await waitOpacity('alice', 1)
  const bobHidden = await waitOpacity('bob', 0)
  const seq = []
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) { await press(k); seq.push(await where()) }
  ck(`R1${tag} ↓↓ 到 Alice;→ 重新命名 → 刪除 → 不動;← 重新命名 ← 回到列`,
    onAlice === 'row:alice' && JSON.stringify(seq) === JSON.stringify(['action:alice:重新命名', 'action:alice:刪除', 'action:alice:刪除', 'action:alice:重新命名', 'row:alice']),
    [onAlice, ...seq].join(' → '))
  ck(`V1${tag} 鍵盤焦點在 Alice 列 → Alice 的按鈕看得到、Bob 的看不到`, aliceShown.ok && bobHidden.ok, `Alice opacity=${aliceShown.value} / Bob opacity=${bobHidden.value}`)
  ck(`V2${tag} 鍵盤焦點在列上 → 列畫往內的框`, !!aliceRing && aliceRing.fv && aliceRing.style !== 'none' && aliceRing.width > 0 && aliceRing.offset < 0,
    JSON.stringify(aliceRing))

  // R2 從按鈕上 Tab 一下就離開;Shift+Tab 回到那一列
  await press('ArrowRight')
  const onButton = await where()
  await press('Tab')
  const left = await where()
  await press('Shift+Tab')
  const returned = await where()
  ck(`R2${tag} 在按鈕上 Tab 1 下離開整棵樹,Shift+Tab 回到那一列`, onButton === 'action:alice:重新命名' && left === 'after' && returned === 'row:alice',
    `${onButton} → Tab → ${left} → Shift+Tab → ${returned}`)

  // R3 從按鈕上 Shift+Tab 也是 1 下就離開(X7:2026-09-26 前要兩下 —— 先落回本列;統一成側欄做法)
  await press('ArrowRight', 2)
  const onDelete = await where()
  await press('Shift+Tab')
  const leftBack = await where()
  ck(`R3${tag} 在按鈕上 Shift+Tab 1 下就回到樹前面(X7)`, onDelete === 'action:alice:刪除' && leftBack === 'before',
    `${onDelete} → Shift+Tab → ${leftBack}`)

  // R4 按鈕上 Home / End = 換到第一 / 最後一列(X4:2026-09-26 前樹不處理;統一成側欄做法)
  await press('Tab') // 回到停靠點(Alice)
  await press('ArrowRight')
  const onRename = await where()
  await press('Home')
  const home = await where()
  await press('ArrowDown', 2)
  await press('ArrowRight')
  await press('End')
  const end = await where()
  ck(`R4${tag} 按鈕上 Home → 第一列、End → 最後一列(X4)`, onRename === 'action:alice:重新命名' && home === 'row:eng' && end === 'row:bob',
    `${onRename} → Home → ${home};Alice 的按鈕 → End → ${end}`)
  // 焦點放回 Alice,後面 L1 從這裡起算(與改動前相同的起點)
  await press('ArrowUp')

  // L1 ← 的樹語意
  await press('ArrowLeft')
  const toParent = await where()
  await press('ArrowLeft')
  const collapsed = await page.evaluate((treeSel) => document.querySelector(treeSel)?.querySelector('[data-tree-row="frontend"]')?.getAttribute('aria-expanded'), TREE)
  await press('ArrowRight')
  const expanded = await page.evaluate((treeSel) => document.querySelector(treeSel)?.querySelector('[data-tree-row="frontend"]')?.getAttribute('aria-expanded'), TREE)
  const stay = await where()
  ck(`L1${tag} ← 葉節點回上一層;← 展開的資料夾收合;→ 再展開、焦點不動`,
    toParent === 'row:frontend' && collapsed === 'false' && expanded === 'true' && stay === 'row:frontend',
    `${toParent} / 收合後 aria-expanded=${collapsed} / 展開後=${expanded} / 焦點 ${stay}`)

  // V3 滑鼠點列:焦點給列、不畫框;之後 Tab 一下離開
  // 點之前先等「那一點真的點得到 Bob 那一列」,不是只等元素 visible(M32「量測值受動畫影響 → 等穩態再量」):
  // L1 剛用 → 把 Frontend 重新展開,展開動畫期間子列的版面盒已在最終位置、畫面卻還被裁掉,elementFromPoint 落在
  // <html> / 容器上 —— 這時點下去是點到空白,焦點掉到 body,被讀成「點列不給焦點」= 指控不存在的產品問題
  //(2026-09-26 實測:→ 之後約 100ms 內命中 html / 容器,之後命中 Bob;閘原本點在那 100ms 裡,淺深兩輪都假紅)。
  // 等不到(3 秒內那一點一直不屬於 Bob,或樹裡還有動畫在跑)= 儀器失效,不是產品裁決。
  const bobPoint = await page.waitForFunction((treeSel) => {
    const tree = document.querySelector(treeSel)
    const cell = tree?.querySelector('[data-tree-row="bob"] [role="gridcell"]')
    if (!cell) return null
    if (tree.getAnimations({ subtree: true }).some((a) => a.playState === 'running')) return null
    const r = cell.getBoundingClientRect()
    const x = r.x + 40
    const y = r.y + r.height / 2
    return document.elementFromPoint(x, y)?.closest('[data-tree-row]')?.getAttribute('data-tree-row') === 'bob' ? { x, y } : null
  }, TREE, { timeout: 3_000, polling: 'raf' }).then((handle) => handle.jsonValue(), () => null)
  if (!bobPoint) {
    throw new StoryRenderInstrumentError({ storyId: STORY, kind: 'dom-not-settled',
      reason: `${tag} V3:3 秒內 Bob 那一列的點擊點一直不屬於 Bob(展開動畫沒停或被別的東西蓋住),點下去量到的不是「點列」` })
  }
  await page.mouse.click(bobPoint.x, bobPoint.y)
  await settled()
  const clicked = await where()
  const clickRing = await ring()
  await page.mouse.move(0, 0)
  await press('Tab')
  const afterClick = await where()
  ck(`V3${tag} 滑鼠點 Bob → 焦點在 Bob、不畫框;Tab 1 下離開`,
    clicked === 'row:bob' && !!clickRing && !clickRing.fv && (clickRing.style === 'none' || clickRing.width === 0) && afterClick === 'after',
    `${clicked} ${JSON.stringify(clickRing)} → Tab → ${afterClick}`)
}

try {
  await runTheme('light')
  await runTheme('dark')
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  instrumentFailure = error
} finally {
  await page.close().catch(() => null)
  await browser.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

for (const r of results) console.log(`${r.通過 ? '✓' : '✗'} ${r.名}${r.細節 ? ' | ' + r.細節 : ''}`)
if (instrumentFailure) {
  console.error(`\n✗ ${instrumentFailure.message}`)
  console.error(`✗ TreeView 鍵盤路線${SELFTEST ? '(selftest)' : ''}:儀器失效 —— 這次沒有量完(exit 2,不是產品裁決,也不算通過)`)
  process.exit(2)
}
const 失敗 = results.filter((r) => !r.通過)

if (SELFTEST) {
  // 對照組要紅在對的地方:S1(多出停靠點)、T1(Tab 出不去)、R1(方向鍵進不了按鈕)、V1(按鈕仍隱藏),兩個主題都要
  const mustFail = ['S1', 'T1', 'R1', 'V1']
  const missed = []
  for (const theme of ['light', 'dark']) {
    for (const id of mustFail) {
      const r = results.find((x) => x.名.startsWith(`${id}[${theme}]`))
      if (!r || r.通過) missed.push(`${id}[${theme}]`)
    }
  }
  if (missed.length === 0) { console.log(`\n✓ selftest:舊路線的三個形狀讓 ${mustFail.length * 2} 條該紅的全紅了,量具會紅`); process.exit(0) }
  console.log(`\n✗ selftest:${missed.join(', ')} 沒有紅 —— 那幾條量具沒在量它宣稱的東西,綠燈不能當證據`)
  process.exit(1)
}
if (失敗.length > 0) { console.log(`\n✗ ${失敗.length} 條不符`); process.exit(1) }
console.log('\n✓ TreeView 鍵盤路線:整棵樹一個 Tab 停靠點、→ / ← 走列上的按鈕、Tab 一下離開(淺色 / 深色)')
process.exit(0)
