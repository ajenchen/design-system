<!-- @benchmark-cited: D5 retrofit 2026-05-18 — verified 0 world-class DS claim in body; blanket retract removed. -->

# Typography 設計原則

Typography 定義字體尺寸與行高的 token 系統，確保全系統文字層級一致。

## 設計原則

Typography 由三個獨立維度組成，分開疊加：

| 維度 | 控制方式 | 說明 |
|------|---------|------|
| font-size | `text-{role}` utility | token 決定，不可繞過 |
| line-height | 烤進 token，需要時覆蓋 | heading / supplementary → 1.3；body → 1.5 |
| font-weight | `font-normal` / `font-medium` / `font-bold` | 使用端疊加，不寫死在 token |

**line-height 的選擇基於「是否適合多行閱讀」：**
- `1.5`：適合連續閱讀的段落（14px / 16px）
- `1.3`：標題、短文字、截斷場景、不需要閱讀行距
- 12px 以下不適合作為連續閱讀內文，一律 1.3

**font-weight 等同 `<strong>` 的疊加邏輯：**
- 不加 = 400，一般文字
- `font-medium` = 500，行內中等強調
- `font-bold` = 700，強調（等同 `<strong>`）。**以上三階是元件與產品範例的全部字重**;`font-semibold`(600)只用在文件外框的標題 —— 教學頁的段落標題與規則標題(`stories-helpers/examples/tutorial-page.tsx`):來源 user 2026-10-07「第一題照你建議」,採 AI 同日建議 ②「段落標題 text-h3 半粗體 + 淺分隔線、只用在教學頁」(`ds-canonical/skills/story-writing/references/category-templates.md`「教學框的間距與標題」);設計規格頁的小標(`stories-helpers/anatomy/anatomy-utils.tsx` `H3`;main `ec7466f5` 是 `font-bold`)與展示頁畫布上的分組小標(main 只有 4 處:Avatar 3、item-anatomy 1)改成 600,是本 PR `7ec9cb61`(2026-10-07 AI 全 DS 範例掃除)改的;user 2026-10-27 回「Q2照你建議」—— 採 AI 建議 ③ 維持 600(題目:設計規格頁小標與展示頁分組小標要不要跟教學頁一樣用 600),定案。元件、pattern、token 原始碼不得出現 `font-semibold`(閘 `scripts/owner-claims-invariant.mjs` C4;r1b OTH-06)


## Token 表

| Utility        | font-size | line-height | 用途 |
|----------------|-----------|-------------|------|
| `text-h1`      | 48px      | 1.3         | 頁面主標題 |
| `text-h2`      | 32px      | 1.3         | 區塊標題 |
| `text-h3`      | 24px      | 1.3         | 子區塊標題 |
| `text-h4`      | 20px      | 1.3         | 小節標題 |
| `text-h5`      | 16px      | 1.3         | 元件層級標題 |
| `text-h6`      | 14px      | 1.3         | 最小層級標題 |
| `text-body-lg` | 16px      | 1.5         | 16px 為主版面的段落內文 |
| `text-body`    | 14px      | 1.5         | ★ 主要內文基準 |
| `text-caption` | 12px      | 1.3         | 圖表附註、標籤文字、元件內次要說明 |
| `text-footnote`| 10px      | 1.3         | 法律文字、來源標注（極少用）|

> **10px a11y 用途限制**（2026-07-17）：`text-footnote` 僅限**非必要的附帶資訊**（法律細字、來源標注、storybook 註解）——目前全庫零正式元件消費，只用於 stories `<p>` 註解。**使用者需理解才能操作的資訊禁止只靠 10px**；任何 ≤12px 用途上線前須驗 200% 放大（WCAG 1.4.4）不裁切。視覺標題 ≠ 語義標題（一律用 `h1–h6`，WCAG 1.3.1）。

**h5（16px）vs body-lg（16px）/ h6（14px）vs body（14px）**：同尺寸配對的統一判別法——line-height 區分角色（標題 1.3 / 段落 1.5），使用端再疊 font-weight / color 強化標題層級，需有意識地選擇（詳「同尺寸但不同角色的選法」）。


## line-height 覆蓋（僅 14/16px body 可覆蓋）

