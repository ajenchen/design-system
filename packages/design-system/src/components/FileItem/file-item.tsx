// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Paperclip, CircleCheck, XCircle, Download, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { ProgressBar } from '@/design-system/components/ProgressBar/progress-bar'
import { ItemContent, ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { STACK_GAP_PX } from '@/design-system/tokens/uiSize/stack-gap'

/**
 * FileItem — 檔案顯示 / 上傳進度
 *
 * Typography: 兩 mode 統一 scanning — text-body (14px) + leading-compact (1.3)(詳 spec「Typography」段,2026-04-23)
 *
 * 兩種 mode（精簡 vs 完整內容呈現）:
 *
 * compact（★ default）: Paperclip 16px 在左。右側 content + bar。
 *   padding 詳 spec「Padding」表(form: px-3 py-2;surface=upload-manager: 列自帶左右 loose、上下 tight/2,
 *   面板 body 左右 0 —— 2026-09-25 待辦總帳 B12,可點的列滑過底色鋪到面板邊)。
 *   description 只有 error 才顯示。
 *   bar 跟文字左邊對齊（在 icon 右邊的 column 內）。
 *
 * rich: Avatar 48px square 在左（顯示檔案內容縮圖）。右側 content + bar。
 *   多行 description（size / status message）。
 *   有 bar → justify-between（bar 底部對齊 avatar）
 *   無 bar → justify-center（文字垂直置中對齊 avatar）
 *
 * status 可選。不傳 = 已上傳檔案（無 bar，可點擊下載）。
 * onClick → cursor-pointer + 滑過底色(只有點了會有反應的才加,依平常底色配對;詳 spec「滑過」段,待辦總帳 B12)。
 */

const STATUS_ICON = {
  completed: { icon: CircleCheck, color: 'text-success' },
  error: { icon: XCircle, color: 'text-error' },
} as const

// ProgressBar status 映射:uploading=inProgress(藍) / completed=success(綠) / error=error(紅)
// 與 ProgressBar 元件的 status prop 對齊,不需再維護 PROGRESS_COLOR 本地 map。
const PROGRESS_STATUS_MAP = {
  uploading: 'inProgress',
  completed: 'success',
  error: 'error',
} as const

const AVATAR_SIZE = 48
const ICON_PX = 16

export interface FileItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  name: string
  /**
   * 兩種呈現 mode（精簡 vs 完整）：
   * - `compact`（預設）：paperclip + filename 單行 inline
   * - `rich`：縮圖 + 檔名 + size + status + progress 的完整 card 呈現
   */
  mode?: 'compact' | 'rich'
  /**
   * 清單所在的 surface context（2026-06-03 codify rich-borderless）：
   * - `form`（預設）：rich = border card（自立輪廓，Slack/Notion/Linear attachment 慣例）
   * - `upload-manager`：rich = **無邊框**（Google Drive/Dropbox 上傳管理面板 —— 面板自身已是容器，
   *   card border 多餘 = 雙層容器）；avatar 作每筆 item 視覺邊界。compact 的進度條/灰底不受 surface 影響
   *   （由 status 決定）。
   * surface-driven（非 status-driven）：避免 form 內 rich 上傳中變無邊框、存好變 card 的邊框閃爍。
   * 列間 gap 由 List wrapper canonical 決定(form rich 8px / form compact 4px / upload-manager 0 —— 列自帶上下 tight/2,
   * 列間 ink 距仍 12,2026-09-25 待辦總帳 B12;見 spec)。
   */
  surface?: 'form' | 'upload-manager'
  status?: 'uploading' | 'completed' | 'error'
  progress?: number
  /** rich mode: 檔案大小、狀態訊息。compact: 只有 error 才顯示。 ReactNode 支援 inline clickable link(如「View log」)。 */
  description?: React.ReactNode
  thumbnailSrc?: string
  actions?: React.ReactNode
  onClick?: () => void
  /** 整列 primary action 的 accessible name；預設 `開啟 {name}`。 */
  actionAriaLabel?: string
  /**
   * Hover 動作(passive 狀態 icon 變互動 button 的 UX):
   * - `onDownload`:有值時,`status="completed"` 的綠 ✓ icon 在 row hover 時
   *   換成 Download ↓ button;click 觸發 onDownload。無值保持 passive 綠 ✓。
   * - `onRetry`:有值時,`status="error"` 的紅 ✗ icon 在 row hover 時換成 RotateCw ⟲
   *   button;click 觸發 onRetry。無值保持 passive 紅 ✗。
   *
   * 世界級對照:Gmail / Slack / Dropbox 附件的 passive 狀態 → hover 變 action
   * 的 UX,使用者知道檔案狀態且能立即行動。
   */
  onDownload?: () => void
  onRetry?: () => void
}

