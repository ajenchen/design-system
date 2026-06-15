# 命名與語言一致性 — 詳表

CLAUDE.md `# 命名與語言一致性` 詳細展開。主章留 meta rule + 三重 test,本檔放完整對照表 + 禁止清單。

## 檔案 / 資料夾

| 類別 | 慣例 | 範例 |
|------|------|------|
| 元件資料夾 | PascalCase | `Button/`、`DatePicker/`、`NumberInput/` |
| 元件檔案 | kebab-case | `button.tsx`、`date-picker.tsx`、`number-input.tsx` |
| Pattern 資料夾 | kebab-case | `item-anatomy/`、`action-bar/`、`horizontal-overflow/` |
| Pattern spec 檔 | kebab-case(與資料夾同名) | `item-anatomy.spec.md`、`action-bar.spec.md` |
| Pattern 內多檔 flat 並列 | folder 為 topic 領域,含 overview + 具體 topic 各自檔案 | `element-anatomy/` folder 內 flat 放 `element-anatomy.spec.md`(taxonomy overview)+ `item-anatomy.spec.md / .tsx / .stories.tsx`(F1/F2 具體) |
| Demo / non-export helper 檔 | `_` prefix + kebab-case;不進 index.ts barrel / 不 export 給 consumer,只供同資料夾 stories / anatomy 消費(2026-06-12 codify)| `AppShell/_demo-helpers.tsx` |
| Hooks 資料夾 | lowercase | `hooks/` |
| Hooks 檔案 | kebab-case(對齊 shadcn) | `use-is-mobile.ts`、`use-overflow-items.ts` |
| Token 資料夾 | 單字 lowercase / 多字 camelCase | `color/`、`radius/`;`uiSize/`、`layoutSpace/` |
| Token 檔案 | 與資料夾同名 | `color.css`、`uiSize.css`、`layoutSpace.spec.md` |

**分類原因**:
- 元件 PascalCase folder + kebab-case file 是 shadcn / Chakra / Ant Design 共通做法
- Hooks 對齊 shadcn 的 kebab-case
- Token 資料夾沿用 CSS `--token-name` 多字構詞風格

## 程式 identifier

| 類別 | 慣例 | 範例 |
|------|------|------|
| React 元件 / TypeScript type | PascalCase | `MenuItem`、`ItemIcon`、`ItemIconProps` |
| 函式 / hook / 本地變數 | camelCase | `useOverflow`、`itemCount` |
| CSS custom property | kebab-case | `--field-height-md`、`--ui-size-24` |
| Tailwind class | 既有 utility 優先;自訂 kebab-case | `text-body-lg` |

## 文件內容

| 類別 | 慣例 | 範例 |
|------|------|------|
| Spec 章節標題 | 繁體中文(約定俗成英文術語例外) | 「何時用」、「禁止事項」;例外:Props / API / Token / CSS |
| Spec H1 標題 | `# {元件名} 設計原則` | `# Button 設計原則` |
| Story 標題 path | `Design System/Components/{ComponentName}/{中文子頁}` | `Design System/Components/Button/設計原則` |
| Story 變數名 | `{Concept}Rule`(principles)/ 簡短名詞(showcase) | `VariantRule`、`Modes` |

## 語言一致性

- **spec.md 原則繁體中文**(技術術語保留英文,見命名表例外)
- **Code identifier 一律英文**
- **單一檔案內註解統一語言** — 不中英夾雜
- **同一段落不跨語言** — 「Rule A」「判斷法 A」擇一

## 禁止事項

- ❌ 憑直覺命名 — 必先 `ls` / `grep` 既有 pattern
- ❌ 為突顯新功能用非常規命名 — 新元件名對齊既有家族
- ❌ 檔案內註解中英夾雜
- ❌ 複合詞用底線 / PascalCase 命檔(`ItemAnatomy.spec.md` 錯,`item-anatomy.spec.md` 對)
- ❌ 自創 spec 章節標題格式(既有用「何時用」就不要另寫「When to use」)
- ❌ 對新元件用新的 suffix(既有都是 `.tsx` / `.spec.md` / `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx`,不自創如 `.design.md` / `.tokens.tsx`)
