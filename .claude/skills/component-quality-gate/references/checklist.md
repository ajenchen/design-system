# 元件完成 Checklist(完整 35 項)

每個元件在進入 design-system 前必須逐項對照。這是品質閘門,不可跳過。

**本 checklist 是純勾選表**——規則定義在各自的 canonical home,此處只做 checkbox + pointer。勾每項前先讀該 pointer 指向的章節。

---

## Phase 1 — Spec(`{name}.spec.md`)
> 規則定義:`.claude/rules/spec-rules.md`

- [ ] 元件定位一句話(是什麼 / 不是什麼)
- [ ] 定位段落宣告實作基礎(基於 Radix X / cmdk / sonner / native / 自建 + 理由)
- [ ] 每個 prop / variant / size / state 都有「何時用 / 何時不用」+ 理由
- [ ] 互斥規則列出(哪些 props 不能並用)
- [ ] 每個規則有「為什麼」(寫 rationale,不只結論)
- [ ] 術語一致(同一概念不用兩種名稱)
- [ ] 無視覺描述污染(「窄長形」「會變寬」等屬 story 不屬 spec)
- [ ] 禁止事項(❌)列出常見誤用
- [ ] 邊界案例覆蓋(disabled / loading / empty / dark mode / density / icon-only 適用時)
- [ ] 「相關」section 指向近親元件 + SSOT pointer(reciprocal 成立)
- [ ] 對標世界級 DS 的 7 個維度(何時用 / 分界 / 常見誤解 / 相關 / 空值 / 驗證時機 / a11y)
- [ ] Layout Family 宣告(第一段必含——1/2/3/4 或「非 family,自己的結構」)

---

## Phase 2 — Code(`{name}.tsx`)
> 規則定義:`.claude/rules/ui-development.md`(含「shadcn 元件規範」/「Tailwind 5 條核心」/「Token 命名 4 條硬規則」/「元件 Props 命名」)

- [ ] 以 shadcn 為基底,forwardRef / displayName / asChild / ...props spread 齊全
- [ ] variants 用 cva(),不條件拼字串(或 documented 例外:style-prop variant → object map / 結構性 variant → if-branches)
- [ ] 同時 export 元件本體 + cva(供外部組合)
- [ ] 保留 Radix `data-state` / `data-disabled` / `data-orientation` 等 attribute
- [ ] 樣式優先用 `data-*` selector,而非自訂 class 模擬狀態
- [ ] 無硬寫顏色 / 字體 / padding / radius / 高度——全用 design token
- [ ] `cn()` 合併 class;Tailwind v4 CSS var 必用 `var(...)` 包覆
- [ ] 未包 Provider(Tooltip / Theme / Toast 等由應用層設定)
- [ ] Props 命名按「是什麼」而非「在哪裡」(icon / avatar / onDismiss,不 prefix / suffix)
- [ ] 互動元素有 ARIA 屬性;icon-only 有 `aria-label`
- [ ] 若屬 field-height family,`defaultVariants.size = 'md'`
- [ ] 若修改 cva `defaultVariants`,已同步 spec / docblock / anatomy 三方(見 `.claude/skills/story-writing/references/anatomy-standard.md` → 高風險漂移點)
- [ ] 未使用 shadcn compat alias(`bg-popover` / `text-muted-foreground` / `bg-accent` 等),改用我們的 direct token

---

## Phase 3 — Stories(展示 / 設計規格 / 設計原則)
> 規則定義:`.claude/skills/story-writing/`(完整 workflow) + `.claude/rules/story-rules.md`(high-level)

- [ ] 範例選擇原則的自我檢查清單全部打勾(詳見 `.claude/skills/story-writing/references/self-check.md`)
- [ ] 設計規格 5 個 story 齊全(總覽 / 檢閱器 / 色彩對照 / 尺寸對照 / 狀態行為)
- [ ] TOKEN_MAP / SIZE_SPECS 資料與 cva() 定義完全一致
- [ ] Rule note 傳達原則(「為什麼」),不只結論(「是什麼」)
- [ ] Storybook title 對齊命名規則;元件放對 `Components/` vs `Internal/`(見 `.claude/rules/story-rules.md` → 「Internal vs Components 三 test」)
- [ ] 每個重要規則有正確範例;常見誤用有錯誤範例(對比呈現)

---

## Phase 4 — Ship(上線前)

- [ ] `npm run storybook` 本地確認所有 stories 正常渲染
- [ ] `npx tsc -b` 無錯(**禁 `--noEmit`**,root tsconfig `files: []` silent pass;型別 surface 改動加跑 `npm run build:lib`,對齊 `.claude/rules/self-verify.md` Post-edit)
- [ ] Import 路徑正確(`@/design-system/...`)
- [ ] 若為 internal primitive 或 shadcn passthrough,分類標註正確

---

## 簽結報告格式

```
元件 {Name} Quality Gate 結果:
- Phase 1 Spec: 12/12 ✓
- Phase 2 Code: 13/13 ✓  (cva defaultVariants = 'sm',已同步 spec+docblock+anatomy)
- Phase 3 Stories: 6/6 ✓
- Phase 4 Ship: 4/4 ✓
Total: 35/35 ✓

Documented 例外:
- (無 / 或列出元件 spec 明文允許的偏離 + 理由)
```
