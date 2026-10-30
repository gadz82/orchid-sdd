---
id: architecture-hexagonal
title: Hexagonal architecture preset
summary: Domain and application at the centre; ports and adapters at every edge.
kind: architecture
authority: blocking
phases: [discovery, assessment, planning, build, code_review, logic_review]
tags: [architecture, hexagonal, ports, adapters]
examples:
  - path: ../examples/typescript/hexagonal-port.ts
    title: "Port and adapter boundary"
    language: typescript
---
# Rule

Use **ports and adapters** as the project’s architecture vocabulary. The domain contains
business rules and domain types. Application services orchestrate use cases. Ports are owned by
the inside and describe required or provided behaviour. Adapters implement ports for HTTP,
CLI, persistence, messaging, and third-party services.

The number of layers is not the goal. The goal is that every dependency crossing an edge is an
explicit, replaceable contract and that the domain remains testable without a framework.

# Checks

- Each use case has a clear input and output contract.
- Persistence and transport types do not leak into the domain.
- Adapters are replaceable in tests without starting a real server or database.
- A new dependency is introduced at an adapter, not inside the domain.
- Ports are named after behaviour, not technology.

# Evidence

Cite the port, adapter, and use-case path in `assessment/steering.md`, the prompt constraints,
and `reviews/steering.md`.
