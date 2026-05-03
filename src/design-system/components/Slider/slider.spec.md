---
component: Slider
family: 4
variants: {}
sizes: {}
traits:
  - hasSizes
  - hasInteractiveStates
  - isMatrixHeavy
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Slider 設計原則

**數值範圍選取器**——基於 Radix Slider primitive,橋接設計系統 token。

> 命名:`Slider`(沿用 Radix / shadcn / Material 慣例)。

---

## 定位

使用者沿著一條軌道拖曳 thumb 選擇一個數值(single)或一段範圍(range)。適合**連續或密集離散的數值選取**,當使用者在意「相對位置」勝過「精確數字」時使用。

**Layout Family**:非上述 family — self-contained primitive(track + thumb + range,非 row / pill / field 結構)。高度對齊 Field family 僅為視覺整齊(`size` prop 映射 `h-field-*`),並非消費 Field layout 的 slot 結構。

---

## 何時用

- **「感受性」連續值**:亮度 / 音量 / 縮放 / 透明度
- **範圍選取**:價格區間、日期區間、分數區間
- **使用者在意「相對位置」勝過「精確數字」**:粗略調整 > 精確輸入
- **搭配顯示值**:thumb 旁標籤或同步 NumberInput 讓使用者掌握精確數字

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 離散且少量選項(3–5 個) | `SegmentedControl` / `RadioGroup` | Slider 為連續值設計,離散少量用分段控件視覺更清楚 |
| 精確數字輸入 | `NumberInput` | Slider 難以拖到精確值,打字更快 |
| 布林切換 | `Switch` | 布林不是數值 |
| 「多少」而非「哪裡」(計數) | `NumberInput`(含 ±step) | Slider 傳達 position,不是 quantity |
| 純篩選布林 | `Checkbox` | 非數值型篩選 |

---

## 尺寸

### 一種視覺,多種容器尺寸

**Slider 的視覺是固定的**——track 厚度、thumb 直徑、focus ring 都是單一值,不會隨 `size` 變動。這是跟 Button / Input 等元件的明顯差異,理由是:

- Slider 的 thumb 必須足夠容易被手指 / 鼠標捕捉,改小會降低可用性
- 連續拖曳的 track 太細會看不清楚 range
- 業界(Material / Ant / Radix Themes / shadcn)都只有一組 thumb / track 視覺,不做多尺寸

**但**,Slider 可以被丟進 `Field` 容器跟 `Input` / `Select` / `NumberInput` 等並排,這時它**必須跟該 Field 的 `size` 對齊高度**(否則一排 sm field 裡混一個 md 高度的 slider,breakline rhythm 會崩)。

### 解決方式:`size` prop 只控容器外高

Slider 接收 `size?: 'sm' | 'md' | 'lg'` prop(預設 `md`),**這個 prop 只決定 root 容器的 `h-field-*` class**,不改變 track 厚度、thumb 直徑、ring 尺寸。內部視覺元素透過 flex `items-center` 在容器中**垂直置中**,所以不論容器高度是 28 / 32 / 36 px,track 和 thumb 的位置都在中間,視覺體驗一致。

這樣做的效果:
- 視覺:一種尺寸,任何 Field context 長得都一樣
- 對齊:完美對齊 Field family 的 field-height tier
- API 一致性:跟 Input / NumberInput 同樣有 `size` prop,消費者不需要特別記「Slider 沒有 size」

### 為什麼不完全對齊 `--field-height-*`

