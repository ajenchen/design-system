// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// v3 canonical(2026-05-01):≥ 2 stories(UsageGuidance + CompositionRules)對齊
// Polaris/Material/Ant 共識,取代原 escape rationale。
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Internal/Notice/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 規則的內容是一段文字 / 清單(不是範例區),不給 caption
const TutorialRule = createTutorialRule()

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 Notice 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li>
              <StoryLink kind="Design System/Internal/Notice/展示" name="部署成功 橫幅">CI/CD 部署成功橫幅 — 附「查看部署紀錄」動作</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/Notice/展示" name="工作區付款失敗">工作區付款失敗 — 附「更新付款方式」補救動作</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/Notice/展示" name="行內通知變體對照">方案限制 / 空間不足 / 連線失敗等行內提示(五種語意變體)</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/Notice/展示" name="Toast 樣式">「變更已儲存」「已複製連結」Toast 短暫提示</StoryLink>
            </li>
            <li>
              <StoryLink kind="Design System/Internal/Notice/展示" name="中性 純文字">成員邀請待加入提醒 — 中性純文字</StoryLink>
            </li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <div className="max-w-prose">
          <p>Notice 是 internal primitive,自身有 dismiss 按鈕 + <code>onDismiss</code> callback,但不管 dismiss 後的 mount / unmount 生命週期,也無 auto-dismiss 計時——需要這些行為改用以下 consumer:</p>
          <TutorialList>
            <li><strong>需要 dismiss 後移除(永久 inline)</strong> → 用 <code>Alert</code>(內部消費 Notice + live region:error/warning role="alert"、其餘 role="status")。Alert 是 controlled-only:提供 <code>onDismiss</code> callback,consumer 在 callback 中更新狀態並自行 unmount,Alert 不會自行移除</li>
            <li><strong>需要 auto-dismiss(短暫 toast)</strong> → 用 <code>Toast</code></li>
            <li><strong>表單欄位錯誤訊息</strong> → 用 <code>Field</code> 內建 errorText,不用 Notice</li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="siblings">
        <div className="max-w-prose">
          <p>三者關係:Notice 是 primitive,Alert / Toast 是 consumer:</p>
          <TutorialList>
            <li><strong>Notice(本元件)</strong> — internal primitive,提供 announcement row 結構 + variant token</li>
            <li><strong>Alert</strong> — 永久 inline announcement(stays until dismissed)</li>
            <li><strong>Toast</strong> — 短暫 announcement(auto-dismiss)</li>
          </TutorialList>
          <p className="text-fg-muted">建新 announcement 類元件 → 消費 Notice 不要 hand-craft row(對齊 主檔消費準則)。</p>
        </div>
      </UsageSection>
    </TutorialPage>
  ),
}

// ── CompositionRules — Notice 兩個 consumer pattern(對齊 Material Banner/Snackbar / Polaris Banner)──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    <TutorialPage>
      <TutorialRule title="Pattern 1 — Alert(persistent inline announcement)">
        <div className="max-w-prose">
          <p>需要「持續顯示直到 user 主動 dismiss」→ <StoryLink kind="Design System/Components/Alert/展示" name="單行（低調 vs 實心對照）">Alert 低調單行</StoryLink>。Alert 內部消費 Notice + 加上 dismiss button + live region ARIA(error/warning → role="alert" assertive;info/success/neutral → role="status" polite)。</p>
          <TutorialList>
            <li>典型場景:付款失敗 banner / workspace 警告 / 重要通知 user 必看</li>
            <li>對齊世界級:Polaris <code>Banner</code> / Material <code>Banner</code> / Atlassian <code>InlineMessage</code> — 共識用「persistent + dismissible」</li>
          </TutorialList>
        </div>
      </TutorialRule>

      <TutorialRule title="Pattern 2 — Toast(auto-dismiss floating announcement)">
        <div className="max-w-prose">
          <p>需要「短暫提示,使用者不需 acknowledge」→ <StoryLink kind="Design System/Components/Toast/展示" name="有標題與描述">有 Title + Description</StoryLink>。Toast 基於 Sonner + 消費 Notice layout,自動 4 秒消失(可調)。</p>
          <TutorialList>
            <li>典型場景:儲存成功 / 複製到剪貼簿 / 非關鍵操作回饋</li>
            <li>對齊世界級:Material <code>Snackbar</code> / Polaris <code>Toast</code> / Sonner — 共識用「auto-dismiss + 浮動 + 不阻塞 task」</li>
          </TutorialList>
        </div>
      </TutorialRule>

      <TutorialRule title="禁止 — 自刻 announcement row">
        <div className="max-w-prose">
          <p>建新 announcement 類元件(例如 InAppNotification banner)→ 必消費 Notice primitive,不可自刻 <code>&lt;div className="flex p-3 bg-..."&gt;</code>(對齊 M1 主檔消費準則 / 確保 icon 選擇 + variant token 一致)。</p>
        </div>
      </TutorialRule>
    </TutorialPage>
  ),
}
