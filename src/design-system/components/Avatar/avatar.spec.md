---
component: Avatar
family: null
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isMatrixHeavy
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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
| 純文字的 name chip（「Ada Chen」單獨顯示）| `Tag` / 純文字 | Avatar 是視覺 + fallback 文字，純文字 label 用 Tag |
| 人員資訊卡（name + title + actions）| `NameCard`（內部含 Avatar）| NameCard 是組合元件，Avatar 是其中的身份 prefix |
| 通知計數指示 | `Badge`（可疊加在 Avatar 右上）| Avatar 承載身份，Badge 承載計數 |

---

## Avatar HoverCard 原則(DS-wide canonical,必遵守)

**任何 person avatar,hover 必出現 NameCard(HoverCard)。預設行為,不 opt-in**。

**消費者實作 canonical**:
```tsx
<Avatar
  size={40}
  src={person.photoUrl}
  alt={person.name}
  hoverCard={
    <NameCard
      name={person.name}
      avatar={{ src: person.photoUrl, alt: person.name }}
      subtitle={`${person.role}｜${person.employeeId}`}
      actions={<NameCardDefaultActions />}
      // ↓ hover context 必含 View more:hover 只顯示精簡資料,user 需要 escape hatch 到完整 profile 頁
      onViewMore={() => navigate(`/people/${person.id}`)}
    />
  }
/>
```

**`onViewMore` 為 hover context 必含**(2026-04-23 canonical):
hover NameCard 是 preview,所有 preview 必提供「看完整資料」的路徑。
缺 `onViewMore` 使用者點不到完整 profile → hover 成單向死路。對齊 Slack / Linear / Notion / Figma / Gmail hover-profile popover 必有 "View profile" link 的世界級 pattern。詳 `../NameCard/name-card.spec.md`「View more」canonical。

**適用範圍(ALL person avatars,無例外)**:
- PeoplePicker tag / table cell 頭像 / sidebar user / comment author / avatar 堆疊
- Dialog / Sheet body 的 member list
- FileItem rich 的 author avatar
- Menu / Dropdown 的 assignee / owner
- Chat / thread / notification 頭像

**世界級對照**(hover → profile 是 default,不是 opt-in):
- Slack:hover user avatar → profile popover(default)
- Figma:hover member avatar → profile card(default)
- Linear:hover assignee avatar → user card(default)
- Notion:hover person tag → user card(default)
- GitHub:hover username + avatar → user hover card(default)

**例外(不適用)**:
- Entity avatar(專案 / 組織 logo / app icon)— 不代表人員,hover 無 NameCard
- Bot / automated account avatar(Atlas / Octocat 等)— 本 DS 後續視需求決

**為什麼必 default**:
- Person avatar 單獨無 context(只有照片 + 首字),user 不知是誰
- 世界級 collaboration tool 都把 NameCard 當「身份展開」default affordance
- Opt-in 模式會讓一半的 consumer 忘記加,DS 品質不可控

**違規檢測(M10 proactive scan)**:
`grep '<Avatar.*alt=\{'` 全 src,檢查有無 person name(非 entity)alt 且沒 `hoverCard` prop。
未來會加 hook `check_avatar_hovercard.sh` 自動攔截。

**Keyboard 可達 canonical(2026-04-22 D4 UX audit 補齊)**:
當 Avatar 有 `hoverCard` prop,Avatar wrapper **必 keyboard focusable**,讓 keyboard-only user 也能 reach NameCard popover。Avatar 元件內部自動套:
- `tabIndex=0`(可 Tab 到)
- `role="button"` + `aria-haspopup="dialog"`(告訴 AT 這是可觸發 popover)
- `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`(keyboard focus 視覺 indicator)
- 若無 `hoverCard` → 純展示 `<div>` 不 focusable(避免 tabTrap 噪音)

Rationale:Radix `HoverCardTrigger asChild` 不自動加 tabIndex 給 non-focusable child。若 Avatar wrapper 是 `<div>` 沒 tabIndex,keyboard user 無法 reach NameCard content,違反 WCAG 2.1.1(Keyboard)+ 4.1.2(Name, Role, Value)。此 canonical 確保 DS-wide 「person avatar → NameCard」同時對 keyboard / screen reader 可達。

**Status dot a11y(2026-04-22 D4 UX audit 調整)**:Avatar status dot 內部 span 從原 `role="status"` + `aria-label="presence: online"` 改為 `aria-hidden`。Rationale:`role="status"` 是 live region,多 Avatars(member list / mention picker)會造成 SR 洪水噪音;presence 資訊應整合進 parent avatar 的 `aria-label`(world-class Slack / Teams / Discord 共通)— consumer 傳 `alt` 時自帶語意(e.g. `alt="Alan Chen (online)"`)。

**不論頭像出現在 PeoplePicker tag、table cell、sidebar、comment、avatar 堆疊——只要是人員頭像,hover 一律觸發 HoverCard 顯示 name card**(完整姓名、部門、聯絡方式等)。

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

## Overlay:Status dot OR Count badge(擇一,不並存)

Avatar 支援兩個 overlay API(`status` / `badgeCount`),**但同時只能用一個** — 對齊 **Badge canonical「一個 anchor 最多 1 個 indicator」原則**(2026-04-21 決策,user AR22)。

**為什麼不並存**:即使 status(presence dot)是 Avatar 內部 SVG 非 `<Badge>` 元件,視覺上 user 仍會把兩個右角落的小圓點視為「兩個訊號」。並存違反 **signal crowding** 原則(使用者無法判斷哪個訊號重要),對齊 Badge canonical 統一規則。

