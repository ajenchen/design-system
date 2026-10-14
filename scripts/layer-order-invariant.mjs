#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 全 DS 只有一張疊放順序表(tokens/elevation/elevation.spec.md「疊放順序」),而且程式與它一致、真的照它疊:
 *        S(靜態)packages/design-system/src 每一處 z 值都登記在表上(值 + 成員檔)—— `z-*` utility、`zIndex` 物件鍵 / 簡寫 / JSX 屬性、
 *          `style.zIndex =`、`setProperty('z-index', …)`、字串與樣板裡的 CSS `z-index:`、沒寫 `zIndex` 的 `<DragOverlay>`(= 從已安裝的
 *          @dnd-kit/core 讀到的預設值);表上每個成員、每個值都還有人在用(不過期);全域列逐列遞增、每列一個值;局部列的數字 ≤ 20 且低於
 *          最低的全域列,局部列的非數字值只能是 CONTAINED_LOCAL 裡的(D 量過的變數,或已知有界的運算式);拖曳影像 > Tooltip > Toast > 第 3–6 列
 *         (表上的值;拖曳影像就地渲染、只在頁面層跟整頁比,條件寫在表的第 9 列)。
 *        R(真建置)A 入口鈕的提示「問我或推走我」與 Toast 重疊時整塊看得到(提示內多點 elementFromPoint 全命中提示);
 *          B Dialog 裡的提示「關閉」疊在 Toast 上;C Toast 蓋在一般 Dialog 的遮罩與本體(z-50)、代理蓋板(z-[45])之上;
 *          D 每一顆用變數疊放的頭像 / Tag(值 = 項目數 + 1,沒有上限),所在那一列(最近的有盒子的祖先)自成疊放脈絡 ——
 *            Combobox 四模式(編輯 / 檢視 / 唯讀 / 停用)、Combobox 在 DataTable 裡、DataTable「專案排程全功能整合」、AgentPanel 附件列、
 *            PeoplePicker 頭像堆疊(寬度貼合內容 × 多人);CONTAINED_LOCAL 標 D 的每個變數都必須真的量到過;
 *          E 並存 modal 的本體(Dialog、FileViewer 傳 persistentElements)z-index = 40,一般 FileViewer = 50。
 *   紅: 任一條不符 → exit 1。`--selftest` 每個對照組都必須紅在它該紅的地方,少一個 = 量具沒在量它宣稱的東西 → exit 1:
 *       S:在原始碼注入未登記的值 / 在未登記的檔用已登記的值 / 拿掉一個成員 / 把 Toast 的值改到 Tooltip 之上 / 局部列塞 35 / 程式不再用某個登記值 /
 *         拖曳影像壓到 Tooltip 之下;同一個未登記值換六種非 utility 寫法注入(JSX 屬性、setProperty、cssText、樣板 CSS、簡寫、style['z-index'])、
 *         未登記的檔放一個沒寫 zIndex 的 <DragOverlay>,掃描器每一種都必須看得到;反向:`{ zIndex: '70' }` 必須正規化成已登記的 70;
 *         局部列塞一個沒量過的變數 `var(--chip-stack-z)`(S4);
 *       R:把 Toast 清單釘回 sonner 內建的 999999999(A、B 必紅)、壓到 44(C 必紅);在頁面上拿掉每一列的 isolation(D 每一則都必紅);
 *         把並存本體改成 50、一般本體改成 40(E 每一則都必紅)。
 *       story 開不起來、30 秒內等不到該步的元素 / 版面不靜止、提示與 Toast 根本沒重疊 = 儀器失效(INSTRUMENT-FAIL,不是產品裁決,也不算通過);
 *       訊息點名是哪一步(A1…、B1…、C1.1…、C2.1…)、那一步等了多久,並附上那一刻的 Dialog / Toast / 浮層 / 焦點 / 代理面板狀態。
 *   綠: 沒改壞時全部綠;每一步都等**元素本身**(Toast 出現、提示出現、Dialog 卸載、面板換成蓋板、sonner 的暫停旗標),再等版面連續
 *       10 個影格靜止才量,不用固定睡眠當「已出現」的代理;30 秒只是天花板。量測期間 Toast 用 sonner 自己的暫停條件留住
 *      (holdToast),不靠「機器夠快、4 秒內量完」。
 *
 * 由來:Toast 與 Tooltip 原本不在任何層級規則裡,sonner 內建 `z-index: 999999999` 蓋過一切,提示也不例外 —— 回報時(10-13,Toast 當時疊在
 * 入口鈕上方,那個落點同日撤回)入口鈕的提示被蓋住 69%;Toast 回到視窗預設角落(c6c192a1)之後,三則 Toast 疊起來時同一個提示仍被蓋住 23%(69/297 點)。
 * AI 2026-10-13 建議「所有提示都蓋在 Toast 上面,並把 Toast 和提示補進 DS 的層級表」,user 同日採納(原話:「確保符合世界級的設計
 * 且符合我們一致的設計語言與規範就照你建議做並自行驗證到完美無瑕」)。
 *
 * 命中測試的量法:問的是「誰畫在上面」。modal Dialog 開著時 Radix 把 body 設成 pointer-events:none,Toast 跟著不吃指標 ——
 * elementFromPoint 會穿過它,量不到疊放順序。所以**量的那一刻**注入只改 pointer-events 的樣式(不碰 z-index / 位置),量完立刻拿掉。
 * A、B 與 C1 的第二次量測把 Toast 清單以 CSS `translate` 平移到要比的東西上(只動位置、不動 z-index;平移後重讀 z-index 確認沒變),
 * 讓「重疊」成為確定的前提,而不是看版面運氣(單則 Toast 在視窗預設角落時,入口鈕的提示剛好在它上緣之上 12px,不重疊)。
 * A 的提示用鍵盤聚焦打開:Toast 依 toast.spec.md「落點」甲不避讓,疊在入口鈕上(入口鈕的盒子 90% 在 Toast 底下),指標點不到;
 * Tab 到入口鈕是同一個 focus 事件,Radix Tooltip 聚焦即開。
 * C2 的示意把宿主畫在帶 transform 的「模擬瀏覽器畫布」裡(自成疊放脈絡 → 面板的 z-[45] 只在畫布裡比),量之前拿掉那個 transform、
 * 並確認面板到根之間再沒有疊放脈絡 —— 才是產品裡面板直接拿 z-[45] 跟整頁比的組合(agent-panel.tsx 蓋板註解)。
 * 改動前實測:e8fb3635(Toast 疊在入口鈕上方的舊落點)A 提示本體 98/330 點看得到、重疊區 0/196,B 0/294;c6c192a1(視窗預設角落)
 * 用本版量法 A 0/330、B 0/294;兩者 C 都綠(順序沿用)。
 * Toast 留住的必要(2026-10-14 實測):本機閒置時從 Toast 出現到最後一次量測 A 約 1.1 秒、B + C1 約 2.1 秒、C2 約 0.7 秒;同一台機器滿載
 *(load 20–32,同時跑其他瀏覽器閘)時 B + C1 7.8 秒、C2 6.7 秒 —— 都超過 Toast 自己關掉的 4 秒,不留住就是「找不到 Toast」。
 * 對照:在 B15 之後故意多等 2.5 秒,不留住 → 「[B18 命中測試] 找不到 Toast」(儀器失效),留住 → 全綠(Toast 出現到量完 4.6 秒)。
 * 2026-10-14 複驗時那一次「情境 B 沒量到:page.waitForFunction: Timeout 10000ms exceeded.」(33 次裡 1 次)沒能重現:同一流程本機 105 次
 *(含三個行程並行)全綠、每一步最慢 0.6 秒;整支閘改 CPU 降速 6 倍,整趟時間也不變(M32 (g):headless 的影格釘在 16.7ms);不是 Toast 自己關掉
 *(那會是「找不到 Toast」,不是 waitForFunction 逾時)。現在每一步有名字並印頁面狀態,下次出現就知道是哪一個等待、卡在什麼狀態。
 *
 * D 的由來(2026-10-14 複驗):表上第 1 列寫「Tag 堆疊外層那一列 isolate」、「局部值一律 ≤ 20,漏到整頁也蓋不過浮層」,但 S4 只檢查數字、
 * `var()` 的值整個跳過 —— 實際上只有 Combobox 編輯態那一列 isolate,AgentPanel 附件列、Combobox 檢視 / 唯讀列沒有,DataTable「專案排程
 * 全功能整合」53 顆標籤直接在頁面那一層比(值最大 = 項目數 + 1,沒有上限)。修法 = 四個 Tag 列容器收成 TAG_ROW_CONTAINER_CLASS;本段把
 * 「圈住」從散文變成量測。E 的由來:FileViewer 並存時本體仍是 z-50(層級表記為已知不一致)→ 對齊 z-40,量 computed z-index。
 *
 * 用法:node scripts/layer-order-invariant.mjs [--static=<dir>] [--static-only] [--selftest] [--cpu-throttle=N]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DS_SRC = path.join(REPO, 'packages/design-system/src')
