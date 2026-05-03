// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'

/**
 * Carousel — 圖片 / 內容水平(或垂直)輪播
 *
 * 實作基礎:shadcn `Carousel` 結構 + `embla-carousel-react` v8 engine + 本 DS token。
 *
 * ── 世界級對照 ──
 * shadcn Carousel(本元件主要參考)/ Ant Carousel / Polaris 無 /
 * Swiper(獨立 lib,功能更多但不在 DS 範疇)
 *
 * ── 視覺慣例(user 指示) ──
 * 預設「hover 上去」左右兩邊才出現 prev/next 按鈕,不打擾主視覺;
 * 指示器(dots)在底部中央,clickable。
 *
 * ── API(shadcn parity) ──
 * <Carousel opts plugins orientation>
 *   <CarouselContent>
 *     <CarouselItem>...</CarouselItem>
 *     <CarouselItem>...</CarouselItem>
 *   </CarouselContent>
 *   <CarouselPrevious />  ← 左箭頭
 *   <CarouselNext />       ← 右箭頭
 *   <CarouselDots />       ← 本 DS 擴充(shadcn 無,Ant/Swiper 慣例)
 * </Carousel>
 */

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

interface CarouselProps {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: 'horizontal' | 'vertical'
  setApi?: (api: CarouselApi) => void
}

interface CarouselContextProps extends CarouselProps {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  scrollTo: (i: number) => void
  canScrollPrev: boolean
  canScrollNext: boolean
  selectedIndex: number
  scrollSnaps: number[]
  orientation: 'horizontal' | 'vertical'
}

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const ctx = React.useContext(CarouselContext)
  if (!ctx) throw new Error('useCarousel 必須在 <Carousel> 內使用')
  return ctx
}

// ── Root ────────────────────────────────────────────────────────────────────

const Carousel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CarouselProps
>(
  (
    {
      orientation = 'horizontal',
      opts,
      setApi,
      plugins,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [carouselRef, api] = useEmblaCarousel(
      { ...opts, axis: orientation === 'horizontal' ? 'x' : 'y' },
      plugins,
    )
    const [canScrollPrev, setCanScrollPrev] = React.useState(false)
    const [canScrollNext, setCanScrollNext] = React.useState(false)
    const [selectedIndex, setSelectedIndex] = React.useState(0)
    const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([])

    const onSelect = React.useCallback((a: CarouselApi) => {
      if (!a) return
      setCanScrollPrev(a.canScrollPrev())
      setCanScrollNext(a.canScrollNext())
      setSelectedIndex(a.selectedScrollSnap())
    }, [])

    const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api])
    const scrollNext = React.useCallback(() => api?.scrollNext(), [api])
    const scrollTo = React.useCallback((i: number) => api?.scrollTo(i), [api])

    React.useEffect(() => {
      if (!api || !setApi) return
      setApi(api)
    }, [api, setApi])

    React.useEffect(() => {
      if (!api) return
      setScrollSnaps(api.scrollSnapList())
      onSelect(api)
      api.on('reInit', onSelect)
      api.on('select', onSelect)
      return () => {
        api?.off('select', onSelect)
        api?.off('reInit', onSelect) // D3 fix: previously leaked — stale closure on remount
      }
    }, [api, onSelect])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); scrollNext() }
    }

    const contextValue = React.useMemo(
      () => ({
        carouselRef,
        api,
        opts,
        orientation,
        scrollPrev,
        scrollNext,
        scrollTo,
        canScrollPrev,
        canScrollNext,
        selectedIndex,
        scrollSnaps,
      }),
      [
        carouselRef,
        api,
        opts,
        orientation,
        scrollPrev,
        scrollNext,
        scrollTo,
        canScrollPrev,
        canScrollNext,
        selectedIndex,
        scrollSnaps,
      ]
    )

    return (
      <CarouselContext.Provider value={contextValue}>
        <div
          ref={ref}
          onKeyDownCapture={handleKeyDown}
          className={cn('group/carousel relative', className)}
          role="region"
          aria-roledescription="carousel"
          {...props}
        >
          {children}
        </div>
      </CarouselContext.Provider>
    )
  },
)
Carousel.displayName = 'Carousel'

// ── Content / Item ──────────────────────────────────────────────────────────

const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { carouselRef, orientation } = useCarousel()
  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div
        ref={ref}
        className={cn(
          'flex',
          orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col',
          className,
        )}
        {...props}
      />
    </div>
  )
})
CarouselContent.displayName = 'CarouselContent'

const CarouselItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { orientation } = useCarousel()
  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      className={cn(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'pl-4' : 'pt-4',
        className,
      )}
      {...props}
    />
  )
})
CarouselItem.displayName = 'CarouselItem'

// ── Arrow buttons(hover 才顯示)────────────────────────────────────────────
// 使用 DS Button (secondary + iconOnly size md);hover-only 顯示由 wrapper 的
// opacity transition 控制(Button 本身不負責)。此 wrapper 存在僅為絕對定位 +
// hover/focus 可見性,不再覆寫 Button 的視覺 token。

type ArrowProps = {
  className?: string
  /** ARIA label. Override for i18n. Prev default: 「上一張」;Next default: 「下一張」 */
  'aria-label'?: string
}

const arrowWrapperClass = cn(
  'absolute z-10',
  'transition-opacity duration-200',
  'opacity-0 group-hover/carousel:opacity-100',
  'focus-within:opacity-100',
  '[&:has(button:disabled)]:opacity-0 [&:has(button:disabled)]:pointer-events-none',
)

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const CarouselPrevious = React.forwardRef<HTMLButtonElement, ArrowProps>(
  ({ className, 'aria-label': ariaLabel = '上一張' /* i18n-allow: DS default; consumer override via aria-label prop */ }, ref) => {
    const { orientation, scrollPrev, canScrollPrev } = useCarousel()
    return (
      <div
        className={cn(
          arrowWrapperClass,
          orientation === 'horizontal'
            ? 'left-3 top-1/2 -translate-y-1/2'
            : 'top-3 left-1/2 -translate-x-1/2 rotate-90',
          className,
        )}
      >
        <Button
          ref={ref}
          variant="tertiary"
          size="md"
          iconOnly
          startIcon={ChevronLeft}
          aria-label={ariaLabel}
          disabled={!canScrollPrev}
          onClick={scrollPrev}
          // documented exception:視覺取向的 media carousel 箭頭用 rounded-full 圓形,
          // 優於 DS default rounded-md。對齊 Instagram / Airbnb / Notion / Apple Photos
          // 世界級慣例 — media carousel 箭頭圓形減少視覺方塊感壓迫內容。spec「箭頭視覺規格」有明示。
          className="rounded-full"
        />
      </div>
    )
  },
)
CarouselPrevious.displayName = 'CarouselPrevious'

const CarouselNext = React.forwardRef<HTMLButtonElement, ArrowProps>(
  ({ className, 'aria-label': ariaLabel = '下一張' /* i18n-allow: DS default; consumer override via aria-label prop */ }, ref) => {
    const { orientation, scrollNext, canScrollNext } = useCarousel()
    return (
      <div
        className={cn(
          arrowWrapperClass,
          orientation === 'horizontal'
            ? 'right-3 top-1/2 -translate-y-1/2'
            : 'bottom-3 left-1/2 -translate-x-1/2 rotate-90',
          className,
        )}
      >
        <Button
          ref={ref}
          variant="tertiary"
          size="md"
          iconOnly
          startIcon={ChevronRight}
          aria-label={ariaLabel}
          disabled={!canScrollNext}
          onClick={scrollNext}
          // documented exception:同 Previous,媒體導向 carousel 箭頭圓形
          className="rounded-full"
        />
      </div>
    )
  },
)
CarouselNext.displayName = 'CarouselNext'

// ── Dots indicator(底部中央)───────────────────────────────────────────────

const CarouselDots = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { scrollSnaps, selectedIndex, scrollTo } = useCarousel()
  if (scrollSnaps.length <= 1) return null
  return (
    <div
      ref={ref}
      className={cn(
        'absolute bottom-3 left-1/2 -translate-x-1/2 z-10',
        'flex items-center gap-1.5',
        className,
      )}
      role="tablist"
      aria-label="carousel pagination"
      {...props}
    >
      {scrollSnaps.map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === selectedIndex}
          aria-label={`跳至第 ${i + 1} 張`}
          onClick={() => scrollTo(i)}
          className={cn(
            'h-1.5 rounded-full transition-all',
            // Dots 疊在 media(image/video)之上,不是 token color 底——用 --on-emphasis 保持語義
            // 跟其他「於飽和色底上的淺色前景」一致
            'bg-on-emphasis/60 hover:bg-on-emphasis/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            i === selectedIndex ? 'w-6 bg-on-emphasis' : 'w-1.5',
          )}
        />
      ))}
    </div>
  )
})
CarouselDots.displayName = 'CarouselDots'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const carouselMeta = {
  component: 'Carousel',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: [],
    ring: ['ring-ring'],
  },
} as const

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
  type CarouselApi,
}
