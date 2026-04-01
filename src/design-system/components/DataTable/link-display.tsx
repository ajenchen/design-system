import { EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'

// ── Display ─────────────────────────────────────────────────────────────────
// 連結用 primary 色區分，不額外加 icon——表格內資訊密度高，
// icon 增加雜訊但不增加資訊量（顏色已傳達「可點擊」）。

export interface LinkDisplayProps {
  /** URL。如果只傳 href，顯示文字會自動從 URL 提取 hostname。 */
  value?: string | null
  /** 自訂顯示文字 */
  label?: string
}

function LinkDisplay({ value, label }: LinkDisplayProps) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const displayText = label || (() => {
    try {
      return new URL(value).hostname.replace(/^www\./, '')
    } catch {
      return value
    }
  })()

  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="truncate text-primary hover:text-primary-hover hover:underline transition-colors"
    >
      {displayText}
    </a>
  )
}
LinkDisplay.displayName = 'LinkDisplay'

export { LinkDisplay }
