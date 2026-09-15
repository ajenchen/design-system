/**
 * 預設就開著的模態浮層 story,在 Storybook Autodocs 頁必須各自進 iframe。
 *
 * 為什麼(2026-09-09 user:「你有發現嗎」):Autodocs 把同一檔的所有 story 渲染在**同一份文件**裡;
 * Dialog / Sheet / FileViewer 這類 `position: fixed` + Portal 到 body 的模態浮層,只要有 N 個 story
 * 是 `defaultOpen` / `open` 初始 true,docs 頁就會同時疊 N 個遮罩 + N 個對話框(Dialog docs 實測 4 個)。
 * M15 又要求 stakeholder flow 必須有「開著」的快照 story 給視覺稽核截圖,不能把 defaultOpen 拿掉。
 *
 * 機制 = Storybook 官方的 `parameters.docs.story.inline: false`(每個 story 在 docs 內改用 iframe 渲染,
 * `height` 是 iframe 的實際高度;<https://storybook.js.org/docs/api/doc-blocks/doc-block-story>「inline / height」)。
 * 只動 docs 的渲染方式:canvas(`viewMode=story`)完全不變,截圖 / a11y / 互動閘照跑。
 * 代價:該 story 在 docs 頁的 Controls 不會即時更新(官方文件明列),對 defaultOpen 快照類 story 無關緊要。
 *
 * 用法:`parameters: { docs: { story: openOverlayDocsStory('560px') } }`
 * 閘:`scripts/dialog-coexistence-invariant.mjs`「docs 隔離」段(靜態掃 stories + 瀏覽器量 docs 頁 `[role=dialog]` 可見數)。
 * 規則:`ds-canonical/rules/story-rules.md`「預設開啟的模態浮層 story」。
 */
export function openOverlayDocsStory(height = '560px') {
  return { inline: false as const, height }
}

/**
 * 完整 `parameters`:`layout: 'padded'` + docs 隔離。
 *
 * meta 是 `layout: 'centered'` 的檔案必用這個:Storybook 8.6 的 Canvas block 取 layout 的順序是
 * `props.layout ?? parameters.layout ?? parameters.docs.canvas.layout ?? 'padded'`
 * (`node_modules/@storybook/blocks/dist/index.mjs`),docs 專用的 `docs.canvas.layout` 蓋不過 meta 的 `layout`;
 * 而 centered 的 docs 畫布是 flex 置中、寬度縮到內容,iframe 的內建寬度 300px 就成了整個 story 的寬度
 * (2026-09-09 實測:對話框被擠到 204px)。padded 的畫布是 block,iframe 才撐滿。
 * 對 canvas 的影響只有觸發鈕從置中變成左上(對話框本來就是 fixed 置中,不受 layout 影響)。
 */
export function openOverlayParameters(height = '560px') {
  return { layout: 'padded' as const, docs: { story: openOverlayDocsStory(height) } }
}
