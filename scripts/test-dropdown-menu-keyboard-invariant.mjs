#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: dropdown-menu-keyboard-invariant 的三支純判定(judgeEscStep / judgeTabOut / judgeFabReturn)分得出 pass / fail / instrument 三種結論,
 *         量不到(null / undefined / NaN / 焦點身分不明)一律回 instrument,不會被讀成通過或失敗
 *   紅: 舊行為的每一格(Esc 一次全關、Tab 被擋選單不動、點外面後焦點被搶回浮鈕、焦點掉到 body)都必須判 fail,
 *       量不到的每一格都必須判 instrument;任一格不符 → exit 1;寫錯情境(未知的關法)必須丟錯
 *   綠: 正確行為的每一格判 pass;純函式、不開瀏覽器、不讀時間,重複跑結果相同
 *
 * dropdown-menu-keyboard-invariant 的純判定表(不開瀏覽器;待辦總帳 B10 / B11)。
 * 每一支判定都有兩面對照(該 pass 的一格、該 fail 的一格),外加「沒量到」那幾格 ——
 * 量不到必須回 'instrument',不得被讀成 pass 或 fail(M37 第八個形狀:沒觀察到 ≠ 沒發生)。
 */
import assert from 'node:assert/strict'
import { judgeEscStep, judgeFabReturn, judgeTabOut } from './dropdown-menu-keyboard-invariant.mjs'

const cases = [
  // ── Esc 一步:少一層 + 焦點在上一層那一項 ──
  ['Esc:3 → 2 層、焦點在上一層那一項', judgeEscStep({ openBefore: 3, openAfter: 2, activeText: '行動 App 改版', expectedText: '行動 App 改版' }), 'pass'],
  ['Esc:舊行為一次全關(3 → 0)', judgeEscStep({ openBefore: 3, openAfter: 0, activeText: '更多動作', expectedText: '行動 App 改版' }), 'fail'],
  ['Esc:層數對、焦點錯', judgeEscStep({ openBefore: 2, openAfter: 1, activeText: '複製連結', expectedText: '移動到' }), 'fail'],
  ['Esc:什麼都沒關(2 → 2)', judgeEscStep({ openBefore: 2, openAfter: 2, activeText: '移動到', expectedText: '移動到' }), 'fail'],
  ['Esc:層數量不到', judgeEscStep({ openBefore: 3, openAfter: null, activeText: '行動 App 改版', expectedText: '行動 App 改版' }), 'instrument'],
  ['Esc:焦點量不到', judgeEscStep({ openBefore: 3, openAfter: 2, activeText: null, expectedText: '行動 App 改版' }), 'instrument'],
  ['Esc:起始層數量不到(NaN)', judgeEscStep({ openBefore: Number.NaN, openAfter: 2, activeText: 'x', expectedText: 'x' }), 'instrument'],
  // ── Tab 離開:全關 + 落點 = 關著時按同一鍵的落點 ──
  ['Tab:全關、落點一致', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON||分享', expectedKey: 'BUTTON||分享' }), 'pass'],
  ['Tab:舊行為選單不動', judgeTabOut({ openAfter: 3, activeKey: 'DIV||待辦', expectedKey: 'BUTTON||分享' }), 'fail'],
  ['Tab:關了但焦點掉到別處(例:頁尾)', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON||頁尾', expectedKey: 'BUTTON||分享' }), 'fail'],
  ['Tab:焦點掉到 body(量到了,是產品失敗)', judgeTabOut({ openAfter: 0, activeKey: 'BODY', expectedKey: 'BUTTON||分享' }), 'fail'],
  ['Tab:焦點量不到(null)', judgeTabOut({ openAfter: 0, activeKey: null, expectedKey: 'BUTTON||分享' }), 'instrument'],
  ['Tab:關著時按 Tab 沒有落點(答案本身量不到)', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON||分享', expectedKey: null }), 'instrument'],
  // ── 頁面邊緣:關著時按 Tab 會離開文件('BODY')→ 正本:焦點留在觸發點(keyboard-model-canonical.md「彈出框開著時按 Tab」;X20)──
  ['Tab 頁面邊緣:全關、焦點留在觸發鈕', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON|開啟智慧代理|', expectedKey: 'BODY', triggerKey: 'BUTTON|開啟智慧代理|' }), 'pass'],
  ['Tab 頁面邊緣:焦點掉到 body(焦點遺失)', judgeTabOut({ openAfter: 0, activeKey: 'BODY', expectedKey: 'BODY', triggerKey: 'BUTTON|開啟智慧代理|' }), 'fail'],
  ['Tab 頁面邊緣:舊行為選單不動', judgeTabOut({ openAfter: 1, activeKey: 'DIV||開新對話', expectedKey: 'BODY', triggerKey: 'BUTTON|開啟智慧代理|' }), 'fail'],
  ['Tab 頁面邊緣:焦點跑到頁首某處', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON||頁首', expectedKey: 'BODY', triggerKey: 'BUTTON|開啟智慧代理|' }), 'fail'],
  ['Tab 頁面邊緣:觸發鈕身分量不到', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON|開啟智慧代理|', expectedKey: 'BODY', triggerKey: null }), 'instrument'],
  ['Tab 非邊緣:triggerKey 不影響判定(落點仍是下一站)', judgeTabOut({ openAfter: 0, activeKey: 'BUTTON||更多動作', expectedKey: 'BUTTON||分享', triggerKey: 'BUTTON||更多動作' }), 'fail'],
  // ── 浮鈕選單關閉後焦點 ──
  ['浮鈕 Esc → 回浮鈕', judgeFabReturn({ how: 'escape', openAfter: 0, focusOnFab: true }), 'pass'],
  ['浮鈕 Esc → 沒回浮鈕', judgeFabReturn({ how: 'escape', openAfter: 0, focusOnFab: false }), 'fail'],
  ['浮鈕點外面 → 不被搶回', judgeFabReturn({ how: 'outside', openAfter: 0, focusOnFab: false }), 'pass'],
  ['浮鈕點外面 → 舊行為搶回浮鈕', judgeFabReturn({ how: 'outside', openAfter: 0, focusOnFab: true }), 'fail'],
  ['浮鈕點外面 → 選單沒關', judgeFabReturn({ how: 'outside', openAfter: 1, focusOnFab: false }), 'fail'],
  ['浮鈕:焦點身分量不到', judgeFabReturn({ how: 'outside', openAfter: 0, focusOnFab: undefined }), 'instrument'],
]

let bad = 0
for (const [name, got, want] of cases) {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${name} → ${got}${ok ? '' : `(應為 ${want})`}`)
}
assert.throws(() => judgeFabReturn({ how: 'blur', openAfter: 0, focusOnFab: false }), /未知的關法/)
console.log('✓ 未知的關法 → 丟錯(寫錯情境是程式錯誤,不是判定)')
if (bad) { console.log(`✗ ${bad} 格判定不符`); process.exit(1) }
console.log(`✅ dropdown-menu-keyboard 判定表 ${cases.length + 1} 格全對`)
