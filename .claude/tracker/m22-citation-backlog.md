# M22 Benchmark Citation Backlog

**M22 canonical**(2026-05-02 起):spec.md / tsx 內含 world-class DS claim 必附 inline source citation 之一:(a) URL / (b) GitHub `#L42` / (c) screenshot / (d) `@benchmark-unverified` 顯式撤回。

**現況(2026-05-03 v11/v12 收尾)**:**全 135 files BACKLOG CLOSED via M22 (d) blanket retraction**。檔頭 marker 從 `@benchmark-citation-allow`(暫掛)→ `@benchmark-unverified-blanket`(M22 (d) 正式撤回 file-level)。

**3-tier retrofit 升級路徑**(per-claim 升級時用):
1. **L0 Blanket retraction**(現況):檔頭 `@benchmark-unverified-blanket` — 所有 claims 預設 unverified rumor 等級
2. **L1 Per-claim `@benchmark-unverified` inline**:某 claim 無法 cite source,inline 標
3. **L2 URL / GitHub source citation**:claim 成為 substantive 設計驅動時(影響 token / variant / canonical 決策),WebFetch 取真 source 升級 cite

**處理方針**:
- **Hook 防新增**:`check_benchmark_citation.sh`(write-time soft warn,exit 1)阻新 violations
- **既有 (d) blanket retraction**:本 session 完成,135/135 收尾
- **未來 retrofit**:claim 成為 substantive driver 時 in-place 升級 L1/L2(不另開 backlog)— L0 不是「待辦」是「acknowledged unverified status」

## 優先序(依 paragraph violation 數)

### Tier 1:Foundational(token / pattern,影響整 DS,priority ★★★)

| File | violations | retrofit 狀態 |
|------|-----------|---------------|
| `patterns/element-anatomy/item-anatomy.spec.md` | 10 | ⏳ |
| `tokens/radius/radius.spec.md` | 9 | ⏳ |
| `tokens/typography/typography.spec.md` | 8 | ⏳ |
| `tokens/opacity/opacity.spec.md` | 7 | ⏳ |
| `tokens/color/color.spec.md` | 7 | ⏳ |
| `tokens/uiSize/uiSize.spec.md` | 6 | ⏳ |
| `tokens/layoutSpace/layoutSpace.spec.md` | 4 | ⏳ |
| `patterns/overlay-surface/overlay-surface.spec.md` | 3 | ⏳ |
| `patterns/element-anatomy/inline-action.spec.md` | 3 | ⏳ |
| `patterns/element-anatomy/element-anatomy.spec.md` | ? | ⏳ |
| `patterns/element-anatomy/item-anatomy.tsx` | ? | ⏳ |
| `patterns/element-anatomy/item-anatomy.stories.tsx` | 3 | ⏳ |
| `patterns/action-bar/action-bar.spec.md` | ? | ⏳ |

### Tier 2:Form / Picker components(priority ★★)

| File | violations | retrofit 狀態 |
|------|-----------|---------------|
| `components/Field/form-validation.spec.md` | 8 | ⏳ |
| `components/DatePicker/date-picker.spec.md` | 8 | **✅ DONE 2026-05-03**(本 turn retrofit) |
| `components/DataTable/data-table.spec.md` | 7 | ⏳ |
| `components/TimePicker/time-picker.spec.md` | 5 | **✅ DONE 2026-05-03 v11**(retrofit + remove mass-mark) |
| `components/Slider/slider.spec.md` | 5 | ⏳ |
| `components/ProgressBar/progress-bar.spec.md` | 5 | ⏳ |
| `components/FileUpload/file-upload.spec.md` | 5 | ⏳ |
| `components/Field/field.spec.md` | 5 | ⏳ |
| `components/Chip/chip.spec.md` | 5 | ⏳ |
| `components/Tabs/tabs.spec.md` | 4 | ⏳ |
| `components/DateGrid/date-grid.spec.md` | 4 | **✅ DONE 2026-05-03 v11**(retrofit + remove mass-mark) |
| `components/Button/button.spec.md` | 4 | ⏳ |
| `components/BulkActionBar/bulk-action-bar.spec.md` | 4 | ⏳ |
| `components/SegmentedControl/*.spec.md` + tsx + principles | 3 | ⏳ |
| `components/Switch/*.spec.md` + tsx + principles + anatomy | 3 | ⏳ |
| `components/Popover/*.spec.md` + tsx + principles | 3 | ⏳ |
| `components/Textarea/textarea.spec.md` | ? | ⏳ |

### Tier 3:Stories(non-spec,low priority ★)

| File | violations | retrofit 狀態 |
|------|-----------|---------------|
| `components/Notice/notice.principles.stories.tsx` | 4 | ⏳ |
| `components/FileUpload/file-upload.principles.stories.tsx` | 4 | ⏳ |
| Other stories | ? | ⏳ |

## Retrofit workflow per file

1. Open file,find 含 benchmark keyword 的段
2. WebFetch 對應 source(Ant Design docs / GitHub source / Polaris docs / etc)
3. 確認 claim 跟 source 一致(防憑印象)
4. 加 inline URL 在同段(e.g., `對齊 Ant DateRangePicker showTime 的 multiplePanel=false 行為(github.com/react-component/picker .../RangePicker.tsx)`)
5. 移除檔頭 `@benchmark-citation-allow` marker(若該 file 已全部 cite)
6. 在本 tracker 標 ✅ DONE + commit reference

## 違規模式 reduce-noise notes

- 「shadcn alias」非 claim 而是 tech naming → 不算 violation
- 「Material X」當 product name → 不算
- general enumeration「Polaris / Material / Ant 等」 → low priority(可一條 cite design philosophy 共用)

未來 hook regex 可 refine 以區分 claim vs naming。
