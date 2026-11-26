# DS i18n(Route B infrastructure)

**Status**: shipped 2026-04-24(只新增、可選用:沒包 provider 時各元件照 prop 與預設文字);2026-10-27 起由套件 root 出口(`I18nProvider` / `useI18n` / `I18nLabels` / `I18nProviderProps` / `I18nHookResult`)—— 之前 root barrel 產生器只讀 lib/ 底下一層的 `.ts`,consumer import 不到

## 什麼

可選的 context-based i18n layer — consumer 在 app root 包 `<I18nProvider labels={...}>` 一次,DS 元件內部 opt-in 用 `useI18n()` hook 讀 labels。沒包 provider 完全不影響既有 prop-based 行為。

## 為什麼(vs Route A prop-only)

Route A(2026-04-24 原 ship)每元件暴露 `dismissAriaLabel` / `closeAriaLabel` 等個別 prop。Consumer 要全 app 多語 → 每 call site 傳 prop = 重複 noise。

Route B provider 一次注入 label catalog,per-call-site override 仍可(prop > context > default fallback chain)。

## Usage

```tsx
// Consumer app root(npm 套件 root;lib 沒有 subpath)
import { I18nProvider } from '@qijenchen/design-system'

const enLabels = {
  notice: { dismiss: 'Dismiss' },
  'file-viewer': { close: 'Close viewer', download: 'Download' },
  carousel: { previous: 'Previous slide', next: 'Next slide' },
  // ... consumer 覆寫需要的項
}

<I18nProvider labels={enLabels}>
  <App />
</I18nProvider>
```

DS 元件內部(逐步 migration):

```tsx
import { useI18n } from '@/design-system/lib/i18n/i18n-context'

const { t } = useI18n()
<Button aria-label={propLabel ?? t('notice', 'dismiss', '關閉通知')} />
```

## Fallback chain

1. **Consumer prop**(call-site,最優先)
2. **Context labels**(`labels[componentKey][labelKey]`)
3. **DS default**(fallback 參數,i18n-allow 的 CJK)

## Migration status

- **infrastructure**:✅ shipped(`i18n-context.tsx`);root 出口 ✅ 2026-10-27
- **元件逐步 adopt**:Notice / FileViewer labels object / etc 已 Route A prop-based;Route B 可並存,未來有需要再逐元件 opt-in 換成 context reader
- **AgentPanel 訊息工具列**:✅ 2026-11-26(產品 canary 回報 C19)—— `agent-panel.copy` / `agent-panel.like` / `agent-panel.dislike`,面板其他字串尚未接(`../../components/AgentPanel/agent-panel.spec.md`「AgentToolbar」)

### 已 opt-in I18nProvider 的元件(componentKey → 鍵)

照原始碼 `t('<componentKey>', '<鍵>', …)` 列(2026-11-26 整理;新增 opt-in 時同一次改這張表):

| componentKey | 鍵 | 元件 |
|---|---|---|
| `app-shell` | `skipLinks` / `skipToMain` / `closePanel` | AppShell |
| `breadcrumb` | `navigation` / `showCollapsed` | Breadcrumb |
| `dialog` | `close` | Dialog |
| `sheet` | `close` | Sheet |
| `popover` | `close` | PopoverHeader 的 ×(DataTable 欄位顯示面板的 × 也是它) |
| `file-upload` | `buttonLabel` / `loadingTitle` / `title` / `descriptionMultiple` / `descriptionSingle` | FileUpload |
| `pagination` | `label` / `previous` / `next` / `pageSize` | Pagination(帶數字的 range 資訊與「N 筆/頁」只經 `labels` 函式,見 pagination.spec.md「完整形態」) |
| `profile-card` | `chat` / `audioCall` / `viewMore` | ProfileCard |
| `sidebar` | `resizeHandle` / `overlayTitle` | Sidebar |
| `agent-panel` | `titleThinking` / `titleDone`(AgentThinking);`decision` + `AgentDecisionCardLabels` 的鍵首字大寫(AgentDecisionCard,例:`decisionCancel` / `decisionNext` / `decisionErrorOther`) | AgentPanel 家族共用一個 componentKey(2026-11-26;兩者的 `labels` prop 照舊最優先)。決策卡的鍵加 `decision` 前綴:卡上的 `submit` / `cancel` / `next` / `other` 跟面板其他零件同字不同義,同一個 namespace 不加前綴會撞名 |

只經 `labels` prop、沒有 I18nProvider 這一層的(Route A):Coachmark、FileViewer、Calendar、DataTable 排序 / 篩選 / 欄位顯示三個工具面板(欄位顯示面板 2026-11-26 起)等。閘:`scripts/i18n-labels-override-invariant.mjs` 量 Pagination / AgentThinking / AgentDecisionCard「傳進去真的換字」;`scripts/data-table-panel-reset-clear-invariant.mjs` (5) / (5b) 量排序與欄位顯示面板的 `labels`。

## 世界級對照

- **Material MUI**:`createTheme({ locale })` — monolithic locale
- **Ant Design**:`<ConfigProvider locale={zhCN}>` — context inject locale
- **Carbon**:`<PrefixContext>` + locale 分離 — modular
- **Radix Primitives**:無 i18n layer,留給 consumer

本 DS 選「additive optional context」對齊 Ant / Carbon 彈性路徑:consumer 想要時包一次,不想要保持 prop API。
