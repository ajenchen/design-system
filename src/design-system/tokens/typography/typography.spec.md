<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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
- `font-bold` = 700，強調（等同 `<strong>`）


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

**h5（16px）vs body-lg（16px）**：同尺寸，line-height 不同，靠這個區分標題與段落角色。
**h6（14px）vs body（14px）**：同尺寸，靠 font-weight 和 color 區分，使用端需有意識地處理。


## line-height 覆蓋

大多數情況不需要覆蓋。以下場景例外：

```tsx
{/* body 文字用於截斷 → 覆蓋為 1.3 */}
<p className="text-body leading-compact line-clamp-2">副標說明</p>

{/* h5/h6 用於段落說明而非標題 → 覆蓋為 1.5 */}
<p className="text-h5 leading-normal">較小的說明段落</p>
```

可用的 override utilities：
- `leading-compact`：1.3（自訂）
- `leading-normal`：1.5（Tailwind 內建）


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
```


## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家世界級對照),「禁 Tailwind `text-sm`/`text-base` raw utility」+「禁硬寫 fontSize」是本 spec 的 binary strict rule,以下為支撐 rationale。

| 維度 | 本 DS | Material 3 | Carbon | Tailwind v4 | Ant Design | Polaris | Apple HIG |
|------|-------|-----------|--------|-------------|------------|---------|-----------|
| 命名哲學 | semantic role(h1-h6 + body)| Type scale roles(Display / Headline / Title / Label / Body)| Productive vs Expressive 雙軌 | utility size(`text-{xs..9xl}`)| 階梯 h1-h5 + base | semantic role(`heading-{md..3xl}` + `body-{sm..lg}`)| Dynamic Type(Title 1-3 / Headline / Body / Callout / Footnote / Caption 1-2)|
| Body base | **14px** | 14 / 16(可切)| 14(productive)/ 16(expressive)| 16(`text-base`)| 14(`fontSizeBase`)| 14(`body-md`)| 17(`Body`)|
| Heading 跨度 | h1=48 → h6=14(6 tier)| Display 1-2 + Headline 1-6(8+ tier)| Productive 01-07 + Heading 01-07(14 tier)| `text-xs` (12) → `text-9xl` (128)(13 tier)| h1=38 → h5=16(5 tier)| `heading-md` (16) → `heading-3xl` (40)(5 tier)| Title 1-3(3 tier)|
| Line-height 哲學 | **二元**(1.5 reading / 1.3 compact)| Ratio ladder(隨 size 1.2-1.6 連續)| 二元(reading 1.5 / supplementary 1.3)| Ratio ladder(`leading-{tight..loose}` 1.25-2)| Unique 1.5715 | 隨 size(0.875-1.5)| 隨 size + Dynamic |
| Font weight 階 | **3 階**(400/500/700)| 5 階(300-700)| 3 階(Light/Regular/SemiBold)| 9 階(100-900)| 4 階(400/500/600/700)| 4 階(400/500/600/650)| 9 階 + SF |

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) Body base = 14px(對齊 Material / Carbon / Ant 三家共識)**

14px 是 productivity tool 共識(Linear / Notion / Figma / Jira / Stripe Dashboard),16px 是 reading-first 哲學(Apple iOS / Polaris 的 storefront / Medium)。本 DS 場景是 dense workspace(規格 / 表格 / Dashboard),14px 同時讓 information density 高 + 對齊 system tool 慣例。捨棄 16 base 的代價是「行動裝置可讀性」,但 DS 主場景是 desktop。

**(2) 二元 line-height(1.5 / 1.3)— 對齊 Carbon「productive vs supplementary」哲學**

Material / Tailwind 用 ratio ladder(隨 size 連續變化)雖精細,但 consumer 心智負擔重(每 size 對應不同 lh,需查表)。Carbon 的「productive reading 1.5 / supplementary compact 1.3」二元規則,讓 reader 一眼判斷「是要連續閱讀還是 scanning」即可選對 — 對應本 DS 的 scanning(MenuItem / FileItem)vs reading(Empty / Field description)二分法。

捨棄連續 ratio 的代價是「極大字級 lh 過鬆」(48px h1 仍 1.3),實測無此問題(本 DS 無 60+ display 級字)。

**(3) h5/h6 與 body-lg/body 同 size(16/14)— 靠 lh + weight 區分,不開新 size tier**

Material 用 17 tier(Display 1-2 + Headline 1-6 + Title 1-2 + Subtitle 1-2 + Body 1-2 + Button + Caption + Overline),Apple Dynamic Type 11 tier 跨平台 — 兩家 size scale 過度膨脹是 DS 維護負擔(每加 1 tier 就要全 component grep 評估)。

本 DS 採 Carbon-aligned 二元覆寫(同 16px 用 lh 1.3 = h5 標題 / lh 1.5 = body-lg 段落),靠 line-height + font-weight + color 區分角色,維持 token table 在 10 個 utility 內。代價是「使用端需有意識選 h5 vs body-lg」,但對應 spec L42 明寫「使用端需有意識地處理」。

**(4) Font weight 3 階(400/500/700)— 對齊 Carbon / Polaris 共識**

Tailwind / Apple SF 的 9 階 weight scale 涵蓋 marketing / 印刷需求,但 productivity DS 95% 場景只用 normal / medium / bold(對齊 Carbon Light/Regular/SemiBold + Polaris 400/500/600/650)。捨棄 100-300 hairline + 800-900 black 的代價是「行銷 hero text 表現力」,DS 不收 marketing 場景,接受。

## 跨元件參考

行高在 row 類元件中的應用（scanning vs reading 模式）詳見 `patterns/element-anatomy/item-anatomy.spec.md`「兩種閱讀模式」節。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `empty.spec.md`
