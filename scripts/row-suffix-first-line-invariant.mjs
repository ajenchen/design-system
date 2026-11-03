#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 列上的小圖形(列尾行內動作 / 收合箭頭 / 關閉鈕 / 開關 / 列首轉圈 / 月曆上下月箭頭 / 快捷鍵後綴 / Alert・Toast 的前置狀態圖示與
 *         右側操作區的動作鈕・分隔線・×)的中線,等於同一列**第一行文字**的中線
 *         (item-anatomy.spec.md「Suffix 一律 `h-[1lh]` inline 對齊第一行 label」與「24px 閾值對齊規則」;Alert / Toast 經共用底座 Notice
 *         消費同一套規則,notice.spec.md「Layout」)。量的是**中線本身**
 *         (getBoundingClientRect),不讀 class、不看它是不是某個 primitive(M37);Sidebar 群組動作與收合箭頭量 sm / md / lg,
 *         每一則都量標準與寬鬆兩種密度。
 *   紅: 任一處圖示中線與第一行文字中線差超過 1px → 指名「哪一種東西、哪一列的字、哪個尺寸 / 密度、差幾 px」並 exit 1
 *       (例:2026-10-27 前的 SidebarGroupAction「所有專案」md 標準 −8.0、寬鬆 −10.0;Notice 若被改成「外框 items-center、槽不是一行高」,
 *       有說明的 Alert / Toast 圖示、動作鈕、× 會一起落到「標題 + 說明」整塊正中 = +11.5)。某一則該量到的東西少於下限、
 *       或全域密度沒有真的套上 = 儀器失效(INSTRUMENT-FAIL),exit 1,不讀成通過。
 *       `--selftest` 四種對照組:(a) 判定函式吃 2026-10-27 實測的錯誤數字必紅、正確數字必綠;(b) 頁面上把群組動作打回舊寫法
 *       (`position:absolute; top:8px` 掛在群組盒上)→ 每一個 SidebarGroupAction 都必須紅、其他東西不得被牽連;
 *       (c) 頁面上把每一個被量的東西往下推 3px → 每一處都必須紅,而且每一處量到的位移都必須是 3px(±0.25)(證明每條量測路徑都活著)。
 *       位移加在**被量的那顆控件本身**(`translate` 屬性先於 `transform` 套用,不會被自己的旋轉帶走),量之前把無限循環的動畫
 *       (轉圈)停在四分之一圈 —— 2026-10-27 第一版把位移加在轉圈裡的 svg 上,跟著父層一起轉,量到 3·cos θ,一半機率不紅
 *       (CI 必過檢查跟著隨機紅);停在 θ = 90° 讓那種錯每次都現形(位移 0),不是看運氣。
 *       (d) 頁面上把 Notice 打回置中(外框 items-center、圖示槽 / 右側槽不再是一行高)→ 多行通知的每一處都必須紅(往下 ≥ 5px)、
 *       其他東西不得被牽連 —— 這是 Alert / Toast 最可能的漂移方式(與 Dialog 標題區、修前的手刻示範列同一種寫法)。
 *   綠: 每一處差 ≤ 1px、每一則都量到下限以上的數量、密度讀回正確時綠。
 *
 * 出處:2026-10-27 user 原話「sidebar的展示“群組動作”為何群組標題'所有專案'右邊的那個‘+'偏上？？？看起來完全沒有遵循 item anatomy 的layout原則啊？
 * 而且右側放展開箭頭的群組標題反而看起來是正常的欸？到底root cause是什麼？？是否有其它地方也有類似錯誤？？？？到底為何會漂移？？請確保你知道我說啥」。
 * 根因:SidebarGroupAction 不在標題列裡,`absolute top-2` 掛在整個群組盒上(上緣貼齊標題列上緣,不是中線對齊文字),
 * 五個半月沒有任何量具量「圖示中線 vs 第一行文字中線」—— inline-action-hand-craft 只看是不是 primitive、visual-audit 的 sharesRow
 * 只看圖示中線落不落在列的上下緣之間(144 落在 136–168 照樣綠)。同族(同一個性質被別的寫法違反)一併納入:Switch 帶文字標籤
 * (`h-[1lh]` 的 1lh 取到外層字級,+1.5)、四則手刻 `items-center` 的示範列(+7.8 ~ +8.1)、Slider 原則頁 Switch 狀態矩陣
 * (`w-16` 小標換成兩行,開關落在兩行正中,+7.8)、DropdownMenu「元件檢閱器」預覽列的快捷鍵(槽上寫 text-caption,1lh 取 caption 行高,−1.3);
 * 目前為 0 但寫法同族的
 * SidebarMenuAction / 列尾 inlineActions / DateGrid 上下月箭頭也量,之後漂了會紅。
 *
 * 2026-11-04 納入 Alert / Toast(n1)。user 2026-10-28 原話(session 1920833e,2026-10-28T08:38:20Z):
 * 「此外,我想知道 alert和toast之類的元件的ssot
 * 到底第一行文字有沒有跟前後元素在視覺上垂直置中？
 * 這裡到底是不是要按照 item anatomy 的 layout 原則？
 * 當初是怎麼定義的？到底有沒有漂移？
 * 確保沒有漂，且有ssot且不改壞任何原本好的地方」
 * 實測(108a736f 與已發布 beta.147):圖示、動作鈕、分隔線、× 對標題那一行全部 0.0px,notice.tsx 28 個版本都是「外框 items-start +
 * 兩個 h-[1lh] 槽」,沒有漂移;但沒有任何閘量這個性質(Alert / Toast 只有像素基準圖,比的是「跟上次一樣」)。Alert 與 Toast 不覆寫 Notice
 * 的對齊,所以 Alert 兩則(低調 / 實心 × 五色帶說明、右上操作群組帶分隔線與 ×)+ 真的 sonner Toast 一則,就量到 Notice 第一行上會出現的
 * 每一種東西(狀態圖示、文字動作鈕、純圖示動作鈕、分隔線、×)與 Alert / Toast 的每一種外殼(低調、實心兩層、Toast 三層)。
 * Alert / Toast 的「第一行文字」= 通知容器裡第一段不在按鈕裡的文字(= 標題,單行截斷):不能沿用下面的「往上找」——
 * × 往上第一個有字的祖先是右側槽,會先找到同一槽裡動作鈕的字(突變實測:改回往上找,Toast 的分隔線與 × 拿「查看」當第一行,
 * 主跑照綠、selftest (c)(d) 紅 —— 這條錯只有對照組抓得到)。
 *
 * 第一行文字中線:從圖示往上找,第一個「裝著別的文字」的祖先裡的第一段文字(圖示自己那顆控件、sr-only、aria-hidden 不算);
 * 該段文字最近的區塊盒(display 不是 inline / contents)的內容框上緣 + 行高 / 2。文字是置中 flex 容器裡的匿名項目時改用字形框中線。
 * 兩者都算,字形框中線與行盒中線差 > 3px 也算儀器失效(代表第一行不在那個盒子頂端,算法不適用)。
 *
 * Run: `node scripts/row-suffix-first-line-invariant.mjs [--static=<dir>] [--selftest] [--themes=light,dark] [--json=<file>]`
 * (預設讀 `storybook-static`;CI 只跑淺色 —— 幾何與主題無關,`--themes=light,dark` 給報告用)
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER,
  openStory,
  StoryRenderInstrumentError,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const staticArg = arg('static')
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const THEMES = (arg('themes') ?? 'light').split(',')
const DENSITIES = ['md', 'lg'] // 標準 / 寬鬆(Storybook 全域 density)
const JSON_OUT = arg('json')
const TOL = 1 // px;字形框與行盒的字型誤差實測 ≤ 0.6

