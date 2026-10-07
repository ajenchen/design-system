#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 可搜尋的選單欄位(Select / Combobox / PeoplePicker;欄位內搜尋與浮層內搜尋兩條路)在「欄位上的按鍵與值的顯示」這五件事上照規格走
 *        —— 待辦總帳 2026-09-25-interaction-and-hover-remediation.md K1–K4:
 *     K1 Backspace:關鍵字空白時 = 按「最後一個值」的 ×(多選刪最後一個 Tag、只選「不限」刪掉「不限」;Select 單選只在 clearable 時清值);
 *        有關鍵字時只刪字;按住連發不連刪;組字中不刪;刪掉時讀屏念「已移除『X』」(select-menu.spec.md「A11y 預設」Keyboard Backspace 列);
 *        那句話只在它還是現況時掛著 —— 值又變了、焦點離開欄位就清掉(select-menu-removal-status.tsx (a)(b),2026-10-07 驗證回報「過期文字」)。
 *     K2 清單開著按一鍵清空 × → 反白回到第一個可選列(同打開一個空欄位;只選「不限」時第一列就是「不限」本身,照實量)。
 *     K3 焦點在欄位本身(觸發欄位,不是搜尋框)、清單關著時打一個字 = 打開清單、這個字進搜尋框(欄位內 / 浮層內兩種搜尋框);
 *        輸入法的第一鍵(keyCode 229 / 'Process')同樣把焦點交給搜尋框,接著的組字落在搜尋框裡(CDP Input.imeSetComposition 真的組字)。
 *        空白鍵維持「打開」、不打進關鍵字。
 *     F1 清單開著按過觸發欄位上的東西(× / Tag × / 搜尋框本身)再用 Esc 收起 → 焦點回觸發欄位,不掉到頁面上(select.spec.md「Clearable」清除後焦點、
 *        select-menu.spec.md「A11y 預設」Focus 段 :386);**範圍守住 :384**:欄位內搜尋框握著焦點時點欄位收起,焦點留在搜尋框(對照列,修前修後都綠)。
 *     K4 只選「不限」× 欄位內搜尋:關著是一般已填值的黑字(與不可搜尋的「不限」逐格同位置、同色)、打開還沒打字變灰色提示且讀屏略過、
 *        插入點在 --field-px 那條線、一打字就讓位、字刪光回來、換行模式打長字欄高不變;PeoplePicker 多人只選 1 位 × 欄位內搜尋:
 *        打開時名字讓位給插入點(頭像留著,people-picker.spec.md §C open + inline-search 列),關著時名字回來。
 *        讓位不改欄寬(2026-10-07 驗證回報「hug 欄位一打開縮 69px」):依內容寬(width="hug")時打開、打的字沒超過值之前欄寬不變;
 *        只選「不限」依內容寬關著的欄寬、窄欄位長標籤的截斷寬都與不可搜尋的「不限」相同;多人 1 位窄欄位關著時名字與同寬單人欄位一樣完整
 *        (§C closed 列「= 單人 closed」;修前跟搜尋框那一格平分空間被切成「Alice C…」)。
 *   紅: 任一列不符 → 逐列點名(哪一格、量到什麼、應為什麼)、exit 1。story 沒渲染 / 互動後版面不靜止 / 焦點一直在跳 = 儀器失效(INSTRUMENT-FAIL,exit 1),
 *        不得被讀成產品不符,也不得在 --selftest 裡被算成「弄壞後有抓到」。
 *   綠: 全部列符合。--selftest 兩部分:(1) 判定表 —— 每一列餵「正確形狀」必綠、「修前形狀」必紅、缺量測必判儀器失效;
 *        (2) 真對照組 —— 在頁面上把修法各拆掉一次(K1 Backspace 到不了元件 / K1 播報字清掉後又被放回去 / K3 欄位本身的字到不了元件 /
 *        K2 清空後的反白搬移被擋 / F1 按在觸發欄位上又被記成「按在外面」/ K4 打開仍是黑字、打字仍並排 / K4 讓位後留下寬的量尺被拿掉 /
 *        K4 多人 1 位那一格又跟搜尋框平分空間),每一組都必須**各自**紅在自己那一族,而守 :384、點外面不搶焦點、
 *        空白鍵只打開這三條對照列全程綠。修前建置(2026-10-07 實測)本閘紅在 K1–K4 / F1 每一族。
 *        不是抽籤 —— 量的是 DOM 狀態與幾何(activeElement、aria-expanded、data-selected、getBoundingClientRect、computed color),每一步之後都等版面靜止與焦點穩定再讀。
 *
 * owner:
 *   `packages/design-system/src/components/SelectMenu/select-menu.spec.md`「A11y 預設」(Keyboard Backspace / 打字列、Focus 段)與「搜尋關鍵字何時保留、何時清空」;
 *   `packages/design-system/src/components/SelectMenu/select-menu-unrestricted.spec.md`「欄位顯示」;
 *   `packages/design-system/src/components/PeoplePicker/people-picker.spec.md` §C;`packages/design-system/src/components/Select/select.spec.md`「Clearable」。
 * 用法:node scripts/searchable-field-keys-invariant.mjs [--build=storybook-static] [--selftest]
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  launchBrowser, openStory, requireStorybookBuild, settleAfterInteraction, waitForFocusStable, ownSurfacePosition,
  StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const SETTLE_FRAMES = 10 // 與其他瀏覽器閘同值(named-constant-drift 閘:同名常數不得有第二個值)
const EDGE_TOLERANCE_PX = 1

export const STORIES = Object.freeze({
  select: 'design-system-components-select-展示--searchable',
  ppSingle: 'design-system-components-peoplepicker-展示--single',
  keys: 'design-system-components-combobox-展示--field-keys-contract',
  unr: 'design-system-components-combobox-展示--unrestricted-inline-search',
  ppMulti: 'design-system-components-peoplepicker-展示--multi-inline-search',
  yieldWidth: 'design-system-components-field-展示--inline-search-yield-width-contract',
})
// 欄位的身分:aria-label、Field 標籤(aria-labelledby 指到的字)或該 story 裡第幾個觸發欄位(Select「搜尋」範例只有一個、沒有標籤)
export const FIELDS = Object.freeze({
  select: { index: 0 },
  ppSingle: { label: '負責人(edit mode demo)' },
  inline: { label: '商品分類(欄位內搜尋,可清空)' },
  popover: { label: '商品分類(浮層內搜尋,可清空)' },
  unr: { label: '商品類別(欄位內搜尋)' },
  unrPlain: { label: '商品類別(對照)' },
  unrEmpty: { label: '商品類別(空值)' },
  unrNarrow: { label: '商品類別(窄欄位換行)' },
  ppOptional: { labelledBy: '選擇性出席者' },
  unrHug: { label: '商品類別(依內容寬,欄位內搜尋)' },
  unrHugPlain: { label: '商品類別(依內容寬,對照)' },
  unrLong: { label: '商品類別(窄欄位長標籤,欄位內搜尋)' },
  unrLongPlain: { label: '商品類別(窄欄位長標籤,對照)' },
  ppHug: { label: '審核人(依內容寬,欄位內搜尋)' },
  ppNarrow: { label: '審核人(窄欄位,欄位內搜尋)' },
  ppSingleNarrow: { label: '負責人(窄欄位,單人對照)' },
})
const UNRESTRICTED_LABEL = '不限'
const LONG_UNRESTRICTED_LABEL = '不限(全部商品類別都可以)'
const PERSON = 'Alice Chen'

// ═══════════════════════════════════════════════════════════════════════════
// 判定(純函式;正式跑、--selftest 判定表與真對照組共用)
// ═══════════════════════════════════════════════════════════════════════════
//
// 每一列 = { id, family, name, judge(m) → { ok, detail } };m 是該列的量測(缺 = 儀器失效,不判)。
// 族:K1 / K2 / K3 / F1 / K4;GUARD = 對照列(修前修後都必須綠 —— 守 :384、點外面不搶、空白鍵只打開、組字中 / 連發不刪)。
const removedSay = (label) => `已移除『${label}』`
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= EDGE_TOLERANCE_PX
const check = (ok, detail) => ({ ok: !!ok, detail })

