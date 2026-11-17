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
 * (governance/planning/2026-09-25-interaction-and-hover-remediation.md P7 列)。user 2026-10-27 21:31 回「Q2照你建議」
 * (t3-dispatch triage Q2 甲):① 展示頁 / 設計規格頁一頁多則有標題的範例上下疊,範例之間也是 loose × 2(`ExampleStack`);
 * ② 段落標題 → 段落內第一則規則 = loose × 2(跟規則 ↔ 規則一樣)。
 *
 * 間距(只在這裡寫一次):
 * - **規則 ↔ 規則 = 段落 ↔ 段落 = `calc(var(--layout-space-loose) * 2)`**:從 loose 推出,所以永遠是「範例之間」的兩倍、跟著密度走;
 *   不借 `--layout-space-bottom` —— 那個 token 的語意是「結論留白:一塊 body 的最後一個 element(含按鈕)→ body 底」(layoutSpace.spec.md:13),
 *   段落之間只是值可能剛好一樣。也不是公開 token(layoutSpace.spec.md 規則 3「組 ↔ 組」:同一級也用在產品畫面的區塊 ↔ 區塊);
 *   文件頁(教學頁、Tokens / Patterns 文件頁、展示 / 設計規格頁的範例堆疊)的這個值只寫在本檔。
 * - 規則標題 ↔ 它自己的說明 = 2px(`--item-gap-label-desc-scanning`:text-h6 14 / 1.3 + text-caption 12 / 1.3 正是 item-anatomy
 *   「Label ↔ Desc 間距」scanning 那一型)。
 * - 標題區(標題 + 說明)→ 內容(layoutSpace.spec.md 規則 3「標題區 → 內容」,2026-11-11 立、2026-11-17 改判法):照順序問三題 ——
 *   ① 哪一種版型(同一種版型每一頁同一個距離)② 那個位置只可能放一個東西 → tight ③ 其他(會有好幾個的)→ 標題到第一個 = 東西之間、至少 loose。
 *   出處:user 2026-11-11「我覺得主要取決於那個標題和說明是否是完完全全在描述下方的東西？若是的話，那就是親近吧？如果是描述下方的多個東西，那確實是用loose沒錯？」
 *   + 決策頁「說明頁:甲」(說明頁也套);loose 的值即 user 2026-10-21 A4 甲(「他是所有內容的標題而非內容第一個的小標，所以內容之間是 loose的話，那內容到‘標題＋說明’也是loose吧」);
 *   三題 = AI 在 r12 決策頁第 1 題寫的選項乙,user 2026-11-17 回「都照你建議，你的理由合理」(規格那一段有全部原話與出處)。
 *   好幾個示範塊彼此只隔 tight 也是 loose:user 2026-11-12「第四批成品的問題都照你建議，但清除全部的按鈕用TERTIARY」,
 *   第四批成品頁「多塊緊排」題的建議選項是「乙：有兩塊以上就維持遠的距離」。
 *   文件頁用「幾塊」自動近似三題,怎麼數只寫在本檔 `headingContentOf`(【AI 推導】的數法,見該函式;它是工具、不是定義)。規則內容是一段文字 / 清單(段落)時照舊一律 tight(內容之間本來就是 tight)。
 *   值與判斷只寫在本檔:規則、展示頁的範例區段(`ExampleSection`)、設計規格頁的 `H3` / `Desc`(anatomy-utils.tsx,用本檔的 `useHeadingContent` 與 `SPEC_HEADING_GAP`)都從這裡來。
 * - 段落標題 → 段落內第一則規則 = loose × 2(同規則 ↔ 規則;Q2 ②):段落標題上下等距,靠 24px 半粗體 + 底線分出它屬於下面。
 *   設計規格頁 / Patterns 文件頁也一樣(2026-11-17 A42【AI 推導】:依 user 2026-10-27「Q2照你建議」的同一理由 ——「標題要離上一塊比離自己的
 *   內容遠、看得出屬於下面」—— 推到這兩種頁,不是 user 對這一題逐字同意):段落標題 → 底下第一個**有標題的區段** = loose × 2。
 *   寫法:段落標題放進 `ExampleStack` 當第一個子節點;教學框的規則說明 → 並排的有標題區段 = 區段放在規則之後(由 `TutorialPage` 的間距給)。
 * - 一頁多則有標題的範例(`ExampleSection`)上下疊 = loose × 2(`ExampleStack`,Q2 ①):標題離上一則比離自己的內容遠。
 * - 範例 ↔ 範例 = loose、說明 ↔ 它說的範例 = tight:照舊由 `CaptionedExamples` / `ExampleGroup` 擁有(example-captions.tsx)。
 * - 間距一律由外層 gap 給,各塊不留自己的下方 margin —— 最後一塊下面不會多出空白,同一塊放到別的版面也不必改它自己。
 *
 * 寬度(2026-11-05,BA-tutorial-width):整頁寬度跟間距、字級一樣由這裡擁有 —— 頁根不設寬、各頁不自訂(`TutorialPage` 不收 className)。
 * 原本 31 則各自給整頁寬(10 種值);給頁根一個共用寬會讓範例溢出(720px 溢出 17 則、1024px 還有 4 則),所以限寬落在需要它的範例上:
 * 規則的範例區 = `createTutorialRule({ examplesClassName })`,規則外的表格 / 示範塊 = 自己容器的 class;段落文字跟著頁寬走(與其餘教學頁相同)。
 *
 * 標題:段落 `<h2>` = `text-h3`(24px)半粗體 + `border-divider` 淺分隔線(typography.spec.md 的 text-h3 = 「子區塊標題」,
 * 教學頁的段落就是頁裡的子區塊);規則 `<h3>` = `text-h6` 半粗體(category-templates.md「教學框的間距與標題」)。
 * 規則說明 = `text-caption` + `text-fg-muted`(字級同一段規範;字色 = color.spec.md「文字 / Icon 層級」caption 列 ——
 * 2026-10-20 前各頁可選 `noteTone`,7 頁選了 fg-secondary,同一層說明兩種字色,已收成一種)。
 *
 * 內文(2026-10-20):頁根擁有字級 `text-body`(typography.spec.md:14 font-size 那一列「token 決定，不可繞過」、
 * typography.spec.md:44 text-body「主要內文基準」)—— 之前頁裡沒寫字級的段落 / 清單一律落到瀏覽器預設 16px,比 14px 的規則標題還大。
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
 * 規則的內容是範例 → `examples: true`(範例區走 CaptionedExamples,說明 = ExampleCaption 自動併組;標題區 → 範例區:一則範例 tight、
 * 兩則以上 loose,由 `headingContentOf` 數);是一段文字 / 清單 → 不給,標題區 → 文字、文字之間都以 tight 排(= `ExampleSection paragraph`);
 * 沒走範例區、內容卻是示範區塊的規則 → 該則寫 `paragraph={false}`(標題區 → 內容照「幾塊」判,內容之間仍 tight)。
 *
 * 機械:`scripts/tutorial-page-invariant.mjs`(教學頁沒用本支、自抄 Section / Rule、手寫段落 / 規則間距、頁根自帶寬度 → 紅)。
 */

