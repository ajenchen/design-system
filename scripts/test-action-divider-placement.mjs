#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: action region 分隔線的結構契約 —— 兩個基座(浮層標題列 / Notice)有條件地自動放 ButtonDivider、共用基座的消費端不再自刻、
 *         不手刻分隔線、線長由「該列最高元件 − inset」公式算出、inset 只在 button-group.tsx 宣告一次且 = 0.5rem(8px)
 *   紅: 把 inset 改成別的值、宣告兩次、地板寫死常數、拿掉「有其他操作才畫」的條件、Alert 自己再放一條 → 指名該檔並 exit 1;
 *       --selftest 在記憶體裡逐一注入這五種(不寫檔),每一種都必須紅且指名
 *   綠: 現行原始碼必綠;純讀檔比對,不開瀏覽器、不量時間,重跑結果不變
 *
 * test-action-divider-placement.mjs — 分隔線「落點歸 DS」的結構防線。
 *
 * 語意 SSOT = patterns/action-bar/action-bar.spec.md 第五節(四個理由)。
 * 語意本身(功能域切換是否成立)無法從程式碼判定,本檔只鎖**結構可判定**的三件事:
 *
 *  (1) 誤觸保護的分隔線由元件自動放,不是 consumer 自刻 —— 浮層標題列(SurfaceHeader)/ Notice 家族兩個基座
 *      必須各自渲染 ButtonDivider,且渲染條件是「有其他操作 && 有關閉鈕」。
 *      少了條件 = 只有關閉鈕時也畫線(規範明訂不加);少了渲染 = consumer 又得自刻(漂移根因)。
 *  (2) Alert 與 Toast 共用同一基座,因此不得任一方自己再放一條(會變兩條)。
 *  (3) 分隔線元件本身不得手刻 —— 禁止 `w-px` / `h-px` 的裸 div 充當 action region 分隔線,
 *      必須用 <Separator> 或 <ButtonDivider>(M23(d) 消費既有 primitive)。
 *
 * Anchor(2026-08-06):Alert 規範要求 action 與關閉鈕之間有分隔線,Toast 規範卻完全沒提,
 * 兩者共用 Notice 基座與同一顆關閉鈕 —— 同結構卻行為分歧。改為基座自動放後,本檔鎖住它。
 *
 * 執行面(2026-11-11 接進 CI verify-static):token「3全收」把分隔線 inset 收回成 ButtonDivider 的元件內變數之後,
 * scripts/overlay-header-actions-invariant.mjs 改用規格值 8px 量線長、並指名「元件那一份由本檔鎖住」—— 但本檔當時只在
 * 夜間 harness(governance-harnesses.yml,非必過)跑,也沒有對照組。M37「閘存在 = 檔案存在」;現在由 PR 必過的 CI 呼叫。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const readDisk = rel => readFileSync(join(ROOT, rel), 'utf8')

const BUTTON_GROUP = 'packages/design-system/src/components/Button/button-group.tsx'
const NOTICE = 'packages/design-system/src/components/Notice/notice.tsx'
const ALERT = 'packages/design-system/src/components/Alert/alert.tsx'

// ── (1) 兩個基座都要「有條件地」自動放分隔線 ─────────────────────────────
const AUTO_PLACERS = [
  {
    // 2026-11-10 自 dialog.tsx#DialogHeader 搬到 SurfaceHeader 的右側按鈕位,Dialog / Sheet / Popover / DataTable 面板共用
    //(overlay-surface.spec.md「SurfaceHeader」右側按鈕位;幾何閘 scripts/overlay-header-actions-invariant.mjs)
    label: '浮層標題列(SurfaceHeader 右側按鈕位)',
    file: 'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
    // actions 與 × 同時存在才渲染
    condition: /actions\s*!=\s*null\s*\?[\s\S]*?dismiss\s*!=\s*null\s*&&\s*<ButtonDivider\s*\/>/,
  },
  {
    label: 'Notice 家族(Alert / Toast 共用)',
    file: NOTICE,
    // endContent 與關閉鈕同時存在才渲染
    condition: /endContent\s*!=\s*null\s*&&\s*showDismiss\s*&&\s*<ButtonDivider\s*\/>/,
  },
]

const SHARED_CONSUMERS = [ALERT, 'packages/design-system/src/components/Toast/toast.tsx']

