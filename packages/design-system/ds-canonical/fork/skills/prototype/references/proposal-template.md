# Proposal Template — explorations/ 結構 + Storybook 編排

Phase 3 每個 shortlisted candidate 建一個 story + 共用 notes.md。

---

## 目錄結構(對齊 CLAUDE.md「Exploration 規則」)

```
src/explorations/{topic-slug}/
├── notes.md                              # 本 topic 的 source of truth
├── {CandidateA-name}.stories.tsx         # 候選 A 原型(1 檔內 3+ stories 各場景)
├── {CandidateB-name}.stories.tsx
├── {CandidateC-name}.stories.tsx
└── _shared/                              # 僅此 topic 內共用的 helper(可選)
    └── mock-data.ts
```

### 檔名慣例

- **Topic slug**:kebab-case,描述問題(`onboarding-tour` / `bulk-action-confirm` / `empty-state-first-visit`)
- **Candidate stories filename**:kebab-case + 描述性名稱(`linear-quick-filter.stories.tsx`)—**不用 `CandidateA/B/C`**(違反 CLAUDE.md「範例必須真實」mindset)

### Storybook title 慣例(不與 Components/ 衝突)

```tsx
title: 'Explorations/{Topic Title}/{Candidate Name}'
```

範例:
- `Explorations/Bulk Filter/Linear Quick-Filter`
- `Explorations/Bulk Filter/Notion Command Palette`
- `Explorations/Bulk Filter/Stripe Step Wizard`

---

## notes.md 範本

```markdown
# {Topic Title}

## 問題定義(Phase 0 framing)

**誰**:{primary user persona,如「Sales Ops 主管」}
**想**:{jobs-to-be-done,如「在 50+ 筆 leads 中快速 filter 這週要跟進」}
**解決**:{解除的痛點,如「現在得滾一頁找 tags,誤點率高」}
**Constraints**:{mobile?a11y?時程?}

## Phase 2 評估摘要

見 Phase 2 完整評分表(略)。Shortlist 3 個:

| Candidate | 核心機制 | 評分 | Phase 3 檔案 |
|-----------|---------|------|-------------|
| Linear Quick-Filter | Popover + checkbox + saved | 14/15 | `linear-quick-filter.stories.tsx` |
| Notion Command Palette | modal Cmd-K + query | 11/15 | `notion-command-palette.stories.tsx` |
| Stripe Step Wizard | Dialog + 3 步 fine-grained | 12/15 | `stripe-step-wizard.stories.tsx` |

## Phase 3.0 Object Map(全 candidate 共享)

本 feature 的 canonical object model,由 Phase 1 benchmark 的 OOUX 分析收斂 + Phase 0 framing 收敛而成。**3 個 candidate 共享此 Object Map**,差異只在 UI shape + CTAs 順序。

**Objects**(core nouns):
- {Object A}(核心名詞 1)
- {Object B}(核心名詞 2)
- {Object C}(若有)

**Attributes per object**:

| Object | Core attributes | Metadata | Identifying |
|--------|----------------|----------|-------------|
| {A} | ... | ... | ... |
| {B} | ... | ... | ... |

**Relationships(NOM)**:

| From → To | Relationship |
|-----------|-------------|
| {A} → {B} | belongs to / has many / ... |
| ... | ... |

**CTAs per role per object**:

| Role | {A} CTAs | {B} CTAs |
|------|----------|----------|
| Admin | Create / Edit / Delete | ... |
| Member | View / Comment | ... |

**UI Shape → DS 元件映射**:

| Object | List | Card | Detail | Inline |
|--------|------|------|--------|--------|
| {A} | MenuItem / DataTable row | Card / FileItem | Page + Tabs | Tag / Chip |
| {B} | ... | ... | ... | ... |

完整 ORCA 方法與範本見 [`ooux-template.md`](ooux-template.md)。

## 候選獨立說明

### Linear Quick-Filter

- **positioning**:面向重度 power user,shortcut-first
- **適合場景**:
  - Sales Ops 每日追蹤 leads(frequency=high,repeat task)
  - Project Manager bulk status update
  - Support 團隊 ticket triage
- **不適合**:
  - 新手 user(沒 onboarding 不知道 shortcut)
  - 行動裝置(shortcut 無對應)
- **新元件需求**:無(既有 Popover + Checkbox + Button 就夠)

### Notion Command Palette

- **positioning**:開放式 query,unified search
- **適合場景**:
  - 多維 filter(人 + tag + date)同時作用
  - 可 memory 用戶的自訂 query
- **不適合**:
  - 情境簡單(2-3 filter)會 overkill
  - 首次 user onboarding 負擔重
- **新元件需求**:**可能需 `CommandPalette` 新元件**(本 DS 目前有 `Command` 但無全站 palette 結構)。若採用此 candidate,Checkpoint 3 討論是否升級。

### Stripe Step Wizard

- **positioning**:流程化,降低誤操作
- **適合場景**:
  - 破壞性 bulk action(delete 多筆)
  - 需 audit trail 的金流 / 合規 action
- **不適合**:
  - 高頻日常操作(步驟拖慢速度)
- **新元件需求**:無(既有 Dialog + Steps + Checkbox)

## 下一步

Phase 4 summary 整理完畢後,stakeholder 決定採用,走 graduation 流程:
- 採用者遷移到 `node_modules/@qijenchen/design-system/src/`(若有新元件)或直接 app-level UI
- 未採用者:留 `explorations/{topic-slug}/` 或移 `_archive/`(保紀錄)

## 參考

- Phase 1 research 連結(略)
- Phase 2 評估完整表(略)
- Storybook 路徑:`Explorations/{Topic Title}/*`
```

---

## Candidate story 範本

每個 `{candidate-name}.stories.tsx` 建議結構:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
// 從 DS import 既有元件
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
// ...

const meta: Meta = {
  title: 'Explorations/Bulk Filter/Linear Quick-Filter',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

// Story 1:positioning 說明(不可互動也 OK)
export const Positioning: Story = {
  name: '1. Positioning',
  render: () => (
    <div className="max-w-lg flex flex-col gap-3">
      <h3 className="text-body-lg font-medium">Linear Quick-Filter</h3>
      <p className="text-body text-fg-secondary">
        shortcut `Cmd+Shift+F` 開 Popover,checkbox 多選,支援 saved filter 組合。
        面向 sales ops 每日場景:速度 > 引導。
      </p>
      <div className="border-t border-divider pt-3">
        <a href="..." className="text-info">Linear 原始參考 →</a>
      </div>
    </div>
  ),
}

// Story 2-4:具體情境(3 個以上,對齊 Mindset #4)
export const SalesOpsDaily: Story = {
  name: '2. Sales Ops 每日追蹤 leads',
  render: () => { /* 完整互動 prototype */ },
}

