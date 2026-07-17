# components/ Charter

## 這裡只收:元件家族的 folder

每個元件家族一個 PascalCase folder,內含:
- `{name}.tsx` — 元件本體
- `{name}.spec.md` — 設計原則
- `{name}.stories.tsx` — 展示
- `{name}.anatomy.stories.tsx` — 設計規格
- `{name}.principles.stories.tsx` — 設計原則 stories
- 子檔案視元件需要(`{name}-context.ts` / `{name}-types.ts` 等)

**folder 名**: PascalCase(`Button/` / `DatePicker/`)
**file 名**: kebab-case(`button.tsx` / `date-picker.tsx`)

## Compound component family(多元件 + 共享規則)

部分 folder 是**元件家族 home**,houses 多個緊耦合 primitive + 共享規則 spec。對齊 Ant Design `Checkbox.Group` / Mantine `Checkbox.Group` / Chakra compound pattern 世界級慣例:tightly coupled primitives 同資料夾而非拆分。

現有 compound folders:
- `Field/` — `field.tsx` + `field-wrapper.tsx` + `field-context.ts` + `field-types.ts` + `field-controls.spec.md`(跨 form 元件共享 mode/disabled/readonly 規則)+ `form-validation.spec.md`(表單驗證跨 primitive 規則,**無 Layout Family — behavior spec 非元件**)
- `Checkbox/` — `checkbox.tsx` + `checkbox-group.tsx`(2026-04-21 CheckboxGroup merge 自 separate folder,對齊 standalone + group 世界級慣例)+ `boolean-display.tsx`(table cell 顯示)
- `Menu/` — `menu-item.tsx`(家族預留位)
- `SelectionControl/` — `selection-item.tsx`(Checkbox/Radio 共享的 row layout primitive home)
- `PeoplePicker/` — `people-picker.tsx` + `person-display.tsx`(`PersonDisplay` / `MultiPersonDisplay` / `PersonAvatarTag`)+ `avatar-stack-overflow.ts` + `people-picker-helpers.ts`。**compound rationale**:全部共享 `PersonValue` 資料模型 + avatar 視覺規則,且 picker↔display 雙向消費(edit 選人 / view 渲染已選)。`PersonDisplay` 為**唯一現存 cross-component view primitive**(可脫離 picker 用於 DataTable cell / detail panel,見 `Field/field-controls.spec.md`「唯一現存 cross-component view primitive」),經 `PeoplePicker` root barrel + subpath 一併公開——與 `Checkbox/boolean-display.tsx`(table-cell 顯示 co-located)同型共居先例

**判斷 compound vs 單獨 folder**:
- 元件能**獨立 lifecycle / 獨立使用** → 各自獨立 folder(Button / Input / Select)
- 元件**同家族共享 context / 命名 / 規則** → compound folder(Field / Checkbox / Menu)
- 新元件若模糊,先問「能不能不依賴同家族其他元件獨立使用」— 能 → 獨立 folder;不能 → compound family

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 平坦 `.md` 檔(`components/foo.md`) | Skill / CLAUDE.md / spec | 本 dir 慣例是 PascalCase folder,平坦 md 破壞結構 |
| 跨元件共用的 checklist | `.claude/skills/component-quality-gate/` | 是 invoke-time workflow |
| 跨元件 runtime primitive | `../patterns/` | 本 dir 是單元件,跨元件去 patterns |
| 命名規則 / Props 命名慣例 | `CLAUDE.md` | 每 session signal |

## 新元件進來的條件

進 `components/` 前:
1. 走 `.claude/skills/component-quality-gate/`(完整 checklist)
2. 聲明 Layout Family(第一段 spec 必含,見 `patterns/element-anatomy/element-anatomy.spec.md`「4-Family Model Taxonomy」)
3. 對標至少 2 個世界級 DS 的相似元件
4. spec 第一段寫明實作基礎(Radix X / cmdk / native / 自建+理由)

## Internal primitive vs Public 元件

兩類都住同一個 folder,差別在:
- **Public**(Components/):有預設視覺,consumer 直接 `<X>` 就能用 — Storybook title `Design System/Components/{Name}`
- **Internal primitive**(Internal/):無預設視覺,必被 wrapper 元件包 — Storybook title `Design System/Internal/{Name}`

判斷 test 見 `.claude/rules/story-rules.md` → 「Internal vs Components 三 test」。

## 建立前必 Read

本 README + 該元件所在 pattern spec(若屬 Family) + `.claude/rules/ui-development.md`「元件 Props 命名」 + `.claude/skills/component-quality-gate/`。
