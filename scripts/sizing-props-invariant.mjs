#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 尺寸參數只有一套名字(`ds-canonical/references/props-naming.md`「尺寸參數」,user 2026-11-11「尺寸:甲」)——
 *         撐滿 / 跟內容只叫 `width="fill"` / `width="hug"`,`size` 只當檔位,欄位家族不漏 HTML 原生 width / height,
 *         已移除的舊名不回來(相容政策 props-naming.md「相容政策」;判斷讀 scripts/lib/compat-policy.mjs)。
 *   紅: R1 公開元件的 *Props 出現撐滿 / 跟內容的同義名(fullWidth / block / autoWidth …)或已移除的舊名(REMOVED_PROP_NAMES)——
 *          0.x / 預發布版標了 @deprecated 也紅(不留舊名);1.0 以後的正式版才准同義名標 @deprecated 留一個版本;
 *       R2 DS 自己的 JSX(元件 / 範例 / 模板 / 閘夾具(scripts/test-fixtures/ 的 .tsx,以及 scripts/ 底下(含子目錄)所有
 *          .mjs / .js / .cjs 腳本裡寫成字串的 JSX —— 閘、閘的 meta-test、工具測試都算;只豁免 FIXTURE_EXEMPT 列名的檔:
 *          本檔與 codemod 的測試,輸入本來就要寫舊名))用已移除的舊名(<Button fullWidth> / <FieldControlGroup block> /
 *          <Input autoWidth> / <FieldGroup horizontalLabelWidth> / <DataTable height> / <DialogContent maxWidth> / <DataTable autoRowHeight>);
 *       R3 *Props 的 `size` 收數字或任意字串(= 拿 size 當長度),不在正方形媒體例外清單;
 *       R4 *Props 繼承 InputHTMLAttributes 卻沒把原生 `width` / `height` Omit 掉;
 *       R5 DS 自己的 `<DialogContent width>` 寫數字(或檔名以外的字串)—— DS 的元件、範例只寫寬度檔名 sm / md / lg / xl
 *          (dialog.spec.md「寬度檔位」;2026-11-15 A18)。閘夾具(scripts/test-fixtures/ 與 scripts/ 腳本裡的字串 JSX)除外:
 *          量行為的測試對話框寫原數字,寬度不跟著檔位表變。
 *       → 指名 file:line 與修法,exit 1(閘夾具指名的是 .mjs 原檔的行)。`--selftest` 用合成原始碼證明五條各自會紅、合規寫法不誤報。
 *   綠: 五條 0 筆。純語法掃描(TypeScript createSourceFile,不做型別推論),同一份 worktree 恆等,沒有取樣。
 *        任一類掃到 0(*Props 檔 / JSX 檔 / scripts/ 腳本支數 / 其中的字串 JSX 段數)= 掃描或抽取壞了,exit 2,不讀成乾淨。
 *        豁免清單(FIXTURE_EXEMPT)裡的檔已經不存在、或裡面已經沒有舊名 = 豁免過期,exit 1(沒有作用的豁免就是沒人看的洞)。
 *   註: 2026-11-15 新寫(audit-r7 INV-24:「沒有任何一份 SSOT 規定尺寸類 prop 怎麼命名,所以各元件各自照外部某一家取名」)。
 *        DialogContent `autoHeight` 的 JSX 用法歸 `overlay-story-contract-invariant.mjs` S3 管,本閘的 R2 不重複報。
 *        2026-11-18 R2 擴到 *-invariant.mjs 裡寫成字串的 JSX(audit 24 項 #10):原本檔頭寫「閘夾具,沒有例外」,實際只掃 .tsx,
 *        5 處瀏覽器閘的 HARNESS 與 2 處 selftest 的合成範例還寫 `<DataTable height>`,沒有任何一道閘看得到(見 scanGateFixtures 上方註解)。
 *        同日範圍再改(E3 反駁 #1 #2):第一版用檔名「scripts/ 第一層、結尾 -invariant.mjs」代替「這支腳本裡有 DS 的 JSX」——
 *        複數 *-invariants.mjs 整批漏掉,註解寫「test-*.mjs 不掃」程式卻有掃 test-*-invariant.mjs;改成 scripts/ 全掃、只豁免列名的檔。
 *        已知限制:字串**開頭**就是 `<DataTable height>` 這種寫法的說明文字也會被當 JSX 判紅 —— 說明文字改寫成「舊名 height」即可。
 */
// sizing-props-invariant.mjs — 尺寸參數命名閘
//
// 為什麼要有:2026-11-11 全面稽核(audit-r7「尺寸類 prop」)量到「撐滿」有 3 個名字(width='fill' / fullWidth / block)、
// 「跟內容」4 種寫法、Input 系列型別會過但沒作用的原生 width、DataTable `height` 實為上限。根因是 fill / hug 在 2026-07 成為
// canonical 之後沒有閘,舊名照外部各家長出來(MUI / Polaris 的 fullWidth、Ant 的 block)。改名本身(2026-11-15)只修了現況,
// 這支擋的是「下一個元件又照某一家取名」。
//
// 判準住 props-naming.md「尺寸參數」;本檔只放機器要用的清單。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isDirectRun } from './lib/direct-run.mjs'
import { compatPolicyFor, readCompatPolicy, POLICY_DOC } from './lib/compat-policy.mjs'

const ROOT = process.cwd()

/** 撐滿 / 跟內容的同義名(外部各家的名字)。新元件一個都不准加。 */
export const SIZING_MODE_ALIASES = new Set([
  'fullWidth', 'fullHeight', 'block', 'autoWidth', 'autoHeight', 'fluid', 'stretch',
  'shouldFitContainer', 'fitContainer', 'isFullWidth', 'fillWidth', 'fillHeight', 'hugContent',
])

/**
 * 已移除的舊名(`Props名.prop名` → 新寫法;2026-11-15 移除,不留舊名 —— 相容政策)。這是**禁用清單**:
 * 出現在 *Props 裡一律紅(不論有沒有標 @deprecated),訊息帶新寫法。清單只准變長(移除的名字不回來)。
 * 不是 SIZING_MODE_ALIASES 的名字(horizontalLabelWidth / DataTable height / DialogContent maxWidth)要靠這張表才擋得到。
 */
export const REMOVED_PROP_NAMES = new Map([
  ['ButtonProps.fullWidth', 'width="fill"'],
  ['SegmentedControlProps.fullWidth', 'width="fill"'],
  ['FieldControlGroupProps.block', 'width="fill"'],
  ['InputProps.autoWidth', 'width="hug"'],
  ['DialogContentProps.autoHeight', 'height="hug"'],
  ['FieldGroupProps.horizontalLabelWidth', 'labelWidth'],
  ['DataTableProps.height', 'maxHeight'],
  ['DialogContentProps.maxWidth', 'width(檔名 sm / md / lg / xl 或數字)'],
  // 2026-11-17(A96,user 同日照建議選甲):列高跟內容 = rowHeight="hug",跟 width="hug" 同一套;舊名不在 SIZING_MODE_ALIASES(那張只比完整名字)
  ['DataTableProps.autoRowHeight', 'rowHeight="hug"'],
])

/** R2:DS 自己的 JSX 不得再用的舊寫法(元件名 → 屬性名 → 新寫法)。DialogContent autoHeight 歸 overlay-story-contract S3。 */
export const REMOVED_JSX = [
  { tag: /^(Button|CarouselNext|CarouselPrevious|SidebarTrigger|SegmentedControl)$/, attr: 'fullWidth', fix: 'width="fill"' },
  { tag: /^FieldControlGroup$/, attr: 'block', fix: 'width="fill"' },
  { tag: /^(Input|SidebarInput)$/, attr: 'autoWidth', fix: 'width="hug"' },
  { tag: /^FieldGroup$/, attr: 'horizontalLabelWidth', fix: 'labelWidth' },
  { tag: /^DataTable$/, attr: 'height', fix: 'maxHeight(height="auto" → maxHeight="none"、"400px" → {400}、"100%" → "100%")' },
  { tag: /^DialogContent$/, attr: 'maxWidth', fix: 'width(DS 自己只寫檔名 sm / md / lg / xl,照 dialog.spec.md「寬度檔位」選檔;閘夾具才寫數字)' },
  { tag: /^DataTable$/, attr: 'autoRowHeight', fix: 'rowHeight="hug"(autoRowHeight={false} 或不寫 → 不寫 = 固定列高)' },
]
// (2026-11-15 前這裡有一張 R2 例外清單,放行「量舊名相容路徑」的 dialog-width 夾具;舊名移除後相容路徑不存在,例外一起拿掉。)
/** R5:DialogContent 的寬度檔名(dialog.tsx DIALOG_WIDTH_TIERS 的 key;數值不在這裡,只認名字)。 */
export const DIALOG_WIDTH_TIER_NAMES = new Set(['sm', 'md', 'lg', 'xl'])
/** R5 不管的路徑:閘夾具量的是行為,寬度寫原數字(不跟著檔位表變,免得動到點擊座標)。 */
const R5_EXEMPT_PREFIX = 'scripts/test-fixtures/'
/** R5 只管 DS 自己:apps/ 底下是產品(create-app 建在 apps/<name>/),產品自填數字寬不設上限、不擋(dialog.spec.md「寬度檔位」自訂寬;user 2026-11-15 核准)。 */
const R5_SCOPE_PREFIX = 'packages/design-system/'

/** R3:`size` 是邊長 px 的例外(正方形媒體;props-naming.md「尺寸參數」第 4 條)。清單只准變短。 */
export const SIZE_AS_LENGTH_EXCEPTIONS = new Set(['AvatarProps', 'CircularProgressProps', 'AgentLogoProps'])

// ── 掃描範圍 ────────────────────────────────────────────────────────────────────
const PROPS_DIRS = ['packages/design-system/src/components', 'packages/design-system/src/patterns']
const JSX_DIRS = [
  'packages/design-system/src',
  'packages/design-system/ds-canonical/templates',
  'apps',
  'scripts/test-fixtures',
]
const SKIP_DIR = new Set(['node_modules', 'dist', 'storybook-static', '__selftest__'])

function walk(dir, acc, accept) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return acc
  for (const name of readdirSync(abs)) {
    if (name.startsWith('.') || SKIP_DIR.has(name)) continue
    const rel = join(dir, name)
    const st = statSync(join(ROOT, rel))
    if (st.isDirectory()) walk(rel, acc, accept)
    else if (accept(name)) acc.push(rel.split(sep).join('/'))
  }
  return acc
}

/** repo 現在的相容政策(scripts/lib/compat-policy.mjs;讀不到就丟例外 → 呼叫端判儀器失效,不放行)。一次讀、之後重用。 */
let policyCache = null
function currentPolicy() {
  if (!policyCache) policyCache = readCompatPolicy(ROOT)
  return policyCache
}

const isPropsSource = (name) => /\.tsx?$/.test(name) && !/\.(stories|test|spec)\.tsx?$/.test(name) && !name.startsWith('_') && !name.endsWith('.d.ts')

function parse(path, text) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
const hasDeprecatedTag = (node) => ts.getJSDocTags(node).some((t) => t.tagName.getText() === 'deprecated')
const memberName = (m) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : null)