/** 規則之間 = 段落之間 = loose × 2(user 2026-10-07 拍板 ②)。全 repo 只有這一處寫這個值。 */
const BLOCK_STACK = 'flex flex-col gap-[calc(var(--layout-space-loose)*2)]'

/** 頁根的內文字級:typography.spec.md:44 text-body =「主要內文基準」。只寫在這裡。 */
const PAGE_TEXT = 'text-body'

export interface TutorialPageProps {
  children: React.ReactNode
}

/**
 * 一則 story 的教學頁根節點:裡面的段落 / 規則 / 段落外的說明塊之間一律 loose × 2;內文字級 text-body。
 * 不收 className:間距、字級、整頁寬度都由本元件擁有(要限寬的是範例 —— `examplesClassName` 或該塊自己的容器)。
 */
export function TutorialPage({ children }: TutorialPageProps) {
  return (
    <div data-tutorial-page="" className={cn(BLOCK_STACK, PAGE_TEXT)}>
      {children}
    </div>
  )
}

export interface TutorialSectionProps {
  title: React.ReactNode
  children: React.ReactNode
}

/** 段落:`<h2>` text-h3 半粗體 + 淺分隔線;段落標題 → 第一則規則、規則之間都是 loose × 2。 */
export function TutorialSection({ title, children }: TutorialSectionProps) {
  return (
    <section data-tutorial-section="" className={BLOCK_STACK}>
      {/* @layout-space-magic-ok: 段落標題字 ↔ 自己的底線 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7);沿用已發布值(main 各頁 23 個段落標題是 pb-1 / pb-2 兩種,收成一份時取 pb-2) */}
      <h2 className="text-h3 font-semibold text-foreground pb-2 border-b border-divider">{title}</h2>
      <div className={BLOCK_STACK}>{children}</div>
    </section>
  )
}

