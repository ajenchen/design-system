# Design System Home

本資料夾是 design system 的原始碼 + 設計規格 SSOT。

## 子資料夾 charter(建立新檔案前必讀對應子 dir 的 README)

| 子 dir | 收什麼 | 不收什麼 | Charter |
|--------|-------|---------|---------|
| `tokens/` | CSS 變數定義 + token spec + token stories | 元件 code、文件撰寫指南 | `tokens/README.md` |
| `components/` | 每個元件一個 PascalCase folder(內含 tsx / spec / stories) | 平坦 `.md` 檔、cross-cutting rule | `components/README.md` |
| `patterns/` | runtime UI 佈局 / 互動 primitive(.tsx + .spec.md),多元件 consume | 文件撰寫指南、governance meta rule、taxonomy | `patterns/README.md` |
| `hooks/` | React hooks(跨 DS 元件共用的 `use-*.ts`) | Claude Code hooks(那屬 `.claude/hooks/`) | N/A |
| `stories-helpers/` | Storybook 共用 helper(非 runtime,僅 `.stories.tsx` / `.anatomy.stories.tsx` 消費的 anatomy 排版 util 等) | 任何 runtime consume(應用 / 元件 / pattern code 不得 import);runtime primitive 應住 `patterns/` | N/A |

## 本層級(`packages/design-system/src/` 根)只收 `README.md`

所有 DS 內容必屬於某個子 dir(tokens / components / patterns / hooks / stories-helpers)。即使跨 pattern 的 taxonomy(如 4-Family Model)也住在最相關的 pattern topic 資料夾內(`patterns/element-anatomy/element-anatomy.spec.md`)—— 這樣 folder = topic home,不需要頂層 flat 檔案。

若未來真有 scope 橫跨 3+ 子 dir 且不屬任一 topic 的純 meta doc,才重新評估是否加頂層檔(屆時更新本 charter)。

## 不屬於本資料夾的 DS 相關內容

| 內容類型 | 實際位置 |
|---------|---------|
| AI 工作流 / workflow guide(寫 story / 做 prototype / audit) | `packages/design-system/ds-canonical/skills/<skill>/` |
| AI 每 session 需要的 signal rule | `CLAUDE.md` |
| AI session 狀態(audit progress / tech debt) | `~/.claude/projects/.../memory/` |
| Tool-level 機械檢查 | `.claude/hooks/` |

## 建立新檔案決策

不確定檔案放這裡還是別處 → **先 Read 該目標 dir 的 README.md 再 Write**。這是 CLAUDE.md 的硬規則。
