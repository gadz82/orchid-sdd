---
id: code-style
title: Automated code style and quality gates
summary: The project linter, formatter, type checker, and static analysis are the source of truth.
kind: code_style
authority: blocking
phases: [discovery, assessment, build, code_review, logic_review]
tags: [style, lint, formatting, sonarqube, static-analysis]
---
# Rule

Code style is enforced by tools, not by reviewers arguing about taste. The project must declare
its linter, formatter, type checker, and static-analysis commands in the repository or in
`execution.test_commands`. Changed code must pass those gates before it can be considered done.

The exact tool is project-specific: ESLint, TSLint (legacy), Prettier, SonarQube, golangci-lint,
Ruff, Checkstyle, or an equivalent. This rule governs the evidence, not the vendor.

# Checks

- The repository declares at least one style or static-analysis gate.
- The gate runs on the changed files, not only on an unchanged baseline.
- New suppressions, disables, or `NOSONAR` markers have a reason and an owner.
- Formatting is automated; reviewers do not request manual whitespace changes.
- The change does not weaken an existing rule to make the build pass.
- A green test suite does not substitute for a failing style gate.

# Evidence

- Discovery: record the commands, baseline, and any existing violations that affect scope.
- Assessment: state whether the change introduces a new rule, suppression, or migration.
- Build: attach the exact command and result to the prompt report.
- Code review: confirm the gate passed and inspect new suppressions.
- Logic review: confirm the evidence is current for the integration branch.

# Exceptions

Changing a lint rule is a reviewed change. It requires an ADR when it affects the whole
repository or weakens a blocking gate. A local suppression is not an exception; it is a
finding with a reason and an owner.
