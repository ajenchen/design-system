#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 浮層家族(Toast / Tooltip / Popover / Dialog / Sheet / FileViewer / Coachmark / HoverCard / DropdownMenu)的
 *         元件與範例遵守 2026-10-20 獨立驗證(r1b overlays)抓到的 22 條裡、沒有別的閘看得到的那幾條 ——
 *         靜態(S,DS 原始碼與閘夾具):換主題的元素一定重新宣告字色、HoverCard 外殼只消費兩份殼常數、沒有 `<DialogContent autoHeight>`、
 *         按鈕不用文字符號當圖示、退役的名稱只以「歷史」出現(同一行寫出接班者,或同一句 / 同一段註解有歷史標記「曾 / 之前 / 前的 / 退場 / 併進 / 取代」)、
 *         觸發鈕不寫實作註記 / variant 名(test-only 夾具除外)、
 *         「欄位顯示」與 DataTable 正式元件同一個字、有圖示時同一個圖示、ProfileCard 的預設欄位(ID / 員工編號)走 `defaultFieldValues` 不在 `fields` 重寫、
 *         有 `XxxLabels` 文案物件的元件不把讀屏名稱寫死成字串(FileViewer 縮小 / 放大)、它的設計規格 Props 表列出 `labels`、寫死的 key 數對得上介面、
 *         spec 說接了 I18nProvider 的元件真的呼叫 useI18n;story 裡 Button 的 variant 不用三元式隨狀態切換(目前 / 選中不是 variant);
 *         同一支 story 檔裡同一個人只有一組 ID / 員工編號;Coachmark 頁腳靠右的理由指向真正的 owner(overlay-surface.spec.md),
 *         不把「計數 / 步數」說成 action-bar「對齊方向的決定」的條件;人員名片只有一個建構器(buildPersonProfileCard);
 *         真建置(R,Storybook):深色溢出清單在淺 / 深兩種頁面對比 ≥ 4.5、亮色 HoverCard 卡有陰影、並排範例的說明在同一條線、
 *         HoverCard 原則頁的觸發點 Tab 到得了且沒有原生 title 提示、Coachmark 原則頁每顆 CTA 真的有作用、Toast 淺深兩欄各畫自己標的主題、
 *         開著的 Dialog / Sheet / FileViewer 的 aria-describedby 不指向不存在的元素、Elevation 層級對比兩張卡真的重疊、
 *         Sheet 編輯存檔後標題跟著存下的名字、通知清單地標名稱是 DS 預設中文、Coachmark / ProfileCard 預設文案沒有英文、
 *         Dialog 成員名片的 ID / 員工編號與列上一致、ProfileCard 欄位值(長 email)不畫進旁邊那一欄、多字欄位值只在空白處斷、
 *         深色溢出清單每人一列、Coachmark 頁腳(單步 / 多步)按鈕群靠右且 primary 在最右。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest`:靜態每列注入一個修前形狀(2026-10-20 前的原始碼片段)必須紅在那一列;
 *       真建置每列在頁面上拆掉修法(拿掉字色 / 陰影、移一則說明、把觸發點設成不可聚焦、換掉 CTA 的事件、拿掉欄的主題、
 *       寫回懸空的 aria-describedby、把卡片移開、把標題改回舊名、把地標名稱改回英文、把按鈕字改回英文、把兩個欄位值對調、拿掉欄位值的 break-words、
 *       把 break-words 換成 break-all、把溢出清單改成橫排、把 Coachmark 頁腳改成靠左)必須紅在那一列 —— 少一列沒紅 = 量具沒在量它宣稱的東西 → exit 1;
 *       另有「乾淨對照」:注入本來就正確的歷史句(S5)不得讓任何一列紅 —— 防止量具把對的東西判錯、逼人改寫正確的句子(M37)。
 *       對修前建置(`--build=<修前 storybook-static>`)跑 = 天然對照組。
 *   綠: 現行原始碼與建置每列都量到且符合;找不到要量的元素、story 開不起來、建置缺 = 儀器失效(exit 2,M37:沒量到 ≠ 沒發生),不讀成通過。
 *
 * 出處:tmp r1b overlays verified(獨立驗證 2026-10-15)OV-02 / OV-03 / OV-04 / OV-06 / OV-07 / OV-08 / OV-09 / OV-10 / OV-11 / OV-12 / OV-13 /
 * OV-14 / OV-15 / OV-V01 / OV-V02 / OV-V03 / OV-V04 / OV-V05 / OV-V06 / OV-V07。OV-01 由 escape-and-focus-contract-invariant.mjs F-menu-fileviewer 守,
 * OV-05 由 motion-ssot-invariant.mjs M6e 守 —— 不在這裡重量。
 * 2026-10-21 依覆核(r1b2 overlays 獨立覆核)補:S5 改量「是不是歷史句」+ 乾淨對照、S10(Labels 文件 ↔ 程式)、S11(story 的 variant 不隨狀態切換)、
 * S3 / S7 / S8 擴到同族(Dialog 家族註解、引號裡的「顯示欄位」、PersonData.fields)、S12(同檔同人一組編號)、S13(Coachmark 頁腳靠右的 owner)、
 * S14(人員名片只有一個建構器)、R13 對照改 break-words、R14(多字值只在空白處斷)、R15(深色溢出清單每人一列)、R16(Coachmark 頁腳靠右、primary 最右)。
 *
 * 用法:
 *   node scripts/overlay-story-contract-invariant.mjs                 靜態 + 真建置(預設 storybook-static)
 *   node scripts/overlay-story-contract-invariant.mjs --static-only   只跑靜態
 *   node scripts/overlay-story-contract-invariant.mjs --build=<dir>   改量另一份建置(例:修前建置 = 天然對照組)
 *   node scripts/overlay-story-contract-invariant.mjs --root=<dir>    改量另一棵原始碼(例:修前的整棵樹 = 靜態的天然對照組)
 *   node scripts/overlay-story-contract-invariant.mjs --selftest      對照組(靜態注入 + 頁面上拆修法);先跑一趟判定當基準,基準不綠就紅 ——
 *                                                                     CI 只跑這一個(npm run test:overlay-story-contract),不另跑判定
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
/** 量哪一棵原始碼(預設本 repo;`--root=<修改前的整棵樹>` = 靜態的天然對照組) */
const ROOT = resolve(arg('root', resolve(dirname(fileURLToPath(import.meta.url)), '..')))
const DS = join(ROOT, 'packages/design-system/src')
const SELFTEST = process.argv.includes('--selftest')
const STATIC_ONLY = process.argv.includes('--static-only')
const BUILD = resolve(arg('build', join(ROOT, 'storybook-static')))

// ─── 讀原始碼 ────────────────────────────────────────────────────────────────
function walk(dir, re, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, re, acc)
    else if (re.test(name)) acc.push(p)
  }
  return acc
}
function readSources() {
  const files = new Map()
  for (const p of walk(DS, /\.(tsx?|md)$/)) files.set(relative(ROOT, p), readFileSync(p, 'utf8'))
  // 閘的夾具也算(它們把 DS 元件放進頁面量;用了舊 API 一樣是教錯)
  for (const p of walk(join(ROOT, 'scripts'), /\.mjs$/)) files.set(relative(ROOT, p), readFileSync(p, 'utf8'))
  return files
}

// ─── 靜態判定 ────────────────────────────────────────────────────────────────
const TEXT_COLOR = /(?:^|[\s'"`])(?:text-foreground|text-on-emphasis|text-fg-[a-z-]+)(?=$|[\s'"`])/
/** 換主題而不宣告字色的放行標記:寫在元素那一行或正上方一行,理由 ≥ 6 字 */
const THEME_OK = /@theme-boundary-ok:\s*(\S.{4,})/
/** 退役的名稱 → 同一行必須寫出的接班者(只以歷史出現);新退役一個名稱就在這裡加一列 */
const RETIRED_NAMES = [
  { name: 'withImeSafeEscape', successor: ['withOverlayEscape'], why: '2026-10-01 併進 lib/overlay-escape.ts withOverlayEscape(OV-04)' },
  { name: '代理蓋板', successor: ['AI agent 浮層'], why: '2026-10-14 層名改為「AI agent 浮層」(OV-11)' },
  { name: '窄版抽屜', successor: ['退場'], why: 'Sidebar 窄版抽屜 2026-10-14 隨 768 斷點退場(OV-04)' },
  { name: '窄版側欄', successor: ['退場'], why: 'AppShell 窄版側欄 2026-10-14 隨 768 斷點退場(OV-04)' },
  { name: 'AppShellAside 手機', successor: ['退場'], why: 'AppShellAside 只剩並排一種形態(OV-04)' },
]
/** 「這一句在講歷史」的標記:同一行有,或同一段註解的上一行有(` * …` 續行)。2026-10-21 前只認「同一行寫出接班者」,
 *  逼得 5 句本來就正確的歷史句被改寫成同一行點名接班者(覆核指出;M37:拿「有沒有寫接班者」代替「是不是歷史句」)。 */
const HISTORY_MARKER = /曾|之前|前的|退場|併進|取代|\d{4}-\d{2}-\d{2}\s*前/
const isCommentLine = (l) => /^\s*(?:\*|\/\/|\{?\/\*)/.test(l)
const GLYPH_ICON = /[▾▴▸◂▼▲▶◀☰≡⌄]/
/** 觸發鈕的字是實作註記 / variant 名 / 佔位(OV-14、OV-08) */
const NOTE_LABEL = [
  /^(?:primary|secondary|tertiary|success|info|warning|error|neutral)(?:\s*範例)?$/i,
  /\((?:大|中|小)\s*item:/i,
  /開啟\s*Modal/i,
  /^Anchor$/,
]
const COLUMN_VISIBILITY = { label: '欄位顯示', icon: 'Eye', aliases: ['顯示欄位', '欄位顯示'] }
/** ProfileCard 預設欄位曾經用過的標籤(現行預設另從 profile-card.tsx DEFAULT_LABELS 讀):`fields` 裡出現任一個 = 把預設欄位重寫一次 */
const DEFAULT_FIELD_LABEL_ALIASES = ['ID', '員工編號', 'Employee number']
const PROFILE_CARD_SRC = 'packages/design-system/src/components/ProfileCard/profile-card.tsx'

function jsxAttrs(node) {
  const props = node.attributes?.properties ?? []
  const out = new Map()
  for (const a of props) if (ts.isJsxAttribute(a)) out.set(a.name.getText(), a)
  return out
}
const attrText = (a) => (a?.initializer ? a.initializer.getText() : null)
/** 這個節點在 `tags: ['test-only']` 的 story 裡(自動化夾具,不給人看;story-rules 三層定位不收) */
function inTestOnlyStory(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isObjectLiteralExpression(n)) {
      const tags = n.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'tags')
      if (tags && /['"]test-only['"]/.test(tags.initializer.getText())) return true
    }
  }
  return false
}

function runStatic(files, { quiet = false } = {}) {
  const red = {}
  const add = (id, msg) => { (red[id] ??= []).push(msg) }
  const constValues = new Map()
  for (const [rel, src] of files) {
    if (!/\.tsx?$/.test(rel) || !rel.startsWith('packages/')) continue
    for (const m of src.matchAll(/(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(['"`])([^'"`]*)\2/g)) constValues.set(m[1], m[3])
  }
  const classNameHasTextColor = (a) => {
    const t = attrText(a)
    if (!t) return false
    if (TEXT_COLOR.test(t)) return true
    return [...t.matchAll(/\b([A-Z_][A-Z0-9_]{3,})\b/g)].some((m) => TEXT_COLOR.test(` ${constValues.get(m[1]) ?? ''} `))
  }
  // S8 的標籤集合:現行預設(DEFAULT_LABELS 的 id / employeeNumber)+ 歷來用過的寫法
  const pcSrc = files.get(PROFILE_CARD_SRC) ?? ''
  const pcDefaults = pcSrc.match(/const DEFAULT_LABELS\b[\s\S]*?\n\}/)?.[0] ?? ''
  const currentDefaultLabels = ['id', 'employeeNumber'].map((k) => pcDefaults.match(new RegExp(`\\b${k}:\\s*'([^']+)'`))?.[1]).filter(Boolean)
  const defaultFieldLabels = new Set([...DEFAULT_FIELD_LABEL_ALIASES, ...currentDefaultLabels])
  let themeBoundaries = 0, hoverContents = 0, buttons = 0, profileCardFields = 0, labelledComponents = 0
  for (const [rel, src] of files) {
    if (!/\.tsx$/.test(rel) || !rel.startsWith('packages/design-system/src/')) continue
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const lines = src.split('\n')
    // S9:這支元件有對外的文案物件(`export interface XxxLabels`)→ 讀屏名稱一律走它,不准寫死字串
    const labelsInterface = /export interface ([A-Z][A-Za-z]*Labels)\b/.exec(src)?.[1] ?? null
    if (labelsInterface) labelledComponents++
    const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1
    const visit = (node) => {
      const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null
      if (opening) {
        const tag = opening.tagName.getText()
        const attrs = jsxAttrs(opening)
        const line = lineOf(opening.getStart())
        const where = `${rel}:${line}`
        // S1 換主題的元素重新宣告字色
        if (attrs.has('data-theme')) {
          themeBoundaries++
          const tagText = src.slice(opening.getStart(), opening.getEnd())
          const near = `${lines[line - 2] ?? ''}\n${tagText}`
          if (!classNameHasTextColor(attrs.get('className')) && !THEME_OK.test(near)) {
            add('S1', `${where} <${tag} data-theme=…> 沒有宣告字色(text-foreground 等)—— color 從外面繼承的是已解析的值,換了主題的子樹文字仍是外層主題的顏色;沒有文字的元素在上一行寫 @theme-boundary-ok: 理由`)
          }
        }
        // S2 HoverCardContent 只消費殼常數
        if (tag === 'HoverCardContent') {
          hoverContents++
          const cls = attrText(attrs.get('className')) ?? ''
          if (!/HOVER_CARD_(?:TOOLTIP_)?SURFACE_CLASS/.test(cls)) add('S2', `${where} <HoverCardContent> 的外殼沒有消費 HOVER_CARD_SURFACE_CLASS / HOVER_CARD_TOOLTIP_SURFACE_CLASS(手抄的殼漏陰影 / 字色,OV-V03 / OV-02)`)
        }
        // S9 有文案物件的元件不寫死讀屏名稱
        if (labelsInterface) {
          const al = attrs.get('aria-label')
          const init = al?.initializer
          const literal = init && (ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression) ? init.expression : null)
          if (literal) add('S9', `${where} <${tag} aria-label="${literal.text}"> 寫死在元件裡 —— 這支元件有 ${labelsInterface},讀屏名稱要走它(consumer 才換得了語言;lib/i18n/README.md「Fallback chain」;OV-10 同族)`)
        }
        // S8 ProfileCard 的預設欄位走 defaultFieldValues
        if (tag === 'ProfileCard' && attrs.has('fields')) {
          profileCardFields++
          const walkLabels = (n) => {
            if (ts.isPropertyAssignment(n) && n.name.getText() === 'label' && ts.isStringLiteralLike(n.initializer) && defaultFieldLabels.has(n.initializer.text)) {
              add('S8', `${rel}:${lineOf(n.getStart())} <ProfileCard fields> 重寫了預設欄位「${n.initializer.text}」—— 預設欄位(ID / 員工編號)的值走 defaultFieldValues={{ id, employeeNumber }}(profile-card.spec.md Props「defaultFieldValues 優於 fields 同名 label」;同名會被去重、預設標籤一改就變成兩列,OV-V01 同族)`)
            }
            ts.forEachChild(n, walkLabels)
          }
          walkLabels(attrs.get('fields'))
        }
        // S3 DialogContent autoHeight
        if (tag === 'DialogContent' && attrs.has('autoHeight')) add('S3', `${where} <DialogContent autoHeight> —— 已停用,改 height="hug"(dialog.spec.md「高度軸」;OV-09)`)
        // S6 / S7 按鈕的字
        if (tag === 'Button') {
          buttons++
          const parent = opening.parent
          const textKids = ts.isJsxElement(parent) ? parent.children.filter((c) => ts.isJsxText(c)).map((c) => c.getText().trim()).filter(Boolean).join(' ') : ''
          const label = textKids || (attrText(attrs.get('aria-label')) ?? '').replace(/^["'{]|["'}]$/g, '')
          const startIcon = (attrText(attrs.get('startIcon')) ?? '').replace(/[{}]/g, '')
          if (textKids && GLYPH_ICON.test(textKids)) add('S4', `${where} <Button> 的字用文字符號當圖示「${textKids}」—— 圖示走 startIcon / endIcon(lucide)(OV-12)`)
          if (textKids && !inTestOnlyStory(opening) && NOTE_LABEL.some((re) => re.test(textKids))) add('S6', `${where} <Button>「${textKids}」是實作註記 / variant 名 / 佔位,不是使用者會按的動作(story-rules 範例必真實業務場景;OV-14 / OV-08)`)
          if (COLUMN_VISIBILITY.aliases.includes(label) && (label !== COLUMN_VISIBILITY.label || (startIcon && startIcon !== COLUMN_VISIBILITY.icon))) {
            add('S7', `${where} 「${label}」+ ${startIcon || '(沒有圖示)'} —— 選欄位的動作全 DS 同一個字、有圖示時同一個圖示:「欄位顯示」+ Eye(DataTable 正式元件 data-table-column-visibility-panel.tsx;OV-V07)`)
          }
        }
      }
      // S8 同族:人員資料(PersonData:物件同時有 name 與 fields)經 buildPersonProfileCard 變成 <ProfileCard fields>,
      // 預設欄位寫在 fields 一樣被去重、排到別的欄位後面(2026-10-21 覆核後盤查:DataTable / PeoplePicker 範例 15 筆,修前閘只看 JSX 量不到 —— M37)
      if (ts.isPropertyAssignment(node) && node.name.getText() === 'fields' && ts.isArrayLiteralExpression(node.initializer)
        && ts.isObjectLiteralExpression(node.parent) && node.parent.properties.some((q) => ts.isPropertyAssignment(q) && q.name.getText() === 'name')) {
        profileCardFields++
        for (const el of node.initializer.elements) {
          if (!ts.isObjectLiteralExpression(el)) continue
          const lab = el.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText() === 'label')
          if (lab && ts.isStringLiteralLike(lab.initializer) && defaultFieldLabels.has(lab.initializer.text)) {
            add('S8', `${rel}:${lineOf(lab.getStart())} 人員資料的 fields 重寫了預設欄位「${lab.initializer.text}」—— 走 PersonData 的 id / employeeNumber(buildPersonProfileCard 轉成 defaultFieldValues;寫在 fields 會被去重、排到其他預設欄位後面)`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  // S3 也掃閘夾具(.mjs 裡的 JSX 字串)
  for (const [rel, src] of files) {
    if (!rel.startsWith('scripts/') || rel === 'scripts/overlay-story-contract-invariant.mjs') continue
    for (const m of src.matchAll(/<DialogContent\b[^>]*\bautoHeight\b/g)) add('S3', `${rel}:${src.slice(0, m.index).split('\n').length} 閘夾具 <DialogContent autoHeight>(OV-09)`)
  }
  // S3 同族:Dialog 家族(與 lib)的註解 / 文件不得把 autoHeight 當現行用法教 —— 同一句要寫已停用 / 接班者(覆核 2026-10-21:dialog.tsx 檔頭還在教)
  for (const [rel, src] of files) {
    if (!/^packages\/design-system\/src\/(?:components\/Dialog\/|lib\/)/.test(rel)) continue
    src.split('\n').forEach((l, i) => {
      if (!/\bautoHeight\b/.test(l)) return
      const prose = /\.md$/.test(rel) || /^\s*(?:\*|\/\/|\{?\/\*)/.test(l) || /\.stories\.tsx$/.test(rel)
      if (prose && !/height="hug"|deprecated|已停用|停用/.test(l)) add('S3', `${rel}:${i + 1} 把 autoHeight 寫成現行用法 —— 已停用,同一句寫 height="hug" 或「已停用」(dialog.spec.md「高度軸」;OV-09 同族)`)
    })
  }
  // S7 同族:文字裡把這個動作叫做「顯示欄位」(引號裡的名稱)只能是歷史句(覆核 2026-10-21:popover 原則頁註解)
  for (const [rel, src] of files) {
    if (!rel.startsWith('packages/design-system/src/')) continue
    src.split('\n').forEach((l, i) => { if (l.includes('「顯示欄位」') && !HISTORY_MARKER.test(l)) add('S7', `${rel}:${i + 1} 用「顯示欄位」稱呼選欄位的動作 —— 全 DS 叫「欄位顯示」(OV-V07 同族)`) })
  }
  // S12 同一支檔案裡,同一個人只有一組 ID / 員工編號(範例資料自洽,mindset #4;覆核 2026-10-21:hover-card.stories.tsx Ada Chen E-4821 vs 1048217)
  for (const [rel, src] of files) {
    if (!/\.stories\.tsx$/.test(rel) || !rel.startsWith('packages/design-system/src/')) continue
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const seen = new Map()
    const note = (name, key, value, pos) => {
      if (!name || !value) return
      const k = `${name}\u0000${key}`
      const prev = seen.get(k)
      if (!prev) seen.set(k, { value, line: sf.getLineAndCharacterOfPosition(pos).line + 1 })
      else if (prev.value !== value) add('S12', `${rel}:${sf.getLineAndCharacterOfPosition(pos).line + 1} 「${name}」的${key === 'id' ? ' ID' : '員工編號'}「${value}」與同檔 :${prev.line}「${prev.value}」不同 —— 同一個人只有一組(mindset #4 範例資料自洽)`)
    }
    const str = (n) => (n && ts.isStringLiteralLike(n) ? n.text : null)
    const prop = (obj, k) => obj.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText() === k)?.initializer
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const a = jsxAttrs(node)
        const name = a.get('name')?.initializer
        const dfv = a.get('defaultFieldValues')?.initializer
        const obj = dfv && ts.isJsxExpression(dfv) && dfv.expression && ts.isObjectLiteralExpression(dfv.expression) ? dfv.expression : null
        if (name && ts.isStringLiteral(name) && obj) {
          note(name.text, 'id', str(prop(obj, 'id')), node.getStart())
          note(name.text, 'employeeNumber', str(prop(obj, 'employeeNumber')), node.getStart())
        }
      }
      if (ts.isObjectLiteralExpression(node)) {
        const name = str(prop(node, 'name'))
        if (name) {
          note(name, 'id', str(prop(node, 'id')) ?? str(prop(node, 'account')), node.getStart())
          note(name, 'employeeNumber', str(prop(node, 'employeeNumber')), node.getStart())
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  // S13 Coachmark 頁腳靠右的理由:對齊的 owner 是 overlay-surface.spec.md(SurfaceFooter justify-end,單側 justify-between);
  // action-bar.spec.md「對齊方向的決定」只講「標題」—— 把「計數 / 步數」說成那一條的條件 = 編出來的理由(M36;覆核 2026-10-21 題 3:單步卡沒有計數照樣靠右)
  for (const [rel, src] of files) {
    if (!rel.startsWith('packages/design-system/src/') || !/\.(md|tsx)$/.test(rel)) continue
    src.split('\n').forEach((l, i) => {
      for (const sentence of l.split('。')) if (/對齊方向的決定/.test(sentence) && /計數|步數/.test(sentence)) add('S13', `${rel}:${i + 1} 把「計數 / 步數」寫成 action-bar.spec.md「對齊方向的決定」的條件 —— 那一條只講標題;浮層頁腳靠右的 owner 是 overlay-surface.spec.md「底部區域:按鈕列 vs 列式」(SurfaceFooter)`)
    })
  }
  const coachSpec = files.get('packages/design-system/src/components/Coachmark/coachmark.spec.md')
  if (coachSpec) {
    const sec = coachSpec.split(/\n## /).find((x) => x.startsWith('Footer 按鈕順序')) ?? ''
    if (!sec) add('INSTRUMENT', 'S13 coachmark.spec.md 找不到「## Footer 按鈕順序」段 —— 量具對不上文件')
    else if (!/overlay-surface\.spec\.md/.test(sec)) add('S13', 'packages/design-system/src/components/Coachmark/coachmark.spec.md「Footer 按鈕順序」沒有指向對齊的 owner overlay-surface.spec.md(浮層頁腳靠右、單步也一樣)')
  }
  // S14 人員名片只有一個建構器:DS 原始碼(story 檔與 ProfileCard 自己以外)直接組 <ProfileCard> 的只准 PeoplePicker/person-display.tsx 的
  // buildPersonProfileCard(它的檔頭:「任何 person avatar consumer 都走這個 helper,不可繞道」;覆核 2026-10-21:stories-helpers 多造一份)
  for (const [rel, src] of files) {
    if (!/\.tsx$/.test(rel) || /\.stories\.tsx$/.test(rel) || !rel.startsWith('packages/design-system/src/')) continue
    if (/components\/ProfileCard\/profile-card\.tsx$|components\/PeoplePicker\/person-display\.tsx$/.test(rel)) continue
    src.split('\n').forEach((l, i) => { if (/<ProfileCard\b/.test(l) && !/^\s*(?:\*|\/\/)/.test(l)) add('S14', `${rel}:${i + 1} 自己組 <ProfileCard> —— 人員名片走 buildPersonProfileCard(PeoplePicker/person-display.tsx,M17 / M23(d))`) })
  }
  // S5 退役名稱只以歷史出現
  for (const [rel, src] of files) {
    if (!rel.startsWith('packages/design-system/src/')) continue
    src.split('\n').forEach((l, i, all) => {
      for (const r of RETIRED_NAMES) {
        if (!l.includes(r.name) || r.successor.some((s) => l.includes(s)) || HISTORY_MARKER.test(l)) continue
        const prev = all[i - 1] ?? ''
        if (isCommentLine(l) && isCommentLine(prev) && HISTORY_MARKER.test(prev)) continue
        add('S5', `${rel}:${i + 1} 「${r.name}」已退役(${r.why})—— 只能以歷史出現:同一行寫出接班者(${r.successor.join(' / ')}),或寫成歷史句(曾 / 之前 / 前的 / 退場 / 併進 / 取代)`)
      }
    })
  }
  // S10 有 XxxLabels 的元件:文件與程式一致(設計規格 Props 表列出 labels、寫死的 key 數對得上介面、spec 說接了 I18nProvider 就真的呼叫 useI18n)
  const labelledPropsTables = new Set()
  const s10 = new Set()
  for (const [rel, src] of files) {
    if (!/\.tsx$/.test(rel) || /\.stories\.tsx$/.test(rel) || !rel.startsWith('packages/design-system/src/')) continue
    if (!/export interface [A-Z][A-Za-z]*Labels\b/.test(src)) continue
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const ifaces = new Map()
    ts.forEachChild(sf, (n) => { if (ts.isInterfaceDeclaration(n)) ifaces.set(n.name.text, n) })
    const dir = rel.slice(0, rel.lastIndexOf('/') + 1)
    const siblings = [...files.keys()].filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/'))
    for (const [name, decl] of ifaces) {
      if (!/Props$/.test(name)) continue
      const members = decl.members.map((m) => m.name?.getText()).filter(Boolean)
      const labelsMember = decl.members.find((m) => m.name?.getText() === 'labels')
      const labelsType = labelsMember?.type?.getText().match(/\b([A-Z][A-Za-z]*Labels)\b/)?.[1]
      if (!labelsType || !ifaces.has(labelsType)) continue
      const keyCount = ifaces.get(labelsType).members.length
      for (const anatomy of siblings.filter((k) => k.endsWith('.anatomy.stories.tsx'))) {
        const a = files.get(anatomy)
        const listed = new Set([...a.matchAll(/\[\s*'([A-Za-z][A-Za-z0-9]*)'\s*,/g), ...a.matchAll(/<tr>\s*<Td mono>([A-Za-z][A-Za-z0-9]*)<\/Td>/g)].map((m) => m[1]))
        if (members.filter((m) => listed.has(m)).length < 3) continue // 不是這支元件的 Props 表
        labelledPropsTables.add(anatomy)
        if (!listed.has('labels')) s10.add(`${anatomy} 的 Props 表列了 ${name} 的其他 prop,卻沒有 labels(${labelsType})—— 元件、spec、story 三處同步(AGENTS.md mindset #3;覆核 2026-10-21)`)
        a.split('\n').forEach((l, i) => {
          const m = /(?:\[\s*'labels'|<Td mono>labels<\/Td>)[\s\S]*?(\d+)\s*(?:keys?|個\s*key)/.exec(l)
          if (m && Number(m[1]) !== keyCount) s10.add(`${anatomy}:${i + 1} labels 寫死「${m[1]} keys」,${labelsType} 實際 ${keyCount} 個 —— 數字不寫死(SSOT auto-sync),或至少對得上`)
        })
      }
    }
    for (const spec of siblings.filter((k) => k.endsWith('.spec.md'))) {
      files.get(spec).split('\n').forEach((l, i) => {
        if (/I18nProvider/.test(l) && !/還沒接|未接|尚未|沒有接/.test(l) && !/\buseI18n\(/.test(src)) s10.add(`${spec}:${i + 1} 說這支元件的文案經 I18nProvider,但 ${rel} 沒有呼叫 useI18n() —— 文件宣稱 ≠ 程式(M32 子規則;lib/i18n/README.md「Migration status」)`)
      })
    }
  }
  for (const msg of s10) add('S10', msg)
  // S11 story 裡的 Button variant 不用三元式隨狀態切換(啟用態 / 目前 / 選中不是 variant)
  for (const [rel, src] of files) {
    if (!/\.stories\.tsx$/.test(rel) || !rel.startsWith('packages/design-system/src/')) continue
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === 'Button') {
        const v = jsxAttrs(node).get('variant')?.initializer
        const e = v && ts.isJsxExpression(v) ? v.expression : null
        if (e && ts.isConditionalExpression(e) && ts.isStringLiteralLike(e.whenTrue) && ts.isStringLiteralLike(e.whenFalse) && e.whenTrue.text !== e.whenFalse.text) {
          add('S11', `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} <Button variant={${e.condition.getText()} ? '${e.whenTrue.text}' : '${e.whenFalse.text}'}> —— 「目前 / 選中」不是 variant(action-bar.spec.md「業務操作」允許 variant、pagination.spec.md「vs Button secondary」);多選一走 SegmentedControl(button.spec.md「何時不用」),導覽的「目前那一步」由浮出的卡指出`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  if (currentDefaultLabels.length !== 2 && !quiet) add('INSTRUMENT', `S8 從 ${PROFILE_CARD_SRC} 讀不到 DEFAULT_LABELS 的 id / employeeNumber —— 量具對不上元件`)
  const counts = { themeBoundaries, hoverContents, buttons, profileCardFields, labelledComponents, labelledPropsTables: labelledPropsTables.size }
  if (!quiet) for (const [k, v] of Object.entries(counts)) if (v === 0) add('INSTRUMENT', `靜態掃描 ${k} = 0 —— 什麼都沒掃到`)
  return { red, counts }
}

// ─── 結果 ────────────────────────────────────────────────────────────────────
// 浮層內容本身 = popper 外框的直接子元素(`[data-radix-popper-content-wrapper] > [data-state]`):內容裡的 Tooltip 觸發點等也帶 data-state,不能用後代選擇器
const ROWS = {
  S1: '換了主題(data-theme)的元素重新宣告字色(alert.tsx「data-theme 必須搭配 text-foreground」、M3;OV-02 / OV-03)',
  S2: 'HoverCardContent 的外殼只消費 HOVER_CARD_SURFACE_CLASS / HOVER_CARD_TOOLTIP_SURFACE_CLASS(OV-06 / OV-V03 / OV-02;M17)',
  S3: '沒有 <DialogContent autoHeight>(已停用的 API;DS 原始碼與閘夾具都不准用,OV-09)',
  S4: '按鈕不用文字符號(▾ ☰ …)當圖示(OV-12)',
  S5: '退役的名稱只以歷史出現(同一行寫出接班者,或寫成歷史句;OV-04 / OV-11)',
  S6: '觸發鈕的字是使用者會按的動作,不是實作註記 / variant 名 / 佔位(OV-14 / OV-08)',
  S7: '「欄位顯示」全 DS 同一個字、有圖示時同一個 Eye 圖示(OV-V07)',
  S8: 'ProfileCard 的預設欄位(ID / 員工編號)走 defaultFieldValues,不在 fields 裡重寫(profile-card.spec.md;OV-V01 同族)',
  S9: '有 XxxLabels 文案物件的元件,讀屏名稱不寫死字串(lib/i18n/README.md;OV-10 同族)',
  S10: '有 XxxLabels 文案物件的元件:設計規格 Props 表列出 labels、寫死的 key 數對得上介面、spec 說接了 I18nProvider 就真的呼叫 useI18n(覆核 2026-10-21;OV-10 同族)',
  S12: '同一支 story 檔裡,同一個人只有一組 ID / 員工編號(範例資料自洽;覆核 2026-10-21,HoverCard Ada Chen 同族)',
  S13: 'Coachmark 頁腳靠右的理由指向真正的 owner(overlay-surface.spec.md);不把「計數 / 步數」說成 action-bar「對齊方向的決定」的條件(覆核 2026-10-21 題 3)',
  S14: '人員名片只有一個建構器 buildPersonProfileCard(story 共用 helper 不另組 <ProfileCard>;覆核 2026-10-21)',
  S11: 'story 裡 Button 的 variant 不用三元式隨狀態切換(目前 / 選中不是 variant;覆核 2026-10-21,Coachmark 錨點同族)',
  R1: '深色溢出清單(OverflowIndicator / HoverCard 深色殼)的文字在淺 / 深兩種頁面對比 ≥ 4.5:1(OV-02)',
  R2: '亮色 HoverCard 卡有 elevation-200 陰影(OV-V03)',
  R3: '並排範例的說明在同一條線(md / lg;OV-13)',
  R4: 'HoverCard 原則頁:@mention 觸發點 Tab 到得了、到了就開卡;頁面沒有原生 title 提示(OV-V02 / OV-07)',
  R5: 'Coachmark 原則頁每顆 CTA 真的有作用:知道了 / 略過 / 完成 關卡片,下一步 / 上一步 換步(OV-08)',
  R6: 'Toast「有標題與描述」淺 / 深兩欄各畫自己標的主題,欄標在兩種頁面都看得清楚(OV-03)',
  R7: '開著的 Dialog / Sheet / FileViewer:aria-describedby 不指向不存在的元素,也不印 Missing Description 警告(OV-15)',
  R8: 'Elevation「層級對比」Popover 卡真的疊在 Card 上(OV-V06)',
  R9: 'Sheet「編輯成員詳情」改名存檔後再打開,標題與觸發鈕跟著存下的名字(OV-V04)',
  R10: '通知清單地標名稱是 DS 預設中文「通知」(OV-V05)',
  R11: 'Coachmark / ProfileCard 預設文案沒有英文(OV-10)',
  R12: 'Dialog「主體放清單」成員名片的 ID / 員工編號與列上一致、狀態與狀態訊息不矛盾(OV-V01)',
  R13: 'ProfileCard 欄位值在自己那一欄內斷行,不畫進旁邊那一欄(description-list.spec.md「長值換行」;2026-10-20 視覺稽查同族)',
  R14: 'ProfileCard 多字欄位值只在空白處斷(description-list.spec.md「長值換行」直式自然流文字依字詞換行;只有比整欄還寬的字才准在字中斷;覆核 2026-10-21)',
  R16: 'Coachmark 頁腳(單步 / 多步)按鈕群靠右、primary 在最右(overlay-surface.spec.md SurfaceFooter + action-bar.spec.md「全局排序」;覆核 2026-10-21 題 3)',
  R15: '深色溢出清單每人一列(同 hover-card.stories.tsx「溢出清單」/ overflow-indicator.stories.tsx 正規用法 flex-col;覆核 2026-10-21)',
}
const results = new Map()
const mark = (id, ok, detail = []) => {
  const prev = results.get(id)
  results.set(id, { ok: (prev?.ok ?? true) && ok, detail: [...(prev?.detail ?? []), ...detail] })
}
const instrument = []

// ─── 真建置 ──────────────────────────────────────────────────────────────────
async function runRuntime({ mutateRow = null } = {}) {
  const { launchBrowser, openStory, requireStorybookBuild, requireFreshStorybookBuild, StoryRenderInstrumentError } = await import('./lib/launch-browser.mjs')
  const { startA11yStaticServer } = await import('./lib/a11y-static-server.mjs')
  // 預設建置要比 DS 原始碼新(過時 = STALE-BUILD,缺前置);`--build=` 指名另一份建置(天然對照組)時只要求它存在
  if (process.argv.some((a) => a.startsWith('--build='))) requireStorybookBuild(join(BUILD, 'index.json'))
  else requireFreshStorybookBuild(BUILD, ['packages/design-system/src'])
  const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
  const browser = await launchBrowser()
  const out = new Map()
  const rec = (id, ok, detail) => { const p = out.get(id) ?? { ok: true, detail: [] }; out.set(id, { ok: p.ok && ok, detail: ok ? p.detail : [...p.detail, detail] }) }
  const fail = (msg) => { throw new StoryRenderInstrumentError({ storyId: '(overlay-story-contract)', kind: 'instrument', reason: msg }) }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const consoleLines = []
  page.on('console', (m) => consoleLines.push(m.text()))
  const open = async (id, { theme = 'light', density = 'md' } = {}) => {
    consoleLines.length = 0
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent(`theme:${theme};density:${density}`)}`, { settleFrames: 3, notFound: server.notFound, label: id })
    await page.mouse.move(0, 0)
  }
  const waitFor = async (fn, arg, what, timeout = 8000) => {
    try { await page.waitForFunction(fn, arg, { timeout, polling: 'raf' }) } catch { fail(`等不到:${what}`) }
  }
  const settle = (ms = 400) => page.waitForTimeout(ms)
  /** 有一層看得見的陰影(模糊半徑 > 0;Tailwind 的透明佔位層 `rgba(0, 0, 0, 0) 0px 0px 0px 0px` 不算) */
  const hasShadow = (v) => !!v && v !== 'none' && v.split(/,(?![^(]*\))/).some((layer) => !/rgba\(0, 0, 0, 0\)/.test(layer) && /\d+px\s+-?\d+px\s+[1-9]/.test(layer))
  // 對照組:'ALL' = 每一列量測前一刻套上它自己的拆法(每列都在新開的頁面上量,拆法不會漏到別列)
  const mutate = async (row) => { if (mutateRow === 'ALL' || mutateRow === row) await page.evaluate(MUTATIONS[row]) }
  // 頁面端工具:合成色、對比
  await page.addInitScript(() => {
    window.__ov = {
      rgb(css, under) {
        const c = window.__ovCanvas ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.clearRect(0, 0, 1, 1)
        if (under) { ctx.fillStyle = under; ctx.fillRect(0, 0, 1, 1) }
        ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return `rgb(${d[0]}, ${d[1]}, ${d[2]})`
      },
      bgOf(el) {
        const pageBg = getComputedStyle(document.body).backgroundColor
        for (let n = el; n; n = n.parentElement) {
          const b = getComputedStyle(n).backgroundColor
          if (b && !/rgba?\(0, 0, 0, 0\)|transparent/.test(b)) return window.__ov.rgb(b, window.__ov.rgb(pageBg, '#fff'))
        }
        return window.__ov.rgb(pageBg, '#fff')
      },
      lum(rgb) {
        const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      },
      contrast(el) {
        const bg = window.__ov.bgOf(el)
        const fg = window.__ov.rgb(getComputedStyle(el).color, bg)
        const [a, b] = [window.__ov.lum(fg), window.__ov.lum(bg)].sort((x, y) => y - x)
        return { ratio: (a + 0.05) / (b + 0.05), fg, bg }
      },
      /** 元素裡每個自己帶字的可見節點 */
      textNodes(root) {
        const out = []
        for (const el of [root, ...root.querySelectorAll('*')]) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          const r = el.getBoundingClientRect()
          if (own && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') out.push(el)
        }
        return out
      },
    }
  })
  const openHoverCard = async (triggerSelector, what) => {
    const t = await page.$(triggerSelector)
    if (!t) fail(`找不到觸發點 ${what}(${triggerSelector})`)
    await t.hover()
    await waitFor(() => !!document.querySelector('[data-radix-popper-content-wrapper] [data-state="open"], [data-radix-popper-content-wrapper] [data-state="delayed-open"], [data-radix-popper-content-wrapper] [data-state="instant-open"]'), null, `${what} 的卡片打開`)
    await settle(350)
  }
  const closeHoverCards = async () => {
    await page.mouse.move(2, 2)
    await page.waitForFunction(() => !document.querySelector('[data-radix-popper-content-wrapper]'), null, { timeout: 4000 }).catch(() => {})
  }

  try {
    // R1 深色溢出清單對比
    const DARK_LISTS = [
      ['design-system-internal-hovercard-展示--overflow-list', 'HoverCard 展示「溢出清單」'],
      ['design-system-internal-overflowindicator-展示--avatar-stack-overflow', 'OverflowIndicator 展示「頭像堆疊」'],
      ['design-system-internal-hovercard-設計規格--visual-variants', 'HoverCard 設計規格「深色 Tooltip 樣式」'],
    ]
    for (const [id, what] of DARK_LISTS) {
      for (const theme of ['light', 'dark']) {
        await open(id, { theme })
        // 2026-10-20 前設計規格頁的深色範例是一顆 Button「+3 位協作者」(不是 OverflowIndicator);天然對照組(修前建置)要量得到它
        await openHoverCard('#storybook-root [data-overflow-indicator], #storybook-root button:has-text("+3 位協作者")', `${what} +N`)
        await mutate('R1')
        const r = await page.evaluate(() => {
          const card = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-theme="dark"][data-state]')].pop()
          if (!card) return null
          return window.__ov.textNodes(card).map((el) => ({ text: el.textContent.trim().slice(0, 16), ...window.__ov.contrast(el) }))
        })
        if (!r || r.length === 0) fail(`${what}(${theme})深色清單裡量不到任何文字`)
        const bad = r.filter((x) => x.ratio < 4.5)
        rec('R1', bad.length === 0, `${what} ${theme} 頁:${bad.map((b) => `「${b.text}」${b.ratio.toFixed(2)}:1(${b.fg} on ${b.bg})`).join('、')}`)
        await closeHoverCards()
      }
    }

    // R15 深色溢出清單每人一列:清單裡的名字(頭像裡的字母不算)兩兩不在同一行
    for (const [id, what] of DARK_LISTS) {
      for (const density of ['md', 'lg']) {
        await open(id, { density })
        await openHoverCard('#storybook-root [data-overflow-indicator], #storybook-root button:has-text("+3 位協作者")', `${what} +N`)
        await mutate('R15')
        const r = await page.evaluate(() => {
          const card = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-theme="dark"][data-state]')].pop()
          if (!card) return null
          const names = window.__ov.textNodes(card).filter((el) => !el.closest('[role="img"], [data-avatar-size]')).map((el) => { const b = el.getBoundingClientRect(); return { text: el.textContent.trim().slice(0, 12), mid: b.top + b.height / 2 } })
          const same = []
          for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (Math.abs(names[i].mid - names[j].mid) < 2) same.push(`「${names[i].text}」「${names[j].text}」`)
          return { n: names.length, same }
        })
        if (!r || r.n < 2) fail(`${what}(${density})深色清單裡量不到兩個以上的名字`)
        rec('R15', r.same.length === 0, `${what} ${density}:同一行 ${r.same.join('、')}`)
        await closeHoverCards()
      }
    }

    // R2 亮色卡陰影 + R3 說明對齊(TriggerShowcase)
    for (const density of ['md', 'lg']) {
      await open('design-system-internal-hovercard-展示--trigger-showcase', { density })
      await mutate('R3')
      const tops = await page.evaluate(() => [...document.querySelectorAll('#storybook-root span')].filter((s) => /^trigger:/.test(s.textContent.trim())).map((s) => s.getBoundingClientRect().top))
      if (tops.length !== 3) fail(`觸發點類型與延遲:說明數 ${tops.length}(應為 3)`)
      rec('R3', Math.max(...tops) - Math.min(...tops) <= 0.5, `TriggerShowcase ${density}:三則說明上緣 ${tops.map((t) => t.toFixed(1)).join(' / ')}`)
    }
    await open('design-system-internal-hovercard-展示--trigger-showcase')
    for (const [sel, what] of [
      ['#storybook-root [role="img"][aria-label="Ada Chen"], #storybook-root button[aria-label="Ada Chen 個人資訊"]', 'trigger: Avatar'],
      ['#storybook-root button:has-text("查看位置")', 'trigger: Button'],
      ['#storybook-root a:has-text("PR #1,234")', 'trigger: text link'],
    ]) {
      await openHoverCard(sel, what)
      await mutate('R2')
      const shadow = await page.evaluate(() => { const c = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state]')].pop(); return c ? getComputedStyle(c).boxShadow : null })
      if (shadow == null) fail(`${what} 卡片不見了`)
      rec('R2', hasShadow(shadow), `TriggerShowcase ${what}:box-shadow ${shadow}`)
      await closeHoverCards()
    }

    // R2 / R3 / R4 HoverCard 原則頁
    for (const density of ['md', 'lg']) {
      await open('design-system-internal-hovercard-設計原則--usage-guidance', { density })
      await mutate('R3')
      const tops = await page.evaluate(() => ['HoverCard(可點按鈕)', 'Tooltip(純文字提示)'].map((t) => [...document.querySelectorAll('#storybook-root p')].find((p) => p.textContent.trim() === t)?.getBoundingClientRect().top ?? null))
      if (tops.some((t) => t == null)) fail('HoverCard 原則頁找不到「判斷法」的兩則說明')
      rec('R3', Math.abs(tops[0] - tops[1]) <= 0.5, `HoverCard 原則「判斷法」${density}:兩則說明上緣 ${tops.map((t) => t.toFixed(1)).join(' / ')}`)
    }
    // 同族(說明在下的並排):CircularProgress 原則「達 100% 不 swap」那一列
    for (const density of ['md', 'lg']) {
      await open('design-system-components-circularprogress-設計原則--usage-guidance', { density })
      const tops = await page.evaluate(() => [...document.querySelectorAll('#storybook-root p')].filter((p) => /穩態停留 100%|Swap 為 Check icon/.test(p.textContent)).map((p) => p.getBoundingClientRect().top))
      if (tops.length !== 2) fail(`CircularProgress 原則頁「達 100% 不 swap」說明數 ${tops.length}(應為 2)`)
      rec('R3', Math.abs(tops[0] - tops[1]) <= 0.5, `CircularProgress 原則「達 100% 不 swap」${density}:兩則說明上緣 ${tops.map((t) => t.toFixed(1)).join(' / ')}`)
    }
    await open('design-system-internal-hovercard-設計原則--usage-guidance')
    for (const [sel, what] of [
      ['#storybook-root a:has-text("使用者手冊")', '使用者手冊'],
      ['#storybook-root button:has-text("刪除帳號")', '刪除帳號(反例)'],
    ]) {
      await openHoverCard(sel, what)
      await mutate('R2')
      const shadow = await page.evaluate(() => { const c = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state]')].pop(); return c ? getComputedStyle(c).boxShadow : null })
      rec('R2', hasShadow(shadow), `HoverCard 原則 ${what}:box-shadow ${shadow}`)
      await closeHoverCards()
    }
    await open('design-system-internal-hovercard-設計原則--usage-guidance')
    await mutate('R4')
    const titled = await page.evaluate(() => [...document.querySelectorAll('#storybook-root [title]')].map((e) => `${e.tagName}「${e.textContent.trim().slice(0, 12)}」title=${e.getAttribute('title')}`))
    rec('R4', titled.length === 0, `原則頁用原生 title 當提示:${titled.join('、')}`)
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
    let reached = false, opened = false
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() => /@Ada Chen/.test(document.activeElement?.textContent ?? '') && document.activeElement !== document.body)
    }
    if (reached) {
      opened = await page.waitForFunction(() => !!document.querySelector('[data-radix-popper-content-wrapper] [data-state]'), null, { timeout: 4000 }).then(() => true, () => false)
    }
    rec('R4', reached && opened, `@Ada Chen 觸發點:Tab 60 下${reached ? '到得了' : '到不了'}${reached ? (opened ? '、開了卡' : '、聚焦後沒開卡') : ''}`)
    await closeHoverCards()

    // R5 Coachmark 原則頁 CTA
    const CLOSE = ['知道了', '完成', '略過', 'Done', 'Skip']
    const STEP = ['下一步', '上一步', 'Next', 'Previous']
    let coachTried = 0
    for (const id of ['design-system-components-coachmark-設計原則--usage-guidance', 'design-system-components-coachmark-設計原則--multi-step-best-practices-rule', 'design-system-components-coachmark-設計原則--media-content-rule']) {
      await open(id)
      const triggerCount = await page.evaluate(() => document.querySelectorAll('#storybook-root button[aria-haspopup="dialog"]').length)
      for (let ti = 0; ti < triggerCount; ti++) {
        // 每顆觸發鈕、每顆 CTA 都從乾淨的頁面開始(上一個動作改過的步驟不帶過來)
        const probe = async (ctaText) => {
          await open(id)
          const t = (await page.$$('#storybook-root button[aria-haspopup="dialog"]'))[ti]
          if (!t) return { skip: true }
          await t.click()
          const card = await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('[data-popover-footer], footer, div') && d.className.includes('w-80')) ?? null, null, { timeout: 3000, polling: 'raf' }).catch(() => null)
          if (!card) return { skip: true }
          await settle(250)
          const before = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.className.includes('w-80')); return d ? { text: d.textContent, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null })
          if (!ctaText) return { buttons: before.buttons }
          await mutate('R5')
          let b = null
          for (const h of await page.$$('[role="dialog"].w-80 button')) if ((await h.textContent())?.trim() === ctaText) { b = h; break }
          if (!b) return { skip: true }
          await b.click()
          await settle(500)
          const after = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.className.includes('w-80') && x.getAttribute('data-state') !== 'closed'); return d ? d.textContent : null })
          return { before: before.text, after }
        }
        const first = await probe(null)
        if (first.skip) continue
        for (const cta of first.buttons.filter((x) => CLOSE.includes(x) || STEP.includes(x))) {
          coachTried++
          const r = await probe(cta)
          if (r.skip) continue
          const ok = CLOSE.includes(cta) ? r.after == null : r.after != null && r.after !== r.before
          rec('R5', ok, `${id.split('--')[1]} 第 ${ti + 1} 顆錨點的「${cta}」:${CLOSE.includes(cta) ? '應關閉卡片,實際' + (r.after == null ? '已關' : '沒關') : '應換步,實際' + (r.after == null ? '卡片不見' : r.after === r.before ? '沒換' : '已換')}`)
        }
      }
    }
    if (coachTried === 0) fail('Coachmark 原則頁一顆 CTA 都沒量到')

    // R6 Toast 淺深兩欄
    for (const theme of ['light', 'dark']) {
      await open('design-system-components-toast-展示--with-description', { theme })
      await mutate('R6')
      const r = await page.evaluate(() => {
        const ref = (mode) => { const d = document.createElement('div'); d.setAttribute('data-theme', mode); d.className = 'bg-canvas'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return window.__ov.rgb(c, '#fff') }
        return ['light', 'dark'].map((mode) => {
          const cap = [...document.querySelectorAll('#storybook-root span')].find((s) => s.textContent.trim() === `${mode} mode`)
          const box = cap?.nextElementSibling
          if (!cap || !box) return null
          return { mode, caption: window.__ov.contrast(cap).ratio, box: window.__ov.rgb(getComputedStyle(box).backgroundColor, '#fff'), want: ref(mode) }
        })
      })
      if (r.some((x) => !x)) fail('Toast「有標題與描述」找不到 light mode / dark mode 兩欄')
      for (const x of r) {
        rec('R6', x.box === x.want, `${theme} 頁「${x.mode} mode」欄的示範框底色 ${x.box} ≠ ${x.mode} 主題的 canvas ${x.want}`)
        rec('R6', x.caption >= 4.5, `${theme} 頁「${x.mode} mode」欄標對比 ${x.caption.toFixed(2)}:1`)
      }
    }

    // R7 aria-describedby
    for (const id of ['design-system-components-dialog-展示--open-snapshot', 'design-system-components-dialog-展示--list-body', 'design-system-components-dialog-展示--header-actions', 'design-system-components-sheet-展示--open-snapshot', 'design-system-components-fileviewer-展示--open-snapshot']) {
      await open(id)
      await waitFor(() => !!document.querySelector('[role="dialog"][data-state="open"]'), null, `${id} 開著的對話框`)
      await settle(300)
      await mutate('R7')
      const r = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][data-state="open"]')].map((d) => {
        const ids = (d.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
        return { dangling: ids.filter((x) => !document.getElementById(x)) }
      }))
      const dangling = r.flatMap((x) => x.dangling)
      const warned = consoleLines.filter((l) => /Missing `Description`/.test(l))
      rec('R7', dangling.length === 0 && warned.length === 0, `${id.split('--').join(' ')}:aria-describedby 指向不存在的 ${dangling.join(', ') || '-'};Missing Description 警告 ${warned.length} 次`)
    }

    // R8 Elevation 層級對比
    await open('design-system-tokens-elevation--overview')
    await mutate('R8')
    const ov = await page.evaluate(() => {
      const box = (t) => [...document.querySelectorAll('#storybook-root span')].find((s) => s.textContent.trim() === t)?.parentElement?.getBoundingClientRect()
      const a = box('Card（100）'), b = box('Popover（200）')
      if (!a || !b) return null
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      return { w, h }
    })
    if (!ov) fail('Elevation 總覽找不到 Card(100)/ Popover(200)兩張卡')
    rec('R8', ov.w > 0 && ov.h > 0, `層級對比兩張卡重疊 ${Math.max(0, ov.w).toFixed(0)} × ${Math.max(0, ov.h).toFixed(0)}px`)

    // R9 Sheet 編輯改名
    await open('design-system-components-sheet-展示--edit-user-right')
    const trig = async () => (await page.$('#storybook-root button:has-text("編輯")')) ?? (await page.$('#storybook-root button:has-text("檢視成員詳情")'))
    let tb = await trig()
    if (!tb) fail('Sheet 編輯成員:找不到觸發鈕')
    await tb.click()
    await waitFor(() => !!document.querySelector('[role="dialog"][data-state="open"] input'), null, 'Sheet 編輯表單打開')
    const name = await page.$('[role="dialog"][data-state="open"] input')
    await name.click({ clickCount: 3 })
    await page.keyboard.type('Ada Lin')
    const save = await page.$('[role="dialog"][data-state="open"] button:has-text("儲存變更")')
    if (!save) fail('Sheet 編輯成員:找不到「儲存變更」')
    await save.click()
    await page.waitForFunction(() => !document.querySelector('[role="dialog"][data-state="open"]'), null, { timeout: 5000 }).catch(() => fail('Sheet 編輯成員:存檔後側板沒關'))
    await settle(400)
    tb = await trig()
    const trigText = (await tb?.textContent())?.trim() ?? ''
    await tb.click()
    await waitFor(() => !!document.querySelector('[role="dialog"][data-state="open"] h2'), null, 'Sheet 再次打開')
    await mutate('R9')
    const title = await page.evaluate(() => document.querySelector('[role="dialog"][data-state="open"] h2')?.textContent?.trim())
    rec('R9', title === 'Ada Lin' && trigText.includes('Ada Lin'), `存成 Ada Lin 後:標題「${title}」、觸發鈕「${trigText}」`)

    // R10 通知清單地標名稱
    await open('design-system-components-toast-展示--interactive')
    await mutate('R10')
    const region = await page.evaluate(() => document.querySelector('section[aria-label][tabindex="-1"]')?.getAttribute('aria-label') ?? null)
    if (region == null) fail('Toast 展示:找不到 sonner 通知清單 <section>')
    rec('R10', /^通知/.test(region) && !/Notifications/.test(region), `通知清單地標名稱「${region}」`)

    // R11 預設文案
    await open('design-system-components-coachmark-展示--multi-step-tour')
    await waitFor(() => !!document.querySelector('[role="dialog"].w-80'), null, 'Coachmark 多步導覽卡片')
    await mutate('R11')
    const coachText = await page.evaluate(() => document.querySelector('[role="dialog"].w-80')?.textContent ?? '')
    const enCoach = ['Next', 'Skip', 'Previous', 'Done', ' of '].filter((w) => coachText.includes(w))
    rec('R11', enCoach.length === 0 && coachText.includes('第 1 步,共 3 步'), `Coachmark 多步導覽卡片:英文預設 ${enCoach.join(' / ') || '-'};步驟計數${coachText.includes('第 1 步,共 3 步') ? '是' : '不是'}「第 1 步,共 3 步」`)
    await open('design-system-components-profilecard-設計規格--section-matrix')
    await mutate('R11')
    // 只看元件畫出來的字(葉節點全文 = 預設詞),不看規格頁的說明表格與段落(那裡寫 View more 是在講區塊名)
    const enPc = await page.evaluate(() => {
      const words = ['Chat', 'Audio call', 'Online', 'Away', 'Busy', 'Offline', 'Status message', 'Employee number', 'View more']
      const leaves = [...document.querySelectorAll('#storybook-root *')].filter((e) => !e.closest('table') && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      return [...new Set(leaves.map((e) => e.textContent.trim()).filter((t) => words.includes(t)))]
    })
    rec('R11', enPc.length === 0, `ProfileCard 設計規格「區塊矩陣」英文預設:${enPc.join(' / ') || '-'}`)

    // R16 Coachmark 頁腳:按鈕群靠右(單步卡沒有計數也一樣)、primary 是最右那一顆
    for (const [id, what] of [['design-system-components-coachmark-展示--feature-discovery', '單步驟新功能介紹'], ['design-system-components-coachmark-展示--multi-step-tour', '多步新手導覽']]) {
      await open(id)
      await waitFor(() => !!document.querySelector('[role="dialog"].w-80'), null, `Coachmark ${what} 卡片`)
      await settle(300)
      await mutate('R16')
      const f = await page.evaluate(() => {
        const card = document.querySelector('[role="dialog"].w-80')
        const btns = [...card.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0 && !b.getAttribute('aria-label'))
        const footer = btns.at(-1)?.closest('div')?.parentElement
        if (!footer || !btns.length) return null
        const fs = getComputedStyle(footer), fr = footer.getBoundingClientRect()
        const contentRight = fr.right - parseFloat(fs.paddingRight)
        const last = btns.reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a))
        return { gap: contentRight - last.getBoundingClientRect().right, lastText: last.textContent.trim(), lastPrimary: last.classList.contains('bg-primary'), primaries: btns.filter((b) => b.classList.contains('bg-primary')).length }
      })
      if (!f) fail(`Coachmark ${what}:找不到頁腳按鈕`)
      rec('R16', Math.abs(f.gap) <= 1 && f.lastPrimary && f.primaries === 1, `${what}:最右一顆「${f.lastText}」${f.lastPrimary ? '是' : '不是'} primary、離頁腳右緣 ${f.gap.toFixed(1)}px`)
    }

    // R12 Dialog 成員名片
    await open('design-system-components-dialog-展示--list-body')
    await waitFor(() => !!document.querySelector('[role="dialog"][data-state="open"] [role="listitem"]'), null, '成員列表打開')
    const row = await page.evaluate(() => { const li = document.querySelector('[role="dialog"][data-state="open"] [role="listitem"]'); return li ? [...li.querySelectorAll('span')].map((s) => s.textContent.trim()).filter(Boolean) : null })
    await openHoverCard('[role="dialog"][data-state="open"] [role="listitem"] [role="img"]', '第一位成員的頭像')
    await mutate('R12')
    const card = await page.evaluate(() => {
      const c = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state]')].pop()
      if (!c) return null
      const items = Object.fromEntries([...c.querySelectorAll('dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling?.textContent.trim()]))
      return { items, text: c.textContent }
    })
    if (!card || !row) fail('Dialog 主體放清單:名片或列資料讀不到')
    const parts = (row.find((t) => t.includes('｜')) ?? '').split('｜')
    const id = card.items.ID, emp = card.items['員工編號'] ?? card.items['Employee number']
    const contradict = /(線上|Online)/.test(card.text) && /(休假|Out of Office)/.test(card.text)
    rec('R12', id === parts[1] && emp === parts[2] && !contradict, `列上「${parts.join('｜')}」;名片 ID ${id}、員工編號 ${emp}${contradict ? ';線上卻寫休假' : ''}`)

    // R13 ProfileCard 兩欄欄位:值的文字右緣不超過自己那一欄(grid 項目的 min-width:auto 會讓沒有空白的長字串整段撐出欄外,
    // 量 dd 自己的 scrollWidth 量不到 —— 要拿文字範圍的右緣比欄的右緣)
    await open('design-system-components-profilecard-設計規格--overview')
    await mutate('R13')
    const spill = await page.evaluate(() => {
      const out = { cells: 0, bad: [] }
      for (const dl of document.querySelectorAll('#storybook-root dl.grid')) {
        const tracks = getComputedStyle(dl).gridTemplateColumns.split(' ').map(parseFloat)
        if (tracks.length < 2) continue
        const gap = parseFloat(getComputedStyle(dl).columnGap) || 0
        const box = dl.getBoundingClientRect()
        const pl = parseFloat(getComputedStyle(dl).paddingLeft) || 0
        const edges = []; let x = box.left + pl
        for (const w of tracks) { edges.push([x, x + w]); x += w + gap }
        for (const dd of dl.querySelectorAll('dd')) {
          out.cells++
          const item = dd.parentElement.getBoundingClientRect()
          const col = edges.findIndex(([l]) => Math.abs(l - item.left) < 2)
          const r = document.createRange(); r.selectNodeContents(dd)
          const right = Math.max(...[...r.getClientRects()].map((q) => q.right), 0)
          if (col < 0 || right > edges[col][1] + 1) out.bad.push(`${dd.previousElementSibling?.textContent.trim()}「${dd.textContent.trim()}」文字右緣 ${right.toFixed(1)} > 欄右緣 ${col < 0 ? '?' : edges[col][1].toFixed(1)}`)
        }
      }
      return out
    })
    if (!spill.cells) fail('ProfileCard 設計規格 Overview:找不到兩欄欄位(dl.grid dd)')
    rec('R13', spill.bad.length === 0, spill.bad.join('、'))

    // R14 多字欄位值只在空白處斷:把兩個真實的多字值(覆核抓到的「Engineering / Platform」、合成探針「Senior Product Designer」)
    // 寫進左右兩欄,逐字量每個字落在第幾行;換行點落在字中間、而且那個字其實放得進整欄 = 從字中間斷(break-all 的病)。
    // 一個換行都沒量到 = 探針沒測到東西(欄比字寬)→ 儀器失效,不讀成通過
    let wrapsSeen = 0
    for (const density of ['md', 'lg']) {
      await open('design-system-components-profilecard-設計規格--overview', { density })
      await mutate('R14')
      const r = await page.evaluate((samples) => {
        // 只量兩欄並排的欄位(狀態訊息那一份是單欄 grid-cols-1,佔滿卡寬,不是這條要量的窄欄)
        const twoCol = [...document.querySelectorAll('#storybook-root dl.grid')].filter((dl) => getComputedStyle(dl).gridTemplateColumns.split(' ').length >= 2)
        // 寫進值外層那個元素(現行 = dd > span.break-words;2026-10-20 前值直接放在 dd 裡 —— 天然對照組照樣量得到)
        const spans = twoCol.flatMap((dl) => [...dl.querySelectorAll('dd')].map((dd) => dd.querySelector(':scope > span') ?? dd)).filter((sp) => sp.textContent.trim() !== '-')
        if (spans.length < 2) return null
        const ctx = (window.__ovMeasure ??= document.createElement('canvas')).getContext('2d')
        const out = { wraps: 0, bad: [] }
        samples.forEach((text, si) => {
          const sp = spans[si]
          sp.textContent = text
          const node = sp.firstChild
          const colW = sp.closest('dd').getBoundingClientRect().width
          ctx.font = getComputedStyle(sp).font
          let last = -1, lastTop = null
          for (let k = 0; k < text.length; k++) {
            const rg = document.createRange(); rg.setStart(node, k); rg.setEnd(node, k + 1)
            const q = [...rg.getClientRects()].find((x) => x.width > 0)
            if (!q) continue
            if (lastTop != null && q.top - lastTop > 1) {
              out.wraps++
              const between = text.slice(last, k + 1)
              if (!/\s/.test(between)) {
                let a = last; while (a > 0 && !/\s/.test(text[a - 1])) a--
                let b = k; while (b < text.length && !/\s/.test(text[b])) b++
                const word = text.slice(a, b), w = ctx.measureText(word).width
                if (w <= colW) out.bad.push(`「${text.slice(0, k)}|${text.slice(k)}」在「${word}」中間斷(字寬 ${w.toFixed(0)} ≤ 欄寬 ${colW.toFixed(0)})`)
              }
            }
            last = k; lastTop = q.top
          }
        })
        return out
      }, ['Engineering / Platform', 'Senior Product Designer'])
      if (!r) fail('ProfileCard 設計規格 Overview:兩欄欄位裡找不到兩個可寫入的值(dl.grid dd)')
      wrapsSeen += r.wraps
      rec('R14', r.bad.length === 0, `${density}:${r.bad.join('、')}`)
    }
    if (wrapsSeen === 0) fail('R14 兩個多字值在 md / lg 都沒有換行 —— 欄比字寬,探針沒測到換行點')
  } catch (e) {
    if (e instanceof StoryRenderInstrumentError || e?.name === 'StoryRenderInstrumentError') instrument.push(e.message)
    else instrument.push(String(e?.stack ?? e))
  } finally {
    await browser.close().catch(() => {})
    await Promise.race([server.stop?.(), new Promise((r) => setTimeout(r, 3000))]).catch(() => {})
  }
  return out
}

/** 頁面上拆掉修法(--selftest):每列一個,在量測前一刻套上 */
const MUTATIONS = {
  R1: () => { for (const c of document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-theme="dark"][data-state]')) c.classList.remove('text-foreground') },
  R2: () => { for (const c of document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state]')) c.style.boxShadow = 'none' },
  R3: () => {
    const s = [...document.querySelectorAll('#storybook-root span, #storybook-root p')].find((x) => /^trigger:|^Tooltip(純文字提示)$/.test(x.textContent.trim()))
    if (s) s.style.marginTop = '6px'
  },
  R4: () => { const a = [...document.querySelectorAll('#storybook-root a')].find((x) => /@Ada Chen/.test(x.textContent)); if (a) { a.setAttribute('tabindex', '-1'); a.setAttribute('title', '此設定影響全域') } },
  R5: () => { for (const b of document.querySelectorAll('[role="dialog"].w-80 button')) b.replaceWith(b.cloneNode(true)) },
  R6: () => {
    const caps = [...document.querySelectorAll('#storybook-root span')].filter((s) => /^(light|dark) mode$/.test(s.textContent.trim()))
    for (const c of caps) { c.nextElementSibling?.removeAttribute('data-theme'); if (/dark/.test(c.textContent)) c.parentElement.setAttribute('data-theme', 'dark') }
  },
  R7: () => { for (const d of document.querySelectorAll('[role="dialog"][data-state="open"]')) d.setAttribute('aria-describedby', 'radix-missing-description') },
  R8: () => { const p = [...document.querySelectorAll('#storybook-root span')].find((s) => s.textContent.trim() === 'Popover（200）')?.parentElement; if (p) { p.style.left = 'auto'; p.style.right = '0px'; p.style.top = 'auto'; p.style.bottom = '0px' } },
  R9: () => { const h = document.querySelector('[role="dialog"][data-state="open"] h2'); if (h) h.textContent = 'Ada Chen' },
  R10: () => { document.querySelector('section[aria-label][tabindex="-1"]')?.setAttribute('aria-label', 'Notifications alt+T') },
  R11: () => {
    const b = document.querySelector('[role="dialog"].w-80 button:last-child')
    if (b) b.append(' Next')
    else { const t = document.querySelector('#storybook-root button'); if (t) t.textContent = 'Chat' }
  },
  R12: () => {
    const c = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-state]')].pop()
    const dds = c ? [...c.querySelectorAll('dd')] : []
    const id = [...(c?.querySelectorAll('dt') ?? [])].find((dt) => dt.textContent.trim() === 'ID')?.nextElementSibling
    const emp = [...(c?.querySelectorAll('dt') ?? [])].find((dt) => /員工編號|Employee number/.test(dt.textContent))?.nextElementSibling
    if (id && emp) { const t = id.textContent; id.textContent = emp.textContent; emp.textContent = t } else if (dds[0]) dds[0].textContent = 'X'
  },
  // R13:2026-10-20 前的形狀 —— 欄位值沒有斷行處理
  R13: () => { for (const sp of document.querySelectorAll('#storybook-root dl.grid dd span.break-words')) sp.classList.remove('break-words') },
  // R14:2026-10-20 第一版修法 —— 欄位值用 break-all(多字值從字中間斷)
  R14: () => { for (const sp of document.querySelectorAll('#storybook-root dl.grid dd span.break-words')) sp.classList.replace('break-words', 'break-all') },
  // R16:照 action-bar :109「沒有標題 → 靠左」的錯誤推論把頁腳改成靠左(單步卡)
  R16: () => { const card = document.querySelector('[role="dialog"].w-80'); const g = [...(card?.querySelectorAll('button') ?? [])].at(-1)?.closest('div')?.parentElement; if (g) g.style.justifyContent = 'flex-start' },
  // R15:2026-10-20 第一版修法 —— 溢出清單的名字直接放進 OverflowIndicator(ShrinkWrapList 橫排成一行)
  R15: () => {
    const card = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-theme="dark"][data-state]')].pop()
    for (const el of card?.querySelectorAll('.flex-col') ?? []) el.classList.replace('flex-col', 'flex-row')
  },
}

/** 靜態對照組:每列一個 2026-10-20 前的原始碼片段 */
const STATIC_MUTANTS = [
  // S1:Toast「有標題與描述」2026-10-20 前的右欄 —— 整組設 dark、沒宣告字色(欄標在淺色頁白字白底);OverflowIndicator 那一種同時會紅 S2,另由頁面 R1 量
  ['S1', 'packages/design-system/src/__selftest__/toast-columns-before.tsx', 'const a = <ExampleGroup data-theme="dark"><span className="text-caption text-fg-secondary font-medium">dark mode</span></ExampleGroup>'],
  ['S2', 'packages/design-system/src/__selftest__/trigger-showcase-before.tsx', 'const b = <HoverCardContent className="bg-surface-raised border border-border rounded-lg p-[var(--layout-space-loose)]"><div>Ada Chen</div></HoverCardContent>'],
  ['S3', 'packages/design-system/src/__selftest__/dialog-before.tsx', 'const c = <DialogContent autoHeight maxWidth={480}><div /></DialogContent>'],
  ['S4', 'packages/design-system/src/__selftest__/popover-principles-before.tsx', 'const d = <Button variant="tertiary">檔案操作 ▾</Button>'],
  ['S5', 'packages/design-system/src/__selftest__/combobox-before.spec.md', '由浮層 `PopoverContent` 的 `onEscapeKeyDown` 經同一支模組的 `withImeSafeEscape` 擋掉'],
  ['S6', 'packages/design-system/src/__selftest__/dialog-stories-before.tsx', 'const e = <Button variant="tertiary">開啟成員列表(大 item:avatar+desc)</Button>'],
  ['S7', 'packages/design-system/src/__selftest__/dropdown-principles-before.tsx', 'const f = <Button className="self-start" variant="tertiary" startIcon={Filter}>顯示欄位</Button>'],
  // S8:profile-card.anatomy 2026-10-20 前的寫法 —— 員工編號寫在 fields(預設標籤是英文時畫成兩列,改中文後被去重)
  // S9:FileViewer 2026-10-20 前的縮小鈕 —— 元件有 FileViewerLabels,這顆卻寫死
  ['S9', 'packages/design-system/src/__selftest__/file-viewer-before.tsx', 'export interface FileViewerLabels { zoomInput?: string }\nconst h = <Button iconOnly startIcon={Minus} aria-label="縮小" />'],
  ['S8', 'packages/design-system/src/__selftest__/profile-card-anatomy-before.stories.tsx', "const g = <ProfileCard name=\"Ada Chen\" fields={[{ label: 'Email', value: 'ada.chen@example.com' }, { label: '員工編號', value: '#E-2048' }]} />"],
  // S8 同族:DataTable 範例 2026-10-21 前的人員資料 —— ID 寫在 PersonData.fields
  ['S8', 'packages/design-system/src/__selftest__/data-table-people-before.tsx', "const p = [{ name: 'Alice Wonderland Wang', description: 'Sales｜Tokyo｜EMP-1001', fields: [{ label: 'ID', value: 'AWW001' }, { label: '部門', value: 'Sales / APAC' }] }]"],
  // S5:續行的上一行沒有歷史標記 → 不算歷史句(上一行規則不是全面放行)
  ['S5', 'packages/design-system/src/__selftest__/focus-return-before.ts', ' * 這幾處各寫一份「記開啟者 + 關閉時還」:Command、DatePicker 區間、\n * AppShell 窄版側欄、AgentPanel 入口鈕右鍵選單'],
  // S10 三種:Props 表漏 labels(2026-10-20 的 ProfileCard)、寫死的 key 數對不上(FileViewer「15 keys」)、spec 說接了 I18nProvider 但元件沒讀
  ['S10', [
    ['packages/design-system/src/__selftest__/s10a/member-card.tsx', 'export interface MemberCardLabels { title: string; close: string }\nexport interface MemberCardProps { name: string; role?: string; avatar?: string; labels?: Partial<MemberCardLabels> }'],
    ['packages/design-system/src/__selftest__/s10a/member-card.anatomy.stories.tsx', "const rows = [['name', 'string'], ['role', 'string'], ['avatar', 'string']]"],
  ]],
  ['S10', [
    ['packages/design-system/src/__selftest__/s10b/member-card.tsx', 'export interface MemberCardLabels { title: string; close: string }\nexport interface MemberCardProps { name: string; role?: string; avatar?: string; labels?: Partial<MemberCardLabels> }'],
    ['packages/design-system/src/__selftest__/s10b/member-card.anatomy.stories.tsx', "const rows = [['name', 'string'], ['role', 'string'], ['avatar', 'string'], ['labels', 'MemberCardLabels', '—', '文案覆寫(15 keys)']]"],
  ]],
  ['S10', [
    ['packages/design-system/src/__selftest__/s10c/member-card.tsx', 'export interface MemberCardLabels { title: string; close: string }\nexport interface MemberCardProps { name: string; labels?: Partial<MemberCardLabels> }'],
    ['packages/design-system/src/__selftest__/s10c/member-card.spec.md', 'DS 預設文案照 Fallback chain(1 consumer prop → 2 I18nProvider → 3 DS 預設中文)'],
  ]],
  // S3 同族:dialog.tsx 2026-10-21 前的檔頭 —— 還在教 autoHeight
  ['S3', 'packages/design-system/src/components/Dialog/__selftest__/dialog-header-before.tsx', ' * autoHeight（boolean）：高度隨內容，超過 viewport 時 max-height 安全帽。'],
  // S7 同族:popover 原則頁 2026-10-21 前的註解
  ['S7', 'packages/design-system/src/__selftest__/popover-comment-before.tsx', '{/* @overlay-open-skip:視覺語言比較卡片——同一「顯示欄位」內容分別以 Popover / Dialog 呈現 */}'],
  // S12:hover-card.stories.tsx 2026-10-21 前 —— 同檔 Ada Chen 兩個員工編號
  ['S12', 'packages/design-system/src/__selftest__/hover-card-before.stories.tsx', "const a = <ProfileCard name=\"Ada Chen\" defaultFieldValues={{ id: 'ADACHEN', employeeNumber: 'E-4821' }} />\nconst b = [{ name: 'Ada Chen', account: 'ADACHEN', employeeNumber: '1048217' }]"],
  // S13:coachmark.spec.md 2026-10-20 第二輪的寫法 —— 把「計數」歸給 action-bar「對齊方向的決定」
  ['S13', 'packages/design-system/src/__selftest__/coachmark-footer-before.spec.md', '**順序的 owner 不在本檔**:`action-bar.spec.md`「對齊方向的決定」(有標題 / 計數在左時按鈕靠右,沒有時靠左)'],
  // S14:2026-10-20 第二輪的 stories-helpers/scene/person-card.tsx —— 自己組 ProfileCard
  ['S14', 'packages/design-system/src/__selftest__/person-card-before.tsx', 'export const card = () => (\n  <ProfileCard name="Ada Chen" defaultFieldValues={{ id: \'YHANAX\', employeeNumber: \'EMP-1001\' }} />\n)'],
  // S11:Coachmark 展示頁 2026-10-21 前的錨點 —— 目前那一步換成 primary
  ['S11', 'packages/design-system/src/__selftest__/coachmark-before.stories.tsx', "const a = <Button variant={isCurrent ? 'primary' : 'tertiary'} size=\"sm\">匯出報表</Button>"],
]

/** 乾淨對照:本來就正確的寫法,注入後不得讓任何一列紅(S5:be2f1324 的兩句歷史句 —— 2026-10-20 曾因量具只認「同一行寫出接班者」被改寫) */
const STATIC_CLEAN = [
  ['packages/design-system/src/__selftest__/clean-ime.ts', '// 2026-10-01 上午曾在這裡放 `withImeSafeEscape`(浮層的 `onEscapeKeyDown`:組字中的 Esc 不關那一層)。同日下午「這一下 Esc 由誰處理」'],
  ['packages/design-system/src/__selftest__/clean-focus-return.ts', ' * 2026-09-30 之前的五份:Command `returnFocusAfterCommandClose`(SelectMenu / AgentPanel 歷史 / CommandDialog)、Sidebar 窄版抽屜、\n * AppShell 窄版側欄、DatePicker 區間、AgentPanel 入口鈕右鍵選單各寫一份「記開啟者 + 關閉時還」,判準各不相同'],
]

// ─── 主程式 ──────────────────────────────────────────────────────────────────
const files = readSources()
const report = (title, res) => {
  console.log(`\n── ${title} ──`)
  for (const [id, label] of Object.entries(ROWS)) {
    const r = res.get(id)
    if (!r) continue
    console.log(`  ${r.ok ? '✓' : '✗'} ${id.padEnd(4)} ${label}`)
    if (!r.ok) for (const d of r.detail.slice(0, 12)) console.log(`        ${d}`)
    if (!r.ok && r.detail.length > 12) console.log(`        …另 ${r.detail.length - 12} 筆`)
  }
}
const staticRes = (fs) => {
  const { red, counts } = runStatic(fs)
  const m = new Map()
  for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14']) m.set(id, { ok: !red[id], detail: red[id] ?? [] })
  for (const msg of red.INSTRUMENT ?? []) instrument.push(msg)
  return { m, counts }
}

if (!SELFTEST) {
  const { m, counts } = staticRes(files)
  for (const [k, v] of m) mark(k, v.ok, v.detail)
  console.log(`靜態:掃到換主題的元素 ${counts.themeBoundaries} 個、HoverCardContent ${counts.hoverContents} 個、Button ${counts.buttons} 個、帶 fields 的 ProfileCard ${counts.profileCardFields} 個、有文案物件的元件 ${counts.labelledComponents} 支(其中設計規格有 Props 表的 ${counts.labelledPropsTables} 支)`)
  if (!STATIC_ONLY) {
    const rt = await runRuntime()
    for (const [k, v] of rt) mark(k, v.ok, v.detail)
    for (const id of Object.keys(ROWS).filter((k) => k.startsWith('R'))) if (!results.has(id) && instrument.length === 0) instrument.push(`${id} 一筆都沒量到`)
  }
  report(`浮層家族範例契約(${STATIC_ONLY ? '只靜態' : `靜態 + 建置 ${relative(ROOT, BUILD) || BUILD}`})`, results)
  if (instrument.length) { for (const l of instrument) console.error(`✗ INSTRUMENT-FAIL ${l}`); process.exit(2) }
  const bad = [...results].filter(([, r]) => !r.ok).map(([k]) => k)
  console.log(bad.length ? `\n✗ 浮層家族範例契約:${bad.length} 列不符(${bad.join(', ')})` : '\n✓ 浮層家族範例契約:全綠')
  process.exit(bad.length ? 1 : 0)
}

// ── --selftest ──
const missed = []
{
  // 現行原始碼必須綠(對照組的基準)
  const base = staticRes(files).m
  const baseRed = [...base].filter(([, r]) => !r.ok).map(([k]) => k)
  if (baseRed.length) missed.push(`現行原始碼靜態就紅(${baseRed.join(', ')})—— 基準不乾淨,對照組沒有意義`)
  for (const [row, pathOrPairs, text] of STATIC_MUTANTS) {
    const pairs = Array.isArray(pathOrPairs) ? pathOrPairs : [[pathOrPairs, text]]
    const fs = new Map(files)
    for (const [path, t] of pairs) fs.set(path, t)
    const { m } = staticRes(fs)
    const r = m.get(row)
    const hitInjected = r && !r.ok && r.detail.some((d) => d.includes('__selftest__/'))
    const others = [...m].filter(([k, v]) => k !== row && !v.ok).map(([k]) => k)
    const label = pairs.map(([path]) => path.split('/').pop()).join(' + ')
    console.log(`  ${hitInjected && others.length === 0 ? '✓' : '✗'} 靜態對照 ${row}:注入 ${label} → ${hitInjected ? '紅在注入那一筆' : '沒紅'}${others.length ? `;多紅了 ${others.join(', ')}` : ''}`)
    if (!hitInjected || others.length) missed.push(`靜態 ${row}(${label})`)
  }
  for (const [path, text] of STATIC_CLEAN) {
    const fs = new Map(files)
    fs.set(path, text)
    const red = [...staticRes(fs).m].filter(([, v]) => !v.ok).map(([k]) => k)
    console.log(`  ${red.length === 0 ? '✓' : '✗'} 乾淨對照:注入 ${path.split('/').pop()}(本來就正確的寫法)→ ${red.length ? `誤紅 ${red.join(', ')}` : '不紅'}`)
    if (red.length) missed.push(`乾淨對照 ${path.split('/').pop()}`)
  }
}
if (!STATIC_ONLY) {
  const baseline = await runRuntime()
  const baseRed = [...baseline].filter(([, r]) => !r.ok).map(([k]) => k)
  if (instrument.length) { for (const l of instrument) console.error(`✗ INSTRUMENT-FAIL ${l}`); process.exit(2) }
  if (baseRed.length) missed.push(`現行建置就紅(${baseRed.join(', ')})—— 基準不乾淨`)
  // 一趟就把每一列各自的拆法都套上(每列只在自己量測前一刻、在新開的頁面上套),每一列都必須紅;
  // 現行建置那一趟(上面)全綠 = 紅燈來自拆法,不是頁面本來就壞
  const rt = await runRuntime({ mutateRow: 'ALL' })
  if (instrument.length) { for (const l of instrument) console.error(`✗ INSTRUMENT-FAIL(對照組)${l}`); process.exit(2) }
  for (const row of Object.keys(MUTATIONS)) {
    const r = rt.get(row)
    const ok = r && !r.ok
    console.log(`  ${ok ? '✓' : '✗'} 頁面對照 ${row}:拆掉修法 → ${ok ? `紅(${r.detail[0]?.slice(0, 90) ?? ''})` : '沒紅'}`)
    if (!ok) missed.push(`頁面 ${row}`)
  }
}
if (missed.length) { console.log(`\n✗ selftest:量具不可信 —— ${missed.join('、')}`); process.exit(1) }
console.log(`\n✓ selftest:靜態 ${STATIC_MUTANTS.length} 個修前形狀各自只紅在自己那一列、${STATIC_CLEAN.length} 個本來就正確的寫法不紅${STATIC_ONLY ? '' : `、頁面 ${Object.keys(MUTATIONS).length} 列拆掉修法各自紅`},現行原始碼${STATIC_ONLY ? '' : '與建置'}全綠`)
process.exit(0)
