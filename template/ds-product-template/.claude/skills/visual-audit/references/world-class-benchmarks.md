# Visual Audit — 世界級對照 benchmark

本檔為 SKILL.md Phase 1 各 checklist 項「合格標準」的**外部參考錨**。DS 內既有 spec / token 是第一順位 canonical;**本檔是 spec 沒寫、或需要補世界級 rationale 時的次級參考**。

**使用原則**:
- 合格標準優先走 DS 內 spec / token(actual == canonical)
- DS spec 沒寫時,本檔提供世界級 idiom 作「可類推的合理區間」
- 本檔數值**不可取代** DS 規則,只提供「世界級通常怎麼做」的事實陳述
- 看到 FAIL 但 DS 無明文 canonical → 用本檔指出「世界級通常 X,本元件偏離 X」,交 user 決定是補 spec 還是改 code

---

## 1. 4 邊邊距對稱 / 2. 垂直對稱(DatePicker / Menu / Dialog)

| DS | 規範重點 | 數值 |
|----|---------|------|
| **Material 3 Date Picker** | 4 邊等距,top/bottom action bar 高度鏡射 | 12dp 四邊 |
| **Apple HIG Date Picker(iOS / macOS)** | 精準 grid,4 邊 padding 等值 | 16pt 四邊 |
| **Atlassian DatePicker** | `padding: 8px` 四邊 | 8px |
| **Notion Menu** | 上下 padding 同值,sticky header 單獨佔空間 | 6px 上下 |

**世界級 idiom**:**4 邊等 padding 是 default**;asymmetric 必有 rationale(sticky header / footer action bar / arrow space)。DS 若無明文 asymmetric → 4 邊應等。

---

## 3. 水平 gap(同 flex 列互動 slot)

| DS | 規範重點 |
|----|---------|
| **Polaris ActionList / Menu** | item 之間 `gap-0`,每 item 自含 padding;inline action gap 8px |
| **Material 3 Chip group** | 8dp gap between chips |
| **Atlassian Button group** | 8px gap;ring/focus outline 限制在 box 內,不 overflow |
| **Ant Design Space** | default `gap-8`,hover bg 限制 box 內 |

**世界級 idiom**:**hover bg / ring / focus outline 不超出 slot box**,保護 gap token 如實呈現。這對齊 node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md`# 同 flex 列的互動 slot 幾何鐵律`。

---

## 4. Overlay 定位(Popover / Tooltip / Badge)

| DS | 規範重點 | 數值 |
|----|---------|------|
| **Material 3 Popover** | anchor 到 popover 最小 8dp spacing | 8dp |
| **Atlassian Tooltip** | 6px offset from anchor | 6px |
| **Polaris Popover** | 4px offset | 4px |
| **Ant Design Tooltip** | 4px offset 預設,可 side-offset prop 調 | 4px |
| **Material Badge(dot / number)** | 以 anchor 右上角為 center 定位,offset 用 anchor 尺寸比例 | (24dp 圖示)右上 8×8 dot 中心離 anchor 右上 (−4, +4) |

**世界級 idiom**:
- **side-offset 預設 4–8px**,tooltip 偏小(4–6)、popover 偏大(6–8)
- **Badge 定位用相對比例**(anchor size × ratio),不硬寫 px(不同 anchor size 壞掉)
- **不覆蓋 anchor content**——overlay 的存在是補充 anchor,不是替代

---

## 5. Typography baseline 對齊 / 6. Icon ↔ text gap

| DS | 規範重點 | 數值 |
|----|---------|------|
| **Material 3 List Item** | icon 16dp 對齊 text cap-height 中心;gap 16dp | 16/16 |
| **Polaris ResourceList** | icon 20px,gap 12px | 20/12 |
| **Apple HIG Menu Item** | SF Symbols 與 text 用 `items-center`,gap 8pt | sym/8 |
| **Atlassian Button with icon** | icon 16px,gap 8px | 16/8 |
| **Notion MenuItem** | icon 18px,gap 8px | 18/8 |

**世界級 idiom**:
- **gap 8px** 是跨 DS 最常見值(Material 的 16dp 是 outlier,其 menu 本身較寬鬆)
- **icon 與 text 用 `items-center`**(幾何中心),不是 `items-baseline`
- **icon size 跟 text size 比例 ≈ 1:1**(16px icon 配 14-16px text),1:1.2 也 ok

---

## 7. 容器寬度 fill(Block vs Inline)

| DS | 規範重點 |
|----|---------|
| **Material 3 TextField** | 預設 block,fill container;可 `style="width:auto"` 覆寫 |
| **Polaris TextField** | 預設 100% fill |
| **Ant Design Input** | 預設 100% fill(與 antd Form 整合) |
| **Chakra Input** | 預設 100% fill |
| **shadcn Input** | `w-full` class 預設 |

**世界級 idiom**:
- **field 類元件預設 block fill container**——consumer 常嵌 form layout,讓 field 填滿容器是合理 default
- **Tag / Chip / Badge 類是 inline fit-content**
- **File upload area 類(upload zone / drop zone)fill container**——這是拖放互動預期的

---

## 8. 同 row field 高度對齊

| DS | field-height |
|----|--------------|
| **Material 3 Text field** | 40dp(dense)/ 56dp(standard) |
| **Polaris TextField** | 32px(slim)/ 36px(medium) |
| **Atlassian TextField** | 32px(default) |
| **Apple HIG macOS** | 22pt(small)/ 28pt(regular)/ 36pt(large) |
| **本 DS** | 28 / 36 / 44px(sm / md / lg) |