// ── (3) 禁手刻分隔線(action region scope)───────────────────────────────
const HANDCRAFT = /className="[^"]*\b(?:w-px|h-px)\b[^"]*bg-divider[^"]*"|className="[^"]*bg-divider[^"]*\b(?:w-px|h-px)\b[^"]*"/
const HANDCRAFT_SCOPE = [
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
  'packages/design-system/src/components/Dialog/dialog.tsx',
  NOTICE,
  ALERT,
  'packages/design-system/src/components/Toast/toast.tsx',
  'packages/design-system/src/components/BulkActionBar/bulk-action-bar.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.tsx',
  'packages/design-system/src/patterns/header-canonical/chrome-header.tsx',
]

// ── (4) 幾何:線長只能由「該列最高元件 − inset」算出,不得寫死 ──────────────
// 2026-08-07 事故:同一條 canonical 底下實測跑出 13 / 16 / 24px 三種長度。根因是兩套機制
// 並存(ButtonDivider 撐滿容器 / Separator 寫死 h-6),而規範只鎖了左右間距、對長度零約束。
const GEOMETRY_REQUIRED = [
  // 外層取「該列最高元件」當基準。少了它,長度就不再跟控件走。
  { pattern: /'flex shrink-0 self-stretch'/, label: '外層 flex shrink-0 self-stretch(取該列基準 + 防壓縮)' },
  // 內層套 inset 與地板,兩者都讀元件內變數 --divider-inset(值只寫一次,見第 (5) 條),不得各自寫死 px;
  // 地板 = 同一條公式在最小控制項的取值(--field-height-xs − inset),不是另一個常數。
  // (2026-11-11 token「3全收」:inset / 地板原本是 uiSize.css 的兩顆 token,只有 ButtonDivider 在讀,收回成元件自己的值;算式不變。)
  { pattern: /h-\[calc\(100%-var\(--divider-inset\)\)\]/, label: '內層垂直線 inset 讀元件內變數' },
  { pattern: /min-h-\[calc\(var\(--field-height-xs\)-var\(--divider-inset\)\)\]/, label: '內層垂直線地板 = --field-height-xs − inset' },
  { pattern: /w-\[calc\(100%-var\(--divider-inset\)\)\]/, label: '內層水平線 inset 讀元件內變數' },
  { pattern: /min-w-\[calc\(var\(--field-height-xs\)-var\(--divider-inset\)\)\]/, label: '內層水平線地板 = --field-height-xs − inset' },
  // 置中必須由外層負責:單層 self-stretch + min-height 會把線釘在行首,地板一生效就歪。
  { pattern: /items-center/, label: '垂直線由外層 items-center 置中' },
]

// ── (6) action region 群組線不得再用 Separator 手寫高度 ────────────────────
const SEPARATOR_HEIGHT = /<Separator[^>]*orientation="vertical"[^>]*className="[^"]*\bh-\d/

/** 判定(純函式):read(rel) 回檔案文字。回傳失敗訊息清單(空 = 通過)。 */
export function checkDividerContract(read) {
  const failures = []
  const fail = msg => failures.push(msg)

  for (const placer of AUTO_PLACERS) {
    const source = read(placer.file)
    if (!source.includes('<ButtonDivider')) {
      fail(`${placer.file}: ${placer.label} 沒有自動渲染 ButtonDivider —— 誤觸保護的分隔線會退回 consumer 自刻(action-bar.spec.md 第五節「落點歸屬」)`)
      continue
    }
    if (!placer.condition.test(source)) {
      fail(`${placer.file}: ${placer.label} 的分隔線缺少「有其他操作才畫」的條件 —— 只有關閉鈕時也會畫線,違反第五節理由 3 的邊界情況`)
    }
  }

  // ── (2) 共用基座的兩個消費端不得再自刻一條 ───────────────────────────────
  for (const rel of SHARED_CONSUMERS) {
    if (read(rel).includes('<ButtonDivider')) {
      fail(`${rel}: 自己又放了一條分隔線 —— Notice 基座已自動放,重複會變兩條`)
    }
  }

  for (const rel of HANDCRAFT_SCOPE) {
    if (HANDCRAFT.test(read(rel))) {
      fail(`${rel}: 手刻 w-px/h-px + bg-divider 當分隔線 —— 必須用 <Separator> 或 <ButtonDivider>(M23(d) 消費既有 primitive)`)
    }
  }

  const dividerSource = read(BUTTON_GROUP)
  for (const { pattern, label } of GEOMETRY_REQUIRED) {
    if (!pattern.test(dividerSource)) {
      fail(`button-group.tsx: ButtonDivider 缺少「${label}」—— 幾何 SSOT 見 action-bar.spec.md「分隔線幾何」`)
    }
  }
  if (/self-stretch[^']*\bmy-1\b|\bh-full\b/.test(dividerSource)) {
    fail('button-group.tsx: ButtonDivider 用了 h-full 或把 margin 當內縮 —— 內縮必須落在內層並讀 --divider-inset')
  }

  // ── (5) inset 只寫一次、值 = 8px;地板由公式推導,不得退化成兩個孤立常數 ──────────
  // 2026-11-11 前讀 uiSize.css 的兩顆分隔線 token;收回後值住 button-group.tsx 本身。
  const insetDecls = [...dividerSource.matchAll(/\[--divider-inset:([^\]]+)\]/g)].map((m) => m[1])
  if (insetDecls.length !== 1) {
    fail(`button-group.tsx: 元件內變數 --divider-inset 必須恰好宣告一次(現在 ${insetDecls.length} 次)—— 兩次以上 = 同一個值兩個住所,會漂移`)
  } else if (insetDecls[0] !== '0.5rem') {
    fail(`button-group.tsx: --divider-inset 是 ${insetDecls[0]},規格是 0.5rem(8px,action-bar.spec.md「分隔線幾何」)`)
  }
  if (/(?:min-h|min-w)-\[(?!calc\(var\(--field-height-xs\)-var\(--divider-inset\)\))[^\]]*\]/.test(dividerSource)) {
    fail('button-group.tsx: 分隔線地板必須由 calc(--field-height-xs − --divider-inset) 推導 —— 寫死常數會讓地板脫離公式,變成可獨立漂移的第二個值')
  }

  for (const rel of HANDCRAFT_SCOPE) {
    if (SEPARATOR_HEIGHT.test(read(rel))) {
      fail(`${rel}: action region 群組線仍用 <Separator> 手寫高度 —— 唯一實作是 <ButtonDivider />(action-bar.spec.md「分隔線幾何」)`)
    }
  }
  return failures
}