export const ROWS = [
  // ── K1 Backspace ──
  { id: 'K1-inline-last', family: 'K1', name: '欄位內搜尋 × 多選:關鍵字空白按 Backspace 刪最後一個 Tag,焦點與清單不動,念「已移除『Food』」',
    judge: (m) => check(eq(m.after.tags, ['Electronics']) && m.after.focus === 'input' && m.after.open && (m.after.status || '').includes(removedSay('Food')),
      `Tag ${JSON.stringify(m.before.tags)}→${JSON.stringify(m.after.tags)} 焦點=${m.after.focus} 開著=${m.after.open} 播報=「${m.after.status ?? '(沒有播報區)'}」`) },
  { id: 'K1-inline-keyword', family: 'GUARD', name: '有關鍵字時 Backspace 只刪字、不刪值',
    judge: (m) => check(m.after.keyword === '' && eq(m.after.tags, m.before.tags), `關鍵字「${m.before.keyword}」→「${m.after.keyword}」 Tag ${JSON.stringify(m.before.tags)}→${JSON.stringify(m.after.tags)}`) },
  { id: 'K1-inline-repeat', family: 'GUARD', name: '按住連發的 Backspace(repeat)不刪值',
    judge: (m) => check(eq(m.after.tags, m.before.tags), `Tag ${JSON.stringify(m.before.tags)}→${JSON.stringify(m.after.tags)}`) },
  { id: 'K1-inline-ime', family: 'GUARD', name: '輸入法組字中的 Backspace(isComposing / keyCode 229)不刪值',
    judge: (m) => check(eq(m.after.tags, m.before.tags), `Tag ${JSON.stringify(m.before.tags)}→${JSON.stringify(m.after.tags)}`) },
  { id: 'K1-inline-body', family: 'K1', name: '清單關著、焦點在欄位本身:Backspace 一樣刪最後一個,焦點不動',
    judge: (m) => check(eq(m.after.tags, []) && m.after.focus === 'field' && (m.after.status || '').includes(removedSay('Electronics')),
      `Tag ${JSON.stringify(m.before.tags)}→${JSON.stringify(m.after.tags)} 焦點=${m.after.focus} 播報=「${m.after.status ?? '(沒有播報區)'}」`) },
  { id: 'K1-unrestricted', family: 'K1', name: '只選「不限」:Backspace 刪掉「不限」、回到未選,念「已移除『不限』」',
    judge: (m) => check(!m.after.unrestrictedShown && m.after.placeholder === '選擇商品類別…' && (m.after.status || '').includes(removedSay(UNRESTRICTED_LABEL)),
      `「不限」還在=${m.after.unrestrictedShown} placeholder=「${m.after.placeholder}」 播報=「${m.after.status ?? '(沒有播報區)'}」`) },
  { id: 'K1-select-clearable', family: 'K1', name: 'Select 單選 clearable:Backspace 清掉值、念「已移除『日本』」',
    judge: (m) => check(m.after.mirror === '' && (m.after.status || '').includes(removedSay('日本')),
      `值「${m.before.mirror}」→「${m.after.mirror}」 播報=「${m.after.status ?? '(沒有播報區)'}」`) },
  { id: 'K1-select-body', family: 'K1', name: 'Select 單選 clearable:清單關著、焦點在欄位本身按 Backspace 也清掉',
    judge: (m) => check(m.after.mirror === '' && m.after.focus === 'field', `值「${m.before.mirror}」→「${m.after.mirror}」 焦點=${m.after.focus}`) },
  { id: 'K1-status-after-change', family: 'K1', name: '播報字不過期:Select 用 Backspace 清掉「日本」(念「已移除『日本』」)後再選「美國」→ 播報區清空',
    judge: (m) => check((m.removed.status || '').includes(removedSay('日本')) && m.after.mirror === 'us' && m.after.status === '',
      `清掉後播報=「${m.removed.status ?? '(沒有播報區)'}」 選「美國」後值=${m.after.mirror} 播報=「${m.after.status ?? '(沒有播報區)'}」`) },
  { id: 'K1-status-after-blur', family: 'K1', name: '播報字不過期:欄位內搜尋 × 多選用 Backspace 刪掉「Food」後點頁面空白處(焦點離開欄位)→ 播報區清空',
    judge: (m) => check((m.removed.status || '').includes(removedSay('Food')) && m.after.focus === 'body' && m.after.status === '',
      `刪掉後播報=「${m.removed.status ?? '(沒有播報區)'}」 點外面後焦點=${m.after.focus} 播報=「${m.after.status ?? '(沒有播報區)'}」`) },
  { id: 'K1-select-required', family: 'GUARD', name: 'Select 單選沒開 clearable(必須有值):Backspace 不清值(開著、關著都一樣)',
    judge: (m) => check(m.open.mirror === PERSON && m.closed.mirror === PERSON, `開著按後=「${m.open.mirror}」 關著按後=「${m.closed.mirror}」`) },
  // ── K2 一鍵清空後反白 ──
  { id: 'K2-select', family: 'K2', name: 'Select:清單開著按 ×,反白回第一列(不停在剛清掉的「日本」)',
    judge: (m) => check(m.before.highlight === '日本' && m.after.highlightIsFirst && m.after.aadIsHighlight,
      `按前反白=${m.before.highlight} 按後反白=${m.after.highlight}(第一列 ${m.after.first}) aria-activedescendant 對得上=${m.after.aadIsHighlight}`) },
  // alsoUnder:這一列量的是「Backspace 清值之後」的反白 —— K1 那一下沒發生(K1 對照組)它也跟著紅,是同一件事的兩面,不算「別族也紅」
  { id: 'K2-select-backspace', family: 'K2', alsoUnder: ['K1'], name: 'Select:清單開著用 Backspace 清掉值(= 按 ×),反白同樣回第一列',
    judge: (m) => check(m.before.highlight === '日本' && m.after.highlightIsFirst, `按前反白=${m.before.highlight} 按後反白=${m.after.highlight}(第一列 ${m.after.first})`) },
  { id: 'K2-inline', family: 'K2', name: '欄位內搜尋 × 多選:清單開著按 ×,反白回第一列',
    judge: (m) => check(!m.before.highlightIsFirst && m.after.highlightIsFirst && m.after.aadIsHighlight && eq(m.after.tags, []),
      `按前反白=${m.before.highlight} 按後反白=${m.after.highlight}(第一列 ${m.after.first}) Tag=${JSON.stringify(m.after.tags)}`) },
  { id: 'K2-popover', family: 'K2', name: '浮層內搜尋 × 多選:清單開著按 ×,反白回第一列',
    judge: (m) => check(!m.before.highlightIsFirst && m.after.highlightIsFirst && eq(m.after.tags, []),
      `按前反白=${m.before.highlight} 按後反白=${m.after.highlight}(第一列 ${m.after.first}) Tag=${JSON.stringify(m.after.tags)}`) },
  { id: 'K2-unrestricted', family: 'K2', name: '只選「不限」按 ×:反白回第一列 —— 第一列就是「不限」本身(照實記錄:接著按 Enter 會選回「不限」)',
    judge: (m) => check(!m.before.highlightIsFirst && m.after.highlightIsFirst && m.after.firstIsUnrestricted,
      `按前反白=${m.before.highlight} 按後反白=${m.after.highlight} 第一列是「不限」=${m.after.firstIsUnrestricted}`) },
  // ── K3 焦點在欄位本身時打字 ──
  { id: 'K3-select', family: 'K3', name: 'Select:焦點在欄位本身、清單關著,打「ab」→ 清單打開、字依序進搜尋框',
    judge: (m) => check(m.after.open && m.after.focus === 'input' && m.after.keyword === 'ab', `開著=${m.after.open} 焦點=${m.after.focus} 關鍵字=「${m.after.keyword}」`) },
  { id: 'K3-inline', family: 'K3', name: '欄位內搜尋:焦點在欄位本身打「fo」→ 清單打開、字進欄位內搜尋框',
    judge: (m) => check(m.after.open && m.after.focus === 'input' && m.after.keyword === 'fo', `開著=${m.after.open} 焦點=${m.after.focus} 關鍵字=「${m.after.keyword}」`) },
  { id: 'K3-popover', family: 'K3', name: '浮層內搜尋:焦點在欄位本身打「fo」→ 浮層打開、字進浮層裡的搜尋框',
    judge: (m) => check(m.after.open && m.after.focus === 'popover-input' && m.after.keyword === 'fo', `開著=${m.after.open} 焦點=${m.after.focus} 關鍵字=「${m.after.keyword}」`) },
  { id: 'K3-ime-select', family: 'K3', name: 'Select:焦點在欄位本身,輸入法第一鍵(keyCode 229)→ 組字落在搜尋框、確認後關鍵字「我」',
    judge: (m) => check(m.after.open && m.after.focus === 'input' && m.after.keyword === '我', `開著=${m.after.open} 焦點=${m.after.focus} 關鍵字=「${m.after.keyword}」`) },
  { id: 'K3-ime-inline', family: 'K3', name: '欄位內搜尋:焦點在欄位本身,輸入法第一鍵 → 組字落在欄位內搜尋框',
    judge: (m) => check(m.after.open && m.after.focus === 'input' && m.after.keyword === '我', `開著=${m.after.open} 焦點=${m.after.focus} 關鍵字=「${m.after.keyword}」`) },
  { id: 'K3-ime-popover', family: 'K3', name: '浮層內搜尋:焦點在欄位本身,輸入法第一鍵 → 組字落在浮層裡的搜尋框',
    judge: (m) => check(m.after.open && m.after.focus === 'popover-input' && m.after.keyword === '我', `開著=${m.after.open} 焦點=${m.after.focus} 關鍵字=「${m.after.keyword}」`) },
  { id: 'K3-space', family: 'GUARD', name: '空白鍵在欄位本身仍是「打開清單」、不打進關鍵字',
    judge: (m) => check(m.after.open && m.after.keyword === '', `開著=${m.after.open} 關鍵字=「${m.after.keyword}」`) },
  // ── F1 按過觸發欄位上的東西再收起,焦點去哪 ──
  { id: 'F1-select-x-esc', family: 'F1', name: 'Select:清單開著按 ×、再按 Esc → 焦點回觸發欄位(不掉到頁面上)',
    judge: (m) => check(m.afterClear.focus === 'input' && !m.after.open && m.after.focus === 'field', `按 × 後焦點=${m.afterClear.focus} Esc 後開著=${m.after.open} 焦點=${m.after.focus}`) },
  { id: 'F1-select-input-click', family: 'F1', name: 'Select:清單開著再點一下搜尋框(會收起,OE32 另案)→ 焦點回觸發欄位',
    judge: (m) => check(m.after.focus === 'field', `收起後焦點=${m.after.focus} 開著=${m.after.open}`) },
  { id: 'F1-popover-tagx-esc', family: 'F1', name: '浮層內搜尋:清單開著按 Tag ×、再按 Esc → 焦點回觸發欄位',
    judge: (m) => check(m.afterClick.focus === 'popover-input' && !m.after.open && m.after.focus === 'field', `按 × 後焦點=${m.afterClick.focus} Esc 後開著=${m.after.open} 焦點=${m.after.focus}`) },
  { id: 'F1-inline-tagx-esc', family: 'F1', name: '欄位內搜尋:清單開著按 Tag ×、再按 Esc → 焦點落點與直接按 Esc 相同(觸發欄位)',
    judge: (m) => check(m.plain.focus === 'field' && m.after.focus === m.plain.focus && !m.after.open, `直接 Esc=${m.plain.focus} 按 × 再 Esc=${m.after.focus}`) },
  { id: 'F1-inline-click-close', family: 'GUARD', name: '守 select-menu.spec.md:384:欄位內搜尋框握著焦點時點欄位收起,焦點留在搜尋框',
    judge: (m) => check(!m.after.open && m.after.focus === 'input', `收起=${!m.after.open} 焦點=${m.after.focus}`) },
  { id: 'F1-outside', family: 'GUARD', name: '點頁面空白處收起:焦點不被搶回觸發欄位',
    judge: (m) => check(!m.after.open && m.after.focus === 'body', `收起=${!m.after.open} 焦點=${m.after.focus}`) },
  // ── K4「不限」× 欄位內搜尋;PeoplePicker 多人 1 位 ──
  { id: 'K4-closed', family: 'GUARD', name: '只選「不限」× 欄位內搜尋,關著:與不可搜尋的「不限」同位置、同字級、同色(黑字、讀屏讀得到)',
    judge: (m) => check(m.inline && m.plain && near(m.inline.left, m.plain.left) && near(m.inline.top, m.plain.top) && m.inline.color === m.plain.color
      && m.inline.fontSize === m.plain.fontSize && !m.inline.ariaHidden && near(m.inline.left, m.line),
      `欄位內 ${JSON.stringify(m.inline)} 對照 ${JSON.stringify(m.plain)} 線=${m.line}`) },
  { id: 'K4-open', family: 'K4', name: '打開還沒打字:「不限」變灰色提示(= 空值提示字的灰)、讀屏略過,插入點在 --field-px 那條線',
    judge: (m) => check(m.label && m.label.color === m.mutedColor && m.label.ariaHidden && near(m.inputLeft, m.line) && near(m.label.left, m.line),
      `「不限」${JSON.stringify(m.label)} 提示灰=${m.mutedColor} 插入點左緣=${m.inputLeft} 線=${m.line}`) },
  { id: 'K4-typed', family: 'K4', name: '打「fo」:「不限」讓位(欄位上只剩打的字),字從 --field-px 那條線開始',
    judge: (m) => check(!m.labelShown && m.keyword === 'fo' && near(m.inputLeft, m.line), `「不限」還在=${m.labelShown} 關鍵字=「${m.keyword}」 插入點左緣=${m.inputLeft} 線=${m.line}`) },
  { id: 'K4-cleared', family: 'K4', name: '字刪光:灰色提示回來',
    judge: (m) => check(m.label && m.label.color === m.mutedColor && m.label.ariaHidden, `「不限」${JSON.stringify(m.label)} 提示灰=${m.mutedColor}`) },
  { id: 'K4-wrap', family: 'K4', name: '換行模式(窄欄位)打一長串字:欄高不變(值與關鍵字不並排,不會擠出第二列)',
    judge: (m) => check(near(m.typedHeight, m.closedHeight), `關著 ${m.closedHeight}px → 打字後 ${m.typedHeight}px`) },
  { id: 'K4-people-open', family: 'K4', name: 'PeoplePicker 多人只選 1 位 × 欄位內搜尋,打開:名字讓位給插入點(插入點就在原本名字那條線)、頭像留著不動、提示字空白',
    judge: (m) => check(!m.open.nameShown && m.open.avatars === 1 && m.open.placeholder === '' && near(m.open.inputLeft, m.closedNameLeft) && near(m.open.avatarLeft, m.closedAvatarLeft),
      `名字還在=${m.open.nameShown} 頭像=${m.open.avatars} placeholder=「${m.open.placeholder}」 插入點=${m.open.inputLeft}(關著時名字 ${m.closedNameLeft}) 頭像左緣=${m.open.avatarLeft}(關著 ${m.closedAvatarLeft})`) },
  { id: 'K4-people-typed', family: 'K4', name: 'PeoplePicker 多人 1 位:打「bo」時欄位上沒有名字(不是「Alice Chen bo」)',
    judge: (m) => check(!m.typed.nameShown && m.typed.keyword === 'bo', `名字還在=${m.typed.nameShown} 關鍵字=「${m.typed.keyword}」`) },
  { id: 'K4-hug-unrestricted', family: 'K4', name: '只選「不限」× 欄位內搜尋 × 依內容寬:關著欄寬 = 不可搜尋的「不限」;打開、打「b」時欄寬不變(「不限」讓位後留下它的寬)',
    judge: (m) => check(near(m.closed, m.plain) && near(m.opened, m.closed) && near(m.typed, m.closed) && m.typedKeyword === 'b',
      `關著 ${m.closed}px(不可搜尋 ${m.plain}px)→ 打開 ${m.opened}px → 打「${m.typedKeyword}」${m.typed}px`) },
  { id: 'K4-long-closed', family: 'K4', name: '只選「不限」× 欄位內搜尋,窄欄位長標籤關著:截斷位置與寬度與不可搜尋的「不限」相同',
    judge: (m) => check(m.inline && m.plain && near(m.inline.left, m.plain.left) && near(m.inline.width, m.plain.width),
      `欄位內 ${JSON.stringify(m.inline)} 對照 ${JSON.stringify(m.plain)}`) },
  { id: 'K4-people-hug', family: 'K4', name: 'PeoplePicker 多人 1 位 × 欄位內搜尋 × 依內容寬:打開、打「b」、收起,欄寬都與關著相同(名字讓位後留下它的寬)',
    judge: (m) => check(near(m.opened, m.closed) && near(m.typed, m.closed) && near(m.after, m.closed) && m.typedKeyword === 'b' && !m.openedNameShown,
      `關著 ${m.closed}px → 打開 ${m.opened}px(名字還在=${m.openedNameShown})→ 打「${m.typedKeyword}」${m.typed}px → 收起 ${m.after}px`) },
  { id: 'K4-people-narrow', family: 'K4', name: 'PeoplePicker 多人 1 位 × 欄位內搜尋,窄欄位關著:名字與同寬單人欄位一樣完整(放得下就不省略;§C closed「= 單人 closed」)',
    judge: (m) => check(m.multi && m.single && near(m.multi.visibleTextWidth, m.single.visibleTextWidth) && !m.multi.truncated && !m.single.truncated && near(m.multi.left, m.single.left),
      `多人 1 位 ${JSON.stringify(m.multi)} 單人 ${JSON.stringify(m.single)}`) },
  { id: 'K4-people-closed', family: 'GUARD', name: 'PeoplePicker 多人 1 位,關著:頭像 + 名字(與修前同)',
    judge: (m) => check(m.closed.nameShown && m.closed.avatars === 1, `名字=${m.closed.nameShown} 頭像=${m.closed.avatars}`) },
]
const ROW_BY_ID = Object.fromEntries(ROWS.map((r) => [r.id, r]))

