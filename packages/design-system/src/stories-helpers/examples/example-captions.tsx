import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * story 裡「範例 ↔ 它的說明」的分組(2026-10-01)。值只有一個:`--layout-space-tight`(下方 SSOT);這支 helper 擁有的是「分組」——
 * 設計原則頁的 Rule 教學框(`CaptionedExamples`)、展示頁 / 原則頁裡手寫的「樣本 + 說明」小格(`ExampleGroup`)。
 * 只有一則說明貼在一個樣本正上方 / 正下方的單格,直接在說明上寫 `mb-` / `mt-[var(--layout-space-tight)]` 是同一個值,不必另包一層;
 * 一格裡有兩個以上的子節點、或說明要跟著範例一起換行時,一律用 `ExampleGroup`(避免各頁各寫一種外框)。
 *
 * SSOT:`tokens/layoutSpace/layoutSpace.spec.md` 規則 3(元素間 gap 只看親疏)+「親疏 3 級」的 functional 交互定義
 * (:81「labeling(命名 / 描述 group identity)」):
 * - **說明 ↔ 它說的那個範例** = 跨範疇 + functional 交互(說明在替範例命名 / 描述)→ `--layout-space-tight`;
 * - **範例組 ↔ 下一個範例組** = 跨範疇 + parallel → `--layout-space-loose`。
 *
 * 為什麼有這支:2026-10-01 掃除把 Rule 教學框的子節點間距一律改成 loose 之後,`↑ 說明` 離它說的範例 16px(lg 24px)、
 * 離下一則範例也是 16px —— 說明浮在兩則範例正中間,讀者分不出它屬於誰(Gestalt proximity)。同一個關係當時在全 DS 有四種值
 * (tight / 拆兩層 / 手刻 tight 外框 / 4–8px micro),各頁各寫一份就會再漂。這裡把它定一次:
 * - `<ExampleGroup>`:一則範例 + 它的說明(說明在上或在下都一樣;一則反例接一則正解的「❌ → ↑ 改用 X → 正解」鏈也是一組)= 組內 tight。
 * - `<CaptionedExamples>`:Rule 教學框的範例區。直接子節點裡的說明(`caption` 指定的元件,各頁的 `Label`)自動跟它前面那一段範例
 *   併成一組(前面沒有範例時跟後面那一則併成一組 —— 標題式的說明);組與組之間 loose。一段裡有好幾則範例時,範例之間照樣 loose。
 *
 * 不收的:同一列裡「✅/❌ 符號 + 樣本 + 一兩個字」的行內群、token 表列裡「色塊 / 圖示 + 名稱」的儲存格(行內 item 的 micro 幾何,
 * layoutSpace.spec.md:166);卡片 / 列裡「標題 ↔ 說明」同一個文字塊(item-anatomy.spec.md「Label ↔ Desc 間距」的
 * `--item-gap-label-desc-*`);只有說明、沒有範例的 Rule(一串並列的 ✅ / ❌ 敘述,彼此照樣 loose)。
 */

type Layout = 'column' | 'wrap'

/** 範例區容器:column = 範例上下堆疊;wrap = 範例橫排、放不下換行(縮圖 / 卡片類範例)。兩者範例之間都是 loose。 */
const containerClass = (layout: Layout, naturalWidth: boolean) =>
  layout === 'wrap'
    ? 'flex flex-wrap items-start gap-[var(--layout-space-loose)]'
    : cn('flex flex-col gap-[var(--layout-space-loose)]', naturalWidth && 'items-start')

export interface ExampleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 子節點維持自然寬度(不被拉滿);置中的樣本格用 `center`。 */
  align?: 'stretch' | 'start' | 'center'
}

/** 一則範例 + 它的說明:組內 `--layout-space-tight`。 */
export function ExampleGroup({ align = 'stretch', className, ...rest }: ExampleGroupProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[var(--layout-space-tight)]',
        align === 'start' && 'items-start',
        align === 'center' && 'items-center',
        className,
      )}
      {...rest}
    />
  )
}

export interface CaptionedExamplesProps {
  /** 說明元件(各頁的 `Label`):它的實例會被併進前面那一段範例。 */
  caption: React.ElementType
  layout?: Layout
  /** column 版面時範例維持自然寬度(icon 鈕、膠囊類範例不被 flex-col 拉滿);wrap 版面一律自然寬度。 */
  naturalWidth?: boolean
  className?: string
  children: React.ReactNode
}

/** Rule 教學框的範例區:說明自動與它說的範例併組(tight),組與組之間 loose。 */
export function CaptionedExamples({ caption, layout = 'column', naturalWidth = false, className, children }: CaptionedExamplesProps) {
  const isCaption = (node: React.ReactNode) => React.isValidElement(node) && node.type === caption
  const groups: React.ReactNode[][] = []
  let current: React.ReactNode[] = []
  let currentHasExample = false
  let currentEndsWithCaption = false
  for (const node of React.Children.toArray(children)) {
    if (isCaption(node)) {
      current.push(node)
      currentEndsWithCaption = currentHasExample
      continue
    }
    // 一則範例:前一組已經「範例 + 說明」收尾 → 開新組;否則(組是空的、只有標題式說明、或還是範例)併進同一組
    if (currentEndsWithCaption) {
      groups.push(current)
      current = []
      currentEndsWithCaption = false
      currentHasExample = false
    }
    current.push(node)
    currentHasExample = true
  }
  if (current.length) groups.push(current)

  const startAligned = layout === 'wrap' || naturalWidth
  const render = (group: React.ReactNode[], key: number) => {
    const examples = group.filter((n) => !isCaption(n))
    const captions = group.filter(isCaption)
    // 沒有說明的範例、或沒有範例的說明:照原樣放進範例區(彼此 loose),不多包一層
    if (examples.length === 0 || captions.length === 0) return group
    // 一段裡有好幾則範例:範例之間照範例區的版面(loose),整段再與說明 tight
    const lead: React.ReactNode[] = []
    const trail: React.ReactNode[] = []
    let seenExample = false
    for (const n of group) {
      if (isCaption(n)) (seenExample ? trail : lead).push(n)
      else seenExample = true
    }
    const body = examples.length === 1 ? examples[0] : <div className={containerClass(layout, naturalWidth)}>{examples}</div>
    return (
      <ExampleGroup key={`captioned-${key}`} align={startAligned ? 'start' : 'stretch'}>
        {lead}
        {body}
        {trail}
      </ExampleGroup>
    )
  }
  return <div className={cn(containerClass(layout, naturalWidth), className)}>{groups.flatMap((g, i) => render(g, i))}</div>
}
