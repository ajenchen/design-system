---
name: World-class quality and consistency
description: Always deliver world-class answers — never make a change then later suggest undoing it; think through decisions before proposing them
type: feedback
---

User expects world-class quality in every answer. Do not propose structural changes (splitting files, renaming tokens, reorganizing) without first thinking through whether the change is genuinely necessary and sustainable. If I made a decision in a prior conversation, I must either stand by it or have a strong, articulated reason for reversing it — not casually suggest undoing my own work.

**Why:** I split CLAUDE.md into two files, then in the next conversation suggested merging them back. I renamed a token then realized the rename was wrong. These are signs of not thinking deeply enough before proposing changes.

**How to apply:** Before suggesting any structural/architectural change: (1) ask "is this the world-class way to do it?", (2) consider how top-tier products and design systems handle it, (3) think about whether I'll want to undo this later. If unsure, state the tradeoffs and let the user decide rather than making a half-baked recommendation.
