---
id: code-style
title: Automated code style and quality gates
summary: The project linter, formatter, type checker, and static analysis are the source of truth.
kind: code_style
authority: blocking
phases: [discovery, assessment, build, code_review, logic_review]
tags: [style, lint, formatting, static-analysis, cross-language]
---
# Rule

Code style is enforced by tools, not by reviewers arguing about taste. The project must declare
its linter, formatter, type checker, and static-analysis commands in the repository or in
`execution.test_commands`. Changed code must pass those gates before it can be considered done.

The exact tool is project-specific and language-specific. Examples include ESLint, Prettier,
and `tsc` for TypeScript; `gofmt`, `go vet`, and `golangci-lint` for Go; Ruff, Black, and mypy
for Python; PHP-CS-Fixer and PHPStan for PHP; rustfmt and clippy for Rust; Spotless,
Checkstyle, and Error Prone for Java; RuboCop and Sorbet for Ruby; and SonarQube for any
language it supports. This rule governs the evidence, not the vendor or language.

# Checks

- The repository declares at least one style or static-analysis gate for each active language.
- The gate runs on the changed files, not only on an unchanged baseline.
- New suppressions, disables, `nolint` markers, or `NOSONAR` markers have a reason and an owner.
- Formatting is automated; reviewers do not request manual whitespace changes.
- The change does not weaken an existing rule to make the build pass.
- A green test suite does not substitute for a failing style gate.
- The rule does not assume a specific language, framework, package manager, or tool vendor.

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
