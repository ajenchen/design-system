---
component: AspectRatio
family: null
variants: {}
sizes: {}
traits:
  - isMatrixHeavy
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# AspectRatio 設計原則

## 定位

AspectRatio 是**固定長寬比容器** primitive——確保內部 children(通常是 image / video / illustration)永遠保持指定 ratio,避免未載入時容器坍塌或 content-fit 造成的位移。

**實作基礎**:`@radix-ui/react-aspect-ratio` 薄包裝。Radix 用 SSR-safe padding-bottom 方案實作,consistent 跨瀏覽器。

**Layout Family**:非上述 family — self-contained primitive(container 型 layout,無 slot 結構,只暴露 `ratio` 數值 + children)。

**世界級對照**:
- shadcn `AspectRatio`(本元件主要參考)— 同 Radix 薄包裝
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

## 為何無 ColorMatrix / SizeMatrix / StateBehavior

AspectRatio 是 pure layout primitive(container 鎖比例),本身:

- **無 color token**:自身不帶任何色彩,背景色由 consumer 透過 className 決定(慣例 `bg-muted` 作 image placeholder)。故不建立 `ColorMatrix`——色彩決策屬 consumer。
- **無 size prop**:寬度由 parent / className 控制,高度由 `ratio` 公式自動推導(`height = width / ratio`)。因此不提供 sm/md/lg size variant,不同尺寸透過外層容器寬度達成。故不建立 `SizeMatrix`——元件特有視覺對照改為 `StandardRatios`(DS 慣用 5 種 ratio)。
- **無互動狀態**:無 hover / focus / active / selected / disabled(非互動元件,純 structural container)。故不建立 `StateBehavior`。

對應 anatomy story:保留 `Overview` + `Inspector`(ratio 切換互動)+ 元件特有 `StandardRatios`。

---

## A11y

元件本身不引入 a11y 干預,consumer 對 children(如 img)負責 `alt` / `aria-label`。

---

## shadcn passthrough 例外說明

AspectRatio export 為 `const AspectRatio = AspectRatioPrimitive.Root`(**直接 re-export Radix primitive,無額外 wrapper**),不套 `React.forwardRef` / `displayName` / `...props` spread / `asChild` 的 shadcn canonical 五件套。

**為什麼豁免**:Radix `AspectRatioPrimitive.Root` 本身已實作這五件套(forwardRef-ed / displayName 為 `"AspectRatio"` / `...props` 內部 spread 至 inner `<div>` / asChild 透過 Slot 支援)。在我們自己 wrap 一層只會 indirection 不加值,且會 **break** Radix 內建的 displayName / Slot 支援。這是 shadcn-official 模式(shadcn 元件庫的 AspectRatio 也是直接 re-export),非 drift。

**何時需要自己 wrap**:若未來要加預設 className / 自訂 ratio 常數 / 內建 consumer 視覺 guard(如強制 border-radius),再 wrap。目前無此需求。

---

## 相關

- `../Coachmark/coachmark.spec.md` — **本元件 consumer**:media 區預設 `mediaRatio=16/9`
- `../Carousel/carousel.spec.md` — 未來 consumer(item image 統一 ratio)
- Radix AspectRatio — `@radix-ui/react-aspect-ratio`
- shadcn AspectRatio — 參考實作

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-viewer.spec.md`
