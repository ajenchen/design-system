---
component: Badge
family: self-contained
variants:
  critical:
    when: "最高優先級通知 — 錯誤計數 / 緊急徽章（Gmail 未讀 / iOS notification red dot）"
    world-class: ["Polaris Badge tone=critical", "Material Badge error", "Ant Badge status=error / count"]
  high:
    when: "高優先級通知 — 主要計數（Slack 訊息計數 / GitHub PR review badge）"
    world-class: ["Polaris Badge tone=info", "Material Badge primary", "Atlassian Lozenge inProgress"]
  medium:
    when: "中優先級提示 — 次級計數（Linear issue count / Notion sidebar indicator）"
    world-class: ["Polaris Badge tone=info subtle", "Ant Badge status=processing"]
  low:
    when: "低強度指示 — 使用者切 tab 才看（Slack sidebar 靜默標記 / VS Code tab modified dot）"
    world-class: ["Polaris Badge tone=new", "GitHub subtle count"]
sizes: {}
traits:
  - hasVariants
  - isMatrixHeavy
benchmark:
  - Ant Design Badge: github.com/ant-design/ant-design/tree/master/components/badge
  - MUI Badge: github.com/mui/material-ui/tree/master/packages/mui-material/src/Badge
  - Polaris Badge: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Badge
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Badge 設計原則

## 定位

Badge 是通知計數指示器，用於未讀數量、待辦計數、狀態紅點。不是分類標籤（那是 Tag）。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：純視覺 atom——styled span，無 external primitive base。

---

## 何時用

- **通知計數**：收件匣未讀數（3）、待辦事項數（12）、notification center 新訊息數
- **狀態紅點**（dot 模式,只 critical/high）：新功能提示、「有新內容」不需具體數字的單一 attention 點
- **疊加在互動元件右上角**：Button iconOnly + Badge 通知 icon（鈴鐺 + 3）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 分類標籤（產品類別、角色分類）| `Tag` | Tag 較大、可含 icon/dismiss，適合承載語意；Badge 是計數指示器 |
| 狀態描述（In stock / Out of stock）| `Tag` + 色彩 | 狀態語意用 Tag 的 variant 系統（green/yellow/red）更明確 |
| 過濾 / 選擇（filter chip）| `Chip` | Badge 不可互動，Chip 是 filter 選取 |
| Loading 指示 | `CircularProgress` | Badge 是數字或 dot,loading 用旋轉動畫 |
| 版本 / 角色標記(「Beta」「Pro」「Admin」)| `Tag` | Badge 僅 count / dot 兩模式,**無文字承載**(text-only badge 屬 tech debt,見 principles story);文字標記走 Tag |

---

## 層級（Variant）

四個層級代表**通知內容的緊急程度**——從 low（被動資訊）到 critical（立即處理）。

**核心原則：Default LOW, escalate only with reason.**

Badge 的 level **反映內容的緊急程度，不是 container 的視覺權重**——從 low 起跳，只有當通知內容本身值得更多注意力時才升級。這樣 critical 的 notification 色(deep-orange)從「罕見」獲得信號價值，過度使用會讓使用者麻木、無法分辨真正的急迫。

| Variant | 視覺 | 使用者錯過會怎樣 |
|---------|------|------------------|
| `low`（起點）★ cva default | 灰底灰字（neutral-3 + neutral-7） | **無影響**——只是「目前有這麼多」的資訊，不讀也沒關係 |
| `medium` | 淺藍底藍字（bg-info-subtle） | **輕微不便**——少了資訊但不影響主要流程 |
| `high` | 藍底白字（bg-info） | **有感影響**——工作會堆積、待辦會過期，但不是立即傷害 |
| `critical` | deep-orange 底白字（bg-notification = `--color-deep-orange-6`,hue 38;非 categorical red hue 25） | **直接傷害**——錯過訊息會造成資料遺失 / 錯過機會 / 帳戶問題 |

### Dot 變體（只 `critical` / `high`,2026-06-05 user 拍板 Option A）