/**
 * R1 / R3 / R4:掃一個檔案裡的 *Props 宣告。
 * policy = scripts/lib/compat-policy.mjs 的結果(預設讀 repo 現在的版本);R1 依它判「同義名標 @deprecated 准不准留一版」。
 */
export function checkPropsSource(path, text, policy = currentPolicy()) {
  const hits = []
  const sf = parse(path, text)
  const visit = (node) => {
    let propsName = null
    let members = null
    if (ts.isInterfaceDeclaration(node) && /Props$/.test(node.name.text)) {
      propsName = node.name.text
      members = node.members
      // R4:繼承 InputHTMLAttributes 必須 Omit 原生 width / height
      for (const clause of node.heritageClauses ?? []) {
        for (const t of clause.types) {
          const txt = t.getText(sf)
          if (!/InputHTMLAttributes</.test(txt)) continue
          const omitted = /^(React\.)?Omit</.test(txt) ? [...txt.matchAll(/'([^']+)'/g)].map((m) => m[1]) : []
          const missing = ['width', 'height'].filter((k) => !omitted.includes(k))
          if (missing.length) hits.push({ rule: 'R4', path, line: lineOf(sf, t), found: `${propsName} extends ${txt.replace(/\s+/g, ' ').slice(0, 90)}`, fix: `把原生 ${missing.join(' / ')} 一起 Omit(<input type="text"> 的這兩個屬性沒有作用,寫了不報錯也不生效);寬度改走 DS 的 width 軸(FieldWidth)` })
        }
      }
    } else if (ts.isTypeAliasDeclaration(node) && /Props$/.test(node.name.text) && ts.isTypeLiteralNode(node.type)) {
      propsName = node.name.text
      members = node.type.members
    }
    if (propsName && members) {
      for (const m of members) {
        if (!ts.isPropertySignature(m)) continue
        const name = memberName(m)
        if (!name) continue
        const key = `${propsName}.${name}`
        // R1:撐滿 / 跟內容的同義名,與已移除的舊名
        if (SIZING_MODE_ALIASES.has(name) || REMOVED_PROP_NAMES.has(key)) {
          // 只有 1.0 以後的正式版(policy.keepOldNames)才准「標 @deprecated 留一個版本」;0.x / 預發布版一律紅
          const keptOneRelease = policy.keepOldNames && hasDeprecatedTag(m)
          if (!keptOneRelease) {
            const replacement = REMOVED_PROP_NAMES.get(key)
            hits.push({
              rule: 'R1', path, line: lineOf(sf, m), found: `${key}${hasDeprecatedTag(m) ? '(標了 @deprecated)' : ''}`,
              fix: replacement
                ? `已移除的舊名,改 ${replacement};${policy.version} 的相容政策 = ${policy.mode}(${POLICY_DOC}):不留舊名、不標 @deprecated 轉接`
                : `撐滿 / 跟內容只准用 width="fill" / width="hug"(props-naming.md「尺寸參數」第 1 條);不得新增同義名${hasDeprecatedTag(m) ? `(${policy.version} 是 ${policy.mode},標 @deprecated 也不放行)` : ''}`,
            })
          }
        }
        // R3:size 只當檔位
        if (name === 'size' && m.type && !SIZE_AS_LENGTH_EXCEPTIONS.has(propsName)) {
          const t = m.type.getText(sf)
          if (/\bnumber\b/.test(t) || /(^|[|\s])string\b/.test(t)) {
            hits.push({ rule: 'R3', path, line: lineOf(sf, m), found: `${key}: ${t}`, fix: 'size 只當 sm / md / lg 檔位;長度用 width / height(數字 = px)。正方形媒體邊長是唯一例外(props-naming.md「尺寸參數」第 4 條)' })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/**
 * R5 用:`<DialogContent width=…>` 的值是不是「只寫檔名」。
 * 字串常值 → 必須是四個檔名之一;運算式裡出現任何數字常值(`{720}`、`{wide ? 960 : 480}`)→ 不是;
 * 變數 / 函式呼叫等沒有常值的運算式 → 交給型別(值域 = 檔名 | number,語法層分不出來),不判紅。
 */
function dialogWidthIsTierName(initializer) {
  if (!initializer) return true // `<DialogContent width>`(= true)型別層就擋了
  const literalOk = (n) => DIALOG_WIDTH_TIER_NAMES.has(n.text)
  if (ts.isStringLiteral(initializer)) return literalOk(initializer)
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return true
  let ok = true
  const scan = (n) => {
    if (ts.isNumericLiteral(n)) ok = false
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !literalOk(n)) ok = false
    else ts.forEachChild(n, scan)
  }
  scan(initializer.expression)
  return ok
}

/**
 * R2 / R5 的判定本體:走一棵已解析的 TSX 樹。`lineAt(位置)` = 這個位置在**原檔**第幾行
 * (.tsx 檔就是樹自己的行號;閘夾具是 .mjs 字串裡的一段 JSX,行號要換回 .mjs 的行 —— 見 checkGateFixtureSource)。
 */
function jsxHitsIn(sf, path, lineAt) {
  const hits = []
  const r5Exempt = path.startsWith(R5_EXEMPT_PREFIX) || !path.startsWith(R5_SCOPE_PREFIX)
  const visit = (node) => {
    if (ts.isJsxAttribute(node)) {
      const attr = node.name.getText(sf)
      const el = node.parent.parent
      const tag = el.tagName ? el.tagName.getText(sf) : ''
      const line = lineAt(node.getStart(sf))
      for (const rule of REMOVED_JSX) {
        if (rule.attr === attr && rule.tag.test(tag)) {
          hits.push({ rule: 'R2', path, line, found: `<${tag} ${node.getText(sf).replace(/\s+/g, ' ').slice(0, 60)}>`, fix: `已移除的舊名,改 ${rule.fix}(props-naming.md「相容政策」:DS 自己的程式、範例、模板、閘夾具同一版改完)` })
        }
      }
      if (!r5Exempt && tag === 'DialogContent' && attr === 'width' && !dialogWidthIsTierName(node.initializer)) {
        hits.push({ rule: 'R5', path, line, found: `<${tag} ${node.getText(sf).replace(/\s+/g, ' ').slice(0, 60)}>`, fix: 'DS 自己的元件、範例只寫寬度檔名 sm / md / lg / xl(dialog.spec.md「寬度檔位」選檔規則:一件 → sm、多件一欄 → md、有一件很寬 → lg、兩欄 → xl);數字是給產品特例的出口,閘夾具(scripts/test-fixtures/)除外' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/** R2 / R5:掃一個檔案裡的 JSX 屬性。 */
export function checkJsxSource(path, text) {
  if (!path.endsWith('.tsx')) return []
  const sf = parse(path, text)
  return jsxHitsIn(sf, path, (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1)
}

// ── 閘夾具:scripts/ 底下腳本裡寫成字串的 JSX(R2)──────────────────────────────────────────
// 瀏覽器閘把要量的畫面寫成字串(`const HARNESS = \`…<DataTable …/>…\``),執行時才由 esbuild 編譯 —— 不是 .tsx 檔,
// JSX_DIRS 掃不到,型別檢查也碰不到。2026-11-15 DataTable 的 `height` 改名 `maxHeight` 之後,5 處夾具還寫 `height="auto"`:
// 舊名不再被 data-table.tsx 的 `DataTableInner` 解構取出,落進 `...props` 展開到外框 div 變成 HTML 屬性,
// 上限回到不傳時的預設 400px(同函式 `maxHeightToCss(maxHeightProp) ?? (pagination ? 'auto' : '400px')` 那一行)——
// 夾具原本「不設上限」的意思默默沒了,沒有任何報錯(audit 24 項 #10;2026-11-18 真 Chromium 實量:30 列表舊寫法 442 高、新寫法 1242)。
//
// 範圍 = scripts/ 底下(含子目錄)所有 .mjs / .js / .cjs,只豁免 FIXTURE_EXEMPT 列名的檔(每支寫得出理由,而且要還有作用)。
// 為什麼不用檔名認「閘」(2026-11-18 E3 反駁 #1 #2):第一版範圍是「scripts/ 第一層、檔名結尾 -invariant.mjs」,
// 拿檔名代替「這支腳本裡有 DS 的 JSX」(M37),同一天量到三個洞 ——
//   - 複數 *-invariants.mjs 的 11 支全部沒掃,含 DataTable 主要的瀏覽器閘 data-table-invariants.mjs
//     (在它尾端加一段 `<DataTable … height="auto" />` 樣板,閘照樣綠);
//   - 註解寫「scripts/test-*.mjs 不掃」,程式卻有掃 test-*-invariant.mjs 那 135 支(test-story-layer-drift-invariant.mjs 就有 10 段夾具)
//     —— 註解裡的斷言,程式沒有任何地方在執行;
//   - 「test-*.mjs 是工具測試,輸入本來就要舊名」只對 codemod 的測試成立:test-fork-governance.mjs 偽表格那組的乾淨樣本
//     就帶著過期的 `height="auto"`(audit 24 項 #10 靠人工才改到);deep-audit 確定性計畫跑的 dogfood-prepublish-verify.mjs
//     寫給 consumer 建置的 App.tsx 也在兩種檔名範圍之外。
// 對 scripts/ 底下 683 支腳本跑同一份抽取:有舊名的只有下面豁免的兩支,其餘全部 0 筆。
// scripts/ 以外整個 repo 只有 packages/governance/test/provider-adapter-generator.test.mjs 一段(Edit 內容 `<Button>Save</Button>`,0 筆)——
// 那是 governance 套件自己的測試輸入,不是 DS 的腳本,不在本閘範圍。
// scripts/test-fixtures/ 的 .tsx 已在 JSX_DIRS;story-determinism/*.txt 是凍結的歷史原始碼抄本(不是腳本、也不是 DS 現在的 JSX);
// scripts/.gate-bundles/ 是建置產物(walk 跳過 . 開頭的目錄)。
const GATE_FIXTURE_DIR = 'scripts'
const SCRIPT_EXT = /\.(mjs|js|cjs)$/
const SELF_FILE = basename(fileURLToPath(import.meta.url))
/** 不掃的腳本:repo 相對路徑 → 理由。正式掃描照樣對它們跑一次抽取 —— 檔不在了、或裡面已經沒有舊名,就是豁免過期(staleExemptions)。 */
export const FIXTURE_EXEMPT = new Map([
  [`${GATE_FIXTURE_DIR}/${SELF_FILE}`, 'selftest 與修法訊息本來就要寫出舊名'],
  [`${GATE_FIXTURE_DIR}/test-design-system-codemod.mjs`, 'codemod 的輸入本來就要寫舊名(把 `<DataTable height="auto" />` 餵給 codemod、斷言它改成 maxHeight)'],
])
/** 哪些腳本要掃(純函式,selftest 直接驗範圍):scripts/ 底下(含子目錄)的 .mjs / .js / .cjs,不在 FIXTURE_EXEMPT。 */
export const isGateFixtureFile = (rel) => rel.startsWith(`${GATE_FIXTURE_DIR}/`) && SCRIPT_EXT.test(rel) && !FIXTURE_EXEMPT.has(rel)
/** 豁免過期(純函式):Map<豁免的檔, 舊名筆數 | null(檔不在)> → 0 筆或 null 的那些。 */
export const staleExemptions = (hitsByExempt) => [...hitsByExempt].filter(([, n]) => n === null || n === 0).map(([rel]) => rel)
/** 字串裡出現 `<元件名`,且元件名在 REMOVED_JSX 裡 —— 才當成一段 JSX 夾具解析(清單不另抄,直接讀 REMOVED_JSX)。 */
const mentionsRemovedJsxTag = (text) => [...text.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].some((m) => REMOVED_JSX.some((r) => r.tag.test(m[1])))
/** `${…}` 換成的佔位字(合法識別字,放在屬性位置、子節點位置都解析得過去;不含換行)。 */
const SUBSTITUTION_PLACEHOLDER = '__sub__'

/**
 * 一段常值(字串 / 樣板的一節)在原檔的換行對照:回傳 cooked 內容裡第 k 個 '\n' **之後**的文字在原檔第幾行。
 * 原始碼裡真的換行 → cooked 換行、原檔也換行;轉義的 `\n` → cooked 換行、原檔不換;`\` 接換行(行接續)→ cooked 不換、原檔換。
 * 數出來的換行數對不上 cooked(`\x0a` / `\u000a` 這類少見寫法)→ 回 null,呼叫端整段都報常值開頭那一行(行號粗一點,不漏報)。
 */
function newlineLineMap(raw, cooked, startLine) {
  const after = []
  let line = startLine
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '\n') { line++; after.push(line); continue }
    if (c !== '\\') continue
    const d = raw[i + 1]
    if (d === 'n') after.push(line)
    else if (d === '\n') line++
    else if (d === '\r') { line++; if (raw[i + 2] === '\n') i++ }
    i++
  }
  const cookedNewlines = cooked.split('\n').length - 1
  return after.length === cookedNewlines ? after : null
}

/**
 * 一個字串 / 樣板常值 → { text, lineAt }:text = 還原轉義後的內容(`${…}` 換成佔位字),lineAt(text 裡的位置) = 原檔第幾行。
 * 一節 = 字串常值本身,或樣板的頭 / 中 / 尾;每節各自從它在原檔的起始行數起(`${…}` 裡的運算式跨行也不會讓後面的行號偏掉)。
 */
function cookLiteral(sf, node) {
  const pieces = ts.isTemplateExpression(node) ? [node.head, ...node.templateSpans.map((s) => s.literal)] : [node]
  const segs = []
  let text = ''
  pieces.forEach((tok, i) => {
    if (i > 0) text += SUBSTITUTION_PLACEHOLDER
    const start = tok.getStart(sf)
    const opensSubstitution = ts.isTemplateHead(tok) || ts.isTemplateMiddle(tok) // 結尾是 `${`
    const raw = sf.text.slice(start + 1, tok.end - (opensSubstitution ? 2 : 1))
    const startLine = sf.getLineAndCharacterOfPosition(start).line + 1
    segs.push({ offset: text.length, cooked: tok.text, startLine, after: newlineLineMap(raw, tok.text, startLine) })
    text += tok.text
  })
  const lineAt = (pos) => {
    let seg = segs[0]
    for (const s of segs) if (s.offset <= pos) seg = s
    if (!seg.after) return seg.startLine
    const k = seg.cooked.slice(0, Math.max(0, pos - seg.offset)).split('\n').length - 1
    return k === 0 ? seg.startLine : seg.after[Math.min(k, seg.after.length) - 1]
  }
  return { text, lineAt }
}

/**
 * R2(閘夾具):掃一支 .mjs 閘裡所有字串 / 樣板常值;內容提到 REMOVED_JSX 的元件名的,當 TSX 解析、交給同一份判定(jsxHitsIn)。
 * 回傳 { hits, fixtures }:fixtures = 解析了幾段(正式掃描用它證明「真的有讀到夾具」,0 段 = 抽取壞了,不是乾淨)。
 * 只回 R2:R5(DialogContent width 只寫檔名)本來就不管閘夾具(檔頭 R5 註)。
 */
export function checkGateFixtureSource(path, text) {
  const hits = []
  let fixtures = 0
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const lit = cookLiteral(sf, node)
      if (mentionsRemovedJsxTag(lit.text)) {
        fixtures++
        const inner = ts.createSourceFile(`${path}.fixture.tsx`, lit.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        hits.push(...jsxHitsIn(inner, path, lit.lineAt).filter((h) => h.rule === 'R2'))
      }
      // 樣板裡 `${…}` 的運算式可能再包一段樣板(例:`${cond ? \`<Input autoWidth />\` : ''}`)—— 照樣往下走
      if (ts.isTemplateExpression(node)) for (const s of node.templateSpans) visit(s.expression)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { hits, fixtures }
}

function scanGateFixtures() {
  const hits = []
  let files = 0
  let fixtures = 0
  for (const rel of walk(GATE_FIXTURE_DIR, [], (name) => SCRIPT_EXT.test(name)).sort()) {
    if (!isGateFixtureFile(rel)) continue
    files++
    const r = checkGateFixtureSource(rel, readFileSync(join(ROOT, rel), 'utf8'))
    hits.push(...r.hits)
    fixtures += r.fixtures
  }
  // 豁免的檔照樣跑一次同一份抽取,只為了證明豁免還有作用(檔還在、裡面真的有舊名)
  const exemptHits = new Map([...FIXTURE_EXEMPT.keys()].map((rel) => [
    rel, existsSync(join(ROOT, rel)) ? checkGateFixtureSource(rel, readFileSync(join(ROOT, rel), 'utf8')).hits.length : null,
  ]))
  return { hits, files, fixtures, stale: staleExemptions(exemptHits) }
}

function scanRepo() {
  const hits = []
  let propsFiles = 0
  let jsxFiles = 0
  for (const dir of PROPS_DIRS) {
    for (const f of walk(dir, [], isPropsSource)) {
      propsFiles++
      hits.push(...checkPropsSource(f, readFileSync(join(ROOT, f), 'utf8')))
    }
  }
  for (const dir of JSX_DIRS) {
    for (const f of walk(dir, [], (n) => n.endsWith('.tsx'))) {
      jsxFiles++
      hits.push(...checkJsxSource(f, readFileSync(join(ROOT, f), 'utf8')))
    }
  }
  const gate = scanGateFixtures()
  hits.push(...gate.hits)
  return { hits, propsFiles, jsxFiles, gateFiles: gate.files, gateFixtures: gate.fixtures, staleExempt: gate.stale }
}

// ── selftest:合成原始碼,四條各自會紅、合規寫法不誤報 ─────────────────────────────────────
function selftest() {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }
  const rules = (hits) => hits.map((h) => h.rule).sort().join(',')

  // 相容政策(scripts/lib/compat-policy.mjs):每一格明確傳入固定政策 —— 0.x 用 compatPolicyFor('0.1.0-beta.148'),
  // 1.0 用 compatPolicyFor('1.0.0'),不讀 repo 現在的版本(版號一變,格子的意思不能跟著變;M37:「現在的版本」不是這一格要測的政策)。
  const beta = compatPolicyFor('0.1.0-beta.148')
  const stable = compatPolicyFor('1.0.0')
  // 唯一一格讀 repo:用途是證明正式掃描(checkPropsSource 不傳 policy)走的是共用的讀版本路徑、讀得到 —— 不斷言 repo 是哪一版,
  // 改成 1.0.0 照樣綠。
  const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'packages/design-system/package.json'), 'utf8')).version
  expect(currentPolicy().version === pkgVersion && currentPolicy().mode === compatPolicyFor(pkgVersion).mode, `相容政策:正式掃描讀到的版本 ${currentPolicy().version} / ${currentPolicy().mode} 應等於 package.json 的 ${pkgVersion} 判出來的政策`)
  // R1:新元件加 fullWidth → 紅
  expect(rules(checkPropsSource('x/card.tsx', 'export interface CardProps { fullWidth?: boolean }', beta)) === 'R1', 'R1:新元件的 fullWidth 應紅')
  // R1:block 也是同義名
  expect(rules(checkPropsSource('x/toolbar.tsx', 'interface ToolbarProps { block?: boolean }', beta)) === 'R1', 'R1:新元件的 block 應紅')
  // R1:已移除的舊名加回來 → 紅(沒標 @deprecated)
  expect(rules(checkPropsSource('x/button.tsx', 'export interface ButtonProps { fullWidth?: boolean }', beta)) === 'R1', 'R1:已移除的舊名加回來應紅')
  // R1:0.x 下「舊名 + @deprecated + 內部轉新名」這條 2026-11-15 前的路 → 紅(2026-11-15 前這格是綠)
  const deprecatedAlias = 'export interface ButtonProps {\n  width?: SizingMode\n  /** @deprecated 改用 width="fill" */\n  fullWidth?: boolean\n}'
  expect(rules(checkPropsSource('x/button.tsx', deprecatedAlias, beta)) === 'R1', 'R1:0.x 下舊名標了 @deprecated 也應紅(不留舊名)')
  // R1 對照:同一段原始碼在 1.0 正式版政策下 → 綠(留一個版本)—— 證明 R1 讀的是相容政策,不是寫死
  expect(checkPropsSource('x/button.tsx', deprecatedAlias, stable).length === 0, 'R1:1.0 正式版政策下同義名標了 @deprecated 不應紅')
  expect(rules(checkPropsSource('x/button.tsx', 'export interface ButtonProps { fullWidth?: boolean }', stable)) === 'R1', 'R1:1.0 正式版政策下沒標 @deprecated 仍應紅')
  // R1:不是同義名、但在移除清單上的舊名(horizontalLabelWidth / DataTable height)加回來 → 紅
  expect(rules(checkPropsSource('x/field.tsx', 'export interface FieldGroupProps { labelWidth?: number | string\n  horizontalLabelWidth?: string }', beta)) === 'R1', 'R1:FieldGroupProps.horizontalLabelWidth 加回來應紅')
  expect(rules(checkPropsSource('x/data-table.tsx', 'export interface DataTableProps<TData> { maxHeight?: number | string\n  height?: string }', beta)) === 'R1', 'R1:DataTableProps.height 加回來應紅')
  // R1 合規:新名 width → 綠
  expect(checkPropsSource('x/button.tsx', 'export interface ButtonProps {\n  width?: SizingMode\n}', beta).length === 0, 'R1:只有新名 width 不應紅')
  // 不是 *Props 的型別不管(內部 context、常數表)
  expect(checkPropsSource('x/item.tsx', 'interface RowCtx { block?: boolean }\nconst t = { block: { sm: 32 } }', beta).length === 0, 'R1:非 *Props 不應紅')
  // R2:舊寫法 JSX → 紅;新寫法 → 綠
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <Button fullWidth>送出</Button>')) === 'R2', 'R2:<Button fullWidth> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <FieldControlGroup block><Input /></FieldControlGroup>')) === 'R2', 'R2:<FieldControlGroup block> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <DataTable columns={c} data={d} height="auto" />')) === 'R2', 'R2:<DataTable height> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <DataTable columns={c} data={d} autoRowHeight />')) === 'R2', 'R2:<DataTable autoRowHeight> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <FieldGroup horizontalLabelWidth="120px" />')) === 'R2', 'R2:<FieldGroup horizontalLabelWidth> 應紅')
  expect(checkJsxSource('x/a.stories.tsx', 'const a = <><Button width="fill" /><DataTable maxHeight="none" /><DialogContent height="hug" /><svg height="16" /><img height={40} /></>').length === 0, 'R2:新寫法與 svg / img / DialogContent 的 height 不應紅')
  // R3:size 收數字 → 紅;檔位 → 綠;例外清單 → 綠
  expect(rules(checkPropsSource('x/chip.tsx', 'export interface ChipProps { size?: number }', beta)) === 'R3', 'R3:size: number 應紅')
  expect(rules(checkPropsSource('x/chip.tsx', "export interface ChipProps { size?: 'sm' | 'md' | string }", beta)) === 'R3', 'R3:size 收任意字串應紅')
  expect(checkPropsSource('x/chip.tsx', "export interface ChipProps { size?: 'sm' | 'md' | 'lg'; pageSize?: number }", beta).length === 0, 'R3:檔位與複合字 pageSize 不應紅')
  expect(checkPropsSource('x/avatar.tsx', "export interface AvatarProps { size?: number | 'fill' }", beta).length === 0, 'R3:Avatar 例外不應紅')
  // R4:繼承 InputHTMLAttributes 沒 Omit width / height → 紅;Omit 了 → 綠
  expect(rules(checkPropsSource('x/input.tsx', "export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {}", beta)) === 'R4', 'R4:沒 Omit 原生 width / height 應紅')
  expect(rules(checkPropsSource('x/input.tsx', 'export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}', beta)) === 'R4', 'R4:直接繼承也應紅')
  expect(checkPropsSource('x/input.tsx', "export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'width' | 'height'> {}", beta).length === 0, 'R4:Omit 了 width / height 不應紅')
  // R1 / R2:Dialog 的舊名 maxWidth(2026-11-15 A18 改名、同日移除)—— 型別加回來紅(標不標 @deprecated 都紅);JSX 用舊名紅
  expect(rules(checkPropsSource('x/dialog.tsx', 'interface DialogContentProps { width?: DialogWidthTier | number\n  maxWidth?: string | number }', beta)) === 'R1', 'R1:DialogContentProps.maxWidth 加回來應紅')
  expect(rules(checkPropsSource('x/dialog.tsx', 'interface DialogContentProps {\n  width?: DialogWidthTier | number\n  /** @deprecated 改用 width */\n  maxWidth?: string | number\n}', beta)) === 'R1', 'R1:DialogContentProps.maxWidth 標了 @deprecated 在 0.x 也應紅')
  expect(rules(checkJsxSource('packages/design-system/src/x/a.stories.tsx', 'const a = <DialogContent height="hug" maxWidth={480}><div /></DialogContent>')) === 'R2', 'R2:<DialogContent maxWidth> 應紅')
  // R5:DS 自己的 DialogContent width 只寫檔名;數字 / 含數字的運算式 / 不是檔名的字串紅,閘夾具不紅,變數交給型別
  expect(rules(checkJsxSource('packages/design-system/src/x/a.stories.tsx', 'const a = <DialogContent width={720} />')) === 'R5', 'R5:DS 範例 <DialogContent width={720}> 應紅')
  expect(rules(checkJsxSource('packages/design-system/src/x/a.tsx', 'const a = <DialogContent width={wide ? 960 : 480} />')) === 'R5', 'R5:運算式裡寫數字應紅')
  expect(rules(checkJsxSource('packages/design-system/src/x/a.tsx', 'const a = <DialogContent width="huge" />')) === 'R5', 'R5:不是檔名的字串應紅')
  expect(checkJsxSource('packages/design-system/src/x/a.stories.tsx', 'const a = <><DialogContent width="lg" /><DialogContent width={\'xl\'} /><DialogContent width={wide ? "xl" : "md"} /><DialogContent width={tier} /><Select width={160} /><SheetContent width={480} /></>').length === 0, 'R5:檔名、檔名運算式、變數、其他元件的數字寬不應紅')
  expect(checkJsxSource('scripts/test-fixtures/x/fixture.tsx', 'const a = <DialogContent width={720} />').length === 0, 'R5:閘夾具寫數字不應紅')
  expect(checkJsxSource('apps/acme/src/page.tsx', 'const a = <DialogContent width={1160} />').length === 0, 'R5:產品(apps/)自填數字寬不應紅')
  // R2 沒有例外了(2026-11-15 前放行 dialog-width 夾具量舊名相容路徑;相容路徑已移除):任何夾具寫舊名都紅
  expect(rules(checkJsxSource('scripts/test-fixtures/dialog-width/fixture.tsx', 'const a = <DialogContent width={w} maxWidth={mw} />')) === 'R2', 'R2:dialog-width 夾具寫 <DialogContent maxWidth> 也應紅(例外已拿掉)')
  expect(rules(checkJsxSource('scripts/test-fixtures/other/fixture.tsx', 'const a = <DialogContent maxWidth={480} />')) === 'R2', 'R2:其他夾具寫 <DialogContent maxWidth> 應紅')
  expect(checkJsxSource('scripts/test-fixtures/dialog-width/fixture.tsx', 'const a = <DialogContent width={w} height={h} />').length === 0, 'R2:夾具只用新名不應紅')

  // R2(閘夾具):scripts/ 腳本裡寫成字串的 JSX(2026-11-18,audit 24 項 #10)。行號必須是 .mjs 的行(指名 file:line 才修得到)。
  const gateHits = (text) => checkGateFixtureSource('scripts/x-invariant.mjs', text)
  const where = (r) => r.hits.map((h) => `${h.rule}:${h.line}`).sort().join(',')
  const harness = (attr) => ['import { x } from "y"', 'const HARNESS = `', "import { DataTable } from '@/design-system/components/DataTable/data-table'", 'function App() {', `  return <DataTable columns={COLS} data={ROWS} ${attr} spreadsheetMode />`, '}', '`'].join('\n')
  const red = gateHits(harness('height="auto"'))
  expect(where(red) === 'R2:5', `閘夾具:樣板字串裡 <DataTable height="auto"> 應紅、指名 .mjs 第 5 行(實得 ${where(red) || '0 筆'})`)
  const green = gateHits(harness('maxHeight="none"'))
  expect(green.hits.length === 0 && green.fixtures === 1, `閘夾具:同一段改成 maxHeight="none" 應綠,而且是**讀到了**那段夾具才綠(實得 ${green.hits.length} 筆 / 解析 ${green.fixtures} 段)`)
  // 單行字串 + 轉義的 \n:cooked 換行、原檔不換 → 仍指名常值那一行
  const escaped = gateHits(['const a = 1', 'const s = \'import { DataTable } from "y"\\nexport const X = () => <DataTable size="sm" height="auto" />\''].join('\n'))
  expect(where(escaped) === 'R2:2', `閘夾具:單行字串裡用 \\n 換行的 JSX 應指名常值那一行(第 2 行;實得 ${where(escaped) || '0 筆'})`)
  // 樣板有 ${…}、運算式裡再包一段樣板:兩段都要掃到,行號不因 ${…} 偏掉
  const nested = gateHits(['const H = `', '<main>', '  ${cond ? `<Input autoWidth />` : ""}', '  <Button fullWidth>送出</Button>', '</main>', '`'].join('\n'))
  expect(where(nested) === 'R2:3,R2:4', `閘夾具:\${…} 裡的樣板與其後的 JSX 都應紅、行號 3 / 4(實得 ${where(nested) || '0 筆'})`)
  // 沒提到 REMOVED_JSX 元件名的字串不解析(不是夾具);有提到但合規 → 0 筆
  const none = gateHits('const s = `<div height="auto" />`\nconst t = "<svg height=\\"16\\" />"')
  expect(none.fixtures === 0 && none.hits.length === 0, `閘夾具:不含 REMOVED_JSX 元件名的字串不應當成夾具(實得解析 ${none.fixtures} 段 / ${none.hits.length} 筆)`)
  // 範圍:scripts/ 底下所有腳本(含子目錄、閘的 meta-test、工具測試),只豁免 FIXTURE_EXEMPT 列名的檔(2026-11-18 E3 反駁 #1 #2)。
  // 每一格都是第一版(「scripts/ 第一層、結尾 -invariant.mjs」)判錯或沒驗到的那一型。
  // (檔名用合成的 —— 寫真實腳本名會被 gate-reachability 讀成「本檔呼叫了那支」)
  const scopeCells = [
    ['scripts/orders-sheet-invariant.mjs', true, '單數 *-invariant.mjs 的閘'],
    ['scripts/orders-sheet-invariants.mjs', true, '複數 *-invariants.mjs 的閘(反駁 #2:data-table-invariants.mjs 這一型第一版沒掃)'],
    ['scripts/test-orders-sheet-invariant.mjs', true, '閘的 meta-test(反駁 #1:第一版註解說 test-*.mjs 不掃,程式其實有掃,而且沒有一格驗過)'],
    ['scripts/test-orders-sheet-invariants.mjs', true, '複數閘的 meta-test'],
    ['scripts/test-orders-hook.mjs', true, '工具測試(偽表格乾淨樣本曾帶著過期的 height="auto")'],
    ['scripts/dogfood-orders-verify.mjs', true, '名字不像閘、卻寫 DS JSX 給建置用的檢查腳本'],
    ['scripts/lib/orders-harness.mjs', true, '子目錄裡的共用 harness'],
    ['scripts/user-probe/orders-probe.js', true, '.js 腳本'],
    ['scripts/orders-notes.md', false, '不是腳本'],
    ['scripts/test-fixtures/orders/fixture.tsx', false, '.tsx 歸 JSX_DIRS 那條路掃,這裡不重複'],
    ['packages/design-system/scripts/orders-invariant.mjs', false, '不在 repo 根的 scripts/ 底下'],
  ]
  for (const [rel, want, why] of scopeCells) expect(isGateFixtureFile(rel) === want, `閘夾具範圍:${rel}(${why})應${want ? '掃' : '不掃'}`)
  for (const rel of FIXTURE_EXEMPT.keys()) expect(!isGateFixtureFile(rel), `閘夾具範圍:${rel} 列在 FIXTURE_EXEMPT,不應掃`)
  // 豁免過期:檔不在(null)或已沒有舊名(0 筆)都判過期;還有舊名的不判
  const stale = staleExemptions(new Map([['scripts/a.mjs', 3], ['scripts/b.mjs', 0], ['scripts/c.mjs', null]]))
  expect(stale.join(',') === 'scripts/b.mjs,scripts/c.mjs', `豁免過期:0 筆與檔不在應判過期、還有 3 筆舊名的不判(實得 ${stale.join(',') || '無'})`)

  if (problems.length) {
    console.error(`✗ sizing-props selftest:${problems.length} 格不符`)
    for (const p of problems) console.error(`   - ${p}`)
    process.exit(1)
  }
  console.log('✓ sizing-props selftest:R1 新同義名 / 已移除的舊名加回來(0.x 標了 @deprecated 也紅;同一段在 1.0 正式版政策下綠 = 讀的是相容政策)、R2 舊寫法 JSX(含 <DialogContent maxWidth>,夾具沒有例外;scripts/ 腳本裡寫成字串的 JSX 也紅、指名 .mjs 行號,合規寫法綠且確實讀到那段;範圍含複數 *-invariants.mjs / meta-test / 工具測試 / 子目錄,只豁免列名的檔,豁免過期會判出來)、R3 size 當長度、R4 漏原生 width / height、R5 DS 的 DialogContent width 寫數字 各自會紅;合規寫法、非 *Props、svg / img 的 height、正方形媒體例外、閘夾具的數字寬不誤報')
}

// 被 import 時(例:拿檢查函式對舊版原始碼做對照)只匯出函式、不跑;判準唯一實作 lib/direct-run.mjs(經符號連結叫也認得)
if (!isDirectRun(import.meta.url)) {
  // imported — no-op
} else if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const { hits, propsFiles, jsxFiles, gateFiles, gateFixtures, staleExempt } = scanRepo()
  if (propsFiles === 0 || jsxFiles === 0 || gateFiles === 0 || gateFixtures === 0) {
    console.error(`✗ sizing-props-invariant:掃到 0 個(props ${propsFiles} 檔 / jsx ${jsxFiles} 檔 / scripts/ 腳本 ${gateFiles} 支 / 其中的字串 JSX ${gateFixtures} 段)—— 掃描範圍或夾具抽取壞了,不是乾淨(請在 repo 根目錄執行)`)
    process.exit(2)
  }
  if (hits.length || staleExempt.length) {
    console.error(`❌ sizing-props-invariant FAIL(${hits.length + staleExempt.length}):`)
    for (const h of hits) console.error(`   - ${h.rule} ${h.path}:${h.line} ${h.found}\n       → ${h.fix}`)
    for (const rel of staleExempt) console.error(`   - 豁免過期 ${rel}:檔不在了,或裡面已經沒有舊名\n       → 從本檔 FIXTURE_EXEMPT 拿掉(沒有作用的豁免就是沒人看的洞)`)
    console.error('   SSOT:packages/design-system/ds-canonical/references/props-naming.md「尺寸參數」')
    process.exit(1)
  }
  console.log(`✓ sizing-props-invariant:R1–R5 0 筆(*Props 掃 ${propsFiles} 檔、JSX 掃 ${jsxFiles} 檔、閘夾具掃 scripts/ ${gateFiles} 支腳本(豁免 ${FIXTURE_EXEMPT.size} 支,都還有作用)裡 ${gateFixtures} 段字串 JSX;已移除的舊名 ${REMOVED_PROP_NAMES.size} 個都沒回來;相容政策 ${currentPolicy().mode}(${currentPolicy().version}))`)
}
