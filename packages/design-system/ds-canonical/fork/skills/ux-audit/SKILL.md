---
name: ux-audit
description: UX behavior audit for design-system components and product UI. Checks keyboard navigation, focus management, ARIA correctness, animation timing, interaction canonical (hover/click/drag/zoom), error/loading states, empty states. Invoke when user says「鍵盤用不了」「focus 跑飛」「動畫怪怪的」「無障礙檢查」, auto-invoked by `/component-quality-gate` Phase 4.5 (advanced mode) and `/design-system-audit` Dimension D4.
---

# UX Audit — UX 行為稽核

## 存在意義

現有 `/design-system-audit`(code/spec)+ `/visual-audit`(pixel)+ `/performance-audit`(render)**都不看行為**。interaction canonical、keyboard nav、focus trap、animation timing 這類 bug:
- 視覺正常 / code 正常 / 效能正常
- **Keyboard only user 完全卡關** / screen reader 讀不到 / focus 不回到 trigger / zoom wheel 跳大步

本 skill 是稽核 6 維度的 **D4 UX 行為** canonical home。

## 觸發時機(對齊 CLAUDE.md 稽核 canonical)

| 情境 | 模式 | 本 skill 跑什麼 |
|------|------|----------------|
| 新元件 merge 前 | 進階強制 | 全面(kb / focus / ARIA / animation / interaction) |
| 元件新功能 | 進階強制 | scoped to 新 interaction 路徑 |
| 產品 demo 前 | 進階強制 | 全流程 keyboard-only walkthrough |
| 日常 dev | 高效 | 主要 kb path 手動過一次 |
| Release cut | 進階 + 全 DS | 全 DS 的 a11y / interaction 全掃 |

## Preconditions

- 元件 folder 存在於 `node_modules/@qijenchen/design-system/src/components/{Name}/`
- Storybook 可啟動(用於互動驗證)
- 若稽核產品頁:URL 可訪問

## Workflow

### Phase 0 — Scope 判定

- 單元件 scope → Phase 1-4 對該元件
- 全 DS / URL scope → **先全掃列 interactive 元件清單**,按 interaction 複雜度(overlay > form > row > leaf)排序逐一 audit

### Phase 1 — Keyboard navigation

查 7 項:
1. **Tab order**:DOM order = 視覺 reading order?`tabIndex` 不濫用(`tabIndex > 0` 禁用)
2. **Focus visible ring**:所有 tabbable 元素 focus 有清楚 ring(用 `focus-visible` 非 `focus`)
3. **Activation key**:Button/Link 回應 Enter + Space;menuitem / checkbox / radio 有特定 key 規則
4. **Arrow key navigation**:list / menu / tabs / segmented control 在 group 內用方向鍵,不用 Tab
5. **Escape 關閉 overlay**:Dialog / Popover / Sheet / DropdownMenu 按 Esc 關閉
6. **Focus trap**:modal overlay 內 focus 不跑出 modal 外
7. **Focus restore**:overlay 關閉後 focus 回 trigger

### Phase 2 — Focus management(across state transitions)

查 4 項:
1. **Route change / async load**:新內容載入,focus 應指向新內容開頭(main landmark / first heading)
2. **Error / validation**:form 送出驗證失敗,focus 應回第一個 invalid field + screen reader 讀 error
3. **Dynamic content**:可折疊 section 展開後,focus 應維持在 trigger(非跳到內容)
4. **List item removal**:刪除 item 後 focus 應移到**相鄰** item(不跳到文件頂)

### Phase 3 — ARIA correctness

查 6 項:
1. **role** 正確:`role="button"` on <div> / 正確使用 `role="dialog"` / `role="menu"` / `role="grid"`
2. **aria-label / aria-labelledby**:icon-only button 必有 aria-label;icon + text 不重複宣告
3. **aria-expanded / aria-haspopup**:有 overlay 的 trigger 必宣告
4. **aria-selected / aria-checked / aria-pressed**:狀態元件必正確 sync
5. **aria-live**:動態訊息(validation / toast)用 `aria-live="polite"` 或 `"assertive"`
6. **aria-hidden**:裝飾 icon 必 `aria-hidden`;隱藏內容不能 keyboard focus