**世界級 idiom**:**同 row field 用同一 size token**,混 size 是 bug(除非 spec 明文)。本 DS 的 36px md 對齊 Material dense(40dp)和 Polaris medium(36px),是 mainstream 值。

---

## 9. 跨 OS 一致 scrollbar

| 平台 | native scrollbar 行為 |
|------|--------------------|
| **macOS** | 預設 overlay(不吃寬度),滾動時淡入 |
| **Windows** | 預設 chunky(吃 ~15px 寬度),永遠可見 |
| **Linux GTK** | 類似 Windows(吃寬度) |
| **iOS / Android** | overlay |

**世界級 idiom**:
- **Web DS 用 overlay scrollbar 跨 OS 一致**(Radix ScrollArea / Ant Design Scrollbar 都這樣做)
- **原因**:Windows native scrollbar 吃寬度會讓同一 page 在 Mac 和 Windows 上 layout 不同,違反「設計在任何平台視覺一致」

對應 DS:`components/ScrollArea/` + `node_modules/@qijenchen/design-system/ds-canonical/references/build-ui-canonicals.md`「overflow 使用三規則」。

---

## 10. Zoom / step 幅度

| App | 單次 zoom-in step |
|-----|-----------------|
| **Figma** | 約 1.1×(持續滾輪)/ `Cmd+=` 跳到 preset(50%/100%/200%) |
| **Photoshop** | 1.2×(`Alt + 滾輪`)/ preset jumps |
| **Adobe XD** | 1.1× 滾輪 |
| **Sketch** | 1.1× 滾輪 |
| **Google Maps** | 2× per step(但 maps 是 tile-based,不同場景) |
| **PDF viewers(Preview / Acrobat)** | 1.25× |

**世界級 idiom**:
- **圖片 / 設計工具的滾輪 zoom 介於 1.1×–1.25×**
- **跳大步(1.5× / 2×)只適合 tile-based 地圖**,不適合 image viewer
- **跳太小(1.02×)user 要滑很久**
- 本 DS 的 ImageViewer / FileViewer 應落在 1.1×–1.2×

---

## 11. Dark mode 對比

| DS | 規範重點 |
|----|---------|
| **Material 3** | dark surface `#121212`,elevation 用 overlay 白色提亮(不同 layer 不同透明度) |
| **Apple HIG dark** | system dark bg `#1c1c1e`,text `#ffffff` with 100% opacity;對比需 ≥ 4.5:1 |
| **Polaris dark** | semantic token 反轉,shadow 改用 inverse-foreground 微提亮 |
| **Atlassian ADG dark** | neutral palette 反轉;每 elevation level dark mode 都有對應 token |

**世界級 idiom**:
- **WCAG AA 對比 ≥ 4.5:1**(body text)/ 3:1(large text)
- **Dark mode shadow 不消失**——要麼改用 overlay(Material 方式)要麼降低 opacity 仍保留
- **永遠 dark 的工具列**(圖像編輯器、影片播放器)是世界級慣例(Photoshop、Premiere、YouTube Studio)——鎖住 `data-theme="dark"` 不跟全域切

---

## 12. Overflow indicator(Tabs / Chip)

| DS | 規範重點 |
|----|---------|
| **Material 3 Tabs** | scrollable 模式 + fade mask 16dp,箭頭 40dp 寬度可點擊但視覺只佔 16dp |
| **Polaris Tabs** | 溢出用「More」button 收納(不是 fade mask) |
| **Atlassian Tabs** | 箭頭 overflow 按鈕,不蓋 text |

**世界級 idiom**:
- **fade mask 寬度 16–32px** 足夠提示「有更多」,不蓋完整 item
- **箭頭按鈕用 overlay 層**(不佔 tab 寬度),不蓋 item 可讀部分
- **極端位置(最左 / 最右)對應邊指示器消失**——不再有溢出就不再提示

---

## 13. 箭頭按鈕定位(Carousel / ImageViewer)

| App / DS | 規範重點 |
|---------|---------|
| **Carousel.swiper.js default** | 箭頭離 container 邊 10px,y 方向 50%(置中),半透明 bg |
| **Apple HIG Photos** | 箭頭隱藏於 hover,位置 container 外側 12pt |
| **Figma thumbnail grid** | 無箭頭,用滑鼠拖曳(不同範式) |
| **Google Photos lightbox** | 箭頭 y-center,離 container 邊 16px,40×40 hit area |
| **Ant Design Carousel** | 箭頭 y-center,離 container 邊 12px |

**世界級 idiom**:
- **兩箭頭對稱(prev 離左 == next 離右)**
- **y 方向 content 垂直置中**(y=50%)
- **不蓋核心 content**——寧可半透明 bg + 箭頭偏外,也不讓箭頭 shadow content text
- **箭頭到邊用 token**,不硬寫 px(避免不同 size carousel 比例跑掉)

---

## 通用:如何引用本檔的 benchmark

在 audit report FAIL 項寫:
```
對應規則: DS 無明文 canonical → 世界級對照見 world-class-benchmarks.md §N
Benchmark: Material/Polaris/Atlassian 通常 X(本元件為 Y)
建議討論: 是補 spec rationale 還是調向世界級 X
```

**不可**單以本檔為判決依據 FAIL(DS 內 spec 為第一順位);本檔是**補 rationale 的參考錨**,不是 canonical。
