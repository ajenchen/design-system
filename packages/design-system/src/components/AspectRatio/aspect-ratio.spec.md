---
component: AspectRatio
family: self-contained
variants: {}
sizes: {}
traits:
  - isMatrixHeavy
benchmark:
  - Radix AspectRatio primitive: github.com/radix-ui/primitives/tree/main/packages/react/aspect-ratio
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# AspectRatio 設計原則

## 定位

AspectRatio 是**固定長寬比容器** primitive——確保內部 children(通常是 image / video / illustration)永遠保持指定 ratio,避免未載入時容器坍塌或 content-fit 造成的位移。

**實作基礎**:`@radix-ui/react-aspect-ratio` 薄包裝。Radix 用 SSR-safe padding-bottom 方案實作,consistent 跨瀏覽器。

**Layout Family**:非上述 family — self-contained primitive(container 型 layout,無 slot 結構,只暴露 `ratio` 數值 + children)。

**世界級對照**:
- shadcn `AspectRatio`(本元件主要參考)— 同 Radix 薄包裝 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- Ant Design 無獨立元件(用 CSS aspect-ratio 或自訂 padding-bottom)
- Material 無獨立元件(image/Card 元件內建 props)

---

## 何時用

- **圖片容器未載入前防坍塌**:圖片 src 還沒 ready 時,容器高度若為 0 → 頁面 layout 跳動(CLS 問題)。AspectRatio 鎖死比例
- **Coachmark / Tour media 區**:onboarding 截圖 / illustration 統一 ratio
- **Carousel item 圖像**:輪播各張圖保持一致高度
- **Card thumbnail**(未來):product card / blog post cover
- **Chart / 圖表 preview**:dashboard 卡片內 chart 容器

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| content 高度需隨內容變 | 不包 AspectRatio | AspectRatio 鎖死,無法 hug content |
| 圖片已固定 width + height 屬性 | 直接 `<img>` 即可 | AspectRatio 是給 responsive(width 100%)場景 |
| Flex/Grid 子元素高度由父層控 | 不包 | 父層已規定高度,包 AspectRatio 多餘 |

## 近親元件分界

| vs | 差異軸 | 何時用 AspectRatio |
|---|---|---|
| **Card / 自訂 wrapper** | AspectRatio 鎖比例(寬→高);Card 一般 hug content | 需要保證 width:height 固定比 |
| **Skeleton** | Skeleton 是 loading placeholder + 預設尺寸;AspectRatio 是 ratio container | 內含 image / chart 等需保 ratio 的 ready content |
| **Empty(image slot)** | Empty 是 page-state 元件;AspectRatio 是 layout primitive | 結構性 ratio 鎖,跟 content state 無關 |

對齊 Radix AspectRatio / Material `<Box sx={{aspectRatio}}>` / Polaris MediaCard primitive 慣例:純結構 layout 元件。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## DS 標準 ratio(慣例)

| Ratio | 用途 |
|-------|------|
| `16/9`(寬螢幕) | onboarding / tour 截圖(Coachmark 預設)、video embed、hero banner |
| `4/3`(傳統) | 產品照片、screenshot |
| `1/1`(方形) | Avatar、icon preview、Instagram-style 貼文 |
| `3/4`(直式) | 人物 portrait 照、手機截圖 |
| `21/9`(ultrawide) | hero section banner、movie poster |

**數值計算**:consumer 傳 `ratio={16/9}`(= 1.7777...),Radix 內部自動 padding-bottom `56.25%`。

---

## Consumer 範例

```tsx
import { AspectRatio } from '@/design-system/components/AspectRatio/aspect-ratio'

<AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
  <img src={url} alt="..." className="w-full h-full object-cover" />
</AspectRatio>
```

children 通常要 `className="w-full h-full object-cover"` 讓圖填滿容器;否則留空間。

---

## 禁止事項