/**
 * 「使用指引」三段的段名(T4 甲,2026-10-20 核准)。順序即頁面順序;全 repo 只有這裡寫段名。
 * 世界級對照見 category-templates.md「Principles canonical」的 Universal core 表。(來源:https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/spin/index.en-US.md#L12)
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
  // @layout-space-magic-ok: 清單左縮排 20px、列距 4px —— 規格沒寫這個值、不由 AI 補進規格(F-S7);沿用已發布值(main 各頁清單 `list-disc pl-5 space-y-1`)
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

/**
 * 範例區段的標題(2026-10-27 A4):`text-h6` 半粗體。規則標題、展示頁的範例區段標題、設計規格頁的 `H3` 都是這一個
 * (category-templates.md「教學框的間距與標題」;字重 600:user 2026-10-27 21:31 回「Q2照你建議」③ 維持 600,定案句在 typography.spec.md 字重刻度那句)。
 */
export const SectionTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(function SectionTitle({ className, ...rest }, ref) {
  return <h3 ref={ref} className={cn('text-h6 font-semibold text-foreground', className)} {...rest} />
})

/** 範例區段的說明:`text-caption` + `text-fg-muted`(color.spec.md「文字 / Icon 層級」caption 列),最寬 720px。 */
export const SectionDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(function SectionDescription({ className, ...rest }, ref) {
  return <p ref={ref} className={cn('text-caption max-w-[720px] text-fg-muted', className)} {...rest} />
})

/* ═══════════════════════════════════════════════════════════════════════════
   標題區 → 內容:文件頁用「幾塊」自動近似規格的三題(2026-11-11;2026-11-12 示範塊緊排也算兩塊以上)
   ═══════════════════════════════════════════════════════════════════════════ */

/** 標題區底下的內容:`one` = 只有一塊(≈ 那個位置只可能放一個東西 → tight)、`many` = 兩塊以上(≈ 會有好幾個的 → loose)。 */
export type HeadingContent = 'one' | 'many'

/**
 * 兩塊之間至少隔這麼遠才算「兩塊」;比它近 = 元件自己的微距(一列按鈕、一排 chip、一串清單列),合起來是一塊。
 * 值 = 版面間距刻度最小的一格(md 的 `--layout-space-tight`,tokens/layoutSpace/layoutSpace.css)。
 * 寫成固定值、不從被量的元素讀,兩個原因:
 * (1) 門檻跟著密度走的話,同一頁在 md 與 lg 會數出不同塊數 —— 用固定 `gap-3` / `gap-4` 排的示範不會跟著密度變寬;
 * (2) Storybook 的密度屬性是在這個判斷**之後**才套到 `<html>` 上(packages/storybook-config/preview.tsx 的 useEffect 晚於這裡的
 *     layout effect),判斷當下讀到的永遠是 md 的值。
 * 跟 layoutSpace.css 對不上由 `scripts/tutorial-page-invariant.mjs`(R14)抓。
 */
const HEADING_BLOCK_MIN_GAP_PX = 12

/** 畫面上真的佔位置的子節點(display:none / 絕對定位的讀屏區 / style、script 不算;display:contents 換成它自己的子節點)。 */
function inFlowChildren(el: Element): Element[] {
  const out: Element[] = []
  for (const child of Array.from(el.children)) {
    if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT' || child.tagName === 'TEMPLATE') continue
    const cs = getComputedStyle(child)
    if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue
    if (cs.display === 'contents') out.push(...inFlowChildren(child))
    else out.push(child)
  }
  return out
}

/** 有視覺邊界(layoutSpace.spec.md「元件角色」bounded:底色 / 邊框 / 陰影)= 自成一塊。 */
function hasVisualBoundary(el: Element): boolean {
  const cs = getComputedStyle(el)
  const side = (s: 'Top' | 'Right' | 'Bottom' | 'Left') => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none'
  const bg = cs.backgroundColor
  return side('Top') || side('Right') || side('Bottom') || side('Left') || !(bg === 'transparent' || /^rgba\(.*,\s*0\)$/.test(bg)) || cs.boxShadow !== 'none'
}

/** 相鄰兩塊之間最小的距離(上下疊看上下、左右排看左右;換行的下一列看上下)。 */
function minGapBetween(nodes: Element[]): number {
  let min = Infinity
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1].getBoundingClientRect()
    const b = nodes[i].getBoundingClientRect()
    min = Math.min(min, Math.max(b.top - a.bottom, b.left - a.right))
  }
  return min
}

/**
 * 只負責排版的容器除了 class / style 之外可以帶的屬性:主題 / 密度的範圍宣告,與 FieldGroup(一疊欄位的排版群組,不是一個元件 —— 往裡數)。
 * 「FieldGroup + 說明它的文字」(第 2 步只剩一塊 → `one`)與「只剩一個欄位的 FieldGroup」(往裡數到一個 Field → `one`)維持一塊【AI 推導 2026-11-17】:
 * 文件頁這種示範,標題描述的就是底下那一則 → 親近(user 2026-11-11「是否是完完全全在描述下方的東西？若是的話，那就是親近吧？」)。
 * 同日曾改成「FieldGroup 一律 many」又撤回(依據是 AI 補的一句)。理由與清單:layoutSpace.spec.md 規則 3 邊角表最後一列。
 */
