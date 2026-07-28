# Handoff Template — Storybook page + Markdown spec

---

## Storybook Handoff Page 結構

位置: `src/app/features/{feature-slug}/{feature-slug}.handoff.stories.tsx`

Title: `Features/{Feature Name}/Handoff`

每個 handoff page 5 個 story(5 tab):

```tsx
const meta: Meta = {
  title: 'Features/Checkout/Handoff',
  parameters: { layout: 'fullscreen' },
}
export default meta

export const Overview: Story = {
  name: '0. Overview',
  render: () => <OverviewPage />,
}

export const UIFlow: Story = {
  name: '1. UI Flow',
  render: () => <FlowDiagram />,  // Mermaid render
}

export const Inventory: Story = {
  name: '2. Inventory',
  render: () => <InventoryTables />,  // Component / Token / a11y
}

export const Screens: Story = {
  name: '3. Screens',
  render: () => <ScreenGrid />,  // 每 screen 的 preview + link
}

export const SpecSheets: Story = {
  name: '4. Spec Sheets',
  render: () => <SpecTabs />,  // per-screen detail
}
```

---

## Per-screen Markdown Spec 範本

每 screen 一份,組合為完整 feature 的 spec sheet:

```markdown
# Screen: {Name}

**Storybook**: `Features/{Feature}/{Screen}`
**Source**: `src/app/features/{slug}/{Screen}.tsx`
**Route**: `/{path}`

## 用途(Why)

{1-2 sentence 敘述 user 會在此頁做什麼}

## 進入條件(Entry conditions)

- {e.g., 已登入 + 購物車有 ≥1 item}
- {e.g., 付款方式已選擇}

## 主要元件(Components used)

| Component | Count | Purpose |
|-----------|-------|---------|
| Button | 3 | CTA + 次要 action |
| Input | 1 | 折扣碼輸入 |
| ... | | |

## 狀態(States)

### default
{正常載入後的畫面描述 + 截圖}

### empty
{無資料時的 fallback}

### error
{錯誤情境處理}

### loading
{載入中 skeleton / spinner}

## 互動(Interactions)

| Action | Element | Result |
|--------|---------|--------|
| 點 Apply | Button | POST /discount |
| 按 Esc | 任何 Dialog | 關閉 |
| ... | | |

## A11y

- ✓ icon-only 元件均有 aria-label
- ✓ Dialog 有 DialogTitle + DialogDescription
- ✓ keyboard tab order 正確
- ⚠ {如有未達標項,明列 + 說明}

## 邊界(Edge cases)

- {e.g., 折扣碼超過總額 → capped}
- {e.g., 網路斷線 → toast + retry}
- {e.g., 超過 N items → 分頁}

## 業務規則(Business rules)

- {e.g., VIP 折扣上限 30%}
- {e.g., 免運門檻 NT$1000}

## Related

- Next step: [Screen Y]
- Alternative: [Screen Z]
- Design source: [Explorations/ folder](...)
```

---

## Overview story render 範本

```tsx
function OverviewPage() {
  return (
    <div className="max-w-4xl mx-auto p-8 flex flex-col gap-6">
      <h1 className="text-h1 font-medium">Checkout Feature Handoff</h1>
      <p className="text-body-lg text-fg-secondary">
        使用者從購物車到下單的完整結帳流程。包含 3 screens、4 modals、支援信用卡 / 銀行轉帳 /
        超商付款 3 種付款方式。
      </p>

      <div className="border-t border-divider pt-6">
        <h2 className="text-h2 font-medium mb-3">Audience</h2>
        <ul className="list-disc pl-5 text-body">
          <li>工程團隊:實作參考 + test case 來源</li>
          <li>QA:邊界 case checklist</li>
          <li>PM:業務規則確認</li>
        </ul>
      </div>

      <div className="border-t border-divider pt-6">
        <h2 className="text-h2 font-medium mb-3">Status</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="元件消費" value="12" caption="既有 DS" />
          <StatCard label="新元件" value="0" caption="零污染" />
          <StatCard label="A11y" value="✓" caption="WCAG AA" />
        </div>
      </div>

      <div className="border-t border-divider pt-6">
        <h2 className="text-h2 font-medium mb-3">Navigation</h2>
        <ul className="list-disc pl-5 text-body">
          <li>Tab 1: UI Flow — Mermaid diagram</li>
          <li>Tab 2: Inventory — 元件 / token / a11y 報告</li>
          <li>Tab 3: Screens — 每 screen preview + link</li>
          <li>Tab 4: Spec Sheets — per-screen detail</li>
        </ul>
      </div>
    </div>
  )
}
```

---

## 設計原則

1. **target audience driven**: 語氣深度因 audience 調整。工程語氣精準 / PM 語氣情境 / 設計語氣對標
2. **每段可獨立被引用**: per-screen spec 可單獨丟給 team member,不需看其他頁
3. **不重複 DS spec**: 元件的行為 / variant 由 `components/*/spec.md` owning,handoff 只寫 **feature-level** 使用
4. **截圖 / preview 是 Storybook render 即可**: 不要 mockup,直接看真實 code 的 output
5. **Edge case 必寫**: handoff 不寫 edge case = 實作 + QA 會踩坑