- ❌ **不用 AspectRatio 做 flex/grid layout**(它是 container 鎖比例,不是佈局)
- ❌ **不在 AspectRatio 內放不該鎖比例的 content**(文字 / form / button — 這些應隨內容高)
- ❌ **不重疊多層 AspectRatio**(意義不明,比例衝突)

---

## 邊界案例

- **極端 ratio**:`ratio` 接受任意正數,元件不驗證、不設上下限(`1/10` 極扁 / `10/1` 極窄高都照算);是否合理由 consumer 把關
- **容器 resize**:高度恆 = 寬度 ÷ ratio(padding-bottom 百分比機制),父層寬度變化時高度自動跟隨,無需 JS
- **children 超出**:元件不自動裁切 — 超出 ratio 容器的內容會溢出;裁切由 consumer 加 `overflow-hidden`(見 Consumer 範例)
- **媒體原始比例 ≠ 容器 ratio**:呈現由 children 的 `object-cover`(裁滿)/ `object-contain`(留白)決定,元件不介入

## 常見誤解

- **AspectRatio 不是 responsive 佈局工具** — 只鎖比例;寬度仍由父層 / className 控制(見「為何無 SizeMatrix」)
- **「直接寫 CSS `aspect-ratio` 就好?」** — DS 內一律消費本元件(既有 primitive 優先):Radix padding-bottom 方案 SSR-safe 且跨瀏覽器一致(見「定位」)

---

## 為何無 ColorMatrix / SizeMatrix / StateBehavior

AspectRatio 是 pure layout primitive(container 鎖比例),本身:

- **無 color token**:自身不帶任何色彩,背景色由 consumer 透過 className 決定(慣例 `bg-muted` 作 image placeholder)。故不建立 `ColorMatrix`——色彩決策屬 consumer。
- **無 size prop**:寬度由 parent / className 控制,高度由 `ratio` 公式自動推導(`height = width / ratio`)。因此不提供 sm/md/lg size variant,不同尺寸透過外層容器寬度達成。故不建立 `SizeMatrix`——元件特有視覺對照改為 `StandardRatios`(DS 慣用 5 種 ratio)。
- **無互動狀態**:無 hover / focus / active / selected / disabled(非互動元件,純 structural container)。故不建立 `StateBehavior`。

對應 anatomy story:保留 `Overview` + `Inspector`(ratio 切換互動)+ 元件特有 `StandardRatios` + `Accessibility`(2026-05-17 Dim 13)。

---

## A11y 預設

元件本身不引入 a11y 干預,consumer 對 children(如 img)負責 `alt` / `aria-label`。

---

## shadcn 薄包裝說明

AspectRatio 是 Radix `AspectRatioPrimitive.Root` 的薄包裝:用 `React.forwardRef` 顯式轉發 ref、把 `...props` spread 到 Radix Root、並設定 `displayName = 'AspectRatio'`(對齊 shadcn canonical)。`ratio` / `asChild` 等 props 透過 spread 原封不動傳給 Radix。

**為什麼顯式 wrap 一層**:Radix primitive 本身雖已 forwardRef,但本 DS 慣例是每個對外 export 都顯式包一層,確保在 React DevTools / Storybook Inspector 顯示正確的 `displayName`,且 props passthrough 與 ref 行為在 code 層面明確可見。這層 wrapper 不加任何預設樣式,純粹保持命名與檢視一致。

**何時改寫這層**:若未來要加預設 className / 自訂 ratio 常數 / 內建 consumer 視覺 guard(如強制 border-radius),在這層 wrapper 內補即可。目前 wrapper 只做 passthrough。

---

## 相關

- `../Coachmark/coachmark.spec.md` — **本元件 consumer**:media 區預設 `mediaRatio=16/9`
- `../Carousel/carousel.spec.md` — 未來 consumer(item image 統一 ratio)
- Radix AspectRatio — `@radix-ui/react-aspect-ratio`
- shadcn AspectRatio — 參考實作 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-viewer.spec.md`