### Phase 4 — Animation / interaction canonical

查 5 項:
1. **Animation duration**:< 200ms(micro)或 200-400ms(macro);超過 400ms 主畫面 → 可能 block 輸入
2. **Reduce-motion respect**:`@media (prefers-reduced-motion: reduce)` 下動畫減到 0 或極短
3. **Wheel zoom step 細緻**:> 10% 離散 = 非世界級(對齊 Figma / Preview.app ~3-5%)
4. **Hover delay**:tooltip / hover-card 的 open delay(700ms for tooltip, 500ms for hover-card per DS canonical)
5. **Drag / pan**:pointer capture 正確;release on blur

### Phase 5 — Data / state coverage 五態(2026-04-24 擴充,補 24-checklist #23 edge case gap)

查 5 項 + null-safety + rapid-interaction:

1. **Null-safety**:`null / undefined` label/value/children 不 crash(e.g. `{label}` 為 undefined render 空字串,不 `Cannot read properties of undefined`);空 array `.map()` 不 crash;emoji / 超長單字 / RTL 字元不爆版
2. **Empty**:顯示 `<Empty>` 或對應 placeholder,非 blank;empty 有 CTA 讓使用者知道下步
3. **Loading**:視語境用 CircularProgress / Skeleton / ProgressBar;aria-busy 宣告;**不阻斷可編輯狀態**(Input loading 仍可打字 per spec);**rapid-click / double-submit 有防護**(button loading 期間 disabled OR 靠上游 idempotent)
4. **Error**:用 DS `<Notice>` 或 inline `<FieldError>`;配合 aria-live 通知 AT;error message 不吞(e.g. async rejection 有 fallback UI 非 silent swallow)
5. **Success**(新加):成功 state 有視覺確認(toast / inline checkmark / state transition),讓使用者知道動作 landed,非 silent success

**Edge case corollary**(現實髒資料):
- Children 為 `null` / 為空 array / 元素數量極大(超 50 筆)
- Option 重複 id / selected option 被移除後仍保留 value(stale selection)
- disabled 時仍收到外部 value 更新(controlled forced update)
- 從 uncontrolled 中途變 controlled(React warning 必出,或元件明文不支援)
- Modal 關閉瞬間 async 回調仍 setState(unmount 後 setState warning)

### Phase F — Report(必 STOP,對齊分權 canonical)

產出:

```markdown
# UX Audit — {Scope} — {YYYY-MM-DD}

## Summary
- Keyboard: PASS / N fails
- Focus: PASS / M fails
- ARIA: PASS / K fails
- Animation: PASS / L fails
- Three states: PASS / P fails

## Findings(按 severity 排序)
### P0(完全 block a11y)
### P1(嚴重影響 UX)
### P2(建議改善)

## 提議討論(待 user sign-off)
- {若發現 DS canonical 本身有問題,列於此,不自改}
```

**STOP 點**:report 寫完**不自動修**。分權對齊 CLAUDE.md `# 稽核 canonical`(內含「Audit-vs-execute 分權」inline rule)。

## Non-goals

- 不改 code / spec(純 read-only report)
- 不做視覺稽核(走 `/visual-audit`)
- 不做 code-level audit(走 `/design-system-audit`)

## 相關

- `node_modules/@qijenchen/design-system/ds-canonical/skills/design-system-audit/SKILL.md` — 全 dim 統籌(per design-system-audit SSOT);本 skill 是 D4 補位
- `node_modules/@qijenchen/design-system/ds-canonical/skills/visual-audit/SKILL.md` — pixel 層(D5)
- `node_modules/@qijenchen/design-system/ds-canonical/skills/performance-audit/SKILL.md` — 效能層(D3)
- `node_modules/@qijenchen/design-system/ds-canonical/skills/component-quality-gate/SKILL.md` — Phase 4.5 進階模式 chain 本 skill