- **現況**:容器高 = `--field-height-sm/md/lg`(對齊);track 厚度固定 4px / thumb 直徑固定 16px / focus ring 固定 2px,**皆不隨 size 變化**(偏離 size-proportional scaling)
- **Rationale**:Slider 的 thumb 是「位置指示器」,必須足夠大好捕捉(Fitts's Law);縮小成比例(sm=12 / lg=20 之類)會讓 sm 幾乎無法精確拖曳。業界共識:track/thumb 是**單一視覺規格**,`size` 只控容器外高讓 Slider 並排對齊,內部透過 `flex items-center` 垂直置中
- **世界級對照**:Material 3 Slider(track 4dp thumb 20dp 固定)/ iOS UISlider(track 3pt thumb 28pt 固定)/ Ant Design Slider(track 4px thumb 14px 固定)/ Radix Slider(default 4px track)——全部 thumb / track 尺寸獨立於 form-size system

---

## 視覺規格(單一組,不隨 size 變)

| 元素 | 值 | Token |
|---|---|---|
| **Track** 厚度 | 4px(`h-1`) | — |
| **Track** 底色 rest | `bg-secondary` | `--secondary`(neutral-3,跟 Tag neutral / Badge low 同級「微淡可辨」)|
| **Track** 底色 disabled | `bg-muted` | `--muted`(neutral-2,disabled-like 退化)|
| **Range** 填滿色 rest | `bg-primary` | `--primary` |
| **Range** 填滿色 disabled | `bg-border`(neutral-5)| `--border` |
| **Thumb** 直徑 | 16px(`h-4 w-4`) | — |
| **Thumb** 底色(rest + disabled 不變)| `bg-surface`(白) | `--surface` |
| **Thumb** 邊框 rest | `border-2 border-primary`(= Range rest 同色)| `--primary` |
| **Thumb** 邊框 disabled | `border-border`(= Range disabled 同色)| `--border` |
| **Thumb** hover | border `primary-hover` + 陰影 `--elevation-100` | `--primary-hover` |
| **Thumb** active | 陰影 `--elevation-200` | — |
| **Focus ring** | `ring-2 ring-ring ring-offset-2 ring-offset-background` | `--ring` |
| **Disabled cursor** | `cursor-not-allowed` + hover 陰影關閉 | — |

### 為什麼 thumb 是**白底 + 邊框**,不是**實心 primary**

實心 primary thumb 會讓 thumb fill 與 range fill 使用同一 token → 失去位置辨識語意(特別是 range mode 兩個 thumb 與 primary range 共存時)。白底 + 邊框讓 thumb 與 range 視覺可區分——thumb 作為位置指示器,必須能從 range 中辨別。這是 Material 3 / iOS / Linear 的共同解法。

### 為什麼 Track 永遠是 `bg-muted`,不跟 state 變動

Track 是「凹槽底線」,它的視覺角色是「告訴使用者這條線是 slider 可滑動範圍」——這個語意不會因為 enabled / disabled 改變,所以**顏色也不該變**。當整個 slider 被 disable 時,Range 和 Thumb border 會降級(rest 的 primary → border),但 Track 的灰色凹槽身分始終不變。

為什麼用 `bg-muted` 而非其他 token?
- `--muted` 是 semantic token,屬於「shadcn Badge / skeleton 底色」家族,語意歸屬明確
- 是最淡的 subtle bg,符合「track 是背景凹槽,不是主角」的視覺層級
- **優先用 semantic token,不直接引用 primitive**——這是系統的基本原則

> **若覺得 `--muted` 在 white canvas 上太淡**,那是 `--muted` 本身的系統級議題,應該統一調整 `--muted` 的定義(影響 Badge / skeleton / Slider 一起),而不是在 Slider 裡偷偷用 primitive `--color-neutral-3` 繞過。

### Range 色 ↔ Thumb border 色的綁定規則

Range 填滿色和 Thumb border 色**永遠是同一個 token**:

| State | Range bg | Thumb border | 共享 token |
|---|---|---|---|
| Rest | `bg-primary` | `border-primary` | `--primary` |
| Disabled | `bg-border` | `border-border` | `--border` |

**為什麼綁在一起**:thumb 坐落在 range 的端點上,border 是 range 的視覺延續;兩者同色讓 thumb 作為「range 的終點標記」而非獨立元素,對齊物理滑桿 handle 屬於軌道一部分的 mental model(具體視覺呈現見 `.principles.stories.tsx` 的 ThumbBindingRule)。

**強制規則**:未來若要改 Range 的 disabled 色(例如加新 variant),必須同步改 Thumb border。不要讓兩者漂移。

### 為什麼 hover / active 用陰影不用色變

Slider 不是 button——它是「當前位置指示器」,底色不該動(動了會暗示是另一個狀態)。陰影(elevation)是世界級 slider 的標準 hover 語言:Material 3 的 state layer + elevation、iOS slider 的 scale + shadow、Linear 的 drop shadow。對齊 `elevation.spec.md` 的 `--elevation-100` / `--elevation-200`。

---

## API

```tsx
<Slider
  value={number[]}                 // controlled
  defaultValue={number[]}          // uncontrolled
  onValueChange={(value) => void}
  onValueCommit={(value) => void}  // 放開滑鼠時才觸發
  min={number}                     // 預設 0
  max={number}                     // 預設 100
  step={number}                    // 預設 1
  size="sm" | "md" | "lg"          // 預設 md(只影響容器外高)
  disabled={boolean}
  orientation="horizontal"         // 不支援 vertical(用 TickSlider / 垂直尺若未來需要再擴充)
  minStepsBetweenThumbs={number}   // range mode 時兩個 thumb 的最小距離
/>
```

### Range mode(雙 thumb)

Radix Slider 原生支援多 thumb——只要 `value` / `defaultValue` 傳長度 > 1 的 array,就自動渲染對應數量的 thumb,range(填滿段)落在最小和最大 thumb 之間。

```tsx
// 單值
<Slider defaultValue={[50]} />

// 範圍
<Slider defaultValue={[20, 80]} />
```

### 跟 Field 整合

```tsx
<Field>
  <FieldLabel>音量</FieldLabel>
  <Slider size="md" defaultValue={[60]} />
  <FieldDescription>拖曳調整音量大小</FieldDescription>
</Field>
```

`size` prop 必須跟 Field 內其他 field 元件(Input / Select / NumberInput)傳同一個 size,才能對齊 field-height。

---

## States

| State | 視覺 | 觸發 |
|---|---|---|
| Rest | track `bg-muted`,range `bg-primary`,thumb `bg-surface + border-primary` | 預設 |
| Hover(thumb) | 加 `--elevation-100` 陰影 | 滑鼠 hover 在 thumb 上 |
| Active(拖曳中) | 加 `--elevation-200` 陰影 | 按住拖曳 |
| Focus | `ring-2 ring-ring ring-offset-2` | 鍵盤 Tab 聚焦 |
| Disabled | 灰階降級:range `bg-border`、thumb `border-border`(= range 同 token)、thumb bg 保留 `bg-surface` 白底、`cursor-not-allowed`、hover 陰影關閉 | `disabled` prop 或 Field context disabled |

**Mode / readonly / dark mode / density** 詳見 `../Field/field-controls.spec.md`(Slider 作為 Field 家族整合時繼承其 canonical;semantic token 自動處理 dark mode,無需元件內特殊 handling)。

### Disabled 視覺階層

```
track (muted, n-2) < range = thumb border (border, n-5) < text (n-7+)
```

**三階**,不是四階。Range 和 Thumb border 刻意用同一個 token(見前面「Range 色 ↔ Thumb border 色的綁定規則」),不拆成兩階。

- **Track n-2**:最底的凹槽底線
- **Range + Thumb border n-5**:同層——thumb border 是 range 的連續視覺,兩者融為一體;thumb 的 fill 保持 surface 色,與 range fill 對比,位置由 range 的長度段決定
- **Text n-7+**:label / description 在所有視覺元件之上

### 為什麼 range disabled 不用 `--fg-disabled`

`--fg-disabled`(neutral-6)的語意是「**disabled 狀態下的文字前景色**」,它存在的目的是讓 disabled text 有足夠對比度可讀。把它拿來當 range 的 background 是**混用 fg token 當 bg 色**——在設計系統語意上是 smell,偶然 work 只是因為 neutral-6 剛好是我想要的深度。

正確選擇是 `--border`(neutral-5):
- **語意對**:`--border` 屬於 Border family,「視覺分隔 / 容器邊框」語意,跟 range 的「填充視覺指示器」角色接近
- **Family 對**:非文字的視覺元素,不借用 fg family
- **可同時作為 border-color**:`border-border` 在 Thumb 上直接用,Range bg 跟 Thumb border 可共享同一個 token(這是綁定規則的前提)
- **跟 fg-disabled 解耦**:未來若 `--fg-disabled` 被微調,Slider 不會被拖著一起變

詳細的 fg / bg token family 借用規則見 `tokens/color/color.spec.md` 的「fg token 不可當 bg 用」節。

---

## Disabled 策略

**Slider 用灰階不用 opacity**。這是系統內重要的判準,反覆確認後的結論——系統有兩個 disabled 處理派別,Slider 屬於**灰階派**(跟 Button / Checkbox 同家族)。判準比「多色彩 vs 單色彩」更精準,是:

### 判準:**顏色是否是 semantic state 的唯一載體?**

| 元件 | 顏色的角色 | State 載體 | Disabled 策略 |
|---|---|---|---|
| **Switch** | `bg-primary` vs `bg-border` 是 on/off 的**唯一視覺差異**(track 和 thumb 形狀在 on/off 之間完全相同,只有顏色變)| **顏色本身就是 state** | **`opacity-disabled`** — 必須保留色彩身分,否則灰階後失去狀態區辨 |
| **Checkbox** | 勾了有 checkmark,沒勾沒 checkmark——**形狀**決定 state,顏色只是美學 | **形狀(checkmark)** | **灰階 swap**(`bg-disabled`)— 灰色框裡的 checkmark 仍清楚可辨 |
| **Button** | Primary 色是品牌美學,不是 state | — | **灰階 swap** |
| **Slider** | Range 藍色是「已選長度」的美學視覺,**位置 + 長度是 state**,顏色只是裝飾 | **位置(thumb)+ 長度(range 佔比)** | **灰階 swap** — 灰色 range 跟灰色 thumb 的位置/長度仍然完全可辨 |

### Slider 的完整論證

使用者看到 disabled slider 需要理解兩件事:
1. **Thumb 在 track 的哪個位置**(例如「60% 處」)
2. **Range 的填滿長度**(例如「20% 到 80%」)

這兩個資訊**完全不依賴顏色**:
- 灰階 thumb 在灰階 track 上,x 座標位置跟 primary 版本一模一樣
- 灰階填滿段的長度跟 primary 版本一模一樣

**失去藍色沒有任何資訊損失**。Slider 跟 Checkbox 同類——semantic state 由形狀/位置承載,顏色是純裝飾。

### 對照 Switch 的差異

Switch 是**唯一需要 opacity 的特例**,因為它的 on/off 沒有任何形狀差異:
- On:track + thumb
- Off:track + thumb(同樣形狀,thumb 在不同位置)

唯一的 state 視覺載體是 track 顏色(primary vs border)。灰階 swap 會讓 on/off 視覺無法區分——必須靠 opacity 保留顏色。

**這個 rationale 不適用 Slider**,因為 Slider 的 state 載體不是顏色。

### 為什麼 shadcn / Material 3 用 opacity 仍然不是理由

- **shadcn 的 Slider 用 `opacity-50`**:shadcn 追求「最短 code path」,不是「設計嚴謹」,它對所有 disabled 元件都 lazy-apply opacity。這是實作偷懶,不是 design decision。
- **Material 3 的 38% opacity 全局規則**:M3 是為 Android 生態系設計的,opacity-based disabled 能跟 Android 原生控件的視覺一致。我們的系統是 web,不受此約束,且 Button / Checkbox / Input 已經選了灰階路線,Slider 跟進對齊才是 system consistency 的正確解。

### 常見錯誤(避免)

**不要把 thumb 的 disabled bg 改成 `bg-muted`**——`--muted` 和 `--bg-disabled` 在這個系統都等於 `var(--color-neutral-2)`,同一個顏色。Thumb `bg-muted` 會跟 track `bg-muted` 完全融色,只剩 border 可見,失去 thumb 形狀辨識(真實踩過的 bug)。**保留 `bg-surface` 白底**,只改 border 顏色即可達成降級。

**不要同時套 opacity + 灰階 swap**——兩個策略互斥,同時用會導致「灰階 swap 後再打 opacity 一層」,視覺雙重降級,整個 slider 褪色過度。選一條路走到底。

### 無 Error state

Slider 沒有獨立的 error 視覺——拖曳選值本身不太會「無效」。如果業務邏輯需要限制範圍,用 `min` / `max` 直接限制使用者能拖到的範圍,不要讓他拖到再報錯。

### 無 readonly mode

Slider 的 `readonly` 等同於 `disabled`——一個不能操作的 slider 本質上就是 disabled。不同於 Input 有「可以 focus 但不能改」的 readonly 差異,slider 的 focus 除了拖曳沒有其他行為。若要顯示「歷史值」,用純文字或另一個 display 元件。

---

## 鍵盤操作(Radix 原生,免手工)

- **Left / Right Arrow**:- / + `step`
- **Up / Down Arrow**:+ / - `step`(vertical-inverted 時相反)
- **PageUp / PageDown**:± `step × 10`(Radix 預設)
- **Home / End**:跳到 `min` / `max`
- **Tab**:在多個 thumb 間切換焦點(range mode)

無需額外實作,Radix Slider primitive 已經全部處理。

---

## Do / Don't

✅ **Do**
- 用 Slider 選「連續」或「密集離散」的數值
- Range mode 用於範圍選取(價格、日期、分數)
- 搭配顯示值(thumb tooltip 或旁邊的 NumberInput 同步)讓使用者知道精確數字
- 用 Field 包裝時傳跟 siblings 同一個 `size`

❌ **Don't**
- 用 Slider 選離散少量選項(用 SegmentedControl / RadioGroup)
- 用 Slider 表達「多/少」的 boolean(用 Switch)
- 硬寫 thumb / track 尺寸——單一視覺規格,跟 size 無關
- 用實心 primary thumb(thumb fill 與 range fill 使用同一 token → 失去位置辨識語意)
- thumb hover-fill 切換色(破壞「這是位置指示器」的 mental model,hover 應透過陰影表達而非色變)
- 給 Slider 加 error 紅色——用 min/max 限制輸入範圍,不讓錯誤發生

---

## 為何無 Inspector

Slider 決策維度是 `size`(容器外高)× `range mode`(single / range)× track / range / thumb 的色彩綁定規則——已由 `SizeMatrix` / `StateBehavior` / `ColorMatrix` / 元件特有 `ColorBindingRule`(range ↔ thumb border 綁定規則) / `KeyboardMatrix`(Radix 原生鍵盤) 五張 story 完整覆蓋。

互動 Inspector 拉動 thumb 無法呈現「range 色和 thumb border 永遠同 token」這類設計綁定規則——這是 side-by-side 對照題,不是單值拉動題。鍵盤互動已由 `KeyboardMatrix` 以對照表呈現比 Inspector 試玩更完整。

對應 anatomy story:保留 `Overview` + `ColorMatrix` + `SizeMatrix` + `StateBehavior` + 元件特有 `ColorBindingRule` + `KeyboardMatrix`。

---

## 相關

- `../NumberInput/number-input.spec.md` — 精確數字輸入的對應元件
- `../SegmentedControl/segmented-control.spec.md` — 離散少量選項的對應元件
- `../../tokens/uiSize/uiSize.spec.md` — `field-height-*` token family
- `../../tokens/elevation/elevation.spec.md` — Elevation hover / active 語意
- `../../tokens/color/color.spec.md` — Primary / muted / fg-disabled token
- `../Field/field.spec.md` — Field 容器整合規則
- Radix Slider primitive API — `@radix-ui/react-slider`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `switch.spec.md`
