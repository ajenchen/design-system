/**
 * 黏住區的「已知不透明底」= 表格後面真正看得到的那個顏色(2026-11-06 verify 段;審查 D4 同族)。
 *
 * 單一捲動盒裡,中央的列從黏頂表頭與釘選面板**底下**捲過去,黏住盒必須不透明(data-table.css「黏住區的不透明底」)。
 * 底色若寫死 `--canvas`,表格放在任何不是 canvas 的底上就會跟周圍不同色 —— 深色主題下 `bg-surface` / `bg-muted`
 * 是半透明白,卡片 / 面板裡的表格表頭與釘選欄因此比表身暗一層(全 DS 像素比對:container-height 64 → 48、
 * ScrollArea 示範 16 階;修前表頭與釘選面板是透明的,天生跟容器同色)。
 *
 * 做法:從表格的父層往上,把每一個畫了底色的祖先依序收集,直到第一個不透明的為止,再由下往上在 1×1 canvas 上
 * 以 source-over 疊起來 —— 與瀏覽器合成 CSS 背景同一套規則 —— 讀回那一格的 sRGB,寫進根節點的 `--dt-sticky-base`。
 * 讀 computed `background-color` 是因為主題 token 多半是 oklch / color(srgb …),交給 canvas 解析,不自己換算色彩空間。
 * 往上走到頂都沒有不透明的底 → 回 null,沿用 CSS 預設(`--canvas`;浮起表面另由 `.bg-surface-raised` 指定)。
 *
 * 不處理:祖先的混合模式 / 背景圖(漸層、圖片)—— 這些情況回到 CSS 預設,consumer 可自己設 `--dt-sticky-base`。
 * 祖先的 `opacity` 不影響:它把表格連同背後那幾層一起淡化,群組內部的相對顏色不變。
 */

let canvas: HTMLCanvasElement | null = null
function context(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!canvas) { canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1 }
  return canvas.getContext('2d', { willReadFrequently: true })
}

function isTransparent(bg: string): boolean {
  return !bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)'
}

/** 某個 CSS 顏色字串畫在透明 canvas 上的 alpha(0–255);解析不了 = -1 */
function alphaOf(ctx: CanvasRenderingContext2D, color: string): number {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  return ctx.getImageData(0, 0, 1, 1).data[3]
}

/** 表格後面看得到的不透明底色(`rgb(r, g, b)`);判斷不了 = null */
export function resolveStickyBackdrop(table: HTMLElement): string | null {
  const ctx = context()
  if (!ctx || typeof getComputedStyle === 'undefined') return null
  const layers: string[] = []
  let opaque = false
  for (let n = table.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n)
    if ((s.backgroundImage && s.backgroundImage !== 'none') || (s.mixBlendMode && s.mixBlendMode !== 'normal')) return null
    const bg = s.backgroundColor
    if (isTransparent(bg)) continue
    const a = alphaOf(ctx, bg)
    if (a < 0) return null
    layers.push(bg)
    if (a === 255) { opaque = true; break }
  }
  if (!opaque) return null
  ctx.clearRect(0, 0, 1, 1)
  for (let i = layers.length - 1; i >= 0; i--) { ctx.fillStyle = layers[i]; ctx.fillRect(0, 0, 1, 1) }
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}