const SPEC = 'packages/design-system/src/tokens/elevation/elevation.spec.md'
const ts = createRequire(path.join(REPO, 'package.json'))('typescript')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const STATIC_ONLY = process.argv.includes('--static-only')

let failed = 0
const instrumentFails = []
const redBy = {}
let current = ''
const rec = (ok, msg, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${current} ${msg}${detail ? ` | ${detail}` : ''}`)
  if (!ok) { failed++; redBy[current] = (redBy[current] ?? 0) + 1 }
}

// ── 掃描:一個檔案裡的每一處 z 值 ─────────────────────────────────────────────
// Tailwind:`z-10` / `z-[45]` / `-z-1` / `z-auto` / `z-[var(--x)]`,前面可以有任意變體(`hover:` `[&>*]:` `has-[…]:`)與 `!`。
const Z_UTIL = /(?<![A-Za-z0-9_-])(-?)z-(\d+|auto|\[[^\]\s]+\])(?![A-Za-z0-9_[-])/g
/** 正規化:`z-3` / `z-[3]` / `zIndex: 3` / `z-index: 3` 都是 3;`z-[var(--x)]` → `var(--x)`;其他運算式照原文 */
function normaliseUtil(sign, body) {
  if (body === 'auto') return 'auto'
  if (body.startsWith('[')) {
    const inner = body.slice(1, -1)
    return /^-?\d+$/.test(inner) ? String(Number(`${sign}${inner}`)) : inner
  }
  return String(Number(`${sign}${body}`))
}
function normaliseToken(token) {
  const util = [...token.matchAll(Z_UTIL)]
  if (util.length === 1 && util[0][0] === token.replace(/^!|!$/g, '')) return normaliseUtil(util[0][1], util[0][2])
  // `'999'` / `"999"` / `` `999` ``(`Object.assign(el.style, { zIndex: '999' })`、`setProperty('z-index', '999')`)與 999 同值
  const bare = token.replace(/^(['"`])(-?\d+)\1$/, '$2')
  if (/^-?\d+$/.test(bare)) return String(Number(bare))
  return token
}
/**
 * dnd-kit `<DragOverlay>` 沒寫 `zIndex` 時用的值 —— 直接從已安裝的 `@dnd-kit/core` 讀(`zIndex = 999` 預設參數),不寫死:
 * 套件升級改了預設,登記的值跟著被量,不會因為閘自己記錯而綠。讀不到 = 儀器失效,不是「沒有預設」。
 */
export function readDndKitDefaultZ(repo = REPO) {
  try {
    const src = fs.readFileSync(createRequire(path.join(repo, 'package.json')).resolve('@dnd-kit/core').replace(/[^/\\]+$/, 'core.esm.js'), 'utf8')
    const body = src.slice(src.indexOf('const DragOverlay'))
    const m = body.slice(0, 600).match(/zIndex\s*=\s*(\d+)/)
    return m ? m[1] : null
  } catch { return null }
}
const DND_DEFAULT_Z = readDndKitDefaultZ()
/**
 * 只看「會變成樣式的地方」(註解裡的 z 不算 —— 那是理由,不是樣式):
 * - 字串 / 樣板字串 / JSX 文字裡的 utility(JSX 文字照算:anatomy story 寫給人看的「z-50」也必須跟程式同一個值);
 * - 字串 / 樣板字串裡的 CSS `z-index:`(`cssText`、`setAttribute('style', …)`、注入的 `<style>`、`[z-index:5]` 任意屬性);
 *   樣板在 `z-index:` 後面接 `${…}` → 記那個運算式;
 * - 物件的 `zIndex:` 與簡寫 `{ zIndex }`、JSX 屬性 `zIndex={…}`(`<DragOverlay zIndex={999}>`);
 * - `*.style.zIndex =` / `*.style['zIndex' | 'z-index'] =`(指派空字串 = 清除,不算層級)、`*.setProperty('z-index', v)`;
 * - 沒寫 `zIndex` 的 `<DragOverlay>` = dnd-kit 預設值(`readDndKitDefaultZ`)。
 * CSS 檔的 `z-index:`(先去註解)。
 */
const CSS_Z = /z-index\s*:\s*([^;}\s'"`\]]+)/g
export function scanSource(rel, text, { dndDefault = DND_DEFAULT_Z } = {}) {
  const out = []
  const push = (value, line, raw) => out.push({ file: rel, line, value, raw })
  if (rel.endsWith('.css')) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    clean.split('\n').forEach((l, i) => { for (const m of l.matchAll(CSS_Z)) push(normaliseToken(m[1]), i + 1, m[0]) })
    return out
  }
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const scanText = (t, line) => { for (const m of t.matchAll(Z_UTIL)) push(normaliseUtil(m[1], m[2]), line, m[0]) }
  const scanCss = (t, line) => { for (const m of t.matchAll(CSS_Z)) push(normaliseToken(m[1]), line, m[0]) }
  const isEmptyLiteral = (v) => /^(''|""|``)$/.test(v)
  const tagName = (n) => (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n) ? n.tagName.getText(sf) : null)
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) scanText(n.text, lineOf(n))
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) scanCss(n.text, lineOf(n))
    // 樣板 `…z-index:${z}…`:值在下一個 span 的運算式
    if (ts.isTemplateExpression(n)) {
      const parts = [n.head, ...n.templateSpans.map((s) => s.literal)]
      n.templateSpans.forEach((s, i) => { if (/z-index\s*:\s*$/.test(parts[i].text)) push(normaliseToken(s.expression.getText(sf)), lineOf(s), `z-index:\${${s.expression.getText(sf)}}`) })
    }
    if (ts.isPropertyAssignment(n) && /^['"]?zIndex['"]?$/.test(n.name.getText(sf))) push(normaliseToken(n.initializer.getText(sf)), lineOf(n), n.getText(sf))
    if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'zIndex') push('zIndex', lineOf(n), `{ ${n.getText(sf)} }`)
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'zIndex' && n.initializer) {
      const init = n.initializer
      const v = ts.isJsxExpression(init) ? init.expression?.getText(sf) ?? '' : init.getText(sf)
      push(normaliseToken(v), lineOf(n), n.getText(sf))
    }
    if (tagName(n) === 'DragOverlay' && !n.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'zIndex')) {
      push(dndDefault ?? 'DND-DEFAULT-UNREADABLE', lineOf(n), `<DragOverlay>(沒寫 zIndex = dnd-kit 預設 ${dndDefault ?? '讀不到'})`)
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const l = n.left
      const isZ = (ts.isPropertyAccessExpression(l) && l.name.text === 'zIndex') ||
        (ts.isElementAccessExpression(l) && ts.isStringLiteralLike(l.argumentExpression) && /^(zIndex|z-index)$/.test(l.argumentExpression.text))
      const v = n.right.getText(sf)
      if (isZ && !isEmptyLiteral(v)) push(normaliseToken(v), lineOf(n), n.getText(sf))
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'setProperty' &&
      n.arguments.length >= 2 && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text === 'z-index') {
      const v = n.arguments[1].getText(sf)
      if (!isEmptyLiteral(v)) push(normaliseToken(v), lineOf(n), n.getText(sf))
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
function scanAll(overrides = {}) {
  const files = new Map(walk(DS_SRC).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => [path.relative(DS_SRC, f).split(path.sep).join('/'), null]))
  for (const rel of Object.keys(overrides)) files.set(rel, null)
  const uses = []
  for (const rel of files.keys()) {
    const text = rel in overrides ? overrides[rel] : fs.readFileSync(path.join(DS_SRC, rel), 'utf8')
    if (text == null) continue
    uses.push(...scanSource(rel, text))
  }
  return { uses, files: new Set([...files.keys()].filter((rel) => !(rel in overrides) || overrides[rel] != null)) }
}

// ── 表:elevation.spec.md「疊放順序」────────────────────────────────────────
const backticked = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1])
export function parseTable(specText) {
  const start = specText.indexOf('## 疊放順序')
  if (start < 0) return null
  const end = specText.indexOf('\n## ', start + 1)
  const body = specText.slice(start, end < 0 ? undefined : end)
  const rows = []
  for (const line of body.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length !== 6 || !/^\d+$/.test(cells[0])) continue
    rows.push({
      order: Number(cells[0]), scope: cells[1], name: cells[2],
      values: backticked(cells[3]).map(normaliseToken),
      members: backticked(cells[4]),
    })
  }
  return rows
}
const covers = (member, file) => (member.endsWith('/') ? file.startsWith(member) : file === member)
/**
 * 局部列裡**不是數字**的值:沒有上限(變數)或要讀程式才知道(運算式)。每一個都必須在這裡說得出為什麼不會漏到整頁蓋過浮層 ——
 * 'D' = 變數值,由那一列自成疊放脈絡圈住,閘 D 在真建置逐項量(`[style*="--x"]` 的每一項,最近的有盒子的祖先必須自成疊放脈絡);
 * 其他字串 = 已知有界的運算式與它的界。新增變數值先加進來(並讓 D 量得到),否則 S4 紅。
 */