const LAYOUT_WRAPPER_ATTRS = new Set(['class', 'style', 'data-theme', 'data-density', 'data-layout-space', 'data-field-group'])
const LAYOUT_WRAPPER_TAGS = new Set(['DIV', 'SECTION', 'SPAN', 'ARTICLE', 'MAIN'])

/**
 * 只負責排版的容器:沒有自己語意的標籤,而且除了上面那幾個屬性之外什麼都沒帶。
 * 帶了別的屬性(`data-*` / `role` / `aria-*` / `id` / `dir` …)= 一個元件的根(一個 Field、一組 Tabs)—— 元件裡面怎麼排是元件自己的事,整個算一塊。
 */
function isLayoutWrapper(el: Element): boolean {
  return LAYOUT_WRAPPER_TAGS.has(el.tagName) && Array.from(el.attributes).every((a) => LAYOUT_WRAPPER_ATTRS.has(a.name))
}

/** `headingContentOf` 往「只負責排版的容器」裡走的層數上限(防呆);`descentWatched` 照同一個上限走,觀察範圍才涵蓋得到數到的那幾層(見 `descentWatched`:觀察的比數到的多)。 */
const HEADING_DESCENT_MAX_DEPTH = 12

/** 一段說明文字(沒有邊界的 `<p>`):它在說明旁邊那一塊,自己不算一塊。 */
function isProse(el: Element): boolean {
  return el.tagName === 'P' && !hasVisualBoundary(el)
}

/**
 * 標題區底下有幾塊 —— 規範 layoutSpace.spec.md 規則 3「標題區 → 內容」(照順序問三題);本函式是**文件頁的自動判斷工具,不是定義**:
 * 文件頁的內容寫死在範例裡,現在放幾個就是會放幾個,所以用數的近似三題(`one` ≈ 第 2 題「那個位置只可能放一個東西」→ tight;
 * `many` ≈ 第 3 題「會有好幾個的」→ loose);跟三題的答案不同時以三題為準、改這裡。user 原話與決策見本檔檔頭。
 * 【AI 推導】數法(機械可判,同一份給 `ExampleSection`、`TutorialRule`、設計規格頁 `H3` / `Desc`):
 * 1. 只有一個節點:有視覺邊界(邊框 / 底色 / 陰影),或不是只負責排版的容器(一個元件的根、`<p>`、`<table>`、`<dl>`、`<label>`、`<form>` …)
 *    = 一塊(`one`);是只負責排版的容器(含 FieldGroup)→ 往裡看它的子節點,回到這一步。看到底都沒有子節點(一張圖、一個空容器)= `one`。
 * 2. 有兩個以上節點,先扣掉說明文字(`isProse`),看剩幾塊:
 *    - 剩兩塊以上,**扣掉說明文字之後的那幾塊**彼此至少隔一格版面間距(`HEADING_BLOCK_MIN_GAP_PX`)→ `many`(說明文字離它們多近不算);隔得更近 = 元件的微距(一列按鈕、一排 chip)= `one`
 *    - 只剩一塊(一則示範 + 說明它的文字)→ `one`
 *    - 全是說明文字:段落之間隔 ≥ loose → 並列的好幾段 = `many`;比 loose 近 = 同一段話 = `one`(`loose` 由呼叫端從被量的元素讀)
 * 所以:一張表 / 一張圖 / 一份清單 / 一個元件(含一個 Field)/ 一列按鈕 / 一則示範 + 一段說明 = 一塊;
 * 好幾則示範(不論彼此隔 tight 還是 loose —— user 2026-11-12)、FieldGroup 裡的好幾個欄位 = 兩塊以上。
 * 「FieldGroup + 說明」「只剩一個欄位的 FieldGroup」數成一塊【AI 推導 2026-11-17,定案維持】(見 `LAYOUT_WRAPPER_ATTRS`)。
 */
export function headingContentOf(nodes: Element[], loose: number): HeadingContent {
  let run = nodes
  // 每多一層只往一個子節點裡走;深度上限只是防呆(實際頁面 3 層內就分出來)
  for (let depth = 0; depth < HEADING_DESCENT_MAX_DEPTH; depth++) {
    if (run.length === 0) return 'one'
    if (run.length >= 2) {
      const blockNodes = run.filter((node) => !isProse(node))
      const blocks = blockNodes.length
      if (blocks === 1) return 'one'
      // 剩兩塊以上:只量塊與塊之間(說明文字不算一塊,它離旁邊那一塊多近都不影響 —— layoutSpace.spec.md「幾塊怎麼數」第 2 步的「彼此」);
      // 全是說明文字:量段落之間
      return minGapBetween(blocks >= 2 ? blockNodes : run) >= (blocks >= 2 ? HEADING_BLOCK_MIN_GAP_PX : loose) - 0.5 ? 'many' : 'one'
    }
    const only = run[0]
    if (hasVisualBoundary(only) || !isLayoutWrapper(only)) return 'one'
    run = inFlowChildren(only)
  }
  return 'one'
}

