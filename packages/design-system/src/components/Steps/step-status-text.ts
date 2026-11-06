import type { StepContentState } from './steps'

/**
 * 步驟狀態的讀屏文字 —— Steps 每一步 header 的 sr-only「第 N 步,共 M 步,{狀態}」與 TreeView 步驟導覽樹的步驟結果
 * (列的 `aria-describedby`)共用這一份。
 *
 * owner = Steps(`steps.spec.md`「A11y 預設」sr-only 狀態文字;對齊 Carbon ProgressIndicator `--assistive-text`);
 * TreeView 的「自己的結果」沿用同一組字(`../TreeView/tree-view.spec.md`「步驟結果」)。抽成一份是為了兩處永遠一致(M17),
 * 不是改值:2026-10-21 前 TreeView 檔內另抄了「已完成」「錯誤」兩個字,只靠一行註解說「與 Steps 同一組字」,沒有任何程式
 * 在守(r1b OTH-11)。結果圖示與顏色的同一種共用在 `../FileItem/file-item-status.ts`。
 * 不從 `index.ts` 出口(subpath / root 都拿不到),只供 DS 內部相對 import。
 */
// i18n-allow-block: DS default SR-only 文案(steps.tsx / tree-view.tsx 既有先例)
export const STEP_STATUS_TEXT: Record<StepContentState, string> = {
  completed: '已完成',
  current: '進行中',
  error: '錯誤',
  reachable: '未開始',
  upcoming: '未開始',
}
