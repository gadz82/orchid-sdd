---
id: repository-gitflow
title: Git-flow repository preset
summary: Feature, develop, release, and hotfix branches have explicit merge rules.
kind: repository
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [git, gitflow, release, hotfix]
---
# Rule

Use Git-flow. Feature branches merge into `develop`; releases are stabilized on a release
branch; hotfixes branch from the production tag or main branch and are merged back. The exact
branch names must be declared in the repository policy.

# Checks

- Every branch name identifies its type (feature, release, hotfix).
- Release branches contain only stabilization changes.
- Hotfixes are merged back to all affected long-lived branches.
- Version tags and release notes correspond to the shipped revision.
- No unreviewed direct push to a protected branch.

# Evidence

Record the branch graph, merge target, tag, and release notes in the prompt and closure
artifacts.