/** 判一次、寫回標記(判定沒變不寫)。`useHeadingContent` 的 layout effect 與「看不到 ↔ 看得到」重判共用這一支;`nodes` = `collect` 的回傳。 */
function writeHeadingContent<T extends HTMLElement>(el: T, nodes: Element[] | 'many' | null) {
  const loose = parseFloat(getComputedStyle(el).getPropertyValue('--layout-space-loose'))
  const value = nodes === null ? null : nodes === 'many' ? 'many' : headingContentOf(nodes, loose)
  if (value === null) el.removeAttribute('data-heading-content')
  else if (el.getAttribute('data-heading-content') !== value) el.setAttribute('data-heading-content', value)
}

/** 有框(寬、高都大於 0)= 看得到;display:none 或在 display:none 的容器裡 = 0 × 0。 */
const hasBox = (width: number, height: number) => width > 0 && height > 0

/**
 * 會畫出框的子節點:跳過 style / script / template、display:contents 換成它自己的子節點 —— **display:none 的也算**
 * (它現在看不到,之後可能顯示;`inFlowChildren` 不算它,這裡要算,才觀察得到它出現)。
 */
function boxChildren(el: Element): Element[] {
  const out: Element[] = []
  for (const child of Array.from(el.children)) {
    if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT' || child.tagName === 'TEMPLATE') continue
    if (getComputedStyle(child).display === 'contents') out.push(...boxChildren(child))
    else out.push(child)
  }
  return out
}

/**
 * `headingContentOf` 第 1 步往「只負責排版的容器」裡數的那幾層:每一層那個容器的子節點(含目前 display:none 的)。
 * `useHeadingContent` 連它們一起觀察 —— 內容在這種容器**裡面**從看不到變看得到時,容器自己的框不會跨過 0(它還有別的子節點),
 * 只觀察標題區之後那幾個節點本身就不會重判(2026-11-15 審查 A 第 2 輪)。往裡走的條件與層數上限跟 `headingContentOf` 相同,
 * 所以加上 `watch` 的節點之後,觀察範圍涵蓋判定會量到的節點,另外也觀察 display:none / 絕對定位的節點(`ExampleSection` 的 `watch` 還含標題區本身)
 * —— 多觀察只會多重判幾次、不影響判定。已知沒涵蓋到的一個邊【AI 推導 2026-11-15,讀程式得出、未量】:設計規格頁小標之後夾著一個 display:none 的
 * 小標時,`specHeadingWatched` 在它那裡停、`specHeadingContent` 跳過它往下數。`nodes` = `collect` 的回傳(`'many'` / `null` 不往裡數,也不往裡看)。
 */
function descentWatched(nodes: Element[] | 'many' | null): Element[] {
  const out: Element[] = []
  if (!Array.isArray(nodes)) return out
  let run = nodes
  for (let depth = 0; depth < HEADING_DESCENT_MAX_DEPTH && run.length === 1; depth++) {
    const only = run[0]
    if (hasVisualBoundary(only) || !isLayoutWrapper(only)) break
    out.push(...boxChildren(only))
    run = inFlowChildren(only)
  }
  return out
}

type HeadingWatcher = { observer: ResizeObserver; boxed: Map<Element, boolean>; frame: number }

/** 觀察範圍 = `watch` 的節點 + `descentWatched`;不在範圍裡的不再觀察,新加的記下它現在看不看得到(之後跨過 0 才重判)。 */
function observeHeadingContent<T extends HTMLElement>(w: HeadingWatcher, el: T, watch: (el: T) => Element[], nodes: Element[] | 'many' | null) {
  const next = new Set([...watch(el), ...descentWatched(nodes)])
  for (const node of Array.from(w.boxed.keys())) if (!next.has(node)) { w.observer.unobserve(node); w.boxed.delete(node) }
  for (const node of next) {
    if (w.boxed.has(node)) continue
    const rect = node.getBoundingClientRect()
    w.boxed.set(node, hasBox(rect.width, rect.height))
    w.observer.observe(node)
  }
}

