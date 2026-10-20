import * as React from 'react'
import LinkTo from '@storybook/addon-links/react'
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
 * 規則說明 = `text-caption` + `text-fg-muted`(字級同一段規範;字色 = color.spec.md「文字 / Icon 層級」caption 列 ——
 * 2026-10-20 前各頁可選 `noteTone`,7 頁選了 fg-secondary,同一層說明兩種字色,已收成一種)。
 *
 * 內文(2026-10-20):頁根擁有字級 `text-body`(typography.spec.md:13「font-size 由 text-{role} token 決定,不可繞過」、
 * :39 text-body「主要內文基準」)—— 之前頁裡沒寫字級的段落 / 清單一律落到瀏覽器預設 16px,比 14px 的規則標題還大。
 * 頁裡的說明元件、清單、連結也只住在這裡 / example-captions.tsx(`ExampleCaption` / `TutorialList` / `StoryLink`),各頁不再自抄。
 *
 * 「使用指引」(UsageGuidance)固定三段(2026-10-20 user「你提的問題可以都照你建議」核准 T4 甲):
 * 何時用 / 何時不用 / 和相近元件怎麼選,依序、各一段,段名只寫在這裡(`UsageSection kind`)。
 *
 * 用法:
 *   const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })   // 每頁一行
 *   <TutorialPage>
 *     <UsageSection kind="whenNot">
 *       <TutorialRule title="❌ …" note="…">{範例}<ExampleCaption warn>↑ …</ExampleCaption></TutorialRule>
 *     </UsageSection>
 *   </TutorialPage>
 * 規則的內容是範例 → `examples: true`(範例區走 CaptionedExamples,說明 = ExampleCaption 自動併組);
 * 是一段文字 / 清單 → 不給,子節點照順序以 tight 排。
 *
 * 機械:`scripts/tutorial-page-invariant.mjs`(教學頁沒用本支、自抄 Section / Rule、手寫段落 / 規則間距 → 紅)。
 */

/** 規則之間 = 段落之間 = loose × 2(user 2026-10-07 拍板 ②)。全 repo 只有這一處寫這個值。 */
const BLOCK_STACK = 'flex flex-col gap-[calc(var(--layout-space-loose)*2)]'

/** 頁根的內文字級:typography.spec.md:39 text-body =「主要內文基準」。只寫在這裡。 */
const PAGE_TEXT = 'text-body'

export interface TutorialPageProps {
  /** 只放寬度這類整頁限制(例:`max-w-3xl`);間距與字級由本元件擁有,不得從這裡覆寫。 */
  className?: string
  children: React.ReactNode
}

/** 一則 story 的教學頁根節點:裡面的段落 / 規則 / 段落外的說明塊之間一律 loose × 2;內文字級 text-body。 */
export function TutorialPage({ className, children }: TutorialPageProps) {
  return (
    <div data-tutorial-page="" className={cn(BLOCK_STACK, PAGE_TEXT, className)}>
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

/**
 * 「使用指引」三段的段名(T4 甲,2026-10-20 核准)。順序即頁面順序;全 repo 只有這裡寫段名。
 * 世界級對照見 category-templates.md「Principles canonical」的 Universal core 表(Polaris Best practices / Material Usage / Ant When To Use)。
 */
export const USAGE_SECTION_TITLES = {
  when: '何時用',
  whenNot: '何時不用',
  siblings: '和相近元件怎麼選',
} as const

export interface UsageSectionProps {
  kind: keyof typeof USAGE_SECTION_TITLES
  children: React.ReactNode
}

/** 「使用指引」的一段:就是 TutorialSection,段名由 `kind` 決定(各頁不手寫段名)。 */
export function UsageSection({ kind, children }: UsageSectionProps) {
  return <TutorialSection title={USAGE_SECTION_TITLES[kind]}>{children}</TutorialSection>
}

export interface TutorialListProps {
  children: React.ReactNode
}

/**
 * 教學頁的清單(2026-10-20 收成一種):實心圓點 + 左縮排 + 列距 4px。之前 104 份清單三種長相(93 份沒有圓點也沒有縮排、
 * 8 份圓點在外、3 份圓點在內),沒有圓點的清單讀起來像一串連著的句子。
 */
export function TutorialList({ children }: TutorialListProps) {
  // @layout-space-magic-ok: 清單的列距 = 同一個清單裡的同質列(layoutSpace.spec.md:165 同質清單列);左縮排 = 圓點自己的位置(清單本身的幾何)
  return <ul className="list-disc pl-5 space-y-1">{children}</ul>
}

export interface StoryLinkProps {
  /** Storybook 的 story 標題(例:`Design System/Components/Tabs/展示`) */
  kind: string
  /** 該頁的 story 名稱 */
  name: string
  children: React.ReactNode
}

/** 教學頁裡跳到別則 story 的連結(2026-10-20 收成一份;之前 215 處各自抄同一串 class)。 */
export function StoryLink({ kind, name, children }: StoryLinkProps) {
  return (
    <LinkTo kind={kind} name={name}>
      <span className="text-primary hover:text-primary-hover font-medium cursor-pointer">{children}</span>
    </LinkTo>
  )
}

export interface TutorialRuleOptions {
  /**
   * 規則的內容是範例區 → `true`:走 `CaptionedExamples`,範例的說明一律是 `ExampleCaption`(自動與它說的範例併組);
   * 不給 → 規則內容是一段文字 / 清單,子節點照順序以 tight 排。
   */
  examples?: boolean
  /** 範例區版面(CaptionedExamples 的 layout)。 */
  layout?: CaptionedExamplesProps['layout']
  /** 範例區的範例維持自然寬度(CaptionedExamples 的 naturalWidth)。 */
  naturalWidth?: boolean
  /** 範例區的寬度限制 / 對齊(例:`max-w-md`、`items-center`);間距由 CaptionedExamples 擁有。 */
  examplesClassName?: string
}

export interface TutorialRuleProps {
  title: React.ReactNode
  note?: React.ReactNode
  children?: React.ReactNode
}

/** 每頁一次:依該頁的說明元件與範例區版面,產出這一頁的 `TutorialRule`。在 module 層呼叫(不要寫在 render 裡)。 */
export function createTutorialRule({
  examples = false,
  layout,
  naturalWidth,
  examplesClassName,
}: TutorialRuleOptions = {}) {
  function TutorialRule({ title, note, children }: TutorialRuleProps) {
    // 真的會畫出來的子節點(null / false / undefined 不算):React.Children.count 把空節點也算進去
    // (react.dev Children.count「Empty nodes (null, undefined, and Booleans) … count as individual nodes」),
    // 只靠它判斷「有沒有範例」會在沒有範例時多畫一段空的範例區、規則之間多出一段 tight 空白(2026-10-20 T13)
    const items = React.Children.toArray(children)
    return (
      <div data-tutorial-rule="" className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h6 font-semibold text-foreground">{title}</h3>
        {note && <p className="text-caption max-w-[720px] text-fg-muted">{note}</p>}
        {/* 只有標題 + 說明的規則不畫空的範例區(否則多一段 tight 空白,規則之間就不再是 loose × 2) */}
        {examples && items.length > 0 ? (
          <CaptionedExamples layout={layout} naturalWidth={naturalWidth} className={examplesClassName}>
            {items}
          </CaptionedExamples>
        ) : (
          items
        )}
      </div>
    )
  }
  return TutorialRule
}
