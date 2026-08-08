---
name: Don't suggest deleting scaffolding I created
description: Never suggest deleting files/structures that were created as quality gates or process scaffolding — integrate them better instead
type: feedback
---

Don't suggest deleting files that I previously generated as quality scaffolding (checklists, process docs, validation scripts). If they seem disconnected, the fix is to integrate them into the workflow (e.g., merge into CLAUDE.md so they're always read), not to remove them.

**Why:** User called out that I suggested deleting COMPONENT_CHECKLIST.md — a file I created to ensure component quality — simply because it looked like a standalone file. The purpose was valid; the placement was wrong.

**How to apply:** When encountering a file that looks redundant or unused, first check if it was created as part of a deliberate process. If so, propose integration (move content into CLAUDE.md, link from hooks, etc.) rather than deletion.
