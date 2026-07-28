# Flow Diagram — Mermaid UI Flow 指引

---

## 為什麼用 Mermaid

- **Text-based**:可 git diff / review / version control
- **Storybook 支援**:`mdx` 可直接 render;純 `tsx` story 用 `<pre>` 包 mermaid source + 指引
- **世界級工具支援**:GitHub / Notion / GitLab / Confluence 都 render
- **Export**:可 export PNG / SVG / PDF 交付給不進 Storybook 的 stakeholder

---

## 基本語法

### flowchart(最常用)

```mermaid
flowchart TD
  Start([使用者進入 checkout]) --> Cart[Cart Review]
  Cart -->|修改| Edit[Edit Item Dialog]
  Edit --> Cart
  Cart -->|確認| Pay[Payment Step]
  Pay -->|信用卡| Card[Card Form]
  Pay -->|轉帳| Bank[Bank Info]
  Card --> Confirm[Confirm Dialog]
  Bank --> Confirm
  Confirm -->|下單| Success([訂單成立])
  Confirm -->|取消| Cart
```

Nodes:
- `[Text]` = rectangle(主 screen / modal)
- `([Text])` = stadium(流程起點 / 終點)
- `{Text}` = rhombus(決策點)
- `((Text))` = circle(特殊節點,如 async operation)

Edges:
- `-->` arrow
- `-->|label|` arrow with label(e.g., 條件)
- `-.->` dashed(非主路徑 / optional)
- `==>` thick(強調 / primary 路徑)

### sequenceDiagram(互動時序)

```mermaid
sequenceDiagram
  User->>UI: 點「套用」
  UI->>API: POST /discount
  API-->>UI: 200 + discount data
  UI->>UI: 更新 state
  UI-->>User: 顯示「已套用」
```

適合:非同步互動 / API 時序 / 多 actor 流程。

### stateDiagram(狀態機)

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading: click apply
  Loading --> Applied: 200
  Loading --> Error: 4xx/5xx
  Applied --> Idle: click clear
  Error --> Idle: dismiss
```

適合:元件 / feature 的狀態機(idle / loading / success / error)。

---

## 世界級 reference

對標世界級設計 handoff 的 flow 品質:

- **Shopify Polaris Pattern pages**: 每 pattern 有 `flow` section 用 SVG,我們用 Mermaid
- **Material Design Guidelines**: 流程圖 + 截圖並列
- **Stripe Documentation**: Payment Flow 用 Mermaid + inline code
- **Figma Design Process blog posts**: Journey map + flow 混合

---

## 原則

### 1. 一張圖涵蓋一個 feature,不超過 20 個 nodes

> 20+ nodes → 拆成多個 sub-flow diagram。

### 2. 標示 **error path**(非 happy path)

> 只畫 happy path = handoff 失真。user 也要知道錯誤 / 邊界 case 流向何處。

### 3. 決策點標清楚

> 用 `-->|label|` 寫條件,避免邊無敘述。

### 4. Start / End 用 stadium node

> `([Start])` / `([End])` 讓讀者知道邊界。

### 5. 搭配 spec sheet 引用

> Node text 應對應 spec sheet 的 screen / modal 名稱,讀者一眼看出對應。

---

## 範本 — Checkout 完整 flow

```mermaid
flowchart TD
  Start([進入 /checkout]) --> AuthCheck{已登入?}
  AuthCheck -->|否| Login[Login Screen]
  Login --> Start
  AuthCheck -->|是| CartCheck{購物車有 item?}
  CartCheck -->|否| Empty[Empty Cart Screen]
  Empty -->|回去購物| End1([exit to /products])
  CartCheck -->|是| Review[Cart Review Screen]

  Review -->|點 item| Edit[Edit Item Dialog]
  Edit -->|save| Review
  Edit -->|cancel| Review

  Review -->|輸入折扣| Discount{折扣有效?}
  Discount -->|否| DiscountError[顯示 error]
  DiscountError --> Review
  Discount -->|是| Review

  Review -->|下一步| Payment[Payment Selection]
  Payment -->|信用卡| CardForm[Card Form]
  Payment -->|轉帳| BankInfo[Bank Instructions]
  Payment -->|超商| StoreInfo[Store Instructions]

  CardForm --> Validate{valid?}
  Validate -->|否| CardError[Inline errors]
  CardError --> CardForm
  Validate -->|是| Confirm[Confirm Dialog]

  BankInfo --> Confirm
  StoreInfo --> Confirm

  Confirm -->|確認下單| Submit[POST /order]
  Submit --> SubmitCheck{success?}
  SubmitCheck -->|是| Success([訂單成立 / 跳 /orders/:id])
  SubmitCheck -->|否| RetryToast[Toast: 請稍後再試]
  RetryToast --> Confirm

  Confirm -->|取消| Payment
```

---

## Edge case 節點命名慣例

- `XxxError` = 錯誤狀態(顯示 Alert / Notice)
- `XxxEmpty` = 空狀態(顯示 Empty 元件)
- `XxxLoading` = 載入中
- `XxxRetry` = 可重試狀態
- `XxxSkipped` = 跳過(optional flow)

讓讀者一眼看出節點是 happy 還是 edge。

---

## 集成 Storybook

Storybook 8+ 支援 MDX,可直接寫 mermaid code block:

````mdx
# Checkout Flow

```mermaid
flowchart TD
  Start --> End
```
````

純 tsx story 可用 `<pre>{mermaidSource}</pre>` + 外部 render tool,或用 `mermaid.js` npm lib runtime render。

一般推薦 MDX 方式,Storybook 原生支援。