export const CONTAINED_LOCAL = {
  'var(--avatar-stack-z)': 'D',
  'var(--avatar-stack-z-focus)': 'D',
  'var(--tag-stack-z)': 'D',
  'var(--tag-stack-z-focus)': 'D',
  'ring.zIndex': '有界:components/DataTable/data-table-interaction-layer.tsx `CellRingStyle` 表只有 1 / 2(數字本身也登記在第 1 列)',
}
/** D 量的變數名(`var(--x)` → `--x`) */
const D_VARS = Object.entries(CONTAINED_LOCAL).filter(([, how]) => how === 'D').map(([v]) => v.slice(4, -1))
const isNumber = (v) => /^-?\d+$/.test(v)

/** 每一條檢查都有 id,selftest 用 id 斷言「紅在該紅的地方」 */
export function checkRegistry(rows, { uses, files }) {
  const fails = []
  const fail = (id, msg) => fails.push({ id, msg })
  if (!rows || rows.length === 0) { fail('S0', `找不到 ${SPEC}「疊放順序」表(或表是空的)`); return fails }
  // S1 每一處都登記
  for (const u of uses) {
    if (!rows.some((r) => r.values.includes(u.value) && r.members.some((m) => covers(m, u.file)))) {
      fail('S1', `未登記:${u.file}:${u.line} \`${u.raw}\`(值 ${u.value})—— 先在層級表找同用途的列登記,沒有就先加列`)
    }
  }
  // S2 不過期:成員存在且用到該列的值;每個值都有成員在用
  for (const r of rows) {
    for (const m of r.members) {
      const exists = m.endsWith('/') ? [...files].some((f) => f.startsWith(m)) : files.has(m)
      if (!exists) { fail('S2', `第 ${r.order} 列成員 \`${m}\` 不存在`); continue }
      if (!uses.some((u) => covers(m, u.file) && r.values.includes(u.value))) fail('S2', `第 ${r.order} 列成員 \`${m}\` 沒有用到這一列的任何值(${r.values.join(' ')})—— 過期`)
    }
    for (const v of r.values) {
      if (!uses.some((u) => u.value === v && r.members.some((m) => covers(m, u.file)))) fail('S2', `第 ${r.order} 列的值 \`${v}\` 沒有任何成員在用 —— 過期`)
    }
  }
  // S3 全域列:每列一個數值、序與值都逐列遞增
  const global = rows.filter((r) => r.scope === '全域')
  const local = rows.filter((r) => r.scope === '局部')
  if (global.length + local.length !== rows.length) fail('S3', `範圍欄只能是「局部」或「全域」:${rows.filter((r) => r.scope !== '全域' && r.scope !== '局部').map((r) => `第 ${r.order} 列「${r.scope}」`).join('、')}`)
  for (const r of global) if (r.values.length !== 1 || !isNumber(r.values[0])) fail('S3', `全域第 ${r.order} 列必須正好一個數值,現在是 ${r.values.join(' ') || '空'}`)
  for (let i = 1; i < rows.length; i++) if (rows[i].order <= rows[i - 1].order) fail('S3', `表的序不是由下而上遞增:第 ${rows[i - 1].order} 列之後是第 ${rows[i].order} 列`)
  for (let i = 1; i < global.length; i++) {
    const [a, b] = [Number(global[i - 1].values[0]), Number(global[i].values[0])]
    if (!(b > a)) fail('S3', `全域列沒有逐列遞增:第 ${global[i - 1].order} 列「${global[i - 1].name}」${a} → 第 ${global[i].order} 列「${global[i].name}」${b}`)
  }
  // S4 局部列:數字 ≤ 20 且低於最低的全域列;不是數字的值必須在 CONTAINED_LOCAL(D 量過的變數 / 已知有界的運算式)
  const lowestGlobal = Math.min(...global.map((r) => Number(r.values[0])).filter(Number.isFinite))
  for (const r of local) {
    for (const v of r.values) {
      if (isNumber(v)) {
        if (Number(v) > 20 || Number(v) >= lowestGlobal) fail('S4', `局部第 ${r.order} 列的值 ${v} 超過 20 或不低於最低的全域列(${lowestGlobal})—— 會漏到整頁脈絡蓋過浮層`)
      } else if (!Object.hasOwn(CONTAINED_LOCAL, v)) {
        fail('S4', `局部第 ${r.order} 列的值 \`${v}\` 不是數字,也不在 CONTAINED_LOCAL —— 說不出它有上限或被那一列圈住(變數值要讓那一列 isolate、加進 CONTAINED_LOCAL 讓閘 D 量)`)
      }
    }
  }
  // S5 裁示:拖曳影像 > Tooltip > Toast > 第 3–6 列(並存遮罩 / 並存 modal / 代理蓋板 / 一般 modal 與錨定浮層)與所有局部列
  const byName = (name) => rows.find((r) => r.name === name)
  const toastRow = byName('Toast')
  const tooltipRow = byName('Tooltip')
  const dragRow = byName('拖曳影像')
  const num = (r) => Number(r?.values?.[0])
  if (!toastRow || !tooltipRow || !dragRow) fail('S5', '表上找不到「Toast」「Tooltip」或「拖曳影像」列')
  else {
    if (!toastRow.members.includes('components/Toast/toast.tsx')) fail('S5', 'Toast 列的成員必須是 components/Toast/toast.tsx')
    if (!tooltipRow.members.includes('components/Tooltip/tooltip.tsx')) fail('S5', 'Tooltip 列的成員必須含 components/Tooltip/tooltip.tsx')
    if (!(num(tooltipRow) > num(toastRow))) fail('S5', `Tooltip(${num(tooltipRow)})必須在 Toast(${num(toastRow)})之上(user 2026-10-13 採納)`)
    // 改動前 Tooltip(50)< 拖曳影像(999):沿用;拖曳影像 vs Toast 是被迫翻的那一對(表下「逐對裁示」)
    if (!(num(dragRow) > num(tooltipRow))) fail('S5', `拖曳影像(${num(dragRow)})必須在 Tooltip(${num(tooltipRow)})之上(沿用改動前的順序)`)
    for (const name of ['並存遮罩', '並存 modal', '代理蓋板', '一般 modal 與錨定浮層']) {
      const r = byName(name)
      if (!r) fail('S5', `表上找不到「${name}」列`)
      else if (!(num(toastRow) > num(r))) fail('S5', `Toast(${num(toastRow)})必須在「${name}」(${num(r)})之上(沿用改動前的順序)`)
    }
    for (const r of local) for (const v of r.values.filter(isNumber)) if (!(num(toastRow) > Number(v))) fail('S5', `Toast 必須在局部第 ${r.order} 列(${v})之上`)
  }
  return fails
}

