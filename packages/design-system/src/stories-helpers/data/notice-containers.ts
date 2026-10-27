import type { NoticeVariant } from '@/design-system/components/Notice/notice'

/**
 * Notice 示範用的淡色容器(2026-10-27 收成一份):Notice 展示頁與設計規格頁原本各抄一份逐字相同的對照表
 * (scripts/story-helper-duplication-baseline.json 的 SUBTLE_CONTAINER 組)—— 每個語意色的淡底 + 同色邊框,
 * 示範 Notice 放在 subtle 容器裡的長相。
 */
export const SUBTLE_CONTAINER: Record<NoticeVariant, string> = {
  neutral: 'bg-muted border border-border',
  info: 'bg-info-subtle border border-[var(--info-text)]',
  success: 'bg-success-subtle border border-[var(--success-text)]',
  warning: 'bg-warning-subtle border border-[var(--warning-text)]',
  error: 'bg-error-subtle border border-[var(--error-text)]',
}
