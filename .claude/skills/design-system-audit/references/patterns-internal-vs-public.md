# Patterns:Internal infrastructure vs Public-visual primitive(Dim 11 exemption,2026-05-23 codify)

**對應 audit Dim 11(b) 豁免清單**:`patterns/<name>/` 不是都需要獨立 `.stories.tsx`。分兩類:

## Public-visual pattern(需 ≥ 1 stories.tsx)

| Pattern | Why public | 既存 stories |
|---|---|---|
| `patterns/action-bar/` | Visible toolbar primitive(left context / center focus / right CTA),consumer 直接消費 `<ActionBar>` 元件 | ✅ `action-bar.stories.tsx` |
| `patterns/element-anatomy/` | Family 1 / 2 row layout primitive,SSOT for slot grid + Inline Action 等,consumer 直接消費 `<ItemAnatomy>` / `<ItemInlineAction>` | ✅ `item-anatomy.stories.tsx` |
| `patterns/resize-handle/` | Visible interactive handle primitive,consumer 直接消費 `<ResizeHandle>` | ✅ `resize-handle.stories.tsx` |

判斷 test:此 pattern 是否 **consumer 直接 import 使用 + 有可見視覺**?是 → public,需 stories。

## Internal-infrastructure pattern(Dim 11(b) 豁免,**不**該有 stories.tsx)

| Pattern | Why internal | Demo home(consumer 元件 stories 已展示) |
|---|---|---|
| `patterns/header-canonical/` | Cross-family invariant SPEC(W1-W6 跨 chrome + overlay 兩家族),`chrome-header.tsx` 是底層 primitive 但 consumer 用的是 Sidebar / FileViewer 等元件 | Sidebar / FileViewer Toolbar / FileViewer InfoPanel / app top bar / page header stories 已展示 chrome-header 用法 |
| `patterns/horizontal-overflow/` | Toolbar overflow infrastructure SPEC,consumer 看到的是 `<OverflowIndicator>` 元件 | `OverflowIndicator/*.stories.tsx`(已有完整 3-layer)|
| `patterns/overlay-surface/` | Transparent shell behind Dialog / Sheet / Popover / HoverCard / Coachmark,consumer 看不到 surface 自己 | Dialog / Sheet / Popover / HoverCard / Coachmark stories 已展示 surface 用法 |

判斷 test:此 pattern 是否 **consumer 不直接 import**(透過其他元件間接消費)/ **只作 cross-family invariant SPEC** / **transparent shell 自己沒視覺**?滿足任一 → internal,獨立 stories 反 confuse(新人會以為是 standalone 元件)。

## Trigger anchor

2026-05-23 deep audit Phase A 抓 D11 「3 patterns 缺 stories」(header-canonical / horizontal-overflow / overlay-surface)→ user verbatim「你他媽確定這些東西不是 internal?確定真的要秀出來?仔細全盤盤查」→ triple-verify(barrel export check / consumer import grep / story title canonical 對照)→ verdict **3 patterns 全 internal infrastructure,finding 撤回**。

## 對齊原則

- **mindset #1 不取巧省工**:不為了 dim coverage 而強加 stories 給 internal infra(反 confuse user / 違反 mindset #5 猶豫就問 / 違反 mindset #2 不憑直覺發明 stories)
- **M10 proactive scan**:同 finding 類別未來再出現 → 先過此 exemption 表
- **Polaris / Material / Carbon 共識**:都區分「primitives users see」vs「infrastructure tokens / specs」,後者不暴露 storybook

## 新增 internal-infra pattern 流程

新加 `patterns/<name>/` 時必過 2 test:
1. Consumer **直接** `import { X } from '@qijenchen/design-system'` 用?是 → public。
2. Pattern 有 **visible primitive component** export(`<X>`)?是 → public。
3. 兩題都 No → internal。加進本表 + spec.md frontmatter `visibility: internal` 註記。
