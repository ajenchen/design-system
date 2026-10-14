#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: useFormValidation(packages/design-system/src/components/Field/use-form-validation.ts)真的照
 *        form-validation.spec.md 的規則 1 / 2 / 4 / 5 / 6 / 7 / 8 動作 —— 用真鍵盤、真滑鼠、觸控在欄位同名的幾張表單上逐條走
 *        (每一列見下方「判定表」):錯誤會顯示也會清掉、Escape 回原值、送出失敗時焦點只落在被送出那張表的第一個錯誤、
 *        打了不合法的值直接按下方的按鈕時,錯誤長出來不會把這一下 click 推離那顆按鈕;原生拖曳之後「按著」不會卡住。
 *   紅: 任一條不符 → 逐條點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個 2026-10-01 修掉的根因(二十六個:hook 十一個 + 對話框 / 送出鈕焦點 / Toast 十五個,見下方
 *        「突變」與 MUTANTS),每個突變都必須**剛好**紅它負責的那幾條(多紅少紅都算量具不可信),契約列每一條都要被某個突變弄紅過。
 *   綠: 現行 hook 每條都量到且符合,且對照列(C2 剛掛載就空送出看得到錯誤、C3 第一張表的焦點搬家、
 *        C5 只清被編輯那欄、C6 改成仍不合法再離開錯誤回來、C9 reset 清空、C8b / C8c 那一下送出真的有跑驗證)
 *        在現行 hook 與每個突變上都綠 ——
 *        證明量具看得到錯誤、看得到焦點,紅燈不是量具壞了。harness 載不起來 / 找不到欄位 / 版面或焦點等不到靜止
 *        = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-10-01 新增(待辦總帳 N65)。修正前的 hook 以 `--hook=<修正前的檔案>` 跑,R2 / R4a / R4b / R5 / R6 / R7 / R8 / R8b / R8c
 *        全紅 —— 那就是它的天然對照組;同日第一版修法(只以 `<form>` 界定)只紅 R8b(當天實跑紀錄在待辦總帳 N65 列)。
 *        同日下午(待辦總帳 N64 / N68 / N69 / OE29)加 `--root=<整棵原始碼>`:突變與對照組不再只限 hook —— Dialog / Popover / Button 的原始碼、
 *        三則表單 story 都打進 harness(scripts/lib/ds-source-harness.mjs);修改前的基準樹(git archive)跑 `--root=` 剛好紅下方十列新契約、舊列全綠(2026-10-07 加 T-dialog / T-sheet 後是十二列,同樣只紅新契約)。
 *        同日加規則 2 × 滑鼠 / 觸控那幾列(待辦總帳 N67):第一輪修好、還沒有延後的 hook 以 `--hook=` 跑,剛好紅 R2d-submit / R2d-touch /
 *        R2d-cancel / R2d-footer(實跑紀錄在待辦總帳 N67 列)。context 開 hasTouch 才點得了觸控;滑鼠與鍵盤照常。
 *        同日驗證抓到延後的第一版把原生拖曳卡成「一直按著」(R2d-drag):那一版以 `--hook=` 跑剛好只紅 R2d-drag。
 *        筆那兩段用 CDP `Input.dispatchMouseEvent` 的 pointerType 'pen'(Playwright 沒有筆的 API)。
 *
 * ── 判定表(契約列)──
 * R2 打字後離開才驗,錯誤真的顯示;
 * 規則 2 × 滑鼠 / 觸控(待辦總帳 N67:錯誤訊息在按下與放開之間長出來、把下方的按鈕推走,這一下 click 落空):
 *   R2d-submit 打了不合法的值直接用滑鼠按「送出」→ 這一下落在送出鈕上(計數 1)、送出全驗、焦點落在這張表的第一個錯誤;
 *   R2d-touch 同一件事用觸控點一下(觸控的焦點在補發的 mousedown 才移動,在 touch 的 pointerup 之後);
 *   R2d-footer 同一件事在沒有 `<form>` 的 footer「建立」(WM 對話框寫法、沒打字就按 —— N67 記的修正前就有的版本);
 *   R2d-cancel 按的是欄位下方的「重設」(取消類)→ 這一下落在它上面、表單清空,延後的驗證沒有在清空的表單上補報錯;
 *   R2d-tab 鍵盤離開(Tab)照舊當場驗、當場把送出鈕往下推(延後只給按著的指標);
 *   R2d-later 按在空白處 → 放開後錯誤照樣出現(延後不是丟掉);
 *   R1-refocus 按的是把焦點放回欄位的「清除」鈕 → 延後的驗證不在焦點回來的欄位上報錯(規則 1);
 *   R2d-drag 按住表單上方的連結拖一段再放開(原生拖曳:dragstart → pointercancel → dragend,沒有 mouseup、沒有 click)
 *     → 放開後錯誤出現;接著鍵盤回到欄位改成仍不合法、按 Tab → 錯誤當場出現(「按著」的狀態沒有卡住)。三段都要成立:
 *     滑鼠;筆(Chromium 取消的是 mouse#1、不是按下的筆);筆拖一個拖曳開始就被移出頁面的連結(dragend 到不了 window);
 * R4a Escape 把改過的值寫回初始值、表單回到沒改過(更新表單送出鈕再度停用);
 * R4b Escape 在出過錯的欄位:值回初始值(R4b-value)、不驗證、錯誤不留著(R4b-error);
 * R5 已出錯的欄位一編輯,錯誤立刻消失(不等離開);R6 改成合法再離開,錯誤不再出現;
 * R7 全部改對後送出 → onSubmit 跑一次、整張表沒有任何殘留錯誤;
 * R8 送出失敗時焦點落在「被送出的那張表」的第一個錯誤欄位,不是 DOM 較前面那張表的同名欄位 —— 三種送法:
 *   R8 `<form onSubmit={form.handleSubmit}>`;R8b 沒有 `<form>`、footer 按鈕 `onClick={() => void form.handleSubmit()}`
 *   不帶 event(WM 16 支表單全是這個寫法);R8c 沒走 getInputProps 的控件(勾選框用 setFieldValue 自接、自己寫 name),
 *   只能靠被送出的 `<form>` 界定。
 * 對話框裡的表單(2026-10-01 下午;規則 keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」「按了之後自己變停用」「關了之後焦點去哪」):
 *   R-return 受控、沒有 DialogTrigger 的 Dialog 用 Esc 關閉 → 焦點回到開啟它的按鈕(不是 body);
 *   R4-dialog 對話框裡改過的欄位按 Esc → 值回復、對話框**不關**;再按一下才關;
 *   R4-one-layer 可打字的 DatePicker 值改過、日曆開著按 Esc → 只關日曆、值不動、對話框不關;再按 → 值回復;再按 → 關;
 *   R9-busy 忙碌鈕本身(不經 hook 的最小表單,只接 loading;hook 的重入防護與 submitDisabled 會掩蓋 Button 的 loading 路徑)用滑鼠按下 →
 *     忙碌期間焦點仍在它上面、aria-busy、原生 disabled=false;同一張表的欄位裡按 Enter(隱含送出)與再按一次都不送出(submit 事件 1 次、
 *     consumer onClick 1 次)。忙碌多久由量具放行(window.__releaseBusy),不用固定毫秒;
 *   R9-saved 存檔完成 → 焦點仍在送出鈕、aria-disabled="true"、原生 disabled=false(可聚焦的停用);
 *   R9-leave 接著 Tab → 焦點往下走、送出鈕回到原生 disabled;Shift+Tab 回不到它(離開 Tab 序);
 *   R4-saved 存檔後再改欄位按 Esc → 回到**剛存的值**,不是存檔前的舊值;
 * 送出成功的回饋(user 2026-10-01「送出成功跳提示」;harness 直接掛三則 story 原始碼):
 *   T-update / T-create / T-rating 送出成功後 Toaster 的 polite 朗讀區 = 該表的文案、有一則 [data-sonner-toast]、表單內沒有 role=status;
 *   T-update 另附對照:業務驗證擋下(名稱重複)時 polite 區不變、沒有 toast。
 *   T-dialog / T-sheet(2026-10-07;放在浮層裡、送出成功就關的三則 story 原始碼:Dialog「表單」、Sheet「建立新專案」「編輯成員詳情」):
 *     空白送出 → 欄位報錯、浮層不關、沒有 Toast;填好送出 → 多一則該文案的 Toast、浮層關閉;再打開 → 建立表單是空白、更新表單是剛存的值
 *     (修前:沒有 Toast;建立表單再打開還留著上次打的字。Toast 以「該文案的 [data-sonner-toast] 多一則」判,不讀朗讀區 ——
 *     「專案已建立」T-create 也用,朗讀區留著上一則的字分不出來)。
 *
 * ── 突變 → 該紅的列(--selftest;MUTANTS 是單一來源,這裡是人讀版)──
 * errors 以物件身分 memo(RHF 原地改 errors)→ R2 / R2d-drag / R2d-later / R2d-submit / R2d-tab / R2d-touch / R4b-error / R5 / R6 / R7(+ T-update 的業務錯誤對照、T-dialog / T-sheet 的空白送出報錯);
 * Escape 改回 resetField(本 hook 不 register → 無作用)→ R4a / R4b-value;
 * 焦點改回整頁 getElementsByName 第一個 → R2d-footer / R2d-submit / R2d-touch / R8 / R8b / R8c;
 * getInputProps 不掛歸屬標記(只剩 `<form>` 界定)→ R2d-footer / R8b;沒標記的元素不以 `<form>` 界定 → R8c;
 * 拿掉按壓中的延後(按著時也當場驗 = 2026-10-01 第一輪修好後的 hook)→ R2d-cancel / R2d-footer / R2d-submit / R2d-touch;
 * 按壓只認 pointer 事件、不認觸控補發的 mousedown / mouseup → R2d-touch;
 * 延後的驗證永遠不跑 → R2d-drag / R2d-later;延後的驗證不管焦點回來了沒 → R1-refocus;
 * 原生拖曳不算按壓結束(pointercancel 只放掉 pointer、不聽 dragend = 驗證抓到的那一版)→ R2d-drag;
 * 取消只結束被取消的那一個 pointer(筆的按壓留著,來源被移出頁面時 dragend 也救不回)→ R2d-drag;
 * Escape 改回 resetField 另連帶 R4-dialog / R4-one-layer / R4-saved(對話框裡同一個回復);
 * 欄位改過不掛 Esc 層 / 浮層守門不看標記 → R4-dialog / R4-one-layer / R4-saved(都是「對話框裡改過的欄位按 Esc」);
 * DialogContent 不記開啟者 → R-return;Button loading 走原生 disabled → R9-busy;Button 握著焦點時仍轉原生 disabled → R9-saved;
 * Button 焦點離開後不回原生 disabled → R9-leave;送出成功不重設基準 → R4-saved / R9-leave / R9-saved / T-sheet;可聚焦停用不擋 click → R9-busy;
 * 三則 story 各拿掉 toast() → T-update / T-create / T-rating。(「Esc 不看 Radix 已用掉」在 escape-and-focus-contract 量,理由見 MUTANTS 該處註解)
 * Dialog「表單」拿掉 toast() / 打開時不 reset() → T-dialog;Sheet「編輯成員詳情」拿掉 toast() / 「建立新專案」打開時不 reset() → T-sheet。
 *
 * ── 為什麼測 hook 本身、不測 story ──
 * 這支 hook 是 DS 表單驗證方法論的可執行層(form-validation.spec.md「可執行層」),DS 內的 CreateProjectForm /
 * UpdateProjectSettingsForm、Rating「包在 Field 內」與 WM 的 16 支表單全部經由它。錯誤清不掉、Escape 沒作用這兩個根因
 * 在 story 上看得到,但 story 會隨範例改寫而變,而且要先建 storybook;這裡用 esbuild 把 hook **原始碼**連同一頁最小
 * harness 打成單一 IIFE、塞進空白頁跑 —— 測到的永遠是原始碼本身(不會因為忘了 build:lib 測到舊的),也不需要 storybook。
 * harness 刻意放兩張欄位同名的表(同 field.stories.tsx「表單驗證」那則的版面),R8 才量得到跨表單誤聚焦;再放兩區沒有 `<form>`、
 * 欄位也同名的 footer 送出區(同 WM TypeSettingsDialog 的 InformationTab + 巢狀 CreateTypeDialog),與兩張只有勾選框的表(R8c)。
 * 規則 2 × 滑鼠那幾列要數「這一下 click 有沒有落在按鈕上」:送出 / 重設 / footer 建立鈕各自計數;錯誤訊息在欄位與按鈕之間
 * (同 DS 的 FieldError 在控件下方),長出來就把按鈕往下推 —— 閘不寫死推多少,R2d-tab 量給人看、突變證明推得夠讓 click 落空。
 *
 * ── 等待一律等證據 ──
 * 每個動作之後 settleAfterInteraction(版面連續靜止);讀焦點之前 waitForFocusStable(焦點連續不動)。
 * 等不到 = 儀器失效。共用實作:lib/launch-browser.mjs。
 *
 * 用法:
 *   node scripts/form-validation-contract-invariant.mjs                 判定(現行原始碼)
 *   node scripts/form-validation-contract-invariant.mjs --selftest      對照組(二十六個單一根因突變,各自必須剛好紅該紅的)
 *   node scripts/form-validation-contract-invariant.mjs --hook=<路徑>   只換 hook 原始碼(例:修正前的版本),判定表不變
 *   node scripts/form-validation-contract-invariant.mjs --root=<dir>    改量另一棵原始碼(例:git archive 出來的修改前基準樹)
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
  settleAfterInteraction,
  waitForFocusStable,
} from './lib/launch-browser.mjs'
import {
  FOCUS_FRAMES,
  InstrumentError,
  REPO_ROOT,
  WAIT_CAP_MS,
  bundleDsHarness,
  dsSourceDir,
  mountHarness,
  replaceOnce,
  resolveSourceRoot,
} from './lib/ds-source-harness.mjs'

