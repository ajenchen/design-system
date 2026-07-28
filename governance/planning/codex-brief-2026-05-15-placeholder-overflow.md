<!-- Authority/status: governance/planning/registry.json -->
@codex DISCUSS-ONLY — PeoplePicker placeholder/value ellipsis + overflow detection non-deterministic(recurring bugs)

> **Step 0.05 verbatim relay invariant 2026-05-15**: brief 含 user 原話 verbatim + Claude 理解 + 請 codex 獨立解讀。**這封 brief 是 transport-agnostic draft**(local codex CLI 未安裝 + 無 PR);user 拍板 transport 後實際投遞。

---

## 1. User 原話(verbatim,中英 / 標點 / 圖文 ref 全保留)

> 「**圖一**,為何people picker包括單人(placeholder直接被截掉沒有變...,如左圖)和多人（placeholder 直接越界超出cell,如右圖）這些placeholder沒有恰當的ellipsis?**是否其他地方也有一樣的問題？**」
>
> 「**圖二**,overflow的偵測是否有bug,為何明明同一個cell,但overflow的時機卻不一樣？有時候第二個就overflow,有時候第三個才overflow?」
>
> 「上述兩個問題**之前就提過了**,你真的有發現root cause嗎？？感覺你只是改冰山一角,才會讓問題沒有全面被解決？」

**Image 1 LEFT**(user 描述為「單人 placeholder 直接被截掉沒有變...」):PeoplePicker single mode trigger value `Bob Christopher C` 截到 `C` 後直接斷,**沒有 ellipsis dots**。Trigger cell 視覺位於 DataTable assignee 欄。

**Image 1 RIGHT / Image 2**:PeoplePicker multi stack mode trigger 顯示 `+2` avatar overflow chip。Dropdown 已開,顯示完整 person list(checkbox + avatar + name + Sales|Tokyo|EMP-1001 fields)。User 說 placeholder 越界超出 cell — 看起來指**dropdown menu width 超出 trigger cell 寬度**(menu 是 anchor-width 還是 content-width?待確認)。

---

## 2. Claude 自己的理解 + 補充脈絡

### 2.1 Bug 描述(我理解的版本,可能不完整)

**Bug A — PeoplePicker single mode trigger value truncate 沒 ellipsis**:
- 場景:DataTable cell + PeoplePicker single mode(包 Select)+ 長 person name(`Bob Christopher Chen`)
- 預期:trigger 顯示 `Bob Christopher Ch…`(with ellipsis dots)
- 實際:trigger 顯示 `Bob Christopher C` 直接斷掉(no dots)

**Bug B — PeoplePicker multi mode placeholder/value 越界**:
- 場景:DataTable cell + PeoplePicker multi mode(包 Combobox)+ 多人 / 空值
- 預期:cell 內容嚴格 contained 在 cell 寬度
- 實際:placeholder text 或某些 visual element 超出 cell border

**Bug C — Overflow count 非確定**:
- 場景:`useOverflowCount` hook(combobox.tsx L48-114)on multi tag layout
- 預期:同 cell width × 同 tags 應永遠算出同 visibleCount
- 實際:有時 count=2(第三個 overflow),有時 count=1(第二個就 overflow)

### 2.2 Code paths I've inspected

| 檔案 | 行 | 關鍵 code |
|------|---|---------|
| `Select/select.tsx` | 201 | `<span className="flex-1 min-w-0 inline-flex items-center nakedCellRowModeAlign">{selectedItemRenderer(selectedOpt)}</span>` — trigger renderer wrapper |
| `Select/select.tsx` | 503-541 | trigger div uses `fieldWrapperStyles` className |
| `Field/field-wrapper.tsx` | 19-28 | base: `inline-flex items-center w-full rounded-md` — **無 `min-w-0` / `overflow-hidden`** |
| `PeoplePicker/person-display.tsx` | 137-144 | 「完成 truncate 寬度約束鏈」comment + `<span flex items-start gap-2 min-w-0 w-full>` outer + `<span truncate flex-1 min-w-0>` inner name |
| `PeoplePicker/people-picker.tsx` | 200-225 | single mode wraps Select with `selectedItemRenderer={(opt) => <PersonDisplay value={...} size={size} />}` |
| `PeoplePicker/people-picker.tsx` | 264-310 | multi pill mode wraps Combobox with `renderTag` |
| `Combobox/combobox.tsx` | 46-114 | `useOverflowCount` — `el.offsetWidth` 累加,measurement 在 `useEffect` + `requestAnimationFrame(() => requestAnimationFrame(calc))` + ResizeObserver container + per-item |
| `Combobox/combobox.tsx` | 161 | `useOverflowCount(containerRef, tagEls, overflowEl, items.length, !wrap, gap)` |
| `DataTable/cell-registry.tsx` | 357-371 | `PeopleCell` — single: `<PeoplePicker variant="naked" mode={displayOrDisabled(isDisabled)} value={...} showDisplayEndIcon={isEditable === true} />` |
| `DataTable/cell-registry.tsx` | 374-393 | `MultiPersonCell` — multi: 同上 |

