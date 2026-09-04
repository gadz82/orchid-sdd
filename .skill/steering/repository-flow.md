---
id: repository-flow
title: Repository and change flow
summary: Every change follows a declared branch, review, merge, and release flow.
kind: repository
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [git, branching, trunk-based, gitflow, release, review]
---
# Rule

The project must declare one repository workflow and use it consistently:

- **Trunk-based:** short-lived branches, small changes, frequent integration, protected trunk.
- **Git-flow:** feature branches, develop/release/hotfix separation, explicit release branches.
- **XP mainline:** direct integration to main is allowed only for small, tested, reversible
  changes with the configured review or pairing evidence.

If no repository preset is active, orchid-sdd's default build flow uses an integration branch and
does not merge to the default branch during build. If `repository-trunk-based`,
`repository-gitflow`, or `repository-xp-mainline` is active, that preset is authoritative for
the concrete branch flow; this core rule checks that the declared workflow and the actual
commands agree. A project selecting XP mainline must also update its execution and release
configuration and record the decision in an ADR.

# Checks

- The default branch is named and protected by policy.
- The branch owner and merge target are clear before work starts.
- Changes are small enough to review and reverse.
- Commit messages identify the requirement or prompt when the project uses traceability.
- Direct pushes to the default branch are either explicitly allowed by the selected preset or
  blocked.
- If a repository preset is active, no core or project rule contradicts its branch flow.
- Merge, squash, rebase, and release decisions are recorded, not improvised.
- Hotfix exceptions have an owner and a follow-up.

# Evidence

- Discovery: record the workflow and any repository constraints in `discovery/steering.md`.
- Assessment: note branch/release impact and rollback strategy.
- Build: branch names, commits, and merge target are visible in the prompt report.
- Code review: review the integration diff, not the implementer’s local branch.
- Logic review: confirm the delivered change is on the expected branch and no stray merge or
  release action occurred.

# Exceptions

An exception to the branch or review flow requires an ADR or a recorded risk acceptance. A
direct push to main is never implicit. If the selected workflow permits it, the evidence must
still show tests and review.