**dot 模式只接 `critical` / `high` 兩個高訊號 attention 色,不提供 `medium` / `low` dot。** dot = 「這裡有東西要看」的單一 attention 點(預設 `critical`);6px 純色圓點無文字、只能靠顏色傳達——淡灰(low)/ 淺藍(medium)的 6px 點幾乎看不見,也傳達不了「值得注意」,**不 earn existence**。

- **世界級對照**:Material small-badge = 單色 attention dot;Ant Badge `status` dot = success/error/warning/**default(灰)**,語意 status 非 severity;Polaris = 語意 status tone,無 low/medium/high dot;Atlassian presence/status dot 另開元件。**無一家把 dot 做成 4 級 severity 刻度**。
- **medium / low 仍完整保留於 count badge**(有文字承載對比,淡底合理)。
- **型別機械強制**:`BadgeProps` 為 discriminated union,`dot: true` 時 `variant` 限 `'critical' | 'high'`(傳 medium/low → compile error)。
- 需「中性/inactive」的實心灰點 → 走 `--status-offline`(neutral-6 實心)presence 系統,非 Badge dot。

### 選 level 的流程

**從 low 起跳,四步驟逐步升級**。每一步都要有**明確理由**才升級;沒理由就留在 low。

1. **從 low 開始問**：這是「被動計數」嗎？（Inbox 總數、已完成數、tab item 內容總數）→ 是 → **用 low**
2. **升到 medium**：是「供參考、可延後看的資訊」嗎？（評論數、更新數）→ 是 → **升 medium**
3. **升到 high**：是「有感影響的待辦」嗎？（未完成 task、已套用 filter 數）→ 是 → **升 high**
4. **升到 critical**：是「立即需要處理的急迫」嗎？（錯誤計數、付款失敗、未讀私訊）→ 是 → **升 critical**

### 具體場景對照（從 low 起跳順序）

| 場景 | Level | 為什麼 |
|------|-------|--------|
| Tab item 的內容總數（「文件 (12)」） | `low` | 使用者切 tab 才看，不需搶注意力 |
| Archive / Trash 數量 | `low` | 被動資訊，使用者只在需要時才看 |
| Inbox 總數（不是「未讀」） | `low` | 參考數字，無 call-to-action |
| 已完成 task 總數 | `low` | 成就指標，不期待使用者關注 |
| 可用更新數量（套件、訂閱） | `medium` | 有參考價值，延遲看不影響 |
| 評論 / 回覆計數 | `medium` | 社交互動，可延後處理 |
| 新功能提示(dot)| `high` | 重要但可延後，非必要立即處理 |
| 待辦事項計數 | `high` | 工作會堆積，有感影響 |
| Active toggle 顯示計數（如 Filter [3]、Bold pressed 的套用數）| `high`（或 `medium`）| Active 狀態補充資訊，不是急迫訊號 |
| 通知中心 bell icon 的數字 | `high` 或 `critical` | 視內部通知性質，全是急迫才 critical |
| Email / Slack 未讀訊息 | `critical` | 錯過會錯過溝通，notification 色觸發 action |
| 錯誤計數（表單 / CI） | `critical` | 必須立即處理才能繼續 |
| 帳戶警告（付款失敗、到期） | `critical` | 有金錢 / 服務中斷風險 |

### 色彩硬規則（不可違反）

- **❌ Critical 不是 notification 色就是錯誤**——critical 永遠 `bg-notification`(deep-orange-6)。改色等於改信號語意，稀釋 notification 色在產品內的「急迫」意義
- **❌ High 不能用 notification 色**——會跟 critical 搶信號。藍色是「重要但不急」的全球共識
- **❌ 不能為了「視覺統一」把所有 badge 降 level**——使用者需要看到 level 差異才能分配注意力，全部 low 等於沒 badge
- **❌ 不能為了「強調」把 low 升 level**——升 level 改變的是「這件事多重要」的承諾，不是消費者的偏好

### 級別使用頻率的自我檢查

一個畫面上**最多 1-2 個 `critical` badge**。更多代表：
1. 使用者真的有多個急迫狀況（罕見）→ 合理
2. 把不急迫的事標成 critical（常見錯誤）→ 降級

### 層級與容器的關係：雙重約束

Badge level 同時受**兩個約束**，取較高者：

- **Semantic level（業務需求）**：內容真正的 urgency，按「選 level 的流程」從 low 起跳
- **Contrast floor（可見度下限）**：container 的 bg 決定 badge **至少** 要是哪個 level 才看得清

**最終 level = max(semantic, contrast floor)**

兩個約束各自可以獨立推高 level：
- 業務需求更急 → 升 semantic → 拉高最終 level
- Container bg 更深 → 提高 contrast floor → 拉高最終 level

Contrast floor **是下限不是上限**——不限制 semantic 繼續往上。業務需求永遠可以再升。

### 三種常見情況

| 情況 | Semantic | Contrast floor | 最終 | 說明 |
|------|---------|----------------|------|------|
| **Case 1：semantic ≥ floor** | `high` | `low`（text button）| `high` | 用 semantic，contrast 不是問題 |
| **Case 2：semantic < floor** | `low`（passive count）| `high`（primary button）| `high` | 被迫 bump 到 floor——**設計錯配訊號** |
| **Case 3：後來業務升級** | 原 `high` → 新 `critical` | `high` | `critical` | semantic 升，最終跟著升，不受 floor 封頂 |

### 各容器的 contrast floor 對照

| 容器 | Contrast floor | 多數 semantic 可直接用 |
|------|----------------|---------------------|
| text / tab item / icon button（透明 / 極淺） | `low` | ✓ 99% 場景 |
| secondary / tertiary（淺底帶邊框） | `low` | ✓ |
| checked（pressed state，通常淺灰或 subtle 底） | `low` / `medium` | ✓ 多數直接用；bg 較深時 floor 提高 |
| primary / secondary+danger（飽和深底） | `high` | low/medium 被迫 bump；high/critical 直接用 |

**Critical 的深底白字對比在任何底色上都清楚**——不存在「critical 看不清」的場景。

### Case 2 是設計錯配訊號

若 semantic = low（passive count）+ contrast floor = high/critical（primary button），被迫跨 2+ 階 bump，代表 **badge 放錯地方**：

1. **問：這個 badge 真的屬於這裡嗎？** primary button 強調 action，passive 計數在此語意矛盾
2. **用 dot 模式取代 count**：純圓點傳達「有東西」但不干擾主 action
3. **把 badge 移到外部**：按鈕旁邊 label 顯示計數，而非疊在按鈕上
4. **乾脆不放 badge**：passive 資訊在強 CTA 上本來就次要

**Case 1 和 Case 3 永遠合法**——semantic 本身高，不受 floor 影響。只有 Case 2（被迫跨階 bump）才是警訊。

---

## 字體例外：`text-[10px]`（documented sub-footnote）

Badge count 模式的數字使用 `text-[10px]`,低於 typography 系統最小的 `--font-footnote`（12px）。這是 **Badge 獨有的合法例外**：

- **為什麼不加新 typography token**: 10px 是「count indicator 專用尺寸」,全系統**只有 Badge / OverflowIndicator 兩處**使用；創一個 `--font-micro` token 只為這兩個消費者會過度 generalization
- **為什麼合法**: Badge count 是輔助 indicator（次要訊號）,12px 字寬在 16×16 的圓形 Badge 內缺乏 padding 呼吸(字徑/圓徑比例過密)。對照世界級:Material Badge 10sp、Polaris Badge 字級小於 body、GitHub Counter 10-11px 都小於 body footnote <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **其他元件不得比照**: 若新元件覺得需要 `text-[10px]`,先問「真的不是 footnote 12px 可以解決嗎」,99% 情境 footnote 夠用;真有需求跟 Badge / OverflowIndicator 歸同一 micro-indicator family 討論

---

## 模式：Count vs Dot

兩種模式傳達不同強度的訊號——**精確數字** vs **存在性指示**。

### Count — 精確數字

**何時用**：數字本身有意義（3 vs 30 vs 300 觸發不同 urgency），使用者需要「還剩多少」的資訊。
- 未讀訊息數、錯誤數、待辦事項數、購物車品項數
- 使用者會根據數字大小決定行動優先序

**實作**：固定高度小於 Field 元件（保持輔助層級）；個位數時為正圓，多位數時變膠囊——由 count 長度自動決定形狀。具體 token / class 見 `.tsx` cva。

### Dot — 存在性指示

**何時用**：「有東西」本身就是訊號，具體數量不重要或無意義。
- 新功能提示、「有新內容」、在線狀態、unsaved changes 標示
- 避免「99+」的視覺噪音時（知道有即可、不需要精確數字）

**實作**：小尺寸純色圓點，無文字。具體 size 見 `.tsx` cva。

### 判斷流程

問：「**使用者想知道『有沒有』還是『多少』？**」
- 知道有就夠 → `dot`
- 需要數量判斷 urgency → `count`

**如果 count 永遠顯示 max+（例如 99+）**：代表資訊超出計數承載力——改用 dot 或提高 max threshold，別讓使用者永遠看到「99+」失去數字價值。

---

## Max 上限的選擇

| Max | 適合場景 | 原因 |
|-----|---------|------|
| `max={9}` | 錯誤 / 嚴重告警 / 關鍵 task | 超過 9 代表資料異常或需重新設計流程 |
| `max={99}`（常見預設） | 一般通知、訊息 | 多數 app 的常態分布 |
| `max={999}` | 社群 / 高頻通知（Twitter / Instagram） | 活躍使用者正常可累積 3 位數 |
| 無 `max` | 資料需真實反映（報表計數） | UI 寬度需設計側處理 |

**Max threshold 應匹配資料常態分布**：
- 若 99+ 是常態 → threshold 失去區別力，升到 999
- 若從沒超過 20 → max=99 就夠，太大反而浪費 UI 空間
- 永遠卡 max+ = 使用者無法判斷「多急迫」，等於沒有 count

---

## 放置模式（Placement）

Badge 有三種常見放置，各有不同視覺語意。**企業軟體 80% 情境是 Inline**（列表 / tab / section title 的計數），Overlay 反而是少數；**先從 Inline 開始考慮，只在容器是「單一視覺重心」時才升 Overlay**。

### 判斷流程（企業 > 消費級）

```
Q1. 容器有 label 嗎?(tab item / menu item / section title / list row)
    → YES → Inline(Slack sidebar channel「# general · 3」/ Linear tab「Todo 12」)
    → NO → Q2

Q2. 容器是「單一視覺重心」嗎?(iconOnly button / 純 icon / avatar)
    → YES → Overlay(iOS App icon / bell icon + 3 / Avatar + presence)
    → NO → Q3

Q3. Badge 自己獨立呈現狀態嗎?(無宿主元件)
    → YES → Standalone(「● 同步失敗」狀態 row)
```

**為什麼 Inline 在企業更常見**：
- B2B 介面充滿「label + 計數」場景:tab(Todo 12 / Done 5)/ sidebar section(Projects 8 / Archive)/ menu item(Settings · 2 待處理)
- Overlay 需要額外 `aria-label` 整合(「通知 (3 則)」),inline 直接讀「文件 12」—— 語意更直接
- 企業 UI 的 container 多帶 label,天生適合 inline;消費級(iOS home / WhatsApp chat)大量 icon-only chrome 才大量用 overlay

### 1. Overlay（疊加在元件角落）

```tsx
// ✅ Canonical:Button 的 overlayBadge prop — badge 內部貼 icon 右上角
<Button variant="tertiary" size="sm" iconOnly startIcon={Bell}
        aria-label="通知 (3 則)"
        overlayBadge={<Badge count={3} variant="high" />} />

// ✅ Avatar 走自己的 badgeCount / status prop(見 avatar.spec.md)
<Avatar alt="Ada" size={40} status="online" badgeCount={3} />

// ❌ Anti-pattern:手刻 relative + absolute 定位 button chrome 角落
<div className="relative inline-flex">
  <Button iconOnly startIcon={Bell} />
  <Badge count={3} className="absolute -top-1 -right-1" />  // ← 離 icon 太遠
</div>
```

- **語意**：元件主內容（icon / avatar）+ 補充通知
- **實作**：badge **絕對定位相對於 icon / avatar 視覺重心**,不相對於 interactive chrome。Button `overlayBadge` prop 內部用 `<span className="relative inline-block">`(明確鎖 width/height = iconSize)包 icon、badge 中心對齊 icon top-right corner(Material BadgedBox canonical)。**不再允許** consumer 手刻 `<div relative><Button/><Badge absolute/></div>`——padding 差距會讓 badge 飄到 chrome 角 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **世界級對照**：Material BadgedBox / iOS App Icon / Ant Design Badge — 全部 wrap 視覺重心(icon / avatar),不 wrap interactive chrome(button padding) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **aria**：parent 元件的 `aria-label` 包含 badge 資訊（見「無障礙」）

### Overlay 適用元件 canonical(2026-04-20)

**Overlay 只疊在「單一視覺重心」元件上**:
- ✅ **iconOnly Button**(按鈕本身 = icon,badge 疊 icon 角落語義清楚)
- ✅ **Avatar**(圓 / 方 avatar 本身 = 單一視覺)
- ✅ **純 Icon**(inline Bell / MessageSquare 等)

**禁止疊在**:
- ❌ **text + icon Button**:按鈕寬度遠大於 icon,badge 跑到按鈕右邊緣,離 icon 太遠,視覺上 dot / count 跟 icon 語義無法配對。使用者不會把 "飄在按鈕邊緣的小點" 和齒輪 icon 的 "有新功能" 連結起來。改用:(a) 按鈕改 iconOnly、(b) 移除 overlay 改 inline badge 在 text 後。
- ❌ **Primary / 主 CTA button**:contrast floor 會逼 badge 升階到 critical,扭曲 passive count 的語意(見「Contrast floor」rule)。Archive 這種歸檔動作本來就不該是 primary;正確做法是按鈕降級 tertiary + badge 回歸 low。

世界級對照:iOS / Material / macOS / Slack 的 badge dot 永遠貼在 **App icon 或單一 icon** 上,從不疊在「icon + text」的 inline button 右上角。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### 2. Inline（跟 label 並列）

Tab / Menu item / Section title 旁邊顯示計數。

```tsx
<div className="flex items-center gap-2">
  <span>文件</span>
  <Badge count={12} variant="low" />
</div>
```

- **語意**：label + 計數，一體展示
- **實作**：不用 absolute，`gap` 控制間距
- **常見錯誤**：把 inline 場景的 badge 做成 overlay，label 和 badge 視覺斷開

### 3. Standalone（獨立狀態指示）

作為狀態 dot 獨立存在，無宿主元件。

```tsx
<div className="flex items-center gap-2">
  <Badge dot variant="critical" aria-label="同步失敗" />
  <span>同步失敗</span>
</div>
```

- **語意**：狀態指示 + 描述文字並列
- **通常 dot 模式**（純視覺訊號）

---

## 無障礙

Badge 必須讓 screen reader 使用者獲得**同等資訊**——不能只靠視覺（顏色 / 位置）傳達意義。

### aria-label 模式

**Count 模式**：badge 的數字會被讀出，但需要 context 才有意義。在 parent 元件加 aria-label 整合主內容 + 計數：

```tsx
<button aria-label="通知 (3 則未讀)">
  <Bell />
  <Badge count={3} variant="critical" />
</button>
```

**Dot 模式**：無文字 → screen reader 完全看不到 → **必須**給 `aria-label`：

```tsx
<Badge dot variant="critical" aria-label="有新訊息" />
```

### 色彩不獨立承載意義（color-blind）

Badge 的 level 靠顏色區分(deep-orange / 藍 / 灰)——color-blind 使用者可能無法分辨 critical vs high。

**必須**搭配：
- **Count 數字或 aria-label 傳達具體內容**（「3 則緊急錯誤」而非單純「紅色 badge 3」）
- **容器上的其他視覺指示**（icon / 文字標籤）共同傳達意義

單靠 badge 顏色承載語意（「紅色代表緊急」）會讓 color-blind 使用者錯過關鍵資訊。

---

## 禁止事項

- ❌ 不用 Badge 做分類標籤——那是 Tag
- ❌ dot 模式不帶 `aria-label`——無文字的 dot 對 screen reader 完全不存在
- ❌ 單靠顏色傳達 urgency——必須搭配 aria-label / count / 其他視覺指示
- ❌ 一個元件疊加**多個同類 badge**(signal crowding)——規則看**元件本身的 overlay slot 設計**:

  **判斷法(決定性)**:**看元件本身提供幾個 overlay slot prop**
  - 元件只暴露 **1 個 overlay slot**(例:`<Button overlayBadge={...}>`)→ **只能有 1 個 badge**,consumer 無法合法疊多個(DS 擋下手刻 `absolute` 疊加)
  - 元件暴露 **多個具名 slot**(例:`<Avatar status={...} badgeCount={...}>` — status 在右下、count 在右上,兩個獨立 prop)→ **可合法疊加,最多到 slot 數量**
  
  **Avatar 可以疊兩個 badge**(status + count),因為 DS canonical 設計了兩個不同角、不同語義的 slot(presence 狀態 / 未讀數量)——這是 iMessage / Slack / LINE 標配。
  
  **Button iconOnly 只能疊一個 badge**(透過 `overlayBadge` prop),DS 不提供第二個 slot——任何「右上 count + 右下 dot」之類的手刻疊加都是 signal crowding 反例,使用者無法判斷哪個訊號重要。想同時表達兩種訊號 → 合併成一個 badge(count + 色彩分級)或重新思考資訊架構
- ❌ Overlay badge 的 `absolute` 定位相對於 interactive chrome(button / card padding)——badge 必須相對於**視覺重心**(icon / avatar)定位,否則 dot 會飄在 chrome padding 空間裡,離 icon 太遠失去語義連結。canonical:`<Button iconOnly overlayBadge={...}>`(Button 內部貼 icon 角)、或 consumer 自包時把 `relative` 放 icon wrapper 而非 button
- ❌ Count 永遠顯示 max+（如永遠 99+）——threshold 失去區別力，改用 dot 或升高 max
- ❌ 為了「視覺統一」把所有 badge 降 level——使用者需要 level 差異分配注意力
- ❌ 為了「強調」把 low 升 level——升 level 是「這件事多重要」的承諾，不是偏好問題
- ❌ 為了 contrast 把 semantic = low 的 badge 跨 2+ 階 bump——設計錯配，重新考慮放置

---

## 為何無 StateBehavior

Badge 是**計數 / 狀態視覺指示器**,本身**非互動元件**:

- 無 hover / focus / active / selected / disabled 這類 state。
- Badge 通常依附在互動元件上(Button / Nav Item),那些元件有自己的 state——Badge 隨父層視覺連動,不擁有獨立 state。
- 計數變化(`count` 更新)屬資料更新不是 UI state 切換。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix`。

---

## 相關

- `../Tag/tag.spec.md` — 分類標籤、狀態標記（Badge vs Tag 的詳細對照在本 spec 定位段落）
- `../Avatar/avatar.spec.md` — `badgeCount` 內部消費 `<Badge variant="critical">`（遵循本 spec）;`status` 是 Avatar 自有 presence SVG（非 Badge 系統）,兩者可並存,詳該 spec
- `../Button/button.spec.md` — iconOnly Button + Badge overlay 通知 icon 的組合模式
- `../Chip/chip.spec.md` — 可互動 filter（不是 Badge 的用途）
- `../CircularProgress/circular-progress.spec.md` — Loading 狀態指示(取代 Spinner)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `avatar.spec.md`
- `button.spec.md`
- `tag.spec.md`
