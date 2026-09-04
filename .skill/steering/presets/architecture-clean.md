---
id: architecture-clean
title: Clean architecture preset
summary: Use-case-centric layers with framework-independent entities and explicit boundaries.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, clean, use-cases, boundaries]
---
# Rule

Organize around **entities and use cases**. Entities hold enterprise rules; use cases
orchestrate application-specific behavior; interface adapters translate between use cases and
external formats; frameworks and drivers sit at the outer edge. Dependencies point toward the
entities and use cases.

A clean architecture is not permission to create four layers for a one-line change. Apply the
smallest boundary that removes the actual coupling and keep the use case readable.

# Checks

- Use cases are explicit and independently testable.
- Entities do not import frameworks, UI, databases, or transport code.
- Interface adapters own DTOs, presenters, and framework translation.
- Dependency inversion is used where the inner layer needs an outer capability.
- The change does not introduce parallel layers or duplicate contracts.

# Evidence

Record the use-case boundary, adapter, and test seam in assessment and review artifacts.