**Token canonical**：除 `text-body`（14px）/ `text-body-lg`（16px）外，**所有 size 行高皆固定**：
- `text-h1`–`text-h6`：全部 lh 1.3 固定（標題不需多行閱讀行距）
- `text-caption`（12px）/ `text-footnote`（10px）：全部 lh 1.3 固定（小字不適合 1.5）
- `text-body` / `text-body-lg`：**唯二**可覆蓋（預設 lh 1.5 閱讀段落，可 `leading-compact` 覆蓋為 1.3）

唯一合理覆蓋情境：`text-body` / `text-body-lg` 用於**單行固定高度容器**（Button / Tabs trigger / Chip / Notice banner / MenuItem row / SelectMenu / TreeView / DropdownMenu / Combobox input），避免 1lh > chrome height 造成垂直偏移：

```tsx
{/* ✅ Button 文字（單行 28/32/36px chrome height）*/}
<button className="h-field-sm text-body leading-compact">確認</button>

{/* ✅ Notice banner 單行 alert text */}
<span className="text-body leading-compact">已儲存</span>
```

單行保證由容器自身承擔（Button / SegmentedControl item 等套 `whitespace-nowrap`）——`leading-compact` 不處理 2 行以上的 label；多行截斷是 `line-clamp-*` + 預設行高的職責（見下方反 pattern）。

可用的 override utility：
- `leading-compact`：1.3（自訂，只給 `text-body` / `text-body-lg`）
- `leading-normal`：1.5（Tailwind 內建，正式 DS 元件**不需**主動覆蓋成 1.5，因為 `text-body` / `text-body-lg` 預設就是 1.5）

### 反 pattern（禁用）

```tsx
{/* ❌ 用 leading-compact + line-clamp 「截斷副標」
       line-clamp 自己處理截斷，不需要動 line-height；該選對的 token */}
<p className="text-body leading-compact line-clamp-2">副標說明</p>

{/* ❌ 用 h5/h6 + leading-normal「當段落」
       h5/h6 是標題語義，不該當段落；同 size 該換 body-lg / body */}
<p className="text-h5 leading-normal">較小的說明段落</p>
```

### 同尺寸但不同角色的選法（用 token 自然區分，不靠 leading 覆寫）

| 尺寸 | 段落（閱讀） | 標題（掃視 + bold） |
|---|---|---|
| 16px | `text-body-lg`（lh 1.5） | `text-h5`（lh 1.3，加 `font-medium`） |
| 14px | `text-body`（lh 1.5） | `text-h6`（lh 1.3，加 `font-medium`） |

**結論**：90% 情境用 token 預設就對；唯一覆寫 = body/body-lg 進單行固定高度容器套 `leading-compact`。


## 組合範例

```tsx
{/* 頁面標題 */}
<h1 className="text-h1">專案總覽</h1>

{/* 區塊標題加重 */}
<h2 className="text-h2 font-medium">執行進度</h2>

{/* 主要內文 */}
<p className="text-body">一般說明段落，預設 400 weight。</p>

{/* 行內強調 */}
<p className="text-body">
  此操作將<span className="font-medium">永久刪除</span>該筆資料。
</p>

{/* 截斷副標 */}
<p className="text-body leading-compact line-clamp-2 text-fg-secondary">
  這是一段較長的副標說明，超過兩行會被截斷顯示。
</p>

{/* 欄位附屬說明 */}
<span className="text-caption text-fg-muted">最多 200 字元</span>
```


## 禁止事項

```tsx
// ❌ 不要用 Tailwind 原始 text-sm / text-lg / text-base
<p className="text-sm">內文</p>

// ❌ 不要硬寫 font-size 或 line-height
<p style={{ fontSize: '14px' }}>內文</p>

// ❌ 不要用 12px 做連續閱讀段落
<p className="text-caption">這是一整段很長的說明文字...</p>

// ❌ 不要把 font-weight 寫死在外層容器（應在需要的元素上疊加）
<section className="text-body font-medium">...</section>

// ❌ 不要用 Tailwind 原始 tracking-* utility(letter-spacing 必 role-specific)
<kbd className="tracking-widest">⌘K</kbd>
```


## Letter-spacing(role-specific only)

**哲學**:`letter-spacing` 跟 font-size / line-height 同層 — utility scale(`tracking-tight..widest`)是 raw scale 非 semantic role,每 consumer 自挑值 = 跨元件不一致。本 DS 採 **single semantic value per role**,每個需要 letter-spacing 變化的 role 必先 codify token。