/** 判一份量測報告:{ [rowId]: measurement | { instrument: reason } }。缺量測 = 儀器失效(不判)。 */
export function judge(report, ids = ROWS.map((r) => r.id)) {
  const failures = []
  const instrument = []
  const passed = []
  for (const id of ids) {
    const row = ROW_BY_ID[id]
    const m = report[id]
    if (!m) { instrument.push(`${id}:沒有量到`); continue }
    if (m.instrument) { instrument.push(`${id}:${m.instrument}`); continue }
    let v
    try { v = row.judge(m) } catch (error) { instrument.push(`${id}:量測形狀不對(${error.message})`); continue }
    if (v.ok) passed.push(id)
    else failures.push({ id, family: row.family, line: `✗ [${row.family}] ${id} ${row.name} | ${v.detail}` })
  }
  return { failures, instrument, passed }
}

// ── 判定表(--selftest 第一部分):每一列「正確形狀」必綠、「修前形狀」必紅 ───────────────────────
const st = (o) => ({ open: true, focus: 'input', keyword: '', tags: [], status: '', mirror: '', highlight: 'x', highlightIsFirst: true, first: 'x', aadIsHighlight: true, firstIsUnrestricted: false, unrestrictedShown: false, placeholder: '', ...o })
const label = (o) => ({ left: 13, top: 6, color: 'rgba(0, 0, 0, 0.45)', fontSize: '14px', ariaHidden: true, ...o })
export const SAMPLES = {
  'K1-inline-last': { good: { before: st({ tags: ['Electronics', 'Food'] }), after: st({ tags: ['Electronics'], status: '已移除『Food』' }) },
    old: { before: st({ tags: ['Electronics', 'Food'] }), after: st({ tags: ['Electronics', 'Food'], status: null }) } },
  'K1-inline-keyword': { good: { before: st({ keyword: 'f', tags: ['Electronics'] }), after: st({ keyword: '', tags: ['Electronics'] }) },
    old: { before: st({ keyword: 'f', tags: ['Electronics'] }), after: st({ keyword: '', tags: [] }) } },
  'K1-inline-repeat': { good: { before: st({ tags: ['A', 'B'] }), after: st({ tags: ['A', 'B'] }) }, old: { before: st({ tags: ['A', 'B'] }), after: st({ tags: ['A'] }) } },
  'K1-inline-ime': { good: { before: st({ tags: ['A', 'B'] }), after: st({ tags: ['A', 'B'] }) }, old: { before: st({ tags: ['A', 'B'] }), after: st({ tags: ['A'] }) } },
  'K1-inline-body': { good: { before: st({ open: false, focus: 'field', tags: ['Electronics'] }), after: st({ open: false, focus: 'field', tags: [], status: '已移除『Electronics』' }) },
    old: { before: st({ open: false, focus: 'field', tags: ['Electronics'] }), after: st({ open: false, focus: 'field', tags: ['Electronics'] }) } },
  'K1-unrestricted': { good: { after: st({ unrestrictedShown: false, placeholder: '選擇商品類別…', status: '已移除『不限』' }) },
    old: { after: st({ unrestrictedShown: true, placeholder: '', status: null }) } },
  'K1-select-clearable': { good: { before: st({ mirror: 'jp' }), after: st({ mirror: '', status: '已移除『日本』' }) },
    old: { before: st({ mirror: 'jp' }), after: st({ mirror: 'jp', highlightIsFirst: false, status: null }) } },
  'K2-select-backspace': { good: { before: st({ highlight: '日本', highlightIsFirst: false }), after: st({ highlight: '台灣' }) },
    old: { before: st({ highlight: '日本', highlightIsFirst: false }), after: st({ highlight: '日本', highlightIsFirst: false }) } },
  'K1-select-body': { good: { before: st({ mirror: 'jp', focus: 'field' }), after: st({ mirror: '', focus: 'field' }) }, old: { before: st({ mirror: 'jp' }), after: st({ mirror: 'jp', focus: 'field' }) } },
  'K1-status-after-change': { good: { removed: st({ status: '已移除『日本』' }), after: st({ mirror: 'us', status: '' }) },
    old: { removed: st({ status: '已移除『日本』' }), after: st({ mirror: 'us', status: '已移除『日本』' }) } },
  'K1-status-after-blur': { good: { removed: st({ status: '已移除『Food』' }), after: st({ focus: 'body', status: '' }) },
    old: { removed: st({ status: '已移除『Food』' }), after: st({ focus: 'body', status: '已移除『Food』' }) } },
  'K1-select-required': { good: { open: st({ mirror: PERSON }), closed: st({ mirror: PERSON }) }, old: { open: st({ mirror: '' }), closed: st({ mirror: PERSON }) } },
  'K2-select': { good: { before: st({ highlight: '日本', highlightIsFirst: false }), after: st({ highlight: '台灣', highlightIsFirst: true }) },
    old: { before: st({ highlight: '日本', highlightIsFirst: false }), after: st({ highlight: '日本', highlightIsFirst: false }) } },
  'K2-inline': { good: { before: st({ highlightIsFirst: false }), after: st({}) }, old: { before: st({ highlightIsFirst: false }), after: st({ highlightIsFirst: false }) } },
  'K2-popover': { good: { before: st({ highlightIsFirst: false }), after: st({}) }, old: { before: st({ highlightIsFirst: false }), after: st({ highlightIsFirst: false }) } },
  'K2-unrestricted': { good: { before: st({ highlightIsFirst: false }), after: st({ firstIsUnrestricted: true }) }, old: { before: st({ highlightIsFirst: false }), after: st({ highlightIsFirst: false, firstIsUnrestricted: true }) } },
  'K3-select': { good: { after: st({ keyword: 'ab' }) }, old: { after: st({ open: false, focus: 'field', keyword: '' }) } },
  'K3-inline': { good: { after: st({ keyword: 'fo' }) }, old: { after: st({ open: false, focus: 'field', keyword: '' }) } },
  'K3-popover': { good: { after: st({ focus: 'popover-input', keyword: 'fo' }) }, old: { after: st({ open: false, focus: 'field', keyword: '' }) } },
  'K3-ime-select': { good: { after: st({ keyword: '我' }) }, old: { after: st({ open: false, focus: 'field', keyword: '' }) } },
  'K3-ime-inline': { good: { after: st({ keyword: '我' }) }, old: { after: st({ open: false, focus: 'field', keyword: '' }) } },
  'K3-ime-popover': { good: { after: st({ focus: 'popover-input', keyword: '我' }) }, old: { after: st({ open: false, focus: 'field', keyword: '' }) } },
  'K3-space': { good: { after: st({ keyword: '' }) }, old: { after: st({ keyword: ' ' }) } },
  'F1-select-x-esc': { good: { afterClear: st({}), after: st({ open: false, focus: 'field' }) }, old: { afterClear: st({}), after: st({ open: false, focus: 'body' }) } },
  'F1-select-input-click': { good: { after: st({ open: false, focus: 'field' }) }, old: { after: st({ open: false, focus: 'body' }) } },
  'F1-popover-tagx-esc': { good: { afterClick: st({ focus: 'popover-input' }), after: st({ open: false, focus: 'field' }) },
    old: { afterClick: st({ focus: 'popover-input' }), after: st({ open: false, focus: 'body' }) } },
  'F1-inline-tagx-esc': { good: { plain: st({ open: false, focus: 'field' }), after: st({ open: false, focus: 'field' }) },
    old: { plain: st({ open: false, focus: 'field' }), after: st({ open: false, focus: 'input' }) } },
  'F1-inline-click-close': { good: { after: st({ open: false, focus: 'input' }) }, old: { after: st({ open: false, focus: 'field' }) } },
  'F1-outside': { good: { after: st({ open: false, focus: 'body' }) }, old: { after: st({ open: false, focus: 'field' }) } },
  'K4-closed': { good: { line: 13, inline: label({ color: 'black', ariaHidden: false }), plain: label({ color: 'black', ariaHidden: false }) },
    old: { line: 13, inline: label({ color: 'black', ariaHidden: false, left: 20 }), plain: label({ color: 'black', ariaHidden: false }) } },
  'K4-open': { good: { line: 13, mutedColor: 'rgba(0, 0, 0, 0.45)', inputLeft: 13, label: label({}) },
    old: { line: 13, mutedColor: 'rgba(0, 0, 0, 0.45)', inputLeft: 45, label: label({ color: 'black', ariaHidden: false }) } },
  'K4-typed': { good: { line: 13, labelShown: false, keyword: 'fo', inputLeft: 13 }, old: { line: 13, labelShown: true, keyword: 'fo', inputLeft: 45 } },
  'K4-cleared': { good: { mutedColor: 'rgba(0, 0, 0, 0.45)', label: label({}) }, old: { mutedColor: 'rgba(0, 0, 0, 0.45)', label: label({ color: 'black', ariaHidden: false }) } },
  'K4-wrap': { good: { closedHeight: 32, typedHeight: 32 }, old: { closedHeight: 32, typedHeight: 57 } },
  'K4-people-open': { good: { closedNameLeft: 45, closedAvatarLeft: 13, open: { nameShown: false, avatars: 1, placeholder: '', inputLeft: 45, avatarLeft: 13 } },
    old: { closedNameLeft: 45, closedAvatarLeft: 13, open: { nameShown: true, avatars: 1, placeholder: '', inputLeft: 134, avatarLeft: 13 } } },
  'K4-people-typed': { good: { typed: { nameShown: false, keyword: 'bo' } }, old: { typed: { nameShown: true, keyword: 'bo' } } },
  'K4-hug-unrestricted': { good: { closed: 78, plain: 78, opened: 78, typed: 78, typedKeyword: 'b' }, old: { closed: 78, plain: 78, opened: 78, typed: 62.25, typedKeyword: 'b' } },
  'K4-long-closed': { good: { inline: { left: 13, width: 110 }, plain: { left: 13, width: 110 } }, old: { inline: { left: 13, width: 103.61 }, plain: { left: 13, width: 110 } } },
  'K4-people-hug': { good: { closed: 154.92, opened: 154.92, typed: 154.92, after: 154.92, typedKeyword: 'b', openedNameShown: false },
    old: { closed: 154.92, opened: 85.8, typed: 94.25, after: 154.92, typedKeyword: 'b', openedNameShown: false } },
  'K4-people-narrow': { good: { multi: { left: 45, visibleTextWidth: 69.13, truncated: false }, single: { left: 45, visibleTextWidth: 69.13, truncated: false } },
    old: { multi: { left: 45, visibleTextWidth: 41.09, truncated: true }, single: { left: 45, visibleTextWidth: 69.13, truncated: false } } },
  'K4-people-closed': { good: { closed: { nameShown: true, avatars: 1 } }, old: { closed: { nameShown: false, avatars: 1 } } },
}

