import * as React from 'react'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

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
      }
    }, [api, onSelect])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); scrollNext() }
    }

    return (
      <CarouselContext.Provider
        value={{
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
        }}
      >
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

type ArrowProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'>

const arrowBaseClass = cn(
  'absolute z-10 inline-flex items-center justify-center',
  'w-9 h-9 rounded-full',
  'bg-surface-raised text-foreground shadow-[var(--elevation-200)]',
  'border border-border',
  'transition-opacity duration-200',
  'opacity-0 group-hover/carousel:opacity-100',
  'hover:bg-neutral-hover',
  'disabled:opacity-0 disabled:pointer-events-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  // 鍵盤 focus 時強制顯示(焦點可見原則)
  'focus-visible:opacity-100',
)

const CarouselPrevious = React.forwardRef<HTMLButtonElement, ArrowProps>(
  ({ className, ...props }, ref) => {
    const { orientation, scrollPrev, canScrollPrev } = useCarousel()
    return (
      <button
        ref={ref}
        type="button"
        aria-label="上一張"
        disabled={!canScrollPrev}
        onClick={scrollPrev}
        className={cn(
          arrowBaseClass,
          orientation === 'horizontal'
            ? 'left-3 top-1/2 -translate-y-1/2'
            : 'top-3 left-1/2 -translate-x-1/2 rotate-90',
          className,
        )}
        {...props}
      >
        <ChevronLeft size={16} />
      </button>
    )
  },
)
CarouselPrevious.displayName = 'CarouselPrevious'

const CarouselNext = React.forwardRef<HTMLButtonElement, ArrowProps>(
  ({ className, ...props }, ref) => {
    const { orientation, scrollNext, canScrollNext } = useCarousel()
    return (
      <button
        ref={ref}
        type="button"
        aria-label="下一張"
        disabled={!canScrollNext}
        onClick={scrollNext}
        className={cn(
          arrowBaseClass,
          orientation === 'horizontal'
            ? 'right-3 top-1/2 -translate-y-1/2'
            : 'bottom-3 left-1/2 -translate-x-1/2 rotate-90',
          className,
        )}
        {...props}
      >
        <ChevronRight size={16} />
      </button>
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
            'bg-white/60 hover:bg-white/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            i === selectedIndex ? 'w-6 bg-white' : 'w-1.5',
          )}
        />
      ))}
    </div>
  )
})
CarouselDots.displayName = 'CarouselDots'

export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
  type CarouselApi,
}