### 2.3 Earlier "fixes" I shipped(commits 失敗的 root cause)

| Commit | What I changed | Why it didn't fix root cause |
|---|---|---|
| (前 cycle) | PersonDisplay outer `inline-flex` → `flex w-full` + inner `truncate flex-1 min-w-0` | 我 assume 是 PersonDisplay 內部 chain 問題,但實際可能是**上游 Select trigger 或 Field wrapper 缺 `min-w-0`** |
| 2026-05-14 I3 fix | `useOverflowCount` 加 double rAF + per-item ResizeObserver | 我 assume 是 measurement race condition;但**真 root cause 可能是 measurement-time inputs 還沒 ready**(font / image / Avatar 載入)— double rAF 不夠,需 `document.fonts.ready` + image load wait |
| 2026-05-14 I1 fix | PersonDisplay outer `inline-flex` → `flex w-full` | **同 Bug A 上面**,user 抓沒修到 — 上游 Field wrapper 或 trigger 缺 `min-w-0` 才是真 root cause |

### 2.4 我的 Hypothesis(可能錯 — 請 codex 獨立判斷)

**H1**:`fieldWrapperStyles` base(`inline-flex items-center w-full`)**缺 `min-w-0`**。當 Field 放在 DataTable cell(`grid` cell with `auto` column width)時,inline-flex 子元素的 intrinsic min-content size > cell width → cell width 沒法縮 → flex children w-full = content width → truncate 失效。

**H2**:`useOverflowCount` measurement 在 `useEffect` 內跑,**初始 paint 後 Avatar `<img>` 還沒 load**,measurement 取到的 tag width 偏窄(沒含 image),累加 count 偏大 → 後續 image load 觸發 ResizeObserver,但這時 count 已經 set 過 → 視覺先閃一次。**非確定性**:image 載入時機跟 network / cache 有關 → 同 cell 同 data,看 image load 速度決定 count 結果。

**H3**(M10 系統性):**所有 Field family edit/display trigger 都應該在 cell 上下文時 set `min-w-0` + `overflow-hidden`**,不只 PeoplePicker。Select / Combobox / DatePicker / TimePicker / Input / Textarea 在 cell-as-input 場景全部有同樣 risk。**Cell wrapper 該 own min-w-0 invariant**(對齊 AG Grid + MUI X DataGrid `cellRenderer` 共識:cell auto-wraps content with overflow-hidden)。

### 2.5 我尚不確定 / 已知 gap

- 是否有 audit script(playwright + computed style)可機械驗 cell `overflow-hidden`?
- `useOverflowCount` 真要等 font + image ready 還是有更早的 signal?
- 「placeholder 越界」具體是哪個 element 越界(trigger value text / dropdown menu width / 別的?)— image 不夠近距特寫
- DataTable cell 結構是 `<td>` / `<div role="cell">` / `<div>` plain?cell wrapper 是 `<div className="...">`?

---

## 3. 請你獨立解讀 user 原話

**不要被 §2 框架限制**(可能我 frame 錯)。請:

1. **獨立讀 user 原話**(verbatim §1)— 你對「placeholder 直接被截掉沒有變...」「placeholder 直接越界超出 cell」「overflow 偵測時機不一樣」的 first-principles 解讀是?

2. **獨立 root cause hypothesis**:
   - 不限於我列的 H1-H3。如果你看 user 原話覺得問題在別處,直接講
   - 特別注意 user 強調的「**之前就提過了**」「**root cause**」「**只是改冰山一角**」「**是否其他地方也有一樣的問題**」— 這暗示 M10 系統性 + 上游 invariant,不是 surgical 改一處

3. **最佳解 proposal**(per Step 4 cite-based propose):
   - 3-column:`spec.md path:line / 引文 / reasoning`
   - 若 root cause 在 Field family invariant(field-wrapper.tsx),改 SSOT 一處全 control 跟動

4. **你看到任何 Claude §2 沒看到的細節**:
   - file/line / 既有 hook / spec.md canonical / 世界級 reference(AG Grid / Material X-Grid / Ant Table / Notion DB)

---

## Constraints(per CLAUDE.md M1-M33)

- M22 cite source for any benchmark claim(GitHub URL / spec.md path)
- M23 DS 內既有 canonical 優先(grep `field-wrapper.tsx` / `item-anatomy.spec.md` / `field-controls.spec.md` 先)
- M10 fix root cause + 同類 DS-wide 全清(不只 PeoplePicker)
- M17 SSOT — 若 fix 是 `min-w-0` 之類,應住 fieldWrapperStyles base or 共用 cell wrapper
- 禁 pass-through commit — Claude 最終要 cite battle + synthesize