export function judgeTableSelftest() {
  const problems = []
  for (const row of ROWS) {
    const s = SAMPLES[row.id]
    if (!s) { problems.push(`${row.id}:判定表沒有樣本`); continue }
    const good = judge({ [row.id]: s.good }, [row.id])
    const bad = judge({ [row.id]: s.old }, [row.id])
    const missing = judge({}, [row.id])
    if (good.failures.length || good.instrument.length) problems.push(`${row.id}:正確形狀判紅 ${[...good.failures.map((f) => f.line), ...good.instrument].join(' / ')}`)
    if (bad.failures.length !== 1 || bad.failures[0].id !== row.id) problems.push(`${row.id}:修前形狀沒有紅`)
    if (missing.instrument.length !== 1 || missing.failures.length) problems.push(`${row.id}:缺量測沒有判成儀器失效`)
  }
  for (const id of Object.keys(SAMPLES)) if (!ROW_BY_ID[id]) problems.push(`判定表有樣本「${id}」卻沒有這一列`)
  return problems
}

// ═══════════════════════════════════════════════════════════════════════════
// 頁面端量測(以 page.evaluate 序列化傳入,不得引用外部變數)
// ═══════════════════════════════════════════════════════════════════════════
function pageRead({ spec, valueText }) {
  const fields = [...document.querySelectorAll('[role="combobox"]')].filter((el) => !el.closest('[data-radix-popper-content-wrapper]'))
  const nameOf = (el) => el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
    .map((id) => (document.getElementById(id)?.textContent || '').trim()).join(' ').trim()
  const el = spec.index != null ? fields[spec.index] : fields.find((f) => (spec.label ? f.getAttribute('aria-label') === spec.label : nameOf(f) === spec.labelledBy))
  if (!el) return { found: false }
  const listId = el.getAttribute('aria-controls')
  const list = listId ? document.getElementById(listId) : null
  const searchInput = el.querySelector('input:not([aria-hidden="true"])')
  const popInput = list ? list.querySelector('[cmdk-input]') : null
  const ae = document.activeElement
  const focus = ae === el ? 'field' : (searchInput && ae === searchInput) ? 'input' : (popInput && ae === popInput) ? 'popover-input'
    : (list && list.contains(ae)) ? 'popover' : (!ae || ae === document.body) ? 'body' : el.contains(ae) ? `in-field:${ae.tagName.toLowerCase()}` : `other:${ae.tagName.toLowerCase()}`
  const items = list ? [...list.querySelectorAll('[cmdk-item]')].filter((i) => i.getClientRects().length) : []
  const selectable = items.filter((i) => i.getAttribute('data-disabled') !== 'true' && i.getAttribute('aria-disabled') !== 'true')
  const hl = items.find((i) => i.getAttribute('data-selected') === 'true') || null
  const text = (n) => (n ? (n.textContent || '').trim() : null)
  const aad = (searchInput || popInput)?.getAttribute('aria-activedescendant') || null
  const statusEl = el.querySelector('[role="status"]')
  // 欄位上看得見的字(葉節點;排除播報區與輸入框):值的文字畫在哪、什麼顏色、讀屏看不看得到
  const leaves = [...el.querySelectorAll('span, div')].filter((n) => n.childElementCount === 0 && (n.textContent || '').trim()
    && !n.closest('[role="status"]') && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden')
  const box = el.getBoundingClientRect()
  const leafOf = (t) => {
    const n = leaves.find((x) => (x.textContent || '').trim() === t)
    if (!n) return null
    const r = n.getBoundingClientRect()
    const cs = getComputedStyle(n)
    // 看得見的字寬 = 盒寬與字本身寬(Range 量文字節點,不受盒子撐寬影響)取小:盒子撐滿(flex-1)時盒比字寬,字被省略時字比盒寬
    const range = document.createRange()
    range.selectNodeContents(n)
    const textWidth = range.getBoundingClientRect().width
    return { left: Math.round((r.left - box.left) * 100) / 100, top: Math.round((r.top - box.top) * 100) / 100, width: Math.round(r.width * 100) / 100,
      visibleTextWidth: Math.round(Math.min(r.width, textWidth) * 100) / 100,
      truncated: n.scrollWidth > n.clientWidth + 1, color: cs.color, fontSize: cs.fontSize, ariaHidden: !!n.closest('[aria-hidden="true"]') }
  }
  const ruler = document.createElement('div')
  ruler.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--field-px)'
  el.appendChild(ruler)
  const fieldPx = parseFloat(getComputedStyle(ruler).width)
  ruler.remove()
  const line = Math.round((parseFloat(getComputedStyle(el).borderLeftWidth || '0') + fieldPx) * 100) / 100
  const avatars = [...el.querySelectorAll('[data-avatar-size]')].filter((a) => a.getClientRects().length)
  const avatarLeft = avatars.length ? Math.round((Math.min(...avatars.map((a) => a.getBoundingClientRect().left)) - box.left) * 100) / 100 : null
  return {
    found: true,
    open: el.getAttribute('aria-expanded') === 'true',
    focus,
    keyword: (searchInput || popInput)?.value ?? '',
    placeholder: searchInput ? searchInput.getAttribute('placeholder') ?? '' : null,
    inputLeft: searchInput ? Math.round((searchInput.getBoundingClientRect().left - box.left) * 100) / 100 : null,
    tags: [...el.querySelectorAll('[data-tag-text]')].map((t) => (t.textContent || '').trim()),
    mirror: el.querySelector('input[aria-hidden="true"]')?.value ?? null,
    status: statusEl ? (statusEl.textContent || '').trim() : null,
    highlight: text(hl),
    highlightIsFirst: !!hl && hl === selectable[0],
    first: text(selectable[0]),
    firstIsUnrestricted: !!selectable[0] && selectable[0].hasAttribute('data-unrestricted'),
    aadIsHighlight: !!hl && !!aad && aad === hl.id,
    unrestrictedShown: !!leafOf('不限'),
    label: valueText ? leafOf(valueText) : null,
    labelShown: valueText ? !!leafOf(valueText) : null,
    nameShown: valueText ? !!leafOf(valueText) : null,
    line,
    height: Math.round(box.height * 100) / 100,
    width: Math.round(box.width * 100) / 100,
    avatars: avatars.length,
    avatarLeft,
    mutedColor: searchInput ? getComputedStyle(searchInput, '::placeholder').color : null,
  }
}

