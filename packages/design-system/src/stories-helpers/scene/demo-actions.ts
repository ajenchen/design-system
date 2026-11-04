import { fn } from '@storybook/test'

/**
 * 範例裡「跳到別頁」的連結:讀者點了不會真的離開 Storybook,改成在 Storybook「Actions」面板記一筆要去哪
 * (`fn().mockName()` 的呼叫由 addon-actions 自動記錄)。用 Storybook action 這個做法是 **AI 推導**:稽核 M102 那句
 * 「展示層可以接 Storybook action」講的是 ProfileCard 的預設動作鈕(見 person-card.tsx `demoPersonActions`),這裡比照用在連結上,
 * 不是 M102 自己的範圍(同 tokens 家族 TK-l016-link 的更正)。
 * 2026-10-28 前這些連結寫 `onClick={(e) => e.preventDefault()}` —— 點了沒有任何反應(登記簿 A16「一堆按鈕都無法正常反應」)。
 */
export function demoNavigate(destination: string) {
  const log = fn().mockName(`前往 ${destination}`)
  return (event: { preventDefault: () => void }) => {
    event.preventDefault()
    log()
  }
}