// ── 量哪裡 ──
// kind → 頁面上的找法(見 measurePage 的 FIND);min = 每一種密度至少要量到幾個(少了 = 儀器失效,不是通過)
const TARGETS = [
  { id: 'design-system-components-sidebar-展示--group-action', min: { 'group-action': 1 } },
  { id: 'design-system-components-sidebar-設計規格--size-matrix', min: { 'group-action': 3, 'group-chevron': 3 } },
  { id: 'design-system-components-sidebar-展示--mixed-content', min: { 'group-chevron': 1, 'menu-inline-action': 1 } },
  { id: 'design-system-components-sidebar-展示--action-hover-state', min: { 'menu-action': 1 } },
  { id: 'design-system-components-switch-展示--with-label', min: { 'switch-label': 1 } },
  { id: 'design-system-components-switch-設計規格--label-integration', min: { 'switch-label': 3 } },
  { id: 'design-system-patterns-item-anatomy--inline-action-hover-state', min: { 'hover-target': 1 } },
  { id: 'design-system-components-button-展示--dismiss-hover-state', min: { 'hover-target': 1 } },
  { id: 'design-system-patterns-item-anatomy--icon-action-primitive-decision', min: { 'item-suffix-row': 8 } },
  { id: 'design-system-components-progressbar-設計原則--usage-guidance', min: { 'row-spinner': 1 } },
  { id: 'design-system-components-slider-設計原則--position-as-state-rule', min: { 'state-switch': 4 } },
  { id: 'design-system-internal-dategrid-展示--single', min: { 'month-nav': 2 } },
  { id: 'design-system-components-dropdownmenu-設計規格--inspector', min: { 'menu-shortcut': 2 } },
  // Alert / Toast(共用底座 Notice),全部是多行(標題 + 說明):低調 / 實心 × 五色(neutral 沒有狀態圖示)、右上操作群組(重新整理 / 分享 / 分隔線 / ×)
  { id: 'design-system-components-alert-展示--with-description', min: { 'notice-prefix': 8, 'notice-suffix': 10 } },
  { id: 'design-system-components-alert-展示--corner-action-group', min: { 'notice-prefix': 1, 'notice-suffix': 4 } },
  // 真的 sonner Toast:按「匯入資料」打開一則(warning,標題 + 說明 + 查看 + 分隔線 + ×);只開一則 —— 堆疊中的後幾則被縮放,位移量不等於 3
  { id: 'design-system-components-toast-展示--interactive', min: { 'notice-prefix': 1, 'notice-suffix': 3 }, waitFor: ['button', '匯入資料'], openToast: '匯入資料' },
]
const KIND_NAME = {
  'group-action': 'SidebarGroupAction(群組標題列尾)',
  'group-chevron': '可收合群組的展開箭頭',
  'menu-inline-action': 'SidebarMenuButton 列尾 inlineActions',
  'menu-action': 'SidebarMenuAction',
  'switch-label': 'Switch 帶文字標籤',
  'hover-target': '列尾動作(示範列)',
  'item-suffix-row': '列尾動作群(ItemSuffix 示範列)',
  'row-spinner': '列首轉圈(示範列)',
  'state-switch': 'Switch 狀態矩陣(小標 + 樣本)',
  'month-nav': 'DateGrid 上 / 下月箭頭',
  'menu-shortcut': '快捷鍵後綴(DropdownMenu 元件檢閱器的預覽列)',
  'notice-prefix': 'Alert / Toast 前置狀態圖示',
  'notice-suffix': 'Alert / Toast 右側操作區',
}