// 對照組(--selftest 第二部分):把修法在頁面上拆掉。每一支都是 addInitScript 的函式,只碰它負責的那一件。
// K1:Backspace 到不了元件(window 捕獲階段擋傳遞;不擋預設 → 關鍵字照樣刪得掉,只有「刪值」這條路被拆)
function controlNoBackspace() {
  window.addEventListener('keydown', (e) => { if (e.key === 'Backspace') e.stopPropagation() }, true)
}
// K3:欄位本身收到的一般字元 / 輸入法第一鍵到不了元件(空白、Enter、方向鍵照常 —— 只拆「打字 → 搜尋框」這條路)
function controlNoTypeRoute() {
  window.addEventListener('keydown', (e) => {
    const t = e.target
    if (!(t instanceof Element) || t.getAttribute('role') !== 'combobox' || t.closest('[data-radix-popper-content-wrapper]')) return
    if ((e.key.length === 1 && e.key !== ' ') || e.keyCode === 229 || e.key === 'Process') e.stopPropagation()
  }, true)
}
// K2:清空之後「反白放回第一列」那一下(代發給清單根的 Home)被擋
function controlNoClearHighlight() {
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted && e.key === 'Home' && e.target instanceof Element && e.target.hasAttribute('cmdk-root')) e.stopPropagation()
  }, true)
}
// F1:按在觸發欄位上又被記成「按在外面」—— SelectMenu 那一次 preventDefault 失效、Radix 自己防關閉的那一次照常(= 修前的旗標狀態)
function controlTriggerCountsAsOutside() {
  const orig = Event.prototype.preventDefault
  const skipped = new WeakSet()
  Event.prototype.preventDefault = function preventDefault() {
    if (this.type === 'dismissableLayer.pointerDownOutside' && !skipped.has(this)) {
      const target = this.detail && this.detail.originalEvent && this.detail.originalEvent.target
      if (target instanceof Element && target.closest('[role="combobox"]') && !target.closest('[data-radix-popper-content-wrapper]')) { skipped.add(this); return undefined }
    }
    return orig.call(this)
  }
}
// K4:「不限」打開後仍是黑字、讀屏讀得到,打字時仍與關鍵字並排;PeoplePicker 1 位打開時名字仍在(= 修前長相)
export function controlValueStaysBesideKeyword() {
  const fix = () => {
    for (const el of document.querySelectorAll('[role="combobox"]')) {
      const input = el.querySelector('input:not([aria-hidden="true"])')
      const name = el.getAttribute('aria-label') || ''
      if (name === '商品類別(欄位內搜尋)' || name === '商品類別(窄欄位換行)') {
        // 只認看得見的字(讓位後留下寬的量尺是 visibility:hidden,不是「值還在」)
        const leaf = [...el.querySelectorAll('span')].find((s) => s.childElementCount === 0 && (s.textContent || '').trim() === '不限' && !s.closest('[role="status"]') && getComputedStyle(s).visibility !== 'hidden')
        if (leaf && leaf.closest('[aria-hidden="true"]')) { leaf.closest('[aria-hidden="true"]').removeAttribute('aria-hidden') }
        if (leaf && leaf.style.color !== 'var(--foreground)') leaf.style.color = 'var(--foreground)'
        if (!leaf && input && input.value && !el.querySelector('[data-control-k4]')) {
          const s = document.createElement('span'); s.textContent = '不限'; s.setAttribute('data-control-k4', ''); input.parentElement.parentElement.insertBefore(s, input.parentElement)
        }
      }
      if (el.getAttribute('aria-expanded') === 'true' && input && el.querySelectorAll('[data-avatar-size]').length === 1 && !el.querySelector('[data-control-k4]')
        && ![...el.querySelectorAll('span')].some((s) => s.childElementCount === 0 && (s.textContent || '').trim() === 'Alice Chen' && getComputedStyle(s).visibility !== 'hidden')) {
        const s = document.createElement('span'); s.textContent = 'Alice Chen'; s.setAttribute('data-control-k4', ''); input.parentElement.parentElement.insertBefore(s, input.parentElement)
      }
    }
  }
  new MutationObserver(fix).observe(document, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['aria-expanded', 'aria-hidden', 'value'] })
  document.addEventListener('input', fix, true)
}
// K1(播報字過期):播報區的字被清掉之後又被放回去(= 修前:「已移除『X』」一直留在欄位裡)
function controlStaleAnnouncement() {
  const last = new WeakMap()
  const restore = () => {
    for (const st of document.querySelectorAll('[role="combobox"] [role="status"]')) {
      const t = (st.textContent || '').trim()
      if (t) { last.set(st, t); continue }
      const prev = last.get(st)
      if (prev && !st.querySelector('[data-control-stale]')) {
        const s = document.createElement('span'); s.setAttribute('data-control-stale', ''); s.textContent = prev; st.appendChild(s)
      }
    }
  }
  new MutationObserver(restore).observe(document, { subtree: true, childList: true, characterData: true })
}
// K4(讓位後留下寬的量尺):搜尋框那一格裡、量尺以外的看不見的字被拿掉(= 本輪修前:依內容寬的欄位一打開 / 一打字就縮)
function controlNoYieldReserve() {
  const strip = () => {
    for (const input of document.querySelectorAll('[role="combobox"] input:not([aria-hidden="true"])')) {
      const cell = input.parentElement
      if (!cell) continue
      for (const s of cell.children) {
        if (s !== input && s.tagName === 'SPAN' && !s.hasAttribute('data-inline-search-mirror') && getComputedStyle(s).visibility === 'hidden' && s.style.display !== 'none') s.style.display = 'none'
      }
    }
  }
  new MutationObserver(strip).observe(document, { subtree: true, childList: true, characterData: true })
}
// K4(多人 1 位那一格的寬):那一格又跟搜尋框平分這一列剩下的空間(flex: 1 1 0% = 修前 PEOPLE_PICKER_LENGTH1_WRAPPER_CLASS 的 flex-1)
function controlNameSplitsWithSearch() {
  const split = () => {
    for (const input of document.querySelectorAll('[role="combobox"] input:not([aria-hidden="true"])')) {
      const cell = input.parentElement
      const area = cell?.parentElement
      if (!area) continue
      const avatars = area.querySelectorAll('[data-avatar-size]')
      if (avatars.length !== 1) continue
      // Tag 區的版面子項:直接子項,或包在 display:contents 外殼裡的子項(OverflowTagList 的清單外殼不佔版面)
      const items = [...area.children].flatMap((c) => (getComputedStyle(c).display === 'contents' ? [...c.children] : [c]))
      for (const w of items) if (w !== cell && w.querySelector('[data-avatar-size]') && w.style.flex !== '1 1 0%') w.style.flex = '1 1 0%'
    }
  }
  new MutationObserver(split).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded'] })
}
export const CONTROLS = [
  { family: 'K1', title: 'Backspace 到不了元件(修前:關鍵字空白按 Backspace 沒有反應)', init: controlNoBackspace },
  { family: 'K1', title: '播報字清掉後又被放回去(修前:「已移除『X』」選了別的、離開欄位後仍掛著)', init: controlStaleAnnouncement, rows: ['K1-status-after-change', 'K1-status-after-blur'] },
  { family: 'K2', title: '清空之後的反白搬移被擋(修前:反白停在剛被清掉的那一列)', init: controlNoClearHighlight },
  { family: 'K3', title: '欄位本身的字到不了元件(修前:焦點在欄位本身打字沒有反應)', init: controlNoTypeRoute },
  { family: 'F1', title: '按在觸發欄位上被記成「按在外面」(修前:按 × 再 Esc 焦點掉到頁面上)', init: controlTriggerCountsAsOutside },
  { family: 'K4', title: '值的文字打開後不讓位(修前:「不限 fo」/「Alice Chen bo」)', init: controlValueStaysBesideKeyword },
  { family: 'K4', title: '讓位後留下寬的量尺被拿掉(修前:依內容寬的欄位一打開 / 一打字就縮)', init: controlNoYieldReserve, rows: ['K4-hug-unrestricted', 'K4-people-hug'] },
  { family: 'K4', title: '多人 1 位那一格又跟搜尋框平分空間(修前:窄欄位名字被切成「Alice C…」)', init: controlNameSplitsWithSearch, rows: ['K4-people-narrow', 'K4-people-hug', 'K4-people-open'] },
]

