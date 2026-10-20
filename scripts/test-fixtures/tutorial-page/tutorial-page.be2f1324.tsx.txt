import * as React from 'react'
import { cn } from '@/lib/utils'
import { CaptionedExamples, type CaptionedExamplesProps } from './example-captions'

/**
 * 教學頁的共用版面(2026-10-14):頁 → 段落 → 規則 → 範例。全 DS 的教學頁(設計原則頁 `*.principles.stories.tsx`,
 * 以及 Patterns 文件頁裡的教學框)一律由這支組成,各頁不再自抄 Section / Rule。
 *
 * 決定出處:user 2026-10-07「第一題照你建議」,採 AI 同日建議 ② —— 規則之間 = 段落之間 = loose × 2(md 32 / lg 48)、
 * 範例之間維持 loose、段落標題 text-h3 半粗體 + 淺分隔線、只用在教學頁、所有教學頁收成一個共用元件
 * (governance/planning/2026-09-25-interaction-and-hover-remediation.md P7 列)。
 *
 * 間距(只在這裡寫一次):
 * - **規則 ↔ 規則 = 段落 ↔ 段落 = `calc(var(--layout-space-loose) * 2)`**:從 loose 推出,所以永遠是「範例之間」的兩倍、跟著密度走;
 *   不借 `--layout-space-bottom` —— 那個 token 的語意是「結論留白:內容到 action buttons」(layoutSpace.spec.md:13),
 *   段落之間只是值可能剛好一樣。也不是公開 token:這一級只定義在教學頁(layoutSpace.spec.md 規則 3 的指標)。
 * - 段落標題 → 段落內第一塊、規則標題 → 說明 → 範例區 = `--layout-space-tight`(規則 3:標題 / 說明在替後面那塊命名)。
 * - 範例 ↔ 範例 = loose、說明 ↔ 它說的範例 = tight:照舊由 `CaptionedExamples` / `ExampleGroup` 擁有(example-captions.tsx)。
 * - 間距一律由外層 gap 給,各塊不留自己的下方 margin —— 最後一塊下面不會多出空白(Carbon:元件不帶 margin,定位交給外層)。
 *
 * 標題:段落 `<h2>` = `text-h3`(24px)半粗體 + `border-divider` 淺分隔線(typography.spec.md 的 text-h3 = 「子區塊標題」,
 * 教學頁的段落就是頁裡的子區塊);規則 `<h3>` = `text-h6` 半粗體(category-templates.md「教學框的間距與標題」)。
 * 規則說明 = `text-caption`(同一段規範);字色沿用各頁原本的選擇(`noteTone`,規範沒定字色,本支不替各頁改)。
 *
 * 用法:
 *   const TutorialRule = createTutorialRule({ caption: Label, layout: 'wrap' })   // 每頁一行,放在 Label 定義之後
 *   <TutorialPage>
 *     <TutorialSection title="何時不用 + 替代">
 *       <TutorialRule title="❌ …" note="…">{範例}<Label>↑ …</Label></TutorialRule>
 *     </TutorialSection>
 *   </TutorialPage>
 * 規則的內容是範例 → 給 `caption`(範例區走 CaptionedExamples);是一段文字 / 清單 → 不給 `caption`,子節點照順序以 tight 排。
 *
 * 機械:`scripts/tutorial-page-invariant.mjs`(教學頁沒用本支、自抄 Section / Rule、手寫段落 / 規則間距 → 紅)。
 */

/** 規則之間 = 段落之間 = loose × 2(user 2026-10-07 拍板 ②)。全 repo 只有這一處寫這個值。 */
const BLOCK_STACK = 'flex flex-col gap-[calc(var(--layout-space-loose)*2)]'

export interface TutorialPageProps {
  /** 只放寬度 / 字級這類整頁限制(例:`max-w-3xl`);間距由本元件擁有,不得從這裡覆寫。 */
  className?: string
  children: React.ReactNode
}

/** 一則 story 的教學頁根節點:裡面的段落 / 規則 / 段落外的說明塊之間一律 loose × 2。 */
export function TutorialPage({ className, children }: TutorialPageProps) {
  return (
    <div data-tutorial-page="" className={cn(BLOCK_STACK, className)}>
      {children}
    </div>
  )
}

export interface TutorialSectionProps {
  title: React.ReactNode
  children: React.ReactNode
}

/** 段落:`<h2>` text-h3 半粗體 + 淺分隔線;段落裡的規則之間 loose × 2。 */
export function TutorialSection({ title, children }: TutorialSectionProps) {
  return (
    <section data-tutorial-section="" className="flex flex-col gap-[var(--layout-space-tight)]">
      {/* @layout-space-magic-ok: 標題字與底線的距離(同一個標題元素的 micro)(layoutSpace.spec.md:166 micro) */}
      <h2 className="text-h3 font-semibold text-foreground pb-2 border-b border-divider">{title}</h2>
      <div className={BLOCK_STACK}>{children}</div>
    </section>
  )
}

export interface TutorialRuleOptions {
  /**
   * 各頁的說明元件(`Label`)。給了 → 規則內容是範例區,走 `CaptionedExamples`(說明自動與它說的範例併組);
   * 不給 → 規則內容是一段文字 / 清單,子節點照順序以 tight 排。
   */
  caption?: React.ElementType
  /** 範例區版面(CaptionedExamples 的 layout)。 */
  layout?: CaptionedExamplesProps['layout']
  /** 範例區的範例維持自然寬度(CaptionedExamples 的 naturalWidth)。 */
  naturalWidth?: boolean
  /** 範例區的寬度限制 / 對齊(例:`max-w-md`、`items-center`);間距由 CaptionedExamples 擁有。 */
  examplesClassName?: string
  /** 規則說明的字色;規範只定字級(text-caption),字色沿用各頁原本的選擇。預設 `muted`。 */
  noteTone?: 'muted' | 'secondary'
}

export interface TutorialRuleProps {
  title: React.ReactNode
  note?: React.ReactNode
  children?: React.ReactNode
}

/** 每頁一次:依該頁的說明元件與範例區版面,產出這一頁的 `TutorialRule`。在 module 層呼叫(不要寫在 render 裡)。 */
export function createTutorialRule({
  caption,
  layout,
  naturalWidth,
  examplesClassName,
  noteTone = 'muted',
}: TutorialRuleOptions = {}) {
  function TutorialRule({ title, note, children }: TutorialRuleProps) {
    return (
      <div data-tutorial-rule="" className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">{title}</h3>
        {note && (
          <p className={cn('text-caption max-w-[720px]', noteTone === 'secondary' ? 'text-fg-secondary' : 'text-fg-muted')}>{note}</p>
        )}
        {/* 只有標題 + 說明的規則不畫空的範例區(否則多一段 tight 空白,規則之間就不再是 loose × 2) */}
        {caption && React.Children.count(children) > 0 ? (
          <CaptionedExamples caption={caption} layout={layout} naturalWidth={naturalWidth} className={examplesClassName}>
            {children}
          </CaptionedExamples>
        ) : (
          children
        )}
      </div>
    )
  }
  return TutorialRule
}
