---
id: repository-trunk-based
title: Trunk-based repository preset
summary: Small, short-lived branches integrate frequently into a protected trunk.
kind: repository
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [git, trunk-based, small-batches, protected-main]
---
# Rule

Use trunk-based development. Work in short-lived branches, integrate small changes frequently,
and keep the default branch releasable. Long-lived feature branches are a smell; use feature
flags or incremental delivery instead.

# Checks

- Branches are short-lived and scoped to one reviewable change.
- The default branch remains protected and releasable.
- Integration happens before the branch diverges significantly.
- Feature flags have an owner and a removal date.
- Merge style is consistent with the project’s release policy.

# Evidence

Record branch names, integration commits, and the release decision in the prompt and closure
artifacts.