/** 頁面端:找出每一個要量的圖示,量它的中線與同一列第一行文字的中線。sabotage:'shift' = 量之前把每個被量的控件往下推 3px(對照組 c) */
function measurePage({ kinds, sabotage }) {
  // Alert / Toast 的通知容器:Alert 根(role=status / alert;Toaster 的 sr-only 朗讀區不算)或 Toast 的視覺層
  const NOTICE_HOST = '[role="status"]:not(.sr-only), [role="alert"]:not(.sr-only), [data-toast-visual-content]'
  const noticeParts = (pick) => [...new Set([...document.querySelectorAll(NOTICE_HOST)].flatMap(pick))]
  const FIND = {
    'group-action': () => [...document.querySelectorAll('[data-sidebar="group-action"]')],
    // 收合箭頭 = 標題列裡帶 aria-expanded 的那顆(Collapsible.Trigger);群組動作也住同一個列尾槽,不能用「標題列裡的 button」代替
    'group-chevron': () => [...document.querySelectorAll('[data-sidebar="group-label"] button[aria-expanded]')],
    'menu-inline-action': () => [...document.querySelectorAll('[data-sidebar="menu-inline-actions"] button')],
    'menu-action': () => [...document.querySelectorAll('[data-sidebar="menu-action"]')],
    'switch-label': () => [...document.querySelectorAll('label button[role="switch"]')],
    'hover-target': () => [...document.querySelectorAll('[data-visual-hover-target]')],
    // 「同一列只放同一類圖示動作」那三列(✅ / ✅ / ❌):2026-10-28 稽核 L061 把說明移到列下方的 ExampleCaption(<p>),
    // 列 = 那段說明的前一個兄弟元素(檔案列 FileItem / 精簡列 ItemContent + ItemSuffix)
    'item-suffix-row': () => [...document.querySelectorAll('p')]
      .filter((p) => /^(✅ 都用 Button xs iconOnly|✅ 精簡列|❌ 禁止混 Inline Action)/.test(p.textContent.trim()))
      .flatMap((p) => [...(p.previousElementSibling?.querySelectorAll('button') ?? [])]),
    'row-spinner': () => [...document.querySelectorAll('[aria-label="驗證信用卡中"]')],
    // Slider 原則頁「對照 Switch」那四格(Rest / Disabled × ON / OFF):小標 + 開關樣本
    'state-switch': () => [...document.querySelectorAll('button[role="switch"][aria-label^="啟用（"]')],
    'month-nav': () => [...document.querySelectorAll('button[aria-label="上一個月"], button[aria-label="下一個月"]')],
    // 預覽列的快捷鍵:字以 ⌘ 開頭、自己沒有子元素的那個 span(修前它就是槽本身,修後是槽裡的 caption 字)
    'menu-shortcut': () => [...document.querySelectorAll('span')].filter((s) => !s.children.length && /^⌘/.test(s.textContent.trim())),
    // 前置狀態圖示 = 容器裡不在按鈕 / 分隔線裡的 svg;右側操作區 = 每一顆按鈕(endContent 與 ×)與 Notice 自動放的分隔線
    'notice-prefix': () => noticeParts((c) => [...c.querySelectorAll('svg')].filter((s) => !s.closest('button, [data-action-divider]'))),
    'notice-suffix': () => noticeParts((c) => [...c.querySelectorAll('button, [data-action-divider]')]),
  }
  const isNotice = (kind) => kind.startsWith('notice-')
  const SKIP = '.sr-only, [aria-hidden="true"], svg, table'
  const out = []
  const errors = []
  // 對照組 c:無限循環的動畫(轉圈)停在四分之一圈。位移若錯加在旋轉中的子元素上,θ = 90° 時量到 3·cos 90° = 0 → 必定抓得到
  let spun = 0
  if (sabotage === 'shift') {
    for (const a of document.getAnimations()) {
      const timing = a.effect?.getComputedTiming?.()
      if (timing?.iterations === Infinity && Number.isFinite(timing.duration) && timing.duration > 0) { a.pause(); a.currentTime = timing.duration / 4; spun++ }
    }
  }
  // 對照組 d:把 Notice 打回「外框 items-center、槽不包一行高」(研究對照組 C1 / Dialog 標題區的寫法)。只動這一則要量的通知
  if (sabotage === 'notice-center' && kinds.some(isNotice)) {
    for (const host of kinds.filter(isNotice).flatMap((k) => FIND[k]())) {
      const slot = host.parentElement
      slot.style.height = 'auto'
      slot.parentElement.style.alignItems = 'center'
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100
  /** 從 host 往上找第一個裝著別的文字的祖先,回第一段文字節點 */
  const firstTextNear = (host) => {
    for (let a = host.parentElement; a && a !== document.body; a = a.parentElement) {
      const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (!n.textContent.trim() || host.contains(n) || n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      })
      const t = w.nextNode()
      if (t) return t
    }
    return null
  }
  /** Alert / Toast:容器裡第一段不在按鈕裡的文字(= 標題)。sr-only / aria-hidden / svg 同樣不算 */
  const firstTextIn = (root) => {
    if (!root) return null
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (!n.textContent.trim() || n.parentElement.closest(`${SKIP}, button`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    })
    return w.nextNode()
  }
  const sizeOf = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const m = /^size\s*=\s*"(sm|md|lg)"$/.exec(a.firstElementChild?.textContent?.trim() ?? '')
      if (m) return m[1]
    }
    return null
  }
  for (const kind of kinds) {
    for (const host of FIND[kind]()) {
      // 分隔線量畫出來的那條線(內層);外層是撐滿槽高的佔位
      const iconEl = host.matches('[role="switch"]') ? host
        : host.matches('[data-action-divider]') ? (host.firstElementChild ?? host)
        : (host.querySelector('svg') ?? host)
      // 位移加在控件本身(host),不加在裡面的 svg:轉圈的旋轉就在 host 上,`translate` 屬性先於 `transform` 套用 → 位移方向不跟著轉;
      // 加在 svg 上則位移在旋轉後的座標裡,量到 3·cos θ(2026-10-27 審查 V1)。關過渡:失敗記憶索引「量…不等 transition」同一個坑。
      // 疊在既有的 translate 上,不蓋掉它:Tailwind v4 的 `-translate-y-1/2` 寫的就是 `translate` 屬性(SidebarMenuAction 的置中),
      // 直接設 '0 3px' 會連置中一起拿掉、量到 11px(由「每處位移必須正好 3px」那一條抓到)
      if (sabotage === 'shift') {
        const [tx = '0px', ty = '0px', tz] = getComputedStyle(host).translate === 'none' ? [] : getComputedStyle(host).translate.split(' ')
        host.style.transition = 'none'
        host.style.translate = `${tx} calc(${ty} + 3px)${tz ? ` ${tz}` : ''}`
        void host.offsetHeight
      }
      const ir = iconEl.getBoundingClientRect()
      if (ir.width === 0 || ir.height === 0) { errors.push(`${kind}:圖示沒有尺寸(display:none?)`); continue }
      const t = isNotice(kind) ? firstTextIn(host.closest(NOTICE_HOST)) : firstTextNear(host)
      if (!t) { errors.push(`${kind}:找不到同一列的文字`); continue }
      let b = t.parentElement
      while (b && ['inline', 'contents'].includes(getComputedStyle(b).display)) b = b.parentElement
      const cs = getComputedStyle(b)
      const br = b.getBoundingClientRect()
      const i0 = t.textContent.search(/\S/)
      const rg = document.createRange(); rg.setStart(t, i0); rg.setEnd(t, i0 + 1)
      const g = rg.getClientRects()[0]
      const glyphC = g.top + g.height / 2
      const lh = parseFloat(cs.lineHeight)
      const anonymousInCenteredFlex = t.parentElement === b && /flex|grid/.test(cs.display) && /center/.test(cs.alignItems)
      const lineC = Number.isFinite(lh) && !anonymousInCenteredFlex
        ? br.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) + lh / 2
        : glyphC
      const iconC = ir.top + ir.height / 2
      // Alert / Toast:是哪一顆(同一則通知有好幾處),以及這則通知的文字有幾行(對照組 d 只要求多行的紅)
      const part = !isNotice(kind) ? null
        : host.matches('[data-action-divider]') ? '分隔線' : host.matches('svg') ? '狀態圖示'
          : (host.getAttribute('aria-label') || host.textContent.trim().slice(0, 8))
      const lines = isNotice(kind) && Number.isFinite(lh) ? Math.round(b.parentElement.getBoundingClientRect().height / lh) : null
      out.push({
        kind,
        part,
        lines,
        text: t.textContent.trim().slice(0, 16),
        size: sizeOf(host),
        iconH: r2(ir.height),
        lineC: r2(lineC),
        glyphC: r2(glyphC),
        iconC: r2(iconC),
        delta: r2(iconC - lineC),
        deltaGlyph: r2(iconC - glyphC),
        lineVsGlyph: r2(Math.abs(lineC - glyphC)),
      })
    }
  }
  return { out, errors, spun, density: document.documentElement.dataset.density ?? null, theme: document.documentElement.dataset.theme ?? null }
}

