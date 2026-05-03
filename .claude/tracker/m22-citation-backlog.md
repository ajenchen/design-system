# M22 Benchmark Citation Backlog

**M22 canonical**(2026-05-02 起):spec.md / tsx 內含 world-class DS claim(Ant Design / Material X / Polaris / Atlassian / Carbon / shadcn / Radix UI / React Aria / Apple HIG / Notion / Airtable / ClickUp / Figma / Linear)必附 inline source citation:
- Inline URL(對應 DS 官網 / GitHub source)
- GitHub source path + line ref `#L42`
- Screenshot reference `snapshots/...`
- Marked `@benchmark-unverified`(顯式撤回)

**現況(2026-05-03 audit)**:既有 40+ files 違反 M22(pre-existing,在 hook 上線前已存在)。

**處理方針**:
- **Hook 防新增**:`check_benchmark_citation.sh`(write-time soft warn,exit 1)阻新 violations
- **既有 mass-mark**:加檔頭 `@benchmark-citation-allow: tracker .claude/tracker/m22-citation-backlog.md` header → hook 不擋 + 留 backlog
- **Real retrofit**:每 session 攻 1-3 file,WebFetch 取真 source,加 inline URL,然後從本 backlog 移除 + 從檔頭移除 `@benchmark-citation-allow` marker

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
| `components/TimePicker/time-picker.spec.md` | 5 | ⏳ |
| `components/Slider/slider.spec.md` | 5 | ⏳ |
| `components/ProgressBar/progress-bar.spec.md` | 5 | ⏳ |
| `components/FileUpload/file-upload.spec.md` | 5 | ⏳ |
| `components/Field/field.spec.md` | 5 | ⏳ |
| `components/Chip/chip.spec.md` | 5 | ⏳ |
| `components/Tabs/tabs.spec.md` | 4 | ⏳ |
| `components/DateGrid/date-grid.spec.md` | 4 | ⏳ |
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
