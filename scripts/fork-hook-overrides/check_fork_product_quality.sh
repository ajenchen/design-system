#!/bin/bash
# check_fork_product_quality.sh — REPLACE for check_substantive_edit_approval_preflight.sh (fork-mode)
#
# WHY REPLACE: 原 approval-gate 在 fork hard-block(exit 2)所有 apps/** 產品 edit → 鎖死 fork
# 使用者(連寫產品 code 都不行)。fork 使用者「寫產品」是正常開發,不該被 DS-author 的「設計
# 改動需 approval」儀式擋住。本 hook 改成 quality-POSITIVE soft inject:exit 0、永不 brick,只在
# 編輯產品 code 時提醒「先消費 DS 元件 + 讀 DS spec」。真正的品質 enforcement 由其他 fork-mode
# 治理 hook(primitive-misuse / layout-space / opacity-token / ds-anchor)負責,不靠 approval 閘。
#
# 對齊 C-prime 共識:world-class 產出靠「SSOT/anchor/primitive 機械檢查 fire」保證,
# 不靠「把一般 edit 擋在 approval 關鍵字後面」。

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
case "${TOOL:-}" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
# 只在 fork 產品 code 提示;DS 內部 / node_modules / 非 product 不管
echo "$FILE" | grep -qE '(^|/)apps/.+\.(tsx|ts|css)$' || exit 0
echo "$FILE" | grep -qE 'node_modules/|packages/design-system/' && exit 0

MESSAGE=$(cat << 'EOF'
💡 DS 產品開發提示(soft,不阻擋):你正在編輯產品 code(apps/**)。
   為確保世界級且一致的產出,改動前請:
   - 優先消費既有 DS 元件(import from "@qijenchen/design-system"),勿手刻 raw HTML / 重造已有元件
   - 組裝某元件前,先讀它的 spec/story:node_modules/@qijenchen/design-system/src/**/<name>.spec.md
   - 用 design token(間距/色值/字級/圓角/陰影),勿硬寫
   (其餘 fork 治理 hook 會機械把關 primitive 誤用 / 硬寫間距 / opacity token 等)
EOF
)
jq -nc --arg message "$MESSAGE" '{
  governanceContext: {
    hookEventName: "PreToolUse",
    message: $message
  }
}'
exit 0