/** 判定(純函式,selftest 直接吃數字):回 { ok, why } */
export function judgeProbe(p, tol = TOL) {
  if (p.lineVsGlyph > 3) return { ok: false, instrument: true, why: `字形框與行盒中線差 ${p.lineVsGlyph}px —— 第一行不在區塊盒頂端,算法不適用` }
  if (Math.abs(p.delta) > tol) return { ok: false, why: `圖示中線 ${p.delta > 0 ? '低' : '高'} ${Math.abs(p.delta)}px(容差 ${tol})` }
  return { ok: true, why: `差 ${p.delta}` }
}

const label = (t, p, density, theme) => `${KIND_NAME[p.kind]}${p.part ? `(${p.part})` : ''}「${p.text}」${p.size ? ` size=${p.size}` : ''} 密度=${density === 'md' ? '標準' : '寬鬆'}${theme !== 'light' ? ` ${theme}` : ''} @ ${t.id.replace('design-system-', '')}`

// 每一種東西的「等它本身出現」:[選擇器, 文字開頭(可省)]
const WAIT_FOR = {
  'group-action': ['[data-sidebar="group-action"]'], 'group-chevron': ['[data-sidebar="group-label"] button[aria-expanded]'],
  'menu-inline-action': ['[data-sidebar="menu-inline-actions"]'], 'menu-action': ['[data-sidebar="menu-action"]'],
  'switch-label': ['label button[role="switch"]'], 'hover-target': ['[data-visual-hover-target]'],
  'item-suffix-row': ['p', '✅ 精簡列'], 'row-spinner': ['[aria-label="驗證信用卡中"]'],
  'state-switch': ['button[role="switch"][aria-label^="啟用（"]'], 'month-nav': ['button[aria-label="下一個月"]'],
  'menu-shortcut': ['span', '⌘'],
  'notice-prefix': ['[role="status"]:not(.sr-only) svg, [role="alert"]:not(.sr-only) svg'],
}