// ── S 靜態 ─────────────────────────────────────────────────────────────────
const specText = fs.readFileSync(path.join(REPO, SPEC), 'utf8')
const rows = parseTable(specText)
const scanned = scanAll()
{
  current = 'S'
  const fails = checkRegistry(rows, scanned)
  rec(scanned.uses.length > 0, `前提:掃到 ${scanned.uses.length} 處 z 值(${new Set(scanned.uses.map((u) => u.file)).size} 個檔)`, '掃到 0 處 = 掃描器壞了,不是「全 DS 沒有 z-index」')
  rec(DND_DEFAULT_Z != null, `前提:從已安裝的 @dnd-kit/core 讀到 DragOverlay 預設 zIndex(${DND_DEFAULT_Z ?? '讀不到'})`, '讀不到 = 沒寫 zIndex 的 <DragOverlay> 量不到,不是「沒有預設」')
  rec(fails.length === 0, `全 DS 的 z 值都登記在 ${SPEC}「疊放順序」、表不過期、順序成立(${rows?.length ?? 0} 列)`, fails.slice(0, 12).map((f) => `[${f.id}] ${f.msg}`).join(' ;; '))
}
// ── S 對照組:每一種改壞都必須紅在指定的檢查 ─────────────────────────────────
if (SELFTEST) {
  current = 'S-ctl'
  const tooltipSrc = fs.readFileSync(path.join(DS_SRC, 'components/Tooltip/tooltip.tsx'), 'utf8')
  const editRow = (name, fn) => rows.map((r) => (r.name === name ? fn({ ...r, values: [...r.values], members: [...r.members] }) : r))
  const controls = [
    ['注入未登記的值(tooltip.tsx 多一個 z-[55])', 'S1', rows, scanAll({ 'components/Tooltip/tooltip.tsx': tooltipSrc.replace('overflow-hidden rounded-md', 'z-[55] overflow-hidden rounded-md') })],
    ['在未登記的檔用已登記的值(新檔 Badge 用 z-50)', 'S1', rows, scanAll({ 'components/Badge/__layer-selftest.tsx': 'export const c = "fixed z-50"\n' })],
    ['拿掉一個成員(第 6 列少了 Sheet)', 'S1', editRow('一般 modal 與錨定浮層', (r) => ({ ...r, members: r.members.filter((m) => m !== 'components/Sheet/') })), scanned],
    ['Toast 的值改到 Tooltip 之上(80)', 'S5', editRow('Toast', (r) => ({ ...r, values: ['80'] })), scanned],
    ['局部列塞進 35', 'S4', editRow('元件內局部疊放', (r) => ({ ...r, values: [...r.values, '35'] })), scanned],
    ['程式不再用某個登記值(tooltip.tsx 拿掉 z 值)', 'S2', rows, scanAll({ 'components/Tooltip/tooltip.tsx': tooltipSrc.replace(/z-\[70\] /, '') })],
    ['拖曳影像壓到 Tooltip 之下(65)', 'S5', editRow('拖曳影像', (r) => ({ ...r, values: ['65'] })), scanned],
    ['局部列塞一個沒量過的變數 var(--chip-stack-z)', 'S4', editRow('元件內局部疊放', (r) => ({ ...r, values: [...r.values, 'var(--chip-stack-z)'] })), scanned],
    // 寫法對照組:同一個未登記的值 55,換成 utility 以外的寫法注入,掃描器每一種都必須看得到
    ...[
      ['JSX 屬性 `<DragOverlay zIndex={55}>`', 'export const G = () => <DragOverlay zIndex={55} />\n'],
      ["`el.style.setProperty('z-index', '55')`", "export const f = (el: HTMLElement) => el.style.setProperty('z-index', '55')\n"],
      ["`el.style.cssText = 'position:fixed;z-index:55'`", "export const f = (el: HTMLElement) => { el.style.cssText = 'position:fixed;z-index:55' }\n"],
      ['樣板裡的 CSS `${sel}{z-index:${z}}`', 'const z = 55\nexport const css = (sel: string) => `${sel}{z-index:${z}}`\n'],
      ['物件簡寫 `{ zIndex }`', 'const zIndex = 55\nexport const s = { zIndex }\n'],
      ["`el.style['z-index'] = '55'`", "export const f = (el: HTMLElement) => { (el.style as any)['z-index'] = '55' }\n"],
    ].map(([how, src]) => [`寫法:${how}`, 'S1', rows, scanAll({ 'components/Tooltip/__layer-selftest.tsx': src })]),
    ['沒寫 zIndex 的 <DragOverlay> 出現在未登記的檔(= dnd-kit 預設)', 'S1', rows, scanAll({ 'components/Badge/__layer-selftest.tsx': 'export const G = () => <DragOverlay>{null}</DragOverlay>\n' })],
  ]
  for (const [label, id, r, s] of controls) {
    const fails = checkRegistry(r, s)
    const hit = fails.some((f) => f.id === id)
    rec(hit, `對照組:${label} → ${id} 必紅`, hit ? fails.find((f) => f.id === id).msg : `沒紅(紅的是 ${[...new Set(fails.map((f) => f.id))].join(' / ') || '無'})`)
  }
  // 反向對照:引號包住的已登記數字(`Object.assign(el.style, { zIndex: '70' })`)與 70 同值,不得誤紅
  {
    const quoted = scanSource('components/Tooltip/tooltip.tsx', "export const f = (el: HTMLElement) => Object.assign(el.style, { zIndex: '70' })\n")
    rec(quoted.length === 1 && quoted[0].value === '70', "反向對照:`{ zIndex: '70' }` 正規化成 70(已登記的值不因引號誤紅)", JSON.stringify(quoted.map((u) => u.value)))
  }
}

// 靜態已紅 → 直接收尾:缺建置時 requireFreshStorybookBuild 會以「缺前置」exit 2,meta 層會讀成略過 —— 靜態的紅不能被吃掉
if (STATIC_ONLY || (!SELFTEST && failed > 0) || (SELFTEST && (redBy['S-ctl'] || redBy.S))) finish()

// ── R 真建置 ───────────────────────────────────────────────────────────────
const { startA11yStaticServer } = await import('./lib/a11y-static-server.mjs')
const { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError } = await import('./lib/launch-browser.mjs')

