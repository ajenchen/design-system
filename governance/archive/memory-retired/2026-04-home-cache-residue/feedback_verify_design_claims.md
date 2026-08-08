---
name: Verify design token claims before suggesting changes
description: Don't suggest token renames or abstractions without verifying the actual CSS values and real-world design behavior first
type: feedback
---

Before suggesting token renames or abstraction changes, verify the actual computed values and think through real-world visual behavior in both light and dark modes.

**Why:** I suggested renaming `--tooltip` to `--surface-inverted`, implying tooltip should flip to white in dark mode. But world-class tooltips stay dark in both themes. The current implementation (oklch 0.18 light / 0.19 dark) was already correct — I didn't check the actual values before proposing a change.

**How to apply:** When reviewing tokens, always: (1) read the actual CSS values in primitives.css, (2) consider the visual result in both themes, (3) reference how top-tier products handle the same pattern (Apple, Linear, GitHub, etc.) before suggesting changes.