export const ProjectBulkStatus: Story = {
  name: '3. PM bulk status update',
  render: () => { /* */ },
}

export const SupportTriage: Story = {
  name: '4. Support ticket triage',
  render: () => { /* */ },
}

// Story 5(可選):edge case / failure mode(讓 stakeholder 看弱點也是成熟的設計溝通)
export const NewbieOnboardingConcern: Story = {
  name: '5. ⚠️ 新手首次遇到(知識死角)',
  render: () => (
    <div>
      {/* 示範新手沒 shortcut 知識時看到什麼 */}
    </div>
  ),
}
```

---

## DS 使用鐵律(per CLAUDE.md)

Phase 3 建 exploration 時:

1. **優先用既有元件** `node_modules/@qijenchen/design-system/src/components/`,不自創
2. **Layout primitives 消費**(per CLAUDE.md 清單):Empty / item-layout / overlay-surface / ScrollArea / AspectRatio
3. **Token 紀律**:只用 semantic token,不硬寫 hex / rgb / shadow-sm
4. **token 防線 lib/_token_hygiene.sh 5-check**:shadcn alias / v4 shorthand / hardcoded shadow / primitive-color-as-utility / native overflow — 5 項全過
5. **新元件需求**:**notes.md 明文標示**,不偷偷 add 到 Components/(Checkpoint 3 專屬)

---

## Non-goals

- Pixel-perfect 不是目標(Phase 3 看 pattern 可行性)
- 不做完整 test coverage(exploration 不上 prod)
- 不覆寫 DS 元件 props(若需 override, 代表這個 candidate 不適合既有 DS)
