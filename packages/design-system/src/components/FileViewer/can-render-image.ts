// 2026-07-06 D3 bundle fix:canRenderImage 從 image-renderer.tsx 拆出成獨立小 module。
// 理由:file-viewer.tsx 需要「同步」呼叫 canRenderImage(renderer registry canRender 判斷
// + Filmstrip thumb 分流),但 image-renderer.tsx 頂層 import react-zoom-pan-pinch(~12KB gz)——
// 靜態 import 會把整個 lib 拉進 consumer 首屏 bundle,即使 viewer 從未打開。
// 拆出後 file-viewer.tsx 靜態 import 本檔(純 util,零依賴),ImageRenderer 本體走 React.lazy
// 動態 import,react-zoom-pan-pinch 延後到 viewer 首次渲染 image 時才載入。

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])

/** 判斷檔案是否可用 ImageRenderer 渲染。 */
export function canRenderImage(file: { mimeType: string; name: string }): boolean {
  if (file.mimeType.startsWith('image/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext ? IMAGE_EXTS.has(ext) : false
}
