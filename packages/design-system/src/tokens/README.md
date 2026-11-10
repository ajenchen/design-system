# tokens/ Charter

> **分類原則**(三類 / 三題 / 三條規則)→ `token-system.spec.md`。**分類資料**(每個名字屬於哪一類、主人、住處、說明它的規格、產品與設計系統誰可以讀)→ `token-registry.json`,唯一一份、給機器讀,`scripts/token-creation-invariant.mjs` 在 CI 拿它驗每一次改動。本 README 只是資料夾地圖,**不列「哪顆是公開 / 內部」的表**(2026-11-11:舊表與 `token-system.spec.md` 對 194 顆說法相反,GitHub issue #171)。

## 這裡只收:design token 定義 + spec + stories

每個 token 類別一個 folder:
- `{name}.css` — CSS custom properties 定義
- `{name}.spec.md` — 這一組刻度的值與理由
- `{name}.stories.tsx` — token 展示(色票 / 字級 / 尺寸對照)
- 原料與語意色分檔(`color/primitives.css` + `color/semantic.css`)

**folder 名規則**:單字 → lowercase(`color/` / `radius/` / `typography/`);多字 → camelCase(`uiSize/` / `layoutSpace/`)。

## 當前居民

有樣式檔的:`color/` / `typography/` / `uiSize/` / `layoutSpace/` / `radius/` / `opacity/` / `motion/`(對外彙總檔 `styles/tokens.css` 依這個順序匯入)。

只有規格與展示頁、沒有樣式檔的:`density/`(密度切換的說明;值住各刻度自己的檔)、`elevation/`(陰影值住 `color/primitives.css`,理由見 `token-system.spec.md`「擺放」)。

例外居民:`categorical-color.ts` 住 tokens/ 根層 — `CATEGORICAL_HUES` 的 TypeScript SSOT,由 `color/color.spec.md` 指認(Tag / Avatar / 月曆事件的分類色相)。`token-registry.json` 住 tokens/ 根層 — 分類表。

## 誰可以讀

看 `token-registry.json` 該列的 `product`(產品:不可讀 / 可讀來對齊 / 可讀也可覆寫)與 `dsReaders`(設計系統哪些資料夾可以讀)。各類別的預設值與理由在 `token-system.spec.md`「誰可以讀」。產品要**設定**元件尺寸走元件參數,不覆寫 token。

## 這裡**不收**(反例)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 元件消費 token 的 code | `../components/{Name}/` | token 被 consume,不在 token home 寫 consumer |
| 元件自己的值(拿掉那個元件就沒意義的) | 主人元件資料夾的樣式檔(`token-system.spec.md` 規則 1) | 住處 = 主人;還寄住在 `uiSize/` 的(分類表 `home` ≠ `target` 的列)依 `target` 分批搬,進度見 `token-system.spec.md`「現況與目標不一致的地方」 |
| 只有展示頁用的值 | `stories-helpers/` | 不開 token(`token-system.spec.md` 第 0 題) |
| cross-cutting design rule(如「何時用 semantic token vs primitive」)| `packages/design-system/ds-canonical/rules/ui-development.md`「Token 命名 4 條硬規則」 | 系統級 rule,不只關某個 token |
| shadcn compat alias 遷移規則 | `packages/design-system/ds-canonical/rules/ui-development.md`「Tailwind 5 條核心」 | 技術陷阱屬 UI 開發 |

## 建立前必 Read

`token-system.spec.md`(判斷流程三題 + 新增時要做的事)+ `packages/design-system/ds-canonical/rules/ui-development.md`「Token 命名 4 條硬規則」+ 對應 family 的 spec(如 `color/color.spec.md`)。
