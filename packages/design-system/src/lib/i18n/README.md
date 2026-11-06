# DS i18n(Route B infrastructure)

**Status**: shipped 2026-04-24(additive,backward compatible);2026-10-27 起由套件 root 出口(`I18nProvider` / `useI18n` / `I18nLabels` / `I18nProviderProps` / `I18nHookResult`)—— 之前 root barrel 產生器只讀 lib/ 底下一層的 `.ts`,consumer import 不到

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

## 世界級對照

- **Material MUI**:`createTheme({ locale })` — monolithic locale
- **Ant Design**:`<ConfigProvider locale={zhCN}>` — context inject locale
- **Carbon**:`<PrefixContext>` + locale 分離 — modular
- **Radix Primitives**:無 i18n layer,留給 consumer

本 DS 選「additive optional context」對齊 Ant / Carbon 彈性路徑:consumer 想要時包一次,不想要保持 prop API。
