# Avatar 設計原則

## 定位

Avatar 是視覺身份標識——代表一個人、一個實體（專案、組織、App）。不是裝飾。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：純視覺 atom——img + 文字 fallback 組合，無 external primitive base。Radix 有 Avatar primitive 但只提供 fallback 邏輯，本 DS 直接用 native `<img>` + CSS + 錯誤處理已足夠，避免多一層依賴。

---

## 何時用

- **人員識別**：留言者頭像、指派者、作者、團隊成員列表
- **組織 / 專案識別**：workspace logo、專案 icon、app 身份
- **列表項目的主視覺 prefix**：通訊錄、成員管理、chat room 列表
- **hover 顯示完整人員卡**：與 HoverCard 搭配呈現 NameCard content

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 抽象概念 icon（設定、通知、搜尋）| Lucide Icon | Avatar 代表實體身份，icon 代表動作 / 概念 |
| 純文字的 name chip（「陳麒仁」單獨顯示）| `Tag` / 純文字 | Avatar 是視覺 + fallback 文字，純文字 label 用 Tag |
| 人員資訊卡（name + title + actions）| `NameCard`（內部含 Avatar）| NameCard 是組合元件，Avatar 是其中的身份 prefix |
| 通知計數指示 | `Badge`（可疊加在 Avatar 右上）| Avatar 承載身份，Badge 承載計數 |

---

## Avatar HoverCard 原則

**任何有頭像的地方，hover 時出現 name card（HoverCard）。**

不論頭像出現在 PeoplePicker tag、table cell、sidebar、comment、avatar 堆疊——只要是人員頭像，hover 一律觸發 HoverCard 顯示 name card（完整姓名、部門、聯絡方式等）。

### 溢出人員列表（+N）

Avatar 堆疊的「+N」hover 也出 **HoverCard**（不是 Tooltip），因為：
- 列表內的 person tag 需要 dismiss 功能（互動）
- 每個 person tag hover 需要再出 name card（嵌套 HoverCard）
- Tooltip 是非互動的，不支援上述需求

架構：`+N → HoverCard（人員列表）→ 每個人名 → HoverCard（name card）`

### 純文字截斷 vs 人員頭像

| 被截斷的內容 | Hover 顯示 | 元件 |
|---|---|---|
| 人員頭像 | name card（完整資訊 + 操作） | HoverCard |
| 純文字（檔名、標題） | 完整文字 | Tooltip |

---

## 三種內容模式

按優先順序：

| 模式 | 觸發條件 | 內容 | 用途 |
|---|---|---|---|
| **Image** | 有 `src` | 圖片填滿 | 照片、上傳頭像 |
| **Icon** | 有 `icon` 或 src 載入失敗且無 alt | LucideIcon 在底色背景 | 類別標識、預設頭像 |
| **Text** | 有 `alt` 且無 src/icon | 首字大寫 | 無照片時的 fallback |

圖片載入失敗自動降級為 Icon 或 Text fallback。

---

## 尺寸

`size` 接受 **數字（px）** 或字串 **`'fill'`**。**不提供預設尺寸名稱**——尺寸由消費元件（item-layout 系統）決定。

### 兩種模式

| `size` 值 | 行為 | 何時用 |
|----------|------|------|
| `number`（預設 32） | Avatar 寫死為固定 px 尺寸 | 獨立使用、需要明確尺寸時 |
| `'fill'` | Avatar 填滿父容器（`width:100% height:100%`），icon 用 60% 寬高、文字用 `50cqi`（container query inline-size） | 父容器（如 MenuItem 的 prefix slot）已決定尺寸時 |

**為什麼有 `'fill'` 模式**：當 Avatar 放在 item-layout 的 prefix slot，prefix 的尺寸由消費元件（MenuItem、ListItem 等）依照 size variant 決定。Avatar 不該知道也不該寫死自己的尺寸——應該被動填滿父容器。`'fill'` 模式透過 CSS container query 讓內部 icon/text 自動隨父容器縮放。

### 內部元素比例

不論哪個模式，內部 icon 和 text 都按相同比例：

| 元素 | 公式 | 範例（size=32） |
|---|---|---|
| Icon | `round_even(size × 0.6)`（fill 模式用 `width:60% height:60%`） | 20px |
| Text fallback 字體 | `round(size × 0.5)`（fill 模式用 `font-size:50cqi`） | 16px |

