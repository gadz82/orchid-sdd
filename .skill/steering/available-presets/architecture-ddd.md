---
id: architecture-ddd
title: Domain-driven design preset
summary: Model bounded contexts, aggregates, and ubiquitous language explicitly.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, ddd, aggregates, bounded-contexts]
---
# Rule

Use domain-driven design when the complexity is in the business model, not in the framework.
Define bounded contexts, a ubiquitous language, aggregates with invariants, domain events, and
repositories as domain-owned contracts.

Do not create a repository or aggregate for every table. Start from the business invariant and
the consistency boundary, then choose the model.

# Checks

- Each bounded context has a clear owner and language.
- Aggregate boundaries protect invariants and define one consistency boundary.
- Domain types do not depend on ORM rows, transport DTOs, or framework annotations.
- Domain events describe business facts and have an owner.
- Repositories expose domain concepts, not arbitrary query builders.
- Cross-context communication uses contracts or events, not shared mutable tables.

# Evidence

Record context boundaries, aggregate invariants, and cross-context contracts in assessment and
review artifacts.
