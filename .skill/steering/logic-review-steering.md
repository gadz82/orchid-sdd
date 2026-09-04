---
id: logic-review-steering
title: Apply steering during logic review
summary: Verify every active steering rule against the integrated behaviour before G6.
kind: process
authority: blocking
phases: [logic_review]
tags: [logic-review, compliance, evidence, gate]
---
# Rule

Logic review is the last semantic check before closure. The PM must verify the delivered
behaviour against every active steering rule, not only the PRD and Gherkin. A rule is satisfied
only when the review names the evidence; the absence of a finding is not evidence.

Style and architecture checks may be delegated to the specialists who reviewed the build, but
the PM owns the final statement that the evidence exists and is current for the integration
branch. A blocking rule with no evidence stops G6.

# Checks

- Read `steering context --phase logic_review` and every referenced rule file.
- For each rule, record: `satisfied`, `not applicable`, `finding`, or `waived`.
- Cite file paths, symbols, test/lint commands, ADR IDs, and commit or diff references.
- Confirm style gates ran on the integrated change, not only on a local branch.
- Confirm architecture dependencies still point inward and no new boundary was crossed.
- Confirm the repository flow was followed and no unreviewed direct merge occurred.
- Confirm the delivered code still matches the approved examples or that a deviation is recorded.
- Convert each open finding into a follow-up prompt or a waived risk with an ADR.
- Write `reviews/steering-review.md`; use it as G6 evidence.

# Suggested logic-review rules

- **Rule coverage:** every active blocking rule has a verdict and evidence.
- **Evidence freshness:** the evidence belongs to the integration branch or release candidate.
- **Scope integrity:** no rule was satisfied by deleting a test, weakening a gate, or hiding a
  suppression.
- **Exception integrity:** every waiver names the rule, reason, owner, blast radius, and expiry.
- **Behavioural fit:** the implementation still explains the requirement in business terms.

# Gate

Do not pass G6 while a blocking steering rule is `finding` or has no verdict. Advisory rules
may be reported with a recommendation, but a pattern of ignored advisory findings belongs in
the follow-up iteration.