const root = path.resolve(REPO, arg('static', 'storybook-static'))
requireFreshStorybookBuild(root, [
  'packages/design-system/src/components/Toast/toast.tsx',
  'packages/design-system/src/components/Tooltip/tooltip.tsx',
  'packages/design-system/src/components/Dialog/dialog.tsx',
  'packages/design-system/src/components/Dialog/dialog.stories.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.stories.tsx',
  // D:用變數疊放的頭像 / Tag 與它們的列
  'packages/design-system/src/components/OverflowIndicator/overflow-tag-list.tsx',
  'packages/design-system/src/components/Combobox/combobox.tsx',
  'packages/design-system/src/components/Combobox/combobox.stories.tsx',
  'packages/design-system/src/components/Avatar/avatar.tsx',
  'packages/design-system/src/components/PeoplePicker/person-display.tsx',
  'packages/design-system/src/components/PeoplePicker/people-picker.stories.tsx',
  'packages/design-system/src/components/DataTable/data-table.tsx',
  'packages/design-system/src/components/DataTable/data-table.stories.tsx',
  // E:並存 modal 的本體
  'packages/design-system/src/components/FileViewer/file-viewer.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.stories.tsx',
])
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
const findEntry = (re) => Object.values(index.entries).find((e) => e.type === 'story' && re.test(e.id))?.id
const DEMO = findEntry(/agentpanel.*--url-registry-demo$/)
const DIALOG_FORM = findEntry(/components-dialog-.*--with-form$/)
if (!DEMO || !DIALOG_FORM) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:找不到 story(網址註冊表示意 ${DEMO ?? '缺'} / Dialog 表單 ${DIALOG_FORM ?? '缺'})`)
  await server.stop()
  process.exit(1)
}

const TOAST = '[data-sonner-toast][data-mounted="true"]'
const PANEL = '[role="complementary"][aria-label="智慧代理"]'
const FAB = 'button[aria-label*="開啟智慧代理"]'
/**
 * 對照組:改動前 —— sonner 內建的值;壓低 —— 低於代理蓋板(45)與一般 modal(50)。
 * 用**行內 important**寫在清單上:DS 的 `!z-[60]` 是 layer 裡的 important,會贏過任何沒有 layer 的 important 樣式表
 *(cascade 對 important 反轉 layer 順序)—— 注入 `<style>` 改不動它,對照組就會假裝有在量(第一版就是這樣,全綠)。
 */
const CONTROL_Z = { old: '999999999', low: '44' }
/** 只在量的那一刻:讓 Toast 與提示吃指標(modal 開著時 body 是 pointer-events:none),不碰 z-index / 位置 */
const HIT_CSS = '[data-sonner-toaster],[data-sonner-toaster] *,[data-radix-popper-content-wrapper],[data-radix-popper-content-wrapper] *{pointer-events:auto!important}'
/**
 * 每一個等待的天花板(30 秒 = openStory 每段等待的預設)。成功與否一律由**元素本身**決定(Toast 出現、提示出現、Dialog 卸載、
 * 面板換成蓋板、sonner 的暫停旗標、版面連續 10 個影格靜止),天花板只在訊號永遠不來時才用得到 —— 放寬不會造成假綠,
 * 只讓慢的機器多等一會兒(M32 第四題:機器慢不能讓閘紅)。
 */
const WAIT_MS = 30_000
/** 重現慢機器:`--cpu-throttle=N`(CDP Emulation.setCPUThrottlingRate;4–6 約等於 GitHub ubuntu runner)。預設 1 = 不降速 */
const CPU_THROTTLE = Number(arg('cpu-throttle', 1))

const browser = await launchBrowser()
const VIEWPORT = { width: 1440, height: 900 }
const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' })
const page = await context.newPage()
if (CPU_THROTTLE > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

/**
 * 頁面端(以 page.evaluate 序列化傳入,不得引用外部變數):那一刻的 Dialog / Toast / 浮層 / 焦點 / 代理面板 —— 只供訊息,
 * 讓逾時當下就看得出卡在什麼狀態,不必重跑。
 */
function pageState() {
  const text = (el) => (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 16)
  const flag = (el, attr, word) => (el.getAttribute(attr) === 'true' ? word : '')
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((el) => `${el.getAttribute('data-state') ?? '?'}「${text(el)}」`)
  const toasts = [...document.querySelectorAll('[data-sonner-toast]')].map((el) => `${el.getAttribute('data-mounted') === 'true' ? '' : '未掛上 '}${flag(el, 'data-removed', '移除中 ')}${flag(el, 'data-expanded', '暫停中 ')}「${text(el)}」`)
  const floating = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state]')].map((el) => `${el.getAttribute('data-state')}「${text(el)}」`)
  const a = document.activeElement
  const active = !a || a === document.body ? 'body' : `${a.tagName.toLowerCase()}${a.getAttribute('aria-label') ? `「${a.getAttribute('aria-label')}」` : a.id ? `#${a.id}` : ''}`
  const panel = document.querySelector('[role="complementary"][aria-label="智慧代理"]')?.getAttribute('data-agent-panel-mode') ?? '無'
  return `Dialog ${dialogs.join('、') || '無'};Toast ${toasts.join('、') || '無'};浮層 ${floating.join('、') || '無'};焦點 ${active};代理面板 ${panel}`
}
/**
 * 每一步都有名字(2026-10-14):任何一步逾時或前提不成立,訊息點名是哪一步、等了多久,並附上那一刻的頁面狀態(pageState)。
 * 改之前情境 B 有三個長得一樣的 waitForFunction,33 次裡有 1 次只留下「page.waitForFunction: Timeout 10000ms exceeded.」——
 * 分不出卡在哪一個,也就查不出原因。
 */
async function step(label, fn) {
  const t0 = Date.now()
  try {
    return await fn()
  } catch (error) {
    const state = await page.evaluate(pageState).catch((e) => `讀不到(${String(e?.message ?? e).split('\n')[0]})`)
    throw new Error(`[${label}] ${String(error?.message ?? error).split('\n')[0]}(這一步等了 ${Date.now() - t0}ms)—— 當下:${state}`)
  }
}
async function settle(label) {
  await step(`${label} 版面連續 10 個影格靜止`, async () => {
    const s = await settleAfterInteraction(page, { frames: 10, capMs: WAIT_MS })
    if (!s.ok) throw new Error(`${WAIT_MS / 1000} 秒內沒有靜止(${JSON.stringify(s)})`)
  })
}
async function scenario(name, storyId, waitFor, body, { viewport = VIEWPORT } = {}) {
  current = name
  await page.setViewportSize(viewport)
  try {
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`, { waitFor, settleFrames: 10, notFound: server.notFound })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.log(`✗ 情境 ${name}:${error.message}`)
    instrumentFails.push({ scenario: name, detail: error.detail })
    return
  }
  try {
    await body()
  } catch (error) {
    // 用 current 不用 name:B 的後半是 C1,紅在那裡就要說是 C1
    console.log(`✗ 情境 ${current} 沒量到:${error.message.split('\n')[0]}`)
    instrumentFails.push({ scenario: current, detail: error.message.split('\n')[0] })
  }
}
/** 對照組的值寫進每一份 Toast 清單的行內樣式(清單在有 Toast 時才出現 → 用 MutationObserver 補上之後出現的) */
async function setControl(kind) {
  const applied = await page.evaluate((z) => {
    window.__layerOrderControl?.disconnect()
    const apply = () => document.querySelectorAll('[data-sonner-toaster]').forEach((ol) => (z ? ol.style.setProperty('z-index', z, 'important') : ol.style.removeProperty('z-index')))
    apply()
    if (z) { const mo = new MutationObserver(apply); mo.observe(document.body, { childList: true, subtree: true }); window.__layerOrderControl = mo }
    return [...document.querySelectorAll('[data-sonner-toaster]')].map((ol) => getComputedStyle(ol).zIndex)
  }, kind ? CONTROL_Z[kind] : null)
  if (kind && applied.some((z) => z !== CONTROL_Z[kind])) throw new Error(`對照組沒套上:清單 z-index ${applied.join(' / ')} ≠ ${CONTROL_Z[kind]}`)
}
const waitToast = (label, text) => step(`${label} 等 Toast「${text}」出現`, () => page.waitForFunction(({ sel, text }) => [...document.querySelectorAll(sel)].some((el) => (el.textContent ?? '').includes(text)), { sel: TOAST, text }, { timeout: WAIT_MS, polling: 'raf' }))
const waitTooltip = (label, text) => step(`${label} 等提示「${text}」打開`, () => page.waitForFunction((text) => [...document.querySelectorAll('[role="tooltip"]')].some((el) => (el.textContent ?? '').includes(text) && el.closest('[data-radix-popper-content-wrapper]')), text, { timeout: WAIT_MS, polling: 'raf' }))
/**
 * 讓 Toast 量完之前不會自己關掉(2026-10-14,M32 第四題):沒有 action 的 Toast 4 秒後自己關(toast.spec.md「API」duration),
 * 而 B 從 Toast 出現到 C1 量完要走「Dialog 收起 → 再打開 → 指標移到關閉鈕 → 提示 500ms 延遲 → 平移 → 量 → 再平移 → 量」,
 * 每一段都等版面靜止 —— 本機已經吃掉大半個 4 秒,慢的機器超過就變成「找不到 Toast」(儀器失效 = 閘因為機器慢而紅)。
 * 做法 = sonner 自己的暫停條件:指標在清單上(`onMouseMove → setExpanded(true)`,expanded 時計時器暫停)。只送一個合成的
 * mousemove 給清單,真指標不動(它要留在觸發點上;modal 開著時 body 是 pointer-events:none,真指標本來也移不進清單)。
 * 只有一則 Toast 時 expanded 不改它的位置(最前面那一則位移 0、高度不變)。等的是 sonner 自己的 `data-expanded="true"`
 *(= 計時器已暫停),不是睡;量的時候 hitTest 再用文字找一次 Toast,不在 = 儀器失效。
 */
async function holdToast(label, text) {
  await step(`${label} 暫停 Toast「${text}」的自動關閉`, async () => {
    const sent = await page.evaluate((text) => {
      const ol = [...document.querySelectorAll('[data-sonner-toast][data-mounted="true"]')].find((el) => (el.textContent ?? '').includes(text))?.closest('[data-sonner-toaster]')
      if (!ol) return false
      ol.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window }))
      return true
    }, text)
    if (!sent) throw new Error(`找不到 Toast「${text}」`)
    await page.waitForFunction((text) => [...document.querySelectorAll('[data-sonner-toast][data-expanded="true"]')].some((el) => (el.textContent ?? '').includes(text)), text, { timeout: WAIT_MS, polling: 'raf' })
  })
  return Date.now()
}
/** 提示的可見盒子與它在觸發點的哪一側(Radix 的 data-side) */
const tooltipBox = (label, text) => step(`${label} 量提示「${text}」的盒子`, async () => {
  const tip = await page.evaluate((text) => {
    const v = [...document.querySelectorAll('[role="tooltip"]')].find((el) => (el.textContent ?? '').includes(text))?.closest('[data-radix-popper-content-wrapper]')?.firstElementChild
    if (!v) return null
    const r = v.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, side: v.getAttribute('data-side') }
  }, text)
  if (!tip) throw new Error(`提示「${text}」沒有盒子`)
  return tip
})
/** 提示在觸發點哪一側 → Toast 對齊提示的「外側」緣,不越過 8px 間距蓋到觸發點(蓋到觸發點會讓指標開的提示因指標離開而關掉) */
const awayFromTrigger = (side) => (side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : 'center')
const boxOf = (label, locator) => step(label, async () => {
  const b = await locator.boundingBox()
  if (!b) throw new Error('沒有盒子(不在版面上)')
  return b
})

/**
 * 命中測試:在 `region`(預設 = 上層元素的盒子往內縮 inset,避開圓角)裡每 step px 取一點,問 elementFromPoint 落在誰身上。
 * 回 { topHits, otherHits, total, region, topZ, otherZ }。top / other 用「找到元素的函式名」描述,在頁面裡解析。
 */