// ═══════════════════════════════════════════════════════════════════════════
// 瀏覽器端操作與各列量測
// ═══════════════════════════════════════════════════════════════════════════
class ProbeError extends Error {}

function makeSession(page, server) {
  const read = async (spec, valueText = null) => {
    const r = await page.evaluate(pageRead, { spec, valueText })
    if (!r.found) throw new ProbeError(`找不到欄位 ${JSON.stringify(spec)}`)
    return r
  }
  const settle = async (what) => {
    const r = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
    if (!r.ok) throw new StoryRenderInstrumentError({ storyId: what, kind: 'dom-not-settled', reason: `互動之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)`, failedRequests: [] })
    const f = await waitForFocusStable(page, { frames: SETTLE_FRAMES })
    if (!f.ok) throw new ProbeError(`${what}:焦點一直在跳(${f.changes} 次,最後 ${f.active})`)
  }
  const open = async (storyId, waitFor = '[role="combobox"]') => {
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`, { waitFor, settleFrames: SETTLE_FRAMES, notFound: server.notFound })
  }
  const handleOf = async (spec) => {
    const h = await page.evaluateHandle((s) => {
      const fields = [...document.querySelectorAll('[role="combobox"]')].filter((el) => !el.closest('[data-radix-popper-content-wrapper]'))
      const nameOf = (el) => el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map((id) => (document.getElementById(id)?.textContent || '').trim()).join(' ').trim()
      return s.index != null ? fields[s.index] : fields.find((f) => (s.label ? f.getAttribute('aria-label') === s.label : nameOf(f) === s.labelledBy)) || null
    }, spec)
    const el = h.asElement()
    if (!el) throw new ProbeError(`找不到欄位 ${JSON.stringify(spec)}`)
    return el
  }
  /** 點觸發欄位自己的表面(不是 Tag / 頭像 / ×);prefer:'end' = 箭頭那一側 */
  const clickField = async (spec, what, prefer = 'center') => {
    const h = await handleOf(spec)
    const at = await ownSurfacePosition(h, { prefer })
    if (!at.ok) throw new ProbeError(`${what}:欄位上找不到可以點的表面(${at.why})`)
    await h.click({ position: at.position, timeout: 5_000 })
    await settle(what)
  }
  const clickIn = async (spec, selector, what) => {
    const h = await handleOf(spec)
    const target = await h.$(selector)
    if (!target) throw new ProbeError(`${what}:欄位裡找不到 ${selector}`)
    await target.click({ timeout: 5_000 })
    await settle(what)
  }
  const clickOption = async (textPattern, what) => {
    await page.locator('[data-radix-popper-content-wrapper] [cmdk-item]', { hasText: textPattern }).first().click({ timeout: 5_000 })
    await settle(what)
  }
  const focusField = async (spec, what) => {
    const h = await handleOf(spec)
    await h.evaluate((el) => el.focus())
    await settle(what)
  }
  const press = async (key, what) => { await page.keyboard.press(key); await settle(what) }
  const type = async (text, what) => { await page.keyboard.type(text); await settle(what) }
  /** 合成一顆 keydown 送給目前焦點(連發 / 組字的形狀 —— 真鍵盤無法在無頭瀏覽器造出) */
  const synth = async (init, what) => {
    await page.evaluate((i) => {
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: i.key, code: i.key, repeat: !!i.repeat, isComposing: !!i.isComposing })
      if (i.keyCode) Object.defineProperty(ev, 'keyCode', { get: () => i.keyCode })
      ;(document.activeElement || document.body).dispatchEvent(ev)
    }, init)
    await settle(what)
  }
  /** 真的組字:輸入法第一鍵(keyCode 229 / Process)→ 組字中「ㄨ」→ 確認「我」(CDP;無頭瀏覽器沒有輸入法,這是能造出的最接近形狀) */
  let cdp = null
  const imeCompose = async (what) => {
    cdp ??= await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'KeyJ', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 })
    await cdp.send('Input.imeSetComposition', { text: 'ㄨ', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.insertText', { text: '我' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Process', code: 'KeyJ', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 })
    await settle(what)
  }
  const clickBlank = async (what) => {
    await page.mouse.click(1200, 1050)
    await settle(what)
  }
  return { read, open, clickField, clickIn, clickOption, focusField, press, type, synth, imeCompose, clickBlank }
}

// 每一段:開一則 story、做一串動作、回 { rowId: 量測 }。一段失敗(儀器)只讓那一段的列判成儀器失效,不吞掉其他段。
const SEGMENTS = [
  // K1 / K2 / K3 / F1 —— Combobox 欄位內搜尋(FieldKeysContract 第一格:Electronics + Food,可清空)
  { id: 'inline', story: STORIES.keys, rows: ['K1-inline-repeat', 'K1-inline-ime', 'K1-inline-last', 'K1-inline-keyword', 'K1-inline-body'],
    run: async (s) => {
      const f = FIELDS.inline
      const out = {}
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      let before = await s.read(f)
      await s.synth({ key: 'Backspace', repeat: true }, '連發 Backspace')
      out['K1-inline-repeat'] = { before, after: await s.read(f) }
      before = await s.read(f)
      await s.synth({ key: 'Backspace', isComposing: true }, '組字中 Backspace(isComposing)')
      await s.synth({ key: 'Backspace', keyCode: 229 }, '組字中 Backspace(keyCode 229)')
      out['K1-inline-ime'] = { before, after: await s.read(f) }
      before = await s.read(f)
      await s.press('Backspace', '關鍵字空白按 Backspace')
      out['K1-inline-last'] = { before, after: await s.read(f) }
      await s.type('f', '打 f')
      before = await s.read(f)
      await s.press('Backspace', '有關鍵字按 Backspace')
      out['K1-inline-keyword'] = { before, after: await s.read(f) }
      await s.press('Escape', 'Esc 收起')
      before = await s.read(f)
      if (before.open) throw new ProbeError('Esc 之後清單沒有收起')
      if (before.focus !== 'field') { await s.focusField(f, '把焦點放回欄位本身'); before = await s.read(f) }
      await s.press('Backspace', '欄位本身按 Backspace')
      out['K1-inline-body'] = { before, after: await s.read(f) }
      return out
    } },
  // 播報字離開欄位就清掉(K1;select-menu-removal-status.tsx (b))
  { id: 'inline-status', story: STORIES.keys, rows: ['K1-status-after-blur'],
    run: async (s) => {
      const f = FIELDS.inline
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.press('Backspace', '關鍵字空白按 Backspace')
      const removed = await s.read(f)
      await s.clickBlank('點頁面空白處(焦點離開欄位)')
      return { 'K1-status-after-blur': { removed, after: await s.read(f) } }
    } },
  { id: 'inline-clear', story: STORIES.keys, rows: ['K2-inline'],
    run: async (s) => {
      const f = FIELDS.inline
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.press('ArrowDown', '反白往下'); await s.press('ArrowDown', '反白往下')
      const before = await s.read(f)
      await s.clickIn(f, 'button[aria-label="清除全部"]', '按一鍵清空 ×')
      return { 'K2-inline': { before, after: await s.read(f) } }
    } },
  { id: 'inline-type', story: STORIES.keys, rows: ['K3-inline', 'F1-inline-tagx-esc', 'F1-inline-click-close'],
    run: async (s) => {
      const f = FIELDS.inline
      const out = {}
      await s.focusField(f, '焦點放在欄位本身')
      await s.type('fo', '欄位本身打 fo')
      out['K3-inline'] = { after: await s.read(f) }
      await s.press('Escape', 'Esc 收起')
      // 直接 Esc 的落點(對照)
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.press('Escape', '直接 Esc')
      const plain = await s.read(f)
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.clickIn(f, 'button[aria-label="移除 Food"]', '按 Food 的 ×')
      await s.press('Escape', '按 × 之後 Esc')
      out['F1-inline-tagx-esc'] = { plain, after: await s.read(f) }
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.clickField(f, '點欄位(箭頭那一側)收起', 'end')
      out['F1-inline-click-close'] = { after: await s.read(f) }
      return out
    } },
  { id: 'inline-ime', story: STORIES.keys, rows: ['K3-ime-inline'],
    run: async (s) => {
      const f = FIELDS.inline
      await s.focusField(f, '焦點放在欄位本身')
      await s.imeCompose('輸入法第一鍵 + 組字')
      return { 'K3-ime-inline': { after: await s.read(f) } }
    } },
  // 浮層內搜尋(FieldKeysContract 第二格)
  { id: 'popover', story: STORIES.keys, rows: ['K2-popover', 'K3-popover', 'F1-popover-tagx-esc'],
    run: async (s) => {
      const f = FIELDS.popover
      const out = {}
      await s.clickField(f, '點開浮層內搜尋')
      await s.press('ArrowDown', '反白往下'); await s.press('ArrowDown', '反白往下')
      let before = await s.read(f)
      await s.clickIn(f, 'button[aria-label="清除全部"]', '按一鍵清空 ×')
      out['K2-popover'] = { before, after: await s.read(f) }
      await s.press('Escape', 'Esc 收起')
      await s.focusField(f, '焦點放在欄位本身')
      await s.type('fo', '欄位本身打 fo')
      out['K3-popover'] = { after: await s.read(f) }
      await s.press('Escape', 'Esc 收起')
      // 重新選兩項,再量「按 Tag × 再 Esc」
      await s.clickField(f, '點開浮層內搜尋')
      await s.clickOption('Electronics', '選 Electronics')
      await s.clickOption('Food', '選 Food')
      before = await s.read(f)
      await s.clickIn(f, 'button[aria-label="移除 Food"]', '按 Food 的 ×')
      const afterClick = await s.read(f)
      await s.press('Escape', '按 × 之後 Esc')
      out['F1-popover-tagx-esc'] = { before, afterClick, after: await s.read(f) }
      return out
    } },
  { id: 'popover-ime', story: STORIES.keys, rows: ['K3-ime-popover'],
    run: async (s) => {
      const f = FIELDS.popover
      await s.focusField(f, '焦點放在欄位本身')
      await s.imeCompose('輸入法第一鍵 + 組字')
      return { 'K3-ime-popover': { after: await s.read(f) } }
    } },
  // Select 單選 searchable + clearable(「搜尋」範例,開場空值 → 先選「日本」)
  { id: 'select', story: STORIES.select, rows: ['K2-select', 'K1-select-clearable', 'K2-select-backspace', 'K1-status-after-change', 'F1-select-x-esc', 'K3-select', 'K1-select-body', 'K3-space', 'F1-select-input-click', 'F1-outside'],
    run: async (s) => {
      const f = FIELDS.select
      const out = {}
      const pickJapan = async () => { await s.clickField(f, '點開 Select'); await s.clickOption('日本', '選日本') }
      await pickJapan()
      await s.clickField(f, '再點開(有值)')
      let before = await s.read(f)
      await s.clickIn(f, 'button[aria-label="清除選取"]', '按清除 ×')
      const afterClear = await s.read(f)
      out['K2-select'] = { before, after: afterClear }
      await s.press('Escape', '按 × 之後 Esc')
      out['F1-select-x-esc'] = { afterClear, after: await s.read(f) }
      await pickJapan()
      await s.clickField(f, '再點開(有值)')
      before = await s.read(f)
      await s.press('Backspace', '關鍵字空白按 Backspace')
      out['K1-select-clearable'] = { before, after: await s.read(f) }
      out['K2-select-backspace'] = out['K1-select-clearable']
      // 播報字在值又變了之後清掉(K1;select-menu-removal-status.tsx (a)):清掉「日本」之後選「美國」
      await s.clickOption('美國', '清掉之後選美國')
      out['K1-status-after-change'] = { removed: out['K1-select-clearable'].after, after: await s.read(f) }
      if ((await s.read(f)).open) await s.press('Escape', 'Esc 收起')
      // 選完收起 → 焦點在欄位本身
      await pickJapan()
      if ((await s.read(f)).focus !== 'field') await s.focusField(f, '把焦點放回欄位本身')
      await s.type('ab', '欄位本身打 ab')
      out['K3-select'] = { after: await s.read(f) }
      await s.press('Escape', 'Esc 收起')
      if ((await s.read(f)).focus !== 'field') await s.focusField(f, '把焦點放回欄位本身')
      before = await s.read(f)
      await s.press('Backspace', '欄位本身按 Backspace')
      out['K1-select-body'] = { before, after: await s.read(f) }
      await s.focusField(f, '焦點放在欄位本身')
      await s.press(' ', '欄位本身按空白鍵')
      out['K3-space'] = { after: await s.read(f) }
      await s.press('Escape', 'Esc 收起')
      await pickJapan()
      await s.clickField(f, '再點開(有值)')
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '再點一下搜尋框')
      out['F1-select-input-click'] = { after: await s.read(f) }
      if ((await s.read(f)).open) await s.press('Escape', 'Esc 收起')
      await s.clickField(f, '再點開')
      await s.clickBlank('點頁面空白處')
      out['F1-outside'] = { after: await s.read(f) }
      return out
    } },
  { id: 'select-ime', story: STORIES.select, rows: ['K3-ime-select'],
    run: async (s) => {
      const f = FIELDS.select
      await s.focusField(f, '焦點放在欄位本身')
      await s.imeCompose('輸入法第一鍵 + 組字')
      return { 'K3-ime-select': { after: await s.read(f) } }
    } },
  // Select 單選沒開 clearable(PeoplePicker 單人 = Select 包裝,開場 Alice Chen)
  { id: 'select-required', story: STORIES.ppSingle, rows: ['K1-select-required'],
    run: async (s) => {
      const f = FIELDS.ppSingle
      await s.clickField(f, '點開', 'end')
      await s.press('Backspace', '開著按 Backspace')
      const openState = await s.read(f)
      await s.press('Escape', 'Esc 收起')
      if ((await s.read(f)).focus !== 'field') await s.focusField(f, '把焦點放回欄位本身')
      await s.press('Backspace', '關著按 Backspace')
      return { 'K1-select-required': { open: openState, closed: await s.read(f) } }
    } },
  // K4「不限」× 欄位內搜尋 + Backspace 刪「不限」+ × 後反白
  { id: 'unrestricted', story: STORIES.unr, rows: ['K4-closed', 'K4-open', 'K4-typed', 'K4-cleared', 'K2-unrestricted', 'K1-unrestricted'],
    run: async (s) => {
      const f = FIELDS.unr
      const out = {}
      const closed = await s.read(f, UNRESTRICTED_LABEL)
      const plain = await s.read(FIELDS.unrPlain, UNRESTRICTED_LABEL)
      out['K4-closed'] = { line: closed.line, inline: closed.label, plain: plain.label }
      const empty = await s.read(FIELDS.unrEmpty)
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      let o = await s.read(f, UNRESTRICTED_LABEL)
      out['K4-open'] = { line: o.line, mutedColor: empty.mutedColor, inputLeft: o.inputLeft, label: o.label }
      await s.type('fo', '打 fo')
      o = await s.read(f, UNRESTRICTED_LABEL)
      out['K4-typed'] = { line: o.line, labelShown: o.labelShown, keyword: o.keyword, inputLeft: o.inputLeft }
      await s.press('Backspace', '刪字'); await s.press('Backspace', '刪字')
      o = await s.read(f, UNRESTRICTED_LABEL)
      out['K4-cleared'] = { mutedColor: empty.mutedColor, label: o.label }
      await s.press('ArrowDown', '反白往下'); await s.press('ArrowDown', '反白往下')
      const before = await s.read(f)
      await s.clickIn(f, 'button[aria-label="清除全部"]', '按一鍵清空 ×')
      out['K2-unrestricted'] = { before, after: await s.read(f) }
      return out
    } },
  { id: 'unrestricted-backspace', story: STORIES.unr, rows: ['K1-unrestricted', 'K4-wrap'],
    run: async (s) => {
      const out = {}
      await s.clickIn(FIELDS.unr, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.press('Backspace', '關鍵字空白按 Backspace')
      out['K1-unrestricted'] = { after: await s.read(FIELDS.unr) }
      await s.press('Escape', 'Esc 收起')
      const closed = await s.read(FIELDS.unrNarrow)
      await s.clickIn(FIELDS.unrNarrow, 'input:not([aria-hidden="true"])', '點窄欄位的搜尋框打開')
      await s.type('Furniture Lifestyle', '打一長串字')
      const typed = await s.read(FIELDS.unrNarrow)
      out['K4-wrap'] = { closedHeight: closed.height, typedHeight: typed.height }
      return out
    } },
  // PeoplePicker 多人 × 欄位內搜尋:「選擇性出席者」開場空值 → 選 1 位
  { id: 'people', story: STORIES.ppMulti, rows: ['K4-people-open', 'K4-people-typed', 'K4-people-closed'],
    run: async (s) => {
      const f = FIELDS.ppOptional
      await s.clickIn(f, 'input:not([aria-hidden="true"])', '點欄位內搜尋框打開')
      await s.clickOption(PERSON, `選 ${PERSON}`)
      const o = await s.read(f, PERSON)
      await s.type('bo', '打 bo')
      const t = await s.read(f, PERSON)
      await s.press('Escape', 'Esc 收起')
      const c = await s.read(f, PERSON)
      return {
        'K4-people-open': { closedNameLeft: c.label?.left ?? null, closedAvatarLeft: c.avatarLeft, open: { nameShown: o.nameShown, avatars: o.avatars, placeholder: o.placeholder, inputLeft: o.inputLeft, avatarLeft: o.avatarLeft } },
        'K4-people-typed': { typed: { nameShown: t.nameShown, keyword: t.keyword } },
        'K4-people-closed': { closed: { nameShown: c.nameShown, avatars: c.avatars } },
      }
    } },
  // 讓位不改欄寬(K4;2026-10-07 驗證回報):依內容寬 / 窄欄位長標籤的「不限」各一對(欄位內搜尋 / 不可搜尋)
  { id: 'unrestricted-width', story: STORIES.yieldWidth, rows: ['K4-long-closed', 'K4-hug-unrestricted'],
    run: async (s) => {
      const out = {}
      const pick = (l) => l && { left: l.left, width: l.width }
      const long = await s.read(FIELDS.unrLong, LONG_UNRESTRICTED_LABEL)
      const longPlain = await s.read(FIELDS.unrLongPlain, LONG_UNRESTRICTED_LABEL)
      out['K4-long-closed'] = { inline: pick(long.label), plain: pick(longPlain.label) }
      const plain = await s.read(FIELDS.unrHugPlain)
      const closed = await s.read(FIELDS.unrHug)
      await s.clickIn(FIELDS.unrHug, 'input:not([aria-hidden="true"])', '點依內容寬欄位的搜尋框打開')
      const opened = await s.read(FIELDS.unrHug)
      await s.type('b', '打 b')
      const typed = await s.read(FIELDS.unrHug)
      out['K4-hug-unrestricted'] = { closed: closed.width, plain: plain.width, opened: opened.width, typed: typed.width, typedKeyword: typed.keyword }
      return out
    } },
  // PeoplePicker 多人 1 位:依內容寬打開前後欄寬、窄欄位關著名字完整(與同寬單人欄位比)
  { id: 'people-width', story: STORIES.yieldWidth, rows: ['K4-people-narrow', 'K4-people-hug'],
    run: async (s) => {
      const out = {}
      const pick = (l) => l && { left: l.left, visibleTextWidth: l.visibleTextWidth, truncated: l.truncated }
      const multi = await s.read(FIELDS.ppNarrow, PERSON)
      const single = await s.read(FIELDS.ppSingleNarrow, PERSON)
      out['K4-people-narrow'] = { multi: pick(multi.label), single: pick(single.label) }
      const closed = await s.read(FIELDS.ppHug, PERSON)
      await s.clickIn(FIELDS.ppHug, 'input:not([aria-hidden="true"])', '點依內容寬欄位的搜尋框打開')
      const opened = await s.read(FIELDS.ppHug, PERSON)
      await s.type('b', '打 b')
      const typed = await s.read(FIELDS.ppHug, PERSON)
      await s.press('Escape', 'Esc 收起')
      const after = await s.read(FIELDS.ppHug, PERSON)
      out['K4-people-hug'] = { closed: closed.width, opened: opened.width, typed: typed.width, after: after.width, typedKeyword: typed.keyword, openedNameShown: opened.nameShown }
      return out
    } },
]
// K1-unrestricted 由 unrestricted-backspace 段量(unrestricted 段在 × 之後值已清空)
SEGMENTS.find((x) => x.id === 'unrestricted').rows = SEGMENTS.find((x) => x.id === 'unrestricted').rows.filter((r) => r !== 'K1-unrestricted')

async function measureAll(server, { segments = SEGMENTS, initScript = null } = {}) {
  const report = {}
  // 本 repo 的 Chromium 以 --single-process 起(lib/launch-browser.mjs SANDBOX_ARGS):一個瀏覽器只開得了一個分頁(第二個 newPage 回
  // 「browser has been closed」,實測)—— 每一輪量測自己起一個瀏覽器、只用一個分頁,各段靠 openStory 重新導覽歸零;對照組的 init script 掛在這個分頁上
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
  if (initScript) await page.addInitScript(initScript)
  const s = makeSession(page, server)
  try {
    for (const seg of segments) {
      try {
        await s.open(seg.story)
        Object.assign(report, await seg.run(s))
      } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError) && !(error instanceof ProbeError) && !/Timeout/i.test(error?.name ?? '')) throw error
        for (const r of seg.rows) if (!report[r]) report[r] = { instrument: `${seg.id} 段停在半途 —— ${String(error.message).split('\n')[0]}` }
      }
    }
  } finally {
    await browser.close().catch(() => null)
  }
  return report
}

async function main() {
  requireStorybookBuild(join(BUILD, 'index.json'))
  if (SELFTEST) {
    const problems = judgeTableSelftest()
    if (problems.length) { console.error(`❌ searchable-field-keys selftest FAIL:判定表\n  ${problems.join('\n  ')}`); return 1 }
    console.log(`✓ 判定表:${ROWS.length} 列各自「正確形狀綠 / 修前形狀紅 / 缺量測 = 儀器失效」`)
  }
  const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
  try {
    const v = judge(await measureAll(server))
    for (const id of v.passed) console.log(`✓ [${ROW_BY_ID[id].family}] ${id} ${ROW_BY_ID[id].name}`)
    for (const f of v.failures) console.log(f.line)
    if (v.instrument.length) {
      console.error(`\n✗ INSTRUMENT-FAIL:${v.instrument.length} 列沒量到(不是產品不符,也不是對照組抓到)\n  ${v.instrument.join('\n  ')}`)
      const missing = [...new Set(server.notFound)]
      if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
      return 1
    }
    if (!SELFTEST) {
      if (v.failures.length) { console.log(`\n✗ ${v.failures.length} 列不符(族:${[...new Set(v.failures.map((f) => f.family))].join(' / ')})`); return 1 }
      console.log(`\n✓ 可搜尋欄位的按鍵與值顯示:${ROWS.length} 列全符合(K1 Backspace 與播報 / K2 清空後反白 / K3 欄位本身打字 / F1 收起後焦點 / K4 值讓位給關鍵字、讓位不改欄寬)`)
      return 0
    }
    if (v.failures.length) { console.error(`❌ selftest FAIL:沒動頁面時就紅了(先修產品,對照組才有意義)`); return 1 }
    let ok = true
    for (const c of CONTROLS) {
      // 只重跑帶著這一族的段(段裡的對照列照樣判 —— 一組對照組把對照列也弄紅 = 它拆掉的不只一件事,算失敗);全部對照列已在上面不動頁面那一輪判過綠。
      // 對照組有寫 `rows`(只拆一族裡的一件事)時只重跑含那幾列的段 —— 省下的是時間,判準不變(紅仍須落在自己那一族、對照列與別族全程綠)
      const segments = SEGMENTS.filter((seg) => seg.rows.some((r) => (c.rows ? c.rows.includes(r) : ROW_BY_ID[r].family === c.family)))
      const ids = segments.flatMap((seg) => seg.rows)
      const r = judge(await measureAll(server, { segments, initScript: c.init }), ids)
      const red = r.failures.filter((f) => f.family === c.family)
      const guardRed = r.failures.filter((f) => f.family === 'GUARD')
      const otherRed = r.failures.filter((f) => f.family !== c.family && f.family !== 'GUARD' && !(ROW_BY_ID[f.id].alsoUnder ?? []).includes(c.family))
      const familyRows = ids.filter((id) => ROW_BY_ID[id].family === c.family)
      const inst = r.instrument.filter((x) => familyRows.some((id) => x.startsWith(`${id}:`)))
      const caught = red.length > 0 && inst.length === 0
      const pass = caught && guardRed.length === 0 && otherRed.length === 0
      console.log(`${pass ? '✓' : '✗'} 對照組 [${c.family}] ${c.title}:紅 ${red.length}/${familyRows.length} 列${guardRed.length ? `;對照列被誤紅 ${guardRed.map((f) => f.id).join(', ')}` : ''}${otherRed.length ? `;別族也紅 ${otherRed.map((f) => f.id).join(', ')}` : ''}${inst.length ? `;儀器失效 ${inst.join(' / ')}` : ''}`)
      ok &&= pass
    }
    if (!ok) { console.error('❌ searchable-field-keys selftest FAIL'); return 1 }
    console.log(`✅ searchable-field-keys selftest PASS(判定表 ${ROWS.length} 列 + 不動頁面全綠 + ${CONTROLS.length} 組拆掉修法各自紅在自己那一族、對照列全程綠)`)
    return 0
  } finally {
    await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(await main())
