<!-- Authority/status: governance/planning/registry.json -->
# DS i18n Refactor — 40 hardcoded CJK label locations

**Status**: ✅ **Shipped**(2026-04-24 Route A,commits `3e64129` + `b56d0f3`)
**Goal**: DS primitives 的內建 CJK 預設文案走系統化 i18n 路徑(prop override / provider / i18n lib),consumer 換語言時**零 fork DS**
**Executed scope**: Route A — 7 form primitives 加 prop override + 12 inline action 加 `// i18n-allow` 標記 + FileViewer labels object + hook v2 block-level 支援
**Future Route B trigger**(若要升級 i18n Provider): user 說「升級到 i18n Provider / DS 要發 npm package」

## 背景

2026-04-24 新加 i18n 稽核 hook(`.claude/hooks/check_hardcoded_strings.sh`)首跑掃出 **17 個 DS primitive .tsx 檔**含 hardcoded CJK user-facing strings,共 **40 個 location**。所有都是**現在 consumer 換語言要 fork DS** 的 pattern。

## Pattern 分類 + 預期 fix

### Pattern A — aria-label 在 DS 內部(consumer 無 prop 可 override)

內部 `<CollapsibleTrigger aria-label="展開或收合">` 等,consumer 無法從外面傳。建議 **加 `ariaLabels` prop(object)允許覆寫**,或接 i18n context。

| File | Line | Hardcoded | 建議 prop |
|------|------|-----------|----------|
| `Sidebar/sidebar.tsx` | 686 | `展開或收合` | `ariaLabels.toggleGroup` |
| `Notice/notice.tsx` | 120 | `關閉通知` | 已有 `onDismiss`,加 `dismissAriaLabel` prop |
| `Calendar/calendar.tsx` | 219, 230, 246 | `上個月` / `下個月` / `檢視切換` | `ariaLabels.{prev,next,viewToggle}` |
| `Carousel/carousel.tsx` | 249, 282 | `上一張` / `下一張` | `ariaLabels.{prev,next}` |
| `Breadcrumb/breadcrumb.tsx` | 231 | `顯示折疊路徑` | `ariaLabels.showCollapsed` |
| `Combobox/combobox.tsx` | 307 | `搜尋選項` | `searchAriaLabel` prop |
| `FileViewer/file-viewer.tsx` | 211, 227, 360, 370, 385, 437, 455, 563, 860, 888 | `縮放比例` / `開啟縮放選單` / `收合詳細資訊面板` / `展開詳細資訊面板` / `下載檔案` / `關閉檢視器` / `檔案詳細資訊` / `關閉詳細資訊` / `檔案佇列` / `上一個檔案` / `下一個檔案` | `ariaLabels` object prop(10 keys) |

### Pattern B — default prop value(consumer 已可 override,只差 rationale 標記)

這類 prop 本來就是為了 override 而存在,consumer 換語言傳 prop 即可。**最小 fix**:加 `// i18n-allow: {default;consumer override via prop name}` 行尾標記,或維持現狀(consumer 責任)。

| File | Line | Hardcoded | Prop 名 |
|------|------|-----------|--------|
| `PeoplePicker/people-picker.tsx` | 56, 57 | `搜尋人員…` / `沒有符合的人員` | `searchPlaceholder` / `emptyText` |
| `DataTable/data-table.tsx` | 359 | `沒有資料` | `emptyState` |
| `FileUpload/file-upload.tsx` | 68 | `上傳中…` | `loadingTitle` |
| `SelectMenu/select-menu.tsx` | 118 | `沒有符合的選項` | `emptyText` |
| `Coachmark/coachmark.tsx` | 121 | `知道了` | `doneLabel` |
| `horizontal-overflow/horizontal-overflow.tsx` | 147 | `向左捲動` / `向右捲動` | `ariaLabel` prop |

### Pattern C — inline action 預設 label(consumer 可整個 `action` prop 覆寫)

這類是 DS 內部給的預設 `action` config,consumer 可整個覆寫。**最小 fix**:加 `// i18n-allow: default action; consumer override via action prop` 標記。

| File | Line | Hardcoded |
|------|------|-----------|
| `Select/select.tsx` | 130, 200 | `清除選取` |
| `Combobox/combobox.tsx` | 240, 322 | `清除全部` |
| `TimePicker/time-picker.tsx` | 390 | `清除時間` |
| `DatePicker/date-picker.tsx` | 164, 309 | `清除日期` / `清除日期區間` |
| `LinkInput/link-input.tsx` | 178 | `編輯連結` |

### Pattern D — preset map values(DS-internal,非 user 直接看但可能走 aria-label)

| File | Line | Hardcoded |
|------|------|-----------|
| `Coachmark/coachmark.tsx` | 101, 102 | `使用技巧` / `新功能介紹` |

### Pattern E — hardcoded UI text(JSX text node,無 prop override 管道)

這類是最嚴重的 —— 完全沒 prop 可傳,需新增 prop 或 i18n infra。

| File | Line | Hardcoded |
|------|------|-----------|
| `FileViewer/file-viewer.tsx` | 446 | `<h3>詳細資訊</h3>` |
| `FileViewer/file-viewer.tsx` | 476 | `placeholder="為這個檔案加上說明…"` / `"尚無說明"` |
| `FileViewer/file-viewer.tsx` | 489 | `<span>檔案資訊</span>` |

## 執行策略

**選 A — 最小 viable(1 天)**:
- Pattern B + C + D:一律加 `// i18n-allow: {rationale}` 行尾標記,hook 自動跳過
- Pattern A + E:開 new PR 加 `ariaLabels` prop / `labels` prop,consumer 逐步 adopt
- 加 CLAUDE.md `# Internationalization` 節附「DS i18n labels convention」

**選 B — 完整 i18n infra(2-3 天)**:
- 建 `<I18nProvider>` pattern(DS 內部 `useI18n()` hook + fallback chain)
- 所有 Pattern A-E 走 hook
- 加 stories 驗多語切換
- 對齊 react-intl / lingui / vue-i18n 等世界級

## 相關 commit(meta history)

- `31482b1`(2026-04-24)新 hook + Dim 26 + Phase 5 五態,首跑發現本清單
- 本 planning doc 成為該 findings 的 permanent home(pre memory 快取消失)
