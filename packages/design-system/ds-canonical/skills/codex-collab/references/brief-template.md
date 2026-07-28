# Independent peer brief template

Use this template unchanged for both primary and peer contexts. Do not shorten it for transport convenience.

```markdown
# Independent review brief — <topic>

## User request (verbatim)
<preserve wording, punctuation, attachments, and links>

## Frozen review target
- repository / immutable snapshot: <identity>
- base and head: <identity>
- complete inventory: <machine-generated list or digest>
- constraints and authorized actions: <exact scope>

## Canonical material
- governing instructions: <paths + digests>
- rubric: <paths + digests>
- primary evidence: <paths, lines, command artifacts, or URLs>

## Questions
1. What conclusion follows from the evidence, independently of the primary analysis?
2. Which material counterexample or alternative was missed?
3. Which existing canonical owner should govern each proposed change?

## Required response
- provider, model, context, and transport identity
- inventory and rubric digests received
- claim / evidence / reasoning table
- complete coverage ledger, including zero-finding areas
- disagreements and uncertainty
- explicit PASS, findings, or REVIEW-BLOCKED

## Restrictions
- discussion and review only; do not mutate the workspace or external systems
- do not sample or silently omit inventory
- do not infer missing evidence
- challenge the primary hypothesis rather than voting for it
```

Reject a reply if its inventory or rubric digest differs, any required section is absent, or identity/isolation cannot be proved.