const hitTest = (spec) => page.evaluate(async ({ spec, HIT_CSS }) => {
  const find = (s) => {
    if (s.kind === 'tooltip') return [...document.querySelectorAll('[role="tooltip"]')].find((el) => (el.textContent ?? '').includes(s.text))?.closest('[data-radix-popper-content-wrapper]') ?? null
    if (s.kind === 'toast') return [...document.querySelectorAll('[data-sonner-toast][data-mounted="true"]')].find((el) => (el.textContent ?? '').includes(s.text)) ?? null
    return document.querySelector(s.selector)
  }
  const top = find(spec.top)
  const other = find(spec.other)
  if (!top || !other) return { missing: !top ? spec.top : spec.other }
  const visual = (el) => (el.matches('[data-radix-popper-content-wrapper]') ? el.firstElementChild ?? el : el)
  const rect = (el) => { const r = visual(el).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  const shrink = (r, d) => ({ left: r.left + d, top: r.top + d, right: r.right - d, bottom: r.bottom - d })
  const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) })
  const topRect = rect(top)
  const otherRect = rect(other)
  // 只量兩者真的重疊的那一塊(各自內縮,避開圓角與陰影):那裡才問得出「誰在上面」
  const region = inter(shrink(topRect, spec.inset), shrink(otherRect, spec.inset))
  const out = { topRect, otherRect, region, topZ: getComputedStyle(top.closest('[data-sonner-toaster]') ?? top).zIndex, otherZ: getComputedStyle(other.closest('[data-sonner-toaster]') ?? other).zIndex, topHits: 0, otherHits: 0, elseHits: 0, total: 0, sampleElse: null }
  if (region.right - region.left < 1 || region.bottom - region.top < 1) return out
  const style = document.createElement('style')
  style.textContent = HIT_CSS
  document.head.append(style)
  try {
    const xs = []; const ys = []
    for (let x = region.left; x <= region.right; x += spec.step) xs.push(x)
    for (let y = region.top; y <= region.bottom; y += spec.step) ys.push(y)
    if (xs.at(-1) !== region.right) xs.push(region.right)
    if (ys.at(-1) !== region.bottom) ys.push(region.bottom)
    for (const x of xs) for (const y of ys) {
      const el = document.elementFromPoint(x, y)
      out.total++
      if (el && top.contains(el)) out.topHits++
      else if (el && other.contains(el)) out.otherHits++
      else { out.elseHits++; out.sampleElse ??= el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className).slice(0, 60)}` : 'null' }
    }
  } finally { style.remove() }
  return out
}, { spec, HIT_CSS })

const fmt = (b) => (b ? `[${Math.round(b.left)},${Math.round(b.top)} – ${Math.round(b.right)},${Math.round(b.bottom)}]` : 'null')
/**
 * 量一次「誰在上面」並判定:前提(兩者都在、真的重疊)不成立 = 儀器失效(丟錯,由 step 帶上步驟名與頁面狀態);
 * 成立後才判 top 是否全贏(rec,不丟錯)。
 */
async function measureTop(label, verdict, spec, { minSamples = 4 } = {}) {
  const h = await step(`${label} 命中測試`, async () => {
    const h = await hitTest(spec)
    if (h.missing) throw new Error(`找不到 ${JSON.stringify(h.missing)}`)
    if (h.total < minSamples) throw new Error(`兩者沒有重疊(上 ${fmt(h.topRect)} / 下 ${fmt(h.otherRect)})—— 量不到誰在上面,不是通過`)
    return h
  })
  rec(h.topHits === h.total, verdict, `命中上層 ${h.topHits}/${h.total}、下層 ${h.otherHits}、其他 ${h.elseHits}${h.sampleElse ? `(${h.sampleElse})` : ''};z ${h.topZ} vs ${h.otherZ};重疊區 ${fmt(h.region)}`)
  return h
}
/** 把 Toast 清單平移到 target 上(只動位置):align = 'center' | 'top' | 'bottom'(讓 Toast 的上 / 下緣對齊 target 的上 / 下緣,不越過另一側) */
async function moveToastOnto(label, toastText, targetRect, align = 'center') {
  await step(`${label} 把 Toast「${toastText}」平移到 ${fmt(targetRect)}(${align})`, async () => {
    const moved = await page.evaluate(({ toastText, t, align }) => {
      const toast = [...document.querySelectorAll('[data-sonner-toast][data-mounted="true"]')].find((el) => (el.textContent ?? '').includes(toastText))
      const ol = toast?.closest('[data-sonner-toaster]')
      if (!toast || !ol) return null
      const zBefore = getComputedStyle(ol).zIndex
      const r = toast.getBoundingClientRect()
      const dx = (t.left + t.right) / 2 - (r.left + r.right) / 2
      const dy = align === 'top' ? t.top - r.top : align === 'bottom' ? t.bottom - r.bottom : (t.top + t.bottom) / 2 - (r.top + r.bottom) / 2
      ol.style.setProperty('translate', `${dx}px ${dy}px`, 'important')
      return { zBefore, zAfter: getComputedStyle(ol).zIndex }
    }, { toastText, t: targetRect, align })
    if (!moved) throw new Error(`找不到 Toast「${toastText}」`)
    if (moved.zBefore !== moved.zAfter) throw new Error(`平移改到了 z-index(${moved.zBefore} → ${moved.zAfter})—— 量具汙染`)
  })
  await settle(label)
}
const resetToast = (label) => step(`${label} Toast 回原位`, () => page.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((ol) => ol.style.removeProperty('translate'))))
/** 報告(不判定):Toast 從出現到最後一次量測經過多久 —— 對照 sonner 自己關掉的 4 秒,看得出暫停是不是必要 */
const reportHeld = (text, since) => console.log(`ℹ ${current} 報告(不判定):Toast「${text}」出現到最後一次量測 ${Date.now() - since}ms(無 action 的 Toast 4000ms 自己關;量測期間已暫停)`)
/** 建一筆任務 → 等 Toast「任務已建立」→ 暫停它(A 與 C2 共用;示意的「新增任務」對話框) */
async function createTask(prefix) {
  await step(`${prefix}1 點「新增任務」`, () => page.click('#demo-new-task', { timeout: WAIT_MS }))
  await step(`${prefix}2 等任務標題欄`, () => page.waitForSelector('#demo-task-title', { timeout: WAIT_MS }))
  await step(`${prefix}3 點任務標題欄`, () => page.click('#demo-task-title', { timeout: WAIT_MS }))
  await step(`${prefix}4 打任務標題`, () => page.keyboard.type('補 QA 環境資訊'))
  await step(`${prefix}5 點「建立任務」`, () => page.click('#demo-task-save', { timeout: WAIT_MS }))
  await waitToast(`${prefix}6`, '任務已建立')
  return holdToast(`${prefix}7`, '任務已建立')
}

// ── A 入口鈕的提示 vs Toast(回報的場景:面板關著、入口鈕在家)──────────────────────────────────
// Toast 依 toast.spec.md「落點」甲以整個視窗為準、不避讓 → 入口鈕在家時 Toast 疊在入口鈕上,指標點不到被蓋住的那一大塊;
// 鍵盤使用者 Tab 到入口鈕一樣會打開它的提示(Radix Tooltip 聚焦即開)。提示開在入口鈕上方,與單則 Toast 不一定重疊 →
// 跟 B 一樣把 Toast 平移到提示上(只動位置、不動 z-index),讓「重疊」是確定的前提。
await scenario('A', DEMO, PANEL, async () => {
  if (SELFTEST) await setControl('old')
  await step('A1 點「關閉面板」', () => page.click('button[aria-label="關閉面板"]', { timeout: WAIT_MS }))
  await step('A2 等入口鈕出現', () => page.waitForSelector(FAB, { timeout: WAIT_MS }))
  await settle('A3')
  const since = await createTask('A4.')
  await settle('A5')
  // 用盒子算(不用 elementFromPoint):暫停中的 Toast 上緣外還有 sonner 的懸停橋(::after,gap + 1px),會把數字算大
  const cover = await step('A6 量入口鈕被 Toast 蓋住多少', () => page.evaluate(({ FAB, TOAST }) => {
    const f = document.querySelector(FAB)?.getBoundingClientRect()
    const t = [...document.querySelectorAll(TOAST)].find((el) => (el.textContent ?? '').includes('任務已建立'))?.getBoundingClientRect()
    if (!f || !t) return null
    const w = Math.max(0, Math.min(f.right, t.right) - Math.max(f.left, t.left))
    const h = Math.max(0, Math.min(f.bottom, t.bottom) - Math.max(f.top, t.top))
    return Math.round((w * h) / (f.width * f.height) * 100)
  }, { FAB, TOAST }))
  console.log(`ℹ A 報告(不判定):入口鈕的盒子 ${cover ?? '?'}% 在 Toast 的盒子底下 —— 甲:Toast 不避讓、疊在入口鈕上(toast.spec.md「落點」),指標點不到那一塊`)
  await step('A7 鍵盤聚焦入口鈕', () => page.locator(FAB).first().focus({ timeout: WAIT_MS }))
  await waitTooltip('A8', '問我或推走我')
  await settle('A9')
  const tip = await tooltipBox('A10', '問我或推走我')
  await moveToastOnto('A11', '任務已建立', tip, awayFromTrigger(tip.side))
  await measureTop('A12', '入口鈕的提示「問我或推走我」與 Toast 重疊處全是提示(提示整塊看得到)', { top: { kind: 'tooltip', text: '問我或推走我' }, other: { kind: 'toast', text: '任務已建立' }, inset: 6, step: 3 })
  // 整塊提示(不只重疊區)都命中提示本身
  const whole = await step('A13 命中測試(提示本體)', () => hitTest({ top: { kind: 'tooltip', text: '問我或推走我' }, other: { kind: 'tooltip', text: '問我或推走我' }, inset: 6, step: 3 }))
  rec(whole.total > 0 && whole.topHits === whole.total, '提示本體內每一點都命中提示', `${whole.topHits}/${whole.total}`)
  reportHeld('任務已建立', since)
  if (SELFTEST) await setControl(null)
})

// ── B / C1 Dialog 裡的提示 vs Toast;Toast vs 一般 Dialog(z-50)的遮罩與本體 ─────────────────────
await scenario('B', DIALOG_FORM, 'button', async () => {
  await step('B1 點「開啟 Modal」', () => page.getByRole('button', { name: '開啟 Modal' }).click({ timeout: WAIT_MS }))
  await step('B2 等 Dialog 出現', () => page.waitForSelector('[role="dialog"]', { timeout: WAIT_MS }))
  await settle('B3')
  await step('B4 填專案名稱', () => page.locator('[role="dialog"] input').first().fill('Q4 設計系統升級', { timeout: WAIT_MS }))
  await step('B5 點「建立」', () => page.getByRole('button', { name: '建立', exact: true }).click({ timeout: WAIT_MS }))
  await waitToast('B6', '專案已建立')
  const since = await holdToast('B7', '專案已建立')
  await step('B8 等送出後的 Dialog 卸載', () => page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: WAIT_MS, polling: 'raf' }))
  await step('B9 再點「開啟 Modal」', () => page.getByRole('button', { name: '開啟 Modal' }).click({ timeout: WAIT_MS }))
  await step('B10 等 Dialog 出現', () => page.waitForSelector('[role="dialog"]', { timeout: WAIT_MS }))
  await settle('B11')
  const cb = await boxOf('B12 量 Dialog 的關閉鈕', page.locator('[role="dialog"] button[aria-label="關閉"]').first())
  await step('B13 指標移到關閉鈕', () => page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2))
  await waitTooltip('B14', '關閉')
  await settle('B15')
  if (SELFTEST) await setControl('old')
  const tip = await tooltipBox('B16', '關閉')
  await moveToastOnto('B17', '專案已建立', tip, awayFromTrigger(tip.side))
  await measureTop('B18', 'Dialog 裡的提示「關閉」與 Toast 重疊處全是提示', { top: { kind: 'tooltip', text: '關閉' }, other: { kind: 'toast', text: '專案已建立' }, inset: 6, step: 2 })

  current = 'C1'
  if (SELFTEST) await setControl('low')
  await resetToast('C1.1')
  await settle('C1.2')
  // Toast 在自己的位置(右下):底下是一般 Dialog 的遮罩(z-50)
  await measureTop('C1.3', 'Toast 蓋在一般 Dialog 的遮罩上(重疊處全是 Toast)', { top: { kind: 'toast', text: '專案已建立' }, other: { selector: '[data-radix-dialog-overlay], .fixed.inset-0.bg-overlay' }, inset: 10, step: 6 })
  // 平移到 Dialog 本體中央:底下是 Dialog 本體(z-50)
  const dialog = await boxOf('C1.4 量 Dialog 本體', page.locator('[role="dialog"]').first())
  await moveToastOnto('C1.5', '專案已建立', { left: dialog.x, top: dialog.y, right: dialog.x + dialog.width, bottom: dialog.y + dialog.height }, 'center')
  await measureTop('C1.6', 'Toast 蓋在一般 Dialog 本體上(重疊處全是 Toast)', { top: { kind: 'toast', text: '專案已建立' }, other: { selector: '[role="dialog"]' }, inset: 10, step: 6 })
  reportHeld('專案已建立', since)
  if (SELFTEST) await setControl(null)
})

// ── C2 Toast vs 代理蓋板(z-[45]):寬畫面建任務 → 縮到 900(容器 < 960 → 蓋板)─────────────────────
await scenario('C2', DEMO, PANEL, async () => {
  if (SELFTEST) await setControl('low')
  const since = await createTask('C2.1.')
  await step('C2.2 視窗縮到 900', () => page.setViewportSize({ width: 900, height: 900 }))
  await step('C2.3 等代理面板換成蓋板', () => page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-agent-panel-mode') === 'overlay', PANEL, { timeout: WAIT_MS, polling: 'raf' }))
  await settle('C2.4')
  // 這則示意把宿主畫在一個帶 transform 的「模擬瀏覽器畫布」裡 —— transform 自成疊放脈絡,整塊畫布在整頁脈絡裡是 0,
  // Toast 不論幾層都會在它上面(第一版在這裡對照組 44 也綠,就是量到了這個)。產品裡面板的祖先是 `position: relative; z-index: auto`
  //(agent-panel.tsx 蓋板註解),面板直接拿 z-[45] 跟整頁比。所以量之前拿掉畫布的 transform,並確認面板到根之間再沒有任何疊放脈絡。
  const chain = await step('C2.5 拿掉示意畫布的 transform', async () => {
    const chain = await page.evaluate((PANEL) => {
      const panel = document.querySelector(PANEL)
      const neutralised = []
      const contexts = []
      for (let e = panel?.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        if (getComputedStyle(e).transform !== 'none') { e.style.setProperty('transform', 'none', 'important'); neutralised.push(e.tagName.toLowerCase()) }
        const cs = getComputedStyle(e)
        const creates = (cs.position !== 'static' && cs.zIndex !== 'auto') || cs.position === 'fixed' || cs.position === 'sticky' || cs.transform !== 'none'
          || cs.isolation === 'isolate' || Number(cs.opacity) < 1 || cs.filter !== 'none' || /paint|layout|strict|content/.test(cs.contain) || /transform|opacity|filter/.test(cs.willChange)
        if (creates) contexts.push(`${e.tagName.toLowerCase()}.${String(e.getAttribute('class') ?? '').slice(0, 60)}`)
      }
      return { found: !!panel, neutralised, contexts, z: panel ? getComputedStyle(panel).zIndex : null }
    }, PANEL)
    if (!chain.found) throw new Error('找不到代理面板')
    if (chain.contexts.length) throw new Error(`面板到根之間還有疊放脈絡(${chain.contexts.join(' ← ')})—— 量到的不是面板的 z-[45]`)
    return chain
  })
  rec(chain.neutralised.length > 0 && chain.z === '45', '前提:拿掉示意畫布的 transform 後,面板以 z-[45] 直接跟整頁比', `拿掉 ${chain.neutralised.length} 個 transform;面板 z ${chain.z}`)
  await settle('C2.6')
  await measureTop('C2.7', 'Toast 蓋在代理蓋板上(重疊處全是 Toast)', { top: { kind: 'toast', text: '任務已建立' }, other: { selector: PANEL }, inset: 10, step: 6 })
  reportHeld('任務已建立', since)
  if (SELFTEST) await setControl(null)
})

// ── D 用變數疊放的頭像 / Tag:所在那一列自成疊放脈絡(表第 1 列「由那一列圈住」)─────────────────────────────
// 值 = 項目數 − 索引、聚焦時 = 項目數 + 1,沒有上限;只要那一列(最近的有盒子的祖先;OverflowTagList 的列表本身是 display:contents)
// 自成疊放脈絡,這些值就只在列裡比。量的是「那一列是否自成疊放脈絡」這個性質本身(computed style),不是「有沒有寫 isolate 這個字」。
const D_SEL = D_VARS.map((v) => `[style*="${v}"]`).join(',')
const D_STORIES = [
  // [情境, story id, 至少幾列, 說明] —— 四個 Tag 列容器(檢視 / 唯讀 / 停用 / 編輯)、表格裡、代理附件列、頭像堆疊列
  ['D1', findEntry(/components-combobox-展示--modes$/), 4, 'Combobox 四模式(編輯 / 檢視 / 唯讀 / 停用)'],
  ['D2', findEntry(/components-combobox-展示--in-data-table$/), 1, 'Combobox 在 DataTable 裡'],
  ['D3', findEntry(/components-datatable-展示--roadmap-all-in-one$/), 1, 'DataTable「專案排程全功能整合」標籤格'],
  ['D4', findEntry(/components-agentpanel-展示--attachments$/), 1, 'AgentPanel 輸入盒附件列'],
  ['D5', findEntry(/components-peoplepicker-展示--hug-width-multi-stack$/), 1, 'PeoplePicker 寬度貼合內容 × 多人(頭像堆疊)'],
]
/** 頁面端(序列化傳入):每一顆用變數疊放的項目 → 它那一列 → 那一列是否自成疊放脈絡 */
function stackScan(vars) {
  const sel = vars.map((v) => `[style*="${v}"]`).join(',')
  const boxParent = (el) => { let p = el.parentElement; while (p && getComputedStyle(p).display === 'contents') p = p.parentElement; return p }
  const creates = (e) => {
    const cs = getComputedStyle(e)
    const pb = boxParent(e)
    const flexItem = pb ? /flex|grid/.test(getComputedStyle(pb).display) : false
    return (cs.position !== 'static' && cs.zIndex !== 'auto') || cs.position === 'fixed' || cs.position === 'sticky' || (flexItem && cs.zIndex !== 'auto')
      || cs.isolation === 'isolate' || cs.transform !== 'none' || cs.translate !== 'none' || cs.rotate !== 'none' || cs.scale !== 'none'
      || Number(cs.opacity) < 1 || cs.filter !== 'none' || (cs.backdropFilter ?? 'none') !== 'none' || cs.mixBlendMode !== 'normal'
      || cs.clipPath !== 'none' || (cs.maskImage ?? 'none') !== 'none' || cs.perspective !== 'none'
      || /paint|layout|strict|content/.test(cs.contain) || (cs.containerType ?? 'normal') !== 'normal'
      || /transform|opacity|filter|isolation|z-index|translate|rotate|scale|perspective|clip-path|mask/.test(cs.willChange)
  }
  const desc = (e) => `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') ?? '').trim().split(/\s+/).slice(0, 6).join('.')}`
  const items = [...document.querySelectorAll(sel)]
  const rows = new Map()
  const seen = new Set()
  let maxZ = 0
  for (const it of items) {
    for (const v of vars) if (it.style.getPropertyValue(v) !== '') seen.add(v)
    const z = Number(getComputedStyle(it).zIndex)
    if (Number.isFinite(z)) maxZ = Math.max(maxZ, z)
    const row = boxParent(it)
    if (!row) continue
    const r = rows.get(row) ?? { contained: creates(row), n: 0 }
    r.n++
    rows.set(row, r)
  }
  const uncontained = [...rows].filter(([, r]) => !r.contained).map(([row, r]) => `${desc(row)}(${r.n} 項)`)
  return { items: items.length, rows: rows.size, uncontained, seen: [...seen], maxZ }
}
const dSeen = new Set()
for (const [name, storyId, minRows, label] of D_STORIES) {
  if (!storyId) {
    console.log(`✗ 情境 ${name}:找不到 story(${label})`)
    instrumentFails.push({ scenario: name, detail: `找不到 story(${label})` })
    continue
  }
  await scenario(name, storyId, D_SEL, async () => {
    await settle(`${name}.1`)
    if (SELFTEST) {
      // 對照組:拿掉每一列的 isolation(只改 isolation,不碰 z-index / 位置)—— 靠 isolate 圈住的列必須變成「沒圈住」
      await step(`${name}.2 對照組:拿掉每一列的 isolation`, () => page.evaluate((sel) => {
        for (const it of document.querySelectorAll(sel)) {
          let p = it.parentElement
          while (p && getComputedStyle(p).display === 'contents') p = p.parentElement
          p?.style.setProperty('isolation', 'auto', 'important')
        }
      }, D_SEL))
    }
    const r = await step(`${name}.3 掃用變數疊放的項目`, async () => {
      const r = await page.evaluate(stackScan, D_VARS)
      if (r.rows < minRows) throw new Error(`只找到 ${r.items} 項、${r.rows} 列(至少要 ${minRows} 列)—— 量不到,不是通過`)
      return r
    })
    r.seen.forEach((v) => dSeen.add(v))
    rec(r.uncontained.length === 0, `${label}:${r.items} 顆用變數疊放的項目、${r.rows} 列,每一列都自成疊放脈絡(項目的值最大 ${r.maxZ})`,
      r.uncontained.length ? `沒圈住:${r.uncontained.slice(0, 6).join(' ;; ')}` : '')
  })
}
{
  // 清單上標 D 的每個變數都必須真的量到過 —— 沒量到 = 清單與量具脫鉤(新變數加進 CONTAINED_LOCAL 卻沒有任何一則 story 用到它)
  current = 'D'
  const missing = D_VARS.filter((v) => !dSeen.has(v))
  if (missing.length) {
    console.log(`✗ 情境 D:CONTAINED_LOCAL 標 D 的變數 ${missing.join(' / ')} 在 D 的 story 裡一個都沒量到 —— 量不到,不是通過`)
    instrumentFails.push({ scenario: 'D', detail: `沒量到 ${missing.join(' / ')}` })
  } else console.log(`✓ D 前提:CONTAINED_LOCAL 標 D 的 ${D_VARS.length} 個變數都量到過(${D_VARS.join(' / ')})`)
}