| Overlay | Prop | 元件本體 | 位置 | 語義 | 世界級對照 |
|---------|------|---------|------|------|-----------|
| Status dot(presence)| `status="online"/"away"/"busy"/"offline"` | **Avatar 內部 SVG**(非 Badge) | **右下角**(circle avatar 圓周 45°) | 此人現在線上狀態 | Slack / Teams / Discord |
| Count badge(通知)| `badgeCount={N}` | **`<Badge variant="critical">`**(此 anchor 唯一 Badge) | **右上角** | 此對話 / 此使用者有 N 條新事件 | iMessage / Slack thread / LINE / WhatsApp |

**為什麼不同角**:語義不衝突但不同面向——presence 是「這個人是誰 + 狀態」(右下跟著臉看);count 是「關於此對話的未讀量」(右上是視覺掃描 inbox 的自然落點)。世界級 chat app 把兩者分開,**不疊在同一角**。

**為什麼 status 做 Avatar 內部 SVG 而不是 `<Badge dot>`**:兩者語義完全不同——presence 是「這個人的狀態」,Badge 是「計數 / 通知緊急度」。若用 Badge 承載 presence,color token 會混用(Badge 有 low/medium/high/critical 對應緊急度,presence 有 online/busy/away/offline 對應狀態;強行映射會失真);brand 也無法獨立調 presence 色而不動 Badge 色。世界級 Slack / Teams / Discord 同樣把 presence dot 做成 avatar 自有 primitive,不走 badge 系統。

### Status dot 尺寸與比例

- `dotSize = clamp(8, round(avatarSize × 0.28), 16)` — 28% 是 Slack / Teams 世界級平均
- Floor 8:小 avatar(24-28px)下可辨識但不喧賓奪主(若 floor 10 → 24px avatar 的 dot 占 42% 太大)
- Ceiling 16:64px+ 的大 avatar 不讓 dot 過度放大,保持「輔助指示器」視覺權重
- Border ring:2px(dotSize < 12)/ 3px(dotSize ≥ 12)— 在 surface 背景上把 dot 從 avatar 邊緣分離

### Status 顏色 token(presence namespace)

走 semantic token `--status-online / --status-busy / --status-away / --status-offline`,**不直接用 success / error / warning**。理由:presence 跟「操作成功 / 錯誤 / 警告」是不同語境,token 獨立讓 brand 可以只調整 presence 色(例:把 online 改霓虹綠)不動到 success。

### Count badge 實作

Avatar `badgeCount` 內部消費 DS `<Badge variant="critical" max={99}>`,加上 `-top-1 -right-1` 偏移與 surface 色 2px border ring 分離邊界。`badgeCount <= 0` 不渲染(0 或 undefined 皆空)。

**為什麼預設 `critical`(紅)**:計數 on avatar 在世界級 chat app 的慣例就是「待處理未讀」,紅色是約定俗成的 attention 色;需要其他 variant 的少見情境,consumer 自己 compose `<Avatar>` + `<Badge>` top-right 手刻(不開 prop 避免多選擇認知負擔)。

---

## 禁止事項

- ❌ 不要用 Avatar 當裝飾——每個 Avatar 必須代表一個明確的身份
- ❌ 不要手動指定 icon 尺寸——60% 自動計算
- ❌ 不要用 square 給人物——人用 circle，東西用 square
- ❌ 不要省略 `alt`——即使有 `src`，`alt` 是圖片失敗時的 fallback 來源

---

## A11y 預設

- **`alt` 必傳**:即使有 `src`,`alt` 是 image fallback / SR 訊號雙重來源。Person avatar `alt` 應含 name + presence(例 `"Alan Chen (online)"`),entity avatar 用品牌 / 專案名,純裝飾(極罕見)用空字串 `alt=""`(`aria-hidden`)。
- **無 `alt` 時 fallback**:image 模式自動降級 initials / icon;一律不靜默渲染無 SR 標的元素。
- **Status dot SR 處理**:status dot 內部 span `aria-hidden`(presence 訊號整合進 parent `alt`),避免 `role="status"` live region 在 member list 造成 SR 洪水(詳「Status dot a11y」段)。
- **`badgeCount` 語意**:內部消費 `<Badge>`,Badge 自帶 `aria-label="N 則未讀"` 等語義(詳 `badge.spec.md`);`badgeCount={0}` 不渲染避免空 announce。
- **HoverCard 整合**:Avatar 帶 `hoverCard` prop 時自動 `tabIndex=0` + `role="button"` + `aria-haspopup="dialog"` + `focus-visible:ring-2`,確保 keyboard user 能 Tab 進入觸發 NameCard popover(詳「Keyboard 可達 canonical」段)。
- **Image alt 語意**:meaningful image(person photo / brand logo)用實質 `alt`;decorative-only(極少)走 `alt=""`,但 Avatar 本質是身份識別,decorative 用法應改用 Icon 元件。

---

## 為何無 StateBehavior

Avatar 是**身份視覺 primitive**(顯示人 / 組織 / 物件的代表視覺),本身**非互動元件**:

- 無 hover / focus / active / selected / disabled 這類 state。
- disabled 由宿主元件透過 `opacity-disabled` 控制(見本 spec「Disabled」段),不是 Avatar 自身的 state。
- hover 行為(彈 NameCard)由 `hoverCard` prop 委託給 HoverCard primitive 處理,屬 HoverCard 的 state 不屬 Avatar。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix`。

---

## 空值 / 驗證

N/A(非互動 primitive,consumer 決定何時渲染;`src` 為 null / 載入失敗時 fallback 到 initials)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-item.spec.md`
- `hover-card.spec.md`
- `menu-item.spec.md`
- `overflow-indicator.spec.md`
- `people-picker.spec.md`
