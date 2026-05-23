# .claude/rules/ Charter

## 這裡只收:path-scoped 規則(編特定 file 才 load,降 every-session context cost)

每條 rule 一個 `.md` file,內含:
- frontmatter `paths:` glob(`**/*.spec.md` / `**/*.tsx` 等)— Claude Code 自動只在編該 path 時 inject 進 context
- body — 該 file family 的設計 / 撰寫 / 命名 / 紀律規則

**核心特徵**:**只在編對應 file 才載入**(不像 CLAUDE.md 每 session 載入)。對齊 Anthropic 2026 推薦 path-scoped CLAUDE.md fragment pattern。

## 當前居民

| Rule | Paths | Scope |
|------|-------|-------|
| [meta-patterns.md](meta-patterns.md) | always(fundamental)| 31 active M-rules(M1-M32,M27/M33/M34/M35 retired)|
| [spec-rules.md](spec-rules.md) | `**/*.spec.md` + `packages/design-system/src/**` | Spec 撰寫紀律 + SSOT / 邊界案例 / 職責分離 |
| [ui-development.md](ui-development.md) | `**/*.tsx` + `**/*.ts` | 建 UI 前必讀 / Tailwind 5 條 / Token 4 條 / Props 命名 / shadcn |
| [story-rules.md](story-rules.md) | `**/*.stories.tsx` | 三層 stories canonical + Title / 範例 / 撰寫紀律 |
| [self-verify.md](self-verify.md) | `src/**` + `.claude/**` + `*.spec.md` + `*.tsx` + `*.css` | 4 階段(Pre/Mid/Post/Pre-commit)自主驗證 routine(2026-05-17 codify M10/M11/M20/M32 散在 meta-patterns 之 SSOT)|

## 跟 CLAUDE.md 分工

| | CLAUDE.md | .claude/rules/ |
|---|---|---|
| 載入時機 | 每 session start 載入(行數預算 ≤ 200)| 編對應 path file 才載入(降 context cost)|
| 內容 | 6 mindset + 治理 / 稽核 / SSOT canonical / 任務導航 / fundamental rules | 該 file family 細節規則(spec 撰寫 / UI 開發 / story / self-verify)|

## 新增 rule 流程

1. **過 3 題**(per CLAUDE.md `# 治理 canonical`)— 既有 rule cover?Rule-of-3?7 天後還 fire 嗎?
2. **檔名**:`<topic>.md`(kebab-case),內含 frontmatter
3. **paths frontmatter**:glob 該 rule 該 load 的 path
4. **加進本 README.md 表格**
5. **MEMORY.md / CLAUDE.md 補 pointer**(若 cross-reference)