/**
 * 對照組:在記憶體裡對現行原始碼做一處注入,同一個判定必須紅而且訊息指名該處;現行原始碼必須綠。
 * 注入沒改到東西 = 對照組過期 → INSTRUMENT-FAIL,不當通過。
 */
function selftest() {
  const inject = (rel, from, to) => {
    const base = readDisk(rel)
    const next = base.replace(from, to)
    if (next === base) throw new Error(`對照組注入沒有改到 ${rel}(寫法變了,先修對照組)—— INSTRUMENT-FAIL`)
    return (r) => (r === rel ? next : readDisk(r))
  }
  const cases = [
    ['現行原始碼', readDisk, null],
    ['inset 改成 0.75rem', inject(BUTTON_GROUP, '[--divider-inset:0.5rem]', '[--divider-inset:0.75rem]'), '0.75rem'],
    ['inset 宣告兩次', inject(BUTTON_GROUP, "'bg-divider [--divider-inset:0.5rem]'", "'bg-divider [--divider-inset:0.5rem] [--divider-inset:0.5rem]'"), '恰好宣告一次'],
    ['垂直線地板寫死 16px', inject(BUTTON_GROUP, 'min-h-[calc(var(--field-height-xs)-var(--divider-inset))]', 'min-h-[16px]'), '地板必須由'],
    ['Notice 拿掉「有其他操作才畫」的條件', inject(NOTICE, /endContent\s*!=\s*null\s*&&\s*showDismiss\s*&&\s*<ButtonDivider/, 'showDismiss && <ButtonDivider'), '有其他操作才畫'],
    ['Alert 自己再放一條', inject(ALERT, /(return\s*\(?\s*)/, '$1<><ButtonDivider />'), ALERT],
  ]
  let ok = true
  for (const [label, read, needle] of cases) {
    const failures = checkDividerContract(read)
    const pass = needle == null ? failures.length === 0 : failures.some((f) => f.includes(needle))
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} ${needle == null ? '該綠' : '該紅'}:${label}${pass ? '' : ` —— 實得 ${failures.join(' / ') || '沒有問題'}`}`)
  }
  console.log(ok ? '✓ 對照組:每種注入各自紅且指名、現行原始碼綠(儀器有效)' : '✗ 對照組有一條沒照預期 —— 儀器無效')
  return ok
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  const failures = checkDividerContract(readDisk)
  for (const f of failures) console.error(`✗ ${f}`)
  if (failures.length) {
    console.error(`\n❌ action region 分隔線契約失敗 ${failures.length} 項`)
    process.exit(1)
  }
  console.log(`Action divider PASS (${AUTO_PLACERS.length} 自動落點 + 2 共用消費端 + ${HANDCRAFT_SCOPE.length} 手刻掃描 + ${GEOMETRY_REQUIRED.length} 幾何斷言 + inset 單一住所與地板公式 + Separator 高度掃描)`)
}
