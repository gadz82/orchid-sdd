---
id: code-style
title: Automated code style and quality gates
summary: The project linter, formatter, type checker, static analysis, and comment contract are the source of truth.
kind: code_style
authority: blocking
phases: [discovery, assessment, build, code_review, logic_review]
tags: [style, lint, formatting, static-analysis, comments, memory, cross-language]
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

# Comments and memory

Source comments carry only the context that must stay beside the code. Durable history stays in memory.

- An inline comment is optional. When present, it must explain *why* the code exists, why this
  choice is safe, or which non-obvious invariant it protects. It must not restate *what* the code
  already says.
- Keep a behaviour comment short and under the project limit (default 500 characters). Omit it
  when the code is self-evident.
- Do not use comments for changelogs, dates, authors, prompt or agent IDs, copied history,
  commented-out code, or review notes. Those belong in the docblock and manifest.
- A significant unit gets exactly one anchor:
  `ORCHID-MEM: <uuidv7> — <short behaviour description>`. The anchor is the **only**
  memory/history reference in code.
- The linked UUID docblock carries `Behavior`, `Why`, `Invariants`, `Failure modes`, `History`,
  and `Tests`. `History` names the relevant ADR, specification, requirement, or scenario.
- Generated code must never invent or copy a UUID. Mint one with `orchid-sdd new-uuid`, record
  the `CodeUnit`, write the matching docblock, and run `orchid-sdd lint`.
- Tests and private one-liners do not get anchors; tests are traced by their test IDs.

# Checks

- The repository declares at least one style or static-analysis gate for each active language.
- The gate runs on the changed files, not only on an unchanged baseline.
- New suppressions, disables, `nolint` markers, or `NOSONAR` markers have a reason and an owner.
- Formatting is automated; reviewers do not request manual whitespace changes.
- The change does not weaken an existing rule to make the build pass.
- A green test suite does not substitute for a failing style gate.
- The rule does not assume a specific language, framework, package manager, or tool vendor.
- Every generated comment explains why or an invariant, not what the code does.
- Significant units have one anchor with a non-empty behaviour description and a linked docblock.
- Inline comments contain no history log, and the docblock `History` references resolve.

# Evidence

- Discovery: record the commands, baseline, existing comment debt, and any violations that affect scope.
- Assessment: state whether the change introduces a new anchor, docblock, suppression, or migration.
- Build: attach the exact command, result, anchor, and docblock path to the prompt report.
- Code review: confirm the gate passed, comments stay minimal, and new suppressions are justified.
- Logic review: confirm docblock history and delivered behaviour still agree.

# Exceptions

Changing a lint rule is a reviewed change. It requires an ADR when it affects the whole
repository or weakens a blocking gate. A local suppression is not an exception; it is a
finding with a reason and an owner. Missing history is never an exception: record it in the
docblock and manifest before claiming the prompt is done.