// ── compact 進度條的左右位置(單一來源)──
// 進度條本身(下方 compact 分支)與焦點框的挖空(fileItemRingCutoutStyle)都從這裡取,內距一改兩者一起動
// (2026-06-03 圖五 bug:bar 的 left / right 寫死、內距一改就對不齊)。
//   form:左右 12px(= px-3)。upload-manager(2026-09-25 待辦總帳 B12):左右 loose(= 原本面板給的值,文字 x 不變)。
//   left = 內距 + icon + gap-2(0.5rem)→ 對齊 label 首字;right = 內距 → 收在列內緣。
function compactBarInset(surface: FileItemProps['surface']) {
  const padX = surface === 'upload-manager' ? 'var(--layout-space-loose)' : '12px'
  return { padX, left: `calc(${padX} + ${ICON_PX}px + 0.5rem)`, right: padX }
}

/**
 * 焦點框在進度條兩端留的縫(px)= DS 通用的「疊在一起的兩樣東西」之間的縫(`tokens/uiSize/stack-gap.ts`,
 * 全域外描邊的 outline-offset、頭像堆疊的縫、步驟條外圈的縫都是同一個 token)。
 */
const BAR_RING_GAP_PX = STACK_GAP_PX

/**
 * @internal
 * 焦點框的「框圖層」:與列同形同大的 `::before`(file-item.spec.md「焦點框 × 貼著列底的進度條」)。
 * 只在**列底貼著進度條**時用 —— form 的 compact 列有 status 時。upload-manager 的進度條離列底 tight/2、
 * rich 的進度條在內容區,都碰不到框,照舊把框畫在列上。
 * 為什麼要另一層:進度條住在列裡。框若畫在列上,列是進度條的祖先,遮罩會連進度條一起挖掉;
 * 畫在 `::before` 上,遮罩只挖框。層疊不變:`::before` 是第一個定位子層,進度條(absolute)仍畫在它上面;
 * 而且洞裡根本沒有框,進度條與框誰畫在上面都不影響結果(CSS UI 4 把 outline 的疊放順序留給瀏覽器自己決定,
 * 「The stacking of the rendering of these outlines is explicitly left up to implementations」)。
 * 這裡只有位置與遮罩,**不含觸發條件**:FileItem 自己的列由整列隱形鈕觸發、FileUpload 的清單列由列自己的
 * `:focus-visible` 觸發,各自在使用端寫。線寬、顏色、往內 2px、圓角全部照舊來自 `focus-ring-inset`
 * (`ds-canonical/references/focus-canonical.md`「框怎麼畫」),不是第四種幾何。
 */
export const FILE_ITEM_RING_LAYER_CLASS =
  'before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none before:[mask:var(--file-item-ring-cutout)]'

/**
 * @internal
 * 框圖層的遮罩(`--file-item-ring-cutout`)。列底沒有貼著進度條時回 `undefined` —— 呼叫端據此照舊把框畫在列上。
 * 遮罩 = 三塊保留區的聯集:上半部整條 + 左段 + 右段。挖掉的是「進度條那一段(兩端各多 BAR_RING_GAP_PX)的下半部」,
 * 框在那個範圍裡只有底邊,所以挖掉的只有底邊那一段。露出來的是**真正在後面的東西**(列自己的滑過色、卡片、面板、頁面),
 * 不需要知道底色是什麼(與 `avatar.tsx` 頭像堆疊「挖空,不是外圈」同一個理由:深色的 `--surface` 本身半透明,
 * 墊任何固定底色都會在某種容器上錯色)。
 */