// ── E 並存 modal 的本體 z-40(Dialog 與 FileViewer 同一格;表第 4 列)、一般 FileViewer z-50(第 6 列)────────────────
const E_STORIES = [
  ['E1', findEntry(/components-fileviewer-展示--coexistence-contract$/), '40', 'FileViewer 並存(persistentElements)的本體'],
  ['E2', findEntry(/components-dialog-展示--coexistence-poc$/), '40', 'Dialog 並存(persistentElements)的本體'],
  ['E3', findEntry(/components-fileviewer-展示--open-snapshot$/), '50', 'FileViewer 一般(modal)的本體'],
]
for (const [name, storyId, want, label] of E_STORIES) {
  if (!storyId) {
    console.log(`✗ 情境 ${name}:找不到 story(${label})`)
    instrumentFails.push({ scenario: name, detail: `找不到 story(${label})` })
    continue
  }
  await scenario(name, storyId, '[role="dialog"][data-state="open"]', async () => {
    await settle(`${name}.1`)
    // 對照組:本體改成另一格的值(行內 important,只動 z-index)—— 必紅
    if (SELFTEST) await step(`${name}.2 對照組:本體改成 ${want === '40' ? '50' : '40'}`, () => page.evaluate((v) => document.querySelectorAll('[role="dialog"][data-state="open"]').forEach((d) => d.style.setProperty('z-index', v, 'important')), want === '40' ? '50' : '40'))
    const zs = await step(`${name}.3 讀本體的 z-index`, async () => {
      const zs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][data-state="open"]')].map((d) => getComputedStyle(d).zIndex))
      if (zs.length !== 1) throw new Error(`開著的 [role=dialog] 有 ${zs.length} 個(要正好 1 個)—— 量不到是哪一個`)
      return zs
    })
    rec(zs[0] === want, `${label} z-index = ${want}`, `量到 ${zs[0]}`)
  })
}

