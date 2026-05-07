# Project — Cell Interactive Overlay primitive(D 路徑 future plan)索引

**Date planned**: 2026-05-07
**Status**: PLANNED(短期 A 已接受 1px diff;D 中期 plan)
**Trigger**: 「pixel-perfect / overlay primitive / cell-interactive layer / D 路徑」

完整 spec 在 `.claude/planning/cell-interactive-overlay.md`(on-disk 冗餘,對齊 `ds-devmode` / `story-auto-compile` 索引模式)。

## 1-line summary

新 `<CellInteractiveOverlay>` primitive(寬=cell.contentWidth,absolute pointer-events:none,hover/focus ring 全集中)解 P1 hover/focus 1px diff。實作走 codex-collab dual-track + joint test case planning(Claude+codex 兩邊獨立列 → 比稿 union)。

## 觸發條件

- User 提 trigger phrases → 啟動本 plan
- 或 future cell-level interaction(multi-cell range select / focus group / kbd nav highlight)場景順道 ship

## 跨 session loading

新 session 找 D plan → MEMORY.md index → 本 file → `.claude/planning/cell-interactive-overlay.md` 完整 spec。