export function fileItemRingCutoutStyle({
  mode = 'compact',
  surface = 'form',
  status,
}: Pick<FileItemProps, 'mode' | 'surface' | 'status'>): React.CSSProperties | undefined {
  if (mode !== 'compact' || surface === 'upload-manager' || !status) return undefined
  const { left, right } = compactBarInset(surface)
  const keep = 'linear-gradient(#000 0 0)' // 遮罩只看不透明度;顏色無意義
  return {
    ['--file-item-ring-cutout' as string]:
      `${keep} top / 100% 50% no-repeat, ` +
      `${keep} left / calc(${left} - ${BAR_RING_GAP_PX}px) 100% no-repeat, ` +
      `${keep} right / calc(${right} - ${BAR_RING_GAP_PX}px) 100% no-repeat`,
  }
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const FileItem = React.forwardRef<HTMLDivElement, FileItemProps>(
  (
    {
      name,
      mode = 'compact',
      surface = 'form',
      status,
      progress = 0,
      description,
      thumbnailSrc,
      actions,
      onClick,
      actionAriaLabel = `開啟 ${name}`,
      onDownload,
      onRetry,
      className,
      ...props
    },
    ref,
  ) => {
    const isRich = mode === 'rich'
    const hasStatus = !!status
    const statusConfig = status && status !== 'uploading' ? STATUS_ICON[status] : null
    const progressWidth = status === 'completed' ? 100 : progress

    // compact 只有 error 才顯示 description
    const showDesc = isRich ? !!description : (status === 'error' && !!description)

    // 滑過底色(2026-09-25 待辦總帳 B12;取代 2026-04-23「FileItem 永不顯示 hover-bg」)。
    // user 原話:「要點了會有反應的才加，並確保加上去之後不會有任何視覺奇怪的地方，且按鈕的互動樣式也是自然疊加上去吧？用再亮一層這樣的措辭是否不夠精準？」
    // → 只有傳了 onClick 的列 / 卡才有滑過底色;沒傳就沒有(✓→下載鈕的換位照舊,那顆鈕有自己的滑過色)。
    // 換上什麼色依「平常底色」配對(tokens/color/color.spec.md「Hover 換色配對總則」),直接寫在下方各 mode 的 cn() 裡、
    // 跟靜止底同一次呼叫 —— scripts/hover-own-pair-invariant.mjs 才看得到這一對:
    //   rich + form 卡片 bg-surface(「底」)→ 底不換,疊一層 bg-interaction-hover
    //   compact 小膠囊 bg-secondary → 換成自己的下一階 bg-secondary-hover
    //   透明的列(compact 有進度條、upload-manager 的列)→ 換成 bg-neutral-hover
    // 不加按住(active:)那一階:FileItem「列按下深一階」是待辦總帳 N4 / F 模型 D3(2),尚未提問(AI 推導:不先替 user 決定)。
    // 列內按鈕(刪除、✓→下載)滑過時換上自己的 neutral-hover(半透明),自然疊在列的滑過色上,不寫特例
    // (color.spec.md「巢狀滑過」段)。
    const isUploadManager = surface === 'upload-manager'

    // 消費 ProgressBar 元件(SSOT);不再自 roll bar。
    // compact mode 用 2px(極密集 row layout),rich mode 用預設 4px。這是 FileItem
    // 私有 composition 細節；ProgressBar 公開 API 維持單一 4px、沒有 height/size 軸。
    // a11y(2026-04-25 axe aria-progressbar-name):aria-label 用 file name 作 context。
    const progressBar = hasStatus ? (
      <ProgressBar
        value={progressWidth}
        status={PROGRESS_STATUS_MAP[status!]}
        className={isRich ? undefined : '!h-0.5'}
        aria-label={`${name} 上傳進度`}
      />
    ) : null

    // suffix 對齊 label 第一行(item-anatomy「24px 閾值對齊規則」小 suffix canonical):
    // icons 16 ≤ 24 屬小 suffix,統一 h-[1lh] inline(由 ItemSuffix primitive 提供),
    // 不因 desc wrap 改公式。兩 mode 同公式,跟 item-anatomy 一致。

    // Status slot 幾何(2026-04-23 user 統一):rich + compact 都用 `var(--field-height-xs)`(24)
    // 容器,裡面 Button xs iconOnly variant="text"(auto data-unbounded)。
    // Compact 不影響 row 高度 = suffix wrapper 的 data-unbounded CSS 讓 Button layout
    // 收斂到 1lh(同 compact row 內容高),視覺與命中區仍 24(命中 ≡ 可視,見
    // ds-canonical/references/hit-area-canonical.md;2026-09-24 把原文的「touch target」正名為命中區)。
    const slotHw = 'var(--field-height-xs)'

    const hoverAction =
      status === 'completed' && onDownload ? { icon: Download, onClick: onDownload, label: `下載 ${name}` } :
      status === 'error' && onRetry        ? { icon: RotateCw, onClick: onRetry,    label: `重試 ${name}` } :
      null

    const statusSlot = statusConfig ? (
      <span
        data-unbounded="true"
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: slotHw, height: slotHw }}
      >
        {/* Passive 狀態 icon:預設可見;若有 hover-swap,row-hover 時瞬間隱藏、換上操作鈕(不淡出;
            tokens/motion/motion.spec.md「hover 回饋不做過渡」,2026-09-26 延伸到滑過才出現的按鈕,待辦總帳 L9 / N4(3)) */}
        <statusConfig.icon
          size={ICON_PX}
          className={cn(
            'shrink-0',
            statusConfig.color,
            // 2026-07-05 D4:鍵盤 focus 同步觸發 swap(:has(:focus-visible),對齊 item-anatomy SUFFIX_HOVER_REVEAL_BY_GROUP SSOT)
            hoverAction && 'group-hover/row:opacity-0 group-has-[:focus-visible]/row:opacity-0',
          )}
          aria-hidden
        />
        {/* Active action:row-hover 時瞬間出現(不淡入,同上;rich + compact 同 Button xs 統一) */}
        {hoverAction && (
          <Button
            variant="text"
            size="xs"
            iconOnly
            startIcon={hoverAction.icon}
            aria-label={hoverAction.label}
            onClick={(e) => { e.stopPropagation(); hoverAction.onClick() }}
            className="absolute inset-0 opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100"
          />
        )}
      </span>
    ) : null

    // 2026-07-16 dim 39/DA3:消費 ItemSuffix primitive(照 Notice 2026-06-15 已遷模式)。
    // ItemSuffix base geometry(h-[1lh] shrink-0 ml-auto flex items-center gap-2)= 原手刻
    // div 的 flex items-center gap-2 shrink-0 h-[1lh];多出的 ml-auto 為 no-op(左鄰
    // ItemContent 是 flex-1,已把 suffix 推到右緣)→ 像素相等。hoverReveal 預設 false,
    // 不干擾本檔自有的 statusSlot hover-swap 機制(group-hover/row 系)。
    const suffix = (
      <ItemSuffix
        className={cn(
          // data-unbounded chrome-canonical trick:let Button xs (24) live inside h-[1lh]
          // wrapper(compact ~18.2 / rich ~18.2 scanning)without pushing row height。
          // 視覺/hit area 仍 24,layout footprint 收斂到 1lh。同 overlay-surface
          // 的 SurfaceHeader dismiss canonical(2026-04-22 v5)。
          // **child selector `[&>[data-unbounded]]`(非 descendant)**:只針對 suffix
          // wrapper **直接子元素**(statusSlot span、actions Button)套 margin,
          // 避免 status slot 內部 hover-swap Button(nested)也套造成 layout 跳動。
          '[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]',
        )}
      >
        {status === 'uploading' && isRich && (
          <span className="text-fg-secondary tabular-nums">{progress}%</span>
        )}
        {statusSlot}
        {/* **動作鈕不搶整列 click,由元件自己吃掉,不要求 consumer 每次記得**(2026-09-24)。
            Canonical 早就寫了:`patterns/element-anatomy/item-anatomy.spec.md`「suffix 可以塞什麼」表的 Inline Action 列
            「明確點擊靶子 ≤ 24px,`stopPropagation` 避免搶 row click」。
            但先前只有 FileItem **自家**的 hover-swap 鈕做到(本檔 statusSlot 裡 `hoverAction` 那顆 Button 的 `stopPropagation`),consumer 從 `actions`
            傳進來的鈕沒有任何人做 —— 於是「點刪除 → 整列 onClick 也跟著跑 → 檔案被開起來」
            在我們自己的示範裡活到今天(實測:`已上傳` 這則點刪除鈕,FileViewer 就開)。
            同一列同時有整列 onClick 和 trailing action 時,這是**必然**會犯的錯,所以答案不是
            在文件裡要 consumer 記得,而是元件內部把邊界劃好(同 `agent-panel.tsx` 選項卡裡「其他(自由輸入)」輸入框的
            `stopPropagation` / `data-table.tsx` 選取欄 `cellEl` 裡 Checkbox 與 RadioGroupItem 的 `stopPropagation`)。
            **只包 `actions`、不包整個 suffix**:suffix 裡的 `{progress}%` 與被動狀態圖示是唯讀
            metadata,item-anatomy「suffix 可以塞什麼」表明寫唯讀 metadata「不搶 row click target」
            = 點它仍該開整列,所以那兩個不進這層。
            `data-unbounded` 掛在**這一層**:上面那條 `[&>[data-unbounded]]` 只認 ItemSuffix 的
            **直接**子元素;包一層之後負 margin 的承接者換成本層,否則 24 高的鈕會把 compact 列撐高。
            實測 compact / rich / upload-manager 三則的列高、suffix 高、鈕的座標與尺寸改前改後逐項相同。 */}
        {actions && (
          <span
            data-unbounded="true"
            className="inline-flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </span>
        )}
      </ItemSuffix>
    )

    // content row — 消費 ItemContent primitive(封裝 label + desc + mt-gap token SSOT)。
    // 兩 mode 共用:primitive 改 → 兩 mode 同步,不需 grep。
    // typography:scanning mode(2026-04-23 user 指示)—— label body(14/1.3) + desc caption(12/1.3);
    // row 本身加 `leading-compact` 配合 scanning idiom(同 MenuItem row)。
    const contentRow = (
      <div className="flex items-start gap-2">
        <ItemContent
          label={name}
          description={showDesc ? description : undefined}
          mode="scanning"
          descriptionTone={status === 'error' ? 'error' : 'secondary'}
        />
        {suffix}
      </div>
    )

    // a11y nested-interactive contract:row 含 hover-swap / trailing action buttons，故 row
    // 本身不可設 role=button + tabIndex。Primary keyboard path 由下方 sibling native button
    // 承接；mouse 仍由 row onClick 承接，兩者皆呼叫同一 callback。
    const rowA11y = {}

    // Compact 靜態背景(AR20):無 status(= 無進度條)→ `bg-secondary`(= neutral-3)作「檔案已上傳 /
    // 靜態列表」視覺區隔,跟「上傳中(有 progress bar)」對照;寫在下方 compact 的 cn() 裡(`!hasStatus &&`),
    // 跟它的滑過配對同一次呼叫(見上方「滑過底色」段)。
    // **為什麼用 semantic 的 bg-secondary、不直接寫 neutral 第 3 階的 primitive 名**:primitive token
    // `--color-neutral-3` 沒經 `@theme inline` 橋接,拿它當 utility 會 silent 失效;`bg-secondary` 是 semantic
    // token 橋接的 utility(見 `tokens/color/semantic.css`@theme inline),底色同樣指向 `--color-neutral-3`。
    // 對齊 Badge low / ProgressBar track SSOT。
    // Primary row action 與 trailing actions 是 sibling controls，不把整列設成 role=button，
    // 因此不會形成 nested-interactive。透明 full-row button 只接 keyboard/focus；pointer
    // 仍由既有 row onClick 接手，保持 hit area 與 consumer callback contract 不變。
    const keyboardPrimaryAction = onClick ? (
      <button
        type="button"
        aria-label={actionAriaLabel}
        // 整列焦點框的唯一觸發者(見上方兩處 has-[[data-row-focus-target]:focus-visible])。
        // 它自己不畫框(opacity-0),指示器畫在列上 —— focus-canonical 認可的「指示器畫在別的元素上」。
        data-row-focus-target=""
        className="absolute inset-0 opacity-0 pointer-events-none"
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      />
    ) : null

    // ── rich(含縮圖完整呈現)——AR17 canonical:surface=form 加邊框 card / surface=upload-manager 無邊框 ──
    // Rich surface=form 是「檔案 card」風格,外框讓每個 row 視覺上是獨立 card(Slack / Notion /
    // Linear attachment 慣例);surface=upload-manager 無邊框,avatar 作 item 邊界(面板自身是容器,
    // 見 file-item.spec.md「邊框 / 背景」表)
    if (isRich) {
      return (
        <div
          ref={ref}
          className={cn(
            // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
            'group/row relative flex items-start gap-2 w-full text-body leading-compact',
            // 2026-09-07 H1g:限定只接下面那顆隱形整列鈕(keyboardPrimaryAction)。
            // 原本裸寫 `has-[:focus-visible]` 不分對象,trailing action 的 <Button> 被聚焦時整列也跟著畫 →
            // 一次互動兩個焦點框,違反 focus-canonical「一個項目只有一個指示器」。當時 <Button> 自帶
            // ring;2026-09-16 a7b2be94 起它不再自帶焦點 class、改吃全域外描邊,但限定的理由不變。
            // 幾何(2026-09-24 user 拍板「可以照你建議內描邊」):**內描邊**。原本寫的 `ring-2 ring-ring`
            // 是 2026-09-07 就退役的第二套機制,只因閘的舊 regex 只認裸寫的 `focus-visible:ring-2`、
            // 不認這裡的 `has-[…:focus-visible]:` 括號變體才活到今天(該洞同日已補,見
            // scripts/focus-geometry-invariant.mjs R2)。
            // **理由是結構性的**:拿到焦點的是下面那顆 `opacity-0` 的隱形整列鈕,它自己畫不出框,
            // 指示器改畫在列上 —— 這是 focus-canonical「刻意不畫的唯一合法理由是指示器畫在別的元素上,
            // 而且必須指得出承擔者」認可的形狀,承擔者就是本行所在的這個列 div。全域外描邊只作用在
            // 「被聚焦的那個元素」身上,套不到非焦點的列;能掛在列上的只有 focus-ring-inset 與填色專用的
            // focus-ring-inset-emphasis,列不是主色填色 → focus-ring-inset。
            // **不是**靠四周淨空不足,也**不是**引用 item-anatomy「選中 × 互動疊加」表那句「列撐滿容器寬度,
            // 左右沒有 2px 可以往外長」(那格的消費者清單沒有 FileItem):表單的列有圓角、列間 4–12px;
            // 上傳管理器的列 2026-09-25 起鋪滿面板寬、列間 0(B12)—— 兩種幾何都用內描邊,理由只有上面那條結構性的
            // (2026-09-24 審查抓到舊句把「淨空」當理由,勿寫回)。
            // 也**不是**因為捲動容器會裁切 —— 捲動與否明文不進判準。
            'has-[[data-row-focus-target]:focus-visible]:focus-ring-inset',
            // surface=form → border card(自立輪廓);surface=upload-manager → 無邊框(box 自身是容器,
            // avatar 作 item 邊界)。2026-06-03 codify rich-borderless(原僅 spec 旁註,consumer 自己移除)。form 保留 px-3 py-3 卡片內距。
            surface === 'upload-manager'
              // 上傳管理器的列(2026-09-25 待辦總帳 B12,推翻 2026-06-03「左右拿掉交給容器」):可點的列滑過底色要鋪到
              // 面板左右邊,所以左右 gutter 改由列自己帶、面板 body 給 0(判準 = overlay-surface.spec.md「誰負責左右 gutter」);
              // 值 = 原本面板給的 loose → 縮圖與文字的 x 不變。上下各 tight/2、面板 body 上下也給 tight/2、列間 0 ——
              // 邊緣→縮圖、縮圖→縮圖仍是 tight,滑過底色上下各留 tight/2、不貼縮圖。
              // 不加圓角:列鋪滿面板寬,圓角碰到面板的直邊會缺角(同 MenuItem 滿版列;AI 推導)。
              ? 'px-[var(--layout-space-loose)] py-[calc(var(--layout-space-tight)/2)]'
              : 'px-3 py-3 border border-divider rounded-md bg-surface',
            onClick && 'cursor-pointer',
            // 滑過(B12,見上方「滑過底色」段):上傳列平常透明 → 換成 neutral-hover;表單卡片平常是「底」bg-surface → 疊一層
            onClick && (surface === 'upload-manager' ? 'hover:bg-neutral-hover' : 'hover:bg-interaction-hover'),
            className,
          )}
          onClick={onClick}
          {...rowA11y}
          {...props}
        >
          {keyboardPrimaryAction}
          <Avatar src={thumbnailSrc} alt={name} size={AVATAR_SIZE} shape="square" className="shrink-0" />
          {/* Rich layout invariant(2026-04-23 user 校準):
              - content col minHeight = AVATAR_SIZE(48),確保 1-line desc 時內容 ≥ avatar 高
              - `justify-between`(有 bar)/`justify-center`(無 bar):
                * 1-line desc:label 頂 + progress bar 底 **自動對齊 avatar 頂/底**
                * 無 bar:content 垂直 center 對齊 avatar 中
              - `gap-2`:desc ↔ progress bar **至少 8px gap**(multi-line desc 時 bar 溢出仍保 8px)
              - row `items-start`:avatar top-align 作視覺引導(tight-stack box 內 item 邊界) */}
          <div
            className={cn(
              'flex flex-col flex-1 min-w-0 gap-2',
              progressBar ? 'justify-between' : 'justify-center',
            )}
            style={{ minHeight: AVATAR_SIZE }}
          >
            {contentRow}
            {progressBar}
          </div>
        </div>
      )
    }

    // ── compact: bar absolute 底部 ──
    // 內距單一來源(SSOT):progress bar 是 absolute 定位,其 left / right / bottom 必須跟列的內距「同源」——
    // 左右取自 compactBarInset(與焦點框的挖空共用,見檔案上方),上下見下:
    //   form:上下 py-2,bar 貼列底。
    //   upload-manager(2026-09-25 待辦總帳 B12,推翻 2026-06-03 的「左右 0、交給面板」):可點的列滑過底色要鋪到面板
    //     左右邊,所以左右改由列自己帶 loose(= 原本面板給的值,文字 x 不變)、面板 body 給 0。
    //     上 tight/2、下 tight/2 + 0.5rem(0.5rem = 原 py-2 下緣那 8:文字↔bar 6 + bar 2),bar 離列底 tight/2;
    //     面板 body 上下也給 tight/2、列間 0 → 邊緣→文字、bar→下一列文字、bar→邊緣仍全是 tight(與 06-03 同值),
    //     滑過底色則上下各留 tight/2,bar 不貼底色邊。
    const { padX: compactPadX, left: compactBarLeft, right: compactBarRight } = compactBarInset(surface)
    const compactBarBottom = isUploadManager ? 'calc(var(--layout-space-tight) / 2)' : '0px'
    const compactPadBlock = isUploadManager
      ? { paddingTop: 'calc(var(--layout-space-tight) / 2)', paddingBottom: 'calc(var(--layout-space-tight) / 2 + 0.5rem)' }
      : undefined
    // 列底貼著進度條(form + 有 status)→ 框改畫在框圖層、進度條那段挖空;否則 undefined,框照舊畫在列上(見下方 className)
    const ringCutout = fileItemRingCutoutStyle({ mode, surface, status })
    return (
      <div
        ref={ref}
        className={cn(
          // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
          'group/row relative flex items-start gap-2 w-full text-body leading-compact',
          // form 的列是圓角膠囊 / 圓角列;upload-manager 的列鋪滿面板寬 → 不加圓角(同 rich,AI 推導),上下內距見上方 compactPadBlock
          !isUploadManager && 'py-2 rounded-md',
          !hasStatus && 'bg-secondary',
          // 2026-09-07 H1g:同 rich —— 只接隱形整列鈕,不接同樣會畫框的 trailing <Button>;
          // 幾何同 rich 的內描邊(結構性理由見上方那段)。
          // **列底貼著進度條時,框畫在框圖層 ::before**(2026-09-26,file-item.spec.md「焦點框 × 貼著列底的進度條」)。
          // 進度條是 absolute,本來就畫在框的**上面**,正好落在內描邊底邊那 2px 上 —— 但它沒有「蓋住」框:
          // 軌道 --secondary 是半透明,框的藍從軌道透出來;填色 --info 又與框 --ring 同為 blue-6,與框黏成一條
          // (實測聚焦時填色對軌道 1.10:1,平常 4.55:1;深色 1.17 / 4.04)。框圖層在進度條那一段(兩端各多 2px 縫)
          // 挖空,露出真正的底:聚焦時進度條與平常逐像素相同,進度條的頭尾與框之間各隔一道底色的縫。
          // upload-manager 的 bar 離列底 tight/2、碰不到框 → ringCutout 為 undefined,框照舊畫在列上。
          ringCutout
            ? [FILE_ITEM_RING_LAYER_CLASS, 'has-[[data-row-focus-target]:focus-visible]:before:focus-ring-inset']
            : 'has-[[data-row-focus-target]:focus-visible]:focus-ring-inset',
          onClick && 'cursor-pointer',
          // 滑過(B12,見上方「滑過底色」段):有進度條的列平常透明 → 換成 neutral-hover;
          // 靜態小膠囊平常是 bg-secondary → 換成它自己的下一階 secondary-hover(不借透明底的配對)
          onClick && (hasStatus ? 'hover:bg-neutral-hover' : 'hover:bg-secondary-hover'),
          className,
        )}
        style={{ paddingInline: compactPadX, ...compactPadBlock, ...ringCutout }}
        onClick={onClick}
        {...rowA11y}
        {...props}
      >
        {keyboardPrimaryAction}
        <ItemPrefix>
          <Paperclip size={ICON_PX} className="shrink-0 text-fg-muted" aria-hidden />
        </ItemPrefix>
        {/* Compact 共用 contentRow(via ItemContent primitive SSOT)—— 先前 inline
            hand-craft 導致 compact label↔desc gap 跟 rich 不同步。shared contentRow
            保證兩 mode 修 primitive 一處全同步。 */}
        <div className="flex flex-col flex-1 min-w-0">
          {contentRow}
        </div>

        {/* ProgressBar: absolute 底部。left / right 取自 compactBarInset(與焦點框的挖空同源),bottom 與列內距同源:
            left = padX + icon + gap-2(0.5rem)對齊 label 首字;right = padX 收在 row 內緣;
            bottom = form 0(貼列底,聚焦時框在這一段挖空,見上方 className)/ upload-manager tight/2(B12,見上方內距段)。 */}
        {progressBar && (
          <div
            className="absolute"
            style={{ left: compactBarLeft, right: compactBarRight, bottom: compactBarBottom }}
          >
            {progressBar}
          </div>
        )}
      </div>
    )
  },
)
FileItem.displayName = 'FileItem'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const fileItemMeta = {
  component: 'FileItem',
  family: 2,
  variants: {

  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    bg: ['bg-secondary', 'bg-surface'],
    fg: ['text-fg-muted', 'text-fg-secondary'],
    ring: ['focus-ring-inset'],
  },
} as const

export { FileItem }
