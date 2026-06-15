// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from '@/design-system/components/Popover/popover'
import { Button } from '@/design-system/components/Button/button'
import { AspectRatio } from '@/design-system/components/AspectRatio/aspect-ratio'
import { OVERLAY_SIDE_OFFSET } from '@/design-system/tokens/elevation/overlay-geometry'

/**
 * Coachmark — 功能介紹 / onboarding tour 的浮層卡片
 *
 * 世界級對照:Apple HIG「Coachmark」(Apple 命名原處)/ Material「Feature Discovery」/
 * Ant Design `<Tour>` / Shepherd.js / react-joyride / Intercom Product Tours。
 *
 * 本元件 = **Popover 的 composition pattern**,consume 相同 overlay-surface SSOT:
 *   - Header(可選,多步驟建議傳 `kind="tips" | "new-features" | 自訂 title`,
 *     single-step 預設無 header 避免視覺過重)
 *   - Media 區(圖 / 截圖 / illustration,full-width 邊緣對齊,由 AspectRatio 管比例)
 *   - Body(SurfaceBody padding):title + description 左對齊
 *   - Footer(SurfaceFooter padding,但 justify-between):step 計數左 / actions 右
 *
 * ── 單 vs 多步驟 canonical(世界級行為規則) ──
 *   1. **Single step**(無 `onPrev` 且 `isLastStep`):CTA 文字 = `doneLabel ?? '知道了'`
 *      (Apple HIG / Intercom 慣例;不用 "Next" 因為沒有下一步)
 *   2. **Multi step 第一步**(無 `onPrev`,有 `onNext`):CTA = "Next",Skip 顯示
 *   3. **Multi step 中間 / 最後步**(有 `onPrev`):**Skip 不顯示**(使用者已投入進度,
 *      再給 Skip 會讓「放棄」入口與「回上一步」衝突 — Linear / Pendo / Shepherd.js
 *      同樣規則)。CTA = `isLastStep ? 'Done' : 'Next'`
 *   4. **抑制開啟時的自動 focus** — `onOpenAutoFocus` preventDefault,連 Radix 預設
 *      focus 第一個 focusable 也一併抑制(焦點停在 trigger),避免使用者還在讀 body 時
 *      按 Enter 誤推進。想推進者自行 tab 到 CTA 再 Enter(對齊 spec「A11y 預設」)。
 *
 * ── 為什麼 Body+Footer 消費 overlay-surface ──
 * 避免 padding token 漂移:Dialog / Popover / Coachmark 三者共用同一套 Header/Body/Footer
 * padding(px-loose / py-tight),改 Dialog 就三邊自動跟進。
 */

interface CoachmarkStep {
  current: number
  total: number
}

export interface CoachmarkProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
  /** 控制顯示(controlled mode)*/
  open?: boolean
  /** 預設打開(uncontrolled initial state)— 2026-05-15 audit Dim 26 V1 fix per user verbatim「A:1」approval */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** 觸發 anchor 元素。通常傳 trigger element;Coachmark 浮層會定位於此 */
  children: React.ReactNode
  /** 頂部 media 區(圖片 / illustration / video 等);不傳則無 media */
  image?: React.ReactNode
  /**
   * Media 區域的長寬比(ratio = 寬 / 高)。預設 `16/9`(onboarding feature tour
   * 世界級 convention — Intercom / Pendo / Shepherd.js)。其他常用:`4/3` 產品截圖 /
   * `1/1` 方圖 / `3/4` 直式 portrait。消費獨立的 `AspectRatio` primitive 元件。
   */
  mediaRatio?: number
  /**
   * 頂部 header 類型(多步驟 tour 建議傳)。
   * - `'tips'` → header title = "使用技巧"
   * - `'new-features'` → header title = "新功能介紹"
   * - `ReactNode` → 自訂 title(string / JSX)
   * - undefined → 無 header(單步驟常用)
   */
  kind?: 'tips' | 'new-features' | React.ReactNode
  /** 標題(bold) */
  title?: React.ReactNode
  /** 說明文字(normal weight,多行 OK) */
  description?: React.ReactNode
  /** 步驟計數(2 of 3);若需多步導覽 consumer 自行管理 current */
  step?: CoachmarkStep
  /** Skip 按鈕 callback;不傳則不顯示 Skip。多步驟中間 / 最後步自動隱藏(有 onPrev 時) */
  onSkip?: () => void
  /** Next 按鈕 callback;不傳則不顯示 Next */
  onNext?: () => void
  /** Previous 按鈕 callback(多步 tour 第 2+ 步顯示);不傳則不顯示 */
  onPrev?: () => void
  /**
   * 最後一步 flag。影響 primary CTA 文字:
   * - single step(無 onPrev 且 isLastStep):CTA = `doneLabel ?? '知道了'`
   * - multi-step 最後步(有 onPrev 且 isLastStep):CTA = 'Done'
   * - 其他:CTA = 'Next'
   */
  isLastStep?: boolean
  /** 自訂單步驟完成 CTA 文字(預設 `'知道了'`)。僅 single-step 使用 */
  doneLabel?: string
  /** 浮層定位(對齊 Popover props) */
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  /** 外殼寬度(預設 w-80 = 320px,比一般 Popover 寬,因要放 media + 文字) */
  className?: string
}