### 既定 role

| Token | 值 | Tailwind utility | Role |
|---|---|---|---|
| `--tracking-shortcut` | `0.1em` | `tracking-shortcut` | 鍵盤快捷鍵 hint(`⌘K` / `Ctrl+S` 等),Command/CommandShortcut + DropdownMenuShortcut + 同類 kbd 顯示 consumed via `text-caption` 或 `text-footnote` |

### 新增 role 流程

1. typography.css `:root` 加 `--tracking-<role>: <value>;`
2. typography.css 加 `@utility tracking-<role> { letter-spacing: var(--tracking-<role>); }`
3. utility-registry.json `typography.allow` 加 `tracking-<role>`
4. 本 spec.md 加 row 到上表 + 對應 role 對齊世界級 cite(M22)
5. Consumer code 用新 utility

**對齊**:Material 3「letter-spacing per type role」(每個 type role 各有 `*-tracking`)/ Tailwind「wider tracking for uppercase + labels」([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tokens/versions/v0_192/_md-sys-typescale.scss#L40-L57))。


## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家世界級對照),「禁 Tailwind `text-sm`/`text-base` raw utility」+「禁硬寫 fontSize」是本 spec 的 binary strict rule,以下為支撐 rationale。

本 DS 字級:base 14px、10 個 utility 內;line-height 二元(scanning 1.3 / reading 1.5);字重三階(normal / medium / bold)—— 各自理由見下方三段。

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) Body base = 14px(對齊 Material / Carbon / Ant 三家共識)** <!-- @benchmark-unverified -->

14px 適合 productivity 工具:一屏要放規格、表格、Dashboard 等密集資訊;16px 是 reading-first 的選擇(長文閱讀、行動裝置)。本 DS 場景是 dense workspace,14px 同時讓 information density 高、又仍是舒適的內文大小。捨棄 16 base 的代價是「行動裝置可讀性」,但 DS 主場景是 desktop。

**(2) 二元 line-height(1.5 / 1.3)— 對齊 Carbon「productive vs supplementary」哲學** <!-- @benchmark-unverified -->

ratio ladder(行高隨字級連續變化)雖精細,但 consumer 心智負擔重(每 size 對應不同 lh,需查表)。二元規則「連續閱讀 1.5 / 掃描 1.3」讓 reader 一眼判斷「是要連續閱讀還是 scanning」即可選對 — 對應本 DS 的 scanning(MenuItem / FileItem)vs reading(Empty / Field description)二分法。

捨棄連續 ratio 的代價是「極大字級 lh 過鬆」(48px h1 仍 1.3),實測無此問題(本 DS 無 60+ display 級字)。

**(3) h5/h6 與 body-lg/body 同 size(16/14)— 靠 lh + weight 區分,不開新 size tier** <!-- @benchmark-unverified -->

Material 3 用 15 個 type role(display / headline / title / body / label 各分 large / medium / small)—— size scale 一大是 DS 維護負擔(每加 1 tier 就要全 component grep 評估)([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tokens/versions/v0_192/_md-sys-typescale.scss))。

本 DS 採二元覆寫(同 16px 用 lh 1.3 = h5 標題 / lh 1.5 = body-lg 段落),靠 line-height + font-weight + color 區分角色,維持 token table 在 10 個 utility 內。代價是「使用端需有意識選 h5 vs body-lg」,但對應「同尺寸但不同角色的選法」判別法明寫「需有意識地選擇」。

**(4) Font weight 3 階(400/500/700)— 對齊 Carbon / Polaris 共識** <!-- @benchmark-unverified -->

Tailwind / Apple SF 的 9 階 weight scale 涵蓋 marketing / 印刷需求,但 productivity DS 的場景幾乎只用 normal / medium / bold 三階(Polaris 也只開 regular 450 / medium 550 / semibold 650 / bold 700 四階)。捨棄 100-300 hairline + 800-900 black 的代價是「行銷 hero text 表現力」,DS 不收 marketing 場景,接受([來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/font.ts#L108-L118))。

## 跨元件參考

行高在 row 類元件中的應用（scanning vs reading 模式）詳見 `patterns/element-anatomy/item-anatomy.spec.md`「兩種閱讀模式」節。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `empty.spec.md`
- `token-system.spec.md`