/**
 * 在標題區最後一個元素(`ExampleSection` 的根 / `H3` / `Desc`)上標 `data-heading-content="one|many"`,間距 class 依它切換。
 * `collect` 回傳標題區之後的內容節點;回傳 `'many'` = 結構上就是並列(`ExampleSection` 直接放兩個以上子節點:它們由區段的 gap
 * 一起排開,本來就是並列);回傳 `null` = 不判(沒有內容 / 標題區後面緊接著說明),維持預設 loose。
 * 什麼時候判:
 * 1. 每次 render 後(layout effect,畫面畫出來之前)。
 * 2. 2026-11-15(A11)起另加:觀察的節點任一個**從看不到變看得到、或從看得到變看不到**(從寬或高為 0 變成寬高都大於 0,或反過來)
 *    時重判一次。觀察的節點 = `watch` 回傳的(標題區之後的內容節點,含目前 display:none 的;`ExampleSection` 的還含標題區本身)+ `descentWatched`(判定往「只負責排版的
 *    容器」裡數到的那幾層的子節點,同日審查 A 第 2 輪補:只看前者時,排版容器裡面的內容後來才顯示不會重判 —— section-gap 的
 *    heading-reveal-in-wrapper 夾具列);比判定量到的多,見 `descentWatched`。重判之後觀察範圍跟著數法換路(下方 rAF 回呼;section-gap 夾具列 heading-reveal-staged-es)。修前只有第 1 點:內容原本在 display:none 的容器裡(收起來的分頁、摺疊區塊),
 *    判的時候量到的全是 0 → 判成一塊,之後容器打開、共用元件本身沒有重畫,就一直停在那個錯的判定(scripts/section-gap-invariant.mjs
 *    的 heading-reveal 列量的就是這個:先藏起來請產品判一次、再顯示,看距離有沒有回到該有的值)。
 *    做法是 ResizeObserver,三個選擇與理由:
 *    · **不會引發「ResizeObserver loop」錯誤**:觀察者的回呼裡不寫標記、只排一個 requestAnimationFrame,下一格再判、再寫。
 *      量過的(2026-11-15 fix-1,scripts/section-gap-invariant.mjs 的巢狀夾具兩列):外層區段裡放一個藏起來會翻面的內層區段,
 *      回呼裡直接寫 → 顯示時瀏覽器發「ResizeObserver loop」(外層先掛、內層後掛,或同時掛,各 1–2 則);下一格才寫 → 0 則。
 *      現有說明頁沒有這種幾何(頁面上模擬直接寫跑 59 則有巢狀標題區的 story,0 則),所以由夾具守,不靠那四列真頁。
 *      【AI 推導,未量】其他「內容高度跟著間距變」的版面同理;代價:內容出現的那一格先畫舊距離,下一格改正。
 *    · **只看「0 ↔ 有」,不是每次大小變都重判**:示範裡有動畫或可拖拉調整的元件時,大小每一格都在變;判定與量到的距離只在
 *      看不到時失準,所以只在跨過 0 的時候重判。密度切換那件事(Storybook 把密度寫到 <html> 晚於第 1 點)不靠這裡:
 *      「兩塊」的門檻是固定值(`HEADING_BLOCK_MIN_GAP_PX`),判定本來就不跟密度變。
 *    · **不用 IntersectionObserver**:它看的是有沒有進到視窗 —— 內容在畫面外被打開時要捲到那裡才判(使用者正看著的時候跳一下),
 *      而且它只在「跟視窗有沒有交集」改變時回報,一直待在視窗裡、大小從 0 變有的元素不一定回報。
 *    不觀察標題區所在的元素本身(`ExampleSection` 的根:間距一改它的高度就變);寫回只改標題區 → 內容那一段距離,自己觀察的節點只會被推動
 *    —— 但巢狀時,外層正在觀察的那個容器會被內層的寫回撐高,這就是上面那一點要排到下一格的原因。
 */
export function useHeadingContent<T extends HTMLElement>(
  ref: React.RefObject<T>,
  collect: (el: T) => Element[] | 'many' | null,
  watch: (el: T) => Element[],
) {
  const collectRef = React.useRef(collect)
  const watchRef = React.useRef(watch)
  const watcher = React.useRef<HeadingWatcher | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    collectRef.current = collect
    watchRef.current = watch
    const nodes = collect(el)
    writeHeadingContent(el, nodes)
    if (typeof ResizeObserver === 'undefined') return
    if (!watcher.current) {
      const observer = new ResizeObserver((entries) => {
        const w = watcher.current
        if (!w) return
        let crossed = false
        for (const entry of entries) {
          const size = entry.borderBoxSize?.[0]
          const now = size ? hasBox(size.inlineSize, size.blockSize) : hasBox(entry.contentRect.width, entry.contentRect.height)
          if (w.boxed.get(entry.target) !== now) { w.boxed.set(entry.target, now); crossed = true }
        }
        if (!crossed || w.frame) return
        // 回呼裡不改版面(見上方「不會引發 ResizeObserver loop」):下一格再判、再寫
        w.frame = requestAnimationFrame(() => {
          w.frame = 0
          const current = ref.current
          if (!current) return
          // 重判後判定可能改走另一條路(例:排版容器從看不到變看得到,這下才往它裡面數)→ 觀察範圍跟著更新,不等下一次 render
          // (scripts/section-gap-invariant.mjs 夾具列 heading-reveal-staged-es 守:少了這一步,那個容器裡之後才出現的內容不會重判、停在 tight)
          const nodes = collectRef.current(current)
          writeHeadingContent(current, nodes)
          observeHeadingContent(w, current, watchRef.current, nodes)
        })
      })
      watcher.current = { observer, boxed: new Map(), frame: 0 }
    }
    observeHeadingContent(watcher.current, el, watch, nodes)
  })
  React.useLayoutEffect(() => () => {
    if (watcher.current) { watcher.current.observer.disconnect(); cancelAnimationFrame(watcher.current.frame) }
    watcher.current = null
  }, [])
}

