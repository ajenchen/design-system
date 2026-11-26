import * as React from 'react'

/**
 * DS i18n Route B — additive I18nProvider + useI18n hook
 *
 * ── 背景 ──
 * Route A(2026-04-24 shipped)= individual prop override(Notice dismissAriaLabel /
 * FileViewer labels / etc)+ `// i18n-allow` marker。
 *
 * Route B(本 module)= opt-in context provider,consumer 傳 labels catalog 一次性
 * 注入全 DS,個別 prop 不需每個 call site 傳。**可選用** — 沒
 * 包 provider 時各元件照 prop 與預設文字(Fallback chain 見下)。
 *
 * ── Fallback chain(每個 label resolution)──
 *   1. Consumer 傳的 prop(e.g. `<Notice dismissAriaLabel="X" />`)
 *   2. Context labels(useI18n().t('notice', 'dismiss', default))
 *   3. DS default(CJK `i18n-allow` rationale)
 *
 * ── Usage ──
 *
 * ```tsx
 * // Consumer app root
 * import { I18nProvider } from '@/design-system/lib/i18n/i18n-context'
 *
 * const labels = {
 *   notice: { dismiss: 'Dismiss' },
 *   fileViewer: { close: 'Close viewer', download: 'Download' },
 *   // ... 覆寫需要的項
 * }
 *
 * <I18nProvider labels={labels}>
 *   <App />
 * </I18nProvider>
 * ```
 *
 * ```tsx
 * // DS component internal(opt-in migration)
 * import { useI18n } from '@/design-system/lib/i18n/i18n-context'
 *
 * const { t } = useI18n()
 * <button aria-label={props.dismissAriaLabel ?? t('notice', 'dismiss', '關閉通知')}>
 * ```
 *
 * ── 為什麼 opt-in(不強制)──
 * DS 目前大半 component 都走 prop override,強制 all-or-nothing migration 需要
 * 17 files × multi-location refactor 的協調成本。Route B 讓既有 prop API 繼續
 * 工作,同時開放 context-based i18n 給想統一管理的 consumer。
 *
 * ── 為什麼 hierarchical key(component, label)而非 flat key ──
 * Flat key(e.g. 'notice.dismiss')需要命名 convention + grep-based validation;
 * hierarchical object 天然分 namespace + TypeScript 可做 discriminated union。
 */

/**
 * Labels catalog 結構:`{ [componentKey]: { [labelKey]: translatedString } }`
 *
 * Consumer 可透過 module augmentation 擴充 type safety:
 *
 * ```ts
 * declare module '@/design-system/lib/i18n/i18n-context' {
 *   interface I18nLabels {
 *     notice?: { dismiss?: string }
 *     fileViewer?: { close?: string; download?: string }
 *   }
 * }
 * ```
 */
// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export interface I18nLabels {
  [componentKey: string]: Record<string, string | undefined> | undefined
}

const I18nContext = React.createContext<I18nLabels | null>(null)

export interface I18nProviderProps {
  /** Labels catalog。空 object OK(代表用 all defaults)。Partial 覆寫 OK(只填需要翻的)。 */
  labels: I18nLabels
  children: React.ReactNode
}

/**
 * I18nProvider — consumer-optional wrapper 注入 labels catalog。
 *
 * 沒包 → `useI18n().t()` 每次返 fallback(= DS CJK defaults)。
 * 包 → 該 labels 取代對應 DS defaults;未填的 key 仍 fallback。
 *
 * **巢狀會合併**(2026-11-27,workspace H 組 H23):內層 provider 讀外層的 labels,以 componentKey 為單位合併 ——
 * 內層沒寫的 componentKey 照外層;同一個 componentKey 兩層都寫時以內層那一組為準(整組,不逐字合併)。
 * 修前內層整份取代外層,包一層只換某一區字的 provider,
 * 那一區裡其他元件的字就退回 DS 預設中文。閘:`scripts/i18n-labels-override-invariant.mjs` I-nest-* 兩格。
 */
// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export function I18nProvider({ labels, children }: I18nProviderProps) {
  const outer = React.useContext(I18nContext)
  // 依 [外層, labels] memo:兩者都沒變就是同一個 value,不讓 consumer 因為 parent 重畫而跟著重畫
  const value = React.useMemo(() => (outer ? { ...outer, ...labels } : labels), [outer, labels])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export interface I18nHookResult {
  /**
   * Translate:return labels[componentKey]?.[labelKey] ?? fallback。
   *
   * @param componentKey - 元件 namespace(kebab-case,e.g. 'notice' / 'file-viewer')
   * @param labelKey - 該元件內的 label 名(camelCase,e.g. 'dismiss' / 'close')
   * @param fallback - DS default(無 context / no key 時用)
   */
  t: (componentKey: string, labelKey: string, fallback: string) => string
  /** 當前 labels catalog(null = 無 provider)。Debug / advanced use */
  labels: I18nLabels | null
}

/**
 * useI18n — DS 元件內消費 labels catalog。
 *
 * **Fallback chain**(每 label resolution):
 *   1. Consumer 傳的 prop(call site 最優先)
 *   2. Context `labels[componentKey][labelKey]`
 *   3. DS default(fallback 參數,i18n-allow 的 CJK)
 *
 * 無 I18nProvider 環境:`labels` = null,`t()` 每次直接返 fallback。**不拋 error**
 *(跟 Field context 等 DS 其他 optional context 同 pattern)。
 */
// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export function useI18n(): I18nHookResult {
  const labels = React.useContext(I18nContext)
  const t = React.useCallback<I18nHookResult['t']>(
    (componentKey, labelKey, fallback) => {
      return labels?.[componentKey]?.[labelKey] ?? fallback
    },
    [labels],
  )
  return { t, labels }
}
