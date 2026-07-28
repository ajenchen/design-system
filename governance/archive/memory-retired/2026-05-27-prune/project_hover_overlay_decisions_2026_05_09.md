---
name: hover overlay 架構 Q1-Q7 已決事項(2026-05-09 Claude own)
description: 7 題 hover overlay 架構 review 中,Q1/Q2/Q4/Q5/Q7 五題 Claude own 決定不送 codex,只 Q3(edit field IN overlay)送 codex 比稿。記錄已決事項避免下次重討
type: project
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Hover overlay architecture decisions(2026-05-09)

**Why**:user 在 USER #56(2026-05-09 09:49Z)提 7 題 hover overlay architecture deep review。Claude own 5 題、codex 比稿 1 題。Claude 沒落地造成下 turn 又被 user 翻舊帳。

**How to apply**:下次 hover overlay 相關討論前必先 grep 本檔。已決的別再翻案,只有 Q3 仍 open。

## 已 Claude own 決定(不送 codex,Claude 有信心)

### Q1 — Focus state 必要性
- **Decision**:**Click-to-edit 模式下 focus 跟 editing 同步,不需獨立 focus 視覺**
- **Why**:user 質問「我本來以為 focus 就是直接進入 editing,特別列出 focus 的原因是?」 — 對。Field state machine v13.3「focus dominates everything」是 Field 內部的 state precedence,不是 cell 外圈 ring 要展示的 state
- **Drop**:`CellVisualIntent = 'focus'` 從 enum 移除

### Q2 — `--table-cell-ring-editing` token
- **Decision**:**刪掉。Editing 不重畫 ring,直接吃 Field 自身 border SSOT**
- **Why**:user 質問「editing 不就是要吃 field border 來確保 SSOT 嗎?為何又要再定義一次 ring?」 — 對。Field 在 cell 內 native border 就是 editing visual,不需 cell 外圈再畫一層 ring
- **Drop**:`--table-cell-ring-editing` token 從提案移除

### Q4 — Click-to-edit 模式 visual states 數量
- **Decision**:**只 1 個 hover-editable**(其他 cell 不畫 ring)
- **Why**:click-to-edit 模式不需 selected / range,user 直接 click 進 editing。Display 模式無 ring,hover 顯 ring 表示「可點」,editing 由 Field 自身 border 處理
- **Enum**:`CellVisualIntent = 'hover-editable'` 唯一 case

### Q5 — Selected / range states
- **Decision**:**只在獨立 spreadsheet 模式 RFC,不混進 click-to-edit 當前 scope**
- **Why**:user 寫「selected 的樣式應該只有在 spread sheet 模式才會出現對吧?」 — 對。spreadsheet = 點 1 下 selected / 點 2 下 editing,跟 click-to-edit 是不同 mode
- **Defer**:RFC「DataTable spreadsheet mode」獨立檔,**post-v1**

### Q7 — `--table-cell-ring-*` token 是否該抽
- **Decision**:**不抽,inline `var(--border-hover)` 即可**
- **Why**:Rule-of-3 不到 — 只 1 處用(hover-editable)。M17 SSOT 規定「同值 hard-code 在 3+ consumer = 必抽 token」,1 處不該抽
- **撤回**:codex 5 個 `--table-cell-ring-*` token 提案 reject

## 已決(送 codex 比稿後 synthesize)

### Q3 — Edit field IN overlay vs IN cell
- **Final decision**:**NOT NOW** — short-term hover ring 走 cell-host inline overlay,edit 仍 cell-internal Field Control
- **Reply**:`/tmp/codex-reply-edit-field-in-overlay.md`(2026-05-09 ~11:00Z)
- **Codex AGREE**:Third path = Claude own。不該 ship popup editor 直到 profiling 證明 display Field Controls 是 bottleneck
- **World-class cite**(M22 ✓):
  - Glide Data Grid `provideEditor(target: Rectangle)` overlay-editor pattern
  - AG Grid inline + popup dual mode(active editor 永遠 1)
- **Codex challenges Claude Step 0.5 錯點**(記下避免重犯):
  1. 「1100 edit Field instances」**數字錯** — 其實是 display Field Control instances(非 active editors;active 永遠 1)
  2. Display SSOT 會被破(`field-controls.spec.md` L26 spec'd「DataTable cell 用 Field Controls mode='display' 做格式化 SSOT」)
  3. 高風險點漏列:IME composition / draft preservation / a11y focus model / scroll sync / portal nesting / virtualizer active row unmount
- **RFC 何時開**:profiling 證明 display Field Controls 真 bottleneck **OR** 產品方向轉 spreadsheet-grade editing 才開,defer post-v1

## 對應 implement 路徑(已決部分可推進)

1. Hover ring single overlay div in DataTable body(Q4 confirm 1 state)
2. JS-driven 量 hovered cell rect + position overlay(per Q1-Q5 codex reply Layer 1)
3. **不**設 `--table-cell-ring-*` token(Q7),overlay div className 直接用 `border-[var(--border-hover)]`
4. Edit Field 仍 cell-internal(Q3 final 前不動)
5. 撤回 codex 5-token 提案(已記錄 Q7)