- Icon 60%：業界標準（Material Design、Apple HIG）
- Text 50%：業界標準（Material Design、GitHub），且自動對齊我們的字體 scale（10→12→16→20px）

### 常用尺寸參考

由 item-layout 消費元件決定：

| 場景 | Avatar 用法 |
|---|---|
| Menu item / List item inside prefix slot | `<Avatar size="fill" />`（讓父 prefix 控制尺寸） |
| 獨立使用（page header user avatar 等） | `<Avatar size={40} />`（顯式指定 px） |

---

## 圓 vs 方的語意判斷

| Shape | 用途 |
|---|---|
| `circle`（預設） | 人物（照片、姓名） |
| `square` | 實體（專案、組織、App、品牌） |

**判斷標準：「這個 avatar 代表一個人，還是一個東西？」** 圓角 token 見 `.tsx` cva。

---

## 背景色

Icon 和 Text 模式使用 primitive step-1 subtle 背景 + 對應 step-7 前景色。`solid` boolean prop 可切換為 step-6 全色背景 + 白色前景。

與 Tag 元件完全對齊——所有有色 variant 直接使用 primitive token（`--color-blue-*`、`--color-deep-orange-*` 等），不使用 semantic token（`--primary`、`--error`）。Avatar 的「blue」代表藍色本身，不代表「主要操作」語義。neutral 用 `foreground`，有色用 primitive step-7（`--color-{hue}-7`）優先辨識度。

**注意**：`red` variant 使用 primitive `deep-orange`（`--color-deep-orange-*`）。

### Subtle（預設，`solid=false`）

| Color | 背景 | 前景 |
|---|---|---|
| neutral（預設） | `--muted` | **`--foreground`** |
| blue | `--color-blue-1` | `--color-blue-7` |
| red | `--color-deep-orange-1` | `--color-deep-orange-7` |
| green | `--color-green-1` | `--color-green-7` |
| yellow | `--color-yellow-1` | `--color-yellow-7` |
| turquoise | `--color-turquoise-1` | `--color-turquoise-7` |
| purple | `--color-purple-1` | `--color-purple-7` |
| magenta | `--color-magenta-1` | `--color-magenta-7` |
| indigo | `--color-indigo-1` | `--color-indigo-7` |

### Solid（`solid=true`）

step-6 全色背景 + 白色前景，適合需要更強視覺權重的場景。

| Color | 背景 | 前景 |
|---|---|---|
| neutral | `--color-neutral-9` | `--inverse-fg` |
| blue | `--color-blue-6` | white |
| red | `--color-deep-orange-6` | white |
| green | `--color-green-6` | white |
| yellow | `--color-yellow-6` | **`--warning-foreground`** |
| turquoise | `--color-turquoise-6` | white |
| purple | `--color-purple-6` | white |
| magenta | `--color-magenta-6` | white |
| indigo | `--color-indigo-6` | white |

**yellow 例外**：yellow solid 背景亮度高，白字對比不足，改用 `--warning-foreground`（深色文字）。

Image 模式不顯示背景色（圖片填滿），`solid` prop 無效果。

---

## Disabled

Avatar 在 disabled 元件內使用 `opacity-disabled`（由宿主元件控制，非 Avatar 自身 prop）。詳見 `color.spec.md` 的 Disabled 狀態。

---

## 禁止事項

- ❌ 不要用 Avatar 當裝飾——每個 Avatar 必須代表一個明確的身份
- ❌ 不要手動指定 icon 尺寸——60% 自動計算
- ❌ 不要用 square 給人物——人用 circle，東西用 square
- ❌ 不要省略 `alt`——即使有 `src`，`alt` 是圖片失敗時的 fallback 來源

---

## 為何無 StateBehavior

Avatar 是**身份視覺 primitive**(顯示人 / 組織 / 物件的代表視覺),本身**非互動元件**:

- 無 hover / focus / active / selected / disabled 這類 state。
- disabled 由宿主元件透過 `opacity-disabled` 控制(見本 spec「Disabled」段),不是 Avatar 自身的 state。
- hover 行為(彈 NameCard)由 `hoverCard` prop 委託給 HoverCard primitive 處理,屬 HoverCard 的 state 不屬 Avatar。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix`。
