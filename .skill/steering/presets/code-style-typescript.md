---
id: code-style-typescript
title: TypeScript style preset
summary: Type-safe boundaries, no implicit any, and formatter/linter evidence.
kind: code_style
authority: blocking
phases: [assessment, build, code_review, logic_review]
tags: [typescript, eslint, prettier, types]
---
# Rule

TypeScript code must pass the project’s formatter, linter, and type checker. Prefer explicit
domain types at public boundaries. Do not use `any` to bypass a design problem; use `unknown`
plus validation or a named type. Keep framework decorators and transport DTOs out of the domain.

# Checks

- `tsc --noEmit` or the project equivalent passes.
- The configured formatter and linter pass on changed files.
- New `any`, non-null assertions, and suppressions have a reason and an owner.
- Public functions have explicit input/output types where inference is not obvious.
- Runtime validation exists at untrusted boundaries.

# Evidence

Attach the exact commands and results to the prompt report and the logic-review checklist.
