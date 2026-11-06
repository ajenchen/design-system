import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { disclosureMotion, disclosureIndicatorMotion } from '@/design-system/tokens/motion/disclosure-motion'

/**
 * Accordion — Radix Accordion + 本 DS token
 *
 * 結構對齊 shadcn/ui accordion(Accordion / AccordionItem / AccordionTrigger /(來源:https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/accordion.tsx#L65)
 * AccordionContent),但視覺全改本 DS token。
 *
 * ── 視覺差異 vs shadcn 預設 ──
 * Shadcn 預設 hover 加底線(web 早期 link style),本 DS 改為文字色 tint
 * (`hover:text-fg-secondary`)——不借用文字連結的底線訊號(trigger 是就地展開、不是跳轉),
 * 但保留 hover 顏色變化作為可點擊提示(user 決策 2026-04-20)。
 * Chevron 用 Lucide + 本 DS icon size(16px),rotate 動畫 200ms。
 *
 * ── 使用情境 ──
 * FAQ / settings section 收合 / 多區塊表單分組 / 進階選項可隱藏。
 * 不用於「單純顯示 / 隱藏單一區塊」(那是 Collapsible,本 DS 尚未建立;用 details 或
 * 自組 toggle),Accordion 是「多個 item 可互斥或獨立收合」的 pattern。
 */

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b border-divider', className)}
    {...props}
  />
))
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  // asChild 不對外開放:Trigger 固定渲染 children + ChevronDown 兩個子節點,傳 asChild
  // 會讓 Radix Slot 觸發 React.Children.only runtime 錯(見 CLAUDE.md 失敗記憶索引
  // 「asChild 分支內部仍渲染多 children」)。固定 anatomy 見 accordion.spec.md「邊界狀態」。
  Omit<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>, 'asChild'>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between gap-2',
        'py-4 text-body font-medium text-foreground text-left',
        // hover 字色瞬間切換,不寫 transition-colors(tokens/motion/motion.spec.md「hover 回饋不做過渡」;2026-09-26 由底色延伸到字色,待辦總帳 L9 / N4(3))。
        // 下方箭頭的旋轉是展開狀態的動畫,不是 hover 觸發,保留(時長與曲線見箭頭本身)。
        'hover:text-fg-secondary',
        // 內描邊:trigger 撐滿標題列高,往外 +2px 實測會壓到下方的內容區(2026-09-07 量測)
        'focus-visible:focus-ring-inset',
        // AccordionTrigger 單一 text-style 列 → semantic `text-fg-disabled`(非 opacity);Button canonical 對齊
        // 停用:不再 pointer-events-none(原生 disabled 的 button 本來就不會發 click),留著接指標只為了掛禁止符號 ——
        // pointer-events-none 讓 cursor 由外層決定、永遠是箭頭(hit-area-canonical.md 滑過原則一-3「停用的用禁止符號」;
        // 2026-09-29 全站掃出:停用的手風琴標題游標是箭頭)。滑過的字色變化改由 disabled:hover 釘住。
        'disabled:text-fg-disabled disabled:cursor-not-allowed disabled:hover:text-fg-disabled',
        // 2026-05-31 M24:disabled 時 chevron(icon 載體)亦降 text-fg-disabled,不停留 text-fg-muted
        //（muted=neutral-7 比 disabled=neutral-6 深 → 層級顛倒)。覆寫 chevron 自身 text-fg-muted。
        'disabled:[&>svg]:text-fg-disabled',
        className,
      )}
      {...props}
    >
      {children}
      {/* 旋轉寫在箭頭本身(父層打開時轉 180°),時長與曲線跟內容的高度動畫同一份(disclosureIndicatorMotion;
          motion.spec.md「展開箭頭跟它打開的東西同步」)—— 會轉的元素自己帶過渡,閘 motion-ssot-invariant M6 才看得到它 */}
      <ChevronDown
        size={16}
        className={cn('shrink-0 text-fg-muted', disclosureIndicatorMotion, '[[data-state=open]>&]:rotate-180')}
        aria-hidden
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = 'AccordionTrigger'

/**
 * 內容打開而且高度動畫跑完了沒有(= 不再需要裁切)。
 * disclosureMotion 的 `overflow-hidden` 是高度動畫的前提(收合途中內容不能溢出),但打開、停下來之後它就只剩一個副作用:
 * 內容裡貼著左 / 上緣的按鈕、欄位,往外畫的焦點框被它裁掉(r1b 全 DS 掃描:「規則」頁「永久刪除工作區」左、上兩邊被裁;
 * 待辦總帳 R1b-DT3)。focus-canonical.md「正當障礙」問句:動畫跑完這層裁切消失,畫面不會壞 → 不是正當障礙,修外殼、框照樣往外。
 * 做法:只有「打開 + 沒有動畫在跑」時不裁(MUI Collapse 同款:entered 狀態 `overflow: 'visible'`,
 * https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Collapse/Collapse.js);
 * 一開始就打開(Radix 擋掉掛載動畫)、要求減少動態(沒有動畫)時一打開就不裁;收合時一律裁。
 */
function useOpenAndSettled(ref: React.RefObject<HTMLDivElement | null>) {
  const [settled, setSettled] = React.useState(false)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      if (el.getAttribute('data-state') !== 'open') { setSettled(false); return }
      // getAnimations 不存在的環境(舊瀏覽器 / 測試 DOM)當作沒有動畫在跑(同 overlay-coexistence.ts、tree-view.tsx 的守法)
      setSettled(typeof el.getAnimations !== 'function' || !el.getAnimations().some((a) => a.playState === 'running'))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(el, { attributes: true, attributeFilter: ['data-state'] })
    const onEnd = (e: AnimationEvent) => { if (e.target === el) update() }
    el.addEventListener('animationend', onEnd)
    el.addEventListener('animationcancel', onEnd)
    return () => {
      observer.disconnect()
      el.removeEventListener('animationend', onEnd)
      el.removeEventListener('animationcancel', onEnd)
    }
  }, [ref])
  return settled
}

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  // asChild 不對外開放:Content 固定以內層 <div className="pb-4"> 包住 children,傳 asChild
  // 只會讓 Slot clone 該內層 div,consumer 元素無法成為 Content host(等同無效 API)。
  Omit<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>, 'asChild'>
>(({ className, children, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLDivElement | null>(null)
  const settled = useOpenAndSettled(innerRef)
  return (
    <AccordionPrimitive.Content
      ref={(el) => {
        innerRef.current = el
        if (typeof forwardedRef === 'function') forwardedRef(el)
        else if (forwardedRef) forwardedRef.current = el
      }}
      data-disclosure-settled={settled ? '' : undefined}
      // 高度動畫 / 收尾 / 減少動態 = disclosureMotion(tokens/motion/disclosure-motion.ts;與 TreeView、AgentPanel 思考塊同一份 ——
      // Accordion.Content 內部就是 Collapsible.Content,同一節點也有 --radix-collapsible-content-height,共用 collapsible keyframe)。
      // 打開而且動畫跑完 → 不裁(useOpenAndSettled)
      className={cn(disclosureMotion, 'data-[disclosure-settled]:overflow-visible text-body text-fg-secondary')}
      {...props}
    >
      <div className={cn('pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
})
AccordionContent.displayName = 'AccordionContent'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const accordionMeta = {
  component: 'Accordion',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['focus-ring-inset'],
  },
} as const

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