// i18n-allow: DS-internal kind → title 預設對照表;consumer 透過 `title` prop 直接覆寫
const KIND_TITLE: Record<'tips' | 'new-features', string> = {
  tips: '使用技巧',
  'new-features': '新功能介紹',
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Coachmark = React.forwardRef<HTMLDivElement, CoachmarkProps>(
  (
    {
      open,
      defaultOpen,
      onOpenChange,
      children,
      image,
      mediaRatio = 16 / 9,
      kind,
      title,
      description,
      step,
      onSkip,
      onNext,
      onPrev,
      isLastStep = false,
      doneLabel = '知道了', // i18n-allow: DS default; consumer override via doneLabel prop
      side = 'bottom',
      align = 'center',
      sideOffset = OVERLAY_SIDE_OFFSET,
      className,
      ...props
    },
    ref,
  ) => {
    // 單/多步驟行為推導
    const isSingleStep = isLastStep && !onPrev
    // canonical(spec.md CTA 語義表 L116):有 onPrev → 不顯示 Skip;**單步驟也不顯示 Skip**
    // (單步「skip」與「知道了」語義重複 = 同一個關閉動作,雙關閉鍵造成困惑;對齊 Apple HIG / Intercom / Pendo 單步 tip 僅一個完成鍵)
    const showSkip = Boolean(onSkip) && !onPrev && !isSingleStep
    const nextLabel = isSingleStep ? doneLabel : isLastStep ? 'Done' : 'Next'

    const hasFooterContent = Boolean(step || showSkip || onNext || onPrev)
    const stepText = step ? `${step.current} of ${step.total}` : null

    // Header title 解析
    const headerTitle =
      kind === 'tips' || kind === 'new-features'
        ? KIND_TITLE[kind as 'tips' | 'new-features']
        : kind

    // 2026-05-31 #6:PopoverContent(role=dialog)需 accessible name。dialog aria-labelledby 接可見標題
    // (優先 headerTitle 的 PopoverTitle,否則 body title 的 h3);皆無則 aria-label fallback。
    const titleId = React.useId()
    const dialogLabelledBy = (headerTitle || title) ? titleId : undefined

    return (
      <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          ref={ref}
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn('w-80 p-0 overflow-hidden', className)}
          // 禁止 Radix 開啟時自動 focus 第一個 focusable(預設會 focus Prev / Skip / Next),
          // Coachmark 的 CTA 不該被 auto-focus 偷觸發(user 可能還在讀 body,按 Enter 就推進)。
          // 想推進的 user 自己 tab 到 CTA 即可。
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-labelledby={dialogLabelledBy}
          aria-label={dialogLabelledBy ? undefined : '提示'}
          {...props}
        >
          {headerTitle && (
            // Header title 走 `<PopoverTitle>` 共用 Popover typography canonical(text-body font-medium)。
            // **不 hideClose** — 對齊 Popover / Dialog / 所有 overlay 家族 canonical:header 必有 dismiss X
            // (user 可隨時關閉,跟 Skip / Done 是不同入口,canonical 重複不冗)
            <PopoverHeader>
              <PopoverTitle id={titleId}>{headerTitle}</PopoverTitle>
            </PopoverHeader>
          )}

          {image && (
            <AspectRatio ratio={mediaRatio} className="w-full overflow-hidden bg-muted">
              {image}
            </AspectRatio>
          )}

          {(title || description) && (
            // 對齊 Dialog / Popover canonical:body 左對齊(不中置)
            // Why: Coachmark 雖是 onboarding / feature discovery,但文字可讀性 > 視覺焦點;
            // 中文 / 長句中置會「每行起點不同」造成閱讀鋸齒,左對齊最穩。
            // 世界級參考:Notion / Linear / Figma onboarding tour 皆左對齊;Intercom Messenger 亦如是。
            <PopoverBody className="flex flex-col">
              {title && (
                <h3 id={!headerTitle ? titleId : undefined} className="text-body-lg font-medium text-foreground">{title}</h3>
              )}
              {description && (
                // title(body-lg 16)+ desc(body 14)→ reading-lg token(label tier 決定)
                // 對齊 Dialog / Sheet canonical;移除原 gap-1(4px)drift
                <p className="mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary">{description}</p>
              )}
            </PopoverBody>
          )}

          {hasFooterContent && (
            // 專屬 Coachmark canonical:footer 無上方分隔線(media + body + footer 視覺一氣呵成,
            // 不像 Dialog 需要 header/footer 分隔強化結構)。override SurfaceFooter default border-t
            <PopoverFooter className="justify-between !border-t-0">
              {stepText ? (
                // step 文字走 text-body 跟 body content 字體一致
                <span className="text-body text-fg-secondary tabular-nums">
                  {stepText}
                </span>
              ) : (
                <span aria-hidden /> /* 保持 justify-between space */
              )}
              <div className="flex items-center gap-2">
                {onPrev && (
                  <Button variant="tertiary" size="sm" onClick={onPrev}>
                    Previous
                  </Button>
                )}
                {showSkip && (
                  <Button variant="tertiary" size="sm" onClick={onSkip}>
                    Skip
                  </Button>
                )}
                {onNext && (
                  <Button variant="primary" size="sm" onClick={onNext}>
                    {nextLabel}
                  </Button>
                )}
              </div>
            </PopoverFooter>
          )}
        </PopoverContent>
      </Popover>
    )
  },
)
Coachmark.displayName = 'Coachmark'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const coachmarkMeta = {
  component: 'Coachmark',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'], // 純 Popover composition — 無自有 hover / active / disabled 視覺(spec「邊界狀態」)
  tokens: {
    bg: ['bg-muted'],
    fg: ['text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { Coachmark }