await browser.close()
await server.stop()
finish()

function finish() {
  if (instrumentFails.length) {
    console.log(`✗ ${'INSTRUMENT-FAIL'}:${instrumentFails.length} 個情境沒量到 —— 不是產品裁決,但這次不能宣稱層級正確${SELFTEST ? ',也不能宣稱對照組紅得對' : ''}:`)
    for (const f of instrumentFails) console.log(`  · 情境 ${f.scenario}:${f.detail}`)
  }
  if (SELFTEST) {
    // S-ctl 每一條都是「必須紅才算綠」的斷言 → 不得有任何一條紅;S 本身(現況)也必須綠
    const staticOk = !redBy['S-ctl'] && !redBy.S
    const MUST = STATIC_ONLY ? [] : ['A', 'B', 'C1', 'C2', ...D_STORIES.map(([n]) => n), ...E_STORIES.map(([n]) => n)]
    const caught = MUST.filter((s) => (redBy[s] ?? 0) > 0)
    const ok = staticOk && caught.length === MUST.length && instrumentFails.length === 0
    console.log(ok
      ? `✓ selftest:靜態對照組各自紅在該紅的檢查${MUST.length ? `、Toast 釘回 999999999 時 A / B 紅、壓到 44 時 C1 / C2 紅、拿掉列的 isolation 時 D1–D5 紅、本體 z 互換時 E1–E3 紅` : ''} —— 量具有效`
      : `✗ selftest:對照組沒被抓到(靜態 ${staticOk ? '有效' : '無效'};紅的情境 ${caught.join(' / ') || '無'},該紅 ${MUST.join(' / ') || '—'})`)
    process.exit(ok ? 0 : 1)
  }
  const red = failed > 0 || instrumentFails.length > 0
  console.log(red
    ? `✗ layer-order ${failed} 條失敗、${instrumentFails.length} 個情境沒量到`
    : `✅ layer-order PASS(全 DS z 值都在層級表上、表不過期且順序成立${STATIC_ONLY ? '' : ';提示蓋在 Toast 上、Toast 蓋在 Dialog 與代理蓋板上、用變數疊放的頭像 / Tag 都被那一列圈住、並存 modal 本體 z-40'})`)
  process.exit(red ? 1 : 0)
}