/**
 * 設計規格頁 `H3` / `Desc`(anatomy-utils.tsx)的內容:自己之後、下一個小標(`data-spec-heading`)之前、畫面上佔位置的兄弟節點。
 * 兄弟節點之間的距離是各頁自己排的,所以兩個以上時照 `headingContentOf` 第 2 步量距離(不像 `ExampleSection` 由區段的 gap 排開)。
 */
export function specHeadingContent(el: HTMLElement): Element[] | null {
  const parent = el.parentElement
  if (!parent) return null
  const siblings = inFlowChildren(parent)
  const run: Element[] = []
  for (const s of siblings.slice(siblings.indexOf(el) + 1)) {
    if (s.hasAttribute('data-spec-heading')) break
    run.push(s)
  }
  return run.length ? run : null
}

/**
 * 設計規格頁 `H3` / `Desc` 要觀察「看不到 ↔ 看得到」的節點(`useHeadingContent` 的 `watch`):自己之後、下一個小標之前的兄弟節點,
 * **含目前 display:none 的**(之後可能顯示)。不含自己 —— 寫回改的是自己的下方 margin。
 */
export function specHeadingWatched(el: HTMLElement): Element[] {
  const parent = el.parentElement
  if (!parent) return []
  const siblings = boxChildren(parent)
  const out: Element[] = []
  for (const s of siblings.slice(siblings.indexOf(el) + 1)) {
    if (s.hasAttribute('data-spec-heading')) break
    out.push(s)
  }
  return out
}

/**
 * 設計規格頁 `H3` / `Desc`(anatomy-utils.tsx)的「標題區 → 內容」下方距離:預設(兩塊以上)loose、只有一塊 tight(`headingContentOf` 數)。
 * 它們是兄弟節點,只能用下方 margin 給(其他地方一律用 `ExampleSection` 的外層 gap)。值只寫在本檔。
 */
export const SPEC_HEADING_GAP = 'mb-[var(--layout-space-loose)] data-[heading-content=one]:mb-[var(--layout-space-tight)]'
/** 同上,段落(底下是一段文字 / 清單):一律 tight。 */
export const SPEC_HEADING_GAP_PARAGRAPH = 'mb-[var(--layout-space-tight)]'

/**
 * 一頁多則有標題的範例上下疊(展示頁 / 設計規格頁;user 2026-10-27 21:31 回「Q2照你建議」①):範例之間 = loose × 2,
 * 跟教學頁規則之間同一級(值 = 本檔 `BLOCK_STACK`,全 repo 只寫在這裡)。子節點是 `ExampleSection` 或「小標 + 內容」的區塊;
 * 這一疊有自己的段落標題時,標題也放進來當第一個子節點(段落標題 → 第一則 = loose × 2,見檔頭;A42)。`className` 只放寬度 / 對齊。
 */
export function ExampleStack({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-example-stack="" className={cn(BLOCK_STACK, className)} {...rest} />
}

export interface ExampleSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  /**
   * 底下是一段純文字 / 清單(段落)→ `true`:標題區 → 內容、內容之間都是 tight(內容之間本來就是 tight,標題跟著內容走)。
   * 不給 = 區塊:內容之間 loose;標題區 → 內容看底下幾塊(`headingContentOf`)—— 只有一塊(一張表 / 一張圖 / 一個元件)tight、
   * 兩塊以上 loose。
   */
  paragraph?: boolean
}

/** 區塊模式:內容之間 loose;標題區 → 內容預設 loose,底下只有一塊(`data-heading-content="one"`,此時區段裡也只有這一個間距)tight。 */
const SECTION_BLOCK_GAP = 'gap-[var(--layout-space-loose)] data-[heading-content=one]:gap-[var(--layout-space-tight)]'

