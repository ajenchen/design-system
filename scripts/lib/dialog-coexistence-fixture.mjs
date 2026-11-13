/**
 * Dialog 並存契約夾具的掛載(三支閘共用的唯一實作):dialog-coexistence / dialog-coexist-scroll-lock / layer-order E2。
 *
 * 為什麼不是 story:2026-09-11 user「Dialog的並存範例給我刪掉」(登記簿 A33,稽核 H02 指出上次只把它改成 test-only)。
 * 夾具原始碼 = scripts/test-fixtures/dialog-coexistence/fixture.tsx;每次跑閘都從原始碼重新打包(esbuild,瀏覽器 IIFE),
 * 所以量到的是**這次 checkout 的元件原始碼**。樣式取**正在服務的那一份** storybook 建置的 preview CSS(同 readServedStorybookIndex
 * 的理由:頁面與清單 / 樣式必須出自同一份建置),在暫存目錄的本機靜態站開(lib/a11y-static-server.mjs,不另寫伺服器)。
 * 打包失敗 / 找不到 CSS → 丟 FixtureInstrumentError,由閘照「儀器失效」印出(不是產品裁決、也不是通過)。
 *
 * 2026-11-13:打包 / 找 CSS / 起站那一段搬到 lib/storybook-css-fixture.mjs(第二支夾具 field-open-border 也要用,不各寫一份);
 * 本檔只剩「是哪一支夾具」。對外的名字與錯誤訊息不變。
 */
import { FIXTURE_PAGE, FixtureInstrumentError, previewCssOf as previewCssOfBuild, startStorybookCssFixture } from './storybook-css-fixture.mjs'

export const COEXIST_FIXTURE_SOURCE = 'scripts/test-fixtures/dialog-coexistence/fixture.tsx'
/** 夾具頁面的路徑(相對於夾具伺服器的根) */
export const COEXIST_FIXTURE_PAGE = FIXTURE_PAGE
const LABEL = '並存夾具'

export { FixtureInstrumentError }

/** 找出建置裡 Storybook 預覽的全域 CSS(Tailwind + DS token;沒有 url() 相依)—— 正好一份,否則儀器失效 */
export function previewCssOf(staticRoot) {
  return previewCssOfBuild(staticRoot, LABEL)
}

/**
 * 打包夾具、起本機靜態站。
 * @param {string} staticRoot 正在服務的 storybook 建置根目錄(閘的主伺服器的 servedRoot)
 * @returns {Promise<{ url: string, notFound: string[], stop: () => Promise<void> }>}
 */
export async function startDialogCoexistenceFixture(staticRoot) {
  return startStorybookCssFixture(staticRoot, { source: COEXIST_FIXTURE_SOURCE, label: LABEL, title: 'Dialog 並存夾具' })
}