const ROOT = REPO_ROOT
/** 要量的整棵原始碼(`--root=`;預設本 repo) */
const SOURCE_ROOT = resolveSourceRoot()
const HOOK_FILE = 'components/Field/use-form-validation.ts'
const HOOK = resolve(dsSourceDir(SOURCE_ROOT), HOOK_FILE)
const SELFTEST = process.argv.includes('--selftest')
const HOOK_OVERRIDE = process.argv.find((a) => a.startsWith('--hook='))?.slice('--hook='.length)
/**
 * selftest 同時跑幾個突變(每條 lane 一個瀏覽器、一個分頁,同 escape-and-focus-contract / story-demo-focus:焦點、鍵盤、觸控不跨 lane 共用)。
 * 單一變體要把 37 列整趟走完(約 55 秒,大多在等版面 / 焦點靜止),27 個變體循序要 25 分鐘;判定(非 selftest)只跑一趟,不受影響。
 * `--lanes=1` = 循序(除錯用)。
 */
const LANES = Math.max(1, Number(process.argv.find((a) => a.startsWith('--lanes='))?.slice('--lanes='.length) ?? 4) || 4)

// ─── 二十六個單一根因突變(--selftest;`file` 相對 packages/design-system/src,省略 = hook)──────────
// 錨點找不到 = 原始碼改了、突變沒套上 → 儀器失效(不得讓「沒突變」看起來像「突變也綠」)。
const MUTANTS = [
  {
    id: 'errors-identity-memo',
    what: 'errors 以 RHF errors 物件身分 memo(修正前 :147-154)',
    // T-update 的業務錯誤對照(名稱重複 → FieldError)、T-dialog / T-sheet 的空白送出報錯同樣讀 errors,同一個根因連帶紅
    expectRed: ['R2', 'R2d-drag', 'R2d-later', 'R2d-submit', 'R2d-tab', 'R2d-touch', 'R4b-error', 'R5', 'R6', 'R7', 'T-dialog', 'T-sheet', 'T-update'],
    apply: (src) => replaceOnce(src,
      /  const errors: Partial<Record<keyof T, string>> = \{\}\n  for \(const key of Object\.keys\(rhfErrors\)\) \{\n([\s\S]*?)\n  \}\n/,
      '  const errors = React.useMemo(() => {\n    const out: Partial<Record<keyof T, string>> = {}\n'
      + '    for (const key of Object.keys(rhfErrors)) {\n'
      + '      const msg = (rhfErrors as Record<string, { message?: string } | undefined>)[key]?.message\n'
      + '      if (msg) out[key as keyof T] = msg\n    }\n    return out\n  }, [rhfErrors])\n'),
  },
  {
    id: 'escape-reset-field',
    what: 'Escape 改回 form.resetField(修正前 :188)',
    // 對話框裡那三列走同一個回復(R4-dialog / R4-one-layer 的第二下 / 存檔後的 R4-saved),同一個根因一起紅
    expectRed: ['R4-dialog', 'R4-one-layer', 'R4-saved', 'R4a', 'R4b-value'],
    apply: (src) => replaceOnce(src,
      /form\.setValue\(path, original as PathValue<T, Path<T>>, \{ shouldDirty: true \}\)/,
      'form.resetField(path)'),
  },
  {
    id: 'focus-document-wide',
    what: '規則 8 改回整頁 getElementsByName 第一個(修正前 :120)',
    expectRed: ['R2d-footer', 'R2d-submit', 'R2d-touch', 'R8', 'R8b', 'R8c'],
    apply: (src) => replaceOnce(src,
      /\.map\(\(name\) => pick\(Array\.from\(document\.getElementsByName\(name\)\)\)\)/,
      '.map((name) => document.getElementsByName(name)[0] as HTMLElement | undefined)'),
  },
  {
    id: 'no-owner-marker',
    what: 'getInputProps 不掛歸屬標記,只剩被送出的 <form> 界定(2026-10-01 第一版修法)',
    expectRed: ['R2d-footer', 'R8b'],
    apply: (src) => replaceOnce(src, /\n +\[OWNER_ATTR\]: owner,\n/, '\n'),
  },
  {
    id: 'no-form-scope',
    what: '沒標記的元素不以被送出的 <form> 界定(scope 恆為 null)',
    expectRed: ['R8c'],
    apply: (src) => replaceOnce(src,
      /const scope = typeof target\?\.closest === 'function' \? target\.closest\('form'\) : null/,
      'const scope = null as HTMLFormElement | null'),
  },
  {
    id: 'no-blur-deferral',
    what: '拿掉按壓中的延後:指標按著時離開也當場驗(2026-10-01 第一輪修好後的 hook,待辦總帳 N67)',
    expectRed: ['R2d-cancel', 'R2d-footer', 'R2d-submit', 'R2d-touch'],
    apply: (src) => replaceOnce(src,
      /if \(isPointerPressed\(\)\) deferBlurValidation\(name, event\)/,
      'if (false) deferBlurValidation(name, event)'),
  },
  {
    id: 'no-touch-compat-press',
    what: '按壓只認 pointer 事件:觸控點一下補發的 mousedown / mouseup 不算按壓',
    expectRed: ['R2d-touch'],
    apply: (src) => replaceOnce(src, /\n  \['mousedown', onMouseDown\],\n  \['mouseup', onMouseUp\],\n/, '\n'),
  },
  {
    id: 'drop-deferred',
    what: '延後的驗證永遠不跑(按壓結束後沒有補驗)',
    expectRed: ['R2d-drag', 'R2d-later'],
    apply: (src) => replaceOnce(src,
      /setTimeout\(\(\) => \{ for \(const run of due\) run\(\) \}, 0\)/,
      'void due'),
  },
  {
    id: 'no-refocus-skip',
    what: '延後的驗證不管焦點是否已回到那一格',
    expectRed: ['R1-refocus'],
    apply: (src) => replaceOnce(src,
      /if \(!refocused\) validateField\(name\)/,
      'validateField(name)'),
  },
  {
    id: 'no-drag-press-end',
    what: '原生拖曳不算按壓結束:pointercancel 只放掉 pointer、不聽 dragend(2026-10-01 延後的第一版,驗證抓到)',
    expectRed: ['R2d-drag'],
    apply: (src) => replaceOnce(
      replaceOnce(src, /\['pointercancel', onPointerCancel\]/, "['pointercancel', onPointerEnd]"),
      /\n +\['dragend', onPressAbandoned\],\n/, '\n'),
  },
  {
    id: 'cancel-own-pointer-only',
    what: '非觸控的取消只結束被取消的那一個 pointer(按下 pen#2、取消 mouse#1 → 筆的按壓留著)',
    expectRed: ['R2d-drag'],
    apply: (src) => replaceOnce(src,
      /for \(const \[id, type\] of pressedPointers\) if \(type !== 'touch'\) pressedPointers\.delete\(id\)/,
      'pressedPointers.delete(p.pointerId)'),
  },
  // ── 2026-10-01 下午(對話框裡的表單 / 送出鈕焦點 / Toast)──
  {
    id: 'escape-no-layer-marker',
    what: 'getInputProps 在欄位改過時不掛 data-escape-layer(浮層守門看不到 → Esc 直接關對話框)',
    // R4-one-layer 的第二下(回復)、存檔後的 R4-saved 也是「對話框裡改過的欄位按 Esc」,一起紅
    expectRed: ['R4-dialog', 'R4-one-layer', 'R4-saved'],
    apply: (src) => replaceOnce(src, /\n        \.\.\.escapeLayerProps\(!sameValue\(value, original\)\),\n/, '\n'),
  },
  {
    id: 'overlay-gate-ignores-layer',
    what: '浮層守門不看控件的 Esc 層宣告(修前的 withImeSafeEscape 只管組字)',
    file: 'lib/overlay-escape.ts',
    expectRed: ['R4-dialog', 'R4-one-layer', 'R4-saved'],
    apply: (src) => replaceOnce(src, /if \(layer && content && content\.contains\(layer\)\) \{/, 'if (false) {'),
  },
  // 「Esc 不看這一下是否已被 Radix 用掉」的突變不在這裡:本 harness 的 R4-one-layer 用可打字的 DatePicker,它的輸入框自己先問
  // isEscapeForControl、Radix 用掉的那一下根本不會轉給表單 —— hook 那一道在這裡量不到(單一突變弄不紅任何一列 = 零證據)。
  // 它在 escape-and-focus-contract 的 E-combobox-popup(欄位內搜尋的 Combobox:清單開著時焦點仍在欄位、這一下會冒泡到表單)量。
  {
    id: 'no-triggerless-return',
    what: 'DialogContent 預設不還焦點給開啟者(Radix 只還給 DialogTrigger,受控開啟掉到 body)',
    file: 'lib/overlay-focus-return.ts',
    expectRed: ['R-return'],
    apply: (src) => replaceOnce(src, /returnFocusToOpener\(event, trigger \?\? opener, trigger \? \{\} : \{ noTrigger: true, modal \}\)/, 'void opener'),
  },
  {
    id: 'button-loading-native-disabled',
    what: 'Button 忙碌時仍走原生 disabled(焦點被瀏覽器丟到 body;MUI 派)',
    file: 'components/Button/button.tsx',
    expectRed: ['R9-busy'],
    apply: (src) => replaceOnce(src, /const focusableDisabled = !asChild && \(loading \|\| \(!!disabled && holdsFocus\)\)/, 'const focusableDisabled = !asChild && (!!disabled && holdsFocus)'),
  },
  {
    id: 'button-no-focus-hold',
    what: 'Button 握著焦點時被停用仍轉原生 disabled(存檔後焦點掉到 body)',
    file: 'components/Button/button.tsx',
    expectRed: ['R9-saved'],
    apply: (src) => replaceOnce(src, /const focusableDisabled = !asChild && \(loading \|\| \(!!disabled && holdsFocus\)\)/, 'const focusableDisabled = !asChild && loading'),
  },
  {
    id: 'button-focus-hold-never-released',
    what: 'Button 焦點離開後不回原生 disabled(一直是可聚焦的停用 → 停用鈕永遠留在 Tab 序裡)',
    file: 'components/Button/button.tsx',
    expectRed: ['R9-leave'],
    apply: (src) => replaceOnce(src, /onBlur=\{\(e\) => \{ setHoldsFocus\(false\); restProps\.onBlur\?\.\(e\) \}\}/, 'onBlur={(e) => { restProps.onBlur?.(e) }}'),
  },
  {
    id: 'no-rebaseline',
    what: '更新表單送出成功後不重設比對基準(存檔後仍 dirty、Esc 回到存檔前的舊值)',
    // 存檔後仍 dirty → 送出鈕一直可按:R9-saved(不是可聚焦的停用)、R9-leave(Tab 之後也不是原生停用)一起紅;
    // Sheet「編輯成員詳情」再打開時 reset() 回到存檔前的舊值(T-sheet)也是同一個根因
    expectRed: ['R4-saved', 'R9-leave', 'R9-saved', 'T-sheet'],
    apply: (src) => replaceOnce(src, /\n        if \(intent === 'update'\) rebaseline\(current\)\n/, '\n'),
  },
  {
    id: 'button-click-not-blocked',
    what: '可聚焦的停用不擋 click(忙碌中欄位裡按 Enter = 隱含送出、再按一次 → 表單照樣送出)',
    file: 'components/Button/button.tsx',
    expectRed: ['R9-busy'],
    apply: (src) => replaceOnce(src, /\{\.\.\.\(focusableDisabled \? \{ onClick: blockActivation, onDoubleClick: blockActivation \} : null\)\}/, ''),
  },
  {
    id: 'toast-update-removed',
    what: '更新表單送出成功不跳 Toast',
    file: 'components/Field/field.stories.tsx',
    expectRed: ['T-update'],
    apply: (src) => replaceOnce(src, /toast\(\{ variant: 'success', title: '專案設定已儲存' \}\)/, 'void 0'),
  },
  {
    id: 'toast-create-removed',
    what: '建立表單送出成功不跳 Toast',
    file: 'components/Field/field.stories.tsx',
    expectRed: ['T-create'],
    apply: (src) => replaceOnce(src, /toast\(\{ variant: 'success', title: '專案已建立' \}\)/, 'void 0'),
  },
  {
    id: 'toast-rating-removed',
    what: '評分送出成功不跳 Toast',
    file: 'components/Rating/rating.stories.tsx',
    expectRed: ['T-rating'],
    apply: (src) => replaceOnce(src, /toast\(\{ variant: 'success', title: '評分已送出' \}\)/, 'void 0'),
  },
  // ── 2026-10-07:放在浮層裡、送出成功就關的表單(獨立驗證抓到:送出成功沒跳提示、建立表單再打開還留著上次的字)──
  {
    id: 'toast-dialog-removed',
    what: 'Dialog「表單」送出成功不跳 Toast(直接關)',
    file: 'components/Dialog/dialog.stories.tsx',
    expectRed: ['T-dialog'],
    apply: (src) => replaceOnce(src, /toast\(\{ variant: 'success', title: '專案已建立' \}\)/, 'void 0'),
  },
  {
    id: 'dialog-no-reset-on-open',
    what: 'Dialog「表單」打開時不 reset()(送出成功關掉再打開,上次打的字還在)',
    file: 'components/Dialog/dialog.stories.tsx',
    expectRed: ['T-dialog'],
    apply: (src) => replaceOnce(src, /if \(next\) form\.reset\(\)/, 'if (false) form.reset()'),
  },
  {
    id: 'toast-sheet-edit-removed',
    what: 'Sheet「編輯成員詳情」送出成功不跳 Toast(直接關)',
    file: 'components/Sheet/sheet.stories.tsx',
    expectRed: ['T-sheet'],
    apply: (src) => replaceOnce(src, /toast\(\{ variant: 'success', title: '成員資料已儲存' \}\)/, 'void 0'),
  },
  {
    id: 'sheet-create-no-reset-on-open',
    what: 'Sheet「建立新專案」打開時不 reset()',
    file: 'components/Sheet/sheet.stories.tsx',
    expectRed: ['T-sheet'],
    apply: (src) => replaceOnce(src, /(function CreateProjectSheet\(\) \{[\s\S]*?)if \(next\) form\.reset\(\)/, '$1if (false) form.reset()'),
  },
]

// ─── harness(打包進空白頁)──────────────────────────────────────────────────
// 兩張表的欄位同名(name / ownerEmail),更新表單在 DOM 前面、建立表單在後面 —— 同 field.stories.tsx「表單驗證」。
const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { useFormValidation } from '@/design-system/components/Field/use-form-validation'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/design-system/components/Dialog/dialog'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Button } from '@/design-system/components/Button/button'
import { FormValidation } from '@/design-system/components/Field/field.stories'
import { InField } from '@/design-system/components/Rating/rating.stories'
import { WithForm as DialogWithForm } from '@/design-system/components/Dialog/dialog.stories'
import { CreateProjectRight, EditUserRight } from '@/design-system/components/Sheet/sheet.stories'

const validate = {
  name: (v) => (String(v).trim() ? undefined : '專案名稱必填'),
  ownerEmail: (v) => (/^\\S+@\\S+\\.\\S+$/.test(String(v)) ? undefined : 'Email 格式不正確'),
}

// withClear:欄位旁的「清除」鈕(tabIndex=-1,不改 Tab 順序)—— 經 getInputProps 的 onChange 清空(規則 5 清錯誤)
// 再把焦點放回輸入框。它跟輸入框同一行,錯誤訊息長在下面推不到它(R1-refocus 只量焦點回來之後的事)。
function TextField({ form, name, label, withClear = false }) {
  const error = form.errors[name]
  const props = form.getInputProps(name)
  return (
    <div>
      <label>{label}<input {...props} aria-invalid={error ? true : undefined} /></label>
      {withClear ? (
        <button type="button" tabIndex={-1} data-clear-for={name}
          onClick={(e) => { props.onChange(''); e.currentTarget.parentElement.querySelector('input').focus() }}>清除</button>
      ) : null}
      {error ? <p role="alert" data-error-for={name}>{error}</p> : null}
    </div>
  )
}

function DemoForm({ label, intent, initialValues }) {
  const [submits, setSubmits] = React.useState(0)
  const [clicks, setClicks] = React.useState({ submit: 0, reset: 0 }) // 這一下 click 有沒有落在按鈕上
  const form = useFormValidation({ initialValues, intent, validate, onSubmit: () => { setSubmits((n) => n + 1) } })
  return (
    <form aria-label={label} data-submits={submits} data-submit-clicks={clicks.submit} data-reset-clicks={clicks.reset} onSubmit={form.handleSubmit}>
      <TextField form={form} name="name" label="專案名稱" />
      <TextField form={form} name="ownerEmail" label="負責人 Email" withClear />
      <button type="submit" disabled={form.submitDisabled} onClick={() => setClicks((c) => ({ ...c, submit: c.submit + 1 }))}>送出</button>
      <button type="button" data-reset onClick={() => { setClicks((c) => ({ ...c, reset: c.reset + 1 })); form.reset() }}>重設</button>
    </form>
  )
}

// WM 的寫法:沒有 <form>,footer 按鈕 onClick={() => void form.handleSubmit()} 不帶 event。兩區欄位與上面兩張表同名,
// 「類型資訊」在前、「新增類型」在後 —— 同 WM TypeSettingsDialog 的 InformationTab 與巢狀 CreateTypeDialog。
function FooterSubmitPanel({ label, intent, initialValues }) {
  const [clicks, setClicks] = React.useState(0)
  const form = useFormValidation({ initialValues, intent, validate: { name: validate.name }, onSubmit: () => {} })
  return (
    <section aria-label={label} data-clicks={clicks}>
      <TextField form={form} name="name" label="類型名稱" />
      <button type="button" data-footer-submit onClick={() => { setClicks((n) => n + 1); void form.handleSubmit() }}>建立</button>
    </section>
  )
}

// 沒走 getInputProps 的控件(勾選框用 setFieldValue 自接、自己寫 name,form-validation.spec.md v1 邊界 (a))沒有歸屬標記,
// 只能靠被送出的 <form> 界定;兩張表的勾選框同名。
function AgreeForm({ label }) {
  const form = useFormValidation({
    initialValues: { agree: false },
    validate: { agree: (v) => (v ? undefined : '請勾選同意條款') },
    onSubmit: () => {},
  })
  return (
    <form aria-label={label} onSubmit={form.handleSubmit}>
      <label>
        <input type="checkbox" name="agree" checked={form.values.agree} onChange={(e) => form.setFieldValue('agree', e.target.checked)} />
        同意條款
      </label>
      {form.errors.agree ? <p role="alert" data-error-for="agree">{form.errors.agree}</p> : null}
      <button type="submit">送出</button>
    </form>
  )
}

// R2d-drag 的儀器:這一下真的變成原生拖曳了嗎、按下 / 取消的是哪個 pointer、dragend 有沒有到 window
window.__dragReset = () => { window.__drag = { pointerdown: [], pointercancel: [], dragstart: 0, dragend: 0, mouseup: 0, click: 0 } }
window.__dragReset()
for (const t of ['pointerdown', 'pointercancel']) window.addEventListener(t, (e) => { window.__drag[t].push(e.pointerType + '#' + e.pointerId) }, true)
for (const t of ['dragstart', 'dragend', 'mouseup', 'click']) window.addEventListener(t, () => { window.__drag[t] += 1 }, true)

// R2d-drag 第三段:拖曳一開始就被移出頁面的連結(像先把被拖的那一列藏起來的清單)—— dragend 送到已離開頁面的它,
// 到不了 window;pointercancel 在它離開之前就派送完(實測)
function DetachOnDragLink() {
  const [gone, setGone] = React.useState(false)
  return gone ? null : <a href="#drag-help-2" data-drag-detach onDragStart={() => { setTimeout(() => setGone(true), 0) }}>拖曳後移除的連結</a>
}

// ── 對話框裡的更新表單(R-return / R4-dialog / R4-one-layer / R9-* / R4-saved)──
// 受控 open、沒有 DialogTrigger(WM 13 支對話框表單的寫法);onSubmit 是 async(await 期間 = 忙碌)。送出鈕用 DS Button:
// loading 接 isSubmitting、disabled 接 submitDisabled;consumer 的 onClick 計數「這一下有沒有真的落到按鈕上」。
// 「控件自己的彈出層開著時 Esc 只關彈出層」那一列用可打字的 DatePicker(本 harness 的 context 開 hasTouch 給 R2d-touch 用,
// pointer: coarse 成立 → Select 會走原生 <select> 路徑,沒有彈出層可量)。
function DialogForm() {
  const [open, setOpen] = React.useState(false)
  const [submits, setSubmits] = React.useState(0)
  const [clicks, setClicks] = React.useState(0)
  const form = useFormValidation({
    initialValues: { name: '產品路線圖', due: '2026-03-12' },
    intent: 'update',
    validate: { name: (v) => (String(v).trim() ? undefined : '專案名稱必填') },
    // await 期間 = 忙碌;多久由量具決定(window.__releaseDialogSubmit),不用固定毫秒當「還在忙」的代理 —— 慢機器上固定 1500ms 會在量完之前就結束(M37)
    onSubmit: async () => { setSubmits((n) => n + 1); await new Promise((r) => { window.__releaseDialogSubmit = r }) },
  })
  return (
    <section aria-label="對話框表單" data-submits={submits} data-submit-clicks={clicks}>
      <button type="button" data-open-dialog onClick={() => setOpen(true)}>開啟設定</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="form-dialog" autoHeight maxWidth={480}>
          <DialogHeader><DialogTitle>專案設定</DialogTitle></DialogHeader>
          <DialogBody>
            <form aria-label="對話框設定" onSubmit={form.handleSubmit}>
              <label>專案名稱<input {...form.getInputProps('name')} /></label>
              <label>截止日<DatePicker aria-label="截止日" typeable {...form.getInputProps('due')} /></label>
              <p data-due>{form.values.due}</p>
              <Button type="submit" variant="primary" data-dialog-submit loading={form.isSubmitting} disabled={form.submitDisabled} onClick={() => setClicks((c) => c + 1)}>儲存變更</Button>
              <button type="button" data-dialog-next>之後的按鈕</button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// 忙碌鈕本身(R9-busy):不經 hook —— hook 自己有重入防護、送出中 submitDisabled 也為 true(握著焦點時本來就走可聚焦的停用),
// 兩者都會掩蓋 Button 的 loading 路徑。這裡只有 loading:送出 → 忙碌,直到量具放行;submit 事件與 consumer onClick 各自計數。
function BusyFixture() {
  const [busy, setBusy] = React.useState(false)
  const [submits, setSubmits] = React.useState(0)
  const [clicks, setClicks] = React.useState(0)
  window.__releaseBusy = () => setBusy(false)
  return (
    <form aria-label="忙碌鈕" data-busy-submits={submits} data-busy-clicks={clicks}
      onSubmit={(e) => { e.preventDefault(); setSubmits((n) => n + 1); setBusy(true) }}>
      <label>備註<input name="memo" defaultValue="" /></label>
      <Button type="submit" variant="primary" data-busy-submit loading={busy} onClick={() => setClicks((c) => c + 1)}>送出備註</Button>
    </form>
  )
}

function App({ mount, view }) {
  // 送出成功 → Toast 的三列直接掛三則 story 的原始碼(field.stories / rating.stories 的 render),一次只掛一則(各自帶自己的 <Toaster />)
  if (view === 'story-field') return <TooltipProvider><main data-mount={mount} data-view={view}>{FormValidation.render()}</main></TooltipProvider>
  if (view === 'story-rating') return <TooltipProvider><main data-mount={mount} data-view={view}>{InField.render()}</main></TooltipProvider>
  // 放在浮層裡、送出成功就關的三則(一次只掛一則:各自帶自己的 <Toaster />,兩則同時掛 = 兩個 Toaster、每則 Toast 畫兩次)
  if (view === 'story-dialog') return <TooltipProvider><main data-mount={mount} data-view={view}>{DialogWithForm.render()}</main></TooltipProvider>
  if (view === 'story-sheet-create') return <TooltipProvider><main data-mount={mount} data-view={view}>{CreateProjectRight.render()}</main></TooltipProvider>
  if (view === 'story-sheet-edit') return <TooltipProvider><main data-mount={mount} data-view={view}>{EditUserRight.render()}</main></TooltipProvider>
  return (
    <TooltipProvider>
    <main data-mount={mount} data-view={view}>
      <p data-blank>表單驗證契約 harness(R2d-later 按在這一行的空白處)</p>
      {/* R2d-drag 按住它往右拖:在所有表單上方,錯誤長出來推不到它;往右拖只經過這一行,不會把連結放進任何輸入框 */}
      <p><a href="#drag-help" data-drag-source>拖曳說明連結</a> <DetachOnDragLink /></p>
      <DemoForm label="專案設定" intent="update" initialValues={{ name: '產品路線圖', ownerEmail: 'pm@acme.com' }} />
      <DemoForm label="建立專案" intent="create" initialValues={{ name: '', ownerEmail: '' }} />
      <FooterSubmitPanel label="類型資訊" intent="update" initialValues={{ name: 'Bug' }} />
      <FooterSubmitPanel label="新增類型" intent="create" initialValues={{ name: '' }} />
      <AgreeForm label="條款 A" />
      <AgreeForm label="條款 B" />
      <DialogForm />
      <BusyFixture />
    </main>
    </TooltipProvider>
  )
}

const root = createRoot(document.getElementById('root'))
let mount = 0
window.__view = (view) => { mount += 1; root.render(<App key={mount} mount={mount} view={view} />); return mount }
window.__remount = () => window.__view('forms')
window.__remount()
`

/** `--hook=`:只換 hook 檔的內容(其餘照 SOURCE_ROOT);突變:只動它負責的那一個檔。 */
function makeMutate(hookOverride, mutant) {
  const target = mutant ? resolve(dsSourceDir(SOURCE_ROOT), mutant.file ?? HOOK_FILE) : null
  let applied = false
  const mutate = (path, src) => {
    let out = src
    if (hookOverride && path === HOOK) out = readFileSync(hookOverride, 'utf8')
    if (mutant && path === target) { applied = true; out = mutant.apply(out) }
    return out
  }
  mutate.assertApplied = () => { if (mutant && !applied) throw new InstrumentError(`突變目標 ${mutant.file ?? HOOK_FILE} 沒被打包進 harness —— 突變沒套上`) }
  return mutate
}
async function bundle(mutate) {
  return bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'form-validation-contract-harness.tsx', mutate })
}

// ─── 量具 ────────────────────────────────────────────────────────────────────
const UPDATE = '專案設定'
const CREATE = '建立專案'
const formSel = (label) => `form[aria-label="${label}"]`
const inputSel = (label, name) => `${formSel(label)} input[name="${name}"]`

async function settle(page) {
  // 版面靜止的影格數用共用 helper 的預設(scripts/lib/launch-browser.mjs settleAfterInteraction,全庫同一個值)
  const r = await settleAfterInteraction(page, { capMs: WAIT_CAP_MS })
  if (!r.ok) throw new InstrumentError(`版面 ${WAIT_CAP_MS}ms 內等不到靜止`)
}
async function focusStable(page) {
  const r = await waitForFocusStable(page, { frames: FOCUS_FRAMES, capMs: WAIT_CAP_MS })
  if (!r.ok) throw new InstrumentError(`焦點 ${WAIT_CAP_MS}ms 內一直在跳`)
}

async function remount(page) {
  const n = await page.evaluate(() => window.__remount())
  await page.waitForSelector(`main[data-mount="${n}"] ${formSel(CREATE)}`, { timeout: WAIT_CAP_MS })
    .catch(() => { throw new InstrumentError('harness 重新掛載後等不到表單') })
  await settle(page)
}
/** 切到某一則 story 的畫面(T 列);等它的表單掛上 */
async function view(page, name, readySelector) {
  const n = await page.evaluate((v) => window.__view(v), name)
  await page.waitForSelector(`main[data-mount="${n}"][data-view="${name}"] ${readySelector}`, { timeout: WAIT_CAP_MS })
    .catch(() => { throw new InstrumentError(`story 畫面 ${name} 等不到 ${readySelector}`) })
  await settle(page)
}
async function waitUntil(page, fn, label) {
  await page.waitForFunction(fn, null, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError(`${WAIT_CAP_MS}ms 內等不到:${label}`) })
  await settle(page)
}

/**
 * 等「送出結果」出現,等不到**不是**儀器失效而是量到的結果:回傳有沒有看到(進判定的 detail),然後照樣等版面靜止再讀快照。
 * 用在 Toast 那三列 —— 「送出成功卻什麼回饋都沒有」正是那幾列要抓的產品缺陷(突變拿掉 toast() 就是這個形狀);
 * 量具看得到結果的證據另有:同一列的業務錯誤對照(alert 出現)與修改前的建置(表單內朗讀區文字出現)。
 */
async function waitForOutcome(page, fn) {
  const seen = await page.waitForFunction(fn, null, { timeout: WAIT_CAP_MS }).then(() => true, () => false)
  await settle(page)
  return seen
}

/** 讀一張表的狀態:值 / aria-invalid / 錯誤文字 / 送出次數 / 送出鈕停用 / 焦點落點 */
async function snap(page, label) {
  const s = await page.evaluate((lbl) => {
    const form = document.querySelector(`form[aria-label="${lbl}"]`)
    if (!form) return null
    const field = (n) => {
      const input = form.querySelector(`input[name="${n}"]`)
      const alert = form.querySelector(`[data-error-for="${n}"]`)
      return input ? { value: input.value, invalid: input.getAttribute('aria-invalid') === 'true', alert: alert ? alert.textContent : null } : null
    }
    const ae = document.activeElement
    const active = ae instanceof HTMLInputElement ? `${ae.closest('form, section')?.getAttribute('aria-label')}/${ae.name}` : (ae?.tagName ?? 'none')
    return {
      name: field('name'),
      ownerEmail: field('ownerEmail'),
      submits: Number(form.dataset.submits),
      submitClicks: Number(form.dataset.submitClicks),
      resetClicks: Number(form.dataset.resetClicks),
      submitDisabled: form.querySelector('button[type="submit"]')?.disabled ?? null,
      active,
    }
  }, label)
  if (!s || !s.name || !s.ownerEmail) throw new InstrumentError(`找不到表單「${label}」或它的欄位`)
  return s
}

/** 焦點落在哪個區塊(form / section 的 aria-label)的哪個 name;錯誤訊息是否出現在指定區塊 */
async function focusAndAlert(page, container, name) {
  const s = await page.evaluate(({ container, name }) => {
    const box = document.querySelector(container)
    if (!box) return null
    const ae = document.activeElement
    return {
      active: ae instanceof HTMLInputElement ? `${ae.closest('form, section')?.getAttribute('aria-label')}/${ae.name}` : (ae?.tagName ?? 'none'),
      alert: box.querySelector(`[data-error-for="${name}"]`)?.textContent ?? null,
      clicks: box.dataset.clicks === undefined ? null : Number(box.dataset.clicks),
    }
  }, { container, name })
  if (!s) throw new InstrumentError(`找不到區塊 ${container}`)
  return s
}

const clean = (f) => !f.invalid && f.alert === null
const shows = (f, text) => f.invalid && f.alert === text

async function click(page, selector) { await page.click(selector); await settle(page) }
async function type(page, text) { await page.keyboard.type(text); await settle(page) }
async function press(page, key) { await page.keyboard.press(key); await settle(page) }
async function clearFocused(page) { await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await settle(page) }

/** 元素上緣(版面位置);找不到 = 儀器失效 */
async function topOf(page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new InstrumentError(`找不到 ${selector}`)
  return box.y
}

/** 真滑鼠、分開按下與放開(page.click 看不到兩者之間的事):移到目標中心 → 按下 → 等版面靜止(錯誤若在按著時長出來,
 *  就在這段)→ 放開 → 等版面與焦點靜止。回傳按著期間目標往下移了多少 px —— 移超過半個按鈕高,放開時就不在它上面了。 */
async function pressAndRelease(page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new InstrumentError(`找不到要按的 ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await settle(page)
  const shiftDuringPress = Math.round(((await topOf(page, selector)) - box.y) * 10) / 10
  await page.mouse.up()
  await settle(page)
  await focusStable(page)
  return shiftDuringPress
}

/** R2d-drag 的一段:Email 打 abc → 用滑鼠或筆(CDP pointerType 'pen')按住 selector 往右拖 200px 再放開 → 讀 Email →
 *  鍵盤回到 Email(element.focus(),不經指標)、改成仍不合法(規則 5 先清錯誤)、按 Tab → 再讀。
 *  儀器:必須真的是原生拖曳(dragstart 1 次),dragend 有沒有到 window 也要是這一段要量的樣子,否則量到的不是這件事。 */
async function dragThenTab(page, selector, how, dragendReachesWindow) {
  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new InstrumentError(`找不到 R2d-drag 的拖曳來源 ${selector}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.evaluate(() => window.__dragReset())
  if (how === 'mouse') {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 200, y, { steps: 10 })
    await page.mouse.up()
  } else {
    const cdp = await page.context().newCDPSession(page)
    try {
      const send = (type, px, buttons) => cdp.send('Input.dispatchMouseEvent',
        { type, x: px, y, button: (buttons > 0 || type === 'mouseReleased') ? 'left' : 'none', buttons, clickCount: 1, pointerType: how })
      await send('mouseMoved', x, 0)
      await send('mousePressed', x, 1)
      for (let i = 1; i <= 10; i += 1) await send('mouseMoved', x + 20 * i, 1)
      await send('mouseReleased', x + 200, 0)
    } finally {
      await cdp.detach()
    }
  }
  await settle(page)
  const drag = await page.evaluate(() => window.__drag)
  if (drag.dragstart !== 1 || (drag.dragend > 0) !== dragendReachesWindow) {
    throw new InstrumentError(`R2d-drag(${how} ${selector})量到的不是要量的拖曳:${JSON.stringify(drag)}(要 dragstart 1、dragend ${dragendReachesWindow ? '有' : '沒有'}到 window)`)
  }
  const afterDrop = (await snap(page, CREATE)).ownerEmail
  await page.focus(inputSel(CREATE, 'ownerEmail'))
  await clearFocused(page)
  await type(page, 'still-bad')
  const beforeTab = (await snap(page, CREATE)).ownerEmail
  await press(page, 'Tab')
  const afterTab = (await snap(page, CREATE)).ownerEmail
  return {
    ok: shows(afterDrop, 'Email 格式不正確') && clean(beforeTab) && shows(afterTab, 'Email 格式不正確'),
    drag, afterDrop: afterDrop.alert, beforeTab: beforeTab.alert, afterTab: afterTab.alert,
  }
}

/** 跑完整張判定表,回傳 [{ id, kind, title, pass, detail }] */
async function runChecks(page) {
  const out = []
  const check = (id, kind, title, pass, detail) => out.push({ id, kind, title, pass: Boolean(pass), detail })

  // S1 —— 規則 2:打字後離開才驗、而且錯誤真的顯示出來。修正前的 hook 在這裡**從不顯示錯誤**:打字那一下 RHF
  // 把 errors 物件換成 store 那一份,之後 setError 原地改它,身分不變 → 快取永遠是空的(2026-10-01 實測)。
  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  await press(page, 'Tab')
  let c = await snap(page, CREATE)
  check('R2', 'contract', '規則 2:建立表單 Email 打 abc 後離開 → 出現「Email 格式不正確」,沒碰過的名稱不報錯',
    shows(c.ownerEmail, 'Email 格式不正確') && clean(c.name), c)

  // S1b —— 規則 2 × 滑鼠(待辦總帳 N67)。修好 N65 之後錯誤會顯示了,卻換來另一件事:打了不合法的值直接用滑鼠按下方的鈕,
  // mousedown 那一刻欄位 blur、錯誤長出來把鈕往下推,放開時已不在鈕上 → 這一下 click 落空。hook 把「按著指標時的 blur」
  // 延到按壓結束(click 已送出)才驗;鍵盤離開照舊當場驗。
  const SUBMIT = `${formSel(CREATE)} button[type="submit"]`
  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  const topBeforeTab = await topOf(page, SUBMIT)
  await press(page, 'Tab')
  const tabShift = Math.round(((await topOf(page, SUBMIT)) - topBeforeTab) * 10) / 10
  c = await snap(page, CREATE)
  check('R2d-tab', 'contract', '規則 2 × 鍵盤:Email 打 abc 後按 Tab → 錯誤當場出現、當場把送出鈕往下推(延後只給按著的指標)',
    shows(c.ownerEmail, 'Email 格式不正確') && clean(c.name) && tabShift > 0, { tabShift, ownerEmail: c.ownerEmail, name: c.name })

  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  let shift = await pressAndRelease(page, SUBMIT)
  c = await snap(page, CREATE)
  check('R2d-submit', 'contract', '規則 2 × 滑鼠:Email 打 abc 後直接用滑鼠按「送出」→ 這一下落在送出鈕上、送出全驗(兩欄都報錯)、焦點落在這張表的名稱',
    c.submitClicks === 1 && shows(c.name, '專案名稱必填') && shows(c.ownerEmail, 'Email 格式不正確') && c.active === `${CREATE}/name`,
    { shiftDuringPress: shift, submitClicks: c.submitClicks, name: c.name, ownerEmail: c.ownerEmail, active: c.active })

  // 觸控點一下:touch 的 pointerdown / pointerup 先發完,焦點在之後補發的 mousedown 才移動、接著 mouseup / click
  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  const tapTarget = await page.locator(SUBMIT).boundingBox()
  if (!tapTarget) throw new InstrumentError(`找不到要點的 ${SUBMIT}`)
  await page.touchscreen.tap(tapTarget.x + tapTarget.width / 2, tapTarget.y + tapTarget.height / 2)
  await settle(page)
  await focusStable(page)
  c = await snap(page, CREATE)
  check('R2d-touch', 'contract', '規則 2 × 觸控:Email 打 abc 後直接點一下「送出」→ 這一下落在送出鈕上、送出全驗(兩欄都報錯)、焦點落在這張表的名稱',
    c.submitClicks === 1 && shows(c.name, '專案名稱必填') && shows(c.ownerEmail, 'Email 格式不正確') && c.active === `${CREATE}/name`,
    { submitClicks: c.submitClicks, name: c.name, ownerEmail: c.ownerEmail, active: c.active })

  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  shift = await pressAndRelease(page, `${formSel(CREATE)} [data-reset]`)
  c = await snap(page, CREATE)
  check('R2d-cancel', 'contract', '規則 2 × 滑鼠:Email 打 abc 後直接按下方的「重設」(取消類)→ 這一下落在它上面、兩欄清空,延後的驗證沒有在清空的表單上補報錯',
    c.resetClicks === 1 && c.name.value === '' && c.ownerEmail.value === '' && clean(c.name) && clean(c.ownerEmail),
    { shiftDuringPress: shift, resetClicks: c.resetClicks, name: c.name, ownerEmail: c.ownerEmail })

  // WM 的版本(N67):沒有 <form> 的對話框開啟時焦點在第一欄,沒打字直接按 footer 的「建立」—— 離開那一下「必填」長出來
  await remount(page)
  await click(page, 'section[aria-label="新增類型"] input[name="name"]')
  shift = await pressAndRelease(page, 'section[aria-label="新增類型"] [data-footer-submit]')
  let p = await focusAndAlert(page, 'section[aria-label="新增類型"]', 'name')
  check('R2d-footer', 'contract', '規則 2 × 滑鼠(沒有 <form>、footer 按鈕):「新增類型」名稱沒填就按「建立」→ 這一下落在建立鈕上、它自己的錯誤出現、焦點落在它自己的名稱',
    p.clicks === 1 && p.alert === '專案名稱必填' && p.active === '新增類型/name', { shiftDuringPress: shift, ...p })

  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  await pressAndRelease(page, '[data-blank]')
  c = await snap(page, CREATE)
  check('R2d-later', 'contract', '規則 2 × 滑鼠:Email 打 abc 後按在空白處 → 放開後錯誤照樣出現(延後不是丟掉)',
    shows(c.ownerEmail, 'Email 格式不正確') && clean(c.name), { ownerEmail: c.ownerEmail, active: c.active })

  await remount(page)
  await click(page, inputSel(CREATE, 'ownerEmail'))
  await type(page, 'abc')
  await pressAndRelease(page, `${formSel(CREATE)} [data-clear-for="ownerEmail"]`)
  c = await snap(page, CREATE)
  check('R1-refocus', 'contract', '規則 1:Email 打 abc 後按旁邊的「清除」(清空並把焦點放回 Email)→ 焦點在 Email 裡時不報錯',
    c.ownerEmail.value === '' && clean(c.ownerEmail) && c.active === `${CREATE}/ownerEmail`, { ownerEmail: c.ownerEmail, active: c.active })

  // S1c —— 規則 2 × 原生拖曳(2026-10-01 驗證抓到,待辦總帳 N67):按住連結 / 圖片拖一段再放開是原生拖曳,Chromium 送
  // dragstart → pointercancel → dragend,**沒有 mouseup、沒有 click**。只放掉 pointer 的 hook 把 mousedown 留下的「按著」
  // 卡住:這一格一直不驗,之後鍵盤離開(Tab)也全被延後,直到下一次滑鼠點擊。連結都在表單上方,錯誤長出來推不到它們 ——
  // 這一列只量「按壓有沒有結束」。三段:滑鼠 / 筆(取消的是 mouse#1)/ 筆拖一個拖曳開始就離開頁面的連結(dragend 到不了)。
  const dragParts = {
    mouse: await dragThenTab(page, '[data-drag-source]', 'mouse', true),
    pen: await dragThenTab(page, '[data-drag-source]', 'pen', true),
    penSourceRemoved: await dragThenTab(page, '[data-drag-detach]', 'pen', false),
  }
  check('R2d-drag', 'contract', '規則 2 × 原生拖曳:Email 打 abc 後按住上方連結拖一段再放開 → 放開後錯誤出現;接著鍵盤回到 Email 改成仍不合法、按 Tab → 錯誤當場出現(「按著」沒有卡住;滑鼠 / 筆 / 來源被移出頁面三段)',
    Object.values(dragParts).every((d) => d.ok), dragParts)

  // S2 —— 建立表單(DOM 第二張)空白送出 → 全驗 + 焦點;接著逐欄修正到送出成功
  await remount(page)
  await click(page, `${formSel(CREATE)} button[type="submit"]`)
  await focusStable(page)
  c = await snap(page, CREATE)
  check('C2', 'control', '空白送出全驗:兩欄都出現錯誤、onSubmit 沒被呼叫',
    shows(c.name, '專案名稱必填') && shows(c.ownerEmail, 'Email 格式不正確') && c.submits === 0, c)
  check('R8', 'contract', '規則 8:焦點落在被送出的「建立專案」表的第一個錯誤欄位(不是前面那張表的同名欄位)',
    c.active === `${CREATE}/name`, c.active)

  await click(page, inputSel(CREATE, 'name'))
  await type(page, 'Checkout revamp')
  c = await snap(page, CREATE)
  check('R5', 'contract', '規則 5:已出錯的名稱一開始編輯,錯誤立刻消失(還沒離開)', clean(c.name), c.name)
  check('C5', 'control', '規則 5 另一面:只清被編輯的那欄,Email 的錯誤還在', shows(c.ownerEmail, 'Email 格式不正確'), c.ownerEmail)

  await press(page, 'Tab') // 離開名稱 → 焦點到 Email
  c = await snap(page, CREATE)
  check('R6', 'contract', '規則 6:名稱改成合法再離開 → 不再報錯', clean(c.name), c.name)

  await type(page, 'abc')
  await press(page, 'Tab')
  c = await snap(page, CREATE)
  check('C6', 'control', '規則 6 另一面:Email 改成仍不合法再離開 → 錯誤回來', shows(c.ownerEmail, 'Email 格式不正確'), c.ownerEmail)

  await click(page, inputSel(CREATE, 'ownerEmail'))
  await clearFocused(page)
  await type(page, 'pm@acme.com')
  await press(page, 'Tab')
  await click(page, `${formSel(CREATE)} button[type="submit"]`)
  c = await snap(page, CREATE)
  check('R7', 'contract', '規則 7:全部改對後送出 → onSubmit 跑一次,整張表沒有殘留錯誤',
    c.submits === 1 && clean(c.name) && clean(c.ownerEmail), c)

  // S3 —— 更新表單改名後按 Escape → 回原值、回到沒改過(送出鈕再度停用)
  await remount(page)
  await click(page, inputSel(UPDATE, 'name'))
  await press(page, 'End')
  await type(page, ' v2')
  let u = await snap(page, UPDATE)
  if (u.name.value !== '產品路線圖 v2' || u.submitDisabled !== false) throw new InstrumentError(`更新表單打字後狀態不對,無法量 Escape:${JSON.stringify(u.name)} submitDisabled=${u.submitDisabled}`)
  await press(page, 'Escape')
  u = await snap(page, UPDATE)
  check('R4a', 'contract', '規則 4:更新表單改名後按 Escape → 回到「產品路線圖」、送出鈕再度停用(沒改過)、不報錯',
    u.name.value === '產品路線圖' && u.submitDisabled === true && clean(u.name), u)

  // S4 —— 建立表單空白送出後,在出過錯的名稱打字再按 Escape → 值回空、不驗證、不留錯誤
  await remount(page)
  await click(page, `${formSel(CREATE)} button[type="submit"]`)
  await click(page, inputSel(CREATE, 'name'))
  await type(page, 'a')
  await press(page, 'Escape')
  await focusStable(page)
  c = await snap(page, CREATE)
  check('R4b-value', 'contract', '規則 4:出過錯的名稱打字後按 Escape → 值回到初始的空白', c.name.value === '', c.name)
  check('R4b-error', 'contract', '規則 4:Escape 不觸發驗證,焦點還在欄位裡時沒有錯誤留著',
    clean(c.name) && c.active === `${CREATE}/name`, { name: c.name, active: c.active })

  // S5 —— 對照:更新表單(DOM 第一張)清空名稱、Tab 到 Email 後按 Enter 送出(規則 3)→ 焦點從 Email 搬回自己的名稱
  // (量具看得到焦點真的搬家)。用鍵盤送出:這一列只量焦點搬家;滑鼠按送出鈕那條路(錯誤長出來會不會把這一下 click
  // 推掉)是 R2d-submit / R2d-footer 的事。
  await remount(page)
  await click(page, inputSel(UPDATE, 'name'))
  await clearFocused(page)
  await press(page, 'Tab')
  await press(page, 'Enter')
  await focusStable(page)
  u = await snap(page, UPDATE)
  check('C3', 'control', '規則 8 對照:更新表單清空名稱、在 Email 按 Enter 送出 → 焦點從 Email 搬回它自己的名稱',
    u.active === `${UPDATE}/name`, u.active)

  // S5b —— 規則 8,沒有 <form>、footer 按鈕不帶 event(WM 的寫法):「新增類型」空白建立 → 焦點落在它自己的類型名稱。
  // DOM 前面有三個同名 name(兩張表 + 「類型資訊」);只以 <form> 界定的 hook 在這裡沒有範圍可用,會退回整頁第一個。
  await remount(page)
  await click(page, 'section[aria-label="新增類型"] [data-footer-submit]')
  await focusStable(page)
  p = await focusAndAlert(page, 'section[aria-label="新增類型"]', 'name')
  check('C8b', 'control', '沒有 <form> 的「新增類型」空白建立 → 它自己的錯誤真的出現(點擊有送到 handleSubmit)', p.alert === '專案名稱必填', p)
  check('R8b', 'contract', '規則 8:沒有 <form>、footer 按鈕不帶 event → 焦點落在「新增類型」自己的名稱,不是 DOM 前面的同名欄位',
    p.active === '新增類型/name', p.active)

  // S5c —— 規則 8,沒走 getInputProps 的勾選框:「條款 B」沒勾就送出 → 焦點落在它自己的勾選框,不是「條款 A」的
  await remount(page)
  await click(page, 'form[aria-label="條款 B"] button[type="submit"]')
  await focusStable(page)
  p = await focusAndAlert(page, 'form[aria-label="條款 B"]', 'agree')
  check('C8c', 'control', '「條款 B」沒勾就送出 → 它自己的錯誤真的出現(點擊有送到 handleSubmit)', p.alert === '請勾選同意條款', p)
  check('R8c', 'contract', '規則 8:沒有歸屬標記的勾選框 → 焦點落在被送出的「條款 B」的勾選框,不是 DOM 前面「條款 A」的',
    p.active === '條款 B/agree', p.active)

  // S6 —— 對照:reset() 清空值與錯誤(WM 的取消 / 重設鈕走這條)
  await remount(page)
  await click(page, `${formSel(CREATE)} button[type="submit"]`)
  await click(page, `${formSel(CREATE)} [data-reset]`)
  c = await snap(page, CREATE)
  check('C9', 'control', 'reset():空白送出出錯後按重設 → 值與錯誤全部清空',
    c.name.value === '' && c.ownerEmail.value === '' && clean(c.name) && clean(c.ownerEmail), c)

  // ═══ 對話框裡的更新表單(2026-10-01 下午)═══
  const DLG = '#form-dialog[data-state="open"]'
  const DSUB = '[data-dialog-submit]'
  const dsnap = () => page.evaluate(() => {
    const ae = document.activeElement
    const sec = document.querySelector('section[aria-label="對話框表單"]')
    const sub = document.querySelector('[data-dialog-submit]')
    const label = ae?.getAttribute?.('aria-label') ?? (ae instanceof HTMLInputElement ? ae.name : (ae?.textContent ?? '').trim().slice(0, 16))
    return {
      dialog: !!document.querySelector('#form-dialog[data-state="open"]'),
      active: !ae || ae === document.body ? 'BODY' : `${ae.tagName}${label ? `:${label}` : ''}`,
      activeIsSubmit: !!sub && ae === sub,
      name: document.querySelector('#form-dialog input[name="name"]')?.value ?? null,
      due: document.querySelector('[data-due]')?.textContent ?? null,
      calendar: !!document.querySelector('[role="dialog"][aria-label="日期選擇"]'),
      submits: Number(sec?.dataset.submits), clicks: Number(sec?.dataset.submitClicks),
      busy: sub?.getAttribute('aria-busy') === 'true', ariaDisabled: sub?.getAttribute('aria-disabled') === 'true', nativeDisabled: sub?.disabled ?? null,
      focusable: sub?.hasAttribute('data-disabled-focusable') ?? false,
    }
  })
  const openDlg = async () => {
    await remount(page)
    await click(page, '[data-open-dialog]')
    await page.waitForSelector(DLG, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('對話框沒開') })
    await settle(page); await focusStable(page)
  }

  // R-return:乾淨的對話框按 Esc 關閉 → 焦點回開啟鈕
  await openDlg()
  await press(page, 'Escape'); await focusStable(page)
  let g = await dsnap()
  check('R-return', 'contract', '受控、沒有 DialogTrigger 的 Dialog 按 Esc 關閉 → 焦點回到開啟它的按鈕(不是 body)', !g.dialog && g.active === 'BUTTON:開啟設定', g)

  // R4-dialog:改過的欄位 Esc → 回復、對話框不關;再 Esc → 關
  await openDlg()
  await click(page, '#form-dialog input[name="name"]'); await press(page, 'End'); await type(page, ' v2')
  await press(page, 'Escape'); await focusStable(page)
  const afterEsc1 = await dsnap()
  await press(page, 'Escape'); await focusStable(page)
  const afterEsc2 = await dsnap()
  check('R4-dialog', 'contract', '對話框裡改過的欄位按 Esc → 值回「產品路線圖」、對話框不關、焦點留在欄位;再按一下才關',
    afterEsc1.dialog && afterEsc1.name === '產品路線圖' && afterEsc1.active === 'INPUT:name' && !afterEsc2.dialog, { afterEsc1, afterEsc2 })

  // R4-one-layer:可打字的 DatePicker 值改過(打新日期 + Enter 提交)、日曆開著 → Esc 只關日曆、值不動;再 Esc 回復值;再 Esc 關
  await openDlg()
  await page.focus('#form-dialog input[role="combobox"]'); await settle(page)
  await clearFocused(page); await type(page, '2026/04/01'); await press(page, 'Enter')
  g = await dsnap()
  if (g.due !== '2026-04-01') throw new InstrumentError(`打新日期 + Enter 後值不是 2026-04-01:${JSON.stringify(g)}`)
  // 用滑鼠點欄位開日曆:焦點留在輸入框(date-picker.tsx openedByPointerRef),這一下 Esc 的「最內層」才是日曆本身 ——
  // 鍵盤開(↓)焦點會進日曆、落在有 Tooltip 的「上一個月」上,第一下 Esc 收的是 Tooltip(也是一層),量不到本列要的「日曆 vs 欄位」
  await click(page, '#form-dialog input[role="combobox"]')
  await page.waitForSelector('[role="dialog"][aria-label="日期選擇"]', { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('日曆沒開') })
  await settle(page); await focusStable(page)
  await press(page, 'Escape'); await focusStable(page)
  const oneA = await dsnap()
  await press(page, 'Escape'); await focusStable(page)
  const oneB = await dsnap()
  await press(page, 'Escape'); await focusStable(page)
  const oneC = await dsnap()
  check('R4-one-layer', 'contract', '可打字的 DatePicker 值改成 2026-04-01、日曆開著按 Esc → 只關日曆、值仍 2026-04-01、對話框不關;再 Esc → 值回 2026-03-12;再 Esc → 關對話框',
    oneA.dialog && !oneA.calendar && oneA.due === '2026-04-01' && oneB.dialog && oneB.due === '2026-03-12' && !oneC.dialog, { oneA, oneB, oneC })

  // R9-busy:忙碌鈕本身(BusyFixture,不經 hook —— hook 的重入防護與 submitDisabled 會掩蓋 Button 的 loading 路徑)
  const BUSY = '[data-busy-submit]'
  const bsnap = () => page.evaluate(() => {
    const b = document.querySelector('[data-busy-submit]')
    const f = document.querySelector('form[aria-label="忙碌鈕"]')
    const ae = document.activeElement
    return {
      active: !ae || ae === document.body ? 'BODY' : ae === b ? 'BUSY-BUTTON' : `${ae.tagName}:${ae.getAttribute('name') ?? ''}`,
      busy: b?.getAttribute('aria-busy') === 'true', ariaDisabled: b?.getAttribute('aria-disabled') === 'true', nativeDisabled: b?.disabled ?? null,
      submits: Number(f?.dataset.busySubmits), clicks: Number(f?.dataset.busyClicks),
    }
  })
  await remount(page)
  await page.locator(BUSY).scrollIntoViewIfNeeded(); await settle(page)
  await pressAndRelease(page, BUSY)
  const busy = await bsnap()
  // 忙碌中:同一張表的欄位裡按 Enter(隱含送出 = 瀏覽器對預設送出鈕派 click)+ 再按一次送出鈕 → 都不送出
  // (Playwright 的可操作性檢查把 aria-disabled="true" 當停用、不肯按;這裡要量的正是「真的按下去產品擋不擋」→ force)
  await click(page, 'form[aria-label="忙碌鈕"] input[name="memo"]'); await press(page, 'Enter')
  const afterEnter = await bsnap()
  await page.click(BUSY, { force: true }); await settle(page); await focusStable(page)
  const afterRetry = await bsnap()
  check('R9-busy', 'contract', '忙碌鈕(loading)用滑鼠按下 → 焦點仍在它上面、aria-busy、原生 disabled=false;忙碌中在同一張表的欄位按 Enter(隱含送出)與再按一次都不送出(submit 事件 1 次、consumer onClick 1 次)',
    busy.active === 'BUSY-BUTTON' && busy.busy && busy.nativeDisabled === false && busy.submits === 1
    && afterEnter.submits === 1 && afterRetry.submits === 1 && afterRetry.clicks === 1 && afterRetry.busy, { busy, afterEnter, afterRetry })
  await page.evaluate(() => window.__releaseBusy?.()); await settle(page)

  // R9-saved / R9-leave / R4-saved:對話框裡的更新表單(經 hook;送出中 = await,何時結束由量具放行)
  await openDlg()
  await click(page, '#form-dialog input[name="name"]'); await press(page, 'End'); await type(page, ' v2')
  await pressAndRelease(page, DSUB)
  const dialogBusy = await dsnap()
  await page.evaluate(() => window.__releaseDialogSubmit?.())
  await waitUntil(page, () => document.querySelector('[data-dialog-submit]')?.getAttribute('aria-busy') !== 'true', '送出完成(aria-busy 消失)')
  await focusStable(page)
  const saved = await dsnap()
  check('R9-saved', 'contract', '存檔完成 → 焦點仍在送出鈕、aria-disabled="true" + data-disabled-focusable、原生 disabled=false(可聚焦的停用,不掉到 body)',
    saved.activeIsSubmit && saved.ariaDisabled && saved.focusable && saved.nativeDisabled === false && saved.dialog && saved.submits === 1, { dialogBusy, saved })
  await press(page, 'Tab'); await focusStable(page)
  const afterTab = await dsnap()
  await press(page, 'Shift+Tab'); await focusStable(page)
  const afterShiftTab = await dsnap()
  check('R9-leave', 'contract', '接著按 Tab → 焦點往下走、送出鈕回到原生 disabled;Shift+Tab 回不到它(離開 Tab 序)',
    !afterTab.activeIsSubmit && afterTab.active !== 'BODY' && afterTab.nativeDisabled === true && !afterShiftTab.activeIsSubmit && afterShiftTab.active !== 'BODY', { afterTab, afterShiftTab })
  await click(page, '#form-dialog input[name="name"]'); await press(page, 'End'); await type(page, ' x')
  await press(page, 'Escape'); await focusStable(page)
  const savedEsc = await dsnap()
  check('R4-saved', 'contract', '存檔後再改欄位按 Esc → 回到剛存的「產品路線圖 v2」,不是存檔前的「產品路線圖」;對話框不關',
    savedEsc.dialog && savedEsc.name === '產品路線圖 v2', savedEsc)
  await press(page, 'Escape')

  // ═══ 送出成功 → Toast(三則 story 原始碼)═══
  const tsnap = (formLabel) => page.evaluate((lbl) => ({
    polite: document.querySelector('[data-toast-live-region="polite"]')?.textContent ?? null,
    toasts: document.querySelectorAll('[data-sonner-toast]').length,
    statusInForm: document.querySelectorAll(`form[aria-label="${lbl}"] [role="status"]`).length,
    alert: document.querySelector(`form[aria-label="${lbl}"] [role="alert"]`)?.textContent ?? null,
    readonly: !!document.querySelector(`form[aria-label="${lbl}"] [role="img"]`),
  }), formLabel)
  // 等「送出結果出現」(Toast / 錯誤 / 修改前建置的表單內「已儲存 ✓」朗讀區)—— 等不到也照樣讀快照、進判定(見 waitForOutcome):
  // 「送出成功卻什麼回饋都沒有」就是這幾列要抓的缺陷,不是儀器失效
  await view(page, 'story-field', formSel(UPDATE))
  await click(page, inputSel(UPDATE, 'name')); await press(page, 'End'); await type(page, ' v2')
  await click(page, `${formSel(UPDATE)} button[type="submit"]`)
  const seenUpdate = await waitForOutcome(page, () => document.querySelectorAll('[data-sonner-toast]').length > 0 || document.querySelector('form[aria-label="專案設定"] [role="alert"]') || (document.querySelector('form[aria-label="專案設定"] [role="status"]')?.textContent ?? '').trim() !== '')
  const tUpdate = { ...(await tsnap(UPDATE)), outcomeSeen: seenUpdate }
  await view(page, 'story-field', formSel(UPDATE))
  await click(page, inputSel(UPDATE, 'name')); await clearFocused(page); await type(page, '產品路線圖 Q3')
  await click(page, `${formSel(UPDATE)} button[type="submit"]`); await focusStable(page)
  const tUpdateBiz = await tsnap(UPDATE)
  check('T-update', 'contract', '更新表單送出成功 → Toaster polite 朗讀區 =「專案設定已儲存」、一則 Toast、表單內沒有 role=status;業務驗證擋下(名稱重複)→ 沒有 Toast、FieldError「此專案名稱已存在」',
    tUpdate.polite === '專案設定已儲存' && tUpdate.toasts >= 1 && tUpdate.statusInForm === 0 && tUpdateBiz.toasts === 0 && tUpdateBiz.alert === '此專案名稱已存在' && tUpdateBiz.polite !== '專案設定已儲存', { tUpdate, tUpdateBiz })
  await view(page, 'story-field', formSel(CREATE))
  await click(page, inputSel(CREATE, 'name')); await type(page, 'Checkout revamp')
  await click(page, inputSel(CREATE, 'ownerEmail')); await type(page, 'pm@acme.com')
  await click(page, `${formSel(CREATE)} button[type="submit"]`)
  const seenCreate = await waitForOutcome(page, () => document.querySelectorAll('[data-sonner-toast]').length > 0 || document.querySelector('form[aria-label="建立專案"] [role="alert"]') || (document.querySelector('form[aria-label="建立專案"] [role="status"]')?.textContent ?? '').trim() !== '')
  const tCreate = { ...(await tsnap(CREATE)), outcomeSeen: seenCreate }
  check('T-create', 'contract', '建立表單送出成功 → polite 朗讀區 =「專案已建立」、一則 Toast、表單內沒有 role=status',
    tCreate.polite === '專案已建立' && tCreate.toasts >= 1 && tCreate.statusInForm === 0, tCreate)
  const RATING = '為這次服務評分'
  await view(page, 'story-rating', `form[aria-label="${RATING}"]`)
  await page.focus(`form[aria-label="${RATING}"] [role="slider"]`); await settle(page)
  await press(page, 'ArrowRight'); await press(page, 'ArrowRight'); await press(page, 'ArrowRight')
  await click(page, `form[aria-label="${RATING}"] button[type="submit"]`)
  const seenRating = await waitForOutcome(page, () => document.querySelectorAll('[data-sonner-toast]').length > 0 || document.querySelector('form[aria-label="為這次服務評分"] [role="alert"]') || (document.querySelector('form[aria-label="為這次服務評分"] [role="status"]')?.textContent ?? '').trim() !== '')
  const tRating = { ...(await tsnap(RATING)), outcomeSeen: seenRating }
  check('T-rating', 'contract', '評分送出成功 → polite 朗讀區 =「評分已送出」、一則 Toast、表單內沒有 role=status、評分欄切成唯讀(role=img)',
    tRating.polite === '評分已送出' && tRating.toasts >= 1 && tRating.statusInForm === 0 && tRating.readonly, tRating)

  // ═══ 浮層裡的表單:送出成功 → Toast、關閉;下次打開 reset()(2026-10-07)═══
  // 浮層是 Radix Dialog(Sheet 同),內容 role=dialog;Toast 以「這則文案的 [data-sonner-toast] 多一則」判(朗讀區可能還留著上一則同樣的字)
  const OPEN = '[role="dialog"][data-state="open"]'
  const ostate = (title) => page.evaluate(({ title, OPEN }) => {
    const dlg = document.querySelector(OPEN)
    return {
      open: !!dlg,
      toasts: Array.from(document.querySelectorAll('[data-sonner-toast]')).filter((el) => (el.textContent ?? '').includes(title)).length,
      alert: dlg?.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
      first: dlg?.querySelector('input')?.value ?? null,
    }
  }, { title, OPEN })
  const openOverlay = async (trigger) => {
    await click(page, `main button:has-text("${trigger}")`)
    await page.waitForSelector(OPEN, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError(`按「${trigger}」浮層沒開`) })
    await settle(page); await focusStable(page)
  }
  const closeOverlay = async () => {
    for (let i = 0; i < 3 && (await page.$(OPEN)); i += 1) await press(page, 'Escape')
    if (await page.$(OPEN)) throw new InstrumentError('浮層收不掉')
  }
  /** 一則浮層表單:空白送出(只看報錯)→ 填好送出 → 再打開;回傳每一步的狀態 */
  const overlayForm = async ({ name, trigger, submit, title, fill, blankSubmit }) => {
    await view(page, name, 'button')
    await openOverlay(trigger)
    let blank = null
    if (blankSubmit) { await click(page, `${OPEN} button:has-text("${submit}")`); await focusStable(page); blank = await ostate(title) }
    await page.click(`${OPEN} input`); await settle(page)
    await clearFocused(page); await type(page, fill)
    const before = await ostate(title)
    await click(page, `${OPEN} button:has-text("${submit}")`)
    const seen = await waitForOutcome(page, () => !document.querySelector('[role="dialog"][data-state="open"]'))
    const after = { ...(await ostate(title)), outcomeSeen: seen }
    if (after.open) await closeOverlay()
    await openOverlay(trigger)
    const reopened = await ostate(title)
    await closeOverlay()
    return { blank, before, after, reopened }
  }
  const tDialog = await overlayForm({ name: 'story-dialog', trigger: '開啟 Modal', submit: '建立', title: '專案已建立', fill: 'Checkout revamp', blankSubmit: true })
  check('T-dialog', 'contract', 'Dialog「表單」:空白送出 → 報「專案名稱必填」、不關、沒有 Toast;填好送出 → 多一則「專案已建立」Toast、對話框關閉;再打開 → 欄位是空白(建立表單打開時 reset)',
    tDialog.blank?.open && tDialog.blank.alert === '專案名稱必填' && tDialog.blank.toasts === 0
    && !tDialog.after.open && tDialog.after.toasts === tDialog.before.toasts + 1 && tDialog.reopened.first === '', tDialog)
  const tSheetCreate = await overlayForm({ name: 'story-sheet-create', trigger: '建立新專案', submit: '建立專案', title: '專案已建立', fill: 'Q2 產品路線圖', blankSubmit: true })
  const tSheetEdit = await overlayForm({ name: 'story-sheet-edit', trigger: '檢視成員詳情', submit: '儲存變更', title: '成員資料已儲存', fill: 'Ada Chen-Wu', blankSubmit: false })
  check('T-sheet', 'contract', 'Sheet「建立新專案」同 T-dialog(空白報錯不關、送出成功多一則「專案已建立」並關閉、再打開是空白);「編輯成員詳情」改名送出 → 多一則「成員資料已儲存」並關閉、再打開是剛存的「Ada Chen-Wu」',
    tSheetCreate.blank?.open && tSheetCreate.blank.alert === '專案名稱必填' && tSheetCreate.blank.toasts === 0
    && !tSheetCreate.after.open && tSheetCreate.after.toasts === tSheetCreate.before.toasts + 1 && tSheetCreate.reopened.first === ''
    && !tSheetEdit.after.open && tSheetEdit.after.toasts === tSheetEdit.before.toasts + 1 && tSheetEdit.reopened.first === 'Ada Chen-Wu', { tSheetCreate, tSheetEdit })

  return out
}

// 全程只開一個 context / page:沙箱參數 --single-process 下關掉 context 會把整個瀏覽器帶走(2026-10-01 實測,
// 第二個變體 newPage 就丟「browser has been closed」)。每個變體先導到 about:blank —— 新的 window,上一份 bundle 的全域不留。
async function runVariant(page, label, mutate) {
  const code = await bundle(mutate)
  mutate?.assertApplied?.()
  const { pageErrors, dispose } = await mountHarness(page, code, `main[data-mount="1"] ${formSel(CREATE)}`)
  try {
    const checks = await runChecks(page)
    if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
    return { label, checks }
  } finally {
    dispose()
  }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(10)} ${c.kind === 'control' ? '[對照] ' : ''}${c.title}`)
    // 規則 2 × 滑鼠 / 鍵盤那幾列綠的時候也印量到的位移:讓人看得到「推了多少、這一下有沒有落在按鈕上」
    if (!c.pass || c.id.startsWith('R2d-')) console.log(`      ${c.pass ? '量到' : '實得'}:${JSON.stringify(c.detail)}`)
  }
}

const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()

let browser
const laneBrowsers = []
try {
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  // hasTouch:R2d-touch 要點得了觸控(page.touchscreen);滑鼠與鍵盤照常
  const CONTEXT = { viewport: { width: 900, height: 700 }, hasTouch: true }
  const page = await (await browser.newContext(CONTEXT)).newPage()
  const hookOverride = HOOK_OVERRIDE ? resolve(process.cwd(), HOOK_OVERRIDE) : null
  const rootLabel = SOURCE_ROOT === ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(page, `原始碼 = ${rootLabel}${hookOverride ? `,hook = ${hookOverride}` : ''}`, makeMutate(hookOverride, null))
    report(result)
    const red = result.checks.filter((c) => !c.pass)
    if (red.length) {
      console.log(`\n✗ form-validation 契約:${red.length} 條不符(${redIds(result.checks).join(' / ')})—— SSOT form-validation.spec.md 規則 1–8 / keyboard-model-canonical.md 兩節 / Toast`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ form-validation 契約:${result.checks.length} 條全綠(規則 1 / 2 / 4 / 5 / 6 / 7 / 8 + 對話框 / 送出鈕焦點 / Toast + 對照列)`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準,必須全綠)', makeMutate(hookOverride, null))
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行 hook 本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    // 突變彼此獨立:分 LANES 條 lane 並行跑(第一條 lane 沿用上面那個分頁),結果依 MUTANTS 的順序回報
    const results = new Array(MUTANTS.length)
    const lanePages = [page]
    for (let i = 1; i < Math.min(LANES, MUTANTS.length); i += 1) {
      const b = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
      laneBrowsers.push(b)
      lanePages.push(await (await b.newContext(CONTEXT)).newPage())
    }
    let next = 0
    let laneFailure = null
    const settled = await Promise.allSettled(lanePages.map(async (lanePage) => {
      // 任一條 lane 儀器失效就不再領新的突變(整趟本來就不能算通過),其他 lane 把手上那一個跑完再收
      for (let i = next++; i < MUTANTS.length && !laneFailure; i = next++) {
        const m = MUTANTS[i]
        try {
          results[i] = await runVariant(lanePage, `突變 ${m.id}:${m.what}`, makeMutate(hookOverride, m))
        } catch (error) {
          laneFailure ??= error
          throw error
        }
      }
    }))
    const rejected = settled.find((r) => r.status === 'rejected')
    if (rejected) throw rejected.reason
    for (const [i, m] of MUTANTS.entries()) {
      const result = results[i]
      report(result)
      const red = redIds(result.checks)
      const want = [...m.expectRed].sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) problems.push(`${m.id}:紅的是 [${red.join(', ')}],應剛好是 [${want.join(', ')}]`)
      for (const id of red) covered.add(id)
    }
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 條全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  for (const b of laneBrowsers) await b.close().catch(() => {})
  await browser?.close()
}