/** `ExampleSection` 的內容節點:根的子節點去掉第一個(標題區);兩個以上 = 結構上就是並列(由本區段的 gap 一起排開)。 */
const sectionContent = (el: HTMLElement): Element[] | 'many' | null => {
  const kids = inFlowChildren(el).slice(1)
  return kids.length === 0 ? null : kids.length >= 2 ? 'many' : kids
}

/** `ExampleSection` 要觀察「看不到 ↔ 看得到」的節點:根的每個子節點(標題區 + 內容,含目前 display:none 的)。不含根自己 —— 寫回改的是根的 gap。 */
const sectionWatched = (el: HTMLElement): Element[] => boxChildren(el)

/**
 * 範例區段(2026-10-27,user 2026-10-21 A4;2026-11-11 標題區 → 內容看幾塊,2026-11-17 起「幾塊」是規格三題的自動近似):標題 ↔ 說明 2px;(標題 + 說明)→ 內容:
 * 段落 tight、區塊底下只有一塊 tight、兩塊以上 loose;跟著密度走。
 * 展示頁 / 原則頁 / 設計規格頁裡「一個小標 + 說明 + 一塊範例」一律用這支,不再手寫 `<h3 className="text-h6 font-semibold …">`;
 * `TutorialRule` 就是它加上範例區。間距由外層 gap 給,各塊不留自己的下方 margin。
 */
export function ExampleSection({ title, description, paragraph, className, children, ...rest }: ExampleSectionProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  useHeadingContent(ref, (el) => (paragraph ? null : sectionContent(el)), sectionWatched)
  return (
    <div
      ref={ref}
      data-example-section=""
      className={cn('flex flex-col', paragraph ? 'gap-[var(--layout-space-tight)]' : SECTION_BLOCK_GAP, className)}
      {...rest}
    >
      <div className="flex flex-col gap-[var(--item-gap-label-desc-scanning)]">
        <SectionTitle>{title}</SectionTitle>
        {description && <SectionDescription>{description}</SectionDescription>}
      </div>
      {children}
    </div>
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
  /** 範例區的寬度限制 / 對齊(例:`max-w-md`、`items-center`);間距由 CaptionedExamples 擁有。整頁不設寬,範例要限寬就寫在這裡。 */
  examplesClassName?: string
}

export interface TutorialRuleProps {
  title: React.ReactNode
  note?: React.ReactNode
  /**
   * 規則內容是一段文字 / 清單(段落)→ 標題區 → 內容 tight;是範例 / 示範區塊 → 區塊(同 `ExampleSection`:只有一則範例 tight、
   * 兩則以上 loose)。預設跟著 `examples`:有範例區 = 區塊、沒有 = 段落。沒走範例區、內容卻是示範區塊的規則寫 `paragraph={false}`
   * (內容之間仍照順序以 tight 排;標題區 → 內容照「幾塊」判 —— 好幾個示範塊即使彼此只隔 tight 也是兩塊以上 → loose,user 2026-11-12;
   * 規格三題第 3 題的「至少 loose」)。
   */
  paragraph?: boolean
  children?: React.ReactNode
}

/** 每頁一次:依該頁的說明元件與範例區版面,產出這一頁的 `TutorialRule`。在 module 層呼叫(不要寫在 render 裡)。 */
export function createTutorialRule({
  examples = false,
  layout,
  naturalWidth,
  examplesClassName,
}: TutorialRuleOptions = {}) {
  function TutorialRule({ title, note, paragraph = !examples, children }: TutorialRuleProps) {
    // 真的會畫出來的子節點(null / false / undefined 不算):React.Children.count 把空節點也算進去
    // (react.dev Children.count「Empty nodes (null, undefined, and Booleans) … count as individual nodes」),
    // 只靠它判斷「有沒有範例」會在沒有範例時多畫一段空的範例區、規則之間多出一段空白(2026-10-20 T13)
    const items = React.Children.toArray(children)
    return (
      <ExampleSection data-tutorial-rule="" title={title} description={note} paragraph={paragraph}>
        {/* 只有標題 + 說明的規則不畫空的範例區(否則多一段空白,規則之間就不再是 loose × 2) */}
        {items.length === 0 ? null : examples ? (
          <CaptionedExamples layout={layout} naturalWidth={naturalWidth} className={examplesClassName}>
            {items}
          </CaptionedExamples>
        ) : (
          // 文字 / 清單(或沒走範例區的示範塊):彼此照順序以 tight 排;標題區 → 這一疊的距離由 paragraph 決定
          <div className="flex flex-col gap-[var(--layout-space-tight)]">{items}</div>
        )}
      </ExampleSection>
    )
  }
  return TutorialRule
}