// Toast 要按觸發鈕才出現:按 story 根節點裡那顆(iframe 裡還有 Storybook 自己的按鈕),等 sonner 掛好的 Toast 本身出現,
// 再把滑鼠移到它上面 —— sonner 滑過時暫停自動關閉的計時(含 action 預設 10 秒),量的時候不會被收走。等不到 = 儀器失效
const TOAST_EL = '[data-sonner-toast][data-mounted="true"] [data-toast-visual-content]'
async function openToast(p, name, storyId) {
  try {
    await p.locator('#storybook-root').getByRole('button', { name, exact: true }).click({ timeout: 15_000 })
    const el = p.locator(TOAST_EL).first()
    await el.waitFor({ state: 'visible', timeout: 15_000 })
    await el.hover({ timeout: 15_000 })
  } catch (error) {
    throw new StoryRenderInstrumentError({ storyId, kind: 'open-toast', reason: `按「${name}」後等不到 Toast 本身(${String(error?.message ?? error).split('\n')[0]})` })
  }
}

async function runPages(page, sv, sabotage) {
  const rows = []
  const instrument = []
  let spun = 0
  for (const theme of THEMES) for (const density of DENSITIES) for (const t of TARGETS) {
    const kinds = Object.keys(t.min)
    const url = `${sv.origin}/iframe.html?id=${encodeURIComponent(t.id)}&viewMode=story&globals=${encodeURIComponent(`theme:${theme};density:${density}`)}`
    let res
    try {
      res = await openStory(page, url, {
        settleFrames: 10,
        notFound: sv.notFound,
        // 等「要量的那個東西本身」出現(M32 第四題),不靠固定睡眠
        waitFor: ([sel, text]) => [...document.querySelectorAll(sel)].some((e) => !text || e.textContent.trim().startsWith(text)),
        waitForArg: t.waitFor ?? WAIT_FOR[kinds[0]],
        beforeSettle: t.openToast || sabotage?.css ? async (p) => {
          if (t.openToast) await openToast(p, t.openToast, t.id)
          if (sabotage?.css) await p.addStyleTag({ content: sabotage.css })
        } : null,
        probe: measurePage,
        probeArg: { kinds, sabotage: sabotage?.page ?? null },
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrument.push(`${t.id}(${theme} / ${density}):${error.message}`)
      continue
    }
    const m = res.probe
    spun += m.spun
    if (m.density !== density || m.theme !== theme) instrument.push(`${t.id}:全域沒有套上(要 ${theme}/${density},讀回 ${m.theme}/${m.density})`)
    for (const e of m.errors) instrument.push(`${t.id}(${density}):${e}`)
    for (const kind of kinds) {
      const n = m.out.filter((p) => p.kind === kind).length
      if (n < t.min[kind]) instrument.push(`${t.id}(${theme} / ${density}):${KIND_NAME[kind]} 只量到 ${n} 個(下限 ${t.min[kind]})`)
    }
    for (const p of m.out) {
      const j = judgeProbe(p)
      if (j.instrument) instrument.push(`${label(t, p, density, theme)}:${j.why}`)
      rows.push({ ...p, story: t.id, density, theme, ok: j.ok, why: j.why, label: label(t, p, density, theme) })
    }
  }
  return { rows, instrument, spun }
}

// ── selftest (a):判定函式吃實測數字(2026-10-27,a6390356 建置,md 標準 / 寬鬆;sga-W 全庫掃描與本閘第一版)──
const JUDGE_TABLE = [
  ['SidebarGroupAction md 標準(修前)', { delta: -8, lineVsGlyph: 0.59 }, false],
  ['SidebarGroupAction md 寬鬆(修前)', { delta: -10, lineVsGlyph: 0.59 }, false],
  ['SidebarGroupAction sm 標準(修前推算 −(28 − 16) ÷ 2)', { delta: -6, lineVsGlyph: 0.59 }, false],
  ['Switch 帶標籤(修前,外層 16/24)', { delta: 1.5, lineVsGlyph: 0.4 }, false],
  ['手刻 items-center 示範列(修前)', { delta: 7.8, lineVsGlyph: 0.3 }, false],
  ['可收合箭頭(現況)', { delta: 0, lineVsGlyph: 0.59 }, true],
  ['字型誤差內', { delta: 0.6, lineVsGlyph: 0.6 }, true],
  ['第一行不在盒頂(算法不適用)', { delta: 0, lineVsGlyph: 9 }, false],
  // Alert / Toast(2026-11-04 n1;delta 取研究 notice-alignment/measure.md 第六節對照組實測,lineVsGlyph 取本閘在 108a736f 建置的實測 0)
  ['Alert / Toast 圖示、動作鈕、×(現況,多行)', { delta: 0, lineVsGlyph: 0 }, true],
  ['Notice 打回手刻 items-center(研究對照組 C1,標題 + 一行說明)', { delta: 11.5, lineVsGlyph: 0 }, false],
  ['× 往下推 2px(研究對照組 C2)', { delta: 2, lineVsGlyph: 0 }, false],
]

// ── selftest (b)(c):頁面破壞 ──
const PAGE_SABOTAGE = [
  ['群組動作打回 2026-10-27 前的寫法(absolute top:8px,掛在群組盒上)', {
    css: '[data-sidebar="group-action"]{position:absolute!important;top:8px!important;right:var(--layout-space-loose)!important}',
  }, (res) => {
    const ga = res.rows.filter((r) => r.kind === 'group-action')
    const others = res.rows.filter((r) => r.kind !== 'group-action')
    return ga.length > 0 && ga.every((r) => !r.ok) && others.every((r) => r.ok)
  }],
  // 每一處都要紅,而且量到的位移必須正好是 3(±0.25):只看「紅」的話,3·cos θ 落在 1–3 之間照樣紅,看不出量具在某些角度失靈;
  // 另要求確實有轉圈被停在四分之一圈(ProgressBar 原則頁的列首轉圈),否則「旋轉中的圖示」這一面沒有被驗到
  ['每一個被量的控件往下推 3px(轉圈停在四分之一圈)', { page: 'shift' }, (res, base) => res.spun > 0 && res.rows.length > 0 && res.rows.length === base.rows.length
    && res.rows.every((r, i) => !r.ok && r.label === base.rows[i].label && Math.abs(r.delta - base.rows[i].delta - 3) <= 0.25)],
  // 多行通知的每一處都要紅、而且往下(≥ 5px;標題 + 一行說明實測 +11.5);單行通知與其他東西照舊綠 —— 只看「有紅」的話,把整頁弄壞也會過
  ['Notice 打回置中(外框 items-center、圖示槽 / 右側槽不再是一行高)', { page: 'notice-center' }, (res, base) => {
    const multi = (i) => base.rows[i].kind.startsWith('notice-') && base.rows[i].lines >= 2
    return base.rows.some((_, i) => multi(i)) && res.rows.length === base.rows.length
      && res.rows.every((r, i) => r.label === base.rows[i].label && (multi(i) ? !r.ok && r.delta >= 5 : r.ok))
  }, (res, base) => res.rows.map((r, i) => ({ r, moved: base.rows[i] ? Math.round((r.delta - base.rows[i].delta) * 100) / 100 : null }))
    .filter(({ r }, i) => (base.rows[i]?.kind.startsWith('notice-') && base.rows[i].lines >= 2) ? (r.ok || r.delta < 5) : !r.ok)],
]

// ── 跑 ──
const problems = []
if (SELFTEST) {
  for (const [name, p, expectOk] of JUDGE_TABLE) {
    const j = judgeProbe(p)
    if (j.ok === expectOk) console.log(`✓ 對照組 (a):${name} → ${expectOk ? '綠' : '紅'}(${j.why})`)
    else problems.push(`對照組 (a):${name} 應${expectOk ? '綠' : '紅'},實得 ${j.ok ? '綠' : '紅'}(${j.why})`)
  }
}

// 被量的元件與每一則 story 的原始檔都列進來:示範列的修正只在 story 檔裡,漏列 = 量到舊建置還以為是新的
requireFreshStorybookBuild(S, [
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.stories.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.anatomy.stories.tsx',
  'packages/design-system/src/components/Switch/switch.tsx',
  'packages/design-system/src/components/Switch/switch.stories.tsx',
  'packages/design-system/src/components/Switch/switch.anatomy.stories.tsx',
  'packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx',
  'packages/design-system/src/patterns/element-anatomy/item-anatomy.stories.tsx',
  'packages/design-system/src/components/Button/button.stories.tsx',
  'packages/design-system/src/components/ProgressBar/progress-bar.principles.stories.tsx',
  'packages/design-system/src/components/Slider/slider.principles.stories.tsx',
  'packages/design-system/src/components/DateGrid/date-grid.tsx',
  'packages/design-system/src/components/DateGrid/date-grid.stories.tsx',
  'packages/design-system/src/components/DropdownMenu/dropdown-menu.anatomy.stories.tsx',
  'packages/design-system/src/components/Notice/notice.tsx',
  'packages/design-system/src/components/Alert/alert.tsx',
  'packages/design-system/src/components/Alert/alert.stories.tsx',
  'packages/design-system/src/components/Toast/toast.tsx',
  'packages/design-system/src/components/Toast/toast.stories.tsx',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: { width: 1280, height: 900 } })
const finish = async (code) => { await br.close(); await sv.stop(); process.exit(code) }

const base = await runPages(page, sv, null)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(base.rows, null, 1))
if (!SELFTEST) {
  // 先把量到的每一處印出來(儀器失效時也印,讓「哪幾則量到了、量到多少」看得見),再判
  for (const r of base.rows) console.log(`${r.ok ? '✓' : '✗'} ${r.label}:${r.why}`)
  const bad = base.rows.filter((r) => !r.ok)
  if (bad.length) problems.push(`${bad.length} 處圖示中線沒有對齊第一行文字:\n    ${bad.map((r) => `${r.label}:${r.why}`).join('\n    ')}`)
}
if (base.instrument.length) {
  console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(沒量到 ≠ 沒有錯):\n  ${base.instrument.join('\n  ')}`)
  if (problems.length) console.log(`\n✗ 列上圖示對齊第一行文字:\n  ${problems.join('\n  ')}`)
  await finish(1)
}
if (SELFTEST) {
  // 前提:未破壞的頁面本身全綠(否則對照組紅了也不代表什麼)
  const baseBad = base.rows.filter((r) => !r.ok)
  if (baseBad.length) problems.push(`前提不成立:未破壞的頁面就有 ${baseBad.length} 處不符(${baseBad[0].label})`)
  for (const [name, sabotage, isRed, explain] of PAGE_SABOTAGE) {
    const run = await runPages(page, sv, sabotage)
    if (run.instrument.length) { console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(對照組「${name}」):\n  ${run.instrument.join('\n  ')}`); await finish(1) }
    const red = run.rows.filter((r) => !r.ok)
    if (isRed(run, base)) console.log(`✓ 對照組「${name}」→ ${red.length} / ${run.rows.length} 處紅${red[0] ? `(例:${red[0].label}:${red[0].why})` : ''}`)
    else {
      // 位移不是 3 的(例:旋轉中的圖示量到 3·cos θ)逐一列出,不只列「沒紅的」
      const off = explain ? explain(run, base) : run.rows.map((r, i) => ({ r, moved: base.rows[i] ? Math.round((r.delta - base.rows[i].delta) * 100) / 100 : null }))
        .filter(({ r, moved }) => r.ok || moved === null || Math.abs(moved - 3) > 0.25)
      problems.push(`對照組「${name}」沒有讓指定的量測紅(紅 ${red.length} / ${run.rows.length},基準 ${base.rows.length} 處,停住的轉圈 ${run.spun})—— 量具無效;`
        + `不符的:${off.slice(0, 8).map(({ r, moved }) => `${r.label}(${r.why}${moved === null ? '' : `,位移 ${moved}`})`).join(' / ')}`)
    }
  }
}
if (problems.length) {
  console.log(`\n✗ ${SELFTEST ? 'selftest' : '列上圖示對齊第一行文字'}:\n  ${problems.join('\n  ')}`)
  await finish(1)
}
console.log(SELFTEST
  ? '\n✓ selftest:判定表、群組動作打回舊寫法、控件整體下移 3px(含停在四分之一圈的轉圈)、Notice 打回置中四種對照組各自讓閘紅 —— 量具會紅'
  : `\n✅ 列上圖示對齊第一行文字:${TARGETS.length} 則 story × ${THEMES.length * DENSITIES.length} 種主題 / 密度,共 ${base.rows.length} 處全部 ≤ ${TOL}px`)
await finish(0)
