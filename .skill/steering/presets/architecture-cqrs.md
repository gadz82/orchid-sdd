---
id: architecture-cqrs
title: CQRS preset
summary: Separate command and query responsibilities where their models genuinely differ.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, cqrs, commands, queries, read-models]
---
# Rule

Use CQRS only when commands and queries need different models, scaling, or consistency
guarantees. A command changes state and returns an acknowledgement or identifier; a query reads
a projection and must not mutate domain state.

CQRS is not a requirement for every application. A single model is preferable when read and
write needs are aligned.

# Checks

- Commands validate intent and enforce invariants in one write boundary.
- Queries do not trigger lazy writes, side effects, or hidden state changes.
- Read models state their source, freshness, and rebuild strategy.
- Eventual consistency is visible to users and covered by tests.
- Command and query DTOs are separate where they genuinely differ.
- Failure and retry semantics are explicit.

# Evidence

Record why a split is needed, the read-model freshness expectation, and the consistency window
in assessment and review artifacts.
